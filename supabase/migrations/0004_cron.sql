-- ============================================================================
-- 0004_cron.sql
-- TD's Only League — ESPN sync job scheduling via pg_cron + pg_net
--
-- WHAT THIS DOES
-- ----------------------------------------------------------------------------
-- Schedules four periodic HTTP POSTs (via pg_net) to the Edge Functions in
-- supabase/functions/, on the intervals the sync spec calls for:
--   sync-players  every 20 minutes  (roster + injury-status refresh)
--   sync-schedule every 30 minutes  (first_kickoff_at + bye weeks)
--   sync-scores   every 10 minutes  ("every 5 min on game days" is nicer,
--                                    but a single simple interval is easier
--                                    to operate; tighten later if desired)
--   apply-locks   every 5 minutes   (auto-lock rosters at kickoff)
--
-- BEFORE YOU RUN THIS — fill in two placeholders below
-- ----------------------------------------------------------------------------
-- 1. <PROJECT_REF> — your Supabase project ref (Studio -> Project Settings
--    -> General -> Reference ID), used to build the Edge Function URL:
--      https://<PROJECT_REF>.supabase.co/functions/v1/<function-name>
-- 2. <SERVICE_ROLE_KEY> — your project's service_role key (Studio ->
--    Project Settings -> API -> service_role secret). This is sent as a
--    Bearer token so the request passes Edge Functions' JWT check AND so
--    the function itself has the service-role env vars it needs — the key
--    used here is unrelated to (does not set) the function's own
--    SUPABASE_SERVICE_ROLE_KEY secret; that's set separately via
--    `supabase secrets set` (see supabase/functions/README.md).
--
-- These are SECRETS. Do not commit a filled-in copy of this file. The
-- recommended flow is: paste this file into the Supabase Studio SQL
-- editor, hand-edit the two placeholders there (not in git), and run it
-- once. Re-running is safe (see idempotency note below).
--
-- If pg_cron/pg_net are fiddly on your plan (they need to be enabled as
-- extensions, and some plans/tiers restrict pg_cron), the SIMPLER
-- ALTERNATIVE is the Supabase Dashboard's own Edge Functions scheduler:
--   Studio -> Edge Functions -> select a function -> "Cron" tab -> set an
--   interval (e.g. "*/20 * * * *"). No SQL required, no secrets pasted
--   into the SQL editor, and Supabase manages the auth token for you. This
--   file is here for teams who prefer everything as reviewable/rerunnable
--   SQL, or whose plan doesn't expose the dashboard scheduler.
-- ============================================================================

-- Required extensions (available on Supabase; safe if already enabled).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ----------------------------------------------------------------------------
-- Idempotency: unschedule any previously-scheduled jobs with these names
-- before re-scheduling, so re-running this file after editing an interval
-- doesn't leave duplicate jobs behind.
-- ----------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname in (
    'tdsonly-sync-players',
    'tdsonly-sync-schedule',
    'tdsonly-sync-scores',
    'tdsonly-apply-locks'
  );
exception
  when others then
    -- cron.job may not exist yet on a totally fresh project; ignore.
    null;
end $$;

-- ----------------------------------------------------------------------------
-- sync-players — every 20 minutes
-- ----------------------------------------------------------------------------
select cron.schedule(
  'tdsonly-sync-players',
  '*/20 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-players',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ----------------------------------------------------------------------------
-- sync-schedule — every 30 minutes
-- ----------------------------------------------------------------------------
select cron.schedule(
  'tdsonly-sync-schedule',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-schedule',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ----------------------------------------------------------------------------
-- sync-scores — every 10 minutes (simple; tighten to */5 on game days if desired)
-- ----------------------------------------------------------------------------
select cron.schedule(
  'tdsonly-sync-scores',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-scores',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ----------------------------------------------------------------------------
-- apply-locks — every 5 minutes
-- ----------------------------------------------------------------------------
select cron.schedule(
  'tdsonly-apply-locks',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/apply-locks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ----------------------------------------------------------------------------
-- Verify: list scheduled jobs.
-- ----------------------------------------------------------------------------
-- select jobname, schedule, active from cron.job where jobname like 'tdsonly-%';
--
-- To check recent run results:
-- select jobname, status, return_message, start_time
-- from cron.job_run_details jrd
-- join cron.job j on j.jobid = jrd.jobid
-- where j.jobname like 'tdsonly-%'
-- order by start_time desc
-- limit 20;
