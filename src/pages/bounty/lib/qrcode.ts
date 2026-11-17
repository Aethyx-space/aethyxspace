/**
 * Minimal, dependency-free QR Code encoder (byte mode, error-correction level M,
 * versions 1–10). Written in-repo deliberately: the bounty portal only needs to
 * render a short referral URL, and adding an npm dependency for that would be a
 * disproportionate change to the build.
 *
 * Implements ISO/IEC 18004: byte-mode encoding, Reed-Solomon error correction
 * over GF(256), block interleaving, function-pattern placement, format/version
 * information, and mask selection by penalty score.
 */

interface VersionSpec {
  /** Error-correction codewords per block. */
  ecPerBlock: number;
  /** Data blocks, in placement order. */
  groups: Array<{ blocks: number; dataCodewords: number }>;
}

/** Error-correction level M block structure for versions 1–10. */
const VERSION_SPECS: Record<number, VersionSpec> = {
  1: { ecPerBlock: 10, groups: [{ blocks: 1, dataCodewords: 16 }] },
  2: { ecPerBlock: 16, groups: [{ blocks: 1, dataCodewords: 28 }] },
  3: { ecPerBlock: 26, groups: [{ blocks: 1, dataCodewords: 44 }] },
  4: { ecPerBlock: 18, groups: [{ blocks: 2, dataCodewords: 32 }] },
  5: { ecPerBlock: 24, groups: [{ blocks: 2, dataCodewords: 43 }] },
  6: { ecPerBlock: 16, groups: [{ blocks: 4, dataCodewords: 27 }] },
  7: { ecPerBlock: 18, groups: [{ blocks: 4, dataCodewords: 31 }] },
  8: {
    ecPerBlock: 22,
    groups: [
      { blocks: 2, dataCodewords: 38 },
      { blocks: 2, dataCodewords: 39 },
    ],
  },
  9: {
    ecPerBlock: 22,
    groups: [
      { blocks: 3, dataCodewords: 36 },
      { blocks: 2, dataCodewords: 37 },
    ],
  },
  10: {
    ecPerBlock: 26,
    groups: [
      { blocks: 4, dataCodewords: 43 },
      { blocks: 1, dataCodewords: 44 },
    ],
  },
};

/** Alignment-pattern centre coordinates per version. */
const ALIGNMENT_CENTERS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

/* ------------------------------------------------------------------ */
/* GF(256) arithmetic (primitive polynomial 0x11D)                     */
/* ------------------------------------------------------------------ */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

const gfMul = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];

/** Reed-Solomon generator polynomial of the given degree (highest term first). */
function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Returns the `ecCount` error-correction codewords for a block of data. */
function rsEncode(data: number[], ecCount: number): number[] {
  const gen = rsGeneratorPoly(ecCount);
  const buffer = new Array<number>(data.length + ecCount).fill(0);
  for (let i = 0; i < data.length; i++) buffer[i] = data[i];

  for (let i = 0; i < data.length; i++) {
    const factor = buffer[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      buffer[i + j] ^= gfMul(gen[j], factor);
    }
  }
  return buffer.slice(data.length);
}

/* ------------------------------------------------------------------ */
/* Encoding                                                            */
/* ------------------------------------------------------------------ */

const totalDataCodewords = (spec: VersionSpec): number =>
  spec.groups.reduce((sum, g) => sum + g.blocks * g.dataCodewords, 0);

function pickVersion(byteLength: number): number {
  for (let version = 1; version <= 10; version++) {
    const charCountBits = version < 10 ? 8 : 16;
    const requiredBits = 4 + charCountBits + byteLength * 8;
    if (requiredBits <= totalDataCodewords(VERSION_SPECS[version]) * 8) {
      return version;
    }
  }
  throw new Error("QR payload too long for supported versions (1-10).");
}

