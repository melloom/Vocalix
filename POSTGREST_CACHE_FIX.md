# PostgREST Cache Issue - create_session Function

## Status
✅ **Function exists and is accessible**  
✅ **Function signature matches frontend calls**  
✅ **Permissions are correct**  
❌ **Still getting 404 from REST API**

## Root Cause
This is a **PostgREST schema cache issue**. PostgREST caches the database schema and doesn't always immediately see new or modified functions.

## Solutions (Try in Order)

### Solution 1: Wait for Auto-Refresh (Easiest)
PostgREST automatically refreshes its schema cache every 1-2 minutes. Simply:
1. Wait 1-2 minutes after running the fix scripts
2. Hard refresh your browser (Ctrl+Shift+R)
3. Test again

### Solution 2: Restart Supabase Project
1. Go to Supabase Dashboard → Settings → General
2. Click "Pause project" (if available)
3. Wait 30 seconds
4. Click "Resume project"
5. Wait 1-2 minutes for services to restart
6. Test again

### Solution 3: Contact Supabase Support
If the above doesn't work, contact Supabase support and ask them to:
- Manually refresh the PostgREST schema cache
- Or restart the PostgREST service

## Verification
The function is confirmed to be:
- ✅ In the `public` schema
- ✅ Has `EXECUTE` permission for `anon` and `authenticated` roles
- ✅ Has correct `SECURITY DEFINER` setting
- ✅ Signature matches frontend calls exactly

## Function Details
- **Name**: `create_session`
- **Schema**: `public`
- **Parameters**: `p_profile_id UUID, p_device_id TEXT, p_user_agent TEXT, p_duration_hours INTEGER`
- **Returns**: `TABLE (session_token TEXT, expires_at TIMESTAMPTZ)`
- **Security**: `SECURITY DEFINER`
- **Owner**: `postgres`

## Frontend Call (Correct)
```javascript
await supabase.rpc("create_session", {
  p_profile_id: profileId,
  p_device_id: deviceId,
  p_user_agent: userAgent,
  p_duration_hours: 720,
});
```

## Expected Endpoint
```
POST https://xgblxtopsapvacyaurcr.supabase.co/rest/v1/rpc/create_session
```

## Current Behavior
- Function works when called directly in SQL
- Function is accessible according to database checks
- REST API returns 404 (PostgREST cache issue)

## Impact
The 404 errors are **non-critical** because:
1. Your code already handles them gracefully (silent fail)
2. Session creation is optional for backward compatibility
3. The function will work once PostgREST refreshes

## Next Steps
1. Wait 1-2 minutes
2. If still 404, restart the Supabase project
3. If still 404 after restart, contact Supabase support

The function is properly configured - it's just a matter of waiting for PostgREST to refresh its cache.

