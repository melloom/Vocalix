-- Add DELETE policy for clips so owners can delete their own clips
CREATE POLICY "Owners delete their clips"
ON public.clips FOR DELETE
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

