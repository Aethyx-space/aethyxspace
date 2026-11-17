-- ONE referral program.
--
-- Clients are auto-enrolled in the Bounty program and earn the same scale as
-- Bounty Hunters ($100 signing / $100 launch, 6% -> 10% after 3, 5% residual for
-- 12 months). This removes the split where clients earned $200 + $150 from
-- referral_program_settings while hunters earned a different scale — a dual-role
-- participant could otherwise have triggered both and been paid twice.
--
-- referral_links / referral_program_settings are left in place but are now
-- LEGACY. bounty_applicants is the single source of referral identity, so one
-- code space feeds one resolver (/r/:code) and one commission engine.
-- Both legacy tables were empty, so there was nothing to migrate.

ALTER TABLE public.bounty_applicants
  ADD COLUMN IF NOT EXISTS enrollment_source text NOT NULL DEFAULT 'application';

ALTER TABLE public.bounty_applicants
  DROP CONSTRAINT IF EXISTS bounty_applicants_enrollment_source_check;

ALTER TABLE public.bounty_applicants
  ADD CONSTRAINT bounty_applicants_enrollment_source_check
    CHECK (enrollment_source IN ('application', 'client'));

ALTER TABLE public.bounty_applicants
  ADD COLUMN IF NOT EXISTS client_profile_id uuid
    REFERENCES public.client_profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bounty_applicants_client_profile_key
  ON public.bounty_applicants (client_profile_id) WHERE client_profile_id IS NOT NULL;

-- Reserved codes live in the DB so the trigger and the edge function cannot drift.
CREATE TABLE IF NOT EXISTS public.bounty_reserved_codes (code text PRIMARY KEY);

INSERT INTO public.bounty_reserved_codes (code) VALUES
  ('admin'),('login'),('logout'),('api'),('r'),('portal'),('intake'),('bounty'),
  ('blog'),('contact'),('about'),('services'),('portfolio'),('terms'),('privacy'),
  ('unsubscribe'),('launch'),('advertise'),('barter'),('industries'),('www'),
  ('mail'),('support'),('help'),('new'),('edit'),('delete'),('null'),('undefined')
ON CONFLICT DO NOTHING;

