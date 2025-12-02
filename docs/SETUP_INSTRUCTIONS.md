# Daily Digest - Quick Setup Instructions

## ✅ Already Done
- ✅ Database migration run
- ✅ pg_cron extension enabled
- ✅ Resend API key provided: `re_BtV1HscS_6C6wfY1VRpe2EfdS2k9XL5Eh`

## 🔧 What You Need to Do

### 1. Set Resend API Key in Supabase Dashboard

1. Go to: **Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**
2. Click **Add New Secret**
3. Name: `RESEND_API_KEY`
4. Value: `re_BtV1HscS_6C6wfY1VRpe2EfdS2k9XL5Eh`
5. Click **Save**

### 2. Deploy Edge Function

**Option A: Via Dashboard (if available)**
- Go to **Edge Functions** → **New Function**
- Name: `daily-digest`
- Copy code from `supabase/functions/daily-digest/index.ts`
- Paste and deploy

**Option B: Install Supabase CLI**
```powershell
# Install Node.js first if needed: https://nodejs.org
npm install -g supabase

# Then deploy
supabase functions deploy daily-digest
```

### 3. Set Up Cron Job

1. Go to: **Database** → **Cron Jobs**
2. Click **New Cron Job**
3. Configure:
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
4. **Get your Service Role Key**:
   - Go to **Project Settings** → **API**
   - Copy the **service_role** key (the secret one)
   - Replace `YOUR_SERVICE_ROLE_KEY` in the command above
5. Click **Save**

### 4. Verify Domain in Resend (For Production)

1. Go to: https://resend.com/domains
2. Add your domain
3. Add DNS records
4. Update email in function (line 179 of `daily-digest/index.ts`):
   - Change: `from: "Echo Garden <digest@echogarden.app>",`
   - To: `from: "Echo Garden <digest@yourdomain.com>",`

## 🧪 Test It

After deploying, test the function:

1. Go to **Edge Functions** → **daily-digest** → **Invoke**
2. Or use curl:
   ```bash
   curl -X GET "https://xgblxtopsapvacyaurcr.supabase.co/functions/v1/daily-digest" \
     -H "Authorization: Bearer YOUR_ANON_KEY"
   ```

Expected response: `{"status":"ok","message":"No recipients found for digest","recipients_count":0}`

## ✅ Checklist

- [ ] Resend API key set in Supabase secrets
- [ ] Edge function deployed
- [ ] Cron job created and scheduled
- [ ] Domain verified in Resend (for production)
- [ ] Test function works

## 🎉 That's It!

Once these steps are done, users can enable digests in Settings and start receiving emails!

