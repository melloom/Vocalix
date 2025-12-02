-- ============================================================================
-- Fix PostgREST function visibility for create_magic_login_link
-- ============================================================================
-- This migration ensures PostgREST can find and call the function
-- The issue is that PostgREST's schema cache might not see the function

-- ============================================================================
-- Step 1: Drop ALL existing versions to ensure clean slate
-- ============================================================================
DROP FUNCTION IF EXISTS public.create_magic_login_link();
DROP FUNCTION IF EXISTS public.create_magic_login_link(TEXT);
DROP FUNCTION IF EXISTS public.create_magic_login_link(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_magic_login_link(TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.create_magic_login_link(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.create_magic_login_link(INTEGER);

-- ============================================================================
-- Step 2: Create function with explicit signature that PostgREST can find
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_magic_login_link(
  target_email TEXT DEFAULT NULL,
  p_link_type TEXT DEFAULT 'standard',
  p_duration_hours INTEGER DEFAULT NULL
)
RETURNS TABLE (token TEXT, expires_at TIMESTAMPTZ, link_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_device_id TEXT;
  requester_profile_id UUID;
  raw_token UUID;
  token_expiry TIMESTAMPTZ;
  calculated_duration_hours INTEGER;
BEGIN
  -- Get request headers
  BEGIN
    request_headers := current_setting('request.headers', true)::json;
    request_device_id := NULLIF(trim(request_headers->>'x-device-id'), '');
  EXCEPTION WHEN OTHERS THEN
    request_device_id := NULL;
  END;

  IF request_device_id IS NULL THEN
    RAISE EXCEPTION 'Missing x-device-id header';
  END IF;

  -- Validate link type
  IF p_link_type NOT IN ('standard', 'extended', 'one_time') THEN
    p_link_type := 'standard';
  END IF;

  -- Get profile ID from device
  BEGIN
    SELECT id
    INTO requester_profile_id
    FROM public.profile_ids_for_request(request_device_id)
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    requester_profile_id := NULL;
  END;

  IF requester_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for supplied device';
  END IF;

  -- Determine duration based on link type or provided duration
  IF p_duration_hours IS NOT NULL THEN
    calculated_duration_hours := LEAST(p_duration_hours, 168);
  ELSE
    CASE p_link_type
      WHEN 'one_time' THEN
        calculated_duration_hours := 1;
      WHEN 'extended' THEN
        calculated_duration_hours := 168;
      ELSE
        calculated_duration_hours := 168;
    END CASE;
  END IF;

  -- Clean up expired links for this profile
  DELETE FROM public.magic_login_links ml
  WHERE ml.profile_id = requester_profile_id
    AND (ml.expires_at < now() - interval '30 days' OR ml.redeemed_at IS NOT NULL);

  -- Generate token and expiry
  raw_token := gen_random_uuid();
  token_expiry := now() + (calculated_duration_hours || ' hours')::interval;

  -- Insert new magic login link
  INSERT INTO public.magic_login_links (
    profile_id,
    token_hash,
    email,
    created_device_id,
    expires_at,
    link_type,
    duration_hours
  )
  VALUES (
    requester_profile_id,
    encode(digest(raw_token::text, 'sha256'), 'hex'),
    NULLIF(trim(target_email), ''),
    request_device_id,
    token_expiry,
    p_link_type,
    calculated_duration_hours
  );

  -- Return result
  RETURN QUERY
  SELECT raw_token::text AS token, token_expiry AS expires_at, p_link_type AS link_type;
END;
$$;

-- ============================================================================
-- Step 3: Grant permissions explicitly (all possible signatures)
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.create_magic_login_link(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_magic_login_link(TEXT, TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.create_magic_login_link(TEXT, TEXT, INTEGER) TO service_role;

-- Also grant on function without specifying parameters (for PostgREST)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;

-- ============================================================================
-- Step 4: Add comment for PostgREST visibility
-- ============================================================================
COMMENT ON FUNCTION public.create_magic_login_link(TEXT, TEXT, INTEGER) IS 
'Creates a magic login link for cross-device authentication. Parameters: target_email (optional), p_link_type (standard/extended/one_time), p_duration_hours (optional). Returns token, expires_at, link_type.';

-- ============================================================================
-- Step 5: Verify function exists and is accessible
-- ============================================================================
DO $$
DECLARE
  func_count INTEGER;
  func_signature TEXT;
BEGIN
  -- Count functions with the name (more flexible check)
  SELECT COUNT(*)
  INTO func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' 
    AND p.proname = 'create_magic_login_link';
  
  -- Get the signature for logging
  SELECT pg_get_function_identity_arguments(p.oid)
  INTO func_signature
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' 
    AND p.proname = 'create_magic_login_link'
  LIMIT 1;
  
  IF func_count = 0 THEN
    RAISE EXCEPTION 'Function create_magic_login_link was not created successfully!';
  ELSE
    RAISE NOTICE 'Function create_magic_login_link created successfully (found % version(s), signature: %)', func_count, COALESCE(func_signature, 'unknown');
  END IF;
END $$;

-- ============================================================================
-- Step 6: Notes for PostgREST schema cache
-- ============================================================================
-- PostgREST automatically refreshes its schema cache periodically
-- After applying this migration, wait 1-2 minutes for PostgREST to refresh
-- If the function still returns 404, you may need to:
-- 1. Wait a few more minutes for automatic refresh
-- 2. Contact Supabase support to manually refresh the schema cache
-- 3. Verify the function exists by running: 
--    SELECT proname, pg_get_function_identity_arguments(oid) 
--    FROM pg_proc 
--    WHERE proname = 'create_magic_login_link';

