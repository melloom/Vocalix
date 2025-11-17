-- Scheduled Posts Cron Job Setup
-- This migration sets up a cron job to automatically publish scheduled clips
-- 
-- IMPORTANT: Replace YOUR_SERVICE_ROLE_KEY with your actual service role key
-- Get it from: Project Settings → API → service_role key

-- Step 1: Create the trigger function
CREATE OR REPLACE FUNCTION public.trigger_publish_scheduled_clips()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT := 'https://xgblxtopsapvacyaurcr.supabase.co';
  service_role_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnYmx4dG9wc2FwdmFjeWF1cmNyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjc3ODQ0MSwiZXhwIjoyMDc4MzU0NDQxfQ.B4lj7MgyqjvKCbWXWawV4KS92Syw6SZsEpWHaGXmFEw';
  request_id BIGINT;
BEGIN
  -- Call the publish-scheduled-clips edge function using pg_net
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/publish-scheduled-clips',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  ) INTO request_id;
  
  RAISE NOTICE 'Triggered publish-scheduled-clips, request_id: %', request_id;
    
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to trigger publish-scheduled-clips: %', SQLERRM;
END;
$$;

-- Step 2: Grant permissions
GRANT EXECUTE ON FUNCTION public.trigger_publish_scheduled_clips() TO postgres;

-- Step 3: Schedule the cron job (runs every 5 minutes)
-- This will only work if pg_cron extension is enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule if already exists
    PERFORM cron.unschedule('publish-scheduled-clips') 
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'publish-scheduled-clips'
    );
    
    -- Schedule the job to run every 5 minutes
    PERFORM cron.schedule(
      'publish-scheduled-clips',           -- Job name
      '*/5 * * * *',                       -- Schedule: Every 5 minutes
      'SELECT public.trigger_publish_scheduled_clips()'
    );
    
    RAISE NOTICE '✅ Cron job "publish-scheduled-clips" scheduled successfully!';
    RAISE NOTICE '   It will run every 5 minutes';
  ELSE
    RAISE WARNING '❌ pg_cron extension not found. Please enable it first in Database → Extensions';
    RAISE NOTICE 'To enable: Go to Database → Extensions → Enable "pg_cron"';
    RAISE NOTICE 'Then update this function with your actual Supabase URL and service role key';
    RAISE NOTICE 'And run this migration again or manually schedule the job.';
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
WHERE jobname = 'publish-scheduled-clips';

-- If you see a row above, the cron job is set up correctly! ✅

-- Alternative: Manual cron job setup (RECOMMENDED - Easier)
-- Instead of using this migration, you can set up the cron job directly in Supabase Dashboard:
-- 1. Go to Database → Cron Jobs
-- 2. Click "New Cron Job"
-- 3. Name: publish-scheduled-clips
-- 4. Schedule: */5 * * * *  (every 5 minutes)
-- 5. Command: 
--    SELECT net.http_post(
--      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/publish-scheduled-clips',
--      headers := jsonb_build_object(
--        'Content-Type', 'application/json',
--        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
--      ),
--      body := '{}'::jsonb
--    );

COMMENT ON FUNCTION public.trigger_publish_scheduled_clips() IS 
'Triggers the publish-scheduled-clips edge function to publish scheduled clips. Scheduled via pg_cron to run every 5 minutes.';

