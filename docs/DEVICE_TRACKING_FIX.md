# Device Tracking Fix

## Problem
You're seeing the message:
- "No devices found in database"
- "Run database migrations to enable device tracking"
- "Device tracking will be enabled after migrations"

This happens when the `get_user_devices()` function either:
1. Doesn't exist (migrations haven't been run)
2. Exists but is using an old version that doesn't create/return devices correctly

## Solution

### Option 1: Quick Fix (Recommended)
Run the `FIX_DEVICE_TRACKING.sql` script in Supabase Dashboard:

1. Open Supabase Dashboard SQL Editor:
   - Go to: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/sql/new

2. Copy and paste the contents of `FIX_DEVICE_TRACKING.sql`

3. Click "Run"

4. Refresh your browser and clear localStorage:
   ```javascript
   localStorage.removeItem('missing_rpc_functions');
   ```

### Option 2: Full Migration
If migrations haven't been run at all, run `COMBINED_MIGRATION.sql`:

1. Open Supabase Dashboard SQL Editor
2. Copy and paste the contents of `COMBINED_MIGRATION.sql`
3. Click "Run"
4. Refresh your browser

## What Was Fixed

The `get_user_devices()` function was updated to:
1. Always create/update the current device in the devices table
2. Always return the current device, even if no profile is linked
3. Handle cases where `profile_ids_for_request()` might not exist
4. Properly upsert devices using `ON CONFLICT`

## Verification

After running the fix, you should:
1. See your current device in the Settings > Device Activity section
2. No longer see the "No devices found" message
3. See device tracking information

## Troubleshooting

If you still see the error after running the fix:

1. **Clear browser localStorage:**
   ```javascript
   localStorage.removeItem('missing_rpc_functions');
   ```

2. **Hard refresh your browser:**
   - Chrome/Edge: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   - Firefox: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)

3. **Check if function exists:**
   Run this in Supabase SQL Editor:
   ```sql
   SELECT routine_name 
   FROM information_schema.routines 
   WHERE routine_schema = 'public' 
   AND routine_name = 'get_user_devices';
   ```

4. **Check if devices table exists:**
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name = 'devices';
   ```

5. **Test the function:**
   - The function needs the `x-device-id` header to work
   - It should work automatically when called from the frontend
   - You can't test it directly in SQL Editor (it needs headers)

## Files Updated

- `supabase/migrations/20251120000004_get_user_devices_rpc.sql` - Fixed migration file
- `COMBINED_MIGRATION.sql` - Updated combined migration
- `FIX_DEVICE_TRACKING.sql` - New fix script (use this for quick fix)

