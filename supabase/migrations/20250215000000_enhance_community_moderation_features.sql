-- Enhanced Community & Moderation Features Migration
-- Implements Priority 6: Community & Moderation features to match Reddit

-- ============================================================================
-- PART 1: ENHANCED COMMUNITY MODERATION
-- ============================================================================

-- 1.1 Auto-moderation rules table
CREATE TABLE IF NOT EXISTS public.community_auto_mod_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('keyword', 'spam_pattern', 'user_behavior', 'content_analysis', 'rate_limit')),
  rule_config JSONB NOT NULL DEFAULT '{}'::jsonb, -- Flexible config for different rule types
  action TEXT NOT NULL CHECK (action IN ('remove', 'hide', 'flag', 'warn', 'ban')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(community_id, rule_name)
);

CREATE INDEX IF NOT EXISTS idx_community_auto_mod_rules_community ON public.community_auto_mod_rules(community_id, is_active);
CREATE INDEX IF NOT EXISTS idx_community_auto_mod_rules_type ON public.community_auto_mod_rules(rule_type, is_active);

ALTER TABLE public.community_auto_mod_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auto-mod rules viewable by community members" ON public.community_auto_mod_rules;
CREATE POLICY "Auto-mod rules viewable by community members"
ON public.community_auto_mod_rules FOR SELECT
USING (
  community_id IN (
    SELECT id FROM public.communities WHERE is_public = true
  )
  OR community_id IN (
    SELECT community_id FROM public.community_members cm
    JOIN public.profiles p ON p.id = cm.profile_id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

DROP POLICY IF EXISTS "Auto-mod rules manageable by hosts and moderators" ON public.community_auto_mod_rules;
CREATE POLICY "Auto-mod rules manageable by hosts and moderators"
ON public.community_auto_mod_rules FOR ALL
USING (
  public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ))
  OR public.moderator_has_permission(
    community_id,
    (SELECT id FROM public.profiles
     WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'),
    'manage_content'
  )
);

-- 1.2 Community moderation queue (separate from global admin queue)
CREATE TABLE IF NOT EXISTS public.community_moderation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('clip', 'comment', 'profile')),
  item_id UUID NOT NULL, -- References clips.id, comments.id, or profiles.id
  reason TEXT NOT NULL,
  reported_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  auto_flagged_by_rule_id UUID REFERENCES public.community_auto_mod_rules(id) ON DELETE SET NULL,
  workflow_state TEXT NOT NULL DEFAULT 'pending' CHECK (workflow_state IN ('pending', 'in_review', 'resolved', 'actioned')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  moderation_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_mod_queue_community ON public.community_moderation_queue(community_id, workflow_state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_mod_queue_item ON public.community_moderation_queue(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_community_mod_queue_assigned ON public.community_moderation_queue(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_community_mod_queue_priority ON public.community_moderation_queue(priority DESC, created_at);

ALTER TABLE public.community_moderation_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Community mod queue viewable by moderators" ON public.community_moderation_queue;
CREATE POLICY "Community mod queue viewable by moderators"
ON public.community_moderation_queue FOR SELECT
USING (
  public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ))
  OR public.is_community_moderator(
    community_id,
    (SELECT id FROM public.profiles
     WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id')
  )
);

DROP POLICY IF EXISTS "Community mod queue manageable by moderators" ON public.community_moderation_queue;
CREATE POLICY "Community mod queue manageable by moderators"
ON public.community_moderation_queue FOR ALL
USING (
  public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ))
  OR public.moderator_has_permission(
    community_id,
    (SELECT id FROM public.profiles
     WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'),
    'manage_content'
  )
);

-- 1.3 Community moderation analytics
CREATE TABLE IF NOT EXISTS public.community_moderation_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  items_reviewed INTEGER NOT NULL DEFAULT 0,
  items_removed INTEGER NOT NULL DEFAULT 0,
  items_approved INTEGER NOT NULL DEFAULT 0,
  avg_response_time_minutes NUMERIC,
  reports_received INTEGER NOT NULL DEFAULT 0,
  auto_mod_actions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(community_id, date)
);

CREATE INDEX IF NOT EXISTS idx_community_mod_analytics_community_date ON public.community_moderation_analytics(community_id, date DESC);

ALTER TABLE public.community_moderation_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Community mod analytics viewable by moderators" ON public.community_moderation_analytics;
CREATE POLICY "Community mod analytics viewable by moderators"
ON public.community_moderation_analytics FOR SELECT
USING (
  public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ))
  OR public.is_community_moderator(
    community_id,
    (SELECT id FROM public.profiles
     WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id')
  )
);

