import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BountyProgramSettings } from "../types";
import { formatRate, formatUsd } from "../types";

interface EarningsReferenceCardProps {
  settings: BountyProgramSettings;
}

const EarningsReferenceCard = ({ settings }: EarningsReferenceCardProps) => {
  const rows = [
    {
      key: "build",
      heading: "Full website builds",
      value: `${formatUsd(settings.build_signing_amount)} + ${formatUsd(
        settings.build_launch_amount
      )}`,
      detail: `${formatUsd(
        settings.build_signing_amount
      )} when the client signs, and ${formatUsd(
        settings.build_launch_amount
      )} again when their project launches.`,
    },
    {
      key: "packages",
      heading: "Smaller packages",
      value: `${formatRate(settings.smaller_package_rate)} → ${formatRate(
        settings.growth_tier_rate
      )}`,
      detail: `${formatRate(
        settings.smaller_package_rate
      )} of collected revenue, rising to ${formatRate(
        settings.growth_tier_rate
      )} after ${settings.growth_tier_threshold} referrals.`,
    },
    {
      key: "residual",
      heading: "Residuals",
      value: formatRate(settings.residual_rate),
      detail: `${formatRate(
        settings.residual_rate
      )} on everything a referred client buys for ${
        settings.residual_window_months
      } months after they sign.`,
    },
  ];

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">How earnings work</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="space-y-4">
          {rows.map((row) => (
            <div key={row.key} className="border-l-2 border-primary/40 pl-3">
              <dt className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-foreground">{row.heading}</span>
                <span className="font-display text-sm font-bold text-primary">{row.value}</span>
              </dt>
              <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{row.detail}</dd>
            </div>
          ))}
        </dl>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Approved payouts are issued within {settings.payout_window_business_days} business days.
        </p>

        <p className="rounded-lg border border-border/40 bg-muted/40 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          Estimates only. Earnings are not guaranteed and remain subject to referral eligibility,
          the signed agreement, collected revenue, project milestones, refunds, disputes, and
          Aethyx approval.
        </p>
      </CardContent>
    </Card>
  );
};

export default EarningsReferenceCard;
