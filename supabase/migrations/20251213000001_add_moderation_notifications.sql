-- Add moderation notifications infrastructure for high-risk items
-- Extends existing notifications system to support admin moderation alerts

-- ============================================================================
-- 1. EXTEND NOTIFICATIONS TABLE FOR MODERATION NOTIFICATIONS
-- ============================================================================

-- Update notifications type to include moderation types
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check 
CHECK (type IN (
  'comment', 
  'reply', 
  'follow', 
  'reaction', 
  'mention', 
  'challenge_update', 
  'badge_unlocked',
  'moderation_high_risk_flag',
  'moderation_high_risk_report',
  'moderation_escalated_item',
  'moderation_assigned_item'
));

-- Update entity_type to include moderation entities
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_entity_type_check;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_entity_type_check 
CHECK (entity_type IN (
  'clip', 
  'comment', 
  'challenge', 
  'profile', 
  'badge',
  'moderation_flag',
  'moderation_report'
));

-- Add priority field for moderation notifications
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

-- Add severity field for moderation notifications
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical'));

-- Add indexes for moderation notifications
CREATE INDEX IF NOT EXISTS idx_notifications_moderation_type ON public.notifications(type) 
WHERE type IN ('moderation_high_risk_flag', 'moderation_high_risk_report', 'moderation_escalated_item', 'moderation_assigned_item');

CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.notifications(priority DESC, created_at DESC) 
WHERE priority > 0;

CREATE INDEX IF NOT EXISTS idx_notifications_severity ON public.notifications(severity, created_at DESC) 
WHERE severity IS NOT NULL;

