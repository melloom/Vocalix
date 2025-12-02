-- Setup cron jobs for automated content security checks
-- Requires pg_cron extension (available on Supabase)

-- ============================================================================
-- 1. ENABLE PG_CRON EXTENSION (if not already enabled)
-- ============================================================================

-- Note: This may already be enabled. If it fails, it's okay.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- 2. SCHEDULE AUTOMATED CONTENT SCANNING
-- ============================================================================

-- Schedule content scanning every 6 hours
-- This scans live clips for moderation issues
SELECT cron.schedule(
  'automated-content-scan',
  '0 */6 * * *', -- Every 6 hours
  $$
  SELECT public.scan_content_for_moderation(100);
  $$
);

-- ============================================================================
-- 3. SCHEDULE MODERATION QUEUE AUTOMATION
-- ============================================================================

-- Schedule moderation queue processing every 2 hours
-- This auto-resolves low-risk items and escalates high-risk items
SELECT cron.schedule(
  'moderation-queue-automation',
  '0 */2 * * *', -- Every 2 hours
  $$
  SELECT public.process_moderation_queue_automation();
  $$
);

-- ============================================================================
-- 4. SCHEDULE AUTO-ESCALATION
-- ============================================================================

-- Schedule auto-escalation every hour
-- This increases priority for old items
SELECT cron.schedule(
  'auto-escalate-moderation-items',
  '0 * * * *', -- Every hour
  $$
  SELECT public.auto_escalate_old_moderation_items();
  $$
);

-- ============================================================================
-- 5. SCHEDULE FULL SECURITY CHECK (DAILY)
-- ============================================================================

-- Schedule full automated content security check daily at 2 AM
-- This runs all checks and generates a summary
SELECT cron.schedule(
  'daily-content-security-check',
  '0 2 * * *', -- Daily at 2 AM
  $$
  SELECT public.run_automated_content_security_checks();
  $$
);

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON EXTENSION pg_cron IS 
  'Enables scheduled jobs for automated content security checks';

-- Note: To view scheduled jobs, run:
-- SELECT * FROM cron.job;
--
-- To unschedule a job, run:
-- SELECT cron.unschedule('job-name');
--
-- To manually trigger a job, run:
-- SELECT cron.run_job(jobid);

