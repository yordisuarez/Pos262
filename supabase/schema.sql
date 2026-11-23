-- Pos 262 (Comercial 262 Suárez) — Supabase Cloud Sync Schema
-- Run this SQL in your Supabase SQL Editor to create the tables and Row Level Security policies.

create table if not exists public.business_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  business_name text not null default 'Comercial',
  rif text not null default '',
  phone text not null default '',
  address text not null default '',
  exchange_rate numeric(12, 4) not null default 64.50,
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null,
  record_id text not null,
  payload jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, entity_type, record_id)
);

create index if not exists idx_sync_records_user_updated
  on public.sync_records (user_id, updated_at desc);

alter table public.business_settings enable row level security;
alter table public.sync_records enable row level security;

drop policy if exists "business_settings_owner_all" on public.business_settings;
create policy "business_settings_owner_all"
  on public.business_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "sync_records_owner_all" on public.sync_records;
create policy "sync_records_owner_all"
  on public.sync_records
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Subscriptions table (authenticated users can read their own row and auto-create their initial 7-day trial)
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'trial',
  status text not null default 'active',
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_owner_select" on public.subscriptions;
create policy "subscriptions_owner_select"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);

drop policy if exists "subscriptions_owner_insert_trial" on public.subscriptions;
create policy "subscriptions_owner_insert_trial"
  on public.subscriptions
  for insert
  with check (
    auth.uid() = user_id
    and plan = 'trial'
    and status = 'active'
    and expires_at <= now() + interval '7 days 5 minutes'
  );


