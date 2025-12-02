# Backup Automation Scripts

Automated scripts for daily, weekly, and monthly backup verification and testing.

## Scripts

### Daily Backup Check (`daily-backup-check.mjs`)

Runs daily to verify:
- Automatic backups are running (Supabase managed)
- Backup storage space is adequate
- Database connectivity
- Storage bucket accessibility

**Usage:**
```bash
node scripts/backup/daily-backup-check.mjs
```

**Schedule:** Run daily (recommended: 2 AM UTC)

**Output:**
- Logs to `logs/backup-check-YYYY-MM-DD.log`
- Report to `logs/backup-report-YYYY-MM-DD.json`

### Weekly Backup Check (`weekly-backup-check.mjs`)

Runs weekly to:
- Test backup restoration (dry run)
- Review backup logs
- Verify backup integrity
- Create weekly backup metadata

**Usage:**
```bash
node scripts/backup/weekly-backup-check.mjs
```

**Schedule:** Run weekly (recommended: Monday 3 AM UTC)

**Output:**
- Logs to `logs/weekly-backup-check-YYYY-MM-DD.log`
- Report to `logs/weekly-backup-report-YYYY-MM-DD.json`
- Backup metadata to `backups/weekly-backup-YYYY-MM-DD.json`

### Monthly Disaster Recovery Drill (`monthly-backup-drill.mjs`)

Runs monthly to:
- Perform full disaster recovery drill simulation
- Review and update procedures
- Document any issues

**Usage:**
```bash
node scripts/backup/monthly-backup-drill.mjs
```

**Schedule:** Run monthly (recommended: First day of month, 4 AM UTC)

**Output:**
- Logs to `logs/monthly-drill-YYYY-MM-DD.log`
- Report to `logs/monthly-drill-report-YYYY-MM-DD.json`
- Issues document to `logs/drill-issues-YYYY-MM-DD.json`

## Environment Variables

All scripts require:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

Set these in your environment or `.env` file:
```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

## Scheduling

**📖 For detailed scheduling setup instructions, see:**
- **[SETUP_SUPABASE_CRON.md](./SETUP_SUPABASE_CRON.md)** - ⭐ **Recommended!** Supabase pg_cron (easiest, no external setup)
- [SETUP_SCHEDULING.md](./SETUP_SCHEDULING.md) - GitHub Actions, Cron, Task Scheduler

### Quick Setup Options

1. **Supabase pg_cron** ⭐ **RECOMMENDED - Easiest!**
   - Enable `pg_cron` extension in Supabase Dashboard
   - Run migration: `supabase/migrations/20250128000002_setup_backup_automation_cron.sql`
   - Everything runs in Supabase - no external scripts needed!
   - See [SETUP_SUPABASE_CRON.md](./SETUP_SUPABASE_CRON.md) for details

2. **GitHub Actions** (Already configured!)
   - Workflow file: `.github/workflows/backup-checks.yml`
   - Just add secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   - Automatically runs on schedule

3. **Cron (Linux/Mac)**
   ```bash
   chmod +x scripts/backup/setup-cron.sh
   ./scripts/backup/setup-cron.sh
   crontab backup-cron.txt
   ```

4. **Task Scheduler (Windows)**
   ```powershell
   # Run PowerShell as Administrator
   .\scripts\backup\setup-cron.ps1
   ```

## Output Files

All scripts generate:
- **Log files**: Text logs in `logs/` directory
- **JSON reports**: Structured reports in `logs/` directory
- **Backup files**: Weekly backups in `backups/` directory

## Exit Codes

- `0`: All checks passed
- `1`: One or more checks failed

Use exit codes for monitoring and alerting.

## Manual Execution

You can run any script manually for testing:

```bash
# Test daily check
node scripts/backup/daily-backup-check.mjs

# Test weekly check
node scripts/backup/weekly-backup-check.mjs

# Test monthly drill
node scripts/backup/monthly-backup-drill.mjs
```

## Troubleshooting

### Script fails with "Missing required environment variables"

Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set:
```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

### Script fails with "Database connectivity failed"

- Check Supabase project is active
- Verify service role key is correct
- Check network connectivity

### Storage bucket checks fail

- Ensure buckets exist in Supabase Storage
- Verify service role key has storage access
- Check bucket names match (`audio`, `backups`)

## Notes

- Supabase automatic backups are managed by Supabase and cannot be directly verified via API
- Manual verification of automatic backups requires checking Supabase Dashboard
- Storage quota checks require manual verification in Supabase Dashboard
- These scripts focus on verifying backup infrastructure and processes, not creating actual database dumps

