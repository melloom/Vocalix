-- ============================================================================
-- CHECK PGCRYPTO STATUS - Critical for digest() function
-- ============================================================================

-- Check 1: Is pgcrypto extension enabled?
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') 
    THEN '✅ pgcrypto extension is ENABLED' 
    ELSE '❌ pgcrypto extension is NOT enabled - THIS IS THE PROBLEM!' 
  END AS pgcrypto_status;

-- Check 2: List all enabled extensions
SELECT 
  extname AS extension_name,
  extversion AS version
FROM pg_extension
ORDER BY extname;

-- Check 3: Test if digest() function exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'pgcrypto' 
        AND p.proname = 'digest'
    )
    THEN '✅ digest() function EXISTS in pgcrypto schema'
    ELSE '❌ digest() function NOT FOUND'
  END AS digest_function_status;

-- Check 4: Test digest function directly
SELECT 
  CASE 
    WHEN encode(digest('test'::text, 'sha256'), 'hex') IS NOT NULL
    THEN '✅ digest() function WORKS - Returns: ' || encode(digest('test'::text, 'sha256'), 'hex')
    ELSE '❌ digest() function FAILED'
  END AS digest_test_result;

-- Check 5: Show digest function signature
SELECT 
  'digest function signature:' AS info,
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  n.nspname AS schema_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'digest'
  AND n.nspname = 'pgcrypto'
LIMIT 1;

