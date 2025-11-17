-- Automated Security Audit Cron Job Setup
-- Schedules automatic security audits at different intervals
-- 
-- NOTE: Service role key and Supabase URL are configured in the function.
-- All cron jobs will be automatically scheduled when this migration runs.

-- Step 1: Create the trigger function
CREATE OR REPLACE FUNCTION public.trigger_security_audit(p_audit_type TEXT DEFAULT 'daily')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT := 'https://xgblxtopsapvacyaurcr.supabase.co';
  service_role_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnYmx4dG9wc2FwdmFjeWF1cmNyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjc3ODQ0MSwiZXhwIjoyMDc4MzU0NDQxfQ.B4lj7MgyqjvKCbWXWawV4KS92Syw6SZsEpWHaGXmFEw';
  request_id BIGINT;
BEGIN
  -- Call the security-audit edge function using pg_net
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/security-audit?type=' || p_audit_type,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  ) INTO request_id;
  
  RAISE NOTICE 'Triggered security-audit (% audit), request_id: %', p_audit_type, request_id;
    
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to trigger security-audit (% audit): %', p_audit_type, SQLERRM;
END;
$$;

-- Step 2: Grant permissions
GRANT EXECUTE ON FUNCTION public.trigger_security_audit(TEXT) TO postgres;

-- Step 3: Schedule the cron jobs (if pg_cron extension is enabled)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule existing jobs if they exist
    PERFORM cron.unschedule('security-audit-daily') 
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'security-audit-daily'
    );
    
    PERFORM cron.unschedule('security-audit-weekly') 
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'security-audit-weekly'
    );
    
    PERFORM cron.unschedule('security-audit-monthly') 
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'security-audit-monthly'
    );
    
    PERFORM cron.unschedule('security-audit-quarterly') 
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'security-audit-quarterly'
    );
    
    PERFORM cron.unschedule('cleanup-old-audit-results') 
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-audit-results'
    );
    
    -- Schedule daily audit - Every day at 2 AM UTC
    PERFORM cron.schedule(
      'security-audit-daily',
      '0 2 * * *', -- Daily at 2 AM UTC
      'SELECT public.trigger_security_audit(''daily'')'
    );
    
    -- Schedule weekly audit - Every Monday at 3 AM UTC
    PERFORM cron.schedule(
      'security-audit-weekly',
      '0 3 * * 1', -- Every Monday at 3 AM UTC
      'SELECT public.trigger_security_audit(''weekly'')'
    );
    
    -- Schedule monthly audit - First day of month at 4 AM UTC
    PERFORM cron.schedule(
      'security-audit-monthly',
      '0 4 1 * *', -- First day of month at 4 AM UTC
      'SELECT public.trigger_security_audit(''monthly'')'
    );
    
    -- Schedule quarterly audit - First day of quarter at 5 AM UTC
    -- Quarters: Jan 1, Apr 1, Jul 1, Oct 1
    PERFORM cron.schedule(
      'security-audit-quarterly',
      '0 5 1 1,4,7,10 *', -- First day of quarter at 5 AM UTC
      'SELECT public.trigger_security_audit(''quarterly'')'
    );
    
    -- Schedule cleanup of old audit results - Weekly on Sunday at 1 AM UTC
    PERFORM cron.schedule(
      'cleanup-old-audit-results',
      '0 1 * * 0', -- Every Sunday at 1 AM UTC
      'SELECT public.cleanup_old_audit_results()'
    );
    
    RAISE NOTICE '✅ Security audit cron jobs scheduled successfully!';
    RAISE NOTICE '   - Daily audit: Every day at 2 AM UTC';
    RAISE NOTICE '   - Weekly audit: Every Monday at 3 AM UTC';
    RAISE NOTICE '   - Monthly audit: First day of month at 4 AM UTC';
    RAISE NOTICE '   - Quarterly audit: First day of quarter at 5 AM UTC';
    RAISE NOTICE '   - Cleanup: Every Sunday at 1 AM UTC';
  ELSE
    RAISE WARNING '❌ pg_cron extension not found. Please enable it first in Database → Extensions';
    RAISE NOTICE 'To enable: Go to Database → Extensions → Enable "pg_cron"';
    RAISE NOTICE 'Then run this migration again or set up cron jobs manually via Dashboard.';
  END IF;
END $$;

-- Verify the cron jobs were created
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job 
WHERE jobname LIKE 'security-audit%' OR jobname = 'cleanup-old-audit-results'
ORDER BY jobname;

-- If you see rows above, the cron jobs are set up correctly! ✅

-- ============================================================================
-- ALTERNATIVE: Manual Cron Job Setup (if automatic setup fails)
-- ============================================================================
-- If the automatic setup above doesn't work, you can set up cron jobs manually:
-- 1. Go to Supabase Dashboard → Database → Cron Jobs
-- 2. Click "New Cron Job" for each schedule
-- 3. Use the function: SELECT public.trigger_security_audit('daily');
--    (Replace 'daily' with 'weekly', 'monthly', or 'quarterly' as needed)

COMMENT ON FUNCTION public.trigger_security_audit(TEXT) IS 
'Triggers the security-audit edge function to run automated security checks. Scheduled via pg_cron at different intervals.';

