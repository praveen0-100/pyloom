-- Run once in the Supabase SQL Editor for this project.
-- Backs the shared state (participants, progress, submissions, timer) that the
-- admin panel and participant console both read/write, so they stay in sync
-- across Vercel's stateless serverless instances.
create table if not exists public.kv_store (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh on every write.
create or replace function public.kv_store_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists kv_store_updated_at on public.kv_store;
create trigger kv_store_updated_at
  before update on public.kv_store
  for each row execute function public.kv_store_set_updated_at();

-- The backend talks to this table using the service_role key, which bypasses
-- RLS entirely, so RLS stays enabled with no public policies (the table is
-- unreachable via the anon/publishable key).
alter table public.kv_store enable row level security;
