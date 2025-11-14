# Run Communities Migration - Step by Step

The migration is failing because it's trying to reference tables before they exist. Let's run it step by step to identify the issue.

## Step 1: Verify Prerequisites

First, check if the required tables exist:

```sql
-- Check if profiles table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'profiles';

-- Check if clips table exists (optional)
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'clips';
```

## Step 2: Run the Safe Migration

Use the **SAFE** version of the migration: `20251123000000_add_audio_communities_SAFE.sql`

This version:
- Handles errors gracefully
- Checks if tables exist before modifying them
- Uses DO blocks to handle missing dependencies
- Is idempotent (can be run multiple times)

## Step 3: If Still Failing - Manual Step-by-Step

If the safe version still fails, run these commands one at a time:

### 1. Create communities table
```sql
CREATE TABLE IF NOT EXISTS public.communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  avatar_emoji TEXT NOT NULL DEFAULT '🎙️',
  created_by_profile_id UUID,
  member_count INT NOT NULL DEFAULT 0,
  clip_count INT NOT NULL DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  guidelines TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 2. Add foreign key constraint (after table exists)
```sql
ALTER TABLE public.communities
ADD CONSTRAINT communities_created_by_profile_id_fkey
FOREIGN KEY (created_by_profile_id) 
REFERENCES public.profiles(id) 
ON DELETE SET NULL;
```

### 3. Enable RLS
```sql
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
```

### 4. Continue with policies...
(And so on)

## Alternative: Check What's Actually Failing

Run this to see what error you're getting:

```sql
-- Try to create the table
CREATE TABLE IF NOT EXISTS public.communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL
);
```

If this fails, the issue is something else (permissions, schema, etc.)

## Most Common Issues:

1. **Profiles table doesn't exist** - Check if `public.profiles` table exists
2. **Permissions issue** - Make sure you're running as a user with CREATE TABLE permissions
3. **Schema issue** - Make sure you're in the `public` schema
4. **Transaction issue** - The migration might be running in a transaction that's rolling back

## Quick Fix: Use the SAFE version

Just run the `20251123000000_add_audio_communities_SAFE.sql` file - it handles all these cases gracefully.

