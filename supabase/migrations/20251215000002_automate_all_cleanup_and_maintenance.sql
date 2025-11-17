-- Comprehensive Automation for All Cleanup and Maintenance Tasks
-- Automates all cleanup functions, clip checks, and maintenance operations
-- 
-- NOTE: Service role key and Supabase URL are configured in trigger functions.
-- All cron jobs will be automatically scheduled when this migration runs.

-- ============================================================================
-- 1. CREATE TRIGGER FUNCTIONS FOR EDGE FUNCTIONS
-- ============================================================================

-- Function to trigger cleanup-storage edge function
CREATE OR REPLACE FUNCTION public.trigger_cleanup_storage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT := 'https://xgblxtopsapvacyaurcr.supabase.co';
  service_role_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnYmx4dG9wc2FwdmFjeWF1cmNyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjc3ODQ0MSwiZXhwIjoyMDc4MzU0NDQxfQ.B4lj7MgyqjvKCbWXWawV4KS92Syw6SZsEpWHaGXmFEw';
  request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/cleanup-storage',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  ) INTO request_id;
  
  RAISE NOTICE 'Triggered cleanup-storage, request_id: %', request_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to trigger cleanup-storage: %', SQLERRM;
END;
$$;

-- Function to trigger update-trending-scores edge function
CREATE OR REPLACE FUNCTION public.trigger_update_trending_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT := 'https://xgblxtopsapvacyaurcr.supabase.co';
  service_role_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnYmx4dG9wc2FwdmFjeWF1cmNyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjc3ODQ0MSwiZXhwIjoyMDc4MzU0NDQxfQ.B4lj7MgyqjvKCbWXWawV4KS92Syw6SZsEpWHaGXmFEw';
  request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/update-trending-scores',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  ) INTO request_id;
  
  RAISE NOTICE 'Triggered update-trending-scores, request_id: %', request_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to trigger update-trending-scores: %', SQLERRM;
END;
$$;

-- ============================================================================
-- 1.5. CREATE FUNCTIONS FOR CLIP VALIDATION
-- ============================================================================

