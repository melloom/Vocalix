-- Revive Dead Community Feature
-- Allows users who join empty communities (no members/host) to become the host

-- ============================================
-- PART 1: Function to check if community is "dead" (no members or no host)
-- ============================================

CREATE OR REPLACE FUNCTION public.is_community_dead(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_count INT;
  v_has_creator BOOLEAN;
BEGIN
  -- Get member count
  SELECT COUNT(*) INTO v_member_count
  FROM public.community_members
  WHERE community_id = p_community_id;
  
  -- Check if community has a creator
  SELECT EXISTS (
    SELECT 1 FROM public.communities
    WHERE id = p_community_id
    AND created_by_profile_id IS NOT NULL
  ) INTO v_has_creator;
  
  -- Community is "dead" if it has no members OR no creator
  RETURN (v_member_count = 0 OR NOT v_has_creator);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_community_dead(UUID) TO authenticated, anon;

COMMENT ON FUNCTION public.is_community_dead(UUID) IS 
'Checks if a community is "dead" (has no members or no creator). Returns true if community needs revival.';

-- ============================================
-- PART 2: Create table to track ownership transfers (for rate limiting and audit)
-- ============================================

CREATE TABLE IF NOT EXISTS public.community_ownership_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  new_owner_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  previous_owner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  transfer_reason TEXT DEFAULT 'revive_dead_community',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ownership_transfers_new_owner ON public.community_ownership_transfers(new_owner_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ownership_transfers_community ON public.community_ownership_transfers(community_id);
CREATE INDEX IF NOT EXISTS idx_ownership_transfers_created ON public.community_ownership_transfers(created_at);

-- Enable RLS
ALTER TABLE public.community_ownership_transfers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see transfers for communities they own or are members of
CREATE POLICY "Users can view relevant ownership transfers"
ON public.community_ownership_transfers FOR SELECT
USING (
  new_owner_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = public.get_safe_device_id()
  )
  OR
  community_id IN (
    SELECT id FROM public.communities
    WHERE created_by_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = public.get_safe_device_id()
    )
  )
  OR
  community_id IN (
    SELECT community_id FROM public.community_members
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = public.get_safe_device_id()
    )
  )
);

-- ============================================
-- PART 3: Function to check rate limits for ownership transfers (with strict protections)
-- ============================================

