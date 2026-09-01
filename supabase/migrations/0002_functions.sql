-- ============================================================================
-- 0002_functions.sql
-- TD's Only League — functions & triggers
--
-- Run this ENTIRE file in one paste into the Supabase Studio SQL editor,
-- AFTER 0001_core.sql has been run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- is_commissioner(uid)
-- security definer helper used by RLS policies (0003_rls.sql) so policies
-- can check "is this user a commissioner" without each user needing SELECT
-- access to other people's profiles rows via a policy-recursive subquery.
-- ----------------------------------------------------------------------------
create or replace function public.is_commissioner(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select is_commissioner from public.profiles where id = uid),
    false
  );
$$;

comment on function public.is_commissioner is
  'Security-definer helper for RLS policies: true if uid belongs to a commissioner profile.';

-- ----------------------------------------------------------------------------
-- handle_new_user()
-- Fires after a row is inserted into auth.users (i.e. on signup). Creates
-- the matching profiles row, and implements the "auto-first-8-players"
-- rule: the first 8 non-commissioner signups automatically get a
-- manager_slot (1..8) and is_player = true. Everyone defaults to
-- is_commissioner = false — commissioner accounts are flagged manually by
-- an existing commissioner afterwards (via a later admin UI, or directly
-- in Supabase Studio: update profiles set is_commissioner = true ...).
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_slot smallint;
  taken_slots smallint;
  chosen_name text;
begin
  chosen_name := coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.email
  );

  insert into public.profiles (id, display_name, email, is_commissioner, is_player)
  values (new.id, chosen_name, new.email, false, false)
  on conflict (id) do nothing;

  -- Auto-assign the lowest free manager_slot (1..8) if fewer than 8
  -- profiles currently hold one. New accounts default to
  -- is_commissioner = false, so this always applies to fresh signups.
  select count(*) into taken_slots
  from public.profiles
  where manager_slot is not null;

  if taken_slots < 8 then
    select min(s.slot) into next_slot
    from generate_series(1, 8) as s(slot)
    where s.slot not in (
      select manager_slot from public.profiles where manager_slot is not null
    );

    if next_slot is not null then
      update public.profiles
      set manager_slot = next_slot,
          is_player = true
      where id = new.id;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user is
  'On auth.users insert: creates the profiles row and auto-assigns manager_slot 1..8 (is_player=true) to the first 8 signups.';

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- enforce_roster_limits()
-- Before a roster_picks insert, counts the manager's existing picks in
-- that stage for the incoming slot_position and rejects the insert if it
-- would exceed the league roster shape (QB 1 / RB 2 / WR 2 / TE 1) or the
-- 6-player total. Mirrors src/lib/roster.ts ROSTER_SHAPE — keep in sync.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_roster_limits()
returns trigger
language plpgsql
as $$
declare
  position_cap smallint;
  position_count int;
  total_count int;
begin
  position_cap := case new.slot_position
    when 'QB' then 1
    when 'RB' then 2
    when 'WR' then 2
    when 'TE' then 1
    else null
  end;

  if position_cap is null then
    raise exception 'Unknown slot_position %', new.slot_position;
  end if;

  select count(*) into position_count
  from public.roster_picks
  where stage_id = new.stage_id
    and manager_id = new.manager_id
    and slot_position = new.slot_position;

  if position_count >= position_cap then
    raise exception
      'Roster limit exceeded: manager % already has % % pick(s) for stage % (cap %)',
      new.manager_id, position_count, new.slot_position, new.stage_id, position_cap;
  end if;

  select count(*) into total_count
  from public.roster_picks
  where stage_id = new.stage_id
    and manager_id = new.manager_id;

  if total_count >= 6 then
    raise exception
      'Roster limit exceeded: manager % already holds 6 players for stage %',
      new.manager_id, new.stage_id;
  end if;

  return new;
end;
$$;

comment on function public.enforce_roster_limits is
  'BEFORE INSERT trigger on roster_picks enforcing QB1/RB2/WR2/TE1 per-position caps and a 6-player total, per manager per stage. Mirrors src/lib/roster.ts.';

drop trigger if exists roster_picks_enforce_limits on public.roster_picks;

create trigger roster_picks_enforce_limits
  before insert on public.roster_picks
  for each row execute function public.enforce_roster_limits();
