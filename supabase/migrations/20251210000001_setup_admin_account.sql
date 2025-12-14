-- Setup Admin Account
-- This migration helps you set up your admin account
-- IMPORTANT: Replace 'YOUR_PROFILE_ID' with your actual profile ID before running

-- ============================================================================
-- INSTRUCTIONS:
-- ============================================================================
-- 1. Get your profile ID:
--    - Open browser console (F12)
--    - Run: localStorage.getItem('profileId')
--    - Copy the profile ID
--
-- 2. Replace 'YOUR_PROFILE_ID' below with your actual profile ID
--
-- 3. Run this migration in Supabase SQL Editor
--
-- 4. Access admin dashboard at: /admin
-- ============================================================================

-- Function to safely set up admin account
-- This prevents accidental admin creation and ensures only you can be admin
CREATE OR REPLACE FUNCTION public.setup_admin_account(
  p_profile_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove all existing admins (optional - comment out if you want to keep existing admins)
  -- DELETE FROM public.admins;

  -- Add the specified profile as admin
  INSERT INTO public.admins (profile_id, role, created_at)
  VALUES (p_profile_id, 'admin', now())
  ON CONFLICT (profile_id) DO UPDATE 
  SET role = 'admin', created_at = now();

  -- Log the admin setup
  PERFORM public.log_security_event(
    NULL,
    'admin_account_setup',
    p_profile_id,
    jsonb_build_object(
      'action', 'admin_account_created',
      'role', 'admin',
      'setup_at', now()
    ),
    NULL,
    NULL,
    'info'
  );
END;
$$;

-- Grant execute permission to service role only
-- This ensures only you can run this function (through Supabase dashboard)
GRANT EXECUTE ON FUNCTION public.setup_admin_account(UUID) TO service_role;

-- ============================================================================
-- TO USE THIS FUNCTION:
-- ============================================================================
-- Run this in Supabase SQL Editor:
--
-- SELECT public.setup_admin_account('YOUR_PROFILE_ID'::uuid);
--
-- Replace 'YOUR_PROFILE_ID' with your actual profile ID
-- ============================================================================

-- ============================================================================
-- VERIFY ADMIN ACCESS:
-- ============================================================================
-- Run this to verify you're an admin:
--
-- SELECT 
--   p.handle,
--   p.emoji_avatar,
--   a.role,
--   a.created_at
-- FROM public.admins a
-- JOIN public.profiles p ON p.id = a.profile_id
-- ORDER BY a.created_at DESC;
-- ============================================================================

-- ============================================================================
-- REMOVE ALL OTHER ADMINS (Optional):
-- ============================================================================
-- If you want to be the only admin, run this:
--
-- DELETE FROM public.admins
-- WHERE profile_id != 'YOUR_PROFILE_ID'::uuid;
--
-- Replace 'YOUR_PROFILE_ID' with your actual profile ID
-- ============================================================================

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.setup_admin_account IS 'Safely set up admin account. Only service role can execute this function.';

