-- Reputation Calculation Validation
-- Creates functions to validate that reputation calculations are correct
-- Addresses SECURITY_TODO.md Task #19: "Validate reputation calculations are correct"

-- ============================================================================
-- 1. VALIDATION FUNCTION - Compare Stored vs Calculated Reputation
-- ============================================================================

-- Function to validate reputation for a single profile
CREATE OR REPLACE FUNCTION public.validate_profile_reputation(
  p_profile_id UUID
)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  stored_reputation INTEGER,
  calculated_base_reputation INTEGER,
  calculated_enhanced_reputation INTEGER,
  stored_total_karma INTEGER,
  is_base_correct BOOLEAN,
  is_enhanced_correct BOOLEAN,
  is_karma_correct BOOLEAN,
  discrepancies TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_reputation INTEGER;
  v_stored_total_karma INTEGER;
  v_calculated_base INTEGER;
  v_calculated_enhanced INTEGER;
  v_handle TEXT;
  v_discrepancies TEXT[] := ARRAY[]::TEXT[];
  v_is_base_correct BOOLEAN := true;
  v_is_enhanced_correct BOOLEAN := true;
  v_is_karma_correct BOOLEAN := true;
BEGIN
  -- Get stored values
  SELECT 
    p.reputation,
    p.total_karma,
    p.handle
  INTO 
    v_stored_reputation,
    v_stored_total_karma,
    v_handle
  FROM public.profiles p
  WHERE p.id = p_profile_id;
  
  IF v_handle IS NULL THEN
    RAISE EXCEPTION 'Profile not found: %', p_profile_id;
  END IF;
  
  -- Calculate base reputation
  v_calculated_base := public.calculate_user_reputation(p_profile_id);
  
  -- Calculate enhanced reputation (with karma multiplier)
  v_calculated_enhanced := public.calculate_enhanced_reputation(p_profile_id);
  
  -- Check base reputation
  IF v_stored_reputation IS DISTINCT FROM v_calculated_base THEN
    v_is_base_correct := false;
    v_discrepancies := array_append(
      v_discrepancies,
      format('Base reputation mismatch: stored=%s, calculated=%s (diff: %s)',
        v_stored_reputation,
        v_calculated_base,
        v_calculated_base - COALESCE(v_stored_reputation, 0)
      )
    );
  END IF;
  
  -- Check enhanced reputation
  IF v_stored_total_karma IS DISTINCT FROM v_calculated_enhanced THEN
    v_is_enhanced_correct := false;
    v_discrepancies := array_append(
      v_discrepancies,
      format('Enhanced reputation (karma) mismatch: stored=%s, calculated=%s (diff: %s)',
        v_stored_total_karma,
        v_calculated_enhanced,
        v_calculated_enhanced - COALESCE(v_stored_total_karma, 0)
      )
    );
  END IF;
  
  -- Overall correctness
  v_is_karma_correct := v_is_base_correct AND v_is_enhanced_correct;
  
  RETURN QUERY SELECT 
    p_profile_id,
    v_handle,
    v_stored_reputation,
    v_calculated_base,
    v_calculated_enhanced,
    v_stored_total_karma,
    v_is_base_correct,
    v_is_enhanced_correct,
    v_is_karma_correct,
    v_discrepancies;
END;
$$;

-- ============================================================================
-- 2. BATCH VALIDATION FUNCTION - Validate All Profiles
-- ============================================================================

-- Function to validate reputation for all profiles (or a sample)
CREATE OR REPLACE FUNCTION public.validate_all_reputation_calculations(
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0,
  p_check_only_incorrect BOOLEAN DEFAULT false
)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  stored_reputation INTEGER,
  calculated_base_reputation INTEGER,
  calculated_enhanced_reputation INTEGER,
  stored_total_karma INTEGER,
  is_base_correct BOOLEAN,
  is_enhanced_correct BOOLEAN,
  is_karma_correct BOOLEAN,
  discrepancies TEXT[],
  total_checked INTEGER,
  total_incorrect INTEGER,
  summary JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_validation RECORD;
  v_total_checked INTEGER := 0;
  v_total_incorrect INTEGER := 0;
  v_summary JSONB;
  v_incorrect_profiles JSONB[] := ARRAY[]::JSONB[];
