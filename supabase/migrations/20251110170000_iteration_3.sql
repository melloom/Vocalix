-- Iteration 3 enhancements: moderation, reporting, geo opt-in

-- Extend profiles with optional city consent
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS consent_city BOOLEAN NOT NULL DEFAULT false;
-- Extend clips with moderation metadata and optional city tag
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS moderation JSONB NOT NULL DEFAULT '{}'::jsonb;
-- Admins table to gate moderation tools
CREATE TABLE IF NOT EXISTS public.admins (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'moderator',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view admin assignments"
ON public.admins FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);
-- Reports table for community moderation
CREATE TABLE IF NOT EXISTS public.reports (
  id BIGSERIAL PRIMARY KEY,
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  reporter_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reports viewable by admins"
ON public.reports FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);
CREATE POLICY "Reports insertable by reporters"
ON public.reports FOR INSERT
WITH CHECK (
  reporter_profile_id IN (
    SELECT id
    FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);
CREATE POLICY "Reports updatable by admins"
ON public.reports FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);
-- Moderation flags table for AI and manual reviews
CREATE TABLE IF NOT EXISTS public.moderation_flags (
  id BIGSERIAL PRIMARY KEY,
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'ai',
  reasons TEXT[] NOT NULL DEFAULT '{}'::text[],
  risk NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.moderation_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Moderation flags viewable by admins"
ON public.moderation_flags FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);
CREATE POLICY "Moderation flags updatable by admins"
ON public.moderation_flags FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);
-- Refine clip access policies for owners and admins
DROP POLICY IF EXISTS "Live clips are viewable by everyone" ON public.clips;
CREATE POLICY "Public clips viewable"
ON public.clips FOR SELECT
USING (status IN ('live', 'processing'));
CREATE POLICY "Owners view their clips"
ON public.clips FOR SELECT
USING (
  profile_id IN (
    SELECT id
    FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);
CREATE POLICY "Admins view all clips"
ON public.clips FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);
CREATE POLICY "Admins update clips"
ON public.clips FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);
DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'clips'
      AND policyname = 'Owners update their clips'
  ) THEN
    CREATE POLICY "Owners update their clips"
    ON public.clips FOR UPDATE
    USING (
      profile_id IN (
        SELECT id
        FROM public.profiles
        WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
      )
    );
  END IF;
END;
$policy$;
