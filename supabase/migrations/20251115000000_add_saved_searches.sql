-- Create saved_searches table
CREATE TABLE IF NOT EXISTS public.saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own saved searches
CREATE POLICY "Users can view their own saved searches"
ON public.saved_searches FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Policy: Users can insert their own saved searches
CREATE POLICY "Users can insert their own saved searches"
ON public.saved_searches FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Policy: Users can update their own saved searches
CREATE POLICY "Users can update their own saved searches"
ON public.saved_searches FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Policy: Users can delete their own saved searches
CREATE POLICY "Users can delete their own saved searches"
ON public.saved_searches FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS saved_searches_profile_id_idx ON public.saved_searches(profile_id);

