# resolve-referral

Public, unauthenticated resolver for memorable referral links.

## Redirect contract

`GET /resolve-referral?code=<code>`

| Case | Response |
| --- | --- |
| `code` matches a `bounty_applicants` row with `status = 'approved'` (case-insensitive) | `302` → `https://aethyx.space/intake?ref=<canonical code>` + attribution cookie |
| No match, missing/invalid `code`, non-GET, rate limited, or internal error | `302` → `https://aethyx.space/intake` with **no** cookie |

Failure paths are indistinguishable by design — the endpoint never reveals whether a
code exists. Codes belonging to `suspended`, `terminated`, `declined`, `rejected`,
`pending`, `under_review`, `more_info_requested`, or `withdrawn` applicants are treated
as no-match.

Accepted `code` shape: `^[a-z0-9-]+$`, max 32 chars, matched case-insensitively.
The redirect always uses the **canonical** casing stored in the database.

## Cookie

```
aethyx_ref=<canonical code>; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax
```

30-day attribution window. The cookie carries the referral code only — no applicant
id, email, name, or status is ever returned or logged.

## Rate limiting

Best-effort in-memory sliding window: 30 requests per IP per minute. This is
**per isolate**, so it is a speed bump against casual enumeration rather than a hard
guarantee. Harden with a shared store or an edge WAF rule if abuse appears.

## Deploy

```sh
supabase functions deploy resolve-referral --project-ref jsdjcizqwwmtuhfnkvqq --no-verify-jwt
```

`--no-verify-jwt` is required: the endpoint is reached by anonymous visitors clicking a
referral link. It uses the service-role key internally and exposes no privileged data.
