-- Leads captured from the clearbounddigital.com contact form.
-- Written to by the server only (service role key), never by the browser.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text not null,
  company text,
  message text,
  source_page text,
  utm jsonb,
  ip_hash text,
  user_agent text,
  status text not null default 'new',
  notified_email boolean not null default false,
  notified_push boolean not null default false,
  autoreply_sent boolean not null default false
);

comment on table public.leads is 'Leads submitted through the clearbounddigital.com contact form.';
comment on column public.leads.ip_hash is 'SHA-256 hash of the submitting IP address, never the raw IP.';
comment on column public.leads.utm is 'Whatever utm_* query params were present at submission time, as a JSON object.';

-- Keep the per-IP rate-limit query (count leads for an ip_hash in the last hour) fast.
create index if not exists leads_ip_hash_created_at_idx on public.leads (ip_hash, created_at);

-- Row Level Security is enabled with NO policies: anon/authenticated clients get zero
-- access. Only the server, using the service role key (which bypasses RLS entirely),
-- can read or write this table.
alter table public.leads enable row level security;
