# Engagement Velocity Update - Deployment Guide

## Overview

The engagement velocity update system tracks how quickly clips gain engagement (reactions, listens, replies, remixes per hour) to identify rising content. This system requires periodic updates to keep the data current.

## Components

1. **Database Function**: `update_all_engagement_velocity()` - Updates velocity for all recent clips
2. **Edge Function**: `update-engagement-velocity` - HTTP endpoint that calls the database function
3. **Cron Job**: Scheduled task to call the edge function periodically

## Setup Instructions

### 1. Database Migration

The migration `20250211000000_enhanced_discovery_feed_algorithm.sql` includes:
- `clip_engagement_velocity` table
- `update_clip_engagement_velocity()` function (updates single clip)
- `update_all_engagement_velocity()` function (updates all recent clips)

### 2. Edge Function

The edge function is located at:
```
supabase/functions/update-engagement-velocity/index.ts
```

Deploy it using:
```bash
supabase functions deploy update-engagement-velocity
```

### 3. Cron Job Setup

You can set up a cron job in two ways:

#### Option A: Supabase Dashboard (Recommended)

1. Go to Supabase Dashboard → Database → Cron Jobs
2. Create a new cron job with:
   - **Name**: `update-engagement-velocity`
   - **Schedule**: `0 * * * *` (every hour) or `*/30 * * * *` (every 30 minutes)
   - **Command**: 
     ```sql
     SELECT net.http_post(
       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/update-engagement-velocity',
       headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
       body := '{}'::jsonb
     );
     ```

#### Option B: pg_cron Extension (if enabled)

```sql
-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the function to run every hour
SELECT cron.schedule(
  'update-engagement-velocity',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT public.update_all_engagement_velocity();
  $$
);
```

#### Option C: External Cron Service

Use a service like:
- **GitHub Actions** (for open source projects)
- **Vercel Cron** (if using Vercel)
- **Cloudflare Workers Cron** (if using Cloudflare)
- **AWS EventBridge** (if using AWS)

Example GitHub Actions workflow:
```yaml
name: Update Engagement Velocity
on:
  schedule:
    - cron: '0 * * * *' # Every hour
  workflow_dispatch: # Allow manual trigger

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Call Edge Function
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            https://YOUR_PROJECT_REF.supabase.co/functions/v1/update-engagement-velocity
```

### 4. Manual Testing

Test the edge function manually:
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/update-engagement-velocity
```

Or test the database function directly:
```sql
SELECT public.update_all_engagement_velocity();
```

## Monitoring

### Check Update Status

```sql
-- See recent updates
SELECT 
  COUNT(*) as total_records,
  MAX(updated_at) as last_update,
  COUNT(DISTINCT clip_id) as unique_clips
FROM public.clip_engagement_velocity
WHERE updated_at > NOW() - INTERVAL '1 hour';
```

### Check Function Performance

```sql
-- See how many clips were updated
SELECT public.update_all_engagement_velocity();
```

## Optimization

### Frequency Recommendations

- **High-traffic platforms**: Every 15-30 minutes
- **Medium-traffic platforms**: Every hour
- **Low-traffic platforms**: Every 2-4 hours

### Performance Notes

- The function processes clips from the last 48 hours only
- It processes in batches of 1000 clips to avoid timeouts
- Old velocity records (>7 days) are automatically cleaned up
- The function is idempotent (safe to run multiple times)

## Troubleshooting

### Function Not Running

1. Check cron job status in Supabase Dashboard
2. Verify edge function is deployed
3. Check function logs in Supabase Dashboard → Edge Functions → Logs
4. Verify service role key has correct permissions

### Slow Performance

1. Reduce batch size in `update_all_engagement_velocity()` function
2. Add more indexes if needed
3. Consider running during off-peak hours
4. Monitor database CPU/memory usage

### Missing Velocity Data

1. Ensure cron job is running
2. Check that clips are being created (status = 'live')
3. Verify the function is not erroring out
4. Check RLS policies allow reading `clip_engagement_velocity` table

## Related Functions

- `calculate_engagement_velocity()` - Calculates velocity for a single clip
- `get_rising_clips()` - Uses velocity data to find rising content
- `calculate_enhanced_personalized_relevance()` - Uses velocity in ranking