-- ============================================================================
-- 2. CREATE FUNCTION TO NOTIFY ADMINS ABOUT HIGH-RISK ITEMS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_admins_high_risk_flag(
  p_flag_id BIGINT,
  p_clip_id UUID,
  p_risk NUMERIC,
  p_reasons TEXT[],
  p_source TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_profile_id UUID;
  v_notification_id UUID;
  v_severity TEXT;
  v_priority INTEGER;
BEGIN
  -- Determine severity and priority based on risk score
  IF p_risk >= 9 THEN
    v_severity := 'critical';
    v_priority := 100;
  ELSIF p_risk >= 7 THEN
    v_severity := 'high';
    v_priority := 75;
  ELSIF p_risk >= 5 THEN
    v_severity := 'medium';
    v_priority := 50;
  ELSE
    v_severity := 'low';
    v_priority := 25;
  END IF;

  -- Only notify for high and critical risk items
  IF v_severity IN ('high', 'critical') THEN
    -- Notify all admins
    FOR v_admin_profile_id IN 
      SELECT profile_id FROM public.admins
    LOOP
      -- Check if notification already exists (prevent duplicates)
      SELECT id INTO v_notification_id
      FROM public.notifications
      WHERE recipient_id = v_admin_profile_id
        AND type = 'moderation_high_risk_flag'
        AND entity_type = 'moderation_flag'
        AND entity_id::TEXT = p_flag_id::TEXT
        AND read_at IS NULL;

      IF v_notification_id IS NULL THEN
        INSERT INTO public.notifications (
          recipient_id,
          type,
          entity_type,
          entity_id,
          priority,
          severity,
          metadata
        )
        VALUES (
          v_admin_profile_id,
          'moderation_high_risk_flag',
          'moderation_flag',
          p_flag_id::TEXT::UUID, -- Store flag_id as UUID in entity_id
          v_priority,
          v_severity,
          jsonb_build_object(
            'flag_id', p_flag_id,
            'clip_id', p_clip_id,
            'risk', p_risk,
            'reasons', p_reasons,
            'source', p_source
          )
        );
      END IF;
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_admins_high_risk_report(
  p_report_id BIGINT,
  p_clip_id UUID,
  p_profile_id UUID,
  p_reason TEXT,
  p_priority INTEGER DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_profile_id UUID;
  v_notification_id UUID;
  v_severity TEXT;
  v_notification_priority INTEGER;
BEGIN
  -- Determine severity based on priority
  IF p_priority >= 50 THEN
    v_severity := 'high';
    v_notification_priority := 75;
  ELSIF p_priority >= 25 THEN
    v_severity := 'medium';
    v_notification_priority := 50;
  ELSE
    v_severity := 'low';
    v_notification_priority := 25;
  END IF;

  -- Only notify for medium and high priority reports
  IF v_severity IN ('medium', 'high') THEN
    -- Notify all admins
    FOR v_admin_profile_id IN 
      SELECT profile_id FROM public.admins
    LOOP
      -- Check if notification already exists (prevent duplicates)
      SELECT id INTO v_notification_id
      FROM public.notifications
      WHERE recipient_id = v_admin_profile_id
        AND type = 'moderation_high_risk_report'
        AND entity_type = 'moderation_report'
        AND entity_id::TEXT = p_report_id::TEXT
        AND read_at IS NULL;

      IF v_notification_id IS NULL THEN
        INSERT INTO public.notifications (
          recipient_id,
          type,
          entity_type,
          entity_id,
          priority,
          severity,
          metadata
        )
        VALUES (
          v_admin_profile_id,
          'moderation_high_risk_report',
          'moderation_report',
          p_report_id::TEXT::UUID, -- Store report_id as UUID in entity_id
          v_notification_priority,
          v_severity,
          jsonb_build_object(
            'report_id', p_report_id,
            'clip_id', p_clip_id,
            'profile_id', p_profile_id,
            'reason', p_reason,
            'priority', p_priority
          )
        );
      END IF;
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_admins_escalated_item(
  p_item_type TEXT, -- 'flag' or 'report'
  p_item_id BIGINT,
  p_priority INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_profile_id UUID;
  v_notification_id UUID;
  v_notification_type TEXT;
  v_entity_type TEXT;
BEGIN
  -- Determine notification type and entity type
  IF p_item_type = 'flag' THEN
    v_notification_type := 'moderation_escalated_item';
    v_entity_type := 'moderation_flag';
  ELSE
    v_notification_type := 'moderation_escalated_item';
    v_entity_type := 'moderation_report';
  END IF;

  -- Only notify if priority is high (auto-escalated items)
  IF p_priority >= 50 THEN
    -- Notify all admins
    FOR v_admin_profile_id IN 
      SELECT profile_id FROM public.admins
    LOOP
      -- Check if notification already exists (prevent duplicates within last hour)
      SELECT id INTO v_notification_id
      FROM public.notifications
      WHERE recipient_id = v_admin_profile_id
        AND type = v_notification_type
        AND entity_type = v_entity_type
        AND entity_id::TEXT = p_item_id::TEXT
        AND created_at > now() - INTERVAL '1 hour'
        AND read_at IS NULL;

      IF v_notification_id IS NULL THEN
        INSERT INTO public.notifications (
          recipient_id,
          type,
          entity_type,
          entity_id,
          priority,
          severity,
          metadata
        )
        VALUES (
          v_admin_profile_id,
          v_notification_type,
          v_entity_type,
          p_item_id::TEXT::UUID,
          p_priority,
          'high',
          jsonb_build_object(
            'item_type', p_item_type,
            'item_id', p_item_id,
            'priority', p_priority,
            'escalated_at', now()
          )
        );
      END IF;
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_admin_assigned_item(
  p_admin_profile_id UUID,
  p_item_type TEXT, -- 'flag' or 'report'
  p_item_id BIGINT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
  v_entity_type TEXT;
BEGIN
  -- Determine entity type
  IF p_item_type = 'flag' THEN
    v_entity_type := 'moderation_flag';
  ELSE
    v_entity_type := 'moderation_report';
  END IF;

  -- Check if notification already exists
  SELECT id INTO v_notification_id
  FROM public.notifications
  WHERE recipient_id = p_admin_profile_id
    AND type = 'moderation_assigned_item'
    AND entity_type = v_entity_type
    AND entity_id::TEXT = p_item_id::TEXT
    AND read_at IS NULL;

  IF v_notification_id IS NULL THEN
    INSERT INTO public.notifications (
      recipient_id,
      type,
      entity_type,
      entity_id,
      priority,
      severity,
      metadata
    )
    VALUES (
      p_admin_profile_id,
      'moderation_assigned_item',
      v_entity_type,
      p_item_id::TEXT::UUID,
      50,
      'medium',
      jsonb_build_object(
        'item_type', p_item_type,
        'item_id', p_item_id,
        'assigned_at', now()
      )
    );
  END IF;
END;
$$;

-- ============================================================================
-- 3. CREATE TRIGGER TO AUTO-NOTIFY ON HIGH-RISK FLAGS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_notify_high_risk_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only notify for new flags with high risk (>= 7)
  IF NEW.risk >= 7 AND NEW.workflow_state = 'pending' THEN
    PERFORM public.notify_admins_high_risk_flag(
      NEW.id,
      NEW.clip_id,
      NEW.risk,
      NEW.reasons,
      NEW.source
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_high_risk_flag_trigger ON public.moderation_flags;
CREATE TRIGGER notify_high_risk_flag_trigger
AFTER INSERT ON public.moderation_flags
FOR EACH ROW
WHEN (NEW.risk >= 7)
EXECUTE FUNCTION public.trigger_notify_high_risk_flag();

-- ============================================================================
-- 4. CREATE TRIGGER TO AUTO-NOTIFY ON ESCALATED ITEMS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_notify_escalated_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Notify when priority is increased (auto-escalation)
  IF NEW.priority > OLD.priority AND NEW.priority >= 50 THEN
    PERFORM public.notify_admins_escalated_item(
      'flag',
      NEW.id,
      NEW.priority
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_escalated_flag_trigger ON public.moderation_flags;
CREATE TRIGGER notify_escalated_flag_trigger
AFTER UPDATE ON public.moderation_flags
FOR EACH ROW
WHEN (NEW.priority > OLD.priority AND NEW.priority >= 50)
EXECUTE FUNCTION public.trigger_notify_escalated_flag();

CREATE OR REPLACE FUNCTION public.trigger_notify_escalated_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Notify when priority is increased (auto-escalation)
  IF NEW.priority > OLD.priority AND NEW.priority >= 50 THEN
    PERFORM public.notify_admins_escalated_item(
      'report',
      NEW.id,
      NEW.priority
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_escalated_report_trigger ON public.reports;
CREATE TRIGGER notify_escalated_report_trigger
AFTER UPDATE ON public.reports
FOR EACH ROW
WHEN (NEW.priority > OLD.priority AND NEW.priority >= 50)
EXECUTE FUNCTION public.trigger_notify_escalated_report();

-- ============================================================================
-- 4B. CREATE TRIGGER TO AUTO-NOTIFY ON HIGH-PRIORITY REPORTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_notify_high_priority_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_priority INTEGER;
BEGIN
  -- Calculate priority based on reason
  v_priority := 0;

  -- High-priority reasons get extra priority
  IF NEW.reason IN ('harassment', 'hate', 'self-harm', 'personal data') THEN
    v_priority := 30;
  END IF;

  -- Update priority in the database if calculated priority is higher
  IF v_priority > COALESCE(NEW.priority, 0) THEN
    UPDATE public.reports
    SET priority = v_priority
    WHERE id = NEW.id;
  END IF;

  -- Use the higher priority value for notification
  v_priority := GREATEST(v_priority, COALESCE(NEW.priority, 0));

  -- Notify if priority is high enough
  IF v_priority >= 25 THEN
    PERFORM public.notify_admins_high_risk_report(
      NEW.id,
      NEW.clip_id,
      NEW.profile_id,
      NEW.reason,
      v_priority
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_high_priority_report_trigger ON public.reports;
CREATE TRIGGER notify_high_priority_report_trigger
AFTER INSERT ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.trigger_notify_high_priority_report();

-- ============================================================================
-- 5. UPDATE ASSIGNMENT FUNCTION TO SEND NOTIFICATIONS
-- ============================================================================

-- Update the log_moderation_history function to also send assignment notifications
-- This will be called from the admin-review edge function when items are assigned

-- ============================================================================
-- 6. CREATE FUNCTION TO GET UNREAD MODERATION NOTIFICATIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_unread_moderation_notifications(
  p_admin_profile_id UUID
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  entity_type TEXT,
  entity_id UUID,
  priority INTEGER,
  severity TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.id,
    n.type,
    n.entity_type,
    n.entity_id,
    n.priority,
    n.severity,
    n.metadata,
    n.created_at
  FROM public.notifications n
  WHERE n.recipient_id = p_admin_profile_id
    AND n.type IN (
      'moderation_high_risk_flag',
      'moderation_high_risk_report',
      'moderation_escalated_item',
      'moderation_assigned_item'
    )
    AND n.read_at IS NULL
  ORDER BY n.priority DESC, n.created_at DESC
  LIMIT 50;
END;
$$;

-- ============================================================================
-- 7. UPDATE RLS POLICIES FOR MODERATION NOTIFICATIONS
-- ============================================================================

-- Admins can view their own moderation notifications
-- The existing policy should already cover this, but we'll ensure it works

-- ============================================================================
-- 8. ADD COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION public.notify_admins_high_risk_flag IS 'Notifies all admins when a high-risk moderation flag is created';
COMMENT ON FUNCTION public.notify_admins_high_risk_report IS 'Notifies all admins when a high-priority report is created';
COMMENT ON FUNCTION public.notify_admins_escalated_item IS 'Notifies all admins when an item is auto-escalated (priority increased)';
COMMENT ON FUNCTION public.notify_admin_assigned_item IS 'Notifies a specific admin when an item is assigned to them';
COMMENT ON FUNCTION public.get_unread_moderation_notifications IS 'Gets unread moderation notifications for an admin';