-- ============================================================================
-- PART 2: COMMUNITY CUSTOMIZATION
-- ============================================================================

-- 2.1 Community themes
ALTER TABLE public.communities
ADD COLUMN IF NOT EXISTS theme_config JSONB DEFAULT '{}'::jsonb; -- {primaryColor, secondaryColor, backgroundImage, etc.}

-- 2.2 Community rules (enhance existing guidelines)
CREATE TABLE IF NOT EXISTS public.community_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  rule_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(community_id, rule_number)
);

CREATE INDEX IF NOT EXISTS idx_community_rules_community ON public.community_rules(community_id, rule_number);

ALTER TABLE public.community_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Community rules viewable by everyone" ON public.community_rules;
CREATE POLICY "Community rules viewable by everyone"
ON public.community_rules FOR SELECT
USING (
  community_id IN (
    SELECT id FROM public.communities WHERE is_public = true
  )
  OR community_id IN (
    SELECT community_id FROM public.community_members cm
    JOIN public.profiles p ON p.id = cm.profile_id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

DROP POLICY IF EXISTS "Community rules manageable by hosts and moderators" ON public.community_rules;
CREATE POLICY "Community rules manageable by hosts and moderators"
ON public.community_rules FOR ALL
USING (
  public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ))
  OR public.moderator_has_permission(
    community_id,
    (SELECT id FROM public.profiles
     WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'),
    'manage_community'
  )
);

-- 2.3 Community flairs/badges
CREATE TABLE IF NOT EXISTS public.community_flairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT,
  color TEXT,
  background_color TEXT,
  is_user_assignable BOOLEAN NOT NULL DEFAULT false,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(community_id, name)
);

CREATE TABLE IF NOT EXISTS public.community_user_flairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  flair_id UUID NOT NULL REFERENCES public.community_flairs(id) ON DELETE CASCADE,
  assigned_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(community_id, profile_id, flair_id)
);

CREATE INDEX IF NOT EXISTS idx_community_flairs_community ON public.community_flairs(community_id);
CREATE INDEX IF NOT EXISTS idx_community_user_flairs_user ON public.community_user_flairs(community_id, profile_id);

ALTER TABLE public.community_flairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_user_flairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Community flairs viewable by everyone" ON public.community_flairs;
CREATE POLICY "Community flairs viewable by everyone"
ON public.community_flairs FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Community flairs manageable by hosts and moderators" ON public.community_flairs;
CREATE POLICY "Community flairs manageable by hosts and moderators"
ON public.community_flairs FOR ALL
USING (
  public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ))
  OR public.moderator_has_permission(
    community_id,
    (SELECT id FROM public.profiles
     WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'),
    'manage_community'
  )
);

DROP POLICY IF EXISTS "User flairs viewable by everyone" ON public.community_user_flairs;
CREATE POLICY "User flairs viewable by everyone"
ON public.community_user_flairs FOR SELECT
USING (true);