CREATE OR REPLACE FUNCTION public.check_ownership_transfer_rate_limit(
  p_profile_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfers_last_6_hours INT;
  v_transfers_last_day INT;
  v_transfers_last_week INT;
  v_communities_owned INT;
  v_account_age_days INT;
  v_last_transfer_time TIMESTAMPTZ;
  v_hours_since_last_transfer NUMERIC;
  v_result JSON;
  v_allowed BOOLEAN := true;
  v_reason TEXT := '';
  v_profile RECORD;
BEGIN
  -- Get profile info including account age
  SELECT 
    created_at,
    joined_at,
    EXTRACT(DAY FROM (NOW() - COALESCE(joined_at, created_at)))::INTEGER as age_days
  INTO v_profile
  FROM public.profiles
  WHERE id = p_profile_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'Profile not found',
      'transfers_last_6_hours', 0,
      'transfers_last_day', 0,
      'transfers_last_week', 0,
      'communities_owned', 0,
      'account_age_days', 0,
      'hours_since_last_transfer', NULL,
      'max_per_6_hours', 1,
      'max_per_day', 3,
      'max_per_week', 5,
      'max_total', 5,
      'min_account_age_days', 7,
      'min_hours_between_claims', 6
    );
  END IF;
  
  v_account_age_days := v_profile.age_days;
  
  -- Count transfers in last 6 hours (max 1 per 6 hours - cooldown period)
  SELECT COUNT(*) INTO v_transfers_last_6_hours
  FROM public.community_ownership_transfers
  WHERE new_owner_profile_id = p_profile_id
  AND created_at > now() - interval '6 hours';
  
  -- Count transfers in last 24 hours (max 3 per day - stricter limit)
  SELECT COUNT(*) INTO v_transfers_last_day
  FROM public.community_ownership_transfers
  WHERE new_owner_profile_id = p_profile_id
  AND created_at > now() - interval '24 hours';
  
  -- Count transfers in last 7 days (max 5 per week)
  SELECT COUNT(*) INTO v_transfers_last_week
  FROM public.community_ownership_transfers
  WHERE new_owner_profile_id = p_profile_id
  AND created_at > now() - interval '7 days';
  
  -- Count how many communities user already owns (max 5 total - much stricter)
  SELECT COUNT(*) INTO v_communities_owned
  FROM public.communities
  WHERE created_by_profile_id = p_profile_id
  AND is_active = true;
  
  -- Get time since last transfer (for cooldown check)
  SELECT MAX(created_at) INTO v_last_transfer_time
  FROM public.community_ownership_transfers
  WHERE new_owner_profile_id = p_profile_id;
  
  IF v_last_transfer_time IS NOT NULL THEN
    v_hours_since_last_transfer := EXTRACT(EPOCH FROM (NOW() - v_last_transfer_time)) / 3600;
  ELSE
    v_hours_since_last_transfer := NULL;
  END IF;
  
  -- Check account age requirement (must be at least 7 days old)
  IF v_account_age_days < 7 THEN
    v_allowed := false;
    v_reason := format('Your account must be at least 7 days old to claim communities. Your account is %s days old.', v_account_age_days);
  -- Check cooldown period (must wait 6 hours between claims)
  ELSIF v_last_transfer_time IS NOT NULL AND v_hours_since_last_transfer < 6 THEN
    v_allowed := false;
    v_reason := format('You must wait 6 hours between claims. Please wait %.1f more hours.', 6 - v_hours_since_last_transfer);
  -- Check 6-hour limit (max 1 per 6 hours)
  ELSIF v_transfers_last_6_hours >= 1 THEN
    v_allowed := false;
    v_reason := 'You can only claim 1 community every 6 hours. Please wait before claiming another.';
  -- Check daily limit (max 3 per day - stricter)
  ELSIF v_transfers_last_day >= 3 THEN
    v_allowed := false;
    v_reason := 'You can only claim 3 communities per day. Please try again tomorrow.';
  -- Check weekly limit (max 5 per week)
  ELSIF v_transfers_last_week >= 5 THEN
    v_allowed := false;
    v_reason := 'You can only claim 5 communities per week. Please wait before claiming more.';
  -- Check total owned limit (max 5 total - much stricter)
  ELSIF v_communities_owned >= 5 THEN
    v_allowed := false;
    v_reason := 'You already own 5 communities. Please manage your existing communities before claiming more.';
  END IF;
  
  -- Build result
  v_result := json_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'transfers_last_6_hours', v_transfers_last_6_hours,
    'transfers_last_day', v_transfers_last_day,
    'transfers_last_week', v_transfers_last_week,
    'communities_owned', v_communities_owned,
    'account_age_days', v_account_age_days,
    'hours_since_last_transfer', v_hours_since_last_transfer,
    'max_per_6_hours', 1,
    'max_per_day', 3,
    'max_per_week', 5,
    'max_total', 5,
    'min_account_age_days', 7,
    'min_hours_between_claims', 6
  );
  
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ownership_transfer_rate_limit(UUID) TO authenticated, anon;

-- ============================================
-- PART 4: Function to transfer community ownership (with protections)
-- ============================================

