-- ============================================================================
-- 0003_rls.sql
-- TD's Only League — Row Level Security
--
-- Run this ENTIRE file in one paste into the Supabase Studio SQL editor,
-- AFTER 0001_core.sql and 0002_functions.sql have been run.
--
-- General shape:
--   - Every authenticated user can SELECT everything (private 8-manager
--     league; no need to hide data between managers).
--   - Only commissioners (is_commissioner via public.is_commissioner()) can
--     write stages / players / draft_order / player_stage_stats /
--     weekly_results / sync_log. The service_role key (used by Supabase
--     Edge Functions for ESPN sync jobs) bypasses RLS entirely, so sync
--     jobs don't need a commissioner-flagged user.
--   - roster_picks: a manager can insert/delete only their OWN picks, and
--     only while the stage is in 'draft_open'. Commissioners can
--     insert/update/delete any roster_picks in any stage status (for
--     post-lock manual corrections).
--   - profiles: everyone can SELECT; a user can update their own
--     display_name; commissioners can update anyone's profile (to toggle
--     is_player / manager_slot / is_commissioner).
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.stages enable row level security;
alter table public.players enable row level security;
alter table public.draft_order enable row level security;
alter table public.roster_picks enable row level security;
alter table public.player_stage_stats enable row level security;
alter table public.weekly_results enable row level security;
alter table public.sync_log enable row level security;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- A user may update their own display_name (and only their own row).
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Commissioners may update anyone's profile (is_player / manager_slot /
-- is_commissioner toggles).
drop policy if exists "profiles_update_commissioner" on public.profiles;
create policy "profiles_update_commissioner"
  on public.profiles for update
  to authenticated
  using (public.is_commissioner(auth.uid()))
  with check (public.is_commissioner(auth.uid()));

-- No client-side insert/delete policy: profiles rows are created only by
-- the handle_new_user() trigger (security definer) and deleted only via
-- the auth.users cascade.

-- ----------------------------------------------------------------------------
-- stages
-- ----------------------------------------------------------------------------
drop policy if exists "stages_select_authenticated" on public.stages;
create policy "stages_select_authenticated"
  on public.stages for select
  to authenticated
  using (true);

drop policy if exists "stages_write_commissioner" on public.stages;
create policy "stages_write_commissioner"
  on public.stages for all
  to authenticated
  using (public.is_commissioner(auth.uid()))
  with check (public.is_commissioner(auth.uid()));

-- ----------------------------------------------------------------------------
-- players
-- ----------------------------------------------------------------------------
drop policy if exists "players_select_authenticated" on public.players;
create policy "players_select_authenticated"
  on public.players for select
  to authenticated
  using (true);

drop policy if exists "players_write_commissioner" on public.players;
create policy "players_write_commissioner"
  on public.players for all
  to authenticated
  using (public.is_commissioner(auth.uid()))
  with check (public.is_commissioner(auth.uid()));

-- ----------------------------------------------------------------------------
-- draft_order
-- ----------------------------------------------------------------------------
drop policy if exists "draft_order_select_authenticated" on public.draft_order;
create policy "draft_order_select_authenticated"
  on public.draft_order for select
  to authenticated
  using (true);

drop policy if exists "draft_order_write_commissioner" on public.draft_order;
create policy "draft_order_write_commissioner"
  on public.draft_order for all
  to authenticated
  using (public.is_commissioner(auth.uid()))
  with check (public.is_commissioner(auth.uid()));

-- ----------------------------------------------------------------------------
-- roster_picks
-- ----------------------------------------------------------------------------
drop policy if exists "roster_picks_select_authenticated" on public.roster_picks;
create policy "roster_picks_select_authenticated"
  on public.roster_picks for select
  to authenticated
  using (true);

-- A manager may insert their own picks only while the stage's draft is
-- open. (enforce_roster_limits() trigger still applies on top of this.)
drop policy if exists "roster_picks_insert_own_while_open" on public.roster_picks;
create policy "roster_picks_insert_own_while_open"
  on public.roster_picks for insert
  to authenticated
  with check (
    manager_id = auth.uid()
    and exists (
      select 1 from public.stages
      where stages.id = roster_picks.stage_id
        and stages.status = 'draft_open'
    )
  );

-- A manager may delete their own picks only while the stage's draft is
-- open (e.g. undoing a mis-click before the draft locks).
drop policy if exists "roster_picks_delete_own_while_open" on public.roster_picks;
create policy "roster_picks_delete_own_while_open"
  on public.roster_picks for delete
  to authenticated
  using (
    manager_id = auth.uid()
    and exists (
      select 1 from public.stages
      where stages.id = roster_picks.stage_id
        and stages.status = 'draft_open'
    )
  );

-- Commissioners may insert/update/delete any roster_picks row in any
-- stage status (post-lock manual corrections).
drop policy if exists "roster_picks_all_commissioner" on public.roster_picks;
create policy "roster_picks_all_commissioner"
  on public.roster_picks for all
  to authenticated
  using (public.is_commissioner(auth.uid()))
  with check (public.is_commissioner(auth.uid()));

-- ----------------------------------------------------------------------------
-- player_stage_stats
-- ----------------------------------------------------------------------------
drop policy if exists "player_stage_stats_select_authenticated" on public.player_stage_stats;
create policy "player_stage_stats_select_authenticated"
  on public.player_stage_stats for select
  to authenticated
  using (true);

drop policy if exists "player_stage_stats_write_commissioner" on public.player_stage_stats;
create policy "player_stage_stats_write_commissioner"
  on public.player_stage_stats for all
  to authenticated
  using (public.is_commissioner(auth.uid()))
  with check (public.is_commissioner(auth.uid()));

-- ----------------------------------------------------------------------------
-- weekly_results
-- ----------------------------------------------------------------------------
drop policy if exists "weekly_results_select_authenticated" on public.weekly_results;
create policy "weekly_results_select_authenticated"
  on public.weekly_results for select
  to authenticated
  using (true);

drop policy if exists "weekly_results_write_commissioner" on public.weekly_results;
create policy "weekly_results_write_commissioner"
  on public.weekly_results for all
  to authenticated
  using (public.is_commissioner(auth.uid()))
  with check (public.is_commissioner(auth.uid()));

-- ----------------------------------------------------------------------------
-- sync_log
-- ----------------------------------------------------------------------------
drop policy if exists "sync_log_select_authenticated" on public.sync_log;
create policy "sync_log_select_authenticated"
  on public.sync_log for select
  to authenticated
  using (true);

drop policy if exists "sync_log_write_commissioner" on public.sync_log;
create policy "sync_log_write_commissioner"
  on public.sync_log for all
  to authenticated
  using (public.is_commissioner(auth.uid()))
  with check (public.is_commissioner(auth.uid()));
