# Setting Up Automated Backup Scheduling

This guide will help you set up automated scheduling for the backup scripts.

## Prerequisites

1. **Environment Variables**: Set these before scheduling:
   ```bash
   export SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   ```

2. **Node.js**: Ensure Node.js 18+ is installed
   ```bash
   node --version
   ```

3. **Dependencies**: Install project dependencies
   ```bash
   npm install
   ```

## Option 1: GitHub Actions (Recommended for Cloud)

GitHub Actions automatically runs the backup checks on a schedule. This is the easiest option if your code is in GitHub.

### Setup Steps

1. **Add Secrets to GitHub**:
   - Go to your repository → Settings → Secrets and variables → Actions
   - Add these secrets:
     - `SUPABASE_URL`: Your Supabase project URL
     - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key

2. **Enable Workflows**:
   - The workflow file is already created at `.github/workflows/backup-checks.yml`
   - GitHub Actions will automatically run on the schedule:
     - **Daily**: 2 AM UTC every day
     - **Weekly**: 3 AM UTC every Monday
     - **Monthly**: 4 AM UTC on the 1st of each month

3. **Manual Trigger**:
   - You can also manually trigger workflows:
     - Go to Actions tab → "Automated Backup Checks" → "Run workflow"
     - Select the check type (daily/weekly/monthly)

### Viewing Results

- **Workflow Runs**: GitHub Actions → "Automated Backup Checks"
- **Logs**: Available in each workflow run
- **Artifacts**: Logs and reports are saved as artifacts for 30-365 days
- **Notifications**: Failed checks automatically create GitHub issues

## Option 2: Cron (Linux/Mac)

Use cron for scheduling on Linux or Mac systems.

### Setup Steps

1. **Run the setup script**:
   ```bash
   chmod +x scripts/backup/setup-cron.sh
   ./scripts/backup/setup-cron.sh
   ```

2. **Install the cron jobs**:
   ```bash
   crontab backup-cron.txt
   ```

3. **Verify installation**:
   ```bash
   crontab -l
   ```

### Manual Setup

If you prefer to set up manually, add these lines to your crontab (`crontab -e`):

```bash
# Daily backup check at 2 AM UTC
0 2 * * * cd /path/to/project && node scripts/backup/daily-backup-check.mjs >> logs/cron.log 2>&1

# Weekly backup check on Monday at 3 AM UTC
0 3 * * 1 cd /path/to/project && node scripts/backup/weekly-backup-check.mjs >> logs/cron.log 2>&1

# Monthly disaster recovery drill on first day of month at 4 AM UTC
0 4 1 * * cd /path/to/project && node scripts/backup/monthly-backup-drill.mjs >> logs/cron.log 2>&1
```

**Important**: Replace `/path/to/project` with your actual project path.

### Setting Environment Variables in Cron

Cron doesn't load your shell environment. Set variables in the crontab:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

0 2 * * * cd /path/to/project && node scripts/backup/daily-backup-check.mjs >> logs/cron.log 2>&1
```

Or use a `.env` file and load it in the script.

## Option 3: Task Scheduler (Windows)

Use Windows Task Scheduler for automation on Windows.

### Setup Steps

1. **Open PowerShell as Administrator**

2. **Run the setup script**:
   ```powershell
   .\scripts\backup\setup-cron.ps1
   ```

3. **Verify tasks**:
   ```powershell
   Get-ScheduledTask | Where-Object { $_.TaskName -like 'EchoGarden-Backup-*' }
   ```

### Manual Setup

1. Open **Task Scheduler** (search in Start menu)

2. Create a new task for each backup check:
   - **General Tab**:
     - Name: `EchoGarden-Backup-Daily`
     - Run whether user is logged on or not
     - Run with highest privileges
   
   - **Triggers Tab**:
     - New → Daily → 2:00 AM
     - Repeat: Daily
   
   - **Actions Tab**:
     - New → Start a program
     - Program: `node.exe`
     - Arguments: `"C:\path\to\project\scripts\backup\daily-backup-check.mjs"`
     - Start in: `C:\path\to\project`
   
   - **Conditions Tab**:
     - Uncheck "Start the task only if the computer is on AC power"
     - Check "Start only if the following network connection is available"
   
   - **Settings Tab**:
     - Allow task to be run on demand
     - If the task fails, restart every: 1 hour

3. **Set Environment Variables**:
   - In the Action, add environment variables:
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`

## Option 4: Other Cloud Services

### Vercel Cron Jobs

If deploying on Vercel, you can use Vercel Cron:

1. Create `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/backup-daily",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/backup-weekly",
      "schedule": "0 3 * * 1"
    },
    {
      "path": "/api/cron/backup-monthly",
      "schedule": "0 4 1 * *"
    }
  ]
}
```

2. Create API routes that call the backup scripts.

### Netlify Scheduled Functions

If deploying on Netlify:

1. Create scheduled functions in `netlify/functions/`
2. Configure in `netlify.toml`:
```toml
[build]
  functions = "netlify/functions"

[[plugins]]
  package = "@netlify/plugin-scheduled-functions"
```

## Verifying Your Setup

After setting up scheduling, verify it's working:

1. **Check logs**:
   ```bash
   # Linux/Mac
   tail -f logs/cron.log
   
   # Windows
   Get-Content logs\cron.log -Tail 50 -Wait
   ```

2. **Run manually first**:
   ```bash
   node scripts/backup/daily-backup-check.mjs
   ```

3. **Check scheduled runs**:
   - GitHub Actions: Check Actions tab
   - Cron: Check `logs/cron.log`
   - Task Scheduler: Check Task Scheduler history

## Troubleshooting

### Scripts not running

1. **Check environment variables are set**
2. **Verify Node.js path is correct**
3. **Check file permissions** (Linux/Mac: `chmod +x scripts/backup/*.mjs`)
4. **Review error logs**

### Permission errors

- **Linux/Mac**: Ensure scripts are executable (`chmod +x`)
- **Windows**: Run Task Scheduler setup as Administrator
- **GitHub Actions**: Check secrets are correctly set

### Time zone issues

All schedules use UTC. Adjust cron/Task Scheduler times for your timezone:
- UTC 2 AM = EST 9 PM (previous day) / PST 6 PM (previous day)
- UTC 3 AM = EST 10 PM (previous day) / PST 7 PM (previous day)
- UTC 4 AM = EST 11 PM (previous day) / PST 8 PM (previous day)

## Disabling Automation

### GitHub Actions
- Go to Actions → Workflows → "Automated Backup Checks" → Disable workflow

### Cron
```bash
crontab -r  # Remove all cron jobs
# Or edit: crontab -e and remove the backup lines
```

### Task Scheduler
```powershell
Get-ScheduledTask | Where-Object { $_.TaskName -like 'EchoGarden-Backup-*' } | Unregister-ScheduledTask
```

## Next Steps

1. ✅ Set up your preferred scheduling method
2. ✅ Verify scripts run successfully
3. ✅ Monitor logs for the first few runs
4. ✅ Set up alerts for failures (GitHub Actions does this automatically)
5. ✅ Review reports in `logs/` directory

For more details, see [scripts/backup/README.md](./README.md).