BEGIN
  -- Loop through profiles
  FOR v_profile IN
    SELECT id, handle
    FROM public.profiles
    ORDER BY reputation DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset
  LOOP
    -- Validate this profile
    SELECT * INTO v_validation
    FROM public.validate_profile_reputation(v_profile.id)
    LIMIT 1;
    
    v_total_checked := v_total_checked + 1;
    
    -- Check if incorrect
    IF NOT v_validation.is_karma_correct THEN
      v_total_incorrect := v_total_incorrect + 1;
      
      -- Add to incorrect profiles list
      v_incorrect_profiles := array_append(
        v_incorrect_profiles,
        jsonb_build_object(
          'profile_id', v_validation.profile_id,
          'handle', v_validation.handle,
          'discrepancies', v_validation.discrepancies,
          'stored_reputation', v_validation.stored_reputation,
          'calculated_base', v_validation.calculated_base_reputation,
          'calculated_enhanced', v_validation.calculated_enhanced_reputation,
          'stored_karma', v_validation.stored_total_karma
        )
      );
      
      -- Return this profile if checking all or only incorrect
      IF NOT p_check_only_incorrect OR NOT v_validation.is_karma_correct THEN
        RETURN QUERY SELECT 
          v_validation.profile_id,
          v_validation.handle,
          v_validation.stored_reputation,
          v_validation.calculated_base_reputation,
          v_validation.calculated_enhanced_reputation,
          v_validation.stored_total_karma,
          v_validation.is_base_correct,
          v_validation.is_enhanced_correct,
          v_validation.is_karma_correct,
          v_validation.discrepancies,
          v_total_checked,
          v_total_incorrect,
          NULL::JSONB;
      END IF;
    ELSIF NOT p_check_only_incorrect THEN
      -- Return correct profiles too if not filtering
      RETURN QUERY SELECT 
        v_validation.profile_id,
        v_validation.handle,
        v_validation.stored_reputation,
        v_validation.calculated_base_reputation,
        v_validation.calculated_enhanced_reputation,
        v_validation.stored_total_karma,
        v_validation.is_base_correct,
        v_validation.is_enhanced_correct,
        v_validation.is_karma_correct,
        v_validation.discrepancies,
        v_total_checked,
        v_total_incorrect,
        NULL::JSONB;
    END IF;
  END LOOP;
  
  -- Build summary
  v_summary := jsonb_build_object(
    'total_checked', v_total_checked,
    'total_incorrect', v_total_incorrect,
    'total_correct', v_total_checked - v_total_incorrect,
    'accuracy_percentage', CASE 
      WHEN v_total_checked > 0 
      THEN ROUND((v_total_checked - v_total_incorrect)::NUMERIC / v_total_checked * 100, 2)
      ELSE 0
    END,
    'incorrect_profiles', v_incorrect_profiles,
    'checked_at', now()
  );
  
  -- Return summary row
  RETURN QUERY SELECT 
    NULL::UUID,
    'SUMMARY'::TEXT,
    NULL::INTEGER,
    NULL::INTEGER,
    NULL::INTEGER,
    NULL::INTEGER,
    NULL::BOOLEAN,
    NULL::BOOLEAN,
    NULL::BOOLEAN,
    NULL::TEXT[],
    v_total_checked,
    v_total_incorrect,
    v_summary;
END;
$$;

-- ============================================================================
-- 3. DETAILED REPUTATION BREAKDOWN FUNCTION
-- ============================================================================

