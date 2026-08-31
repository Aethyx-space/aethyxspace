import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  FileSignature,
  Rocket,
  Users,
  Wallet,
  TrendingUp,
} from "lucide-react";
import type { BountyStats } from "../types";
import { formatUsd } from "../types";

interface SummaryCardsProps {
  stats: BountyStats;
  /** Referrals aren't tracked until the account is active — changes the empty copy. */
  isActive: boolean;
}

const SummaryCards = ({ stats, isActive }: SummaryCardsProps) => {
  const items = [
    {
      key: "total",
      label: "Total referrals",
      value: String(stats.totalReferrals),
      icon: Users,
    },
    {
      key: "accepted",
      label: "Accepted",
      value: String(stats.accepted),
      icon: CheckCircle2,
    },
    {
      key: "signed",
      label: "Signed clients",
      value: String(stats.signedClients),
      icon: FileSignature,
    },
    {
      key: "launched",
      label: "Launched projects",
      value: String(stats.launchedProjects),
      icon: Rocket,
    },
    {
      key: "pending",
      label: "Pending earnings",
      value: formatUsd(stats.pendingEarnings),
      icon: Wallet,
    },
    {
      key: "lifetime",
      label: "Lifetime earnings",
      value: formatUsd(stats.lifetimeEarnings),
      icon: TrendingUp,
    },
  ];

  const isEmpty =
    stats.totalReferrals === 0 &&
    stats.signedClients === 0 &&
    stats.lifetimeEarnings === 0;

  return (
    <section aria-labelledby="bounty-summary-heading" className="space-y-3">
      <h2
        id="bounty-summary-heading"
        className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
      >
        Your numbers
      </h2>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {items.map((item) => (
          <Card key={item.key} className="border-border/30">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <item.icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              </div>
              <p className="font-display text-2xl font-bold text-foreground">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isEmpty && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {isActive
            ? "Nothing to show yet. Your first referral will appear here once someone reaches Aethyx through your link."
            : "Tracking begins when your account goes active — these stay at zero until then."}
        </p>
      )}
    </section>
  );
};

export default SummaryCards;
