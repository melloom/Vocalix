-- Test if digest function works correctly
-- Run this to verify pgcrypto digest is working

-- Test 1: Check if pgcrypto extension is enabled
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') 
    THEN '✅ pgcrypto extension is ENABLED' 
    ELSE '❌ pgcrypto extension is NOT enabled' 
  END AS pgcrypto_status;

-- Test 2: Test digest function directly
SELECT 
  'Testing digest function...' AS test,
  CASE 
    WHEN encode(digest('test'::text, 'sha256'), 'hex') IS NOT NULL
    THEN '✅ digest() function WORKS'
    ELSE '❌ digest() function FAILED'
  END AS result,
  encode(digest('test'::text, 'sha256'), 'hex') AS hash_output;

-- Test 3: Test digest with a PIN-like value (4 digits)
SELECT 
  'Testing digest with PIN value...' AS test,
  encode(digest('1234', 'sha256'), 'hex') AS pin_hash;

-- Test 4: Try calling generate_account_link_pin (this will fail without device-id header, but shows if function syntax is correct)
-- Note: This will error about missing header, but that's expected - it means the function exists and is callable
-- SELECT * FROM public.generate_account_link_pin(10);

