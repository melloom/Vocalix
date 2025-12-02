-- Comprehensive Security Features
-- This migration adds:
-- 1. IP-based abuse detection and tracking
-- 2. Enhanced content quality enforcement
-- 3. Reputation system abuse prevention
-- 4. Email/digest abuse prevention

-- ============================================================================
-- 1. IP-BASED ABUSE DETECTION
-- ============================================================================

-- Table to track IP addresses for all actions
CREATE TABLE IF NOT EXISTS public.ip_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL,
  action_type TEXT NOT NULL, -- 'clip_upload', 'reaction', 'comment', 'listen', 'account_creation', etc.
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resource_id UUID, -- clip_id, comment_id, etc. (polymorphic)
  device_id TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb -- Additional context
);

-- Indexes for IP activity logs
CREATE INDEX IF NOT EXISTS idx_ip_activity_logs_ip ON public.ip_activity_logs(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ip_activity_logs_action ON public.ip_activity_logs(action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ip_activity_logs_profile ON public.ip_activity_logs(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ip_activity_logs_created ON public.ip_activity_logs(created_at);

-- RLS for IP activity logs (only service role can access)
ALTER TABLE public.ip_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.ip_activity_logs;
CREATE POLICY "Service role only"
ON public.ip_activity_logs
FOR ALL
USING (false)
WITH CHECK (false);

-- Table for IP blacklist
CREATE TABLE IF NOT EXISTS public.ip_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL UNIQUE,
  reason TEXT,
  banned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  banned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ, -- NULL = permanent ban
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_ip_blacklist_ip ON public.ip_blacklist(ip_address) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ip_blacklist_expires ON public.ip_blacklist(expires_at) WHERE is_active = true;

-- RLS for IP blacklist (only service role can access)
ALTER TABLE public.ip_blacklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.ip_blacklist;
CREATE POLICY "Service role only"
ON public.ip_blacklist
FOR ALL
USING (false)
WITH CHECK (false);

-- Table for suspicious IP patterns
CREATE TABLE IF NOT EXISTS public.suspicious_ip_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL,
  pattern_type TEXT NOT NULL, -- 'rapid_actions', 'multiple_accounts', 'spam', 'abuse', etc.
  severity TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_suspicious_ip_patterns_ip ON public.suspicious_ip_patterns(ip_address, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_suspicious_ip_patterns_severity ON public.suspicious_ip_patterns(severity, last_seen_at DESC);

-- RLS for suspicious IP patterns (only service role can access)
ALTER TABLE public.suspicious_ip_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.suspicious_ip_patterns;
CREATE POLICY "Service role only"
ON public.suspicious_ip_patterns
FOR ALL
USING (false)
WITH CHECK (false);

-- Function to check if IP is blacklisted
CREATE OR REPLACE FUNCTION public.is_ip_blacklisted(p_ip_address INET)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.ip_blacklist
    WHERE ip_address = p_ip_address
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;

-- Function to log IP activity
CREATE OR REPLACE FUNCTION public.log_ip_activity(
  p_ip_address INET,
  p_action_type TEXT,
  p_profile_id UUID DEFAULT NULL,
  p_resource_id UUID DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.ip_activity_logs (
    ip_address,
    action_type,
    profile_id,
    resource_id,
    device_id,
    user_agent,
    metadata
  )
  VALUES (
    p_ip_address,
    p_action_type,
    p_profile_id,
    p_resource_id,
    p_device_id,
    p_user_agent,
    p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Function to detect suspicious IP patterns
CREATE OR REPLACE FUNCTION public.detect_suspicious_ip_pattern(
  p_ip_address INET,
  p_action_type TEXT,
  p_time_window_minutes INTEGER DEFAULT 60
)
RETURNS TABLE (
  is_suspicious BOOLEAN,
  pattern_type TEXT,
  severity TEXT,
  count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action_count INTEGER;
  v_account_count INTEGER;
  v_profile_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start := now() - (p_time_window_minutes || ' minutes')::interval;
  
  -- Count actions in time window
  SELECT COUNT(*)
  INTO v_action_count
  FROM public.ip_activity_logs
  WHERE ip_address = p_ip_address
    AND created_at > v_window_start;
  
  -- Count unique accounts from this IP
  SELECT COUNT(DISTINCT profile_id)
  INTO v_account_count
  FROM public.ip_activity_logs
  WHERE ip_address = p_ip_address
    AND created_at > v_window_start
    AND profile_id IS NOT NULL;
  
  -- Rapid actions pattern (more than 100 actions in time window)
  IF v_action_count > 100 THEN
    -- Update or insert suspicious pattern
    INSERT INTO public.suspicious_ip_patterns (
      ip_address,
      pattern_type,
      severity,
      count,
      last_seen_at,
      details
    )
    VALUES (
      p_ip_address,
      'rapid_actions',
      CASE 
        WHEN v_action_count > 500 THEN 'critical'
        WHEN v_action_count > 300 THEN 'high'
        ELSE 'medium'
      END,
      v_action_count,
      now(),
      jsonb_build_object('action_type', p_action_type, 'time_window_minutes', p_time_window_minutes)
    )
    ON CONFLICT (ip_address, pattern_type) DO UPDATE SET
      count = suspicious_ip_patterns.count + 1,
      last_seen_at = now(),
      severity = CASE 
        WHEN suspicious_ip_patterns.count + 1 > 500 THEN 'critical'
        WHEN suspicious_ip_patterns.count + 1 > 300 THEN 'high'
        ELSE 'medium'
      END,
      details = jsonb_build_object('action_type', p_action_type, 'time_window_minutes', p_time_window_minutes);
    
    RETURN QUERY SELECT true, 'rapid_actions'::TEXT, 
      CASE 
        WHEN v_action_count > 500 THEN 'critical'::TEXT
        WHEN v_action_count > 300 THEN 'high'::TEXT
        ELSE 'medium'::TEXT
      END,
      v_action_count;
    RETURN;
  END IF;
  
  -- Multiple accounts pattern (more than 3 accounts from same IP)
  IF v_account_count > 3 THEN
    INSERT INTO public.suspicious_ip_patterns (
      ip_address,
      pattern_type,
      severity,
      count,
      last_seen_at,
      details
    )
    VALUES (
      p_ip_address,
      'multiple_accounts',
      CASE 
        WHEN v_account_count > 10 THEN 'critical'
        WHEN v_account_count > 5 THEN 'high'
        ELSE 'medium'
      END,
      v_account_count,
      now(),
      jsonb_build_object('time_window_minutes', p_time_window_minutes)
    )
    ON CONFLICT (ip_address, pattern_type) DO UPDATE SET
      count = GREATEST(suspicious_ip_patterns.count, v_account_count),
      last_seen_at = now(),
      severity = CASE 
        WHEN GREATEST(suspicious_ip_patterns.count, v_account_count) > 10 THEN 'critical'
        WHEN GREATEST(suspicious_ip_patterns.count, v_account_count) > 5 THEN 'high'
        ELSE 'medium'
      END;
    
    RETURN QUERY SELECT true, 'multiple_accounts'::TEXT,
      CASE 
        WHEN v_account_count > 10 THEN 'critical'::TEXT
        WHEN v_account_count > 5 THEN 'high'::TEXT
        ELSE 'medium'::TEXT
      END,
      v_account_count;
    RETURN;
  END IF;
  
  -- Not suspicious
  RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, 0;
END;
$$;

-- Function to get IP address from request headers
CREATE OR REPLACE FUNCTION public.get_request_ip_address()
RETURNS INET
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip_address INET;
BEGIN
  BEGIN
    -- Try x-forwarded-for first (most common in proxies/load balancers)
    v_ip_address := (current_setting('request.headers', true)::json->>'x-forwarded-for')::INET;
    
    -- If x-forwarded-for contains multiple IPs (comma-separated), take the first one
    IF v_ip_address IS NULL THEN
      BEGIN
        v_ip_address := (split_part(
          current_setting('request.headers', true)::json->>'x-forwarded-for',
          ',',
          1
        ))::INET;
      EXCEPTION
        WHEN OTHERS THEN
          v_ip_address := NULL;
      END;
    END IF;
    
    -- Fallback to x-real-ip
    IF v_ip_address IS NULL THEN
      v_ip_address := (current_setting('request.headers', true)::json->>'x-real-ip')::INET;
    END IF;
    
    -- Fallback to cf-connecting-ip (Cloudflare)
    IF v_ip_address IS NULL THEN
      v_ip_address := (current_setting('request.headers', true)::json->>'cf-connecting-ip')::INET;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_ip_address := NULL;
  END;
  
  RETURN v_ip_address;
END;
$$;

-- Function for IP-based rate limiting (generic)
CREATE OR REPLACE FUNCTION public.check_ip_rate_limit(
  p_ip_address INET,
  p_action_type TEXT,
  p_max_requests INTEGER DEFAULT 60,
  p_window_minutes INTEGER DEFAULT 60
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  -- Check if IP is blacklisted
  IF public.is_ip_blacklisted(p_ip_address) THEN
    RETURN QUERY SELECT false, 0, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  
  v_window_start := now() - (p_window_minutes || ' minutes')::interval;
  
  -- Count requests in time window
  SELECT COUNT(*)
  INTO v_request_count
  FROM public.ip_activity_logs
  WHERE ip_address = p_ip_address
    AND action_type = p_action_type
    AND created_at > v_window_start;
  
  -- Check limit
  IF v_request_count >= p_max_requests THEN
    RETURN QUERY SELECT 
      false,
      0,
      (SELECT MAX(created_at) + (p_window_minutes || ' minutes')::interval 
       FROM public.ip_activity_logs 
       WHERE ip_address = p_ip_address 
         AND action_type = p_action_type 
         AND created_at > v_window_start);
    RETURN;
  END IF;
  
  -- Allowed
  RETURN QUERY SELECT 
    true,
    p_max_requests - v_request_count,
    now() + (p_window_minutes || ' minutes')::interval;
END;
$$;

-- ============================================================================
-- 2. ENHANCED CONTENT QUALITY ENFORCEMENT
-- ============================================================================

-- Table for content review queue
CREATE TABLE IF NOT EXISTS public.content_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  reason TEXT NOT NULL, -- 'low_quality', 'empty_audio', 'silent', 'suspicious', etc.
  quality_score NUMERIC(3,1),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'flagged')),
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_review_queue_status ON public.content_review_queue(review_status, created_at);
CREATE INDEX IF NOT EXISTS idx_content_review_queue_clip ON public.content_review_queue(clip_id);

-- RLS for content review queue (only service role can access)
ALTER TABLE public.content_review_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.content_review_queue;
CREATE POLICY "Service role only"
ON public.content_review_queue
FOR ALL
USING (false)
WITH CHECK (false);

-- Function to check if audio is empty/silent/low quality
CREATE OR REPLACE FUNCTION public.check_audio_quality(
  p_clip_id UUID,
  p_quality_score NUMERIC,
  p_duration_seconds INTEGER,
  p_file_size_bytes BIGINT
)
RETURNS TABLE (
  is_valid BOOLEAN,
  reason TEXT,
  should_review BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bytes_per_second NUMERIC;
  v_min_bytes_per_second NUMERIC := 3000; -- Minimum ~3KB/second for valid audio
BEGIN
  -- Check duration (must be > 0)
  IF p_duration_seconds IS NULL OR p_duration_seconds <= 0 THEN
    RETURN QUERY SELECT false, 'Invalid duration: audio must be longer than 0 seconds', true;
    RETURN;
  END IF;
  
  -- Check file size (must be > 0)
  IF p_file_size_bytes IS NULL OR p_file_size_bytes <= 0 THEN
    RETURN QUERY SELECT false, 'Invalid file size: audio file is empty', true;
    RETURN;
  END IF;
  
  -- Calculate bytes per second
  v_bytes_per_second := p_file_size_bytes::NUMERIC / GREATEST(p_duration_seconds, 1);
  
  -- Check if audio is too small (likely silent/empty)
  IF v_bytes_per_second < v_min_bytes_per_second THEN
    RETURN QUERY SELECT false, 
      format('Audio quality too low: %s bytes/second (minimum: %s). Audio may be silent or empty.', 
        ROUND(v_bytes_per_second, 2), v_min_bytes_per_second),
      true;
    RETURN;
  END IF;
  
  -- Check quality score if provided
  IF p_quality_score IS NOT NULL THEN
    -- Quality score below 2.0 is considered very low quality
    IF p_quality_score < 2.0 THEN
      RETURN QUERY SELECT false,
        format('Audio quality score too low: %s (minimum: 2.0). Audio may be too noisy or unclear.', p_quality_score),
        true;
      RETURN;
    END IF;
    
    -- Quality score between 2.0 and 4.0 should be reviewed
    IF p_quality_score < 4.0 THEN
      RETURN QUERY SELECT true, NULL::TEXT, true;
      RETURN;
    END IF;
  END IF;
  
  -- Valid
  RETURN QUERY SELECT true, NULL::TEXT, false;
END;
$$;

-- Function to flag content for review
CREATE OR REPLACE FUNCTION public.flag_content_for_review(
  p_clip_id UUID,
  p_reason TEXT,
  p_quality_score NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review_id UUID;
BEGIN
  -- Check if already in queue
  SELECT id INTO v_review_id
  FROM public.content_review_queue
  WHERE clip_id = p_clip_id
    AND review_status = 'pending';
  
  IF v_review_id IS NOT NULL THEN
    -- Update existing entry
    UPDATE public.content_review_queue
    SET reason = p_reason,
        quality_score = COALESCE(p_quality_score, quality_score),
        created_at = now()
    WHERE id = v_review_id;
    RETURN v_review_id;
  END IF;
  
  -- Create new entry
  INSERT INTO public.content_review_queue (
    clip_id,
    reason,
    quality_score
  )
  VALUES (
    p_clip_id,
    p_reason,
    p_quality_score
  )
  RETURNING id INTO v_review_id;
  
  RETURN v_review_id;
END;
$$;

-- ============================================================================
-- 3. REPUTATION SYSTEM ABUSE PREVENTION
-- ============================================================================

-- Table to track reputation gain actions
CREATE TABLE IF NOT EXISTS public.reputation_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'reaction_received', 'listen_received', 'comment_received', etc.
  source_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Who gave the reaction/listen
  resource_id UUID, -- clip_id, comment_id, etc.
  reputation_gained INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reputation_action_logs_profile ON public.reputation_action_logs(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reputation_action_logs_source ON public.reputation_action_logs(source_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reputation_action_logs_action ON public.reputation_action_logs(action_type, created_at DESC);

-- RLS for reputation action logs (only service role can access)
ALTER TABLE public.reputation_action_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.reputation_action_logs;
CREATE POLICY "Service role only"
ON public.reputation_action_logs
FOR ALL
USING (false)
WITH CHECK (false);

-- Function to check reputation farming (same user giving multiple reactions/listens)
CREATE OR REPLACE FUNCTION public.check_reputation_farming(
  p_profile_id UUID,
  p_source_profile_id UUID,
  p_action_type TEXT,
  p_cooldown_minutes INTEGER DEFAULT 60
)
RETURNS TABLE (
  is_farming BOOLEAN,
  reason TEXT,
  count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action_count INTEGER;
  v_cooldown_start TIMESTAMPTZ;
BEGIN
  v_cooldown_start := now() - (p_cooldown_minutes || ' minutes')::interval;
  
  -- Count actions from same source profile in cooldown window
  SELECT COUNT(*)
  INTO v_action_count
  FROM public.reputation_action_logs
  WHERE profile_id = p_profile_id
    AND source_profile_id = p_source_profile_id
    AND action_type = p_action_type
    AND created_at > v_cooldown_start;
  
  -- If same user gave more than 10 reactions/listens in cooldown period, it's suspicious
  IF v_action_count > 10 THEN
    RETURN QUERY SELECT true,
      format('Suspicious reputation farming detected: %s actions from same user in %s minutes', 
        v_action_count, p_cooldown_minutes),
      v_action_count;
    RETURN;
  END IF;
  
  -- Not farming
  RETURN QUERY SELECT false, NULL::TEXT, v_action_count;
END;
$$;

-- Function to log reputation action
CREATE OR REPLACE FUNCTION public.log_reputation_action(
  p_profile_id UUID,
  p_action_type TEXT,
  p_source_profile_id UUID DEFAULT NULL,
  p_resource_id UUID DEFAULT NULL,
  p_reputation_gained INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.reputation_action_logs (
    profile_id,
    action_type,
    source_profile_id,
    resource_id,
    reputation_gained
  )
  VALUES (
    p_profile_id,
    p_action_type,
    p_source_profile_id,
    p_resource_id,
    p_reputation_gained
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Function to detect suspicious reputation patterns
CREATE OR REPLACE FUNCTION public.detect_suspicious_reputation_pattern(
  p_profile_id UUID,
  p_time_window_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  is_suspicious BOOLEAN,
  pattern_type TEXT,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_total_actions INTEGER;
  v_unique_sources INTEGER;
  v_rapid_gain INTEGER;
  v_reputation_gained INTEGER;
BEGIN
  v_window_start := now() - (p_time_window_hours || ' hours')::interval;
  
  -- Count total reputation actions
  SELECT COUNT(*), COUNT(DISTINCT source_profile_id), SUM(reputation_gained)
  INTO v_total_actions, v_unique_sources, v_reputation_gained
  FROM public.reputation_action_logs
  WHERE profile_id = p_profile_id
    AND created_at > v_window_start;
  
  -- Pattern 1: Too many actions from too few sources (likely farming)
  IF v_total_actions > 50 AND v_unique_sources < 5 THEN
    RETURN QUERY SELECT true, 'reputation_farming'::TEXT,
      jsonb_build_object(
        'total_actions', v_total_actions,
        'unique_sources', v_unique_sources,
        'reputation_gained', v_reputation_gained,
        'time_window_hours', p_time_window_hours
      );
    RETURN;
  END IF;
  
  -- Pattern 2: Rapid reputation gain (more than 1000 points in 24 hours)
  IF v_reputation_gained > 1000 THEN
    RETURN QUERY SELECT true, 'rapid_reputation_gain'::TEXT,
      jsonb_build_object(
        'reputation_gained', v_reputation_gained,
        'time_window_hours', p_time_window_hours
      );
    RETURN;
  END IF;
  
  -- Not suspicious
  RETURN QUERY SELECT false, NULL::TEXT, '{}'::jsonb;
END;
$$;

-- ============================================================================
-- 4. EMAIL/DIGEST ABUSE PREVENTION
-- ============================================================================

-- Table for disposable email domains
CREATE TABLE IF NOT EXISTS public.disposable_email_domains (
  domain TEXT PRIMARY KEY,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT DEFAULT 'manual' -- 'manual', 'api', 'list'
);

-- Insert common disposable email domains
INSERT INTO public.disposable_email_domains (domain) VALUES
  ('10minutemail.com'),
  ('guerrillamail.com'),
  ('mailinator.com'),
  ('tempmail.com'),
  ('throwaway.email'),
  ('yopmail.com'),
  ('getnada.com'),
  ('mohmal.com'),
  ('fakeinbox.com'),
  ('temp-mail.org'),
  ('trashmail.com'),
  ('sharklasers.com'),
  ('grr.la'),
  ('maildrop.cc'),
  ('mintemail.com')
ON CONFLICT (domain) DO NOTHING;

-- RLS for disposable email domains (read-only for service role)
ALTER TABLE public.disposable_email_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.disposable_email_domains;
CREATE POLICY "Service role only"
ON public.disposable_email_domains
FOR SELECT
USING (true);

-- Table for email digest request logs
CREATE TABLE IF NOT EXISTS public.digest_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  ip_address INET,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'blocked'))
);

CREATE INDEX IF NOT EXISTS idx_digest_request_logs_profile ON public.digest_request_logs(profile_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_digest_request_logs_email ON public.digest_request_logs(email, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_digest_request_logs_ip ON public.digest_request_logs(ip_address, requested_at DESC);

-- RLS for digest request logs (only service role can access)
ALTER TABLE public.digest_request_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.digest_request_logs;
CREATE POLICY "Service role only"
ON public.digest_request_logs
FOR ALL
USING (false)
WITH CHECK (false);

-- Function to check if email is disposable
CREATE OR REPLACE FUNCTION public.is_disposable_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain TEXT;
BEGIN
  -- Extract domain from email
  v_domain := LOWER(SPLIT_PART(p_email, '@', 2));
  
  -- Check if domain is in disposable list
  RETURN EXISTS (
    SELECT 1
    FROM public.disposable_email_domains
    WHERE domain = v_domain
  );
END;
$$;

-- Function to validate email address
CREATE OR REPLACE FUNCTION public.validate_email_address(p_email TEXT)
RETURNS TABLE (
  is_valid BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain TEXT;
BEGIN
  -- Basic format check
  IF p_email IS NULL OR p_email = '' THEN
    RETURN QUERY SELECT false, 'Email address is required'::TEXT;
    RETURN;
  END IF;
  
  -- Check if contains @
  IF p_email !~ '@' THEN
    RETURN QUERY SELECT false, 'Invalid email format: missing @ symbol'::TEXT;
    RETURN;
  END IF;
  
  -- Extract domain
  v_domain := LOWER(SPLIT_PART(p_email, '@', 2));
  
  -- Check if domain is valid
  IF v_domain IS NULL OR v_domain = '' THEN
    RETURN QUERY SELECT false, 'Invalid email format: missing domain'::TEXT;
    RETURN;
  END IF;
  
  -- Check if disposable
  IF public.is_disposable_email(p_email) THEN
    RETURN QUERY SELECT false, 'Disposable email addresses are not allowed'::TEXT;
    RETURN;
  END IF;
  
  -- Valid
  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

-- Function to check digest request rate limits
CREATE OR REPLACE FUNCTION public.check_digest_request_rate_limit(
  p_email TEXT,
  p_ip_address INET,
  p_max_per_email_per_day INTEGER DEFAULT 3,
  p_max_per_ip_per_day INTEGER DEFAULT 10
)
RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT,
  retry_after TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email_count INTEGER;
  v_ip_count INTEGER;
BEGIN
  -- Count requests from same email in last 24 hours
  SELECT COUNT(*)
  INTO v_email_count
  FROM public.digest_request_logs
  WHERE email = p_email
    AND requested_at > now() - interval '24 hours';
  
  -- Count requests from same IP in last 24 hours
  IF p_ip_address IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_ip_count
    FROM public.digest_request_logs
    WHERE ip_address = p_ip_address
      AND requested_at > now() - interval '24 hours';
  END IF;
  
  -- Check email limit
  IF v_email_count >= p_max_per_email_per_day THEN
    RETURN QUERY SELECT false,
      format('Digest request rate limit exceeded. Maximum %s requests per email per day.', p_max_per_email_per_day),
      (SELECT MAX(requested_at) + interval '24 hours' 
       FROM public.digest_request_logs 
       WHERE email = p_email 
         AND requested_at > now() - interval '24 hours');
    RETURN;
  END IF;
  
  -- Check IP limit
  IF p_ip_address IS NOT NULL AND v_ip_count >= p_max_per_ip_per_day THEN
    RETURN QUERY SELECT false,
      format('Digest request rate limit exceeded. Maximum %s requests per IP per day.', p_max_per_ip_per_day),
      (SELECT MAX(requested_at) + interval '24 hours' 
       FROM public.digest_request_logs 
       WHERE ip_address = p_ip_address 
         AND requested_at > now() - interval '24 hours');
    RETURN;
  END IF;
  
  -- Allowed
  RETURN QUERY SELECT true, NULL::TEXT, NULL::TIMESTAMPTZ;
END;
$$;

-- Function to log digest request
CREATE OR REPLACE FUNCTION public.log_digest_request(
  p_profile_id UUID,
  p_email TEXT,
  p_ip_address INET DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.digest_request_logs (
    profile_id,
    email,
    ip_address
  )
  VALUES (
    p_profile_id,
    p_email,
    p_ip_address
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Cleanup old IP activity logs (older than 90 days)
CREATE OR REPLACE FUNCTION public.cleanup_ip_activity_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.ip_activity_logs
  WHERE created_at < now() - interval '90 days';
END;
$$;

-- Cleanup old reputation action logs (older than 90 days)
CREATE OR REPLACE FUNCTION public.cleanup_reputation_action_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.reputation_action_logs
  WHERE created_at < now() - interval '90 days';
END;
$$;

-- Cleanup old digest request logs (older than 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_digest_request_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.digest_request_logs
  WHERE requested_at < now() - interval '30 days';
END;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.is_ip_blacklisted(INET) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.log_ip_activity(INET, TEXT, UUID, UUID, TEXT, TEXT, JSONB) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.detect_suspicious_ip_pattern(INET, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_request_ip_address() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_ip_rate_limit(INET, TEXT, INTEGER, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_audio_quality(UUID, NUMERIC, INTEGER, BIGINT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.flag_content_for_review(UUID, TEXT, NUMERIC) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_reputation_farming(UUID, UUID, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.log_reputation_action(UUID, TEXT, UUID, UUID, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.detect_suspicious_reputation_pattern(UUID, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_disposable_email(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.validate_email_address(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_digest_request_rate_limit(TEXT, INET, INTEGER, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.log_digest_request(UUID, TEXT, INET) TO authenticated, anon;

