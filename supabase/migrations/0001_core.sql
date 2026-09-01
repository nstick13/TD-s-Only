-- ============================================================================
-- 0001_core.sql
-- TD's Only League — core schema (tables, indexes, seed data)
--
-- Run this ENTIRE file in one paste into the Supabase Studio SQL editor.
-- Run 0001, then 0002, then 0003, each as a single paste-and-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles
-- One row per authenticated user. Populated automatically by the
-- handle_new_user() trigger defined in 0002_functions.sql when a new
-- auth.users row is created — you should not need to insert here directly.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text,
  is_commissioner boolean not null default false,
  is_player boolean not null default false,
  -- 1..8 seat in the league. Null if this account is not (yet) a roster
  -- manager (e.g. a commissioner-only account, or the 9th+ signup).
  manager_slot smallint unique check (manager_slot between 1 and 8),
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per authenticated user. is_commissioner/is_player/manager_slot drive the roles model — see docs/ARCHITECTURE.md.';

-- ----------------------------------------------------------------------------
-- stages
-- Every draftable stage of the season: Weeks 1-18, then the four postseason
-- rounds. Seeded below to match the legacy prototype's SEASON_STAGES list.
-- The stages table is the single source of truth for stage listing/order —
-- never hardcode a stage list in application code.
-- ----------------------------------------------------------------------------
create table if not exists public.stages (
  id smallserial primary key,
  name text not null,
  -- Draft/display order, 1..22.
  ordinal smallint not null unique,
  -- ESPN's seasontype query param: 2 = regular season, 3 = postseason.
  espn_season_type smallint not null check (espn_season_type in (2, 3)),
  -- ESPN's week query param within that season type.
  espn_week_num smallint not null,
  status text not null default 'upcoming'
    check (status in ('upcoming', 'draft_open', 'locked', 'finalized')),
  first_kickoff_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.stages is
  'One row per draftable stage (18 regular-season weeks + 4 postseason rounds). status drives draft/roster-write RLS.';

-- ----------------------------------------------------------------------------
-- players
-- League-wide player pool, synced from ESPN's unofficial API. id is the
-- ESPN athlete id (kept as text since ESPN ids are not guaranteed numeric
-- in every endpoint response). Synced by Supabase Edge Functions
-- (supabase/functions/) — a later agent's responsibility, not this one.
-- ----------------------------------------------------------------------------
create table if not exists public.players (
  id text primary key,
  name text not null,
  position text not null check (position in ('QB', 'RB', 'WR', 'TE')),
  nfl_team text,
  nfl_team_id text,
  status text not null default 'Active',
  status_detail text,
  on_bye boolean not null default false,
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz
);

comment on table public.players is
  'League-wide player pool synced from ESPN. See sync_log for last-synced status ("loud staleness").';

create index if not exists players_position_idx on public.players (position);

-- ----------------------------------------------------------------------------
-- draft_order
-- Overall snake-draft pick order for a stage: 8 managers x 6 rounds = 48
-- picks. Order-generation logic (snake pairing, randomization, etc.) is a
-- later agent's responsibility — this table just stores the result.
-- ----------------------------------------------------------------------------
create table if not exists public.draft_order (
  stage_id smallint not null references public.stages (id) on delete cascade,
  pick_number smallint not null check (pick_number between 1 and 48),
  manager_id uuid references public.profiles (id) on delete set null,
  primary key (stage_id, pick_number)
);

comment on table public.draft_order is
  'Overall snake draft order per stage (48 picks = 8 managers x 6 rounds). Generation logic lives in a later feature agent.';

-- ----------------------------------------------------------------------------
-- roster_picks
-- The actual drafted roster: one row per player a manager holds in a
-- stage. Exclusivity (no player drafted twice league-wide in a stage) is
-- enforced by the unique constraint below; per-position roster caps (QB 1 /
-- RB 2 / WR 2 / TE 1, 6 total) are enforced by the
-- enforce_roster_limits() trigger in 0002_functions.sql.
-- ----------------------------------------------------------------------------
create table if not exists public.roster_picks (
  id uuid primary key default gen_random_uuid(),
  stage_id smallint not null references public.stages (id) on delete cascade,
  manager_id uuid not null references public.profiles (id) on delete cascade,
  player_id text not null references public.players (id) on delete restrict,
  slot_position text not null check (slot_position in ('QB', 'RB', 'WR', 'TE')),
  pick_number smallint,
  created_at timestamptz not null default now(),

  -- CRITICAL: exclusive player pool per stage — a player can only be on
  -- one manager's roster in a given stage, league-wide.
  constraint roster_picks_stage_player_unique unique (stage_id, player_id)
);

comment on table public.roster_picks is
  'Drafted rosters. unique(stage_id, player_id) enforces the exclusive league-wide player pool per stage; enforce_roster_limits() trigger enforces QB1/RB2/WR2/TE1 caps.';

create index if not exists roster_picks_stage_manager_idx
  on public.roster_picks (stage_id, manager_id);

-- ----------------------------------------------------------------------------
-- player_stage_stats
-- Raw TD counts per player per stage, synced from ESPN box scores. points
-- is a generated column so it can never drift from src/lib/scoring.ts's
-- constants (pass 0.5 / rush 1.0 / rec 1.0) — keep both in sync if the
-- league's scoring rules ever change.
-- ----------------------------------------------------------------------------
create table if not exists public.player_stage_stats (
  stage_id smallint not null references public.stages (id) on delete cascade,
  player_id text not null references public.players (id) on delete cascade,
  pass_td smallint not null default 0,
  rush_td smallint not null default 0,
  rec_td smallint not null default 0,
  points numeric(5, 1) generated always as
    (pass_td * 0.5 + rush_td * 1.0 + rec_td * 1.0) stored,
  updated_at timestamptz not null default now(),
  primary key (stage_id, player_id)
);

comment on table public.player_stage_stats is
  'Raw TD counts per player per stage. points is generated in-DB from the league scoring rule — keep in sync with src/lib/scoring.ts.';

-- ----------------------------------------------------------------------------
-- weekly_results
-- Computed per-manager totals for a stage (aggregated from roster_picks x
-- player_stage_stats by a later agent's scoring job). Stored (not a view)
-- so results can be "finalized" and ranked.
-- ----------------------------------------------------------------------------
create table if not exists public.weekly_results (
  stage_id smallint not null references public.stages (id) on delete cascade,
  manager_id uuid not null references public.profiles (id) on delete cascade,
  total_tds smallint not null default 0,
  total_points numeric(6, 1) not null default 0,
  qb_points numeric(6, 1) not null default 0,
  rb_points numeric(6, 1) not null default 0,
  wr_points numeric(6, 1) not null default 0,
  te_points numeric(6, 1) not null default 0,
  rank smallint,
  finalized_at timestamptz,
  primary key (stage_id, manager_id)
);

comment on table public.weekly_results is
  'Computed per-manager stage totals/standings. Written by a later agent''s scoring job, not computed live by the client.';

-- ----------------------------------------------------------------------------
-- sync_log
-- Append-only log of ESPN sync job runs. Backs the "loud staleness" UI
-- requirement — clients query the latest row per source and show
-- "last updated X ago" (or a warning) rather than silently trusting data.
-- ----------------------------------------------------------------------------
create table if not exists public.sync_log (
  id bigserial primary key,
  source text not null,
  status text not null check (status in ('success', 'error')),
  message text,
  player_count int,
  ran_at timestamptz not null default now()
);

comment on table public.sync_log is
  'Append-only ESPN sync run log. Query "select * from sync_log where source = ... order by ran_at desc limit 1" for last-updated / staleness UI.';

create index if not exists sync_log_source_ran_at_idx
  on public.sync_log (source, ran_at desc);

-- ----------------------------------------------------------------------------
-- Seed: the 22 stages, in draft/display order (ordinal 1..22).
-- Matches the legacy prototype's SEASON_STAGES: Weeks 1-18 (regular
-- season, espn_season_type = 2), then Wild Card / Divisional /
-- Conference Championships / Super Bowl (postseason, espn_season_type = 3,
-- espn_week_num 1/2/3/5 respectively — ESPN has no postseason week 4).
-- Safe to re-run: on conflict does nothing.
-- ----------------------------------------------------------------------------
insert into public.stages (name, ordinal, espn_season_type, espn_week_num)
values
  ('Week 1', 1, 2, 1),
  ('Week 2', 2, 2, 2),
  ('Week 3', 3, 2, 3),
  ('Week 4', 4, 2, 4),
  ('Week 5', 5, 2, 5),
  ('Week 6', 6, 2, 6),
  ('Week 7', 7, 2, 7),
  ('Week 8', 8, 2, 8),
  ('Week 9', 9, 2, 9),
  ('Week 10', 10, 2, 10),
  ('Week 11', 11, 2, 11),
  ('Week 12', 12, 2, 12),
  ('Week 13', 13, 2, 13),
  ('Week 14', 14, 2, 14),
  ('Week 15', 15, 2, 15),
  ('Week 16', 16, 2, 16),
  ('Week 17', 17, 2, 17),
  ('Week 18', 18, 2, 18),
  ('Wild Card Round', 19, 3, 1),
  ('Divisional Round', 20, 3, 2),
  ('Conference Championships', 21, 3, 3),
  ('Super Bowl', 22, 3, 5)
on conflict (ordinal) do nothing;
