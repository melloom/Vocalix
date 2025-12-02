-- ============================================================================
-- VERIFY FULL STATE - Check everything needed for QR code generation
-- ============================================================================

-- Check 1: Is pgcrypto extension enabled?
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') 
    THEN '✅ pgcrypto extension is ENABLED' 
    ELSE '❌ pgcrypto extension is NOT enabled - THIS MUST BE FIXED' 
  END AS pgcrypto_status;

-- Check 2: Function exists and show its signature
SELECT 
  '✅ Function EXISTS' AS status,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS function_signature,
  CASE 
    WHEN p.prosecdef THEN 'SECURITY DEFINER ✅' 
    ELSE 'SECURITY INVOKER' 
  END AS security_type,
  n.nspname AS schema_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'create_magic_login_link'
ORDER BY p.oid;

-- Check 3: Test if digest function works (pgcrypto test)
SELECT 
  CASE 
    WHEN encode(digest('test'::text, 'sha256'), 'hex') IS NOT NULL
    THEN '✅ digest() function WORKS - pgcrypto is functional'
    ELSE '❌ digest() function FAILED - pgcrypto not working'
  END AS digest_test;

-- Check 4: Verify function can be called (syntax check)
SELECT 
  '✅ Function signature is valid' AS validation,
  proname,
  pg_get_function_identity_arguments(oid) AS signature
FROM pg_proc
WHERE proname = 'create_magic_login_link'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
LIMIT 1;

