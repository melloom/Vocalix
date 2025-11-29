# 🔧 Fix: pgcrypto Extension and create_magic_login_link Function

## Problem

You're seeing two errors:

1. **404 Error**: `POST /rest/v1/rpc/create_magic_login_link 404 (Not Found)`
2. **digest Function Error**: `function digest(text, unknown) does not exist`

## Root Cause

- The `pgcrypto` extension is not enabled in your database, which is required for the `digest()` function
- The `create_magic_login_link` function may not exist or PostgREST can't see it

## ✅ Quick Fix (2 minutes)

### Option 1: Run SQL in Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in the left sidebar
4. Open the file `FIX_PGCRYPTO_AND_MAGIC_LOGIN_LINK.sql` in this repository
5. **Copy the ENTIRE contents** of that file
6. **Paste it into the SQL Editor**
7. Click **Run** (or press Ctrl+Enter / Cmd+Enter)

### Option 2: Use Supabase CLI

If you prefer using the CLI:

```bash
# Link to your project (if not already linked)
supabase link --project-ref YOUR_PROJECT_REF

# Push the migration
supabase db push
```

The migration file is: `supabase/migrations/20251228000000_fix_pgcrypto_and_magic_login_link.sql`

## What This Fix Does

1. ✅ Enables the `pgcrypto` extension (required for `digest()` function)
2. ✅ Drops all old versions of `create_magic_login_link` to avoid conflicts
3. ✅ Creates the `create_magic_login_link` function with the correct signature
4. ✅ Grants proper permissions to `authenticated`, `anon`, and `service_role` roles
5. ✅ Adds comments for PostgREST visibility
6. ✅ Verifies everything was created successfully

## After Running the Fix

1. **Wait 1-2 minutes** for PostgREST to refresh its schema cache
2. **Refresh your app** in the browser
3. The errors should be gone!

## Verification

After running the fix, you can verify it worked by running this query in the SQL Editor:

```sql
-- Check if pgcrypto is enabled
SELECT * FROM pg_extension WHERE extname = 'pgcrypto';

-- Check if function exists
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE proname = 'create_magic_login_link';
```

You should see:
- One row for `pgcrypto` extension
- One row for `create_magic_login_link` function

## Still Getting 404?

If you still get a 404 error after waiting 2-3 minutes:

1. **Wait a bit longer** - PostgREST schema cache can take up to 5 minutes to refresh
2. **Contact Supabase Support** - They can manually refresh the PostgREST schema cache
3. **Check function permissions** - Make sure the function is in the `public` schema

## Need Help?

If you see any errors when running the SQL:
1. Check the error message carefully
2. Make sure you're in the correct project (production, not local)
3. Verify you have admin/database owner permissions
4. Check that the `magic_login_links` table exists

---

**After running this fix, both errors will be resolved!** 🎉

