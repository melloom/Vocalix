-- Magic login links and multi-device support

-- Helper to list profile ids associated with the current (or provided) device
CREATE OR REPLACE FUNCTION public.profile_ids_for_request(request_device_id TEXT DEFAULT NULL)
RETURNS TABLE (id UUID)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH resolved_device AS (
    SELECT NULLIF(trim(
      COALESCE(
        request_device_id,
        (current_setting('request.headers', true)::json ->> 'x-device-id')
      )
    ), '') AS device_id
  )
  SELECT p.id
  FROM resolved_device r
  JOIN public.profiles p ON p.device_id = r.device_id
  WHERE r.device_id IS NOT NULL
  UNION
  SELECT d.profile_id
  FROM resolved_device r
  JOIN public.devices d ON d.device_id = r.device_id
  WHERE r.device_id IS NOT NULL
    AND d.profile_id IS NOT NULL;
$$;

-- Refresh helper to pull the requester profile (used by existing RPCs)
CREATE OR REPLACE FUNCTION public.get_request_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_device_id TEXT;
  requester_profile public.profiles%ROWTYPE;
BEGIN
  request_headers := current_setting('request.headers', true)::json;
  request_device_id := NULLIF(trim(request_headers->>'x-device-id'), '');

  IF request_device_id IS NULL THEN
    RAISE EXCEPTION 'Missing x-device-id header';
  END IF;

  SELECT p.*
  INTO requester_profile
  FROM public.profiles p
  WHERE p.id IN (SELECT id FROM public.profile_ids_for_request(request_device_id))
  ORDER BY p.joined_at NULLS LAST, p.created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for supplied device';
  END IF;

  RETURN requester_profile;
END;
$$;

-- Update core policies to recognise linked devices
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (
  id IN (SELECT id FROM public.profile_ids_for_request())
)
WITH CHECK (
  id IN (SELECT id FROM public.profile_ids_for_request())
);

DROP POLICY IF EXISTS "Owners view their clips" ON public.clips;
CREATE POLICY "Owners view their clips"
ON public.clips FOR SELECT
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

DROP POLICY IF EXISTS "Owners update their clips" ON public.clips;
CREATE POLICY "Owners update their clips"
ON public.clips FOR UPDATE
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
)
WITH CHECK (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

DROP POLICY IF EXISTS "Reports insertable by reporters" ON public.reports;
CREATE POLICY "Reports insertable by reporters"
ON public.reports FOR INSERT
WITH CHECK (
  reporter_profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

DROP POLICY IF EXISTS "Reports viewable by admins" ON public.reports;
CREATE POLICY "Reports viewable by admins"
ON public.reports FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

DROP POLICY IF EXISTS "Reports updatable by admins" ON public.reports;
CREATE POLICY "Reports updatable by admins"
ON public.reports FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

DROP POLICY IF EXISTS "Moderation flags updatable by admins" ON public.moderation_flags;
CREATE POLICY "Moderation flags updatable by admins"
ON public.moderation_flags FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

DROP POLICY IF EXISTS "Moderation flags viewable by admins" ON public.moderation_flags;
CREATE POLICY "Moderation flags viewable by admins"
ON public.moderation_flags FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

DROP POLICY IF EXISTS "Admins can view admin assignments" ON public.admins;
CREATE POLICY "Admins can view admin assignments"
ON public.admins FOR SELECT
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
  OR EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

DROP POLICY IF EXISTS "Admins view all clips" ON public.clips;
CREATE POLICY "Admins view all clips"
ON public.clips FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

DROP POLICY IF EXISTS "Admins update clips" ON public.clips;
CREATE POLICY "Admins update clips"
ON public.clips FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

-- Magic login links table
CREATE TABLE public.magic_login_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT,
  created_device_id TEXT,
  redeemed_device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  redeemed_at TIMESTAMPTZ
);

ALTER TABLE public.magic_login_links ENABLE ROW LEVEL SECURITY;

-- Prevent direct access by anonymous clients; interactions go through RPC
CREATE POLICY "No direct access to magic login links"
ON public.magic_login_links
FOR ALL
USING (false)
WITH CHECK (false);

CREATE INDEX magic_login_links_profile_idx ON public.magic_login_links (profile_id, expires_at DESC);

-- Generate magic login links
CREATE OR REPLACE FUNCTION public.create_magic_login_link(target_email TEXT DEFAULT NULL)
RETURNS TABLE (token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_device_id TEXT;
  requester_profile_id UUID;
  raw_token UUID;
  token_expiry TIMESTAMPTZ;
BEGIN
  request_headers := current_setting('request.headers', true)::json;
  request_device_id := NULLIF(trim(request_headers->>'x-device-id'), '');

  IF request_device_id IS NULL THEN
    RAISE EXCEPTION 'Missing x-device-id header';
  END IF;

  SELECT id
  INTO requester_profile_id
  FROM public.profile_ids_for_request(request_device_id)
  LIMIT 1;

  IF requester_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for supplied device';
  END IF;

  -- Clean up expired links for this profile
  DELETE FROM public.magic_login_links
  WHERE profile_id = requester_profile_id
    AND (expires_at < now() OR redeemed_at IS NOT NULL);

  raw_token := gen_random_uuid();
  token_expiry := now() + interval '30 minutes';

  INSERT INTO public.magic_login_links (
    profile_id,
    token_hash,
    email,
    created_device_id,
    expires_at
  )
  VALUES (
    requester_profile_id,
    encode(digest(raw_token::text, 'sha256'), 'hex'),
    NULLIF(trim(target_email), ''),
    request_device_id,
    token_expiry
  );

  RETURN QUERY
  SELECT raw_token::text AS token, token_expiry;
END;
$$;

-- Redeem magic login link and associate the current device
CREATE OR REPLACE FUNCTION public.redeem_magic_login_link(link_token TEXT)
RETURNS TABLE (profile_id UUID, handle TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_device_id TEXT;
  hashed_token TEXT;
  link_record public.magic_login_links%ROWTYPE;
  linked_profile public.profiles%ROWTYPE;
BEGIN
  request_headers := current_setting('request.headers', true)::json;
  request_device_id := NULLIF(trim(request_headers->>'x-device-id'), '');

  IF request_device_id IS NULL THEN
    RAISE EXCEPTION 'Missing x-device-id header';
  END IF;

  IF link_token IS NULL OR length(trim(link_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid login token';
  END IF;

  hashed_token := encode(digest(trim(link_token), 'sha256'), 'hex');

  SELECT *
  INTO link_record
  FROM public.magic_login_links
  WHERE token_hash = hashed_token
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Login link not found';
  END IF;

  IF link_record.redeemed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This login link has already been used';
  END IF;

  IF link_record.expires_at < now() THEN
    RAISE EXCEPTION 'This login link has expired';
  END IF;

  SELECT *
  INTO linked_profile
  FROM public.profiles
  WHERE id = link_record.profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for login link';
  END IF;

  INSERT INTO public.devices (device_id, profile_id)
  VALUES (request_device_id, linked_profile.id)
  ON CONFLICT (device_id)
  DO UPDATE SET
    profile_id = EXCLUDED.profile_id,
    updated_at = now();

  UPDATE public.magic_login_links
  SET redeemed_at = now(),
      redeemed_device_id = request_device_id
  WHERE id = link_record.id;

  RETURN QUERY
  SELECT linked_profile.id, linked_profile.handle;
END;
$$;


