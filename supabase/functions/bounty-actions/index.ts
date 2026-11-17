// Admin-only: bounty applicant actions (approval + approval email).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { getCors } from "../_shared/admin-cors.ts";

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const CODE_PATTERN = /^[a-z0-9-]+$/;

Deno.serve(async (req: Request) => {
  const cors = getCors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(token);
    if (!userData.user) return json({ error: "Auth required" }, 401, cors);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Admin only" }, 403, cors);

    const body = await req.json();
    const action = String(body.action || "");
    const applicantId = String(body.applicantId || "");
    if (!applicantId) return json({ error: "applicantId required" }, 400, cors);

    if (action === "approve_applicant") {
      const { data: applicant, error: fetchErr } = await admin
        .from("bounty_applicants")
        .select("id, full_name, status, code")
        .eq("id", applicantId)
        .maybeSingle();
      if (fetchErr || !applicant) return json({ error: "Applicant not found" }, 404, cors);

      const rawCustom = body.customCode == null ? "" : String(body.customCode).trim().toLowerCase();
      if (rawCustom && (rawCustom.length < 3 || rawCustom.length > 32 || !CODE_PATTERN.test(rawCustom))) {
        return json({ error: "Code must be 3-32 lowercase letters, numbers or hyphens" }, 400, cors);
      }

      const { error: statusErr } = await admin
        .from("bounty_applicants")
        .update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
          reviewed_by: userData.user.id,
          // activated_at intentionally left NULL - activation is a separate gated step.
        })
        .eq("id", applicantId);
      if (statusErr) return json({ error: statusErr.message }, 500, cors);

      // Code allocation lives in Postgres (public.allocate_bounty_code) so the
      // admin approval path and the client auto-enrol trigger cannot drift apart
      // on code shape, the reserved-word list, or collision handling.
      const { data: code, error: codeErr } = await admin.rpc("allocate_bounty_code", {
        p_applicant_id: applicantId,
        p_custom: rawCustom || null,
      });

      if (codeErr) {
        const msg = String(codeErr.message || "");
        if (msg.includes("code reserved")) return json({ error: "That code is reserved" }, 400, cors);
        if (msg.includes("invalid code format")) return json({ error: "Invalid code format" }, 400, cors);
        if (msg.includes("duplicate key")) return json({ error: "That code is already taken" }, 409, cors);
        console.error("[bounty-actions] allocate_bounty_code failed", codeErr);
        return json({ error: "Could not allocate a referral code" }, 500, cors);
      }
      return json({ code }, 200, cors);
    }

    if (action === "send_approval_email") {
      const { data: applicant, error: fetchErr } = await admin
        .from("bounty_applicants")
        .select("*")
        .eq("id", applicantId)
        .maybeSingle();
      if (fetchErr || !applicant) return json({ error: "Applicant not found" }, 404, cors);
      if (applicant.status !== "approved" || !applicant.code) {
        return json({ error: "Applicant is not approved yet" }, 400, cors);
      }

      const inv = await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "bounty-approved",
          recipientEmail: applicant.email,
          idempotencyKey: `bounty-approved-${applicantId}-${Date.now()}`,
          templateData: {
            firstName: applicant.full_name?.split(" ")[0] || "",
            // Memorable vanity link (/r/kmitchell), not the raw query-param form.
            // /r/:code resolves server-side and sets the attribution cookie.
            referralUrl: `https://aethyx.space/r/${applicant.code}`,
          },
        },
      });
      if (inv.error) return json({ error: inv.error.message }, 500, cors);
      return json({ success: true }, 200, cors);
    }

    return json({ error: "Unknown action" }, 400, cors);
  } catch (err) {
    console.error("[bounty-actions]", err);
    return json({ error: err instanceof Error ? err.message : "Unknown" }, 500, cors);
  }
});
