-- ============================================================================
-- ENABLE PGCRYPTO EXTENSION - This MUST be enabled for digest() to work
-- ============================================================================

-- Enable pgcrypto extension (required for digest() function)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verify it's enabled
DO $$
DECLARE
  extension_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
  ) INTO extension_exists;
  
  IF extension_exists THEN
    RAISE NOTICE '✅ pgcrypto extension is now ENABLED';
  ELSE
    RAISE EXCEPTION '❌ Failed to enable pgcrypto extension! You may need database superuser permissions.';
  END IF;
END $$;

-- Test digest function
SELECT 
  'Testing digest() function...' AS status,
  CASE 
    WHEN encode(digest('test'::text, 'sha256'), 'hex') = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
    THEN '✅ digest() function WORKS CORRECTLY!'
    ELSE '⚠️ digest() function returned unexpected result'
  END AS test_result,
  encode(digest('test'::text, 'sha256'), 'hex') AS digest_output;

-- Show enabled extensions
SELECT 
  'Enabled extensions:' AS info,
  extname AS extension,
  extversion AS version
FROM pg_extension
ORDER BY extname;

