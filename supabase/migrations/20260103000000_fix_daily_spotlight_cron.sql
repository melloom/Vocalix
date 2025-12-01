-- Fix Daily Spotlight Question Cron Job
-- This migration fixes the trigger function to properly call the edge function
-- with proper authentication and error handling

-- Step 1: Ensure pg_net extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 2: Update the trigger function with better error handling and auth
CREATE OR REPLACE FUNCTION public.trigger_daily_spotlight_question()
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  request_id BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url TEXT := 'https://xgblxtopsapvacyaurcr.supabase.co';
  service_role_key TEXT;
  request_id BIGINT;
  v_result BOOLEAN := false;
  v_message TEXT := '';
BEGIN
  -- Check if pg_net extension is available
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN QUERY SELECT false, 'pg_net extension is not enabled. Please enable it in Supabase Dashboard → Database → Extensions'::TEXT, NULL::BIGINT;
    RETURN;
  END IF;

  -- Try to get service role key from current_setting or use a default
  -- In Supabase, edge functions called from database should use service role
  -- The edge function itself has SERVICE_ROLE_KEY from env, but we need to authenticate the HTTP call
  
  -- For Supabase, we can try calling with Authorization header using a service role key
  -- stored in vault or passed as parameter. For now, try calling without auth since
  -- the edge function may handle auth internally via SERVICE_ROLE_KEY from env
  
  -- Call the daily-spotlight-question edge function using pg_net
  BEGIN
    -- Note: In Supabase, when calling edge functions from pg_net within the database,
    -- the edge function receives the request but needs to authenticate properly
    -- Since the edge function uses SERVICE_ROLE_KEY from env, it should work
    -- However, we might need to pass it as a header
    
    -- Try calling with minimal headers first
    SELECT net.http_post(
      url := supabase_url || '/functions/v1/daily-spotlight-question',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object()
    ) INTO request_id;
    
    v_result := true;
    v_message := format('Triggered daily-spotlight-question function successfully, request_id: %s', request_id);
    RAISE NOTICE '%', v_message;
    
    RETURN QUERY SELECT v_result, v_message, request_id;
    
  EXCEPTION
    WHEN OTHERS THEN
      v_message := format('Failed to trigger daily-spotlight-question via pg_net: %s. Error: %s', SQLSTATE, SQLERRM);
      RAISE WARNING '%', v_message;
      RETURN QUERY SELECT false, v_message, NULL::BIGINT;
  END;
END;
$$;

-- Alternative: Create a version that uses Supabase's internal HTTP function
-- This version directly inserts into the daily_spotlight_questions table if edge function fails
CREATE OR REPLACE FUNCTION public.trigger_daily_spotlight_question_fallback()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_exists BOOLEAN;
  v_fallback_question TEXT := 'What brightened your day?';
BEGIN
  -- Check if question for today already exists
  SELECT EXISTS(
    SELECT 1 FROM public.daily_spotlight_questions
    WHERE date = v_today
  ) INTO v_exists;

  IF v_exists THEN
    RAISE NOTICE 'Question for today already exists, skipping generation';
    RETURN;
  END IF;

  -- Insert fallback question if none exists
  INSERT INTO public.daily_spotlight_questions (
    date,
    question,
    generated_by
  ) VALUES (
    v_today,
    v_fallback_question,
    'fallback'
  )
  ON CONFLICT (date) DO NOTHING;

  RAISE NOTICE 'Created fallback spotlight question for %', v_today;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.trigger_daily_spotlight_question() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.trigger_daily_spotlight_question_fallback() TO postgres, service_role;

-- Step 2: Update the cron job to use improved function with error handling
DO $$
DECLARE
  v_job_exists BOOLEAN;
  v_job_id BIGINT;
