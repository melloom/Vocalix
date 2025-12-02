-- Enhance moderation queue with workflow states, assignment tracking, notes, history, and auto-escalation

-- ============================================================================
-- 1. ENHANCE MODERATION_FLAGS TABLE
-- ============================================================================

-- Add workflow state (pending → in_review → resolved/actioned)
ALTER TABLE public.moderation_flags
ADD COLUMN IF NOT EXISTS workflow_state TEXT NOT NULL DEFAULT 'pending' 
  CHECK (workflow_state IN ('pending', 'in_review', 'resolved', 'actioned'));

-- Add admin assignment tracking
ALTER TABLE public.moderation_flags
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add moderation notes/comments
ALTER TABLE public.moderation_flags
ADD COLUMN IF NOT EXISTS moderation_notes TEXT;

-- Add priority field (for auto-escalation)
ALTER TABLE public.moderation_flags
ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

-- Add reviewed_at timestamp
ALTER TABLE public.moderation_flags
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Add reviewed_by (admin who reviewed)
ALTER TABLE public.moderation_flags
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add indexes for filtering and performance
CREATE INDEX IF NOT EXISTS idx_moderation_flags_workflow_state ON public.moderation_flags(workflow_state, created_at);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_assigned_to ON public.moderation_flags(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_moderation_flags_priority ON public.moderation_flags(priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_source ON public.moderation_flags(source);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_risk ON public.moderation_flags(risk DESC);

-- ============================================================================
-- 2. ENHANCE REPORTS TABLE
-- ============================================================================

-- Add workflow state
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS workflow_state TEXT NOT NULL DEFAULT 'pending' 
  CHECK (workflow_state IN ('pending', 'in_review', 'resolved', 'actioned'));

-- Add admin assignment tracking
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add moderation notes/comments
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS moderation_notes TEXT;

-- Add priority field
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

-- Add reviewed_at timestamp
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Add reviewed_by (admin who reviewed)
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add indexes for filtering and performance
CREATE INDEX IF NOT EXISTS idx_reports_workflow_state ON public.reports(workflow_state, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_assigned_to ON public.reports(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_priority ON public.reports(priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_reason ON public.reports(reason);
CREATE INDEX IF NOT EXISTS idx_reports_type ON public.reports(clip_id, profile_id) WHERE clip_id IS NOT NULL OR profile_id IS NOT NULL;

-- ============================================================================
-- 3. CREATE MODERATION HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.moderation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL CHECK (item_type IN ('flag', 'report')),
  item_id BIGINT NOT NULL, -- References moderation_flags.id or reports.id
  action TEXT NOT NULL, -- 'assigned', 'unassigned', 'state_changed', 'note_added', 'resolved', 'actioned', etc.
  admin_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  previous_value TEXT, -- JSON string for complex changes
  new_value TEXT, -- JSON string for complex changes
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_history_item ON public.moderation_history(item_type, item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_history_admin ON public.moderation_history(admin_profile_id, created_at DESC);

-- RLS for moderation history (admins only)
ALTER TABLE public.moderation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Moderation history viewable by admins" ON public.moderation_history;
CREATE POLICY "Moderation history viewable by admins"
ON public.moderation_history FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

DROP POLICY IF EXISTS "Moderation history insertable by admins" ON public.moderation_history;
CREATE POLICY "Moderation history insertable by admins"
ON public.moderation_history FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- ============================================================================
-- 4. CREATE FUNCTION FOR AUTO-ESCALATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_escalate_old_moderation_items()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Auto-escalate moderation flags older than 24 hours
  UPDATE public.moderation_flags
  SET priority = priority + 10,
      workflow_state = CASE 
        WHEN workflow_state = 'pending' THEN 'pending' -- Keep as pending but increase priority
        ELSE workflow_state
      END
  WHERE workflow_state IN ('pending', 'in_review')
    AND created_at < now() - INTERVAL '24 hours'
    AND priority < 100; -- Cap priority at 100

  -- Auto-escalate reports older than 24 hours
  UPDATE public.reports
  SET priority = priority + 10,
      workflow_state = CASE 
        WHEN workflow_state = 'pending' THEN 'pending' -- Keep as pending but increase priority
        ELSE workflow_state
      END
  WHERE workflow_state IN ('pending', 'in_review')
    AND created_at < now() - INTERVAL '24 hours'
    AND priority < 100; -- Cap priority at 100
END;
$$;

-- ============================================================================
-- 5. CREATE FUNCTION TO LOG MODERATION HISTORY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_moderation_history(
  p_item_type TEXT,
  p_item_id BIGINT,
  p_action TEXT,
  p_admin_profile_id UUID,
  p_previous_value TEXT DEFAULT NULL,
  p_new_value TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_history_id UUID;
BEGIN
  INSERT INTO public.moderation_history (
    item_type,
    item_id,
    action,
    admin_profile_id,
    previous_value,
    new_value,
    notes
  )
  VALUES (
    p_item_type,
    p_item_id,
    p_action,
    p_admin_profile_id,
    p_previous_value,
    p_new_value,
    p_notes
  )
  RETURNING id INTO v_history_id;
  
  RETURN v_history_id;
END;
$$;

-- ============================================================================
-- 6. CREATE FUNCTION TO GET MODERATION STATISTICS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_moderation_statistics(
  p_start_date TIMESTAMPTZ DEFAULT now() - INTERVAL '30 days',
  p_end_date TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  items_reviewed_today INTEGER,
  items_reviewed_period INTEGER,
  avg_time_to_review_minutes NUMERIC,
  high_risk_items_pending INTEGER,
  items_older_than_24h INTEGER,
  flags_by_source JSONB,
  reports_by_type JSONB,
  items_by_workflow_state JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today_start TIMESTAMPTZ := date_trunc('day', now());
  v_today_end TIMESTAMPTZ := v_today_start + INTERVAL '1 day';
BEGIN
  RETURN QUERY
  WITH today_reviews AS (
    SELECT COUNT(*) as count
    FROM (
      SELECT id, reviewed_at FROM public.moderation_flags WHERE reviewed_at >= v_today_start AND reviewed_at < v_today_end
      UNION ALL
      SELECT id, reviewed_at FROM public.reports WHERE reviewed_at >= v_today_start AND reviewed_at < v_today_end
    ) t
  ),
  period_reviews AS (
    SELECT COUNT(*) as count
    FROM (
      SELECT id, reviewed_at FROM public.moderation_flags WHERE reviewed_at >= p_start_date AND reviewed_at < p_end_date
      UNION ALL
      SELECT id, reviewed_at FROM public.reports WHERE reviewed_at >= p_start_date AND reviewed_at < p_end_date
    ) t
  ),
  review_times AS (
    SELECT AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 60) as avg_minutes
    FROM (
      SELECT created_at, reviewed_at FROM public.moderation_flags WHERE reviewed_at IS NOT NULL AND reviewed_at >= p_start_date
      UNION ALL
      SELECT created_at, reviewed_at FROM public.reports WHERE reviewed_at IS NOT NULL AND reviewed_at >= p_start_date
    ) t
  ),
  high_risk_pending AS (
    SELECT COUNT(*) as count
    FROM (
      SELECT id FROM public.moderation_flags WHERE risk >= 7 AND workflow_state IN ('pending', 'in_review')
      UNION ALL
      SELECT id FROM public.reports WHERE priority >= 7 AND workflow_state IN ('pending', 'in_review')
    ) t
  ),
  old_items AS (
    SELECT COUNT(*) as count
    FROM (
      SELECT id FROM public.moderation_flags WHERE created_at < now() - INTERVAL '24 hours' AND workflow_state IN ('pending', 'in_review')
      UNION ALL
      SELECT id FROM public.reports WHERE created_at < now() - INTERVAL '24 hours' AND workflow_state IN ('pending', 'in_review')
    ) t
  ),
  flags_source AS (
    SELECT jsonb_object_agg(source, count) as data
    FROM (
      SELECT source, COUNT(*) as count
      FROM public.moderation_flags
      WHERE created_at >= p_start_date
      GROUP BY source
    ) t
  ),
  reports_type AS (
    SELECT jsonb_object_agg(
      CASE WHEN clip_id IS NOT NULL THEN 'clip' ELSE 'profile' END,
      count
    ) as data
    FROM (
      SELECT 
        CASE WHEN clip_id IS NOT NULL THEN 'clip' ELSE 'profile' END as type,
        COUNT(*) as count
      FROM public.reports
      WHERE created_at >= p_start_date
      GROUP BY type
    ) t
  ),
  workflow_states AS (
    SELECT jsonb_object_agg(workflow_state, count) as data
    FROM (
      SELECT workflow_state, COUNT(*) as count
      FROM (
        SELECT workflow_state FROM public.moderation_flags WHERE workflow_state IN ('pending', 'in_review')
        UNION ALL
        SELECT workflow_state FROM public.reports WHERE workflow_state IN ('pending', 'in_review')
      ) t
      GROUP BY workflow_state
    ) t
  )
  SELECT 
    COALESCE((SELECT count FROM today_reviews), 0)::INTEGER,
    COALESCE((SELECT count FROM period_reviews), 0)::INTEGER,
    COALESCE((SELECT avg_minutes FROM review_times), 0)::NUMERIC,
    COALESCE((SELECT count FROM high_risk_pending), 0)::INTEGER,
    COALESCE((SELECT count FROM old_items), 0)::INTEGER,
    COALESCE((SELECT data FROM flags_source), '{}'::jsonb),
    COALESCE((SELECT data FROM reports_type), '{}'::jsonb),
    COALESCE((SELECT data FROM workflow_states), '{}'::jsonb);
END;
$$;

-- ============================================================================
-- 7. CREATE TRIGGER FOR AUTO-ESCALATION (runs periodically via cron or edge function)
-- ============================================================================

-- Note: This function should be called periodically (e.g., every hour) via a cron job or edge function
-- For now, we'll create it as a callable function

-- ============================================================================
-- 8. UPDATE EXISTING RECORDS
-- ============================================================================

-- Set workflow_state based on status for existing records
UPDATE public.moderation_flags
SET workflow_state = CASE 
  WHEN status = 'pending' THEN 'pending'
  WHEN status IN ('resolved', 'actioned') THEN status
  ELSE 'pending'
END
WHERE workflow_state IS NULL;

UPDATE public.reports
SET workflow_state = CASE 
  WHEN status = 'open' THEN 'pending'
  WHEN status IN ('reviewed', 'actioned') THEN status
  ELSE 'pending'
END
WHERE workflow_state IS NULL;

-- Set priority based on risk for flags
UPDATE public.moderation_flags
SET priority = LEAST(CAST(risk * 10 AS INTEGER), 100)
WHERE priority = 0 AND risk > 0;

-- Set priority based on age for reports (older = higher priority)
UPDATE public.reports
SET priority = LEAST(
  CAST(EXTRACT(EPOCH FROM (now() - created_at)) / 3600 AS INTEGER), -- Hours old
  100
)
WHERE priority = 0;

