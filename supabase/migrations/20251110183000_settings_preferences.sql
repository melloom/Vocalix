-- Settings & account management enhancements

-- Extend profiles with preferences and rate limiting metadata
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS default_captions BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS handle_last_changed_at TIMESTAMPTZ;
-- Helper to fetch the requester profile based on device header
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
  request_device_id := request_headers->>'x-device-id';

  IF request_device_id IS NULL OR length(trim(request_device_id)) = 0 THEN
    RAISE EXCEPTION 'Missing x-device-id header';
  END IF;

  SELECT *
  INTO requester_profile
  FROM public.profiles
  WHERE device_id = request_device_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for supplied device';
  END IF;

  RETURN requester_profile;
END;
$$;
-- Allow pseudonym updates with a once-per-7-days limit
CREATE OR REPLACE FUNCTION public.change_pseudonym(new_handle TEXT)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_profile public.profiles%ROWTYPE;
  sanitized_handle TEXT;
  rate_limit_window INTERVAL := interval '7 days';
BEGIN
  requester_profile := get_request_profile();

  sanitized_handle := trim(new_handle);

  IF sanitized_handle IS NULL OR length(sanitized_handle) < 3 THEN
    RAISE EXCEPTION 'Handle must be at least 3 characters';
  END IF;

  IF sanitized_handle ~ '[\s]' THEN
    sanitized_handle := regexp_replace(sanitized_handle, '\s+', '-', 'g');
  END IF;

  IF requester_profile.handle_last_changed_at IS NOT NULL
     AND requester_profile.handle_last_changed_at > (now() - rate_limit_window) THEN
    RAISE EXCEPTION 'You can change your pseudonym again %s',
      to_char(requester_profile.handle_last_changed_at + rate_limit_window, 'Mon DD, YYYY');
  END IF;

  BEGIN
    UPDATE public.profiles
    SET handle = sanitized_handle,
        handle_last_changed_at = now()
    WHERE id = requester_profile.id
    RETURNING * INTO requester_profile;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'That pseudonym is already taken';
  END;

  RETURN requester_profile;
END;
$$;
-- Export profile data (profile, clips, listens, reactions)
CREATE OR REPLACE FUNCTION public.export_profile_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_profile public.profiles%ROWTYPE;
  clips_json JSONB := '[]'::jsonb;
  listens_json JSONB := '[]'::jsonb;
  reactions_json JSONB := '[]'::jsonb;
BEGIN
  requester_profile := get_request_profile();

  SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
  INTO clips_json
  FROM public.clips c
  WHERE c.profile_id = requester_profile.id;

  SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
  INTO listens_json
  FROM public.listens l
  WHERE l.profile_id = requester_profile.id;

  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  INTO reactions_json
  FROM public.clip_reactions r
  WHERE r.profile_id = requester_profile.id;

  RETURN jsonb_build_object(
    'exported_at', now(),
    'profile', to_jsonb(requester_profile),
    'clips', clips_json,
    'listens', listens_json,
    'reactions', reactions_json
  );
END;
$$;
-- Purge account and associated rows
CREATE OR REPLACE FUNCTION public.purge_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_profile public.profiles%ROWTYPE;
BEGIN
  requester_profile := get_request_profile();

  DELETE FROM public.clip_reactions WHERE profile_id = requester_profile.id;
  DELETE FROM public.listens WHERE profile_id = requester_profile.id;
  DELETE FROM public.clips WHERE profile_id = requester_profile.id;
  DELETE FROM public.admins WHERE profile_id = requester_profile.id;
  UPDATE public.devices SET profile_id = NULL WHERE profile_id = requester_profile.id;
  DELETE FROM public.profiles WHERE id = requester_profile.id;
END;
$$;
