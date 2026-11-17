import type { AccountStatusInfo, BountyApplicant } from "../types";

interface BountyHeaderProps {
  applicant: BountyApplicant;
  status: AccountStatusInfo;
}

/** Greeting + account status badge. */
const BountyHeader = ({ applicant, status }: BountyHeaderProps) => {
  const greetingName =
    applicant.preferred_name?.trim() || applicant.full_name?.trim().split(/\s+/)[0] || "there";

  return (
    <header className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-primary text-[11px] tracking-[0.35em] uppercase mb-2">
            Bounty Program
          </p>
          <h1 className="font-display tracking-wider text-2xl sm:text-3xl">
            Welcome, {greetingName}
          </h1>
        </div>

        <span
          className={`inline-flex w-fit shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium tracking-wide ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
        {status.description}
      </p>

      {applicant.status_reason && (
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed border-l-2 border-border pl-3">
          {applicant.status_reason}
        </p>
      )}
    </header>
  );
};

export default BountyHeader;
