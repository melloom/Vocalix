-- ============================================================================
-- VERIFY CURRENT STATE - Run this first to check what's missing
-- ============================================================================
-- This will show you if pgcrypto is enabled and if the function exists

-- Check 1: Is pgcrypto extension enabled?
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') 
    THEN '✅ pgcrypto extension is ENABLED' 
    ELSE '❌ pgcrypto extension is NOT enabled - NEEDS TO BE ENABLED' 
  END AS pgcrypto_status;

-- Check 2: Does create_magic_login_link function exist?
SELECT 
  CASE 
    WHEN COUNT(*) > 0 
    THEN '✅ Function create_magic_login_link EXISTS (' || COUNT(*) || ' version(s))' 
    ELSE '❌ Function create_magic_login_link DOES NOT EXIST - NEEDS TO BE CREATED' 
  END AS function_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'create_magic_login_link';

-- Check 3: Show all versions of create_magic_login_link (if any exist)
SELECT 
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS function_signature,
  CASE 
    WHEN p.prosecdef THEN 'SECURITY DEFINER' 
    ELSE 'SECURITY INVOKER' 
  END AS security_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'create_magic_login_link'
ORDER BY p.oid;

-- Check 4: Show permissions on the function
SELECT 
  p.proname AS function_name,
  pr.grantee,
  pr.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
LEFT JOIN information_schema.routine_privileges pr 
  ON pr.specific_schema = n.nspname 
  AND pr.routine_name = p.proname
WHERE n.nspname = 'public' 
  AND p.proname = 'create_magic_login_link'
ORDER BY pr.grantee, pr.privilege_type;

