-- ============================================================================
-- CHECK PGCRYPTO STATUS FIRST - Run this before FINAL_FIX.sql
-- ============================================================================

-- Check if pgcrypto extension exists
SELECT 
  'Extension Check:' AS check_type,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') 
    THEN '✅ pgcrypto extension EXISTS'
    ELSE '❌ pgcrypto extension DOES NOT EXIST'
  END AS status;

-- List all installed extensions
SELECT 
  'All Extensions:' AS info,
  extname AS extension_name,
  extversion AS version
FROM pg_extension
ORDER BY extname;

-- Try to enable pgcrypto
SELECT 'Attempting to enable pgcrypto...' AS action;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Check again after enabling
SELECT 
  'After Enable Attempt:' AS check_type,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') 
    THEN '✅ pgcrypto is NOW ENABLED'
    ELSE '❌ FAILED: pgcrypto could not be enabled (may need superuser permissions)'
  END AS status;

-- Test digest function directly
SELECT 
  'digest() Test:' AS test_type,
  CASE 
    WHEN encode(digest('test'::text, 'sha256'), 'hex') IS NOT NULL
    THEN '✅ digest() function WORKS'
    ELSE '❌ digest() function FAILED'
  END AS result,
  encode(digest('test'::text, 'sha256'), 'hex') AS hash_output;

-- Show available digest functions
SELECT 
  'Available digest functions:' AS info,
  p.proname AS function_name,
  n.nspname AS schema_name,
  pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'digest'
ORDER BY n.nspname, p.proname;