ALTER TABLE public.bounty_reserved_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brc_admin ON public.bounty_reserved_codes;
CREATE POLICY brc_admin ON public.bounty_reserved_codes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- The unaccent extension is not guaranteed to be installed; this covers the
-- Latin-1 range, which is what actually shows up in names here.
CREATE OR REPLACE FUNCTION public.unaccent_fallback(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT translate(
    p,
    'àáâãäåaèéêëeìíîïiòóôõöoùúûüuýÿyñnçcÀÁÂÃÄÅAÈÉÊËEÌÍÎÏIÒÓÔÕÖOÙÚÛÜUÝYÑNÇC',
    'aaaaaaaeeeeeiiiiioooooouuuuuyyynncCAAAAAAAEEEEEIIIIIOOOOOOUUUUUYYNNCC'
  );
$$;

-- "Kristin Mitchell" -> "kmitchell". Single source of truth for code shape,
-- used by both the client auto-enrol trigger and the admin approval path.
CREATE OR REPLACE FUNCTION public.bounty_vanity_base(p_full_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  words text[];
  w text;
  cleaned text[] := '{}';
BEGIN
  words := regexp_split_to_array(coalesce(trim(p_full_name), ''), '\s+');
  FOREACH w IN ARRAY words LOOP
    w := lower(regexp_replace(unaccent_fallback(w), '[^a-zA-Z0-9]', '', 'g'));
    IF w <> '' THEN cleaned := array_append(cleaned, w); END IF;
  END LOOP;

  IF array_length(cleaned, 1) IS NULL THEN RETURN ''; END IF;
  IF array_length(cleaned, 1) = 1 THEN RETURN cleaned[1]; END IF;
  RETURN substr(cleaned[1], 1, 1) || cleaned[array_length(cleaned, 1)];
END;
$$;

-- Allocate a unique vanity code. Collision-safe: relies on the unique index on
-- lower(code) and retries, rather than check-then-write.
CREATE OR REPLACE FUNCTION public.allocate_bounty_code(
  p_applicant_id uuid,
  p_custom text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_base text;
  v_candidate text;
  n int := 1;
BEGIN
  SELECT full_name INTO v_name FROM bounty_applicants WHERE id = p_applicant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'applicant not found'; END IF;

  IF p_custom IS NOT NULL AND trim(p_custom) <> '' THEN
    v_candidate := lower(trim(p_custom));
    IF v_candidate !~ '^[a-z0-9-]{3,32}$' THEN
      RAISE EXCEPTION 'invalid code format';
    END IF;
    IF EXISTS (SELECT 1 FROM bounty_reserved_codes WHERE code = v_candidate) THEN
      RAISE EXCEPTION 'code reserved';
    END IF;
    UPDATE bounty_applicants SET code = v_candidate WHERE id = p_applicant_id;
    RETURN v_candidate;
  END IF;

  v_base := bounty_vanity_base(v_name);
  IF v_base = '' OR length(v_base) < 3 THEN
    v_base := 'bh' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  END IF;

  LOOP
    v_candidate := CASE WHEN n = 1 THEN v_base ELSE v_base || n::text END;

    IF NOT EXISTS (SELECT 1 FROM bounty_reserved_codes WHERE code = v_candidate) THEN
      BEGIN
        UPDATE bounty_applicants SET code = v_candidate WHERE id = p_applicant_id;
        RETURN v_candidate;
      EXCEPTION WHEN unique_violation THEN
        -- taken; fall through and try the next suffix
      END;
    END IF;

    n := n + 1;
    IF n > 99 THEN
      v_candidate := 'bh' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      UPDATE bounty_applicants SET code = v_candidate WHERE id = p_applicant_id;
      RETURN v_candidate;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_bounty_code(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.allocate_bounty_code(uuid, text) TO service_role;

-- Auto-enrol every client into the referral program.
-- Clients are approved + activated immediately: they have an existing paid
-- relationship, so there is no application to review. They are NOT required to
-- complete Bounty Hunter onboarding to hold a link — but payout still gates on
-- W-9 the same as any other participant.
CREATE OR REPLACE FUNCTION public.enrol_client_in_bounty_program()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM bounty_applicants WHERE client_profile_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO bounty_applicants (
    full_name, email, phone, tax_ack, status,
    enrollment_source, client_profile_id, user_id,
    account_created_at, activated_at, reviewed_at
  ) VALUES (
    NEW.full_name,
    coalesce(NEW.email, 'unknown+' || NEW.id::text || '@aethyx.space'),
    NEW.phone,
    false,                 -- clients have not signed the BH tax acknowledgement
    'approved',
    'client',
    NEW.id,
    NEW.user_id,
    now(), now(), now()
  )
  RETURNING id INTO v_id;

  PERFORM allocate_bounty_code(v_id, NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrol_client_in_bounty ON public.client_profiles;
CREATE TRIGGER trg_enrol_client_in_bounty
  AFTER INSERT ON public.client_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enrol_client_in_bounty_program();

-- Backfill existing clients.
DO $$
DECLARE r record; v_id uuid;
BEGIN
  FOR r IN SELECT * FROM client_profiles WHERE archived_at IS NULL LOOP
    IF NOT EXISTS (SELECT 1 FROM bounty_applicants WHERE client_profile_id = r.id) THEN
      INSERT INTO bounty_applicants (
        full_name, email, phone, tax_ack, status,
        enrollment_source, client_profile_id, user_id,
        account_created_at, activated_at, reviewed_at
      ) VALUES (
        r.full_name,
        coalesce(r.email, 'unknown+' || r.id::text || '@aethyx.space'),
        r.phone, false, 'approved', 'client', r.id, r.user_id,
        now(), now(), now()
      ) RETURNING id INTO v_id;
      PERFORM allocate_bounty_code(v_id, NULL);
    END IF;
  END LOOP;
END $$;

-- Every client now has a referral link, so the per-client toggle is obsolete.
ALTER TABLE public.client_profiles ALTER COLUMN referral_enabled SET DEFAULT true;
UPDATE public.client_profiles SET referral_enabled = true WHERE referral_enabled = false;
