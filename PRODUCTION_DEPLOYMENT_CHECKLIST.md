# Production Deployment Checklist for Spotlight Question System

## ✅ Steps to Deploy to Production

### 1. Run Database Migrations in Production Supabase

Go to your **Production Supabase Dashboard** → **SQL Editor** and run these migrations in order:

1. **Create the table:**
   - File: `supabase/migrations/20250131000000_create_daily_spotlight_questions.sql`
   - Copy the SQL and run it

2. **Update the function:**
   - File: `supabase/migrations/20250131000001_update_spotlight_question_function.sql`
   - Copy the SQL and run it

3. **Set up cron job:**
   - File: `supabase/migrations/20250131000002_setup_daily_spotlight_question_cron.sql`
   - Copy the SQL and run it

### 2. Deploy Edge Function to Production

Run this command (make sure you're connected to production Supabase):

```bash
npx supabase functions deploy daily-spotlight-question --project-ref YOUR_PROJECT_REF
```

Or if you're using the Supabase CLI with linked project:
```bash
npx supabase functions deploy daily-spotlight-question
```

### 3. Generate Today's Question

**Option A: Via Supabase Dashboard**
1. Go to **Edge Functions** → **daily-spotlight-question**
2. Click **"Invoke function"**
3. This will generate today's question

**Option B: Via SQL (Manual Question)**
Run `temp_link_question_to_topic.sql` in SQL Editor to create a manual question for today

### 4. Verify Frontend is Deployed

If using Netlify/Vercel, it should auto-deploy when you push to git. Check:
- Netlify: Go to Deploys tab, make sure latest commit is deployed
- Vercel: Check Deployments, make sure latest is live

### 5. Clear Browser Cache

After deployment:
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Or clear browser cache

## 🔍 Troubleshooting

### Question not showing?
1. Check browser console for errors
2. Verify the function `get_spotlight_question()` returns data in Supabase SQL Editor:
   ```sql
   SELECT * FROM get_spotlight_question();
   ```
3. Check if question exists for today:
   ```sql
   SELECT * FROM daily_spotlight_questions WHERE date = CURRENT_DATE;
   ```

### Edge function not working?
1. Check Edge Functions logs in Supabase Dashboard
2. Verify `OPENAI_API_KEY` is set in Supabase → Settings → Edge Functions → Secrets
3. Test the function manually via Dashboard

### Frontend not updating?
1. Check if build completed successfully
2. Verify environment variables are set correctly
3. Hard refresh browser (Ctrl+Shift+R)

