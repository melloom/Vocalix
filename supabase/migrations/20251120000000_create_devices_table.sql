-- Create devices table for multi-device support
-- This table tracks devices associated with user profiles

CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT UNIQUE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS devices_device_id_idx ON public.devices(device_id);
CREATE INDEX IF NOT EXISTS devices_profile_id_idx ON public.devices(profile_id);

-- Initial policy: deny all access (will be updated by later migrations)
CREATE POLICY "Devices service role only"
ON public.devices
FOR ALL
USING (false)
WITH CHECK (false);

