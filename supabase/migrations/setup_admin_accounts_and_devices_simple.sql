-- SIMPLE VERSION - Run ONE query at a time if you get timeouts
-- 
-- Account IDs:
-- - Local Admin: a8c24193-3912-4a7e-af33-328b3c756a32
-- - Production Admin: 1de6dfce-8d08-4bc0-a91b-61128a25fa97

-- Query 1: Make local account admin
INSERT INTO public.admins (profile_id, role, created_at)
VALUES ('a8c24193-3912-4a7e-af33-328b3c756a32'::uuid, 'admin', now())
ON CONFLICT (profile_id) DO UPDATE SET role = 'admin';

-- Query 2: Make production account admin  
INSERT INTO public.admins (profile_id, role, created_at)
VALUES ('1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid, 'admin', now())
ON CONFLICT (profile_id) DO UPDATE SET role = 'admin';

-- Query 3: Link production device to local admin
INSERT INTO public.devices (device_id, profile_id)
SELECT device_id, 'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid
FROM public.profiles
WHERE id = '1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid AND device_id IS NOT NULL
ON CONFLICT (device_id) DO UPDATE SET profile_id = 'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid;