-- Function to get detailed breakdown of reputation sources for a profile
CREATE OR REPLACE FUNCTION public.get_reputation_breakdown(
  p_profile_id UUID
)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  total_listens INTEGER,
  total_reactions INTEGER,
  base_reputation INTEGER,
  user_level INTEGER,
  karma_multiplier NUMERIC,
  enhanced_reputation INTEGER,
  stored_reputation INTEGER,
  stored_total_karma INTEGER,
  breakdown JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handle TEXT;
  v_total_listens INTEGER;
  v_total_reactions INTEGER;
  v_base_reputation INTEGER;
  v_user_level INTEGER;
  v_karma_multiplier NUMERIC;
  v_enhanced_reputation INTEGER;
  v_stored_reputation INTEGER;
  v_stored_total_karma INTEGER;
  v_clip_breakdown JSONB[];
  v_clip RECORD;
BEGIN
  -- Get profile info
  SELECT 
    p.handle,
    p.reputation,
    p.total_karma,
    COALESCE(p.level, 1)
  INTO 
    v_handle,
    v_stored_reputation,
    v_stored_total_karma,
    v_user_level
  FROM public.profiles p
  WHERE p.id = p_profile_id;
  
  IF v_handle IS NULL THEN
    RAISE EXCEPTION 'Profile not found: %', p_profile_id;
  END IF;
  
  -- Calculate total listens
  SELECT COALESCE(SUM(listens_count), 0)
  INTO v_total_listens
  FROM public.clips
  WHERE profile_id = p_profile_id
    AND status = 'live';
  
  -- Calculate total reactions
  SELECT COALESCE(SUM(
    (
      SELECT SUM((value::text)::INTEGER)
      FROM jsonb_each(reactions)
      WHERE (value::text)::INTEGER IS NOT NULL
    )
  ), 0)
  INTO v_total_reactions
  FROM public.clips
  WHERE profile_id = p_profile_id
    AND status = 'live';
  
  -- Calculate base reputation
  v_base_reputation := public.calculate_user_reputation(p_profile_id);
  
  -- Get karma multiplier
  v_karma_multiplier := public.calculate_karma_multiplier(v_user_level);
  
  -- Calculate enhanced reputation
  v_enhanced_reputation := public.calculate_enhanced_reputation(p_profile_id);
  
  -- Get per-clip breakdown
  FOR v_clip IN
    SELECT 
      id,
      title,
      listens_count,
      reactions,
      (
        SELECT SUM((value::text)::INTEGER)
        FROM jsonb_each(reactions)
        WHERE (value::text)::INTEGER IS NOT NULL
      ) AS reaction_count
    FROM public.clips
    WHERE profile_id = p_profile_id
      AND status = 'live'
    ORDER BY listens_count DESC, created_at DESC
    LIMIT 20
  LOOP
    v_clip_breakdown := array_append(
      v_clip_breakdown,
      jsonb_build_object(
        'clip_id', v_clip.id,
        'title', v_clip.title,
        'listens', v_clip.listens_count,
        'reactions', COALESCE(v_clip.reaction_count, 0),
        'total_reputation', COALESCE(v_clip.listens_count, 0) + COALESCE(v_clip.reaction_count, 0)
      )
    );
  END LOOP;
  
  RETURN QUERY SELECT 
    p_profile_id,
    v_handle,
    v_total_listens,
    v_total_reactions,
    v_base_reputation,
    v_user_level,
    v_karma_multiplier,
    v_enhanced_reputation,
    v_stored_reputation,
    v_stored_total_karma,
    jsonb_build_object(
      'listens_breakdown', jsonb_build_object(
        'total_listens', v_total_listens,
        'contribution_to_reputation', v_total_listens
      ),
      'reactions_breakdown', jsonb_build_object(
        'total_reactions', v_total_reactions,
        'contribution_to_reputation', v_total_reactions
      ),
      'base_reputation_calculation', jsonb_build_object(
        'listens', v_total_listens,
        'reactions', v_total_reactions,
        'total', v_base_reputation,
        'formula', 'listens + reactions'
      ),
      'enhanced_reputation_calculation', jsonb_build_object(
        'base_reputation', v_base_reputation,
        'user_level', v_user_level,
        'karma_multiplier', v_karma_multiplier,
        'total', v_enhanced_reputation,
        'formula', format('base_reputation * %s = %s', v_karma_multiplier, v_enhanced_reputation)
      ),
      'top_clips', v_clip_breakdown,
      'stored_values', jsonb_build_object(
        'reputation', v_stored_reputation,
        'total_karma', v_stored_total_karma
      ),
      'validation', jsonb_build_object(
        'base_correct', v_stored_reputation = v_base_reputation,
        'enhanced_correct', v_stored_total_karma = v_enhanced_reputation,
        'base_diff', v_base_reputation - COALESCE(v_stored_reputation, 0),
        'enhanced_diff', v_enhanced_reputation - COALESCE(v_stored_total_karma, 0)
      )
    );
