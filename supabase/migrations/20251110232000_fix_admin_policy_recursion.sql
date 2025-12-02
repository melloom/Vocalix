-- Fix infinite recursion in admins table RLS policy
-- The policy was querying the admins table within its own policy check, causing infinite recursion

DROP POLICY IF EXISTS "Admins can view admin assignments" ON public.admins;

-- Simplified policy: users can only see their own admin record (if they have one)
-- This avoids recursion by not querying the admins table within the policy check
CREATE POLICY "Admins can view admin assignments"
ON public.admins FOR SELECT
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

