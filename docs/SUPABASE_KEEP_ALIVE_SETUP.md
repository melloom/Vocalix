# Supabase Keep-Alive Setup Guide

This guide explains how to prevent your Supabase project from pausing after 7 days of inactivity.

## 🎯 Why This Is Needed

Supabase free tier projects automatically pause after **7 days of inactivity**. When paused:
- Your database is unavailable
- API endpoints don't respond
- Your application stops working
- You need to manually unpause from the dashboard

## ✅ Solution: Automatic Keep-Alive

We've set up an automatic keep-alive system that pings your Supabase database every 6 days to keep it active.

## 🚀 Setup Instructions

### Option 1: SQL Migration with pg_cron (Recommended - Built-in & Automatic)

**This is the best option** - it runs directly in your Supabase database using pg_cron, which you already have set up!

#### Step 1: Run the Migration

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Open the migration file: `supabase/migrations/20251220000007_add_supabase_keep_alive_cron.sql`
4. Copy and paste the entire SQL into the SQL Editor
5. Click **Run**

That's it! The cron job will be scheduled automatically.

#### Step 2: Verify It's Working

Run this query in SQL Editor to check:

```sql
SELECT 
  jobid,
  jobname,
  schedule,
  active
FROM cron.job 
WHERE jobname = 'supabase-keep-alive';
```

You should see a row with:
- `jobname`: `supabase-keep-alive`
- `schedule`: `0 2 */6 * *` (every 6 days at 2 AM UTC)
- `active`: `true`

#### Step 3: Test It (Optional)

Test the function manually:

```sql
SELECT public.keep_supabase_active();
```

Or trigger the cron job immediately:

```sql
SELECT cron.run_job((SELECT jobid FROM cron.job WHERE jobname = 'supabase-keep-alive'));
```

**That's it!** The keep-alive will run automatically every 6 days. No external services needed!

### Option 2: GitHub Actions (Alternative - Free & Automatic)

This is the easiest and most reliable option. It runs automatically in the cloud for free.

#### Step 1: Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these secrets:

   **Secret 1:**
   - Name: `SUPABASE_URL`
   - Value: Your Supabase project URL (e.g., `https://your-project.supabase.co`)
   - Get it from: Supabase Dashboard → Settings → API → Project URL

   **Secret 2:**
   - Name: `SUPABASE_ANON_KEY`
   - Value: Your Supabase anonymous/public key
   - Get it from: Supabase Dashboard → Settings → API → anon/public key

#### Step 2: Verify Workflow File

The workflow file is already created at `.github/workflows/keep-alive.yml`. It will:
- Run automatically every 6 days at 2 AM UTC
- Make a lightweight query to your Supabase database
- Keep your project active

#### Step 3: Test It (Optional)

1. Go to your GitHub repository
2. Navigate to **Actions** tab
3. Find "Supabase Keep-Alive" workflow
4. Click **Run workflow** to test it manually

### Option 2: Local Cron Job (Alternative)

If you prefer to run it from your own server or computer:

#### Step 1: Install Dependencies

```bash
npm install
```

#### Step 2: Set Environment Variables

Create a `.env` file or export variables:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key-here"
```

Or use the existing Vite variables:

```bash
export VITE_SUPABASE_URL="https://your-project.supabase.co"
export VITE_SUPABASE_ANON_KEY="your-anon-key-here"
```

#### Step 3: Test the Script

```bash
node scripts/keep-alive.mjs
```

You should see:
```
🔄 Pinging Supabase to prevent pause...
✅ Supabase database query successful
✅ Keep-alive ping completed successfully
```

#### Step 4: Set Up Cron Job

**On Linux/Mac:**

```bash
# Edit crontab
crontab -e

# Add this line to run every 6 days at 2 AM
0 2 */6 * * cd /path/to/your/project && /usr/bin/node scripts/keep-alive.mjs >> /tmp/supabase-keepalive.log 2>&1
```

**On Windows (Task Scheduler):**

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger: Daily, repeat every 6 days
4. Action: Start a program
5. Program: `node`
6. Arguments: `C:\path\to\your\project\scripts\keep-alive.mjs`
7. Start in: `C:\path\to\your\project`

### Option 3: External Cron Service (Alternative)

Use a free service like:
- [cron-job.org](https://cron-job.org) - Free cron service
- [EasyCron](https://www.easycron.com) - Free tier available
- [UptimeRobot](https://uptimerobot.com) - Free monitoring with HTTP checks

**Setup with cron-job.org:**

1. Sign up at [cron-job.org](https://cron-job.org)
2. Create a new cron job
3. Set URL to: `https://your-project.supabase.co/rest/v1/`
4. Set headers:
   - `apikey`: Your Supabase anon key
   - `Authorization`: `Bearer your-anon-key`
5. Set schedule: Every 6 days
6. Save and activate

## 🔍 How It Works

### SQL/pg_cron Method (Recommended)
1. A PostgreSQL function performs a lightweight query on the database
2. pg_cron schedules it to run every 6 days at 2 AM UTC
3. This activity counts as "activity" and resets the 7-day inactivity timer
4. Runs entirely within Supabase - no external dependencies

### GitHub Actions Method (Alternative)
1. Connects to your Supabase database using the public API
2. Makes a lightweight query (fetches 1 row from profiles table)
3. This activity counts as "activity" and resets the 7-day inactivity timer
4. Runs every 6 days to ensure continuous activity

## 📊 Monitoring

### GitHub Actions

Check the workflow runs:
1. Go to **Actions** tab in your GitHub repo
2. Click on "Supabase Keep-Alive" workflow
3. View recent runs and their status

### Manual Check

Run the script manually anytime:
```bash
node scripts/keep-alive.mjs
```

## 🛠️ Troubleshooting

### Error: Missing environment variables

**Solution:** Make sure you've set the required secrets in GitHub or environment variables locally.

### Error: Network error or failed to fetch

**Possible causes:**
- Supabase project is already paused (unpause it manually first)
- Incorrect URL or API key
- Network connectivity issues

**Solution:**
1. Check your Supabase dashboard to see if project is paused
2. Verify the URL and API key are correct
3. Try running the script manually to see detailed error messages

### Error: Query returned error

**Solution:** This is usually fine - the script will fall back to a simple API ping. The important thing is that it makes a request to Supabase, which counts as activity.

### Workflow not running automatically

**Check:**
1. Make sure the workflow file exists at `.github/workflows/keep-alive.yml`
2. Verify the workflow is enabled in GitHub Actions settings
3. Check that you've committed and pushed the workflow file

## 🔒 Security Notes

- The script uses your **anon/public key**, which is safe to use in public repositories
- Never commit your **service role key** - it's not needed for this script
- The anon key is designed to be public and has limited permissions

## 📅 Schedule Details

The GitHub Actions workflow runs:
- **Frequency:** Every 6 days
- **Time:** 2:00 AM UTC
- **Why 6 days?** To ensure activity before the 7-day inactivity threshold

You can manually trigger it anytime from the GitHub Actions tab.

## ✅ Verification

After setup, verify it's working:

1. **Check GitHub Actions:**
   - Go to Actions tab
   - Look for successful "Supabase Keep-Alive" runs

2. **Check Supabase Dashboard:**
   - Your project should show as "Active"
   - No pause warnings should appear

3. **Test manually:**
   ```bash
   node scripts/keep-alive.mjs
   ```

## 🎉 That's It!

Once set up, your Supabase project will stay active automatically. You don't need to do anything else - the keep-alive runs in the background and prevents your project from pausing.

---

**Last Updated:** 2025-01-20

