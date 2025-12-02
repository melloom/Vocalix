-- ============================================================================
-- Cross-Browser Sessions - Verification Queries
-- ============================================================================
-- Run these queries in Supabase SQL Editor to verify everything is working
-- ============================================================================

-- 1. Check if sessions table exists and has correct structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sessions'
ORDER BY ordinal_position;

-- 2. Check if all session functions exist
SELECT 
  routine_name as function_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'create_session',
    'validate_session',
    'get_session_profile',
    'revoke_session',
    'revoke_session_by_id',
    'revoke_all_sessions',
    'get_active_sessions',
    'cleanup_expired_sessions'
  )
ORDER BY routine_name;

-- 3. Verify profile_ids_for_request function signature
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as return_type
FROM pg_proc
WHERE proname = 'profile_ids_for_request'
  AND pronamespace = 'public'::regnamespace;

-- 4. Check RLS policies that use profile_ids_for_request
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd as command_type,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    qual LIKE '%profile_ids_for_request%' 
    OR with_check LIKE '%profile_ids_for_request%'
  )
ORDER BY tablename, policyname;

-- 5. Count active sessions (should be 0 if no one is logged in)
SELECT 
  COUNT(*) as active_sessions_count,
  COUNT(DISTINCT profile_id) as unique_users_with_sessions
FROM public.sessions
WHERE revoked_at IS NULL
  AND expires_at > now();

-- 6. Check if get_request_profile function exists and works
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc
WHERE proname = 'get_request_profile'
  AND pronamespace = 'public'::regnamespace;

-- 7. Verify sessions table indexes
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'sessions'
ORDER BY indexname;

-- 8. Check for any expired sessions that need cleanup
SELECT 
  COUNT(*) as expired_sessions_count
FROM public.sessions
WHERE expires_at < now()
  AND revoked_at IS NULL;

-- 9. Test create_session function (replace with actual profile_id)
-- SELECT * FROM public.create_session('YOUR_PROFILE_ID_HERE'::uuid, NULL, NULL, 720);

-- 10. Verify all grants are in place
SELECT 
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'create_session',
    'validate_session',
    'get_session_profile',
    'revoke_session',
    'revoke_session_by_id',
    'revoke_all_sessions',
    'get_active_sessions'
  )
ORDER BY routine_name, grantee;

