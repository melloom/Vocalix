-- Daily Digest Cron Job Setup
-- Run this in Supabase Dashboard → SQL Editor
-- 
-- IMPORTANT: Replace YOUR_SERVICE_ROLE_KEY with your actual service role key
-- Get it from: Project Settings → API → service_role key

-- Step 1: Create the trigger function
CREATE OR REPLACE FUNCTION public.trigger_daily_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT := 'https://xgblxtopsapvacyaurcr.supabase.co';
  service_role_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnYmx4dG9wc2FwdmFjeWF1cmNyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjc3ODQ0MSwiZXhwIjoyMDc4MzU0NDQxfQ.B4lj7MgyqjvKCbWXWawV4KS92Syw6SZsEpWHaGXmFEw';
  request_id BIGINT;
BEGIN
  -- Call the daily-digest edge function using pg_net
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  ) INTO request_id;
  
  RAISE NOTICE 'Triggered daily digest, request_id: %', request_id;
    
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to trigger daily digest: %', SQLERRM;
END;
$$;

-- Step 2: Grant permissions
GRANT EXECUTE ON FUNCTION public.trigger_daily_digest() TO postgres;

-- Step 3: Schedule the cron job (runs daily at 9 AM UTC)
-- This will only work if pg_cron extension is enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule if already exists
    PERFORM cron.unschedule('daily-digest') 
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'daily-digest'
    );
    
    -- Schedule the job
    PERFORM cron.schedule(
      'daily-digest',           -- Job name
      '0 9 * * *',              -- Schedule: 9 AM UTC daily (minute hour day month weekday)
      'SELECT public.trigger_daily_digest()'
    );
    
    RAISE NOTICE '✅ Cron job "daily-digest" scheduled successfully!';
    RAISE NOTICE '   It will run daily at 9 AM UTC';
  ELSE
    RAISE EXCEPTION '❌ pg_cron extension not found. Please enable it first in Database → Extensions';
  END IF;
END $$;

-- Verify the cron job was created
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job 
WHERE jobname = 'daily-digest';

-- If you see a row above, the cron job is set up correctly! ✅

