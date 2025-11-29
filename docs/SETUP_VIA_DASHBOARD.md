# Daily Digest Setup via Supabase Dashboard

Since you don't have Supabase CLI installed, here's how to set everything up via the Dashboard:

## ✅ Step 1: Set Resend API Key

1. Go to **Supabase Dashboard** → Your Project
2. Navigate to **Project Settings** (gear icon in sidebar)
3. Click **Edge Functions** in the left menu
4. Click **Secrets** tab
5. Click **Add New Secret**
6. Enter:
   - **Name**: `RESEND_API_KEY`
   - **Value**: `re_BtV1HscS_6C6wfY1VRpe2EfdS2k9XL5Eh`
7. Click **Save**

## ✅ Step 2: Deploy Edge Function

### Option A: Using Supabase Dashboard (if available)

1. Go to **Edge Functions** in the sidebar
2. Click **Deploy Function** or **New Function**
3. Upload/select the `daily-digest` folder from `supabase/functions/daily-digest/`
4. Deploy

### Option B: Install Supabase CLI (Recommended)

```powershell
# Install via npm (if you have Node.js)
npm install -g supabase

# Or via Scoop (Windows package manager)
scoop install supabase

# Then deploy
supabase functions deploy daily-digest
```

### Option C: Manual Deployment via Dashboard

1. Go to **Edge Functions** → **New Function**
2. Name: `daily-digest`
3. Copy the contents of `supabase/functions/daily-digest/index.ts`
4. Paste into the editor
5. Click **Deploy**

## ✅ Step 3: Set Up Cron Job

Since you've enabled pg_cron, let's set up the cron job:

1. Go to **Database** → **Cron Jobs** in the sidebar
2. Click **New Cron Job**
3. Fill in:
   - **Name**: `daily-digest`
   - **Schedule**: `0 9 * * *` (runs daily at 9 AM UTC)
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
4. **Important**: Replace `YOUR_SERVICE_ROLE_KEY` with your actual service role key:
   - Go to **Project Settings** → **API**
   - Copy the **service_role** key (keep it secret!)
   - Paste it in the command above
5. Click **Save**

## ✅ Step 4: Verify Domain in Resend

1. Go to [Resend Dashboard](https://resend.com/domains)
2. Click **Add Domain**
3. Enter your domain
4. Add the DNS records they provide to your domain registrar
5. Wait for verification (usually a few minutes)
6. Once verified, update the email in the edge function:
   - Go to **Edge Functions** → **daily-digest**
   - Edit the function
   - Find line 179: `from: "Echo Garden <digest@echogarden.app>",`
   - Change to: `from: "Echo Garden <digest@yourdomain.com>",`
   - Save and redeploy

## ✅ Step 5: Test It!

1. Go to **Edge Functions** → **daily-digest** → **Invoke**
2. Or use this curl command:
   ```bash
   curl -X GET "https://xgblxtopsapvacyaurcr.supabase.co/functions/v1/daily-digest" \
     -H "Authorization: Bearer YOUR_ANON_KEY"
   ```
3. Should return: `{"status":"ok","message":"No recipients found for digest","recipients_count":0}`

## 🎉 Done!

Users can now:
1. Go to Settings in your app
2. Enable "Email digest"
3. Enter their email
4. Select frequency (Daily/Weekly)
5. Start receiving digests!

## 📝 Quick Reference

- **Resend API Key**: Already set ✅
- **pg_cron Extension**: Enabled ✅
- **Edge Function**: Needs deployment
- **Cron Job**: Needs setup (see Step 3)
- **Domain Verification**: Needs setup (see Step 4)

