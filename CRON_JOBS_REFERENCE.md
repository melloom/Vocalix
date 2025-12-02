# Cron Jobs Reference

This document lists all cron jobs that should be configured in your system based on the migration files.

## Quick Diagnostic

Run the `diagnose_cron_jobs.sql` script in your Supabase SQL Editor to check the status of all cron jobs.

## Expected Cron Jobs

### Daily Content Jobs

1. **daily-digest**
   - Schedule: `0 9 * * *` (9 AM UTC daily)
   - Function: `public.trigger_daily_digest()`
   - Purpose: Send daily digest emails to users
   - Migration: `20251207000001_setup_daily_digest_cron.sql`

2. **daily-topic-generation**
   - Schedule: `0 12 * * *` (12:00 PM UTC daily)
   - Function: `public.trigger_daily_topic()`
   - Purpose: Generate daily topic
   - Migration: `20250224000002_setup_daily_topic_cron.sql`

3. **daily-spotlight-question-generation**
   - Schedule: `5 12 * * *` (12:05 PM UTC daily)
   - Function: `public.trigger_daily_spotlight_question()`
   - Purpose: Generate daily spotlight question
   - Migration: `20250131000002_setup_daily_spotlight_question_cron.sql`

4. **publish-scheduled-clips**
   - Schedule: `*/5 * * * *` (Every 5 minutes)
   - Function: `public.trigger_publish_scheduled_clips()`
   - Purpose: Publish scheduled clips
   - Migration: `20251208000001_setup_scheduled_posts_cron.sql`

### Maintenance & Cleanup Jobs

5. **cleanup-old-clips**
   - Schedule: `0 2 * * *` (2 AM UTC daily)
   - Function: `public.cleanup_old_clips()`
   - Purpose: Clean up clips older than 90 days
   - Migration: `20251209000000_add_security_enhancements.sql`

6. **cleanup-failed-clips**
   - Schedule: `*/6 * * * *` (Every 6 hours)
   - Function: `public.cleanup_failed_clips()`
   - Purpose: Clean up failed/processing clips older than 24 hours
   - Migration: `20251209000000_add_security_enhancements.sql`

7. **reset-api-quotas**
   - Schedule: `0 0 * * *` (Midnight UTC daily)
   - Function: `public.reset_api_key_quotas()`
   - Purpose: Reset daily API usage quotas
   - Migration: `20251209000000_add_security_enhancements.sql`

8. **revalidate-clips-batch**
   - Schedule: `0 */6 * * *` (Every 6 hours)
   - Function: `public.revalidate_clips_batch(100, 24)`
   - Purpose: Re-validate audio quality for clips
   - Migration: `20251215000003_enhance_audio_quality_validation.sql`

### Content Security Jobs

9. **automated-content-scan**
   - Schedule: `0 */6 * * *` (Every 6 hours)
   - Function: `public.scan_content_for_moderation(100)`
   - Purpose: Scan live clips for moderation issues
   - Migration: `20250128000001_setup_content_security_cron.sql`

10. **moderation-queue-automation**
    - Schedule: `0 */2 * * *` (Every 2 hours)
    - Function: `public.process_moderation_queue_automation()`
    - Purpose: Auto-resolve low-risk items, escalate high-risk items
    - Migration: `20250128000001_setup_content_security_cron.sql`

11. **auto-escalate-moderation-items**
    - Schedule: `0 * * * *` (Every hour)
    - Function: `public.auto_escalate_old_moderation_items()`
    - Purpose: Increase priority for old moderation items
    - Migration: `20250128000001_setup_content_security_cron.sql`

12. **daily-content-security-check**
    - Schedule: `0 2 * * *` (2 AM UTC daily)
    - Function: `public.run_automated_content_security_checks()`
    - Purpose: Run full automated content security checks
    - Migration: `20250128000001_setup_content_security_cron.sql`

### Security Audit Jobs

13. **daily-security-audit**
    - Schedule: `0 2 * * *` (2 AM UTC daily)
    - Function: `public.run_security_audit('daily')` OR `public.trigger_security_audit('daily')`
    - Purpose: Run daily security audit
    - Migration: `20250122000000_add_security_automation.sql` OR `20251215000001_setup_security_audit_cron.sql`

14. **weekly-security-audit**
    - Schedule: `0 3 * * 0` (3 AM UTC every Sunday)
    - Function: `public.run_security_audit('weekly')` OR `public.trigger_security_audit('weekly')`
    - Purpose: Run weekly comprehensive security audit
    - Migration: `20250122000000_add_security_automation.sql` OR `20251215000001_setup_security_audit_cron.sql`

15. **monthly-security-audit**
    - Schedule: `0 4 * * 1` (4 AM UTC first Monday of month)
    - Function: `public.run_security_audit('monthly')` OR `public.trigger_security_audit('monthly')`
    - Purpose: Run monthly full security audit
    - Migration: `20250122000000_add_security_automation.sql` OR `20251215000001_setup_security_audit_cron.sql`

