// Public referral link resolver: GET /resolve-referral?code=kmitchell
// Redirects to the intake form and drops a 30-day attribution cookie.
// Deployed with --no-verify-jwt. Never leaks whether a code exists.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

// Local origin list — kept separate from _shared/admin-cors.ts so that changing
// the public surface here never widens CORS for the admin-only functions.
const allowedOrigins = [
  "https://aethyx.space",
  "https://www.aethyx.space",
  "http://localhost:8080",
  "http://localhost:5173",
];

const SITE_URL = "https://aethyx.space";
const INTAKE_URL = `${SITE_URL}/intake`;
const COOKIE_NAME = "aethyx_ref";
const COOKIE_MAX_AGE = 2592000; // 30 days

const getCors = (origin: string | null) => {
  const ok = origin && allowedOrigins.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin! : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
};

// Best-effort sliding-window rate limit. This is PER ISOLATE and per instance:
// Supabase may run several isolates concurrently and recycles them freely, so
// this is a speed bump against casual enumeration, not a hard guarantee. Real
// enforcement would need a shared store (Postgres/Redis) or an edge WAF rule.
const RATE_LIMIT = 30; // requests
const RATE_WINDOW_MS = 60_000; // per minute per IP
const hits = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Opportunistic cleanup so the map cannot grow without bound.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
    }
  }
  return recent.length > RATE_LIMIT;
}

function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

function redirect(to: string, cors: Record<string, string>, cookieCode?: string) {
  const headers: Record<string, string> = {
    ...cors,
    Location: to,
    "Cache-Control": "no-store",
  };
  if (cookieCode) {
    headers["Set-Cookie"] =
      `${COOKIE_NAME}=${cookieCode}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
  }
  return new Response(null, { status: 302, headers });
}

Deno.serve(async (req: Request) => {
  const cors = getCors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // Any failure path lands on the bare intake form with no cookie, so an
  // attacker cannot distinguish "no such code" from "rate limited" from "error".
  try {
    if (req.method !== "GET") return redirect(INTAKE_URL, cors);
    if (rateLimited(clientIp(req))) return redirect(INTAKE_URL, cors);

    const raw = new URL(req.url).searchParams.get("code") || "";
    const code = raw.trim().toLowerCase();
    if (!code || code.length > 32 || !/^[a-z0-9-]+$/.test(code)) {
      return redirect(INTAKE_URL, cors);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Select ONLY the code. Nothing else about the applicant leaves this function.
    const { data, error } = await admin
      .from("bounty_applicants")
      .select("code")
      .ilike("code", code)
      .eq("status", "approved")
      .maybeSingle();

    if (error || !data?.code) return redirect(INTAKE_URL, cors);

    const canonical = String(data.code);
    return redirect(`${INTAKE_URL}?ref=${encodeURIComponent(canonical)}`, cors, canonical);
  } catch (err) {
    // Log the error class only — never the code, IP, or any applicant field.
    console.error("[resolve-referral] failure:", err instanceof Error ? err.name : "Unknown");
    return redirect(INTAKE_URL, cors);
  }
});
