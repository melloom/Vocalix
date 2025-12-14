-- Allow users to view devices associated with their profile
-- This is needed for the device activity section in settings

DROP POLICY IF EXISTS "Users can view their profile devices" ON public.devices;
CREATE POLICY "Users can view their profile devices"
ON public.devices FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR profile_id IN (
    SELECT profile_id FROM public.devices
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    AND profile_id IS NOT NULL
  )
);

