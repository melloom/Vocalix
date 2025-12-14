-- Enhanced Audio Quality Validation and Metadata Verification
-- Implements comprehensive audio quality checks and metadata validation
-- Addresses SECURITY_TODO.md items #149-150

-- ============================================================================
-- 1. ENHANCED AUDIO QUALITY VALIDATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_audio_quality(
  p_clip_id UUID,
  p_quality_score NUMERIC,
  p_duration_seconds INTEGER,
  p_file_size_bytes BIGINT,
  p_quality_metrics JSONB DEFAULT NULL
)
RETURNS TABLE (
  is_valid BOOLEAN,
  reason TEXT,
  should_review BOOLEAN,
  quality_issues TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bytes_per_second NUMERIC;
  v_min_bytes_per_second NUMERIC := 3000; -- Minimum ~3KB/second for valid audio
  v_max_bytes_per_second NUMERIC := 200000; -- Maximum ~200KB/second (suspiciously large)
  v_issues TEXT[] := ARRAY[]::TEXT[];
  v_volume NUMERIC;
  v_clarity NUMERIC;
  v_noise_level NUMERIC;
  v_has_issues BOOLEAN := false;
BEGIN
  -- Check duration (must be > 0 and reasonable)
  IF p_duration_seconds IS NULL OR p_duration_seconds <= 0 THEN
    RETURN QUERY SELECT false, 'Invalid duration: audio must be longer than 0 seconds', true, ARRAY['invalid_duration'];
    RETURN;
  END IF;
  
  -- Check for unreasonably long duration (likely metadata corruption)
  IF p_duration_seconds > 3600 THEN -- More than 1 hour
    v_issues := array_append(v_issues, 'unusually_long_duration');
    v_has_issues := true;
  END IF;
  
  -- Check file size (must be > 0)
  IF p_file_size_bytes IS NULL OR p_file_size_bytes <= 0 THEN
    RETURN QUERY SELECT false, 'Invalid file size: audio file is empty', true, ARRAY['empty_file'];
    RETURN;
  END IF;
  
  -- Calculate bytes per second
  v_bytes_per_second := p_file_size_bytes::NUMERIC / GREATEST(p_duration_seconds, 1);
  
  -- Check if audio is too small (likely silent/empty/corrupted)
  IF v_bytes_per_second < v_min_bytes_per_second THEN
    RETURN QUERY SELECT false, 
      format('Audio quality too low: %s bytes/second (minimum: %s). Audio may be silent, empty, or corrupted.', 
        ROUND(v_bytes_per_second, 2), v_min_bytes_per_second),
      true,
      ARRAY['low_bitrate', 'possible_silence', 'possible_corruption'];
    RETURN;
  END IF;
  
  -- Check if audio is suspiciously large (possible metadata corruption or non-audio file)
  IF v_bytes_per_second > v_max_bytes_per_second THEN
    v_issues := array_append(v_issues, 'suspiciously_high_bitrate');
    v_has_issues := true;
  END IF;
  
  -- Extract quality metrics if provided
  IF p_quality_metrics IS NOT NULL THEN
    v_volume := (p_quality_metrics->>'volume')::NUMERIC;
    v_clarity := (p_quality_metrics->>'clarity')::NUMERIC;
    v_noise_level := (p_quality_metrics->>'noise_level')::NUMERIC;
    
    -- Check for very low volume (likely silent or near-silent audio)
    IF v_volume IS NOT NULL AND v_volume < 0.1 THEN
      v_issues := array_append(v_issues, 'very_low_volume');
      v_has_issues := true;
    END IF;
    
    -- Check for very low clarity (likely static or corrupted)
    IF v_clarity IS NOT NULL AND v_clarity < 0.2 THEN
      v_issues := array_append(v_issues, 'very_low_clarity');
      v_has_issues := true;
    END IF;
    
    -- Check for very high noise (likely static or poor quality)
    IF v_noise_level IS NOT NULL AND v_noise_level > 0.8 THEN
      v_issues := array_append(v_issues, 'high_noise_level');
      v_has_issues := true;
    END IF;
  END IF;
  
  -- Check quality score if provided
  IF p_quality_score IS NOT NULL THEN
    -- Quality score below 2.0 is considered very low quality (likely silence/static)
    IF p_quality_score < 2.0 THEN
      RETURN QUERY SELECT false,
        format('Audio quality score too low: %s (minimum: 2.0). Audio may be too noisy, unclear, or contain silence/static.', p_quality_score),
        true,
        ARRAY['low_quality_score', 'possible_static', 'possible_silence'];
      RETURN;
    END IF;
    
    -- Quality score between 2.0 and 4.0 should be reviewed
    IF p_quality_score < 4.0 THEN
      v_issues := array_append(v_issues, 'low_quality_score');
      v_has_issues := true;
    END IF;
    
    -- Quality score above 9.5 might indicate metadata issues
    IF p_quality_score > 9.5 THEN
      v_issues := array_append(v_issues, 'suspiciously_high_quality_score');
      v_has_issues := true;
    END IF;
  END IF;
  
  -- If we have issues but audio is still valid, return with review flag
  IF v_has_issues AND array_length(v_issues, 1) > 0 THEN
    RETURN QUERY SELECT true, 
      format('Audio has quality issues: %s', array_to_string(v_issues, ', ')),
      true,
      v_issues;
    RETURN;
  END IF;
  
  -- Valid
  RETURN QUERY SELECT true, NULL::TEXT, false, ARRAY[]::TEXT[];
END;
$$;

-- ============================================================================
-- 2. METADATA VALIDATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_audio_metadata(
  p_clip_id UUID,
  p_claimed_duration_seconds INTEGER,
  p_claimed_file_size_bytes BIGINT,
  p_actual_file_size_bytes BIGINT,
  p_audio_path TEXT
)
RETURNS TABLE (
  is_valid BOOLEAN,
  reason TEXT,
  mismatches TEXT[],
  should_review BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mismatches TEXT[] := ARRAY[]::TEXT[];
  v_has_mismatch BOOLEAN := false;
  v_expected_min_size BIGINT;
  v_expected_max_size BIGINT;
  v_size_tolerance NUMERIC := 0.1; -- 10% tolerance for file size
BEGIN
  -- Validate file size matches claimed size (with tolerance)
  IF p_actual_file_size_bytes IS NOT NULL AND p_claimed_file_size_bytes IS NOT NULL THEN
    -- Calculate expected size range (with 10% tolerance)
    v_expected_min_size := FLOOR(p_claimed_file_size_bytes * (1 - v_size_tolerance));
    v_expected_max_size := CEILING(p_claimed_file_size_bytes * (1 + v_size_tolerance));
    
    IF p_actual_file_size_bytes < v_expected_min_size OR p_actual_file_size_bytes > v_expected_max_size THEN
      v_mismatches := array_append(v_mismatches, 
        format('file_size_mismatch: claimed=%s, actual=%s', 
          p_claimed_file_size_bytes, p_actual_file_size_bytes));
      v_has_mismatch := true;
    END IF;
  END IF;
  
  -- Validate duration is reasonable for file size
  -- Typical audio: 8-50 KB per second for WebM/MP3
  -- If file size suggests much longer/shorter duration, flag it
  IF p_actual_file_size_bytes IS NOT NULL AND p_claimed_duration_seconds IS NOT NULL AND p_claimed_duration_seconds > 0 THEN
    DECLARE
      v_bytes_per_second NUMERIC;
      v_min_reasonable_bps NUMERIC := 2000; -- 2 KB/s minimum
      v_max_reasonable_bps NUMERIC := 150000; -- 150 KB/s maximum
    BEGIN
      v_bytes_per_second := p_actual_file_size_bytes::NUMERIC / p_claimed_duration_seconds;
      
      IF v_bytes_per_second < v_min_reasonable_bps THEN
        v_mismatches := array_append(v_mismatches, 
          format('duration_size_mismatch: file too small for claimed duration (%.2f KB/s)', 
            v_bytes_per_second / 1024));
        v_has_mismatch := true;
      ELSIF v_bytes_per_second > v_max_reasonable_bps THEN
        v_mismatches := array_append(v_mismatches, 
          format('duration_size_mismatch: file too large for claimed duration (%.2f KB/s)', 
            v_bytes_per_second / 1024));
        v_has_mismatch := true;
      END IF;
    END;
  END IF;
  
  -- Check for missing audio path
  IF p_audio_path IS NULL OR p_audio_path = '' THEN
    RETURN QUERY SELECT false, 'Missing audio file path', ARRAY['missing_audio_path'], true;
    RETURN;
  END IF;
  
  -- If we have mismatches, return with review flag
  IF v_has_mismatch THEN
    RETURN QUERY SELECT false,
      format('Metadata validation failed: %s', array_to_string(v_mismatches, '; ')),
      v_mismatches,
      true;
    RETURN;
  END IF;
  
  -- Valid
  RETURN QUERY SELECT true, NULL::TEXT, ARRAY[]::TEXT[], false;
END;
$$;

-- ============================================================================
-- 3. COMPREHENSIVE AUDIO VALIDATION FUNCTION (Combines Quality + Metadata)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_audio_comprehensive(
  p_clip_id UUID,
  p_quality_score NUMERIC,
  p_duration_seconds INTEGER,
  p_claimed_file_size_bytes BIGINT,
  p_actual_file_size_bytes BIGINT,
  p_audio_path TEXT,
  p_quality_metrics JSONB DEFAULT NULL
)
RETURNS TABLE (
  is_valid BOOLEAN,
  reason TEXT,
  validation_type TEXT, -- 'quality', 'metadata', 'both'
  issues TEXT[],
  should_review BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quality_result RECORD;
  v_metadata_result RECORD;
  v_all_issues TEXT[] := ARRAY[]::TEXT[];
  v_has_quality_issues BOOLEAN := false;
  v_has_metadata_issues BOOLEAN := false;
  v_validation_type TEXT := '';
BEGIN
  -- Run quality validation
  SELECT * INTO v_quality_result
  FROM public.check_audio_quality(
    p_clip_id,
    p_quality_score,
    p_duration_seconds,
    p_actual_file_size_bytes,
    p_quality_metrics
  );
  
  -- Run metadata validation
  SELECT * INTO v_metadata_result
  FROM public.validate_audio_metadata(
    p_clip_id,
    p_duration_seconds,
    p_claimed_file_size_bytes,
    p_actual_file_size_bytes,
    p_audio_path
  );
  
  -- Combine results
  IF NOT v_quality_result.is_valid THEN
    v_has_quality_issues := true;
    v_validation_type := 'quality';
    v_all_issues := array_cat(v_all_issues, v_quality_result.quality_issues);
  END IF;
  
  IF NOT v_metadata_result.is_valid THEN
    v_has_metadata_issues := true;
    IF v_validation_type = '' THEN
      v_validation_type := 'metadata';
    ELSE
      v_validation_type := 'both';
    END IF;
    v_all_issues := array_cat(v_all_issues, v_metadata_result.mismatches);
  END IF;
  
  -- If quality check flagged for review, include those issues too
  IF v_quality_result.should_review AND v_quality_result.is_valid THEN
    v_all_issues := array_cat(v_all_issues, v_quality_result.quality_issues);
  END IF;
  
  -- Determine final validity
  IF v_has_quality_issues OR v_has_metadata_issues THEN
    RETURN QUERY SELECT false,
      format('Audio validation failed: Quality=%s, Metadata=%s. Issues: %s',
        CASE WHEN v_has_quality_issues THEN 'FAIL' ELSE 'PASS' END,
        CASE WHEN v_has_metadata_issues THEN 'FAIL' ELSE 'PASS' END,
        array_to_string(v_all_issues, ', ')),
      v_validation_type,
      v_all_issues,
      true;
    RETURN;
  END IF;
  
  -- Check if review is needed (quality issues but still valid)
  IF v_quality_result.should_review OR v_metadata_result.should_review THEN
    RETURN QUERY SELECT true,
      format('Audio passed validation but has issues requiring review: %s',
        array_to_string(v_all_issues, ', ')),
      v_validation_type,
      v_all_issues,
      true;
    RETURN;
  END IF;
  
  -- Fully valid
  RETURN QUERY SELECT true, NULL::TEXT, 'none', ARRAY[]::TEXT[], false;
END;
$$;

-- ============================================================================
-- 4. FUNCTION TO RE-VALIDATE EXISTING CLIPS (for automated checks)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.revalidate_clips_batch(
  p_limit INTEGER DEFAULT 100,
  p_max_age_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  checked_count INTEGER,
  invalid_count INTEGER,
  review_needed_count INTEGER,
  issues_found TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clip RECORD;
  v_checked INTEGER := 0;
  v_invalid INTEGER := 0;
  v_review_needed INTEGER := 0;
  v_all_issues TEXT[] := ARRAY[]::TEXT[];
  v_validation_result RECORD;
BEGIN
  -- Find clips that need re-validation
  FOR v_clip IN
    SELECT 
      id,
      duration_seconds,
      audio_path,
      quality_score,
      quality_metrics,
      status,
      created_at
    FROM public.clips
    WHERE status IN ('live', 'processing')
      AND created_at > now() - (p_max_age_hours || ' hours')::interval
      AND audio_path IS NOT NULL
    ORDER BY created_at DESC
    LIMIT p_limit
  LOOP
    v_checked := v_checked + 1;
    
    -- Get actual file size (would need to be done via edge function in production)
    -- For now, we'll use the stored duration and quality metrics
    
    -- Run comprehensive validation
    SELECT * INTO v_validation_result
    FROM public.validate_audio_comprehensive(
      v_clip.id,
      v_clip.quality_score,
      v_clip.duration_seconds,
      NULL, -- claimed_file_size (not stored separately)
      NULL, -- actual_file_size (would need edge function)
      v_clip.audio_path,
      v_clip.quality_metrics
    );
    
    -- Process results
    IF NOT v_validation_result.is_valid THEN
      v_invalid := v_invalid + 1;
      -- Update clip status
      UPDATE public.clips
      SET status = 'removed',
          updated_at = now()
      WHERE id = v_clip.id;
      
      -- Flag for review
      PERFORM public.flag_content_for_review(
        v_clip.id,
        v_validation_result.reason || ' (re-validation)',
        v_clip.quality_score
      );
      
      v_all_issues := array_cat(v_all_issues, v_validation_result.issues);
    ELSIF v_validation_result.should_review THEN
      v_review_needed := v_review_needed + 1;
      -- Flag for review but keep status
      PERFORM public.flag_content_for_review(
        v_clip.id,
        v_validation_result.reason || ' (re-validation)',
        v_clip.quality_score
      );
      
      v_all_issues := array_cat(v_all_issues, v_validation_result.issues);
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT 
    v_checked,
    v_invalid,
    v_review_needed,
    v_all_issues;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.check_audio_quality(UUID, NUMERIC, INTEGER, BIGINT, JSONB) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.validate_audio_metadata(UUID, INTEGER, BIGINT, BIGINT, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.validate_audio_comprehensive(UUID, NUMERIC, INTEGER, BIGINT, BIGINT, TEXT, JSONB) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.revalidate_clips_batch(INTEGER, INTEGER) TO authenticated, anon;

-- ============================================================================
-- 5. SCHEDULE AUTOMATED RE-VALIDATION
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule existing job if it exists
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'revalidate-clips-batch') THEN
      PERFORM cron.unschedule('revalidate-clips-batch');
    END IF;
    
    -- Schedule re-validation of clips - Every 6 hours
    PERFORM cron.schedule(
      'revalidate-clips-batch',
      '0 */6 * * *', -- Every 6 hours
      'SELECT public.revalidate_clips_batch(100, 24)'
    );
    
    RAISE NOTICE '✅ Clip re-validation cron job scheduled successfully!';
    RAISE NOTICE '   - Re-validates up to 100 clips every 6 hours';
  ELSE
    RAISE WARNING '❌ pg_cron extension not found. Re-validation job not scheduled.';
  END IF;
END $$;

COMMENT ON FUNCTION public.check_audio_quality(UUID, NUMERIC, INTEGER, BIGINT, JSONB) IS 
'Enhanced audio quality validation with comprehensive checks for silence, static, corruption, and quality issues.';

COMMENT ON FUNCTION public.validate_audio_metadata(UUID, INTEGER, BIGINT, BIGINT, TEXT) IS 
'Validates that audio file metadata (duration, file size) matches actual file properties.';

COMMENT ON FUNCTION public.validate_audio_comprehensive(UUID, NUMERIC, INTEGER, BIGINT, BIGINT, TEXT, JSONB) IS 
'Comprehensive audio validation combining quality checks and metadata verification.';

COMMENT ON FUNCTION public.revalidate_clips_batch(INTEGER, INTEGER) IS 
'Re-validates existing clips in batches. Scheduled to run every 6 hours.';

