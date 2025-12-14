# Clear Cache and Fix Device Tracking

## Problem
The `get_user_devices()` function exists in the database, but you're still seeing "No devices found". This is likely because:

1. **Frontend cache issue**: The browser has cached that the function doesn't exist
2. **Function not creating devices**: The function exists but isn't creating/returning devices properly
3. **Header not being sent**: The `x-device-id` header isn't being sent with requests

## Solution

### Step 1: Run the Database Fix

Run `FINAL_FIX_DEVICE_TRACKING.sql` in Supabase Dashboard:

1. Open: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/sql/new
2. Copy and paste the contents of `FINAL_FIX_DEVICE_TRACKING.sql`
3. Click "Run"
4. Verify the function was updated (you should see "✅ Function updated")

### Step 2: Clear Browser Cache

**Option A: Clear localStorage (Recommended)**
1. Open browser console (F12)
2. Run these commands:
   ```javascript
   localStorage.removeItem('missing_rpc_functions');
   localStorage.removeItem('deviceId'); // Don't worry, it will be recreated
   location.reload();
   ```

**Option B: Clear All Site Data**
1. Open browser DevTools (F12)
2. Go to Application tab (Chrome) or Storage tab (Firefox)
3. Click "Clear site data" or "Clear storage"
4. Refresh the page

**Option C: Hard Refresh**
1. Windows: `Ctrl + Shift + R` or `Ctrl + F5`
2. Mac: `Cmd + Shift + R`
3. This will reload the page and clear some cache

### Step 3: Verify Device ID Exists

After clearing cache, check if device ID is created:

1. Open browser console (F12)
2. Run: `localStorage.getItem('deviceId')`
3. You should see a UUID (e.g., `56cc048d-d46a-433a-84e1-531ba146171b`)
4. If it's `null`, refresh the page - it should be created automatically

### Step 4: Check Network Requests

1. Open browser DevTools (F12)
2. Go to Network tab
3. Filter by "rpc" or "get_user_devices"
4. Refresh the page
5. Look for a request to `get_user_devices`
6. Click on it and check:
   - **Request Headers**: Should have `x-device-id` header
   - **Response**: Should return your device data (JSON array)
   - **Status**: Should be 200 OK

### Step 5: Check Browser Console

1. Open browser console (F12)
2. Look for any errors related to:
   - `get_user_devices`
   - `missing_rpc_functions`
   - Device tracking
3. If you see errors, note them down

### Step 6: Manual Device Creation (If Needed)

If the function still doesn't work, manually create your device:

1. Get your device ID from browser console: `localStorage.getItem('deviceId')`
2. Run this in Supabase SQL Editor (replace `YOUR_DEVICE_ID` with your actual device ID):

```sql
-- Replace 'YOUR_DEVICE_ID' with your actual device ID
INSERT INTO public.devices (device_id, profile_id, first_seen_at, last_seen_at, request_count)
VALUES (
  'YOUR_DEVICE_ID', -- Replace with your device ID
  (SELECT id FROM public.profiles WHERE device_id = 'YOUR_DEVICE_ID' LIMIT 1),
  now(),
  now(),
  1
)
ON CONFLICT (device_id) DO UPDATE SET
  last_seen_at = now(),
  request_count = COALESCE(devices.request_count, 0) + 1;
```

3. Refresh your browser
4. The device should now appear

## Troubleshooting

### Issue: Function exists but returns empty

**Solution**: 
- Run `FINAL_FIX_DEVICE_TRACKING.sql` to update the function
- Clear browser cache
- Refresh page

### Issue: x-device-id header not being sent

**Solution**:
- Check if `deviceId` exists: `localStorage.getItem('deviceId')`
- If it's `null`, refresh the page - it should be created
- Check `src/integrations/supabase/client.ts` to verify header is being set

### Issue: Function returns 404

**Solution**:
- Verify function exists: Run the verification query in `DIAGNOSE_DEVICE_TRACKING.sql`
- Run `FINAL_FIX_DEVICE_TRACKING.sql` to recreate the function
- Clear browser cache
- Refresh page

### Issue: RLS (Row Level Security) blocking access

**Solution**:
- The function uses `SECURITY DEFINER` which should bypass RLS
- Verify function owner is `postgres`: Run `DIAGNOSE_DEVICE_TRACKING.sql`
- Check RLS policies: Run the RLS policy check in `DIAGNOSE_DEVICE_TRACKING.sql`

### Issue: Still seeing "No devices found"

**Solution**:
1. Run `TEST_DEVICE_FUNCTION_WORKING.sql` to verify setup
2. Run `DIAGNOSE_DEVICE_TRACKING.sql` for detailed diagnostics
3. Check browser console for errors
4. Check Network tab for failed requests
5. Verify device ID exists in localStorage
6. Manually create device (Step 6 above)

## Verification

After following these steps, you should:

1. ✅ See your device in Settings > Device Activity
2. ✅ No longer see "No devices found" message
3. ✅ See device tracking information
4. ✅ Be able to view/manage devices

## Next Steps

If it still doesn't work after following all steps:

1. Check browser console for specific errors
2. Check Network tab for failed requests
3. Run `DIAGNOSE_DEVICE_TRACKING.sql` for detailed diagnostics
4. Share the error messages/logs for further assistance

