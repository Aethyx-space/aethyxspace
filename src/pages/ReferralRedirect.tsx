import { useEffect } from "react";
import { useParams } from "react-router-dom";

/**
 * /r/:code — memorable Bounty Hunter referral links (e.g. /r/kmitchell).
 *
 * The site is a static SPA, so /r/:code is served index.html rather than hitting
 * the edge. This route exists only to hand the code off to the resolve-referral
 * edge function, which is the component that actually matters: it looks the code
 * up with the service role, sets the httpOnly `aethyx_ref` attribution cookie,
 * and 302s to /intake. Doing the lookup here instead would mean shipping the
 * attribution cookie to client-side JS, where it could be forged.
 *
 * We use location.replace so the redirect does not land in browser history —
 * the back button should return to wherever the visitor came from, not bounce
 * them through the resolver again.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

const ReferralRedirect = () => {
  const { code } = useParams<{ code: string }>();

  useEffect(() => {
    const clean = (code ?? "").trim().toLowerCase();

    // Mirror the resolver's own validation so obviously bad input never leaves
    // the browser. Anything unexpected falls through to a plain intake visit.
    if (!SUPABASE_URL || !clean || !/^[a-z0-9-]{3,32}$/.test(clean)) {
      window.location.replace("/intake");
      return;
    }

    window.location.replace(
      `${SUPABASE_URL}/functions/v1/resolve-referral?code=${encodeURIComponent(clean)}`,
    );
  }, [code]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Taking you to Aethyx…</p>
      </div>
    </div>
  );
};

export default ReferralRedirect;
