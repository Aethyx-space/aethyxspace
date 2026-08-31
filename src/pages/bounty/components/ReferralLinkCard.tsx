import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Copy, Link2, Lock, QrCode } from "lucide-react";
import { downloadQrPng, generateQrMatrix, qrMatrixToSvg } from "../lib/qrcode";
import type { OnboardingStep } from "../types";

interface ReferralLinkCardProps {
  /** Referral code; the card only renders its unlocked state when set and activated. */
  code: string | null;
  activatedAt: string | null;
  steps: OnboardingStep[];
}

const ReferralLinkCard = ({ code, activatedAt, steps }: ReferralLinkCardProps) => {
  const [copied, setCopied] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const unlocked = Boolean(code && activatedAt);
  const referralUrl = code ? `https://aethyx.space/r/${code}` : null;

  const qrSvg = useMemo(() => {
    if (!unlocked || !referralUrl) return null;
    try {
      return qrMatrixToSvg(generateQrMatrix(referralUrl));
    } catch {
      return null;
    }
  }, [unlocked, referralUrl]);

  const handleCopy = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setQrError("Couldn't copy automatically — select the link and copy it manually.");
    }
  };

  const handleDownloadQr = () => {
    if (!referralUrl || !code) return;
    try {
      setQrError(null);
      downloadQrPng(referralUrl, `aethyx-referral-${code}`);
    } catch {
      setQrError("Couldn't generate the QR code. Please try again.");
    }
  };

  if (!unlocked) {
    const remaining = steps.filter((s) => !s.complete);
    return (
      <Card className="border-border/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
            Your referral link
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your link and QR code appear here once your account is activated.
          </p>
          {remaining.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-foreground mb-2">Still to do</p>
              <ul className="space-y-1.5">
                {remaining.map((step) => (
                  <li key={step.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                    {step.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Everything on your side is done. Aethyx activates links manually — you'll get an
              email the moment yours is live.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4 text-primary" aria-hidden />
          Your referral link
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex-1 truncate rounded-md border border-border/40 bg-muted/40 px-3 py-2 font-mono text-sm text-foreground/90 select-all">
            {referralUrl}
          </div>
          <Button
            type="button"
            onClick={handleCopy}
            variant="outline"
            size="sm"
            className="shrink-0 gap-2 border-border/40 sm:min-w-[104px]"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copy link
              </>
            )}
          </Button>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {copied ? "Referral link copied to clipboard" : ""}
        </span>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {qrSvg && (
            <div
              className="h-28 w-28 shrink-0 overflow-hidden rounded-lg border border-border/40 bg-white p-1"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          )}
          <div className="min-w-0 space-y-2">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Referral ID</p>
              <p className="font-mono text-sm text-foreground select-all">{code}</p>
            </div>
            <Button
              type="button"
              onClick={handleDownloadQr}
              variant="outline"
              size="sm"
              className="gap-2 border-border/40"
            >
              <QrCode className="h-3.5 w-3.5" aria-hidden />
              Download QR
            </Button>
          </div>
        </div>

        {qrError && <p className="text-xs text-destructive">{qrError}</p>}

        <p className="text-xs leading-relaxed text-muted-foreground">
          Share the link or the QR code. Anyone who arrives through it is attributed to you —
          quote your referral ID if someone reaches out to Aethyx another way.
        </p>
      </CardContent>
    </Card>
  );
};

export default ReferralLinkCard;
