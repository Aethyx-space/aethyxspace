import { describe, expect, it } from "vitest";
import { buildFunctionGrids, generateQrMatrix, qrMatrixToSvg } from "./qrcode";

/**
 * The QR encoder is hand-rolled (no npm dependency), so these tests walk the
 * encoding in reverse and assert the payload round-trips. That exercises data
 * placement, masking, format info, block interleaving and Reed-Solomon layout
 * together — a decoding failure in any one of them breaks the round trip.
 */

/** Reads the mask id back out of the format-information modules. */
function readMask(matrix: boolean[][]): number {
  const size = matrix.length;
  let bits = 0;
  for (let i = 0; i < 15; i++) {
    let bit: boolean;
    if (i < 6) bit = matrix[i][8];
    else if (i === 6) bit = matrix[7][8];
    else if (i === 7) bit = matrix[8][8];
    else if (i === 8) bit = matrix[8][7];
    else bit = matrix[8][14 - i];
    if (bit) bits |= 1 << i;
  }
  const unmasked = bits ^ 0x5412;
  const data = unmasked >>> 10;
  expect(data >>> 3).toBe(0b00); // error-correction level M
  return data & 0b111;
}

function maskCondition(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(col / 3) + Math.floor(row / 2)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

/** Reverses masking + zigzag placement to recover the interleaved codewords. */
function readCodewords(matrix: boolean[][]): number[] {
  const size = matrix.length;
  const version = (size - 17) / 4;
  const { reserved } = buildFunctionGrids(version);
  const mask = readMask(matrix);

  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (reserved[row][col]) continue;
        const value = maskCondition(mask, row, col) ? !matrix[row][col] : matrix[row][col];
        bits.push(value ? 1 : 0);
      }
    }
  }

  const codewords: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  return codewords;
}

/** M-level block structure for the versions the encoder supports. */
const SPECS: Record<number, { ec: number; groups: Array<[number, number]> }> = {
  1: { ec: 10, groups: [[1, 16]] },
  2: { ec: 16, groups: [[1, 28]] },
  3: { ec: 26, groups: [[1, 44]] },
  4: { ec: 18, groups: [[2, 32]] },
  5: { ec: 24, groups: [[2, 43]] },
  6: { ec: 16, groups: [[4, 27]] },
  7: { ec: 18, groups: [[4, 31]] },
  8: { ec: 22, groups: [[2, 38], [2, 39]] },
  9: { ec: 22, groups: [[3, 36], [2, 37]] },
  10: { ec: 26, groups: [[4, 43], [1, 44]] },
};

/** Undoes block interleaving and returns the data codewords in order. */
function deinterleave(codewords: number[], version: number): number[] {
  const spec = SPECS[version];
  const blockSizes: number[] = [];
  for (const [blocks, dataCodewords] of spec.groups) {
    for (let i = 0; i < blocks; i++) blockSizes.push(dataCodewords);
  }

  const blocks: number[][] = blockSizes.map(() => []);
  const maxLen = Math.max(...blockSizes);
  let index = 0;
  for (let i = 0; i < maxLen; i++) {
    for (let b = 0; b < blocks.length; b++) {
      if (i < blockSizes[b]) blocks[b].push(codewords[index++]);
    }
  }
  return blocks.flat();
}

/** Decodes a byte-mode payload from the data codewords. */
function decodePayload(dataCodewords: number[], version: number): string {
  const bits: number[] = [];
  for (const cw of dataCodewords) {
    for (let i = 7; i >= 0; i--) bits.push((cw >>> i) & 1);
  }
  const take = (count: number) => {
    let value = 0;
    for (let i = 0; i < count; i++) value = (value << 1) | bits.shift()!;
    return value;
  };

  expect(take(4)).toBe(0b0100); // byte mode
  const length = take(version < 10 ? 8 : 16);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = take(8);
  return new TextDecoder().decode(bytes);
}

function roundTrip(text: string): string {
  const matrix = generateQrMatrix(text);
  const version = (matrix.length - 17) / 4;
  return decodePayload(deinterleave(readCodewords(matrix), version), version);
}

describe("generateQrMatrix", () => {
  it("round-trips a referral URL", () => {
    const url = "https://aethyx.space/r/ABC123";
    expect(roundTrip(url)).toBe(url);
  });

  it("round-trips payloads across single- and multi-block versions", () => {
    const payloads = [
      "a",
      "https://aethyx.space/r/kmitch",
      "https://aethyx.space/r/" + "x".repeat(40),
      "https://aethyx.space/r/" + "y".repeat(120),
      "https://aethyx.space/r/" + "z".repeat(190),
    ];
    for (const payload of payloads) {
      expect(roundTrip(payload)).toBe(payload);
    }
  });

  it("round-trips multi-byte UTF-8", () => {
    const text = "https://aethyx.space/r/café–ñ";
    expect(roundTrip(text)).toBe(text);
  });

  it("places the three finder patterns", () => {
    const matrix = generateQrMatrix("https://aethyx.space/r/ABC123");
    const size = matrix.length;
    for (const [row, col] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ]) {
      // Outer ring dark, inner ring light, 3x3 core dark.
      expect(matrix[row][col]).toBe(true);
      expect(matrix[row + 1][col + 1]).toBe(false);
      expect(matrix[row + 3][col + 3]).toBe(true);
    }
  });

  it("alternates the timing patterns", () => {
    const matrix = generateQrMatrix("https://aethyx.space/r/ABC123");
    for (let i = 8; i < matrix.length - 8; i++) {
      expect(matrix[6][i]).toBe(i % 2 === 0);
      expect(matrix[i][6]).toBe(i % 2 === 0);
    }
  });

  it("throws rather than emitting an unscannable code when the payload is too long", () => {
    expect(() => generateQrMatrix("x".repeat(300))).toThrow(/too long/i);
  });
});

describe("qrMatrixToSvg", () => {
  it("emits an svg sized for the matrix plus a quiet zone", () => {
    const matrix = generateQrMatrix("https://aethyx.space/r/ABC123");
    const svg = qrMatrixToSvg(matrix, 4);
    const total = matrix.length + 8;
    expect(svg).toContain(`viewBox="0 0 ${total} ${total}"`);
    expect(svg).toContain("<path");
  });
});
