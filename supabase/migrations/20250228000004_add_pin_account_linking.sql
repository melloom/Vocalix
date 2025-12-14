-- Add PIN-based account linking system
-- Similar to Authy/2FA apps - generate a 4-digit PIN that expires after a set time

-- Create table for PIN codes
CREATE TABLE IF NOT EXISTS public.account_link_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pin_code TEXT NOT NULL, -- 4-digit PIN (stored as text for leading zeros)
  pin_hash TEXT NOT NULL, -- Hashed version for security
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_at TIMESTAMPTZ,
  redeemed_device_id TEXT,
  created_device_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Add indexes for fast lookups
-- Note: Cannot use now() in index predicate (not immutable), so we filter by redeemed_at only
-- The expires_at check will be done in the query itself
CREATE INDEX IF NOT EXISTS account_link_pins_pin_hash_idx ON public.account_link_pins(pin_hash) WHERE redeemed_at IS NULL;
CREATE INDEX IF NOT EXISTS account_link_pins_profile_idx ON public.account_link_pins(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_link_pins_active_idx ON public.account_link_pins(is_active, expires_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS account_link_pins_expires_at_idx ON public.account_link_pins(expires_at) WHERE redeemed_at IS NULL;

-- Enable RLS
ALTER TABLE public.account_link_pins ENABLE ROW LEVEL SECURITY;

-- Prevent direct access - all access through RPC functions
CREATE POLICY "No direct access to account link pins"
ON public.account_link_pins
FOR ALL
USING (false)
WITH CHECK (false);

-- Function to generate a PIN for account linking
CREATE OR REPLACE FUNCTION public.generate_account_link_pin(
  p_duration_minutes INTEGER DEFAULT 10
)
RETURNS TABLE (
  pin_code TEXT,
  expires_at TIMESTAMPTZ,
  duration_minutes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_device_id TEXT;
  requester_profile_id UUID;
  generated_pin TEXT;
  pin_hash TEXT;
  pin_expiry TIMESTAMPTZ;
  valid_duration INTEGER;
BEGIN
  request_headers := current_setting('request.headers', true)::json;
  request_device_id := NULLIF(trim(request_headers->>'x-device-id'), '');

  IF request_device_id IS NULL THEN
    RAISE EXCEPTION 'Missing x-device-id header';
  END IF;

  -- Get profile ID
  SELECT id
  INTO requester_profile_id
  FROM public.profile_ids_for_request(request_device_id)
  LIMIT 1;

  IF requester_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for supplied device';
  END IF;

  -- Validate and cap duration (between 1 and 30 minutes)
  valid_duration := GREATEST(1, LEAST(COALESCE(p_duration_minutes, 10), 30));

  -- Generate 4-digit PIN (0000-9999)
  -- Use random number between 0 and 9999, pad with zeros
  generated_pin := LPAD((FLOOR(RANDOM() * 10000))::TEXT, 4, '0');
  
  -- Hash the PIN for storage
  pin_hash := encode(digest(generated_pin, 'sha256'), 'hex');
  
  -- Calculate expiration
  pin_expiry := now() + (valid_duration || ' minutes')::interval;

  -- Deactivate any existing active PINs for this profile
  UPDATE public.account_link_pins
  SET is_active = false
  WHERE profile_id = requester_profile_id
    AND is_active = true
    AND redeemed_at IS NULL;

  -- Insert new PIN
  INSERT INTO public.account_link_pins (
    profile_id,
    pin_code,
    pin_hash,
    expires_at,
    created_device_id
  )
  VALUES (
    requester_profile_id,
    generated_pin,
    pin_hash,
    pin_expiry,
    request_device_id
  );

  -- Clean up old expired/redeemed PINs (older than 1 hour)
  DELETE FROM public.account_link_pins
  WHERE profile_id = requester_profile_id
    AND (expires_at < now() - interval '1 hour' OR redeemed_at IS NOT NULL);

  RETURN QUERY
  SELECT generated_pin AS pin_code, pin_expiry AS expires_at, valid_duration AS duration_minutes;
END;
$$;

-- Function to validate and redeem a PIN
CREATE OR REPLACE FUNCTION public.redeem_account_link_pin(
  p_pin_code TEXT
)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_device_id TEXT;
  pin_hash TEXT;
  pin_record public.account_link_pins%ROWTYPE;
  linked_profile public.profiles%ROWTYPE;
  current_device_profile_id UUID;
BEGIN
  request_headers := current_setting('request.headers', true)::json;
  request_device_id := NULLIF(trim(request_headers->>'x-device-id'), '');

  IF request_device_id IS NULL THEN
    RAISE EXCEPTION 'Missing x-device-id header';
  END IF;

  IF p_pin_code IS NULL OR length(trim(p_pin_code)) != 4 THEN
    RETURN QUERY
    SELECT NULL::UUID, NULL::TEXT, false AS success, 'PIN must be 4 digits'::TEXT;
    RETURN;
  END IF;

  -- Hash the provided PIN
  pin_hash := encode(digest(trim(p_pin_code), 'sha256'), 'hex');

  -- Find the PIN
  SELECT *
  INTO pin_record
  FROM public.account_link_pins
  WHERE pin_hash = pin_hash
    AND is_active = true
    AND redeemed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT NULL::UUID, NULL::TEXT, false AS success, 'Invalid or expired PIN'::TEXT;
    RETURN;
  END IF;

  -- Check if PIN is expired
  IF pin_record.expires_at < now() THEN
    -- Mark as inactive
    UPDATE public.account_link_pins
    SET is_active = false
    WHERE id = pin_record.id;
    
    RETURN QUERY
    SELECT NULL::UUID, NULL::TEXT, false AS success, 'PIN has expired'::TEXT;
    RETURN;
  END IF;

  -- Get the profile
  SELECT *
  INTO linked_profile
  FROM public.profiles
  WHERE id = pin_record.profile_id;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT NULL::UUID, NULL::TEXT, false AS success, 'Profile not found'::TEXT;
    RETURN;
  END IF;

  -- Get current device's profile (if any) - for cleanup
  SELECT p.id
  INTO current_device_profile_id
  FROM public.profiles p
  WHERE p.device_id = request_device_id
  LIMIT 1;

  IF current_device_profile_id IS NULL THEN
    SELECT d.profile_id
    INTO current_device_profile_id
    FROM public.devices d
    WHERE d.device_id = request_device_id
      AND d.profile_id IS NOT NULL
    LIMIT 1;
  END IF;

  -- Clean up old profile's device_id reference if different
  IF current_device_profile_id IS NOT NULL AND current_device_profile_id != linked_profile.id THEN
    UPDATE public.profiles
    SET device_id = NULL
    WHERE id = current_device_profile_id
      AND device_id = request_device_id;
  END IF;

  -- Link the device to the profile
  INSERT INTO public.devices (device_id, profile_id)
  VALUES (request_device_id, linked_profile.id)
  ON CONFLICT (device_id)
  DO UPDATE SET
    profile_id = EXCLUDED.profile_id,
    updated_at = now();

  -- Mark PIN as redeemed
  UPDATE public.account_link_pins
  SET redeemed_at = now(),
      redeemed_device_id = request_device_id,
      is_active = false
  WHERE id = pin_record.id;

  RETURN QUERY
  SELECT linked_profile.id, linked_profile.handle, true AS success, 'Device linked successfully'::TEXT;
END;
$$;

-- Function to get active PIN info (for the generating device)
CREATE OR REPLACE FUNCTION public.get_active_account_link_pin()
RETURNS TABLE (
  pin_code TEXT,
  expires_at TIMESTAMPTZ,
  is_expired BOOLEAN,
  seconds_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_device_id TEXT;
  requester_profile_id UUID;
  pin_record public.account_link_pins%ROWTYPE;
BEGIN
  request_headers := current_setting('request.headers', true)::json;
  request_device_id := NULLIF(trim(request_headers->>'x-device-id'), '');

  IF request_device_id IS NULL THEN
    RAISE EXCEPTION 'Missing x-device-id header';
  END IF;

  SELECT id
  INTO requester_profile_id
  FROM public.profile_ids_for_request(request_device_id)
  LIMIT 1;

  IF requester_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for supplied device';
  END IF;

  -- Get the most recent active PIN for this profile
  SELECT *
  INTO pin_record
  FROM public.account_link_pins
  WHERE profile_id = requester_profile_id
    AND is_active = true
    AND redeemed_at IS NULL
    AND created_device_id = request_device_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Return PIN info
  RETURN QUERY
  SELECT 
    pin_record.pin_code,
    pin_record.expires_at,
    (pin_record.expires_at < now()) AS is_expired,
    GREATEST(0, EXTRACT(EPOCH FROM (pin_record.expires_at - now()))::INTEGER) AS seconds_remaining;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.generate_account_link_pin(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_account_link_pin(INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.redeem_account_link_pin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_account_link_pin(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_active_account_link_pin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_account_link_pin() TO anon;

COMMENT ON TABLE public.account_link_pins IS 
'Stores 4-digit PIN codes for account linking. PINs expire after a set duration and can only be used once.';

COMMENT ON FUNCTION public.generate_account_link_pin(INTEGER) IS 
'Generates a 4-digit PIN for account linking. PIN expires after specified minutes (1-30, default 10).';

COMMENT ON FUNCTION public.redeem_account_link_pin(TEXT) IS 
'Validates and redeems a 4-digit PIN to link a device to an account. Returns success status and profile info.';

COMMENT ON FUNCTION public.get_active_account_link_pin() IS 
'Gets the active PIN for the current user (for display on the generating device).';

