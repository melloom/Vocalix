# PostgREST Schema Cache Refresh - URGENT

## Problem
The function `create_magic_login_link` exists in your database, but PostgREST (the API layer) returns 404 errors. This is a **PostgREST schema cache issue**.

## Verification
Run `VERIFY_FUNCTION_EXISTS.sql` in Supabase Dashboard to confirm the function exists in the database.

## Solution Options

### Option 1: Wait (Automatic Refresh)
PostgREST automatically refreshes its schema cache, but it can take:
- **5-15 minutes** for automatic refresh
- Sometimes up to **30 minutes**

**Action:** Wait 15-30 minutes, then try again.

### Option 2: Contact Supabase Support (RECOMMENDED)
PostgREST schema cache can be manually refreshed by Supabase support.

**Steps:**
1. Go to https://supabase.com/dashboard/support
2. Open a support ticket
3. Request: "Please refresh PostgREST schema cache for project xgblxtopsapvacyaurcr"
4. Mention: "The function `create_magic_login_link` exists in the database but PostgREST returns 404 errors"

**They can refresh it immediately.**

### Option 3: Restart Project (If Available)
If you have access to restart your Supabase project:
1. Go to Project Settings
2. Look for "Restart" or "Pause/Resume" option
3. Restart the project (this refreshes PostgREST cache)

**Warning:** This may cause brief downtime.

### Option 4: Use Supabase CLI (If Available)
If you have Supabase CLI access:
```bash
# This might trigger a schema refresh
supabase db push --linked
```

## Why This Happens
PostgREST caches the database schema for performance. When you create new functions, it needs to refresh this cache. Sometimes the automatic refresh is delayed or fails.

## Temporary Workaround
Unfortunately, there's no code-side workaround for this. The function must be visible to PostgREST for the API to work.

## Next Steps
1. **Run `VERIFY_FUNCTION_EXISTS.sql`** to confirm function exists
2. **Wait 15-30 minutes** for automatic refresh
3. **If still not working**, contact Supabase support for manual cache refresh
4. **Once PostgREST can see it**, the QR code feature will work immediately

---

**The function is correctly created - we just need PostgREST to see it!**

