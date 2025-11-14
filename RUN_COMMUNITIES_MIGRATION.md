# Run Communities Migration

The `communities` table doesn't exist in your database yet. You need to run the migration to create it.

## Quick Method: Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard SQL Editor:**
   - Go to: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/sql/new

2. **Copy the migration file:**
   - Open `supabase/migrations/20251123000000_add_audio_communities.sql`
   - Copy all contents (Ctrl+A, Ctrl+C)

3. **Paste and run:**
   - Paste into the SQL Editor
   - Click "Run" button (or press Ctrl+Enter)
   - Wait for completion (should take a few seconds)

4. **Verify it worked:**
   - You should see "Success. No rows returned"
   - Check the table exists by running:
     ```sql
     SELECT table_name 
     FROM information_schema.tables 
     WHERE table_schema = 'public' 
     AND table_name = 'communities';
     ```

## Alternative: Using Supabase CLI

If you have Supabase CLI linked to your project:

```bash
# Link to your project (if not already linked)
npx supabase link --project-ref xgblxtopsapvacyaurcr

# Push migrations
npx supabase db push
```

## What This Migration Creates

- `communities` table - Main table for audio communities
- `community_members` table - Tracks which users are members
- `community_moderators` table - Tracks community moderators
- Adds `community_id` column to `clips` table
- Creates indexes for performance
- Sets up RLS (Row Level Security) policies
- Creates triggers for automatic member/clip count updates

## Troubleshooting

If you get errors:
- Make sure the `profiles` table exists (it should)
- Make sure the `clips` table exists (it should)
- Check that the `handle_updated_at()` function exists (it should from previous migrations)

