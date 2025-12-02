-- Fix recursive admins policy causing infinite recursion errors
DROP POLICY IF EXISTS "Admins can view admin assignments"
ON public.admins;

CREATE POLICY "Admins can view admin assignments"
ON public.admins FOR SELECT
USING (
  profile_id IN (
    SELECT id
    FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

