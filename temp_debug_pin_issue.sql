-- Debug script to check PIN hashing and matching
-- Run this to see what's happening with PIN validation

-- Check the most recent PINs and their hashes
SELECT 
  pin_code,
  pin_hash,
  md5(pin_code) AS expected_md5_hash,
  CASE 
    WHEN pin_hash = md5(pin_code) THEN '✅ MATCHES'
    ELSE '❌ DOES NOT MATCH'
  END AS hash_match,
  is_active,
  expires_at,
  expires_at > now() AS not_expired,
  redeemed_at IS NULL AS not_redeemed,
  created_at,
  created_device_id
FROM public.account_link_pins
ORDER BY created_at DESC
LIMIT 10;

-- Check if there are any active PINs right now
SELECT 
  COUNT(*) AS active_pin_count,
  MIN(expires_at) AS earliest_expiry,
  MAX(expires_at) AS latest_expiry
FROM public.account_link_pins
WHERE is_active = true
  AND expires_at > now()
  AND redeemed_at IS NULL;

-- Test hash generation for a sample PIN
SELECT 
  '1234' AS test_pin,
  md5('1234') AS hash_with_md5,
  md5(trim('1234')) AS hash_with_md5_trimmed,
  CASE 
    WHEN md5('1234') = md5(trim('1234')) THEN '✅ Same hash'
    ELSE '❌ Different hash'
  END AS comparison;

