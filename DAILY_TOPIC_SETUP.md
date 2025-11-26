# Daily Topic System Setup Guide

This guide explains how to set up the automated daily topic generation system.

## Overview

The daily topic system automatically generates a new topic every day using:
- **AI Generation**: OpenAI GPT-4o-mini (if configured)
- **Fallback System**: Rotating pool of 15 curated topics
- **Cron Job**: Automated daily execution

## Components

### 1. Edge Function: `daily-topic`
Location: `supabase/functions/daily-topic/index.ts`

This function:
- Checks if today's topic already exists
- Generates a new topic using AI (if available) or fallback
- Ensures variety by checking last 30 days of topics
- Handles race conditions and duplicates safely

### 2. Database Functions
- `upsert_system_topic()`: Safely creates/updates daily topics
- `check_today_topic()`: Monitoring function to check if today's topic exists
- `get_trending_topics()`: Returns trending topics (deduplicated by title)

### 3. Cron Job
Automated daily execution at 12:00 PM UTC

## Setup Instructions

### Option 1: Using Supabase Dashboard (Recommended)

1. **Enable Extensions**:
   - Go to Supabase Dashboard → Database → Extensions
   - Enable `pg_cron` (if available)
   - Enable `pg_net` (for calling edge functions from SQL)

2. **Set Up Cron Job**:
   - Go to Supabase Dashboard → Database → Cron Jobs
   - Create a new cron job:
     - **Name**: `daily-topic-generation`
     - **Schedule**: `0 12 * * *` (12:00 PM UTC daily)
     - **Command**: Call the edge function via HTTP

3. **Configure Environment Variables**:
   - Go to Supabase Dashboard → Edge Functions → Settings
   - Ensure `OPENAI_API_KEY` is set (optional, for AI generation)
   - `SUPABASE_URL` and `SERVICE_ROLE_KEY` are automatically available

### Option 2: Using External Cron (GitHub Actions, Vercel, etc.)

If `pg_cron` is not available, use an external scheduler:

**Example: GitHub Actions** (`.github/workflows/daily-topic.yml`):
```yaml
name: Generate Daily Topic
on:
  schedule:
    - cron: '0 12 * * *'  # 12:00 PM UTC daily
  workflow_dispatch:  # Allow manual trigger

jobs:
  generate-topic:
    runs-on: ubuntu-latest
    steps:
      - name: Call Daily Topic Function
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            https://YOUR_PROJECT.supabase.co/functions/v1/daily-topic
```

**Example: Vercel Cron** (`vercel.json`):
```json
{
  "crons": [{
    "path": "/api/cron/daily-topic",
    "schedule": "0 12 * * *"
  }]
}
```

Then create `api/cron/daily-topic.ts`:
```typescript
export default async function handler(req, res) {
  const response = await fetch(
    'https://YOUR_PROJECT.supabase.co/functions/v1/daily-topic',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  res.status(response.status).json(await response.json());
}
```

### Option 3: Manual SQL Cron (if pg_cron is enabled)

Run the migration:
```bash
supabase db push
```

Or manually in Supabase Dashboard → SQL Editor:
```sql
-- Run the migration file: 20250224000002_setup_daily_topic_cron.sql
```

## Testing

### Test the Edge Function Manually

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  https://YOUR_PROJECT.supabase.co/functions/v1/daily-topic
```

### Check if Today's Topic Exists

```sql
SELECT * FROM public.check_today_topic();
```

### Monitor Daily Topic Status

```sql
SELECT * FROM public.daily_topic_status;
```

### Manually Trigger Cron Job (if using pg_cron)

```sql
SELECT cron.run_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'daily-topic-generation')
);
```

## Troubleshooting

### Topic Not Generating

1. **Check Edge Function Logs**:
   - Supabase Dashboard → Edge Functions → daily-topic → Logs

2. **Verify Cron Job**:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'daily-topic-generation';
   ```

3. **Check Today's Topic**:
   ```sql
   SELECT * FROM public.topics 
   WHERE date = CURRENT_DATE 
     AND is_active = true 
     AND user_created_by IS NULL;
   ```

4. **Test Function Manually**:
   Use the curl command above to test the edge function directly

### Duplicate Topics Appearing

The system prevents duplicates by:
- Unique constraint on `date` for system topics
- Deduplication in `get_trending_topics()` function
- Title checking in the edge function

If duplicates appear:
1. Check for multiple cron jobs running
2. Verify the unique constraint exists:
   ```sql
   SELECT * FROM pg_indexes WHERE indexname = 'idx_topics_date_system_unique';
   ```

### AI Generation Not Working

1. **Check OpenAI API Key**:
   - Ensure `OPENAI_API_KEY` is set in Edge Function secrets
   - Verify the key is valid and has credits

2. **Check Logs**:
   - Edge Function logs will show if AI generation fails
   - System will automatically fall back to curated topics

## Monitoring

### Daily Status Check

```sql
SELECT * FROM public.daily_topic_status;
```

### Recent Topics

```sql
SELECT date, title, description, created_at
FROM public.topics
WHERE user_created_by IS NULL
  AND is_active = true
ORDER BY date DESC
LIMIT 30;
```

### Topic Generation History

```sql
SELECT 
  DATE(created_at) as generation_date,
  COUNT(*) as topics_created,
  COUNT(DISTINCT title) as unique_titles
FROM public.topics
WHERE user_created_by IS NULL
  AND created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY generation_date DESC;
```

## Best Practices

1. **Monitor Daily**: Check `daily_topic_status` view daily
2. **Set Alerts**: Create alerts if topic doesn't exist by 1 PM UTC
3. **Review Variety**: Periodically check for topic variety
4. **Backup Fallback**: Ensure fallback topics are diverse and engaging
5. **Test Regularly**: Manually trigger the function to ensure it works

## Support

If issues persist:
1. Check Supabase Edge Function logs
2. Verify database migrations are applied
3. Test the edge function manually
4. Check cron job status (if using pg_cron)






