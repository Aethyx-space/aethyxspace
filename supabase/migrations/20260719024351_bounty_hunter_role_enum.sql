-- Add bounty_hunter to app_role. Isolated in its own migration because a new
-- enum value cannot be referenced in the same transaction that creates it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'bounty_hunter';
