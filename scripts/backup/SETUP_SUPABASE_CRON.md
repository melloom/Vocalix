# Setting Up Backup Automation in Supabase (Recommended)

This is the **easiest and recommended** way to set up automated backup checks - everything runs directly in Supabase using SQL and pg_cron. No external scripts, GitHub Actions, or cron jobs needed!

## Quick Setup (2 Steps)

### Step 1: Enable pg_cron Extension

1. Go to your Supabase Dashboard
2. Navigate to **Database → Extensions**
3. Search for `pg_cron`
4. Click **Enable**

### Step 2: Run the Migration

Run this migration in Supabase SQL Editor:

```sql
-- The migration file is at:
-- supabase/migrations/20250128000002_setup_backup_automation_cron.sql
```

Or copy and paste the migration SQL directly into Supabase Dashboard → SQL Editor → New Query.

**That's it!** The backup checks will now run automatically:
- **Daily**: 2 AM UTC - Database connectivity, storage buckets, backup file counts
- **Weekly**: Monday 3 AM UTC - Backup integrity, restoration readiness
- **Monthly**: 1st of month 4 AM UTC - Full disaster recovery drill

## What Gets Created

### SQL Functions

1. **`run_daily_backup_check()`** - Daily verification checks
2. **`run_weekly_backup_check()`** - Weekly integrity checks
3. **`run_monthly_backup_drill()`** - Monthly disaster recovery drill
4. **`log_backup_check_results()`** - Logs results to `backup_check_logs` table

### Cron Jobs

- `daily-backup-check` - Runs daily at 2 AM UTC
- `weekly-backup-check` - Runs every Monday at 3 AM UTC
- `monthly-backup-drill` - Runs on 1st of month at 4 AM UTC

### Log Table

- `backup_check_logs` - Stores all check results (retains last 90 days)

## Viewing Results

### Check Recent Logs

```sql
SELECT * FROM public.backup_check_logs 
ORDER BY created_at DESC 
LIMIT 10;
```

### View Scheduled Jobs

```sql
SELECT 
  jobid,
  jobname,
  schedule,
  active
FROM cron.job 
WHERE jobname IN ('daily-backup-check', 'weekly-backup-check', 'monthly-backup-drill');
```

### Run Checks Manually

```sql
-- Test daily check
SELECT * FROM public.run_daily_backup_check();

-- Test weekly check
SELECT * FROM public.run_weekly_backup_check();

-- Test monthly drill
SELECT * FROM public.run_monthly_backup_drill();
```

## What Gets Checked

### Daily Checks
- ✅ Database connectivity
- ✅ Storage bucket accessibility
- ✅ Backup file counts
- ℹ️ Automatic backup status (info only - requires dashboard check)

### Weekly Checks
- ✅ Recent backup file counts (last 7 days)
- ✅ Data integrity (table record counts)
- ℹ️ Restoration test readiness (info only)

### Monthly Drill
- ✅ System health assessment
- ✅ Backup availability
- ✅ Recovery Time Objectives (RTO)
- ✅ Recovery Point Objectives (RPO)
- ✅ Overall drill status

## Advantages of Supabase pg_cron

✅ **No external dependencies** - Everything runs in Supabase  
✅ **No GitHub secrets needed** - No external API keys required  
✅ **No server maintenance** - Supabase manages the scheduling  
✅ **Direct database access** - Faster and more reliable  
✅ **Built-in logging** - Results stored in database  
✅ **Easy to monitor** - View logs directly in Supabase  

## Troubleshooting

### pg_cron Not Available

If you see "pg_cron extension not found":
1. Go to Supabase Dashboard → Database → Extensions
2. Enable `pg_cron` extension
3. Re-run the migration

### Jobs Not Running

Check if jobs are scheduled:
```sql
SELECT * FROM cron.job WHERE jobname LIKE '%backup%';
```

Check if jobs are active:
```sql
SELECT jobname, active, schedule 
FROM cron.job 
WHERE jobname IN ('daily-backup-check', 'weekly-backup-check', 'monthly-backup-drill');
```

### View Job Execution History

```sql
-- Check recent executions (if pg_cron logging is enabled)
SELECT * FROM cron.job_run_details 
WHERE jobid IN (
  SELECT jobid FROM cron.job 
  WHERE jobname LIKE '%backup%'
)
ORDER BY start_time DESC
LIMIT 10;
```

## Disabling Automation

### Disable Specific Job

```sql
-- Disable daily check
SELECT cron.unschedule('daily-backup-check');

-- Disable weekly check
SELECT cron.unschedule('weekly-backup-check');

-- Disable monthly drill
SELECT cron.unschedule('monthly-backup-drill');
```

### Disable All Backup Jobs

```sql
SELECT cron.unschedule(jobname)
FROM cron.job 
WHERE jobname IN ('daily-backup-check', 'weekly-backup-check', 'monthly-backup-drill');
```

## Re-enabling Jobs

If you need to re-enable jobs, just re-run the migration file. It will:
1. Remove existing jobs (if any)
2. Create fresh jobs with the same schedule

## Next Steps

1. ✅ Enable pg_cron extension in Supabase Dashboard
2. ✅ Run the migration SQL
3. ✅ Verify jobs are scheduled (check cron.job table)
4. ✅ Wait for first run or test manually
5. ✅ Check logs in `backup_check_logs` table

## Comparison with Other Methods

| Method | Setup Complexity | Maintenance | Reliability |
|--------|-----------------|-------------|-------------|
| **Supabase pg_cron** | ⭐ Easy | ⭐ None | ⭐⭐⭐ Excellent |
| GitHub Actions | ⭐⭐ Medium | ⭐ Low | ⭐⭐ Good |
| Local Cron | ⭐⭐⭐ Hard | ⭐⭐⭐ High | ⭐⭐ Good |
| Task Scheduler | ⭐⭐⭐ Hard | ⭐⭐⭐ High | ⭐⭐ Good |

**Recommendation**: Use Supabase pg_cron for the simplest, most reliable setup!

