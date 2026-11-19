# Lead pipeline

How a submission on the homepage contact form (`#lead-form`) is handled, end to end.

## Flow

1. **Client-side**: `index.html` posts JSON to `/api/lead`, including a hidden
   honeypot field (`website`), a render timestamp (`formRenderedAt`), the page
   path (`sourcePage`), and any `utm_*` query params present on the page.
2. **`api/lead.js`** (Vercel serverless function):
   - Validates `name`, `phone`, `email` are present, email looks valid, and
     nothing exceeds a sane length. Real validation failures are shown to the
     visitor.
   - Spam checks — honeypot filled, submitted in under 3 seconds, or more than
     5 submissions from the same IP in the last hour. Any of these return a
     normal-looking success response with nothing saved or sent, so bots get
     no signal that they were caught.
   - Inserts the lead into Supabase (`leads` table) using the service role
     key. **This is the only step that can show the visitor an error** — if
     the insert fails, nothing else runs and the visitor sees a message
     asking them to call directly.
   - Once saved, three notifications run independently via `Promise.allSettled`:
     an internal alert email (Resend), an optional Pushover push, and an
     auto-reply email to the lead (Resend). Each failure is logged
     (`console.error`, visible in Vercel's function logs) and recorded on the
     row (`notified_email` / `notified_push` / `autoreply_sent`), but never
     blocks the visitor's success response.

## Database

Table: `public.leads`, created by
`supabase/migrations/20261119150000_create_leads_table.sql`.

Row Level Security is **on** with **no policies**, so `anon`/`authenticated`
clients have zero access. Only the server, using the service role key (which
bypasses RLS), can read or write.

`ip_hash` is a plain SHA-256 of the submitting IP — never the raw address.
`utm` is a `jsonb` object holding whatever `utm_*` params were present, or
`null`. The "What do you need?" dropdown on the form isn't a separate column;
its value is prepended to `message` as `Need: …`.

## Environment variables

See `.env.example`. Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`RESEND_API_KEY`, `LEAD_ALERT_EMAIL`. Optional: `BOOKING_URL`,
`PUSHOVER_USER_KEY` + `PUSHOVER_APP_TOKEN` (both must be set or push is
skipped).

`LEAD_ALERT_EMAIL` does double duty: it's where the internal "New lead: …"
alert goes, and it's the verified-domain address the auto-reply is sent
*from*. It needs to be a mailbox on a domain verified in Resend.

## Setup checklist

1. **Supabase**: create (or reuse) a project. Run the SQL in
   `supabase/migrations/20261119150000_create_leads_table.sql` — either via
   `supabase db push` if the project is linked locally, or by pasting it into
   the Supabase SQL Editor. Grab the project's `SUPABASE_URL` and the
   **service role** key (Project Settings → API — not the anon/public key).
2. **Resend**: create an account, add `clearbounddigital.com` as a domain
   (Domains → Add Domain), and add the DNS records it gives you (SPF/DKIM
   `TXT` records, typically a `send` subdomain) wherever the domain's DNS is
   managed. Wait for it to show "Verified" before sending — unverified
   domains will fail every send. Create an API key (`RESEND_API_KEY`).
3. **Pushover** (optional): you already have a Pushover account/app set up
   from a previous project — you can reuse those credentials or create a new
   Application in the Pushover dashboard specifically for Clearbound leads
   (gives it its own name/icon in notifications) and use that app's token.
4. **Set env vars** — from the project root, for each of Preview and
   Production:
   ```
   vercel env add SUPABASE_URL
   vercel env add SUPABASE_SERVICE_ROLE_KEY
   vercel env add RESEND_API_KEY
   vercel env add LEAD_ALERT_EMAIL
   vercel env add BOOKING_URL          # optional
   vercel env add PUSHOVER_USER_KEY    # optional
   vercel env add PUSHOVER_APP_TOKEN   # optional
   ```
   Each prompts for which environment(s) and then for the value — paste it
   in directly, nothing is typed by an agent.
5. Deploy the preview, submit a real test lead on it, and confirm: the row
   lands in Supabase `leads`, the alert email arrives, and the auto-reply
   arrives — before merging to `main`.
