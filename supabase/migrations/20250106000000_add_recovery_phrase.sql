-- ============================================================================
-- Migration: Add Recovery Phrase for Anonymous Device Transfer
-- ============================================================================
-- This migration adds recovery phrase support so users can transfer their
-- persona to a new device without requiring email/phone. The phrase is
-- hashed using HMAC (same secret as device ID pseudonymity) for security.
-- ============================================================================

-- Step 1: Add recovery_phrase_hash column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS recovery_phrase_hash TEXT;

-- Step 2: Create index for faster lookups by recovery_phrase_hash
CREATE INDEX IF NOT EXISTS idx_profiles_recovery_phrase_hash 
ON public.profiles(recovery_phrase_hash)
WHERE recovery_phrase_hash IS NOT NULL;

-- Step 3: Add comment explaining the column
COMMENT ON COLUMN public.profiles.recovery_phrase_hash IS 
  'HMAC-hashed recovery phrase for device transfer. Never store raw recovery phrase in database.';

-- Step 4: Create function to restore persona using recovery phrase
-- This function will be called from an Edge Function that handles HMAC hashing
CREATE OR REPLACE FUNCTION public.restore_persona_by_recovery_phrase(
  p_recovery_phrase_hash TEXT,
  p_new_pseudo_id TEXT
)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  success BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- Find profile by recovery phrase hash
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE recovery_phrase_hash = p_recovery_phrase_hash
    AND recovery_phrase_hash IS NOT NULL
    AND trim(recovery_phrase_hash) != '';
  
  IF NOT FOUND THEN
    -- Return failure (don't reveal if phrase is wrong for security)
    RETURN QUERY
    SELECT NULL::UUID, NULL::TEXT, false::BOOLEAN;
    RETURN;
  END IF;

  -- Update the profile's pseudo_id to the new device's pseudo_id
  -- This links the persona to the new device
  UPDATE public.profiles
  SET 
    pseudo_id = p_new_pseudo_id,
    updated_at = now()
  WHERE id = v_profile.id;

  -- Return success with profile info
  RETURN QUERY
  SELECT v_profile.id, v_profile.handle, true::BOOLEAN;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.restore_persona_by_recovery_phrase(TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.restore_persona_by_recovery_phrase(TEXT, TEXT) IS 
  'Restores a persona to a new device by matching recovery phrase hash. Updates pseudo_id to link persona to new device.';

