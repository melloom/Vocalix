-- ============================================
-- FINAL FIX: Resolve Infinite Recursion & Ambiguous Column Issues
-- ============================================
-- This fixes the database errors that prevent device tracking from working
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Remove ALL existing policies to break recursion
DROP POLICY IF EXISTS "devices_device_id_access" ON public.devices;
DROP POLICY IF EXISTS "devices_profile_access" ON public.devices;
DROP POLICY IF EXISTS "Users can view their profile devices" ON public.devices;
DROP POLICY IF EXISTS "Users can manage their devices" ON public.devices;
DROP POLICY IF EXISTS "Users can view devices by device_id" ON public.devices;
DROP POLICY IF EXISTS "Users can manage devices by device_id" ON public.devices;
DROP POLICY IF EXISTS "Allow device access by device_id" ON public.devices;
DROP POLICY IF EXISTS "Allow device access by profile" ON public.devices;
DROP POLICY IF EXISTS "Devices service role only" ON public.devices;

-- Step 2: Create simple, non-recursive policies
-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "devices_by_device_id" ON public.devices;
DROP POLICY IF EXISTS "devices_by_profile_id" ON public.devices;

-- Policy 1: Allow access by device_id header (no recursion)
CREATE POLICY "devices_by_device_id"
ON public.devices
FOR ALL
USING (
  device_id = COALESCE(
    NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
    device_id
  )
)
WITH CHECK (
  device_id = COALESCE(
    NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
    device_id
  )
);

-- Policy 2: Allow access by profile_id (no recursion - direct lookup)
CREATE POLICY "devices_by_profile_id"
ON public.devices
FOR ALL
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
  )
)
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
  )
);

-- Step 3: Fix the RPC function - resolve ambiguous column references
DROP FUNCTION IF EXISTS public.get_user_devices();

CREATE OR REPLACE FUNCTION public.get_user_devices()
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  profile_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address INET,
  is_revoked BOOLEAN,
  is_suspicious BOOLEAN,
  request_count INTEGER,
  failed_auth_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_device_id TEXT;
  device_profile_id UUID;
  existing_count INTEGER;
BEGIN
  -- Get device ID from headers
  BEGIN
    current_device_id := NULLIF(trim(
      (current_setting('request.headers', true)::json ->> 'x-device-id')
    ), '');
  EXCEPTION
    WHEN OTHERS THEN
      RETURN;
  END;
  
  -- If no device ID, return empty
  IF current_device_id IS NULL OR current_device_id = '' THEN
    RETURN;
  END IF;
  
  -- Get profile_id if exists
  BEGIN
    SELECT p.id INTO device_profile_id
    FROM public.profiles p
    WHERE p.device_id = current_device_id
    LIMIT 1;
  EXCEPTION
    WHEN OTHERS THEN
      device_profile_id := NULL;
  END;
  
  -- Create or update device (SECURITY DEFINER bypasses RLS)
  -- Use simple UPDATE then INSERT to avoid all ambiguous column issues
  BEGIN
    -- Check if device exists and get current count (use alias to avoid ambiguity)
    SELECT d.request_count INTO existing_count
    FROM public.devices d
    WHERE d.device_id = current_device_id
    LIMIT 1;
    
    IF existing_count IS NOT NULL THEN
      -- Device exists, update it (use alias to avoid ambiguity)
      UPDATE public.devices d
      SET 
        last_seen_at = now(),
        request_count = existing_count + 1,
        updated_at = now(),
        profile_id = COALESCE(d.profile_id, device_profile_id)
      WHERE d.device_id = current_device_id;
    ELSE
      -- Device doesn't exist, insert it
      INSERT INTO public.devices (
        device_id, 
        profile_id, 
        first_seen_at, 
        last_seen_at, 
        request_count,
        updated_at
      )
      VALUES (
        current_device_id,
        device_profile_id,
        now(),
        now(),
        1,
        now()
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- If all fails, just try a simple insert (let unique constraint handle conflicts)
      -- This is a last resort fallback
      BEGIN
        INSERT INTO public.devices (device_id, profile_id, first_seen_at, last_seen_at, request_count, updated_at)
        VALUES (current_device_id, device_profile_id, now(), now(), 1, now());
      EXCEPTION
        WHEN unique_violation THEN
          -- Device already exists, just update last_seen (use alias to avoid ambiguity)
          UPDATE public.devices d
          SET last_seen_at = now(), updated_at = now()
          WHERE d.device_id = current_device_id;
      END;
  END;
  
  -- Return devices - SECURITY DEFINER bypasses RLS, so we can read directly
  -- Use table aliases to avoid ambiguous column references
  -- No need for DISTINCT since device_id is unique
  RETURN QUERY
  SELECT
    d.id,
    d.device_id,
    d.profile_id,
    d.created_at,
    d.updated_at,
    d.last_seen_at,
    COALESCE(d.first_seen_at, d.created_at) as first_seen_at,
    d.user_agent,
    d.ip_address,
    COALESCE(d.is_revoked, false) as is_revoked,
    COALESCE(d.is_suspicious, false) as is_suspicious,
    COALESCE(d.request_count, 0) as request_count,
    COALESCE(d.failed_auth_count, 0) as failed_auth_count
  FROM public.devices d
  WHERE d.device_id = current_device_id
     OR d.profile_id = device_profile_id
     OR d.profile_id IN (
       SELECT d2.profile_id FROM public.devices d2
       WHERE d2.device_id = current_device_id
       AND d2.profile_id IS NOT NULL
     )
  ORDER BY 
    CASE WHEN d.device_id = current_device_id THEN 0 ELSE 1 END,
    d.last_seen_at DESC NULLS LAST;
END;
$$;

-- Step 4: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO service_role;

-- Step 5: Set function owner
ALTER FUNCTION public.get_user_devices() OWNER TO postgres;

-- ============================================
-- Verification
-- ============================================
SELECT 
  'Policies' as check_type,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'devices';

SELECT 
  'Function' as check_type,
  routine_name,
  security_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'get_user_devices';

-- ============================================
-- After running this:
-- 1. Refresh your browser
-- 2. Clear localStorage: localStorage.removeItem('missing_rpc_functions');
-- 3. Device should now appear in Settings
-- ============================================

