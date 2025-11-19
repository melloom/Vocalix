-- Helper function to enable digest for current user
-- This makes it easy to enable digest from SQL editor

CREATE OR REPLACE FUNCTION public.enable_digest_for_current_user(
  p_email TEXT DEFAULT NULL,
  p_frequency TEXT DEFAULT 'daily'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_device_id TEXT;
  requester_profile_id UUID;
  result JSONB;
BEGIN
  -- Get device ID from request headers (if called from API)
  BEGIN
    request_headers := current_setting('request.headers', true)::json;
    request_device_id := NULLIF(trim(request_headers->>'x-device-id'), '');
  EXCEPTION
    WHEN OTHERS THEN
      request_device_id := NULL;
  END;

  -- If no device ID in headers, try to get from session or parameter
  IF request_device_id IS NULL THEN
    -- Try to get from current session context
    BEGIN
      request_device_id := current_setting('app.current_device_id', true);
    EXCEPTION
      WHEN OTHERS THEN
        request_device_id := NULL;
    END;
  END IF;

  -- Get profile ID
  IF request_device_id IS NOT NULL THEN
    SELECT id
    INTO requester_profile_id
    FROM public.profile_ids_for_request(request_device_id)
    LIMIT 1;
  END IF;

  -- If still no profile, raise error
  IF requester_profile_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Profile not found. Make sure you are logged in or provide device_id parameter.'
    );
  END IF;

  -- Validate frequency
  IF p_frequency NOT IN ('never', 'daily', 'weekly') THEN
    p_frequency := 'daily';
  END IF;

  -- Update profile with digest settings
  UPDATE public.profiles
  SET 
    digest_enabled = true,
    digest_frequency = p_frequency,
    email = COALESCE(NULLIF(trim(p_email), ''), email)
  WHERE id = requester_profile_id;

  -- Get updated profile
  SELECT jsonb_build_object(
    'success', true,
    'profile_id', id,
    'handle', handle,
    'email', email,
    'digest_enabled', digest_enabled,
    'digest_frequency', digest_frequency
  )
  INTO result
  FROM public.profiles
  WHERE id = requester_profile_id;

  RETURN result;
END;
$$;

-- Also create a simpler version that can be called with profile_id directly
CREATE OR REPLACE FUNCTION public.enable_digest_for_profile(
  p_profile_id UUID,
  p_email TEXT DEFAULT NULL,
  p_frequency TEXT DEFAULT 'daily'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Validate frequency
  IF p_frequency NOT IN ('never', 'daily', 'weekly') THEN
    p_frequency := 'daily';
  END IF;

  -- Update profile with digest settings
  UPDATE public.profiles
  SET 
    digest_enabled = true,
    digest_frequency = p_frequency,
    email = COALESCE(NULLIF(trim(p_email), ''), email)
  WHERE id = p_profile_id;

  -- Get updated profile
  SELECT jsonb_build_object(
    'success', true,
    'profile_id', id,
    'handle', handle,
    'email', email,
    'digest_enabled', digest_enabled,
    'digest_frequency', digest_frequency
  )
  INTO result
  FROM public.profiles
  WHERE id = p_profile_id;

  IF result IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Profile not found'
    );
  END IF;

  RETURN result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.enable_digest_for_current_user(TEXT, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.enable_digest_for_profile(UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.enable_digest_for_current_user IS 
'Enable email digest for the current user. Can be called from SQL editor or API.';

COMMENT ON FUNCTION public.enable_digest_for_profile IS 
'Enable email digest for a specific profile by ID. Requires service_role.';

-- Instructions for use:
-- Option 1: If you know your profile ID
-- SELECT public.enable_digest_for_profile('YOUR_PROFILE_ID'::uuid, 'your@email.com', 'daily');
--
-- Option 2: Enable for yourself (if you have device_id in context)
-- SELECT public.enable_digest_for_current_user('your@email.com', 'daily');
--
-- Option 3: Direct SQL update (if you know your profile ID)
-- UPDATE public.profiles 
-- SET digest_enabled = true, digest_frequency = 'daily', email = 'your@email.com'
-- WHERE id = 'YOUR_PROFILE_ID'::uuid;

