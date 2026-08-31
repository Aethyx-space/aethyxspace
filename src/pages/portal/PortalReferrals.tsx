import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Check,
  Copy,
  Link2,
  Loader2,
  Repeat,
  Rocket,
  Signature,
  TrendingUp,
  Users,
} from "lucide-react";

// `bounty_applicants` and `bounty_program_settings` are missing from the
// auto-generated Supabase types (src/integrations/supabase/types.ts), so every
// query against them goes through the codebase's standard `(supabase as any)`
// escape hatch until the types are regenerated.

interface BountyApplicant {
  id: string;
  full_name: string | null;
  email: string | null;
  code: string | null;
  status: string | null;
  enrollment_source: string | null;
  activated_at: string | null;
}

interface BountyProgramSettings {
  id: string;
  build_signing_amount: number;
  build_launch_amount: number;
  smaller_package_rate: number;
  growth_tier_rate: number;
  growth_tier_threshold: number;
  residual_rate: number;
  residual_window_months: number;
}

const DISCLAIMER =
  "Estimates only. Earnings are not guaranteed and remain subject to referral eligibility, the signed agreement, collected revenue, project milestones, refunds, disputes, and Aethyx approval.";

const money = (value: number) => `$${Number(value || 0).toFixed(0)}`;
const percent = (rate: number) => `${(Number(rate || 0) * 100).toFixed(0)}%`;

