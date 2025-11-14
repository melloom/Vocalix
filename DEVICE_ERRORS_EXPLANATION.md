# Device Errors Explanation and Fix

## Error Summary

You're experiencing multiple errors related to device tracking:

1. **404 Error**: RPC function `get_user_devices` not found or not accessible
2. **400 Error**: RPC function `get_user_devices` failing with bad request
3. **500 Errors**: Multiple 500 (Internal Server Error) on:
   - Direct table query: `devices?select=*&order=last_seen_at.desc`
   - Upsert operation: `devices?on_conflict=device_id`

## Root Causes

### 1. Missing Table Columns
The `devices` table was created with only basic columns (`id`, `device_id`, `profile_id`, `created_at`, `updated_at`), but the code and RPC functions expect additional columns:
- `last_seen_at`
- `first_seen_at`
- `user_agent`
- `ip_address`
- `is_revoked`
- `is_suspicious`
- `request_count`
- `failed_auth_count`

### 2. RLS Policy Issues
The Row Level Security (RLS) policies on the `devices` table are either:
- Too restrictive, blocking legitimate access
- Causing circular dependencies
- Not properly handling the `x-device-id` header

### 3. RPC Function Issues
The `get_user_devices()` function may:
- Not exist in the database
- Have incorrect permissions
- Fail due to missing columns or RLS restrictions

## Solution

The `FIX_ALL_DEVICE_ERRORS.sql` script addresses all these issues by:

1. **Adding Missing Columns**: Ensures all required columns exist with proper defaults
2. **Fixing RLS Policies**: Creates simple, permissive policies that allow device access by `device_id` header
3. **Recreating RPC Function**: Rebuilds the function with better error handling
4. **Setting Permissions**: Grants proper execute permissions to all roles
5. **Creating Indexes**: Ensures proper indexes exist for performance

## How to Apply the Fix

1. **Run the SQL script** in your Supabase SQL editor:
   - Open Supabase Dashboard
   - Go to SQL Editor
   - Paste and run `FIX_ALL_DEVICE_ERRORS.sql`

2. **Clear browser cache**:
   ```javascript
   // In browser console (F12)
   localStorage.removeItem('missing_rpc_functions');
   ```

3. **Hard refresh** the browser:
   - Windows: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

4. **Test the application**:
   - Try onboarding flow (should create device without 500 error)
   - Check device activity in settings (should load without 404/400 errors)

## Expected Behavior After Fix

- ✅ No more 404 errors on RPC calls
- ✅ No more 400 errors on RPC calls
- ✅ No more 500 errors on table queries
- ✅ Devices can be created during onboarding
- ✅ Devices can be viewed in settings
- ✅ RPC function `get_user_devices` works correctly

## Troubleshooting

If errors persist after running the fix:

1. **Check Supabase logs**: Look for detailed error messages in the Supabase dashboard
2. **Verify migrations**: Ensure all migrations have been applied in order
3. **Check RLS policies**: Verify policies exist and are correct:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'devices';
   ```
4. **Verify function exists**: 
   ```sql
   SELECT routine_name FROM information_schema.routines 
   WHERE routine_name = 'get_user_devices';
   ```
5. **Check table schema**:
   ```sql
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'devices' ORDER BY ordinal_position;
   ```

