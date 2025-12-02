-- Verification Script for get_for_you_feed Fix
-- Run this to verify the function is working correctly

-- 1. Check function signatures
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as return_type
FROM pg_proc
WHERE proname IN ('get_for_you_feed', 'calculate_personalized_relevance')
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY proname;

-- 2. Test function with sample profile_id (replace with a real profile_id from your database)
-- First, get a sample profile_id:
SELECT id as sample_profile_id FROM public.profiles LIMIT 1;

-- 3. Test get_for_you_feed with a real profile_id (uncomment and replace with actual profile_id)
-- SELECT * FROM get_for_you_feed('YOUR_PROFILE_ID_HERE'::UUID, 10, 0) LIMIT 5;

-- 4. Test get_for_you_feed with NULL profile_id (should return trending clips)
-- SELECT * FROM get_for_you_feed(NULL, 10, 0) LIMIT 5;

-- 5. Check function permissions
SELECT 
  p.proname as function_name,
  r.rolname as role_name,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
FROM pg_proc p
CROSS JOIN pg_roles r
WHERE p.proname IN ('get_for_you_feed', 'calculate_personalized_relevance')
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND r.rolname IN ('authenticated', 'anon')
ORDER BY p.proname, r.rolname;

