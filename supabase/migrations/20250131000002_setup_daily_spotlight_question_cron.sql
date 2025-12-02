-- Setup Daily Spotlight Question Generation Cron Job
-- This ensures a new spotlight question is generated every day automatically
-- Runs at 12:05 PM UTC (5 minutes after daily topic) daily

-- Step 1: Create function to trigger daily-spotlight-question edge function
CREATE OR REPLACE FUNCTION public.trigger_daily_spotlight_question()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  request_id BIGINT;
BEGIN
  -- Try to read Supabase URL from settings if available, otherwise fall back to hardcoded project URL
  supabase_url := current_setting('app.settings.supabase_url', true);
  IF supabase_url IS NULL THEN
    -- Fallback to your project URL
    supabase_url := 'https://xgblxtopsapvacyaurcr.supabase.co';
  END IF;

  -- Call the daily-spotlight-question edge function using pg_net (no auth header required;
  -- the function uses its own service role key from environment)
  BEGIN
    SELECT net.http_post(
      url := supabase_url || '/functions/v1/daily-spotlight-question',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    ) INTO request_id;
    
    RAISE NOTICE 'Triggered daily-spotlight-question function, request_id: %', request_id;
  EXCEPTION
    WHEN OTHERS THEN
      -- If pg_net is not available, log the error
      RAISE WARNING 'Failed to trigger daily-spotlight-question via pg_net: %. Please ensure pg_net extension is enabled.', SQLERRM;
      -- Alternative: You can use Supabase's built-in cron system or external scheduler
  END;
END;
$$;

-- Step 2: Grant permissions
GRANT EXECUTE ON FUNCTION public.trigger_daily_spotlight_question() TO postgres, service_role;

-- Step 3: Schedule the cron job (runs daily at 12:05 PM UTC, 5 minutes after daily topic)
-- This will only work if pg_cron extension is enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule if already exists
    PERFORM cron.unschedule('daily-spotlight-question-generation') 
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'daily-spotlight-question-generation'
    );
    
    -- Schedule the job to run daily at 12:05 PM UTC (5 minutes after daily topic)
    PERFORM cron.schedule(
      'daily-spotlight-question-generation',     -- Job name
      '5 12 * * *',                              -- Schedule: 12:05 PM UTC daily
      'SELECT public.trigger_daily_spotlight_question()'
    );
    
    RAISE NOTICE '✅ Cron job "daily-spotlight-question-generation" scheduled successfully!';
    RAISE NOTICE '   It will run daily at 12:05 PM UTC (5 minutes after daily topic)';
    RAISE NOTICE '   To test immediately, run: SELECT cron.run_job((SELECT jobid FROM cron.job WHERE jobname = ''daily-spotlight-question-generation''));';
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
WHERE jobname = 'daily-spotlight-question-generation';

-- Step 5: Add comment
COMMENT ON FUNCTION public.trigger_daily_spotlight_question() IS 
'Triggers the daily-spotlight-question edge function to generate a new spotlight question for the current day. Called by pg_cron daily at 12:05 PM UTC.';