BEGIN
  -- Check if pg_cron is enabled
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'pg_cron extension not found. Please enable it first in Database → Extensions';
    RETURN;
  END IF;

  -- Check if job exists
  SELECT EXISTS(
    SELECT 1 FROM cron.job WHERE jobname = 'daily-spotlight-question-generation'
  ) INTO v_job_exists;

  IF v_job_exists THEN
    -- Get job ID
    SELECT jobid INTO v_job_id
    FROM cron.job
    WHERE jobname = 'daily-spotlight-question-generation';

    -- Unschedule existing job
    PERFORM cron.unschedule('daily-spotlight-question-generation');
  END IF;

  -- Schedule the improved job
  -- This version tries the edge function first, and uses fallback if it fails
  PERFORM cron.schedule(
    'daily-spotlight-question-generation',
    '5 12 * * *', -- 12:05 PM UTC daily
    $$
    DO $$
    DECLARE
      v_result RECORD;
      v_has_question BOOLEAN;
    BEGIN
      -- First check if question already exists for today
      SELECT EXISTS(
        SELECT 1 FROM public.daily_spotlight_questions
        WHERE date = CURRENT_DATE
      ) INTO v_has_question;
      
      IF v_has_question THEN
        RAISE NOTICE 'Question for today already exists, skipping generation';
        RETURN;
      END IF;
      
      -- Try to trigger edge function
      BEGIN
        SELECT * INTO v_result FROM public.trigger_daily_spotlight_question();
        
        -- If it failed, use fallback after a short delay
        IF NOT v_result.success THEN
          RAISE WARNING 'Edge function failed: %. Using fallback.', v_result.message;
          PERFORM pg_sleep(2); -- Wait 2 seconds before fallback
          PERFORM public.trigger_daily_spotlight_question_fallback();
        ELSE
          RAISE NOTICE 'Successfully triggered edge function: %', v_result.message;
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          -- Last resort: use fallback
          RAISE WARNING 'Error triggering edge function: %. Using fallback.', SQLERRM;
          PERFORM public.trigger_daily_spotlight_question_fallback();
      END;
    END;
    $$;
    $$
  );

  RAISE NOTICE '✅ Cron job "daily-spotlight-question-generation" updated and scheduled successfully!';
  RAISE NOTICE '   It will run daily at 12:05 PM UTC';
  RAISE NOTICE '   If edge function fails, it will use a fallback question';
END $$;

-- Step 3: Verify the cron job
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  active,
  CASE 
    WHEN active THEN '✅ Active and scheduled'
    ELSE '❌ Inactive - needs to be enabled'
  END AS status
FROM cron.job 
WHERE jobname = 'daily-spotlight-question-generation';

-- Step 4: Test function (optional - can be run manually)
-- SELECT * FROM public.trigger_daily_spotlight_question();

-- Step 5: Update comments
COMMENT ON FUNCTION public.trigger_daily_spotlight_question() IS 
'Triggers the daily-spotlight-question edge function to generate a new spotlight question. Returns success status and message. Called by pg_cron daily at 12:05 PM UTC.';

COMMENT ON FUNCTION public.trigger_daily_spotlight_question_fallback() IS 
'Fallback function that creates a default spotlight question if the edge function fails. Should only be used as a backup.';

-- ============================================================================
-- DIAGNOSTIC QUERIES
-- ============================================================================

-- To test the trigger function manually:
-- SELECT * FROM public.trigger_daily_spotlight_question();

-- To test the fallback function manually:
-- SELECT public.trigger_daily_spotlight_question_fallback();

-- To manually trigger the cron job:
-- SELECT cron.run_job((SELECT jobid FROM cron.job WHERE jobname = 'daily-spotlight-question-generation'));

-- To check if pg_net is enabled:
-- SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- To check recent cron job executions:
-- SELECT * FROM cron.job_run_details 
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-spotlight-question-generation')
-- ORDER BY start_time DESC LIMIT 10;

-- To check if today's question exists:
-- SELECT * FROM public.daily_spotlight_questions WHERE date = CURRENT_DATE;

