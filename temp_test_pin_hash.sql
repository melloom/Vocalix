-- Test PIN hashing to verify generate and redeem use the same method
-- Run this to check if hashing is consistent

-- Test 1: Generate a test PIN and hash it
SELECT 
  '1234' AS test_pin,
  md5('1234') AS md5_hash,
  md5(trim('1234')) AS md5_hash_trimmed;

-- Test 2: Check if there are any PINs in the database and their hash format
SELECT 
  pin_code,
  pin_hash,
  md5(pin_code) AS expected_hash,
  CASE 
    WHEN pin_hash = md5(pin_code) THEN '✅ Hash matches md5(pin_code)'
    WHEN pin_hash = md5(trim(pin_code)) THEN '✅ Hash matches md5(trim(pin_code))'
    ELSE '❌ Hash does NOT match'
  END AS hash_check,
  is_active,
  expires_at,
  redeemed_at,
  created_at
FROM public.account_link_pins
ORDER BY created_at DESC
LIMIT 5;

-- Test 3: Check active PINs
SELECT 
  pin_code,
  pin_hash,
  md5(pin_code) AS expected_hash,
  is_active,
  expires_at > now() AS not_expired,
  redeemed_at IS NULL AS not_redeemed,
  CASE 
    WHEN is_active = true 
      AND expires_at > now() 
      AND redeemed_at IS NULL 
      AND pin_hash = md5(pin_code)
    THEN '✅ Valid and hash matches'
    ELSE '❌ Invalid or hash mismatch'
  END AS status
FROM public.account_link_pins
WHERE is_active = true
  AND expires_at > now()
  AND redeemed_at IS NULL
ORDER BY created_at DESC
LIMIT 5;

