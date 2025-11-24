-- Complete Admin & Device Setup - Fast & Simple
-- 
-- Account IDs:
-- - Local Admin: a8c24193-3912-4a7e-af33-328b3c756a32
-- - Production Admin: 1de6dfce-8d08-4bc0-a91b-61128a25fa97
--
-- INSTRUCTIONS: Run each section separately if needed

-- ============================================================================
-- STEP 1: Grant admin to local account
-- ============================================================================
INSERT INTO public.admins (profile_id, role, created_at)
VALUES ('a8c24193-3912-4a7e-af33-328b3c756a32'::uuid, 'admin', now())
ON CONFLICT (profile_id) DO UPDATE SET role = 'admin';

-- ============================================================================
-- STEP 2: Grant admin to production account
-- ============================================================================
INSERT INTO public.admins (profile_id, role, created_at)
VALUES ('1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid, 'admin', now())
ON CONFLICT (profile_id) DO UPDATE SET role = 'admin';

-- ============================================================================
-- STEP 3: Link production device to local admin (if device_id exists)
-- ============================================================================
INSERT INTO public.devices (device_id, profile_id)
SELECT device_id, 'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid
FROM public.profiles
WHERE id = '1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid AND device_id IS NOT NULL
ON CONFLICT (device_id) DO UPDATE SET profile_id = 'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid;

-- ============================================================================
-- VERIFICATION (Optional - run separately if needed)
-- ============================================================================

-- Quick check: Verify both accounts are admins
-- SELECT p.handle, a.role FROM public.admins a
-- JOIN public.profiles p ON p.id = a.profile_id
-- WHERE a.profile_id IN (
--   'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid,
--   '1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid
-- );

-- Quick check: See linked devices
-- SELECT d.device_id, p.handle FROM public.devices d
-- JOIN public.profiles p ON p.id = d.profile_id
-- WHERE d.profile_id = 'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid;

