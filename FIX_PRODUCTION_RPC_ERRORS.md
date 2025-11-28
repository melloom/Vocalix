# 🚨 FIX PRODUCTION RPC ERRORS - URGENT

## Problem
You're getting 400/404 errors in production for:
- `create_magic_login_link` (404 Not Found)
- `get_active_sessions` (400 Bad Request)
- `get_user_devices` (400 Bad Request)

This is because the database functions don't exist in production yet.

## ✅ Quick Fix (2 minutes)

### Step 1: Open Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your production project
3. Click on **SQL Editor** in the left sidebar

### Step 2: Run the Fix
1. Open the file `FIX_PRODUCTION_RPC_FUNCTIONS.sql` in this repository
2. **Copy the ENTIRE contents** of that file
3. **Paste it into the SQL Editor** in Supabase Dashboard
4. Click **Run** (or press Ctrl+Enter / Cmd+Enter)

### Step 3: Verify Success
You should see:
- "Success. No rows returned" or
- A verification table showing both functions exist

### Step 4: Test
1. Refresh your production app
2. The 400 errors should be gone
3. Settings page should load without errors

## What This Does

This SQL script:
- ✅ Creates `create_magic_login_link()` function (for QR code magic login)
- ✅ Creates `get_user_devices()` function
- ✅ Creates `get_active_sessions(p_profile_id UUID)` function
- ✅ Grants proper permissions to authenticated and anon users
- ✅ Verifies all functions were created successfully

## Alternative: Use Supabase CLI

If you prefer using the CLI:

```bash
# Link to your production project
supabase link --project-ref YOUR_PROJECT_REF

# Push the migration
supabase db push
```

But the SQL Editor method is faster and more reliable for urgent fixes.

## Need Help?

If you see any errors when running the SQL:
1. Check the error message
2. Make sure you're in the correct project (production, not local)
3. Verify you have admin/database owner permissions

---

**After running this fix, the 400 errors will stop and your app will work normally!** 🎉

