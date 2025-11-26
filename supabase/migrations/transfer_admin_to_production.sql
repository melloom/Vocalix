-- Transfer Admin Account to Production
-- 
-- INSTRUCTIONS:
-- 1. Get your production profile ID from localStorage.getItem('profileId') in your production app
-- 2. Replace 'YOUR_PRODUCTION_PROFILE_ID' below with your actual profile ID
-- 3. Run this script in your Supabase Production SQL Editor
--
-- NOTE: This script will add you as an admin. If there are already 2 admins, you'll need to
-- remove one first (see the troubleshooting section in TRANSFER_ADMIN_TO_PRODUCTION.md)

-- ============================================================================
-- STEP 1: Add yourself as admin
-- ============================================================================
-- Replace 'YOUR_PRODUCTION_PROFILE_ID' with your actual production profile ID

INSERT INTO public.admins (profile_id, role, created_at)
VALUES ('YOUR_PRODUCTION_PROFILE_ID'::uuid, 'admin', now())
ON CONFLICT (profile_id) DO UPDATE 
SET role = 'admin', created_at = now();

-- ============================================================================
-- STEP 2: Verify admin access
-- ============================================================================

SELECT 
  p.handle,
  p.emoji_avatar,
  a.role,
  a.created_at,
  a.profile_id
FROM public.admins a
JOIN public.profiles p ON p.id = a.profile_id
ORDER BY a.created_at DESC;

-- ============================================================================
-- OPTIONAL: Remove all other admins (uncomment if you want to be the only admin)
-- ============================================================================
-- WARNING: This will remove ALL other admins. Only use if you want to be the sole admin.
--
-- DELETE FROM public.admins
-- WHERE profile_id != 'YOUR_PRODUCTION_PROFILE_ID'::uuid;

-- ============================================================================
-- OPTIONAL: Check current admin count
-- ============================================================================

SELECT COUNT(*) as admin_count FROM public.admins;


