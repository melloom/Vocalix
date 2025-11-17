-- Setup cron job for daily digest
-- This requires the pg_cron extension to be enabled in Supabase

-- Note: pg_cron is available in Supabase but must be enabled via Dashboard
-- Go to: Database → Extensions → Enable "pg_cron"

-- Create a function that calls the daily-digest edge function
-- This will be scheduled via pg_cron
-- IMPORTANT: You need to replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY with actual values
-- Or better: Use Supabase Dashboard → Database → Cron Jobs to set this up visually

CREATE OR REPLACE FUNCTION public.trigger_daily_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
  request_id BIGINT;
BEGIN
  -- IMPORTANT: Replace these with your actual values
  -- Get these from: Supabase Dashboard → Project Settings → API
  supabase_url := 'https://YOUR_PROJECT_REF.supabase.co';  -- REPLACE THIS
  service_role_key := 'YOUR_SERVICE_ROLE_KEY';  -- REPLACE THIS (keep secret!)
  
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.trigger_daily_digest() TO postgres;

-- Schedule the cron job (if pg_cron is enabled)
-- This will run daily at 9 AM UTC
-- Note: You may need to run this manually in Supabase SQL Editor
-- after enabling pg_cron extension and updating the function above

DO $$
BEGIN
  -- Check if pg_cron extension exists
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Unschedule if already exists
    PERFORM cron.unschedule('daily-digest') WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'daily-digest'
    );
    
    -- Schedule daily digest at 9 AM UTC
    PERFORM cron.schedule(
      'daily-digest',
      '0 9 * * *',  -- 9 AM UTC daily (cron format: minute hour day month weekday)
      'SELECT public.trigger_daily_digest()'
    );
    
    RAISE NOTICE 'Cron job "daily-digest" scheduled successfully for 9 AM UTC daily';
  ELSE
    RAISE WARNING 'pg_cron extension not found. Please enable it in Supabase Dashboard first.';
    RAISE NOTICE 'To enable: Go to Database → Extensions → Enable "pg_cron"';
    RAISE NOTICE 'Then update this function with your actual Supabase URL and service role key';
    RAISE NOTICE 'And run this migration again or manually schedule the job.';
  END IF;
END $$;

-- Alternative: Manual cron job setup (RECOMMENDED - Easier)
-- Instead of using this migration, you can set up the cron job directly in Supabase Dashboard:
-- 1. Go to Database → Cron Jobs
-- 2. Click "New Cron Job"
-- 3. Name: daily-digest
-- 4. Schedule: 0 9 * * *
-- 5. Command: 
--    SELECT net.http_post(
--      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-digest',
--      headers := jsonb_build_object(
--        'Content-Type', 'application/json',
--        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
--      ),
--      body := '{}'::jsonb
--    );

COMMENT ON FUNCTION public.trigger_daily_digest() IS 
'Triggers the daily-digest edge function to send email digests to users. Scheduled via pg_cron to run daily at 9 AM UTC.';
