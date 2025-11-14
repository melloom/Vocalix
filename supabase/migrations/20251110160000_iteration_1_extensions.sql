-- Devices table to track pseudonymous installs
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT UNIQUE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Devices readable by owner" 
ON public.devices FOR SELECT 
USING (device_id = current_setting('request.headers', true)::json->>'x-device-id');
CREATE POLICY "Devices insertable by owner"
ON public.devices FOR INSERT
WITH CHECK (device_id = current_setting('request.headers', true)::json->>'x-device-id');
CREATE POLICY "Devices updatable by owner"
ON public.devices FOR UPDATE
USING (device_id = current_setting('request.headers', true)::json->>'x-device-id');
-- Clip reactions table for optimistic UI sync
CREATE TABLE public.clip_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.clip_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reactions readable by everyone"
ON public.clip_reactions FOR SELECT
USING (true);
CREATE POLICY "Reactions insertable by owner"
ON public.clip_reactions FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);
-- Optional waveform metadata for richer playback
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS waveform JSONB;
-- Trigger for devices.updated_at
CREATE TRIGGER set_updated_at_devices
BEFORE UPDATE ON public.devices
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