/** Builds the full, interleaved codeword stream for the payload. */
function buildCodewords(bytes: Uint8Array, version: number): number[] {
  const spec = VERSION_SPECS[version];
  const capacity = totalDataCodewords(spec);
  const charCountBits = version < 10 ? 8 : 16;

  const bits: number[] = [];
  const pushBits = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };

  pushBits(0b0100, 4); // byte mode
  pushBits(bytes.length, charCountBits);
  for (const b of bytes) pushBits(b, 8);

  // Terminator, then pad to a byte boundary.
  const terminator = Math.min(4, capacity * 8 - bits.length);
  pushBits(0, terminator);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    dataCodewords.push(byte);
  }
  // Alternating pad codewords fill any remaining capacity.
  const PADS = [0xec, 0x11];
  for (let i = 0; dataCodewords.length < capacity; i++) {
    dataCodewords.push(PADS[i % 2]);
  }

  // Split into blocks and compute error correction per block.
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (const group of spec.groups) {
    for (let b = 0; b < group.blocks; b++) {
      const block = dataCodewords.slice(offset, offset + group.dataCodewords);
      offset += group.dataCodewords;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, spec.ecPerBlock));
    }
  }

  // Interleave.
  const result: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) result.push(block[i]);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const block of ecBlocks) result.push(block[i]);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Matrix construction                                                 */
/* ------------------------------------------------------------------ */

type Grid = boolean[][];

function createGrid(size: number): Grid {
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
}

/**
 * Builds the function-pattern layer for a version, returning both the drawn
 * modules and the map of reserved (non-data) positions. Exported so the test
 * suite can walk the data placement in reverse and round-trip a payload.
 */
export function buildFunctionGrids(version: number): { modules: Grid; reserved: Grid } {
  const size = 17 + 4 * version;
  const modules = createGrid(size);
  const reserved = createGrid(size);
  drawFunctionPatterns(modules, reserved, version);
  return { modules, reserved };
}

function drawFunctionPatterns(modules: Grid, reserved: Grid, version: number) {
  const size = modules.length;

  const set = (row: number, col: number, dark: boolean) => {
    if (row < 0 || col < 0 || row >= size || col >= size) return;
    modules[row][col] = dark;
    reserved[row][col] = true;
  };

  // Timing patterns (drawn first; finder patterns overwrite the corners).
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // Finder patterns + separators.
  const drawFinder = (row: number, col: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        set(row + dy, col + dx, dist !== 2 && dist !== 4);
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(3, size - 4);
  drawFinder(size - 4, 3);

  // Alignment patterns.
  const centers = ALIGNMENT_CENTERS[version];
  const n = centers.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const isFinderCorner =
        (i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0);
      if (isFinderCorner) continue;
      const row = centers[i];
      const col = centers[j];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(row + dy, col + dx, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve the format-information areas (values written after masking).
  for (let i = 0; i <= 8; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  set(size - 8, 8, true); // permanently dark module

  // Version information (version 7 and up only).
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(b, a, bit);
      set(a, b, bit);
    }
  }
}

function drawCodewords(modules: Grid, reserved: Grid, codewords: number[]) {
  const size = modules.length;
  const totalBits = codewords.length * 8;
  let bitIndex = 0;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (reserved[row][col]) continue;
        // Positions past the data stream are remainder bits and stay light.
        if (bitIndex < totalBits) {
          const byte = codewords[bitIndex >>> 3];
          modules[row][col] = ((byte >>> (7 - (bitIndex & 7))) & 1) === 1;
        }
        bitIndex++;
      }
    }
  }
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

function applyMask(modules: Grid, reserved: Grid, mask: number) {
  const size = modules.length;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (reserved[row][col]) continue;
      if (maskCondition(mask, row, col)) modules[row][col] = !modules[row][col];
    }
  }
}

function drawFormatInfo(modules: Grid, mask: number) {
  const size = modules.length;
  const data = (0b00 << 3) | mask; // 0b00 = error-correction level M
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;

  for (let i = 0; i < 15; i++) {
    const bit = ((bits >>> i) & 1) === 1;
    if (i < 6) modules[i][8] = bit;
    else if (i === 6) modules[7][8] = bit;
    else if (i === 7) modules[8][8] = bit;
    else if (i === 8) modules[8][7] = bit;
    else modules[8][14 - i] = bit;

    if (i < 8) modules[8][size - 1 - i] = bit;
    else modules[size - 15 + i][8] = bit;
  }
  modules[size - 8][8] = true;
}

