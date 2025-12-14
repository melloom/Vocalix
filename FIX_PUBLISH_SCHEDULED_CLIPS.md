# Fix for publish_scheduled_clips Ambiguous Column Error

## Problem
The `publish_scheduled_clips()` function was throwing error 42702 (ambiguous column) because column names in the SELECT statement could conflict with the output variable names.

## Solution
The migration `20251214000000_fix_publish_scheduled_clips_ambiguous_column.sql` fixes this by:

1. **Using table alias**: Changed `FROM public.clips` to `FROM public.clips c`
2. **Fully qualifying column names**: Changed `id, profile_id, audio_path` to `c.id, c.profile_id, c.audio_path`
3. **Using qualified columns in WHERE clause**: Changed `status` and `scheduled_for` to `c.status` and `c.scheduled_for`

This eliminates any ambiguity between column names and the output variable names (`clip_id`, `profile_id`, `audio_path`).

## How to Apply

### Option 1: Via Supabase Dashboard (Recommended)
1. Go to: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/sql/new
2. Copy the contents of `supabase/migrations/20251214000000_fix_publish_scheduled_clips_ambiguous_column.sql`
3. Paste into the SQL editor
4. Click "Run"

### Option 2: Via Supabase CLI
```bash
npx supabase db push
```

Or if you have Supabase CLI installed:
```bash
supabase db push
```

### Option 3: Direct SQL Execution
Run this SQL in the Supabase SQL editor:

```sql
CREATE OR REPLACE FUNCTION public.publish_scheduled_clips()
RETURNS TABLE (
  clip_id UUID,
  profile_id UUID,
  audio_path TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clip_record RECORD;
BEGIN
  -- Find all drafts that are scheduled to be published now or in the past
  -- Use table alias to avoid ambiguity with output column names
  FOR clip_record IN
    SELECT 
      c.id,
      c.profile_id,
      c.audio_path
    FROM public.clips c
    WHERE 
      c.status = 'draft' 
      AND c.scheduled_for IS NOT NULL
      AND c.scheduled_for <= NOW()
  LOOP
    -- Update the clip status to processing
    UPDATE public.clips
    SET 
      status = 'processing',
      scheduled_for = NULL
    WHERE id = clip_record.id;
    
    -- Return the clip info (use clip_record fields to avoid ambiguity)
    clip_id := clip_record.id;
    profile_id := clip_record.profile_id;
    audio_path := clip_record.audio_path;
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.publish_scheduled_clips() TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_scheduled_clips() TO anon;
```

## Verification
After applying the fix, test the function:
1. Go to: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/sql/new
2. Run: `SELECT * FROM public.publish_scheduled_clips();`
3. Should return empty result set or scheduled clips (no error)

## What Changed
- **Before**: Column names were unqualified, causing PostgreSQL to be unsure which `profile_id`/`audio_path` was being referenced
- **After**: All columns are qualified with table alias `c.`, making it clear we're selecting from the table, not referencing output variables