16. **security-audit-daily** (Alternative naming)
    - Schedule: `0 2 * * *` (2 AM UTC daily)
    - Function: `public.trigger_security_audit('daily')`
    - Purpose: Trigger daily security audit via edge function
    - Migration: `20251215000001_setup_security_audit_cron.sql`

17. **security-audit-weekly** (Alternative naming)
    - Schedule: `0 3 * * 1` (3 AM UTC every Monday)
    - Function: `public.trigger_security_audit('weekly')`
    - Purpose: Trigger weekly security audit via edge function
    - Migration: `20251215000001_setup_security_audit_cron.sql`

18. **security-audit-monthly** (Alternative naming)
    - Schedule: `0 4 1 * *` (4 AM UTC first day of month)
    - Function: `public.trigger_security_audit('monthly')`
    - Purpose: Trigger monthly security audit via edge function
    - Migration: `20251215000001_setup_security_audit_cron.sql`

19. **security-audit-quarterly**
    - Schedule: `0 5 1 1,4,7,10 *` (5 AM UTC first day of quarter)
    - Function: `public.trigger_security_audit('quarterly')`
    - Purpose: Trigger quarterly security audit
    - Migration: `20251215000001_setup_security_audit_cron.sql`

20. **cleanup-old-audit-results**
    - Schedule: `0 1 * * 0` (1 AM UTC every Sunday)
    - Function: `public.cleanup_old_audit_results()`
    - Purpose: Clean up old audit results
    - Migration: `20251215000001_setup_security_audit_cron.sql`

### API Key & Security Management

21. **api-key-rotation-check**
    - Schedule: `0 5 * * 0` (5 AM UTC every Sunday)
    - Function: `public.enforce_api_key_rotation()`
    - Purpose: Disable keys older than 90 days, warn about keys older than 60 days
    - Migration: `20250122000000_add_security_automation.sql`

22. **critical-security-events-check**
    - Schedule: `0 * * * *` (Every hour)
    - Function: `public.check_critical_security_events()`
    - Purpose: Check for critical security events and trigger alerts
    - Migration: `20250122000000_add_security_automation.sql`

### Backup Jobs

23. **daily-backup-check**
    - Schedule: `0 2 * * *` (2 AM UTC daily)
    - Function: `public.execute_daily_backup_check()`
    - Purpose: Verify daily backups
    - Migration: `20250128000002_setup_backup_automation_cron.sql`

24. **weekly-backup-check**
    - Schedule: `0 3 * * 1` (3 AM UTC every Monday)
    - Function: `public.execute_weekly_backup_check()`
    - Purpose: Verify weekly backups and integrity
    - Migration: `20250128000002_setup_backup_automation_cron.sql`

25. **monthly-backup-drill**
    - Schedule: `0 4 1 * *` (4 AM UTC first day of month)
    - Function: `public.execute_monthly_backup_drill()`
    - Purpose: Run monthly disaster recovery drill
    - Migration: `20250128000002_setup_backup_automation_cron.sql`

### System Maintenance

26. **supabase-keep-alive**
    - Schedule: `0 2 */6 * *` (2 AM UTC every 6 days)
    - Function: `public.keep_supabase_active()`
    - Purpose: Prevent Supabase project from pausing after 7 days of inactivity
    - Migration: `20251220000007_add_supabase_keep_alive_cron.sql`

## Troubleshooting

### If cron jobs are not working:

1. **Check if pg_cron extension is enabled:**
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```
   If not enabled, go to Supabase Dashboard → Database → Extensions → Enable "pg_cron"

2. **Check all scheduled jobs:**
   ```sql
   SELECT * FROM cron.job ORDER BY jobname;
   ```

3. **Check for inactive jobs:**
   ```sql
   SELECT * FROM cron.job WHERE active = false;
   ```

4. **Test a job manually:**
   ```sql
   SELECT cron.run_job((SELECT jobid FROM cron.job WHERE jobname = 'job-name'));
   ```

5. **Run the diagnostic script:**
   - Execute `diagnose_cron_jobs.sql` in Supabase SQL Editor
   - Review the output to identify missing or inactive jobs

### Common Issues

- **pg_cron not enabled**: Enable it in Supabase Dashboard
- **Migrations not run**: Re-run the migration files
- **Jobs inactive**: Check why jobs were disabled
- **Missing functions**: Ensure all required functions exist in the database

## Quick Commands

### View all cron jobs
```sql
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;
```

### Unschedule a job
```sql
SELECT cron.unschedule('job-name');
```

### Schedule a job manually
```sql
SELECT cron.schedule(
  'job-name',
  'schedule-pattern',
  'command'
);
```

### Enable a disabled job
```sql
UPDATE cron.job SET active = true WHERE jobname = 'job-name';
```

## Notes

- All times are in UTC
- Some jobs may have duplicate names from different migrations (e.g., security audit jobs)
- The system may have multiple migrations that create similar jobs with different implementations
- Check which migrations have actually run to determine which jobs should exist