END;
$$;

-- ============================================================================
-- 4. AUTO-FIX FUNCTION (Use with caution!)
-- ============================================================================

-- Function to fix reputation discrepancies for a profile
CREATE OR REPLACE FUNCTION public.fix_profile_reputation(
  p_profile_id UUID,
  p_dry_run BOOLEAN DEFAULT true
)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  old_reputation INTEGER,
  new_reputation INTEGER,
  old_total_karma INTEGER,
  new_total_karma INTEGER,
  fixed BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation RECORD;
  v_old_reputation INTEGER;
  v_old_total_karma INTEGER;
  v_new_reputation INTEGER;
  v_new_total_karma INTEGER;
  v_handle TEXT;
BEGIN
  -- Validate first
  SELECT * INTO v_validation
  FROM public.validate_profile_reputation(p_profile_id)
  LIMIT 1;
  
  v_handle := v_validation.handle;
  v_old_reputation := v_validation.stored_reputation;
  v_old_total_karma := v_validation.stored_total_karma;
  v_new_reputation := v_validation.calculated_base_reputation;
  v_new_total_karma := v_validation.calculated_enhanced_reputation;
  
  -- Only fix if there are discrepancies
  IF v_validation.is_karma_correct THEN
    RETURN QUERY SELECT 
      p_profile_id,
      v_handle,
      v_old_reputation,
      v_new_reputation,
      v_old_total_karma,
      v_new_total_karma,
      false,
      'No discrepancies found - reputation is correct'::TEXT;
    RETURN;
  END IF;
  
  -- Fix if not dry run
  IF NOT p_dry_run THEN
    UPDATE public.profiles
    SET 
      reputation = v_new_reputation,
      total_karma = v_new_total_karma
    WHERE id = p_profile_id;
    
    RETURN QUERY SELECT 
      p_profile_id,
      v_handle,
      v_old_reputation,
      v_new_reputation,
      v_old_total_karma,
      v_new_total_karma,
      true,
      format('Fixed: reputation %s -> %s, karma %s -> %s',
        v_old_reputation,
        v_new_reputation,
        v_old_total_karma,
        v_new_total_karma
      )::TEXT;
  ELSE
    RETURN QUERY SELECT 
      p_profile_id,
      v_handle,
      v_old_reputation,
      v_new_reputation,
      v_old_total_karma,
      v_new_total_karma,
      false,
      format('DRY RUN: Would fix: reputation %s -> %s, karma %s -> %s',
        v_old_reputation,
        v_new_reputation,
        v_old_total_karma,
        v_new_total_karma
      )::TEXT;
  END IF;
END;
$$;

-- ============================================================================
-- 5. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.validate_profile_reputation(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.validate_all_reputation_calculations(INTEGER, INTEGER, BOOLEAN) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_reputation_breakdown(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.fix_profile_reputation(UUID, BOOLEAN) TO authenticated, anon;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.validate_profile_reputation IS 
'Validates that stored reputation matches calculated reputation for a single profile. Returns discrepancies if any.';

COMMENT ON FUNCTION public.validate_all_reputation_calculations IS 
'Validates reputation calculations for multiple profiles. Returns summary with accuracy percentage and list of incorrect profiles.';

COMMENT ON FUNCTION public.get_reputation_breakdown IS 
'Returns detailed breakdown of reputation sources (listens, reactions) and calculation steps for a profile. Useful for debugging.';

COMMENT ON FUNCTION public.fix_profile_reputation IS 
'Fixes reputation discrepancies for a profile. Use with caution! Set p_dry_run=true to preview changes first.';

