# Daily Digest Feature Setup Guide

## Overview

The Daily Digest feature sends users email digests with the best clips from topics they follow. Users can customize the frequency (daily, weekly, or never) and provide their email address.

## Implementation Summary

✅ **Completed Components:**

1. **Database Migration** (`supabase/migrations/20251207000000_add_daily_digest.sql`)
   - Added `email`, `digest_enabled`, `digest_frequency`, and `digest_last_sent_at` columns to `profiles` table
   - Created `get_digest_clips()` function to fetch best clips from followed topics
   - Created `generate_user_digest()` function to generate digest data for a user
   - Created `get_digest_recipients()` function to get users who should receive digests

2. **Edge Function** (`supabase/functions/daily-digest/index.ts`)
   - Generates digest content using database functions
   - Sends emails via Resend API
   - Updates `digest_last_sent_at` timestamp after successful send
   - Supports processing single user or batch processing

3. **UI Settings** (`src/pages/Settings.tsx`)
   - Added digest toggle switch
   - Added email input field
   - Added frequency selector (daily, weekly, never)
   - Integrated with profile update system

## Setup Instructions

### 1. Run Database Migration

Apply the migration to add digest-related columns and functions:

```bash
supabase migration up
```

Or apply manually in Supabase Dashboard:
- Go to SQL Editor
- Run the contents of `supabase/migrations/20251207000000_add_daily_digest.sql`

### 2. Set Up Resend Email Service

1. **Sign up for Resend** at [resend.com](https://resend.com)
2. **Get your API key** from the Resend dashboard
3. **Add API key to Supabase Edge Functions secrets:**

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx
```

Or in Supabase Dashboard:
- Go to Project Settings → Edge Functions → Secrets
- Add `RESEND_API_KEY` with your Resend API key

4. **Verify your domain** in Resend (required for production)
   - Add your domain in Resend dashboard
   - Add DNS records as instructed
   - Update the `from` email in `daily-digest/index.ts` to use your verified domain

### 3. Deploy Edge Function

Deploy the daily-digest edge function:

```bash
supabase functions deploy daily-digest
```

### 4. Set Up Cron Job

Set up a cron job to run the digest function daily. You can use:

**Option A: Supabase Cron (Recommended)**
- Go to Supabase Dashboard → Database → Cron Jobs
- Create a new cron job:
  - Name: `daily-digest`
  - Schedule: `0 9 * * *` (9 AM UTC daily)
  - SQL: 
    ```sql
    SELECT net.http_post(
      url := 'https://YOUR_PROJECT.supabase.co/functions/v1/daily-digest',
      headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
    );
    ```

**Option B: External Cron Service**
- Use a service like GitHub Actions, Vercel Cron, or a dedicated cron service
- Schedule to call: `https://YOUR_PROJECT.supabase.co/functions/v1/daily-digest`

**Option C: Manual Testing**
- Call the function manually:
  ```bash
  curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/daily-digest \
    -H "Authorization: Bearer YOUR_ANON_KEY"
  ```

### 5. Environment Variables

Ensure these environment variables are set in your Supabase Edge Functions:

- `SUPABASE_URL` - Your Supabase project URL (auto-set)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (auto-set)
- `RESEND_API_KEY` - Your Resend API key (set manually)
- `APP_URL` - Your app URL (optional, defaults to "https://echogarden.app")

Set `APP_URL` if different:
```bash
supabase secrets set APP_URL=https://yourdomain.com
```

## Usage

### For Users

1. Go to Settings page
2. Enable "Email digest" toggle
3. Enter your email address
4. Select frequency (Daily or Weekly)
5. Save settings

### For Administrators

**Test digest for a single user:**
```bash
curl -X GET "https://YOUR_PROJECT.supabase.co/functions/v1/daily-digest?user_id=USER_UUID" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Process all daily digests:**
```bash
curl -X GET "https://YOUR_PROJECT.supabase.co/functions/v1/daily-digest?frequency=daily" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Process all weekly digests:**
```bash
curl -X GET "https://YOUR_PROJECT.supabase.co/functions/v1/daily-digest?frequency=weekly" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## How It Works

1. **Digest Generation:**
   - Finds users with `digest_enabled = true` and valid email
   - Checks if enough time has passed since last digest (based on frequency)
   - Gets top clips from topics the user follows (last 24 hours)
   - Ranks clips by trending score
   - Selects top 10 clips

2. **Email Sending:**
   - Generates HTML and plain text email templates
   - Includes clip title, transcription preview, creator info, engagement stats
   - Sends via Resend API
   - Updates `digest_last_sent_at` timestamp

3. **Personalization:**
   - Only includes clips from topics the user follows
   - Prioritizes clips with higher trending scores
   - Shows clips from last 24 hours (for daily) or last 7 days (for weekly)

## Email Template

The email includes:
- Personalized greeting with user's handle
- List of top clips with:
  - Creator avatar and handle
  - Clip title
  - Transcription preview
  - Duration, listens, reactions
  - Topic tag
  - Direct link to listen
- Link to open Echo Garden
- Link to manage digest preferences

## Troubleshooting

**Emails not sending:**
- Check Resend API key is set correctly
- Verify domain is verified in Resend
- Check Resend dashboard for error logs
- Ensure user has valid email and digest enabled

**No recipients found:**
- Users need to have `digest_enabled = true`
- Users need a valid email address
- Users need to follow at least one topic
- Check if enough time has passed since last digest

**Function errors:**
- Check Supabase Edge Functions logs
- Verify database functions are created
- Ensure RLS policies allow function execution
- Check that trending scores are being calculated

## Future Enhancements

Potential improvements:
- [ ] Add digest preview in app before sending
- [ ] Allow users to customize number of clips per digest
- [ ] Add digest analytics (open rates, click rates)
- [ ] Support for digest digests (weekly summary of daily digests)
- [ ] A/B testing for email templates
- [ ] Timezone-aware sending times
- [ ] Digest archive in user profile