const PortalReferrals = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [applicant, setApplicant] = useState<BountyApplicant | null>(null);
  const [settings, setSettings] = useState<BountyProgramSettings | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      // RLS lets an authenticated user read only their own bounty_applicants row.
      const [applicantResult, settingsResult] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("bounty_applicants")
          .select(
            "id, full_name, email, code, status, enrollment_source, activated_at"
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("bounty_program_settings").select("*").maybeSingle(),
      ]);

      if (cancelled) return;
      setApplicant((applicantResult.data as BountyApplicant | null) ?? null);
      setSettings((settingsResult.data as BountyProgramSettings | null) ?? null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const referralCode = applicant?.code ?? null;
  const referralUrl = referralCode ? `https://aethyx.space/r/${referralCode}` : null;

  const copyToClipboard = async () => {
    if (!referralUrl) return;
    try {
      // navigator.clipboard is undefined / throws on insecure origins.
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
      setCopied(false);
      setTimeout(() => setCopyError(false), 4000);
    }
  };

  // TODO(bounty-commissions): referral counts and earnings are hardcoded to zero
  // until the bounty commission ledger exists. The legacy `referrals` table
  // predates the unified bounty program and its shape no longer maps to this
  // scale — do not derive commission math from it. Wire this up to the future
  // bounty commission/payout source (per-referral signing, launch, package
  // commission and residual rows) when it ships.
  const referralCount: number = 0;
  const totalEarned: number = 0;
  const referralRows: Array<{
    id: string;
    name: string;
    email: string;
    status: string;
  }> = [];

  const signingAmount = settings?.build_signing_amount ?? 0;
  const launchAmount = settings?.build_launch_amount ?? 0;
  const smallerRate = settings?.smaller_package_rate ?? 0;
  const growthRate = settings?.growth_tier_rate ?? 0;
  const growthThreshold = settings?.growth_tier_threshold ?? 0;
  const residualRate = settings?.residual_rate ?? 0;
  const residualMonths = settings?.residual_window_months ?? 0;

  const atGrowthTier = growthThreshold > 0 && referralCount >= growthThreshold;
  const remainingToGrowth = Math.max(growthThreshold - referralCount, 0);
  const growthProgress =
    growthThreshold > 0
      ? Math.min((referralCount / growthThreshold) * 100, 100)
      : 0;
  const currentRate = atGrowthTier ? growthRate : smallerRate;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  const header = (
    <div>
      <h1 className="text-2xl font-display tracking-wider mb-1">Referral Program</h1>
      <p className="text-muted-foreground text-sm">
        You're enrolled in the Aethyx Bounty program. Refer someone and earn on
        their signing, their launch, and everything they buy afterward.
      </p>
    </div>
  );

  if (!applicant) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="border-border/30">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground max-w-md">
              We're still setting up your referral profile. This usually only
              takes a moment — refresh shortly, or message us if it doesn't
              appear.
            </p>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground leading-relaxed">{DISCLAIMER}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {header}

      <Card className="border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-primary" />
            Your Referral Link
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {referralUrl ? (
            <>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="flex-1 rounded-md bg-muted/40 border border-border/30 px-3 py-2 font-mono text-sm text-foreground/80 truncate select-all">
                  {referralUrl}
                </div>
                <Button
                  type="button"
                  onClick={copyToClipboard}
                  size="sm"
                  className="shrink-0 gap-2 min-w-[128px]"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy link
                    </>
                  )}
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  Your code:{" "}
                  <span className="font-mono text-foreground/80">{referralCode}</span>
                </span>
              </div>

              {copyError && (
                <p className="text-xs text-destructive" role="status">
                  Couldn't copy automatically — select the link above and copy it
                  manually.
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                Share this link. When someone uses it and signs with Aethyx, the
                referral is credited to you automatically.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your referral code hasn't been issued yet. Message us and we'll get
              it set up.
            </p>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-4">
          What You Earn
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border/30">
            <CardContent className="pt-5">
              <Signature className="h-5 w-5 text-primary mb-2" />
              <p className="text-xs text-muted-foreground mb-1">
                When they sign a full build
              </p>
              <p className="text-xl font-display font-bold text-primary">
                {money(signingAmount)}
              </p>
              <p className="text-xs text-muted-foreground">signing bounty</p>
            </CardContent>
          </Card>

          <Card className="border-border/30">
            <CardContent className="pt-5">
              <Rocket className="h-5 w-5 text-primary mb-2" />
              <p className="text-xs text-muted-foreground mb-1">
                When their site launches
              </p>
              <p className="text-xl font-display font-bold text-primary">
                {money(launchAmount)}
              </p>
              <p className="text-xs text-muted-foreground">launch bounty</p>
            </CardContent>
          </Card>

          <Card className="border-border/30">
            <CardContent className="pt-5">
              <TrendingUp className="h-5 w-5 text-primary mb-2" />
              <p className="text-xs text-muted-foreground mb-1">
                Smaller packages
              </p>
              <p className="text-xl font-display font-bold text-primary">
                {percent(smallerRate)}
              </p>
              <p className="text-xs text-muted-foreground">
                rises to {percent(growthRate)} after {growthThreshold} referrals
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/30">
            <CardContent className="pt-5">
              <Repeat className="h-5 w-5 text-primary mb-2" />
              <p className="text-xs text-muted-foreground mb-1">
                Residual on everything they buy
              </p>
              <p className="text-xl font-display font-bold text-primary">
                {percent(residualRate)}
              </p>
              <p className="text-xs text-muted-foreground">
                for {residualMonths} months after they sign
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Growth Tier
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {atGrowthTier ? (
                <>
                  You've unlocked the {percent(growthRate)} rate on smaller
                  packages.
                </>
              ) : (
                <>
                  <span className="text-foreground font-medium">
                    {remainingToGrowth} of {growthThreshold}
                  </span>{" "}
                  referrals until your rate rises to {percent(growthRate)}.
                </>
              )}
            </p>
            <span className="text-sm font-medium text-primary">
              Current rate {percent(currentRate)}
            </span>
          </div>
          <div
            className="h-2 w-full rounded-full bg-muted/40 overflow-hidden"
            role="progressbar"
            aria-label="Progress toward growth tier"
            aria-valuenow={referralCount}
            aria-valuemin={0}
            aria-valuemax={growthThreshold}
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${growthProgress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {referralCount} qualified referral{referralCount === 1 ? "" : "s"} so far.
          </p>
        </CardContent>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
            Your Referrals
          </h2>
          <span className="text-sm text-muted-foreground">
            Total earned:{" "}
            <span className="font-medium text-foreground">
              ${totalEarned.toFixed(2)}
            </span>
          </span>
        </div>

        {referralRows.length === 0 ? (
          <Card className="border-border/30">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground max-w-sm">
                No referrals yet. Share your link and anyone who signs through it
                will show up here with their status and what you've earned.
              </p>
              {referralUrl && (
                <Button
                  type="button"
                  onClick={copyToClipboard}
                  variant="outline"
                  size="sm"
                  className="mt-5 gap-2 border-border/30"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy my referral link
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {referralRows.map((row) => (
              <Card key={row.id} className="border-border/30">
                <CardContent className="py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{row.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {row.email}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-border/40 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {row.status}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{DISCLAIMER}</p>
    </div>
  );
};

export default PortalReferrals;