CREATE OR REPLACE FUNCTION public.transfer_community_ownership(
  p_community_id UUID,
  p_new_owner_profile_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community RECORD;
  v_is_dead BOOLEAN;
  v_is_member BOOLEAN;
  v_rate_limit_result JSON;
  v_previous_owner_id UUID;
  v_result JSON;
  v_account_age_days INT;
  v_profile_check RECORD;
BEGIN
  -- Get the community
  SELECT * INTO v_community
  FROM public.communities
  WHERE id = p_community_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Community not found'
    );
  END IF;
  
  -- Verify community is actually dead
  v_is_dead := public.is_community_dead(p_community_id);
  IF NOT v_is_dead THEN
    RETURN json_build_object(
      'success', false,
      'error', 'This community is not dead. It already has members or a creator.'
    );
  END IF;
  
  -- Verify user is a member (they should have joined first)
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = p_community_id
    AND profile_id = p_new_owner_profile_id
  ) INTO v_is_member;
  
  IF NOT v_is_member THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You must be a member of the community before becoming the host.'
    );
  END IF;
  
  -- Check rate limits (includes account age, cooldown, and all limits)
  v_rate_limit_result := public.check_ownership_transfer_rate_limit(p_new_owner_profile_id);
  IF (v_rate_limit_result->>'allowed')::boolean = false THEN
    RETURN json_build_object(
      'success', false,
      'error', v_rate_limit_result->>'reason',
      'rate_limit_info', v_rate_limit_result
    );
  END IF;
  
  -- Additional check: Verify account is not too new (double-check for security)
  SELECT EXTRACT(DAY FROM (NOW() - COALESCE(joined_at, created_at)))::INTEGER
  INTO v_account_age_days
  FROM public.profiles
  WHERE id = p_new_owner_profile_id;
  
  IF v_account_age_days IS NULL OR v_account_age_days < 7 THEN
    RETURN json_build_object(
      'success', false,
      'error', format('Account must be at least 7 days old. Your account is %s days old.', COALESCE(v_account_age_days, 0))
    );
  END IF;
  
  -- Get previous owner (if any)
  v_previous_owner_id := v_community.created_by_profile_id;
  
  -- Update the community to set new owner
  UPDATE public.communities
  SET 
    created_by_profile_id = p_new_owner_profile_id,
    updated_at = now()
  WHERE id = p_community_id;
  
  -- Ensure the new owner is a member (should already be, but just in case)
  INSERT INTO public.community_members (community_id, profile_id)
  VALUES (p_community_id, p_new_owner_profile_id)
  ON CONFLICT (community_id, profile_id) DO NOTHING;
  
  -- Make them a moderator too (hosts should be moderators)
  INSERT INTO public.community_moderators (community_id, moderator_profile_id, elected_by_profile_id)
  VALUES (p_community_id, p_new_owner_profile_id, p_new_owner_profile_id)
  ON CONFLICT (community_id, moderator_profile_id) DO NOTHING;
  
  -- Log the ownership transfer for audit
  INSERT INTO public.community_ownership_transfers (
    community_id,
    new_owner_profile_id,
    previous_owner_profile_id,
    transfer_reason
  ) VALUES (
    p_community_id,
    p_new_owner_profile_id,
    v_previous_owner_id,
    'revive_dead_community'
  );
  
  RETURN json_build_object(
    'success', true,
    'message', 'Community ownership transferred successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_community_ownership(UUID, UUID) TO authenticated, anon;

COMMENT ON FUNCTION public.transfer_community_ownership(UUID, UUID) IS 
'Transfers ownership of a community to a new profile with rate limiting and validation. Returns JSON with success status and error messages.';

COMMENT ON FUNCTION public.check_ownership_transfer_rate_limit(UUID) IS 
'Checks rate limits for community ownership transfers. Returns JSON with allowed status, reason if denied, and current counts.';

COMMENT ON TABLE public.community_ownership_transfers IS 
'Audit log of community ownership transfers. Tracks who transferred ownership, when, and why.';

-- ============================================
-- PART 3: RPC function to check if community is dead (for client use)
-- ============================================

CREATE OR REPLACE FUNCTION public.check_community_status(p_community_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_is_dead BOOLEAN;
  v_member_count INT;
  v_has_creator BOOLEAN;
BEGIN
  -- Check if dead
  v_is_dead := public.is_community_dead(p_community_id);
  
  -- Get member count
  SELECT COUNT(*) INTO v_member_count
  FROM public.community_members
  WHERE community_id = p_community_id;
  
  -- Check if has creator
  SELECT EXISTS (
    SELECT 1 FROM public.communities
    WHERE id = p_community_id
    AND created_by_profile_id IS NOT NULL
  ) INTO v_has_creator;
  
  -- Return status
  v_result := json_build_object(
    'is_dead', v_is_dead,
    'member_count', v_member_count,
    'has_creator', v_has_creator
  );
  
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_community_status(UUID) TO authenticated, anon;

COMMENT ON FUNCTION public.check_community_status(UUID) IS 
'Returns the status of a community including whether it is dead, member count, and if it has a creator.';

