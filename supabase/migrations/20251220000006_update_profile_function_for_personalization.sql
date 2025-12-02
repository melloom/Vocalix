-- Update the update_profile_with_rate_limit function to support new personalization fields
-- This allows profile_picture_url, cover_image_url, and color_scheme to be updated through the rate-limited function

CREATE OR REPLACE FUNCTION public.update_profile_with_rate_limit(
  p_updates JSONB
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_profile public.profiles%ROWTYPE;
  v_rate_limit_window INTERVAL := interval '1 hour';
  v_max_updates INTEGER := 5;
  v_update_count INTEGER;
  v_emoji_value TEXT;
  v_bio_value TEXT;
  v_captions_value BOOLEAN;
  v_profile_picture_url TEXT;
  v_cover_image_url TEXT;
  v_color_scheme JSONB;
BEGIN
  -- Get requester profile
  requester_profile := get_request_profile();
  
  -- Reset daily counter if needed
  IF requester_profile.update_count_reset_at <= now() THEN
    UPDATE public.profiles
    SET 
      update_count_today = 0,
      update_count_reset_at = date_trunc('day', now()) + interval '1 day'
    WHERE id = requester_profile.id
    RETURNING * INTO requester_profile;
  END IF;
  
  -- Count updates in last hour using rate_limit_logs
  SELECT COUNT(*) INTO v_update_count
  FROM public.rate_limit_logs
  WHERE key = 'profile:' || requester_profile.id || ':update'
    AND created_at > (now() - v_rate_limit_window);
  
  -- Check rate limit
  IF v_update_count >= v_max_updates THEN
    RAISE EXCEPTION 'Rate limit exceeded. Maximum % updates per hour allowed. Please try again later.', v_max_updates;
  END IF;
  
  -- Validate emoji if provided
  IF p_updates ? 'emoji_avatar' THEN
    v_emoji_value := p_updates->>'emoji_avatar';
    IF NOT validate_single_emoji(v_emoji_value) THEN
      RAISE EXCEPTION 'Invalid emoji avatar. Please provide a single valid emoji.';
    END IF;
  END IF;
  
  -- Extract values for updates
  IF p_updates ? 'bio' THEN
    v_bio_value := p_updates->>'bio';
  END IF;
  
  IF p_updates ? 'default_captions' THEN
    v_captions_value := (p_updates->>'default_captions')::BOOLEAN;
  END IF;
  
  IF p_updates ? 'profile_picture_url' THEN
    v_profile_picture_url := p_updates->>'profile_picture_url';
  END IF;
  
  IF p_updates ? 'cover_image_url' THEN
    v_cover_image_url := p_updates->>'cover_image_url';
  END IF;
  
  IF p_updates ? 'color_scheme' THEN
    v_color_scheme := p_updates->'color_scheme';
  END IF;
  
  -- Apply all updates in a single UPDATE statement
  UPDATE public.profiles
  SET 
    updated_at = now(),
    last_updated_at = now(),
    update_count_today = update_count_today + 1,
    emoji_avatar = COALESCE(v_emoji_value, emoji_avatar),
    bio = COALESCE(v_bio_value, bio),
    default_captions = COALESCE(v_captions_value, default_captions),
    profile_picture_url = COALESCE(v_profile_picture_url, profile_picture_url),
    cover_image_url = COALESCE(v_cover_image_url, cover_image_url),
    color_scheme = COALESCE(v_color_scheme, color_scheme)
  WHERE id = requester_profile.id
  RETURNING * INTO requester_profile;
  
  -- Log the update for rate limiting
  INSERT INTO public.rate_limit_logs (key, identifier, created_at)
  VALUES ('profile:' || requester_profile.id || ':update', requester_profile.id::TEXT, now())
  ON CONFLICT DO NOTHING;
  
  RETURN requester_profile;
END;
$$;

