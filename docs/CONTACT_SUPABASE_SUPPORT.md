# Contact Supabase Support - create_session Function 404 Issue

## Issue Summary
The `create_session` function exists in the database, has correct permissions, and is accessible, but PostgREST is returning 404 errors when called via the REST API.

## What We've Verified
✅ Function exists in `public` schema  
✅ Function has `EXECUTE` permission for `anon` and `authenticated` roles  
✅ Function has `SECURITY DEFINER` set correctly  
✅ Function owner is `postgres`  
✅ Function signature matches frontend calls  
✅ Function works when called directly in SQL  
✅ Project has been restarted  
❌ REST API still returns 404

## Function Details
- **Name**: `create_session`
- **Schema**: `public`
- **Full Signature**: `create_session(p_profile_id uuid, p_device_id text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_duration_hours integer DEFAULT 720)`
- **Returns**: `TABLE (session_token text, expires_at timestamp with time zone)`
- **Language**: `plpgsql`
- **Security**: `SECURITY DEFINER`
- **Owner**: `postgres`

## Expected REST Endpoint
```
POST https://xgblxtopsapvacyaurcr.supabase.co/rest/v1/rpc/create_session
```

## What to Ask Supabase Support
Please ask them to:

1. **Manually refresh the PostgREST schema cache** for project `xgblxtopsapvacyaurcr`
2. **Verify that PostgREST can see the `create_session` function** in the `public` schema
3. **Check if there are any PostgREST configuration issues** that might prevent the function from being exposed
4. **Restart the PostgREST service** if needed

## Diagnostic Query Results
Run this query and share the results with support:

```sql
-- Check function exists and permissions
SELECT 
  p.proname,
  n.nspname,
  pg_get_function_arguments(p.oid) as signature,
  p.prosecdef as is_security_definer,
  pg_get_userbyid(p.proowner) as owner,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
AND p.proname = 'create_session';
```

## Impact
This is **non-critical** because:
- The app handles 404s gracefully (silent fail)
- Session creation is optional for backward compatibility
- The app works without sessions

However, it would be good to have it working for the cross-browser login feature.

## Timeline
- Function created: Multiple times via migrations
- Project restarted: Yes
- Still getting 404: Yes
- Time since last fix attempt: [Your time]

## Additional Context
The function is part of a cross-browser session management system. It creates HTTP-only cookie-based sessions for users. The function works perfectly when called directly in SQL, but PostgREST doesn't seem to be exposing it via the REST API.

