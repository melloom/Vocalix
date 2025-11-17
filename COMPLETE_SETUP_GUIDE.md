# Complete Daily Digest Setup Guide

## ✅ What's Already Done
- ✅ Database migration applied
- ✅ pg_cron extension enabled  
- ✅ Resend API key: `re_BtV1HscS_6C6wfY1VRpe2EfdS2k9XL5Eh`

## 🚀 Complete These 3 Steps

### Step 1: Set Resend API Key in Supabase

1. Go to **Supabase Dashboard**
2. Navigate to: **Project Settings** (⚙️ icon) → **Edge Functions** → **Secrets** tab
3. Click **Add New Secret**
4. Enter:
   - **Name**: `RESEND_API_KEY`
   - **Value**: `re_BtV1HscS_6C6wfY1VRpe2EfdS2k9XL5Eh`
5. Click **Save**

### Step 2: Deploy Edge Function

**Option A: Using Supabase Dashboard**
1. Go to **Edge Functions** in sidebar
2. Click **New Function** or **Deploy Function**
3. Name: `daily-digest`
4. Copy the entire contents of `supabase/functions/daily-digest/index.ts`
5. Paste into the code editor
6. Click **Deploy** or **Save**

**Option B: Install Supabase CLI (Recommended)**
```powershell
# Install Node.js if needed: https://nodejs.org
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project (if not already linked)
supabase link --project-ref xgblxtopsapvacyaurcr

# Deploy the function
supabase functions deploy daily-digest
```

### Step 3: Set Up Cron Job

**Option A: Using SQL Script (Easiest)**

1. Go to **Database** → **SQL Editor** in Supabase Dashboard
2. Open the file `setup-cron-job.sql`
3. **IMPORTANT**: Replace `YOUR_SERVICE_ROLE_KEY` with your actual service role key:
   - Go to **Project Settings** → **API**
   - Copy the **service_role** key (the secret one, not the anon key)
   - Replace `YOUR_SERVICE_ROLE_KEY` in the SQL script
4. Run the entire script
5. You should see: `✅ Cron job "daily-digest" scheduled successfully!`

**Option B: Using Cron Jobs UI**

1. Go to **Database** → **Cron Jobs**
2. Click **New Cron Job**
3. Fill in:
   - **Name**: `daily-digest`
   - **Schedule**: `0 9 * * *` (9 AM UTC daily)
   - **Command**:
     ```sql
     SELECT net.http_post(
       url := 'https://xgblxtopsapvacyaurcr.supabase.co/functions/v1/daily-digest',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
       ),
       body := '{}'::jsonb
     );
     ```
4. Replace `YOUR_SERVICE_ROLE_KEY` with your actual key
5. Click **Save**

## 🧪 Test It

After completing all steps, test the function:

1. Go to **Edge Functions** → **daily-digest** → **Invoke**
2. Or use this in SQL Editor:
   ```sql
   SELECT net.http_post(
     url := 'https://xgblxtopsapvacyaurcr.supabase.co/functions/v1/daily-digest',
     headers := jsonb_build_object(
       'Content-Type', 'application/json',
       'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
     ),
     body := '{}'::jsonb
   );
   ```

Expected response: `{"status":"ok","message":"No recipients found for digest","recipients_count":0}`

## 📧 Verify Domain in Resend (For Production Emails)

1. Go to https://resend.com/domains
2. Click **Add Domain**
3. Enter your domain
4. Add the DNS records to your domain registrar
5. Wait for verification
6. Once verified, update the email in the edge function:
   - Edit `supabase/functions/daily-digest/index.ts` line 179
   - Change: `from: "Echo Garden <digest@echogarden.app>",`
   - To: `from: "Echo Garden <digest@yourdomain.com>",`
   - Redeploy the function

## ✅ Final Checklist

- [ ] Resend API key set in Supabase secrets
- [ ] Edge function deployed
- [ ] Cron job created and scheduled
- [ ] Test function works
- [ ] Domain verified in Resend (optional, for production)

## 🎉 You're Done!

Users can now:
1. Go to **Settings** in your app
2. Enable **"Email digest"** toggle
3. Enter their email address
4. Select frequency (Daily/Weekly)
5. Start receiving digests with the best clips from topics they follow!

## 🐛 Troubleshooting

**"No recipients found"** = Normal if no users have digests enabled yet

**"RESEND_API_KEY not set"** = Complete Step 1

**Cron job not running** = Check pg_cron is enabled and job is scheduled correctly

**Function errors** = Check Edge Functions logs in Dashboard

