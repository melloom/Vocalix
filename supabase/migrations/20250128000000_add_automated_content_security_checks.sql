-- Automated Content Security Checks
-- Implements automated checks for AI moderation, community reporting, admin review, content filtering, and moderation queue

-- ============================================================================
-- 1. CREATE FUNCTION FOR AUTOMATED CONTENT SCANNING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.scan_content_for_moderation(
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  clips_scanned INTEGER,
  flags_created INTEGER,
  errors INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clips_scanned INTEGER := 0;
  v_flags_created INTEGER := 0;
  v_errors INTEGER := 0;
  v_clip RECORD;
  v_has_moderation_flag BOOLEAN;
  v_should_flag BOOLEAN := false;
  v_reason TEXT;
  v_risk NUMERIC := 0;
BEGIN
  -- Scan clips that are live but haven't been checked recently
  -- Check clips that:
  -- 1. Are live
  -- 2. Have captions (for text-based moderation)
  -- 3. Haven't been checked in the last 24 hours OR have no moderation data
  -- 4. Don't already have an active moderation flag
  
  FOR v_clip IN
    SELECT 
      c.id,
      c.captions,
      c.title,
      c.summary,
      c.status,
      c.moderation,
      c.created_at,
      c.profile_id
    FROM public.clips c
    WHERE c.status = 'live'
      AND c.captions IS NOT NULL
      AND c.captions != ''
      AND (
        -- No moderation data or old moderation data
        c.moderation IS NULL 
        OR (c.moderation->>'last_checked')::TIMESTAMPTZ < now() - INTERVAL '24 hours'
        OR NOT (c.moderation ? 'last_checked')
      )
      AND NOT EXISTS (
        -- No active moderation flags
        SELECT 1
        FROM public.moderation_flags mf
        WHERE mf.clip_id = c.id
          AND mf.workflow_state IN ('pending', 'in_review')
      )
    ORDER BY c.created_at DESC
    LIMIT p_limit
  LOOP
    BEGIN
      v_clips_scanned := v_clips_scanned + 1;
      v_should_flag := false;
      v_reason := NULL;
      v_risk := 0;
      
      -- Check for suspicious patterns in text
      -- This is a basic check - in production, this would call OpenAI moderation API
      -- For now, we'll flag based on common patterns
      
      -- Check for empty or very short content
      IF LENGTH(COALESCE(v_clip.captions, '')) < 10 THEN
        v_should_flag := true;
        v_reason := 'Very short content';
        v_risk := 2;
      END IF;
      
      -- Check for repeated characters (potential spam)
      IF v_clip.captions ~ '(.)\1{10,}' THEN
        v_should_flag := true;
        v_reason := 'Suspicious pattern detected';
        v_risk := 5;
      END IF;
      
      -- Check for excessive capitalization (potential spam)
      IF LENGTH(v_clip.captions) > 20 AND 
         (SELECT COUNT(*) FROM regexp_split_to_table(v_clip.captions, '') WHERE c ~ '[A-Z]')::NUMERIC / 
         NULLIF(LENGTH(v_clip.captions), 0) > 0.8 THEN
        v_should_flag := true;
        v_reason := 'Excessive capitalization';
        v_risk := 3;
      END IF;
      
      -- If content should be flagged, create moderation flag
      IF v_should_flag THEN
        INSERT INTO public.moderation_flags (
          clip_id,
          reasons,
          risk,
          source,
          priority
        )
        VALUES (
          v_clip.id,
          ARRAY[v_reason],
          v_risk,
          'automated_scan',
          LEAST(CAST(v_risk * 10 AS INTEGER), 100)
        )
        ON CONFLICT DO NOTHING;
        
        v_flags_created := v_flags_created + 1;
        
        -- Update clip moderation metadata
        UPDATE public.clips
        SET moderation = jsonb_build_object(
          'last_checked', now(),
          'automated_scan', true,
          'flagged', true,
          'risk', v_risk
        )
        WHERE id = v_clip.id;
      ELSE
        -- Update last checked time even if no flag
        UPDATE public.clips
        SET moderation = COALESCE(moderation, '{}'::jsonb) || jsonb_build_object(
          'last_checked', now(),
          'automated_scan', true
        )
        WHERE id = v_clip.id;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      -- Log error but continue processing
      RAISE WARNING 'Error scanning clip %: %', v_clip.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_clips_scanned, v_flags_created, v_errors;
END;
$$;

-- ============================================================================
-- 2. CREATE FUNCTION FOR AUTOMATED CONTENT FILTERING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.filter_content_by_security_rules(
  p_clip_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clip_status TEXT;
  v_profile_id UUID;
  v_should_hide BOOLEAN := false;
  v_reason TEXT;
BEGIN
  -- Get clip and profile data
  SELECT c.status, c.profile_id
  INTO v_clip_status, v_profile_id
  FROM public.clips c
  WHERE c.id = p_clip_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if profile is banned
  IF EXISTS (
    SELECT 1
    FROM public.bans b
    WHERE b.profile_id = v_profile_id
      AND b.status = 'active'
      AND (b.expires_at IS NULL OR b.expires_at > now())
  ) THEN
    RETURN true; -- Hide content from banned users
  END IF;
  
  -- Check if clip has active moderation flag with high risk
  IF EXISTS (
    SELECT 1
    FROM public.moderation_flags mf
    WHERE mf.clip_id = p_clip_id
      AND mf.workflow_state IN ('pending', 'in_review')
      AND mf.risk >= 7
  ) THEN
    RETURN true; -- Hide high-risk flagged content
  END IF;
  
  -- Check if clip status is hidden or removed
  IF v_clip_status IN ('hidden', 'removed') THEN
    RETURN true;
  END IF;
  
  -- Check if clip has been reported multiple times
  IF (
    SELECT COUNT(*)
    FROM public.reports r
    WHERE r.clip_id = p_clip_id
      AND r.workflow_state IN ('pending', 'in_review')
  ) >= 3 THEN
    RETURN true; -- Hide content with 3+ pending reports
  END IF;
  
  RETURN false; -- Content should be visible
END;
$$;

-- ============================================================================
-- 3. CREATE FUNCTION FOR AUTOMATED MODERATION QUEUE PROCESSING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_moderation_queue_automation()
RETURNS TABLE (
  items_processed INTEGER,
  auto_resolved INTEGER,
  escalated INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items_processed INTEGER := 0;
  v_auto_resolved INTEGER := 0;
  v_escalated INTEGER := 0;
  v_item RECORD;
BEGIN
  -- Auto-resolve low-risk items that are old and have no reports
  FOR v_item IN
    SELECT mf.id, mf.clip_id, mf.risk, mf.created_at, mf.workflow_state
    FROM public.moderation_flags mf
    WHERE mf.workflow_state = 'pending'
      AND mf.risk < 3
      AND mf.created_at < now() - INTERVAL '7 days'
      AND NOT EXISTS (
        SELECT 1
        FROM public.reports r
        WHERE r.clip_id = mf.clip_id
          AND r.workflow_state IN ('pending', 'in_review')
      )
    LIMIT 50
  LOOP
    BEGIN
      UPDATE public.moderation_flags
      SET workflow_state = 'resolved',
          reviewed_at = now(),
          reviewed_by = NULL, -- Automated resolution
          moderation_notes = 'Auto-resolved: Low risk, no community reports, older than 7 days'
      WHERE id = v_item.id;
      
      v_auto_resolved := v_auto_resolved + 1;
      v_items_processed := v_items_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error auto-resolving flag %: %', v_item.id, SQLERRM;
    END;
  END LOOP;
  
  -- Escalate high-risk items that are pending for more than 12 hours
  FOR v_item IN
    SELECT mf.id, mf.risk, mf.priority, mf.created_at
    FROM public.moderation_flags mf
    WHERE mf.workflow_state = 'pending'
      AND mf.risk >= 7
      AND mf.created_at < now() - INTERVAL '12 hours'
      AND mf.priority < 100
    LIMIT 50
  LOOP
    BEGIN
      UPDATE public.moderation_flags
      SET priority = LEAST(priority + 20, 100),
          moderation_notes = COALESCE(moderation_notes || E'\n', '') || 
            'Auto-escalated: High risk item pending for more than 12 hours'
      WHERE id = v_item.id;
      
      v_escalated := v_escalated + 1;
      v_items_processed := v_items_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error escalating flag %: %', v_item.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_items_processed, v_auto_resolved, v_escalated;
END;
$$;

-- ============================================================================
-- 4. CREATE FUNCTION FOR CHECKING CONTENT AGAINST FILTER RULES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_content_filter_rules(
  p_text TEXT,
  p_content_rating TEXT DEFAULT NULL
)
RETURNS TABLE (
  should_filter BOOLEAN,
  reason TEXT,
  severity TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_should_filter BOOLEAN := false;
  v_reason TEXT;
  v_severity TEXT := 'low';
BEGIN
  -- Check for empty or null text
  IF p_text IS NULL OR TRIM(p_text) = '' THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Check content rating
  IF p_content_rating = 'explicit' THEN
    RETURN QUERY SELECT true, 'Explicit content rating', 'medium';
    RETURN;
  END IF;
  
  -- Basic spam pattern detection
  IF p_text ~ '(.)\1{20,}' THEN
    RETURN QUERY SELECT true, 'Suspicious pattern detected', 'low';
    RETURN;
  END IF;
  
  -- Check for excessive links (potential spam)
  IF (SELECT COUNT(*) FROM regexp_matches(p_text, 'https?://', 'g')) > 3 THEN
    RETURN QUERY SELECT true, 'Excessive links detected', 'medium';
    RETURN;
  END IF;
  
  -- Content passes filter
  RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT;
END;
$$;

-- ============================================================================
-- 5. CREATE TRIGGER FOR AUTOMATIC CONTENT FILTERING ON CLIP INSERT/UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_filter_clip_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_should_hide BOOLEAN;
BEGIN
  -- Only check live clips
  IF NEW.status = 'live' THEN
    -- Check filter rules
    SELECT should_filter INTO v_should_hide
    FROM public.check_content_filter_rules(
      COALESCE(NEW.captions, ''),
      NEW.content_rating
    );
    
    -- If content should be filtered, set status to hidden
    IF v_should_hide THEN
      NEW.status := 'hidden';
      
      -- Create moderation flag
      INSERT INTO public.moderation_flags (
        clip_id,
        reasons,
        risk,
        source,
        priority
      )
      VALUES (
        NEW.id,
        ARRAY['Auto-filtered: ' || (SELECT reason FROM public.check_content_filter_rules(COALESCE(NEW.captions, ''), NEW.content_rating) LIMIT 1)],
        5,
        'automated_filter',
        50
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger (only if it doesn't exist)
DROP TRIGGER IF EXISTS auto_filter_clip_content_trigger ON public.clips;
CREATE TRIGGER auto_filter_clip_content_trigger
  BEFORE INSERT OR UPDATE OF captions, content_rating, status
  ON public.clips
  FOR EACH ROW
  WHEN (NEW.status = 'live' OR NEW.status = 'processing')
  EXECUTE FUNCTION public.auto_filter_clip_content();

-- ============================================================================
-- 6. CREATE FUNCTION FOR BATCH CONTENT SECURITY CHECK
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_automated_content_security_checks()
RETURNS TABLE (
  scan_results JSONB,
  queue_results JSONB,
  summary TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scan_results RECORD;
  v_queue_results RECORD;
  v_summary TEXT;
BEGIN
  -- Run content scanning
  SELECT * INTO v_scan_results
  FROM public.scan_content_for_moderation(100);
  
  -- Run moderation queue automation
  SELECT * INTO v_queue_results
  FROM public.process_moderation_queue_automation();
  
  -- Build summary
  v_summary := format(
    'Content Security Check Complete: Scanned %s clips, created %s flags, processed %s queue items (auto-resolved: %s, escalated: %s)',
    v_scan_results.clips_scanned,
    v_scan_results.flags_created,
    v_queue_results.items_processed,
    v_queue_results.auto_resolved,
    v_queue_results.escalated
  );
  
  RETURN QUERY SELECT
    jsonb_build_object(
      'clips_scanned', v_scan_results.clips_scanned,
      'flags_created', v_scan_results.flags_created,
      'errors', v_scan_results.errors
    ),
    jsonb_build_object(
      'items_processed', v_queue_results.items_processed,
      'auto_resolved', v_queue_results.auto_resolved,
      'escalated', v_queue_results.escalated
    ),
    v_summary;
END;
$$;

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.scan_content_for_moderation(INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.filter_content_by_security_rules(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.process_moderation_queue_automation() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_content_filter_rules(TEXT, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.run_automated_content_security_checks() TO authenticated, anon;

-- ============================================================================
-- 8. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_clips_moderation_check ON public.clips(status, created_at)
  WHERE status = 'live' AND captions IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_flags_auto_scan ON public.moderation_flags(source, workflow_state, created_at)
  WHERE source = 'automated_scan';

CREATE INDEX IF NOT EXISTS idx_reports_multiple_reports ON public.reports(clip_id, workflow_state)
  WHERE clip_id IS NOT NULL;

-- ============================================================================
-- 9. COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.scan_content_for_moderation(INTEGER) IS 
  'Automatically scans live clips for moderation issues and creates flags';

COMMENT ON FUNCTION public.filter_content_by_security_rules(UUID) IS 
  'Checks if content should be hidden based on security rules (bans, flags, reports)';

COMMENT ON FUNCTION public.process_moderation_queue_automation() IS 
  'Automatically processes moderation queue: auto-resolves low-risk items, escalates high-risk items';

COMMENT ON FUNCTION public.check_content_filter_rules(TEXT, TEXT) IS 
  'Checks content against filter rules (spam patterns, explicit content, etc.)';

COMMENT ON FUNCTION public.run_automated_content_security_checks() IS 
  'Runs all automated content security checks and returns summary';