DROP POLICY IF EXISTS "User flairs assignable by users or moderators" ON public.community_user_flairs;
CREATE POLICY "User flairs assignable by users or moderators"
ON public.community_user_flairs FOR INSERT
WITH CHECK (
  -- Users can assign if flair is user_assignable
  (
    profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
    AND EXISTS (
      SELECT 1 FROM public.community_flairs
      WHERE id = flair_id AND is_user_assignable = true
    )
  )
  OR
  -- Moderators can assign any flair
  (
    public.is_community_host(community_id, (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    ))
    OR public.moderator_has_permission(
      community_id,
      (SELECT id FROM public.profiles
       WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'),
      'manage_community'
    )
  )
);

-- 2.4 Community events calendar
CREATE TABLE IF NOT EXISTS public.community_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  event_end_date TIMESTAMPTZ,
  location TEXT, -- Can be virtual or physical
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_pattern TEXT, -- 'daily', 'weekly', 'monthly', etc.
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_events_community_date ON public.community_events(community_id, event_date);
-- Note: Cannot use now() in index predicate as it's not IMMUTABLE
-- Use a regular index and filter in queries instead
CREATE INDEX IF NOT EXISTS idx_community_events_date ON public.community_events(event_date);

ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Community events viewable by everyone" ON public.community_events;
CREATE POLICY "Community events viewable by everyone"
ON public.community_events FOR SELECT
USING (
  community_id IN (
    SELECT id FROM public.communities WHERE is_public = true
  )
  OR community_id IN (
    SELECT community_id FROM public.community_members cm
    JOIN public.profiles p ON p.id = cm.profile_id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

DROP POLICY IF EXISTS "Community events manageable by hosts and moderators" ON public.community_events;
CREATE POLICY "Community events manageable by hosts and moderators"
ON public.community_events FOR ALL
USING (
  public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ))
  OR public.moderator_has_permission(
    community_id,
    (SELECT id FROM public.profiles
     WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'),
    'manage_events'
  )
);

-- ============================================================================
-- PART 3: COMMUNITY DISCOVERY
-- ============================================================================

-- 3.1 Community categories
ALTER TABLE public.communities
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS subcategory TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_communities_category ON public.communities(category, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_communities_tags ON public.communities USING gin(tags) WHERE tags IS NOT NULL;

-- 3.2 Community activity feed
CREATE TABLE IF NOT EXISTS public.community_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('clip_posted', 'member_joined', 'event_created', 'announcement_posted', 'rule_updated')),
  activity_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_activity_community_date ON public.community_activity(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_activity_type ON public.community_activity(activity_type, created_at DESC);

ALTER TABLE public.community_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Community activity viewable by everyone" ON public.community_activity;
CREATE POLICY "Community activity viewable by everyone"
ON public.community_activity FOR SELECT
USING (
  community_id IN (
    SELECT id FROM public.communities WHERE is_public = true
  )
  OR community_id IN (
    SELECT community_id FROM public.community_members cm
    JOIN public.profiles p ON p.id = cm.profile_id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- 3.3 Similar communities tracking (computed via function)
CREATE TABLE IF NOT EXISTS public.community_similarities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  similar_community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  similarity_score NUMERIC NOT NULL DEFAULT 0, -- 0-1 score based on tags, members, content
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(community_id, similar_community_id),
  CHECK (community_id != similar_community_id)
);

CREATE INDEX IF NOT EXISTS idx_community_similarities_community ON public.community_similarities(community_id, similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_community_similarities_similar ON public.community_similarities(similar_community_id, similarity_score DESC);

ALTER TABLE public.community_similarities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Community similarities viewable by everyone" ON public.community_similarities;
CREATE POLICY "Community similarities viewable by everyone"
ON public.community_similarities FOR SELECT
USING (true);

-- ============================================================================
-- PART 4: AI-POWERED MODERATION
-- ============================================================================

-- 4.1 AI moderation results table
CREATE TABLE IF NOT EXISTS public.ai_moderation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (content_type IN ('clip', 'comment', 'profile', 'caption')),
  content_id UUID NOT NULL,
  spam_score NUMERIC NOT NULL DEFAULT 0, -- 0-1
  harassment_score NUMERIC NOT NULL DEFAULT 0, -- 0-1
  toxicity_score NUMERIC NOT NULL DEFAULT 0, -- 0-1
  overall_risk_score NUMERIC NOT NULL DEFAULT 0, -- 0-10
  detected_issues JSONB DEFAULT '[]'::jsonb, -- Array of detected issues
  moderation_suggestions JSONB DEFAULT '[]'::jsonb, -- Array of suggested actions
  analyzed_at TIMESTAMPTZ DEFAULT now(),
  model_version TEXT,
  UNIQUE(content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_moderation_content ON public.ai_moderation_results(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_ai_moderation_risk ON public.ai_moderation_results(overall_risk_score DESC, analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_moderation_spam ON public.ai_moderation_results(spam_score DESC) WHERE spam_score > 0.5;
CREATE INDEX IF NOT EXISTS idx_ai_moderation_toxicity ON public.ai_moderation_results(toxicity_score DESC) WHERE toxicity_score > 0.5;

ALTER TABLE public.ai_moderation_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "AI moderation results viewable by admins and moderators" ON public.ai_moderation_results;
CREATE POLICY "AI moderation results viewable by admins and moderators"
ON public.ai_moderation_results FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.community_moderators cm ON cm.moderator_profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- 4.2 Auto-flagging based on AI results
CREATE OR REPLACE FUNCTION public.auto_flag_based_on_ai_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_risk_threshold NUMERIC := 7.0; -- Auto-flag if risk >= 7
  v_community_id UUID;
BEGIN
  -- Only process if risk score is high enough
  IF NEW.overall_risk_score < v_risk_threshold THEN
    RETURN NEW;
  END IF;

  -- Try to find community_id from content
  IF NEW.content_type = 'clip' THEN
    SELECT community_id INTO v_community_id
    FROM public.clips
    WHERE id = NEW.content_id;
  END IF;

  -- Create moderation flag if community found
  IF v_community_id IS NOT NULL THEN
    INSERT INTO public.community_moderation_queue (
      community_id,
      item_type,
      item_id,
      reason,
      auto_flagged_by_rule_id,
      priority,
      workflow_state
    )
    VALUES (
      v_community_id,
      NEW.content_type,
      NEW.content_id,
      'AI detected high-risk content',
      NULL, -- Not from a rule, from AI
      LEAST(CAST(NEW.overall_risk_score * 10 AS INTEGER), 100),
      'pending'
    )
    ON CONFLICT DO NOTHING; -- Avoid duplicates
  END IF;

  -- Also create global moderation flag
  INSERT INTO public.moderation_flags (
    clip_id,
    reasons,
    risk,
    source,
    status,
    workflow_state,
    priority
  )
  SELECT
    CASE WHEN NEW.content_type = 'clip' THEN NEW.content_id::uuid ELSE NULL END,
    ARRAY['AI auto-detection'],
    CAST(NEW.overall_risk_score AS INTEGER),
    'ai',
    'pending',
    'pending',
    LEAST(CAST(NEW.overall_risk_score * 10 AS INTEGER), 100)
  WHERE NEW.content_type = 'clip'
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_flag_ai_moderation_trigger ON public.ai_moderation_results;
CREATE TRIGGER auto_flag_ai_moderation_trigger
AFTER INSERT ON public.ai_moderation_results
FOR EACH ROW
EXECUTE FUNCTION public.auto_flag_based_on_ai_moderation();

-- ============================================================================
-- PART 5: ENHANCED USER REPORTING
-- ============================================================================

-- 5.1 Enhanced report categories
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS category TEXT, -- Main category
ADD COLUMN IF NOT EXISTS subcategory TEXT, -- More specific subcategory
ADD COLUMN IF NOT EXISTS report_metadata JSONB DEFAULT '{}'::jsonb; -- Additional metadata

-- 5.2 Report tracking and feedback
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS response_time_minutes NUMERIC, -- Time from report to resolution
ADD COLUMN IF NOT EXISTS reporter_feedback TEXT, -- User feedback on resolution
ADD COLUMN IF NOT EXISTS reporter_satisfaction_score INTEGER CHECK (reporter_satisfaction_score >= 1 AND reporter_satisfaction_score <= 5),
ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL; -- Link to community if applicable

CREATE INDEX IF NOT EXISTS idx_reports_community ON public.reports(community_id) WHERE community_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_category ON public.reports(category, subcategory);
CREATE INDEX IF NOT EXISTS idx_reports_response_time ON public.reports(response_time_minutes) WHERE response_time_minutes IS NOT NULL;

-- 5.3 Function to calculate response time when report is resolved
CREATE OR REPLACE FUNCTION public.calculate_report_response_time()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Calculate response time when report is reviewed/resolved
  IF NEW.workflow_state IN ('resolved', 'actioned') 
     AND OLD.workflow_state NOT IN ('resolved', 'actioned')
     AND NEW.reviewed_at IS NOT NULL THEN
    NEW.response_time_minutes := EXTRACT(EPOCH FROM (NEW.reviewed_at - NEW.created_at)) / 60;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calculate_report_response_time_trigger ON public.reports;
CREATE TRIGGER calculate_report_response_time_trigger
BEFORE UPDATE ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.calculate_report_response_time();

-- 5.4 Report feedback table (for user feedback on moderation actions)
CREATE TABLE IF NOT EXISTS public.report_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id BIGINT NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  reporter_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('satisfaction', 'comment', 'appeal')),
  feedback_text TEXT,
  satisfaction_score INTEGER CHECK (satisfaction_score >= 1 AND satisfaction_score <= 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(report_id, reporter_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_report_feedback_report ON public.report_feedback(report_id);
CREATE INDEX IF NOT EXISTS idx_report_feedback_satisfaction ON public.report_feedback(satisfaction_score) WHERE satisfaction_score IS NOT NULL;

ALTER TABLE public.report_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Report feedback viewable by reporter and admins" ON public.report_feedback;
CREATE POLICY "Report feedback viewable by reporter and admins"
ON public.report_feedback FOR SELECT
USING (
  reporter_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

DROP POLICY IF EXISTS "Report feedback insertable by reporter" ON public.report_feedback;
CREATE POLICY "Report feedback insertable by reporter"
ON public.report_feedback FOR INSERT
WITH CHECK (
  reporter_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  AND EXISTS (
    SELECT 1 FROM public.reports
    WHERE id = report_id
    AND reporter_profile_id = (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- ============================================================================
-- PART 6: HELPER FUNCTIONS
-- ============================================================================

-- 6.1 Function to get community moderation statistics
CREATE OR REPLACE FUNCTION public.get_community_moderation_stats(
  p_community_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT now() - INTERVAL '30 days',
  p_end_date TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  items_reviewed INTEGER,
  items_removed INTEGER,
  items_approved INTEGER,
  avg_response_time_minutes NUMERIC,
  reports_received INTEGER,
  auto_mod_actions INTEGER,
  pending_items INTEGER,
  high_priority_items INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE cmq.workflow_state IN ('resolved', 'actioned'))::INTEGER,
    COUNT(*) FILTER (WHERE cmq.workflow_state = 'actioned')::INTEGER,
    COUNT(*) FILTER (WHERE cmq.workflow_state = 'resolved' AND cmq.workflow_state != 'actioned')::INTEGER,
    AVG(cmq.response_time_minutes)::NUMERIC,
    COUNT(DISTINCT r.id)::INTEGER,
    COUNT(*) FILTER (WHERE cmq.auto_flagged_by_rule_id IS NOT NULL)::INTEGER,
    COUNT(*) FILTER (WHERE cmq.workflow_state = 'pending')::INTEGER,
    COUNT(*) FILTER (WHERE cmq.priority >= 7 AND cmq.workflow_state IN ('pending', 'in_review'))::INTEGER
  FROM public.community_moderation_queue cmq
  LEFT JOIN public.reports r ON r.community_id = p_community_id
  WHERE cmq.community_id = p_community_id
    AND cmq.created_at >= p_start_date
    AND cmq.created_at < p_end_date;
END;
$$;

-- 6.2 Function to get similar communities
CREATE OR REPLACE FUNCTION public.get_similar_communities(
  p_community_id UUID,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  community_id UUID,
  name TEXT,
  slug TEXT,
  description TEXT,
  member_count INTEGER,
  similarity_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.slug,
    c.description,
    c.member_count,
    cs.similarity_score
  FROM public.community_similarities cs
  JOIN public.communities c ON c.id = cs.similar_community_id
  WHERE cs.community_id = p_community_id
    AND c.is_active = true
  ORDER BY cs.similarity_score DESC
  LIMIT p_limit;
END;
$$;

-- 6.3 Function to compute community similarities (should be run periodically)
CREATE OR REPLACE FUNCTION public.compute_community_similarities()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_community RECORD;
  v_other_community RECORD;
  v_similarity NUMERIC;
  v_common_tags INTEGER;
  v_common_members INTEGER;
  v_total_tags INTEGER;
  v_total_members INTEGER;
BEGIN
  -- Clear existing similarities
  TRUNCATE public.community_similarities;

  -- Compute similarities for each pair of communities
  FOR v_community IN SELECT * FROM public.communities WHERE is_active = true LOOP
    FOR v_other_community IN 
      SELECT * FROM public.communities 
      WHERE is_active = true 
      AND id != v_community.id 
    LOOP
      -- Calculate similarity based on tags
      SELECT 
        COUNT(*) FILTER (WHERE tag = ANY(v_other_community.tags))::INTEGER,
        array_length(v_community.tags, 1)
      INTO v_common_tags, v_total_tags
      FROM unnest(v_community.tags) tag;

      -- Calculate similarity based on overlapping members
      SELECT COUNT(*)::INTEGER
      INTO v_common_members
      FROM public.community_members cm1
      JOIN public.community_members cm2 ON cm2.profile_id = cm1.profile_id
      WHERE cm1.community_id = v_community.id
      AND cm2.community_id = v_other_community.id;

      SELECT 
        COALESCE((SELECT member_count FROM public.communities WHERE id = v_community.id), 0)
      INTO v_total_members;

      -- Calculate weighted similarity score
      v_similarity := 0.0;
      
      -- Tag similarity (40% weight)
      IF v_total_tags > 0 THEN
        v_similarity := v_similarity + (v_common_tags::NUMERIC / v_total_tags::NUMERIC) * 0.4;
      END IF;
      
      -- Member overlap (40% weight)
      IF v_total_members > 0 THEN
        v_similarity := v_similarity + (LEAST(v_common_members::NUMERIC / v_total_members::NUMERIC, 1.0)) * 0.4;
      END IF;
      
      -- Category match (20% weight)
      IF v_community.category = v_other_community.category THEN
        v_similarity := v_similarity + 0.2;
      END IF;

      -- Only store if similarity is above threshold
      IF v_similarity > 0.1 THEN
        INSERT INTO public.community_similarities (
          community_id,
          similar_community_id,
          similarity_score
        )
        VALUES (
          v_community.id,
          v_other_community.id,
          v_similarity
        )
        ON CONFLICT (community_id, similar_community_id) 
        DO UPDATE SET similarity_score = v_similarity, computed_at = now();
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- 6.4 Function to log community activity
CREATE OR REPLACE FUNCTION public.log_community_activity(
  p_community_id UUID,
  p_activity_type TEXT,
  p_activity_data JSONB,
  p_profile_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_activity_id UUID;
BEGIN
  INSERT INTO public.community_activity (
    community_id,
    activity_type,
    activity_data,
    created_by_profile_id
  )
  VALUES (
    p_community_id,
    p_activity_type,
    p_activity_data,
    p_profile_id
  )
  RETURNING id INTO v_activity_id;
  
  RETURN v_activity_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_community_moderation_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_similar_communities(UUID, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.compute_community_similarities() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.log_community_activity(UUID, TEXT, JSONB, UUID) TO authenticated, anon;

-- Add updated_at triggers
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    AND routine_name = 'handle_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS set_updated_at_community_auto_mod_rules ON public.community_auto_mod_rules;
    CREATE TRIGGER set_updated_at_community_auto_mod_rules
    BEFORE UPDATE ON public.community_auto_mod_rules
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

    DROP TRIGGER IF EXISTS set_updated_at_community_rules ON public.community_rules;
    CREATE TRIGGER set_updated_at_community_rules
    BEFORE UPDATE ON public.community_rules
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

    DROP TRIGGER IF EXISTS set_updated_at_community_events ON public.community_events;
    CREATE TRIGGER set_updated_at_community_events
    BEFORE UPDATE ON public.community_events
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

    DROP TRIGGER IF EXISTS set_updated_at_community_moderation_queue ON public.community_moderation_queue;
    CREATE TRIGGER set_updated_at_community_moderation_queue
    BEFORE UPDATE ON public.community_moderation_queue
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

