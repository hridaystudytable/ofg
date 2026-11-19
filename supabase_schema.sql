-- ========================================================
-- Office Strike Database Schema
-- Run this in your Supabase SQL Editor:
-- Dashboard -> SQL Editor -> New Query -> Paste & Run
-- ========================================================

-- 1. Profiles / Player Leaderboard Table
create table if not exists public.players (
  id text primary key,
  name text not null,
  kills integer not null default 0,
  deaths integer not null default 0,
  score integer not null default 0,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 2. Match Kill Feed / Game Events Log Table
create table if not exists public.match_events (
  id bigint generated always as identity primary key,
  killer_id text not null,
  killer_name text not null,
  victim_id text not null,
  victim_name text not null,
  event_time timestamptz not null default now()
);

-- 3. Enable Row Level Security (RLS)
alter table public.players enable row level security;
alter table public.match_events enable row level security;

-- 4. Policies: Allow read access to all players
create policy "Allow public read players"
  on public.players for select
  using (true);

create policy "Allow public upsert players"
  on public.players for insert
  with check (true);

create policy "Allow public update players"
  on public.players for update
  using (true);

create policy "Allow public read match_events"
  on public.match_events for select
  using (true);

create policy "Allow public insert match_events"
  on public.match_events for insert
  with check (true);

-- 5. Enable Realtime Replication for match_events and players
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.match_events;
