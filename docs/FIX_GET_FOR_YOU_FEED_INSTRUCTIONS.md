# Fix get_for_you_feed 400 Error

## Problem
The `get_for_you_feed` function is returning a 400 Bad Request error because the function signature doesn't match the parameters being passed.

## Solution

### Option 1: Run SQL in Supabase Dashboard (Quickest)

1. **Open Supabase Dashboard**
   - Go to your project: https://supabase.com/dashboard
   - Navigate to **SQL Editor**

2. **Copy and Paste the SQL**
   - Open `FIX_GET_FOR_YOU_FEED.sql`
   - Copy all the SQL code
   - Paste it into the SQL Editor
   - Click **Run** (or press Ctrl+Enter)

3. **Verify Success**
   - You should see "Success. No rows returned" or see the function definitions
   - Check the Query Results tab for the verification SELECT at the end

4. **Test the Fix**
   - Refresh your app
   - The error should be gone
   - The "For You" feed should load correctly

### Option 2: Run Migration via CLI

If you're using Supabase CLI:

```bash
# Make sure you're in the project directory
cd "c:\Users\Mperalta\Desktop\echo-garden-49-main"

# Link to your Supabase project (if not already linked)
supabase link --project-ref YOUR_PROJECT_REF

# Push the migration
supabase db push
```

### Option 3: Run Specific Migration File

The migration file is already created at:
```
supabase/migrations/20250131000002_fix_get_for_you_feed_null_handling.sql
```

You can run this migration directly or copy its contents to Supabase SQL Editor.

## What the Fix Does

1. **Updates `get_for_you_feed` function**:
   - Makes `p_profile_id` nullable (DEFAULT NULL)
   - Adds validation for `p_limit` and `p_offset`
   - Ensures `p_limit` is between 1-500
   - Ensures `p_offset` is non-negative

2. **Updates `calculate_personalized_relevance` function**:
   - Makes `p_profile_id` nullable (DEFAULT NULL)
   - Adds input validation
   - Better error handling

3. **Maintains permissions**:
   - Ensures both authenticated and anonymous users can call the functions

## Testing After Fix

After running the fix, test:

1. **Open the app** and check the console for errors
2. **Switch to "For You" feed** - it should load without 400 errors
3. **Check Network tab** - the `get_for_you_feed` request should return 200 OK

## If Still Getting Errors

If you're still seeing errors after running the fix:

1. **Check Supabase Logs**:
   - Go to Supabase Dashboard → Logs → Postgres Logs
   - Look for any errors related to `get_for_you_feed`

2. **Verify Function Exists**:
   ```sql
   SELECT proname, pg_get_function_arguments(oid)
   FROM pg_proc
   WHERE proname = 'get_for_you_feed'
   AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
   ```

3. **Test Function Directly**:
   ```sql
   -- Replace with a real profile_id UUID from your database
   SELECT * FROM get_for_you_feed('YOUR_PROFILE_ID'::UUID, 50, 0);
   ```

4. **Check Browser Console**:
   - Look for detailed error messages
   - Check if the error object has more details about what's wrong

## Expected Result

After the fix:
- ✅ No more 400 Bad Request errors
- ✅ "For You" feed loads successfully
- ✅ Personalized feed works correctly
- ✅ Fallback to client-side calculation if needed (already implemented)

