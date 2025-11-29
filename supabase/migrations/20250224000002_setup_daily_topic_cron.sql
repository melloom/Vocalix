-- Setup Daily Topic Generation Cron Job
-- This ensures a new topic is generated every day automatically
-- Runs at 12:00 PM UTC (noon) daily to generate the topic for the current day

-- Step 1: Create function to trigger daily-topic edge function
CREATE OR REPLACE FUNCTION public.trigger_daily_topic()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
  request_id BIGINT;
BEGIN
  -- Get environment variables (set in Supabase Dashboard → Settings → Edge Functions)
  -- These should be set as secrets in Supabase
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- Fallback to hardcoded values if not set (replace with your actual values)
  IF supabase_url IS NULL THEN
    supabase_url := 'https://xgblxtopsapvacyaurcr.supabase.co';
  END IF;
  
  IF service_role_key IS NULL THEN
    -- You should set this via: ALTER DATABASE postgres SET app.settings.service_role_key = 'your-key';
    -- Or use the pg_net extension with proper configuration
    RAISE EXCEPTION 'Service role key not configured. Please set app.settings.service_role_key';
  END IF;

  -- Call the daily-topic edge function using pg_net (if available)
  -- Otherwise, we'll use a different approach
  BEGIN
    SELECT net.http_post(
      url := supabase_url || '/functions/v1/daily-topic',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := '{}'::jsonb
    ) INTO request_id;
    
    RAISE NOTICE 'Triggered daily-topic function, request_id: %', request_id;
  EXCEPTION
    WHEN OTHERS THEN
      -- If pg_net is not available, log the error
      RAISE WARNING 'Failed to trigger daily-topic via pg_net: %. Please ensure pg_net extension is enabled.', SQLERRM;
      -- Alternative: You can use Supabase's built-in cron system or external scheduler
  END;
END;
$$;

-- Step 2: Grant permissions
GRANT EXECUTE ON FUNCTION public.trigger_daily_topic() TO postgres, service_role;

-- Step 3: Schedule the cron job (runs daily at 12:00 PM UTC)
-- This will only work if pg_cron extension is enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule if already exists
    PERFORM cron.unschedule('daily-topic-generation') 
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'daily-topic-generation'
    );
    
    -- Schedule the job to run daily at 12:00 PM UTC
    -- This ensures the topic is generated early in the day for most timezones
    PERFORM cron.schedule(
      'daily-topic-generation',     -- Job name
      '0 12 * * *',                 -- Schedule: 12:00 PM UTC daily (minute hour day month weekday)
      'SELECT public.trigger_daily_topic()'
    );
    
    RAISE NOTICE '✅ Cron job "daily-topic-generation" scheduled successfully!';
    RAISE NOTICE '   It will run daily at 12:00 PM UTC';
    RAISE NOTICE '   To test immediately, run: SELECT cron.run_job((SELECT jobid FROM cron.job WHERE jobname = ''daily-topic-generation''));';
  ELSE
    RAISE WARNING '❌ pg_cron extension not found. Please enable it first in Database → Extensions';
    RAISE NOTICE 'To enable: Go to Supabase Dashboard → Database → Extensions → Enable "pg_cron"';
    RAISE NOTICE 'Then run this migration again or manually schedule the job.';
    RAISE NOTICE '';
    RAISE NOTICE 'Alternative: You can set up the cron job in Supabase Dashboard → Database → Cron Jobs';
    RAISE NOTICE 'Or use an external scheduler (like GitHub Actions, Vercel Cron, etc.) to call the edge function.';
  END IF;
END $$;

-- Step 4: Verify the cron job was created
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
WHERE jobname = 'daily-topic-generation';

-- Step 5: Add comment
COMMENT ON FUNCTION public.trigger_daily_topic() IS 
'Triggers the daily-topic edge function to generate a new topic for the current day. Called by pg_cron daily at 12:00 PM UTC.';

-- Note: If pg_net is not available, you can also:
-- 1. Use Supabase Dashboard → Database → Cron Jobs (if available)
-- 2. Set up external cron (GitHub Actions, Vercel Cron, etc.) to call:
--    POST https://your-project.supabase.co/functions/v1/daily-topic
--    Headers: { "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY" }
-- 3. Use a webhook service like Zapier, Make.com, or n8n