-- Function to check for clips stuck in processing
CREATE OR REPLACE FUNCTION public.check_stuck_processing_clips()
RETURNS TABLE (
  stuck_count INTEGER,
  marked_failed INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stuck_count INTEGER;
  v_marked_failed INTEGER;
BEGIN
  -- Find clips stuck in processing for 12+ hours
  SELECT COUNT(*) INTO v_stuck_count
  FROM public.clips
  WHERE status = 'processing'
    AND created_at < now() - interval '12 hours';
  
  -- Mark them as failed
  UPDATE public.clips
  SET status = 'failed', updated_at = now()
  WHERE status = 'processing'
    AND created_at < now() - interval '12 hours';
  
  GET DIAGNOSTICS v_marked_failed = ROW_COUNT;
  
  IF v_marked_failed > 0 THEN
    RAISE NOTICE 'Marked % clips as failed (stuck in processing)', v_marked_failed;
  END IF;
  
  RETURN QUERY SELECT v_stuck_count, v_marked_failed;
END;
$$;

-- Function to check for clips with missing audio files
CREATE OR REPLACE FUNCTION public.check_missing_audio_files()
RETURNS TABLE (
  missing_count INTEGER,
  marked_removed INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing_count INTEGER;
  v_marked_removed INTEGER;
BEGIN
  -- This would need to be enhanced to actually check storage
  -- For now, just check for clips with null/empty audio_path
  SELECT COUNT(*) INTO v_missing_count
  FROM public.clips
  WHERE status = 'live'
    AND (audio_path IS NULL OR audio_path = '');
  
  -- Mark them for review
  UPDATE public.clips
  SET status = 'removed', updated_at = now()
  WHERE status = 'live'
    AND (audio_path IS NULL OR audio_path = '');
  
  GET DIAGNOSTICS v_marked_removed = ROW_COUNT;
  
  IF v_marked_removed > 0 THEN
    RAISE NOTICE 'Marked % clips as removed (missing audio files)', v_marked_removed;
  END IF;
  
  RETURN QUERY SELECT v_missing_count, v_marked_removed;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.trigger_cleanup_storage() TO postgres;
GRANT EXECUTE ON FUNCTION public.trigger_update_trending_scores() TO postgres;
GRANT EXECUTE ON FUNCTION public.check_stuck_processing_clips() TO postgres;
GRANT EXECUTE ON FUNCTION public.check_missing_audio_files() TO postgres;

-- ============================================================================
-- 2. SCHEDULE ALL CLEANUP AND MAINTENANCE CRON JOBS
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- ========================================================================
    -- CLIP CLEANUP JOBS (already exist, but ensure they're scheduled)
    -- ========================================================================
    
    -- Cleanup old clips (90+ days) - Daily at 2 AM UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-clips') THEN
      PERFORM cron.unschedule('cleanup-old-clips');
    END IF;
    
    PERFORM cron.schedule(
      'cleanup-old-clips',
      '0 2 * * *',
      'SELECT public.cleanup_old_clips()'
    );
    
    -- Cleanup failed/processing clips (24+ hours) - Every 6 hours
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-failed-clips') THEN
      PERFORM cron.unschedule('cleanup-failed-clips');
    END IF;
    
    PERFORM cron.schedule(
      'cleanup-failed-clips',
      '*/6 * * * *',
      'SELECT public.cleanup_failed_clips()'
    );
    
    -- Cleanup inactive account clips - Weekly on Sunday at 3 AM UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-inactive-account-clips') THEN
      PERFORM cron.unschedule('cleanup-inactive-account-clips');
    END IF;
    
    PERFORM cron.schedule(
      'cleanup-inactive-account-clips',
      '0 3 * * 0',
      'SELECT public.cleanup_inactive_account_clips()'
    );
    
    -- ========================================================================
    -- STORAGE AND CLIP MAINTENANCE
    -- ========================================================================
    
    -- Comprehensive cleanup-storage edge function - Daily at 1 AM UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-storage-comprehensive') THEN
      PERFORM cron.unschedule('cleanup-storage-comprehensive');
    END IF;
    
    PERFORM cron.schedule(
      'cleanup-storage-comprehensive',
      '0 1 * * *',
      'SELECT public.trigger_cleanup_storage()'
    );
    
    -- Recalculate storage for all profiles - Weekly on Sunday at 4 AM UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recalculate-all-storage') THEN
      PERFORM cron.unschedule('recalculate-all-storage');
    END IF;
    
    PERFORM cron.schedule(
      'recalculate-all-storage',
      '0 4 * * 0',
      'SELECT public.recalculate_all_storage()'
    );
    
    -- ========================================================================
    -- TRENDING AND SCORES
    -- ========================================================================
    
    -- Update trending scores - Every hour
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'update-trending-scores') THEN
      PERFORM cron.unschedule('update-trending-scores');
    END IF;
    
    PERFORM cron.schedule(
      'update-trending-scores',
      '0 * * * *',
      'SELECT public.trigger_update_trending_scores()'
    );
    
    -- ========================================================================
    -- LOG CLEANUP JOBS
    -- ========================================================================
    
    -- Cleanup old query performance logs (30+ days) - Daily at 3 AM UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-query-performance-logs') THEN
      PERFORM cron.unschedule('cleanup-query-performance-logs');
    END IF;
    
    PERFORM cron.schedule(
      'cleanup-query-performance-logs',
      '0 3 * * *',
      'SELECT public.cleanup_query_performance_logs()'
    );
    
    -- Cleanup old security audit logs (90+ days) - Daily at 3:30 AM UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-security-audit-logs') THEN
      PERFORM cron.unschedule('cleanup-security-audit-logs');
    END IF;
    
    PERFORM cron.schedule(
      'cleanup-security-audit-logs',
      '30 3 * * *',
      'SELECT public.cleanup_security_audit_logs()'
    );
    
    -- Cleanup old account creation logs (30+ days) - Daily at 4 AM UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-account-creation-logs') THEN
      PERFORM cron.unschedule('cleanup-account-creation-logs');
    END IF;
    
    PERFORM cron.schedule(
      'cleanup-account-creation-logs',
      '0 4 * * *',
      'SELECT public.cleanup_account_creation_logs()'
    );
    
    -- Cleanup old clip upload logs (30+ days) - Daily at 4:30 AM UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-clip-upload-logs') THEN
      PERFORM cron.unschedule('cleanup-clip-upload-logs');
    END IF;
    
    PERFORM cron.schedule(
      'cleanup-clip-upload-logs',
      '30 4 * * *',
      'SELECT public.cleanup_clip_upload_logs()'
    );
    
    -- Cleanup old IP activity logs (90+ days) - Daily at 5 AM UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-ip-activity-logs') THEN
      PERFORM cron.unschedule('cleanup-ip-activity-logs');
    END IF;
    
    PERFORM cron.schedule(
      'cleanup-ip-activity-logs',
      '0 5 * * *',
      'SELECT public.cleanup_ip_activity_logs()'
    );
    
    -- Cleanup old reputation action logs (90+ days) - Daily at 5:30 AM UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-reputation-action-logs') THEN
      PERFORM cron.unschedule('cleanup-reputation-action-logs');
    END IF;
    
    PERFORM cron.schedule(
      'cleanup-reputation-action-logs',
      '30 5 * * *',
      'SELECT public.cleanup_reputation_action_logs()'
    );
    
    -- Cleanup old digest request logs (30+ days) - Daily at 6 AM UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-digest-request-logs') THEN
      PERFORM cron.unschedule('cleanup-digest-request-logs');
    END IF;
    
    PERFORM cron.schedule(
      'cleanup-digest-request-logs',
      '0 6 * * *',
      'SELECT public.cleanup_digest_request_logs()'
    );
    
    -- Cleanup old rate limit logs (30+ days) - Daily at 6:30 AM UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-rate-limit-logs') THEN
      PERFORM cron.unschedule('cleanup-rate-limit-logs');
    END IF;
    
    PERFORM cron.schedule(
      'cleanup-rate-limit-logs',
      '30 6 * * *',
      'SELECT public.cleanup_rate_limit_logs()'
    );
    
    -- ========================================================================
    -- API AND QUOTA MANAGEMENT
    -- ========================================================================
    
    -- Reset API key daily quotas - Daily at midnight UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reset-api-quotas') THEN
      PERFORM cron.unschedule('reset-api-quotas');
    END IF;
    
    PERFORM cron.schedule(
      'reset-api-quotas',
      '0 0 * * *',
      'SELECT public.reset_api_key_quotas()'
    );
    
    -- ========================================================================
    -- CLIP VALIDATION AND QUALITY CHECKS
    -- ========================================================================
    
    -- Check for clips stuck in processing (12+ hours) - Every 4 hours
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-stuck-processing-clips') THEN
      PERFORM cron.unschedule('check-stuck-processing-clips');
    END IF;
    
    PERFORM cron.schedule(
      'check-stuck-processing-clips',
      '0 */4 * * *',
      'SELECT public.check_stuck_processing_clips()'
    );
    
    -- Check for clips with missing audio files - Daily at 7 AM UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-missing-audio-files') THEN
      PERFORM cron.unschedule('check-missing-audio-files');
    END IF;
    
    PERFORM cron.schedule(
      'check-missing-audio-files',
      '0 7 * * *',
      'SELECT public.check_missing_audio_files()'
    );
    
    RAISE NOTICE '✅ All cleanup and maintenance cron jobs scheduled successfully!';
    RAISE NOTICE '';
    RAISE NOTICE 'Clip Cleanup:';
    RAISE NOTICE '   - cleanup-old-clips: Daily at 2 AM UTC';
    RAISE NOTICE '   - cleanup-failed-clips: Every 6 hours';
    RAISE NOTICE '   - cleanup-inactive-account-clips: Weekly Sunday at 3 AM UTC';
    RAISE NOTICE '';
    RAISE NOTICE 'Storage & Maintenance:';
    RAISE NOTICE '   - cleanup-storage-comprehensive: Daily at 1 AM UTC';
    RAISE NOTICE '   - recalculate-all-storage: Weekly Sunday at 4 AM UTC';
    RAISE NOTICE '   - update-trending-scores: Every hour';
    RAISE NOTICE '';
    RAISE NOTICE 'Log Cleanup:';
    RAISE NOTICE '   - cleanup-query-performance-logs: Daily at 3 AM UTC';
    RAISE NOTICE '   - cleanup-security-audit-logs: Daily at 3:30 AM UTC';
    RAISE NOTICE '   - cleanup-account-creation-logs: Daily at 4 AM UTC';
    RAISE NOTICE '   - cleanup-clip-upload-logs: Daily at 4:30 AM UTC';
    RAISE NOTICE '   - cleanup-ip-activity-logs: Daily at 5 AM UTC';
    RAISE NOTICE '   - cleanup-reputation-action-logs: Daily at 5:30 AM UTC';
    RAISE NOTICE '   - cleanup-digest-request-logs: Daily at 6 AM UTC';
    RAISE NOTICE '   - cleanup-rate-limit-logs: Daily at 6:30 AM UTC';
    RAISE NOTICE '';
    RAISE NOTICE 'API & Quotas:';
    RAISE NOTICE '   - reset-api-quotas: Daily at midnight UTC';
    RAISE NOTICE '';
    RAISE NOTICE 'Clip Validation:';
    RAISE NOTICE '   - check-stuck-processing-clips: Every 4 hours';
    RAISE NOTICE '   - check-missing-audio-files: Daily at 7 AM UTC';
    
  ELSE
    RAISE WARNING '❌ pg_cron extension not found. Please enable it first in Database → Extensions';
    RAISE NOTICE 'To enable: Go to Database → Extensions → Enable "pg_cron"';
    RAISE NOTICE 'Then run this migration again.';
  END IF;
END $$;

-- Verify all cron jobs were created
SELECT 
  jobid,
  jobname,
  schedule,
  active
FROM cron.job 
WHERE jobname IN (
  'cleanup-old-clips',
  'cleanup-failed-clips',
  'cleanup-inactive-account-clips',
  'cleanup-storage-comprehensive',
  'recalculate-all-storage',
  'update-trending-scores',
  'cleanup-query-performance-logs',
  'cleanup-security-audit-logs',
  'cleanup-account-creation-logs',
  'cleanup-clip-upload-logs',
  'cleanup-ip-activity-logs',
  'cleanup-reputation-action-logs',
  'cleanup-digest-request-logs',
  'cleanup-rate-limit-logs',
  'reset-api-quotas',
  'check-stuck-processing-clips',
  'check-missing-audio-files'
)
ORDER BY jobname;

-- If you see rows above, all cron jobs are set up correctly! ✅

COMMENT ON FUNCTION public.trigger_cleanup_storage() IS 
'Triggers the cleanup-storage edge function for comprehensive cleanup. Scheduled daily.';

COMMENT ON FUNCTION public.trigger_update_trending_scores() IS 
'Triggers the update-trending-scores edge function. Scheduled hourly.';

