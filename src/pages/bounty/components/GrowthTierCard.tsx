import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BountyProgramSettings } from "../types";
import { formatRate } from "../types";

interface GrowthTierCardProps {
  settings: BountyProgramSettings;
  /** Referrals that count toward the tier threshold. */
  qualifyingReferrals: number;
}

const GrowthTierCard = ({ settings, qualifyingReferrals }: GrowthTierCardProps) => {
  const threshold = Number(settings.growth_tier_threshold);
  const reached = qualifyingReferrals >= threshold;
  const remaining = Math.max(threshold - qualifyingReferrals, 0);
  const percent = threshold === 0 ? 100 : Math.min((qualifyingReferrals / threshold) * 100, 100);

  const baseRate = formatRate(settings.smaller_package_rate);
  const growthRate = formatRate(settings.growth_tier_rate);

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Growth tier</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-foreground">
          {reached ? (
            <>
              You've reached the growth tier. Your rate on smaller packages is{" "}
              <span className="text-primary font-medium">{growthRate}</span>.
            </>
          ) : (
            <>
              <span className="text-primary font-medium">
                {remaining} of {threshold}
              </span>{" "}
              referrals until your rate rises from {baseRate} to {growthRate}.
            </>
          )}
        </p>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.min(qualifyingReferrals, threshold)}
          aria-valuemin={0}
          aria-valuemax={threshold}
          aria-label={`Growth tier progress: ${qualifyingReferrals} of ${threshold} referrals`}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          The higher rate applies to qualifying referrals after the threshold is met. It doesn't
          apply retroactively.
        </p>
      </CardContent>
    </Card>
  );
};

export default GrowthTierCard;
