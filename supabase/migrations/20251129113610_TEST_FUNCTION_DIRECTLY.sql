-- ============================================================================
-- TEST FUNCTION DIRECTLY - Verify it works in SQL (bypass PostgREST)
-- ============================================================================
-- This tests if the function actually works when called directly
-- If this works but PostgREST returns 404, it's definitely a cache issue

-- Note: This will fail because it needs x-device-id header, but we can check syntax
-- Actually, let's just verify the function can be seen:

SELECT 
  'Function is visible in PostgreSQL' AS status,
  proname,
  pg_get_function_identity_arguments(oid) AS signature,
  pronargs AS parameter_count,
  CASE 
    WHEN prosecdef THEN 'SECURITY DEFINER ✅' 
    ELSE 'SECURITY INVOKER' 
  END AS security
FROM pg_proc
WHERE proname = 'create_magic_login_link'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Show all overloads (versions) of the function
SELECT 
  'All versions of create_magic_login_link:' AS info,
  proname,
  pg_get_function_identity_arguments(oid) AS signature
FROM pg_proc
WHERE proname = 'create_magic_login_link'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY oid;

-- Verify PostgREST should be able to see it
SELECT 
  'PostgREST visibility check:' AS info,
  CASE 
    WHEN n.nspname = 'public' THEN '✅ In public schema (PostgREST can see)'
    ELSE '❌ Not in public schema'
  END AS schema_status,
  CASE 
    WHEN p.prosecdef THEN '✅ SECURITY DEFINER (correct)'
    ELSE '❌ Wrong security setting'
  END AS security_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'create_magic_login_link'
  AND n.nspname = 'public'
LIMIT 1;

