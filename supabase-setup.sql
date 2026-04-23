-- ============================================================
-- Hackathon Draft — Supabase database setup
-- Run this in Supabase → SQL Editor → New Query → Paste → Run
-- ============================================================

-- Table 1: sessions (stores the pitches and voters for each draft)
create table if not exists sessions (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Table 2: claims (stores who claimed whom — this is where the race happens)
-- UNIQUE constraint on (session_id, voter_id) means a voter can only
-- be claimed ONCE per session. Second person to click gets a 23505 error.
create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references sessions(id) on delete cascade,
  voter_id text not null,
  pitch_id text not null,
  created_at timestamptz default now(),
  unique (session_id, voter_id)
);

-- Index for fast lookups
create index if not exists claims_session_idx on claims(session_id);

-- ============================================================
-- Enable Row Level Security but allow public access
-- (This is a short-lived hackathon tool; we're not storing secrets)
-- ============================================================
alter table sessions enable row level security;
alter table claims enable row level security;

-- Drop old policies if they exist (safe to re-run this script)
drop policy if exists "public read sessions" on sessions;
drop policy if exists "public write sessions" on sessions;
drop policy if exists "public read claims" on claims;
drop policy if exists "public write claims" on claims;
drop policy if exists "public delete claims" on claims;

create policy "public read sessions" on sessions for select using (true);
create policy "public write sessions" on sessions for insert with check (true);
create policy "public update sessions" on sessions for update using (true) with check (true);

create policy "public read claims" on claims for select using (true);
create policy "public write claims" on claims for insert with check (true);
create policy "public delete claims" on claims for delete using (true);

-- ============================================================
-- Enable real-time updates on the claims table
-- (This is what makes names disappear instantly on other screens)
-- ============================================================
alter publication supabase_realtime add table claims;
