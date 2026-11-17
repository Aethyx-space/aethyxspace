import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";
import type { OnboardingStep } from "../types";

interface OnboardingChecklistProps {
  steps: OnboardingStep[];
  isActive: boolean;
}

const OnboardingChecklist = ({ steps, isActive }: OnboardingChecklistProps) => {
  const completed = steps.filter((s) => s.complete).length;
  const total = steps.length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Onboarding</CardTitle>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {completed} of {total} complete
          </span>
        </div>
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`Onboarding progress: ${completed} of ${total} steps complete`}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step.id} className="flex items-start gap-3">
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium ${
                  step.complete
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {step.complete ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${
                    step.complete ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                  <span className="sr-only">
                    {step.complete ? " — complete" : " — not yet complete"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.hint}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="rounded-lg border border-border/40 bg-muted/40 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          Referrals only become commission-eligible once every step above is complete
          <span className="text-foreground"> and </span>
          your account status is Active.
          {!isActive && " Until then, any introductions you make won't be tracked or paid."}
        </p>
      </CardContent>
    </Card>
  );
};

export default OnboardingChecklist;
