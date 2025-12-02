-- Supabase Keep-Alive Cron Job
-- Prevents Supabase project from pausing after 7 days of inactivity
-- Runs every 6 days to ensure continuous activity

-- ============================================================================
-- 1. CREATE KEEP-ALIVE FUNCTION
-- ============================================================================

-- Simple function that performs a lightweight database query
-- This activity counts as "activity" and resets the 7-day inactivity timer
CREATE OR REPLACE FUNCTION public.keep_supabase_active()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Perform a lightweight query to keep the database active
  -- This is the most efficient way to prevent inactivity pause
  -- We'll query a simple system function that doesn't require table access
  PERFORM (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
    LIMIT 1
  );
  
  -- Log the keep-alive activity (optional, helps with monitoring)
  RAISE NOTICE '✅ Supabase keep-alive ping successful at %', NOW();
  
EXCEPTION
  WHEN OTHERS THEN
    -- Even if there's an error, the attempt itself counts as activity
    RAISE WARNING 'Keep-alive query had minor issue: %', SQLERRM;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.keep_supabase_active() TO postgres;

-- Add comment
COMMENT ON FUNCTION public.keep_supabase_active() IS 
'Keeps Supabase project active by performing a lightweight database query. Called by pg_cron every 6 days to prevent 7-day inactivity pause.';

-- ============================================================================
-- 2. SCHEDULE CRON JOB (if pg_cron is enabled)
-- ============================================================================

DO $$
BEGIN
  -- Check if pg_cron extension is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule existing job if it exists (idempotent)
    BEGIN
      PERFORM cron.unschedule('supabase-keep-alive')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'supabase-keep-alive'
      );
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
    
    -- Schedule the job to run every 6 days at 2 AM UTC
    -- Running every 6 days ensures activity before the 7-day inactivity threshold
    PERFORM cron.schedule(
      'supabase-keep-alive',     -- Job name
      '0 2 */6 * *',             -- Schedule: Every 6 days at 2 AM UTC
      'SELECT public.keep_supabase_active()'
    );
    
    RAISE NOTICE '✅ Cron job "supabase-keep-alive" scheduled successfully!';
    RAISE NOTICE '   It will run every 6 days at 2 AM UTC';
    RAISE NOTICE '   This prevents your Supabase project from pausing due to inactivity';
    RAISE NOTICE '';
    RAISE NOTICE '   To test immediately, run:';
    RAISE NOTICE '   SELECT cron.run_job((SELECT jobid FROM cron.job WHERE jobname = ''supabase-keep-alive''));';
  ELSE
    RAISE WARNING '❌ pg_cron extension not found. Please enable it first in Database → Extensions';
    RAISE NOTICE 'To enable: Go to Supabase Dashboard → Database → Extensions → Enable "pg_cron"';
    RAISE NOTICE 'Then run this migration again or manually schedule the job.';
    RAISE NOTICE '';
    RAISE NOTICE 'Alternative: You can set up the cron job in Supabase Dashboard → Database → Cron Jobs';
    RAISE NOTICE 'Or use an external scheduler (like GitHub Actions) to call the function.';
  END IF;
END $$;

-- ============================================================================
-- 3. VERIFY THE CRON JOB WAS CREATED
-- ============================================================================

-- Check if the cron job exists
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active,
  jobid as can_test_with
FROM cron.job 
WHERE jobname = 'supabase-keep-alive';

-- If you see a row above, the cron job is set up correctly! ✅
-- You can test it manually with:
-- SELECT cron.run_job((SELECT jobid FROM cron.job WHERE jobname = 'supabase-keep-alive'));

