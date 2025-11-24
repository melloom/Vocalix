-- Grant Admin Access to Production Account
-- Profile ID: 1de6dfce-8d08-4bc0-a91b-61128a25fa97
-- 
-- INSTRUCTIONS:
-- 1. Run this script in your Supabase Production SQL Editor
-- 2. Verify admin access by checking the admins table
-- 3. Access admin dashboard at: /admin
--
-- NOTE: Maximum of 2 admins allowed. If you get an error, check current admins first.

-- ============================================================================
-- STEP 1: Check current admin count
-- ============================================================================

SELECT COUNT(*) as current_admin_count FROM public.admins;

-- ============================================================================
-- STEP 2: Add production account as admin
-- ============================================================================

INSERT INTO public.admins (profile_id, role, created_at)
VALUES ('1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid, 'admin', now())
ON CONFLICT (profile_id) DO UPDATE 
SET role = 'admin', created_at = now();

-- ============================================================================
-- STEP 3: Verify admin access was granted
-- ============================================================================

SELECT 
  p.handle,
  p.emoji_avatar,
  a.role,
  a.created_at,
  a.profile_id
FROM public.admins a
JOIN public.profiles p ON p.id = a.profile_id
WHERE a.profile_id = '1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid;

-- ============================================================================
-- STEP 4: List all current admins
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