/** Standard four-rule penalty score used to pick the least-ambiguous mask. */
function penaltyScore(modules: Grid): number {
  const size = modules.length;
  let score = 0;

  const lineAt = (index: number, horizontal: boolean) =>
    Array.from({ length: size }, (_, i) =>
      horizontal ? modules[index][i] : modules[i][index]
    );

  const FINDER_LIKE = [true, false, true, true, true, false, true];

  for (const horizontal of [true, false]) {
    for (let i = 0; i < size; i++) {
      const line = lineAt(i, horizontal);

      // Rule 1 — runs of five or more identical modules.
      let runLength = 1;
      for (let j = 1; j < size; j++) {
        if (line[j] === line[j - 1]) {
          runLength++;
        } else {
          if (runLength >= 5) score += 3 + (runLength - 5);
          runLength = 1;
        }
      }
      if (runLength >= 5) score += 3 + (runLength - 5);

      // Rule 3 — finder-like pattern with four light modules on either side.
      for (let j = 0; j + 7 <= size; j++) {
        const matchesFinder = FINDER_LIKE.every((v, k) => line[j + k] === v);
        if (!matchesFinder) continue;
        const beforeClear =
          j >= 4 && line.slice(j - 4, j).every((v) => v === false);
        const afterClear =
          j + 11 <= size && line.slice(j + 7, j + 11).every((v) => v === false);
        if (beforeClear || afterClear) score += 40;
      }
    }
  }

  // Rule 2 — 2x2 blocks of a single colour.
  for (let row = 0; row + 1 < size; row++) {
    for (let col = 0; col + 1 < size; col++) {
      const v = modules[row][col];
      if (
        modules[row][col + 1] === v &&
        modules[row + 1][col] === v &&
        modules[row + 1][col + 1] === v
      ) {
        score += 3;
      }
    }
  }

  // Rule 4 — deviation from a 50% dark ratio.
  let dark = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) if (modules[row][col]) dark++;
  }
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/**
 * Encodes `text` and returns the QR matrix as `[row][col]` booleans
 * (`true` = dark module). No quiet zone is included.
 */
export function generateQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length);
  const codewords = buildCodewords(bytes, version);
  const size = 17 + 4 * version;

  let best: Grid | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask++) {
    const modules = createGrid(size);
    const reserved = createGrid(size);
    drawFunctionPatterns(modules, reserved, version);
    drawCodewords(modules, reserved, codewords);
    applyMask(modules, reserved, mask);
    drawFormatInfo(modules, mask);

    const score = penaltyScore(modules);
    if (score < bestScore) {
      bestScore = score;
      best = modules;
    }
  }

  return best as Grid;
}

/**
 * Renders a QR matrix as a standalone SVG string.
 *
 * The module colours are intentionally pure black on pure white rather than
 * theme tokens: scanners rely on maximum luminance contrast, and a themed
 * (dark-on-dark) code would not decode.
 */
export function qrMatrixToSvg(matrix: boolean[][], quietZone = 4): string {
  const size = matrix.length;
  const total = size + quietZone * 2;
  let path = "";
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (matrix[row][col]) {
        path += `M${col + quietZone} ${row + quietZone}h1v1h-1z`;
      }
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">`,
    `<rect width="${total}" height="${total}" fill="#ffffff"/>`,
    `<path d="${path}" fill="#000000"/>`,
    `</svg>`,
  ].join("");
}

/**
 * Draws the matrix to an offscreen canvas and triggers a PNG download.
 * Falls back to downloading the SVG if a 2D canvas context is unavailable.
 */
export function downloadQrPng(text: string, fileName: string, pixelSize = 12) {
  const matrix = generateQrMatrix(text);
  const quietZone = 4;
  const total = (matrix.length + quietZone * 2) * pixelSize;

  const canvas = document.createElement("canvas");
  canvas.width = total;
  canvas.height = total;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    const blob = new Blob([qrMatrixToSvg(matrix, quietZone)], {
      type: "image/svg+xml",
    });
    triggerDownload(URL.createObjectURL(blob), `${fileName}.svg`, true);
    return;
  }

  // Pure black/white is required for reliable scanning — see qrMatrixToSvg.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, total, total);
  ctx.fillStyle = "#000000";
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix.length; col++) {
      if (!matrix[row][col]) continue;
      ctx.fillRect(
        (col + quietZone) * pixelSize,
        (row + quietZone) * pixelSize,
        pixelSize,
        pixelSize
      );
    }
  }

  triggerDownload(canvas.toDataURL("image/png"), `${fileName}.png`, false);
}

function triggerDownload(href: string, fileName: string, revoke: boolean) {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (revoke) URL.revokeObjectURL(href);
}
