/**
 * Shared types, defaults and derivations for the bounty hunter portal.
 *
 * The generated Supabase types (`src/integrations/supabase/types.ts`) predate
 * the onboarding columns on `bounty_applicants` and do not know about
 * `bounty_program_settings` at all, so both tables are read through
 * `(supabase as any)` and mapped onto the interfaces below.
 */

/** A row of `bounty_applicants`, scoped by RLS to the signed-in user. */
export interface BountyApplicant {
  id: string;
  full_name: string;
  preferred_name: string | null;
  email: string;
  phone: string | null;
  relationship_note: string | null;
  tax_ack: boolean;
  status: string;
  code: string | null;
  user_id: string | null;

  w9_file_path: string | null;
  w9_uploaded_at: string | null;
  w9_verified_at: string | null;

  account_created_at: string | null;
  agreement_sent_at: string | null;
  agreement_signed_at: string | null;
  certification_passed_at: string | null;
  payment_info_at: string | null;
  activated_at: string | null;
  suspended_at: string | null;
  terminated_at: string | null;

  status_reason: string | null;
  applied_at: string | null;
  reviewed_at: string | null;
}

/** The singleton `bounty_program_settings` row. */
export interface BountyProgramSettings {
  build_signing_amount: number;
  build_launch_amount: number;
  smaller_package_rate: number;
  growth_tier_rate: number;
  growth_tier_threshold: number;
  residual_rate: number;
  residual_window_months: number;
  payout_window_business_days: number;
}

/**
 * Used only if the settings row cannot be read. These mirror the seeded
 * database defaults so the page still renders coherent copy rather than
 * blanks — every displayed rate prefers the live row.
 */
export const FALLBACK_SETTINGS: BountyProgramSettings = {
  build_signing_amount: 100,
  build_launch_amount: 100,
  smaller_package_rate: 0.06,
  growth_tier_rate: 0.1,
  growth_tier_threshold: 3,
  residual_rate: 0.05,
  residual_window_months: 12,
  payout_window_business_days: 7,
};

export interface BountyStats {
  totalReferrals: number;
  accepted: number;
  signedClients: number;
  launchedProjects: number;
  /** Earned but not yet paid out, in dollars. */
  pendingEarnings: number;
  /** All-time paid earnings, in dollars. */
  lifetimeEarnings: number;
}

/**
 * TODO(bounty-commissions): there is no commissions table yet. Once
 * `bounty_referrals` / `bounty_commissions` land, replace this constant with a
 * real aggregate query in `BountyPortal.tsx` (see `loadBountyData`) and delete
 * this placeholder. Deliberately all zeros — never show invented numbers on a
 * page people use to reason about money they are owed.
 */
export const EMPTY_STATS: BountyStats = {
  totalReferrals: 0,
  accepted: 0,
  signedClients: 0,
  launchedProjects: 0,
  pendingEarnings: 0,
  lifetimeEarnings: 0,
};

export type AccountStatus =
  | "pending"
  | "approved"
  | "active"
  | "suspended"
  | "terminated"
  | "declined";

export interface AccountStatusInfo {
  key: AccountStatus;
  label: string;
  description: string;
  /** Semantic-token classes for the status badge. */
  className: string;
}

const STATUS_INFO: Record<AccountStatus, AccountStatusInfo> = {
  pending: {
    key: "pending",
    label: "Pending review",
    description:
      "Your application is with the Aethyx team. We'll email you as soon as it's reviewed.",
    className: "border-border bg-muted text-muted-foreground",
  },
  approved: {
    key: "approved",
    label: "Approved – onboarding",
    description:
      "You're approved. Finish the steps below to activate your referral link.",
    className: "border-primary/40 bg-primary/10 text-primary",
  },
  active: {
    key: "active",
    label: "Active",
    description:
      "Your account is active and your referral link is live.",
    className: "border-primary bg-primary text-primary-foreground",
  },
  suspended: {
    key: "suspended",
    label: "Suspended",
    description:
      "Your account is temporarily suspended. New referrals aren't being counted right now.",
    className: "border-border bg-muted text-foreground",
  },
  terminated: {
    key: "terminated",
    label: "Terminated",
    description:
      "This bounty account has been closed. Reach out if you believe this is a mistake.",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  declined: {
    key: "declined",
    label: "Not approved",
    description:
      "This application wasn't approved. You're welcome to get in touch if things have changed.",
    className: "border-border bg-muted text-muted-foreground",
  },
};

/**
 * Resolves the badge state. Terminal states win over `status` because the
 * timestamps are set independently of the application workflow column.
 */
export function deriveAccountStatus(applicant: BountyApplicant): AccountStatusInfo {
  if (applicant.terminated_at) return STATUS_INFO.terminated;
  if (applicant.suspended_at) return STATUS_INFO.suspended;
  if (applicant.activated_at) return STATUS_INFO.active;

  const status = (applicant.status || "").toLowerCase();
  if (status === "approved") return STATUS_INFO.approved;
  if (status === "declined" || status === "rejected") return STATUS_INFO.declined;
  return STATUS_INFO.pending;
}

export interface OnboardingStep {
  id: string;
  label: string;
  hint: string;
  complete: boolean;
}

/** The eight onboarding steps, each derived from a single column. */
export function buildOnboardingSteps(applicant: BountyApplicant): OnboardingStep[] {
  const status = (applicant.status || "").toLowerCase();
  return [
    {
      id: "approved",
      label: "Application approved",
      hint: "Aethyx has reviewed and accepted your application.",
      complete: status === "approved" || Boolean(applicant.activated_at),
    },
    {
      id: "account",
      label: "Account created",
      hint: "Your bounty login is set up.",
      complete: Boolean(applicant.account_created_at),
    },
    {
      id: "agreement-sent",
      label: "Agreement reviewed",
      hint: "Your bounty hunter agreement has been sent to you to read.",
      complete: Boolean(applicant.agreement_sent_at),
    },
    {
      id: "agreement-signed",
      label: "Agreement signed",
      hint: "You've signed and returned the agreement.",
      complete: Boolean(applicant.agreement_signed_at),
    },
    {
      id: "w9",
      label: "W-9 submitted",
      hint: "Required before any payment can be released.",
      complete: Boolean(applicant.w9_uploaded_at),
    },
    {
      id: "certification",
      label: "Certification completed",
      hint: "A short walkthrough of what Aethyx sells and how to talk about it.",
      complete: Boolean(applicant.certification_passed_at),
    },
    {
      id: "payment",
      label: "Payment info submitted",
      hint: "Where your payouts should be sent.",
      complete: Boolean(applicant.payment_info_at),
    },
    {
      id: "activated",
      label: "Referral link activated",
      hint: "Your personal link and QR code go live here.",
      complete: Boolean(applicant.activated_at),
    },
  ];
}

/** Formats a rate stored as a fraction (0.06) into a percentage string ("6%"). */
export const formatRate = (rate: number): string =>
  `${(Number(rate) * 100).toFixed(Number(rate) * 100 % 1 === 0 ? 0 : 1)}%`;

/** Formats a dollar amount with no trailing cents when it's a whole number. */
export const formatUsd = (amount: number): string =>
  Number(amount) % 1 === 0
    ? `$${Number(amount).toFixed(0)}`
    : `$${Number(amount).toFixed(2)}`;
