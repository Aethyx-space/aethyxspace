import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Compass } from "lucide-react";

import BountyHeader from "./components/BountyHeader";
import OnboardingChecklist from "./components/OnboardingChecklist";
import ReferralLinkCard from "./components/ReferralLinkCard";
import SummaryCards from "./components/SummaryCards";
import GrowthTierCard from "./components/GrowthTierCard";
import EarningsReferenceCard from "./components/EarningsReferenceCard";
import BountyPortalSkeleton from "./components/BountyPortalSkeleton";

import {
  buildOnboardingSteps,
  deriveAccountStatus,
  EMPTY_STATS,
  FALLBACK_SETTINGS,
  type BountyApplicant,
  type BountyProgramSettings,
  type BountyStats,
} from "./types";

type LoadState = "loading" | "ready" | "no-record" | "error";

const BountyPortal = () => {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<LoadState>("loading");
  const [applicant, setApplicant] = useState<BountyApplicant | null>(null);
  const [settings, setSettings] = useState<BountyProgramSettings>(FALLBACK_SETTINGS);

  // TODO(bounty-commissions): once a commissions/referrals table exists, replace
  // this constant with a real aggregate loaded alongside the queries below.
  const stats: BountyStats = EMPTY_STATS;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setState("no-record");
      return;
    }

    let cancelled = false;

    const loadBountyData = async () => {
      setState("loading");

      // Both tables are absent from / stale in the generated Supabase types, so
      // they're queried untyped and mapped onto local interfaces.
      const [applicantResult, settingsResult] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("bounty_applicants")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("bounty_program_settings").select("*").limit(1).maybeSingle(),
      ]);

      if (cancelled) return;

      if (settingsResult?.data) {
        setSettings({ ...FALLBACK_SETTINGS, ...(settingsResult.data as BountyProgramSettings) });
      }

      if (applicantResult?.error) {
        console.error("Failed to load bounty applicant:", applicantResult.error);
        setState("error");
        return;
      }

      const row = applicantResult?.data as BountyApplicant | null;
      if (!row) {
        setState("no-record");
        return;
      }

      setApplicant(row);
      setState("ready");
    };

    loadBountyData().catch((err) => {
      if (cancelled) return;
      console.error("Failed to load bounty portal:", err);
      setState("error");
    });

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const steps = useMemo(
    () => (applicant ? buildOnboardingSteps(applicant) : []),
    [applicant]
  );
  const status = useMemo(
    () => (applicant ? deriveAccountStatus(applicant) : null),
    [applicant]
  );

  if (authLoading || state === "loading") {
    return <BountyPortalSkeleton />;
  }

  if (state === "error") {
    return (
      <Card className="border-border/30">
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground/40" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium">We couldn't load your bounty dashboard</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Something went wrong on our side. Try again in a moment — if it keeps happening,
              get in touch and we'll sort it out.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state === "no-record" || !applicant || !status) {
    return (
      <Card className="border-border/30">
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <Compass className="h-10 w-10 text-muted-foreground/40" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium">No bounty account linked to this login</p>
            <p className="max-w-md text-sm text-muted-foreground">
              We couldn't find a bounty application tied to your account. If you applied with a
              different email address, sign in with that one. Otherwise you can apply to join the
              program.
            </p>
          </div>
          <Button asChild variant="outline">
            <a href="/bounty">View the bounty program</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isActive = status.key === "active";

  return (
    <div className="space-y-8">
      <BountyHeader applicant={applicant} status={status} />

      <SummaryCards stats={stats} isActive={isActive} />

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <OnboardingChecklist steps={steps} isActive={isActive} />

        <div className="space-y-6">
          <ReferralLinkCard
            code={applicant.code}
            activatedAt={applicant.activated_at}
            steps={steps}
          />
          <GrowthTierCard settings={settings} qualifyingReferrals={stats.signedClients} />
          <EarningsReferenceCard settings={settings} />
        </div>
      </div>
    </div>
  );
};

export default BountyPortal;
