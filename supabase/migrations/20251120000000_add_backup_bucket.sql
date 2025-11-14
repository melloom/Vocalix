-- Create storage bucket for backups
INSERT INTO storage.buckets (id, name, public) 
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for backup bucket
-- Users can upload their own backups (path must start with their profile_id/)
CREATE POLICY "Users can upload their own backups"
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'backups' AND
  name LIKE (
    SELECT (id::text || '/%') FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can view their own backups
CREATE POLICY "Users can view their own backups"
ON storage.objects FOR SELECT 
USING (
  bucket_id = 'backups' AND
  name LIKE (
    SELECT (id::text || '/%') FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can delete their own backups
CREATE POLICY "Users can delete their own backups"
ON storage.objects FOR DELETE 
USING (
  bucket_id = 'backups' AND
  name LIKE (
    SELECT (id::text || '/%') FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

