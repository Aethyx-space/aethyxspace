-- Bounty Hunter program foundation.
-- Additive only: new nullable columns, one index swap, one new table.
-- No existing rows are rewritten. bounty_applicants was empty when applied.

ALTER TABLE public.bounty_applicants
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bounty_applicants_user_id_key
  ON public.bounty_applicants (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.bounty_applicants
  ADD COLUMN IF NOT EXISTS account_created_at        timestamptz,
  ADD COLUMN IF NOT EXISTS agreement_sent_at         timestamptz,
  ADD COLUMN IF NOT EXISTS agreement_signed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS w9_verified_at            timestamptz,
  ADD COLUMN IF NOT EXISTS certification_passed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS payment_info_at           timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at              timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at              timestamptz,
  ADD COLUMN IF NOT EXISTS terminated_at             timestamptz,
  ADD COLUMN IF NOT EXISTS status_reason             text,
  ADD COLUMN IF NOT EXISTS admin_notes               text,
  ADD COLUMN IF NOT EXISTS preferred_name            text;

-- Status vocabulary. 'pending' retained as the insert value because the existing
-- public INSERT policy pins status = 'pending'; changing it breaks /bounty.
ALTER TABLE public.bounty_applicants
  DROP CONSTRAINT IF EXISTS bounty_applicants_status_check;

ALTER TABLE public.bounty_applicants
  ADD CONSTRAINT bounty_applicants_status_check CHECK (status IN (
    'pending', 'under_review', 'more_info_requested', 'approved',
    'rejected', 'declined', 'withdrawn', 'suspended', 'terminated'
  ));

CREATE INDEX IF NOT EXISTS idx_bounty_applicants_status
  ON public.bounty_applicants (status);

-- Vanity codes must be case-insensitively unique so /r/KMitchell and
-- /r/kmitchell resolve to the same hunter. Drop the constraint (which owns the
-- index) rather than the index itself.
ALTER TABLE public.bounty_applicants
  DROP CONSTRAINT IF EXISTS bounty_applicants_code_key;

DROP INDEX IF EXISTS public.bounty_applicants_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS bounty_applicants_code_lower_key
  ON public.bounty_applicants (lower(code)) WHERE code IS NOT NULL;

-- Bounty commission settings. Separate from referral_program_settings, which
-- governs the CLIENT referral program ($200 + $150) and must not be disturbed.
CREATE TABLE IF NOT EXISTS public.bounty_program_settings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled                     boolean NOT NULL DEFAULT true,

  build_signing_amount        numeric NOT NULL DEFAULT 100.00,
  build_launch_amount         numeric NOT NULL DEFAULT 100.00,

  smaller_package_rate        numeric NOT NULL DEFAULT 0.06,
  growth_tier_rate            numeric NOT NULL DEFAULT 0.10,
  growth_tier_threshold       integer NOT NULL DEFAULT 3,
  tier_counts_full_builds_only boolean NOT NULL DEFAULT false,

  -- 5% on everything a referred client buys for 12 months from signing.
  -- Replaces (never stacks with) the rates above; not lifted by the growth tier.
  residual_rate               numeric NOT NULL DEFAULT 0.05,
  residual_window_months      integer NOT NULL DEFAULT 12,
  residual_includes_recurring boolean NOT NULL DEFAULT true,

  payout_window_business_days integer NOT NULL DEFAULT 7,
  certification_pass_score    integer NOT NULL DEFAULT 80,
  tax_reporting_threshold     numeric NOT NULL DEFAULT 600.00,
  terms_version               text NOT NULL DEFAULT 'v1',

  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS bounty_program_settings_singleton
  ON public.bounty_program_settings ((true));

INSERT INTO public.bounty_program_settings DEFAULT VALUES
ON CONFLICT DO NOTHING;

ALTER TABLE public.bounty_program_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bps_admin ON public.bounty_program_settings;
CREATE POLICY bps_admin ON public.bounty_program_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS bps_auth_read ON public.bounty_program_settings;
CREATE POLICY bps_auth_read ON public.bounty_program_settings
  FOR SELECT TO authenticated
  USING (true);

-- A bounty hunter may read their own applicant row (dashboard needs this).
DROP POLICY IF EXISTS bounty_self_read ON public.bounty_applicants;
CREATE POLICY bounty_self_read ON public.bounty_applicants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
