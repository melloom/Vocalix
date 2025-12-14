-- ============================================================================
-- User Feedback & Issue Reporting System
-- ============================================================================
-- Allows users to submit feedback, report bugs, and suggest features
-- ============================================================================

-- Create user_feedback table
CREATE TABLE IF NOT EXISTS public.user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  device_id TEXT, -- Store device_id for anonymous users
  
  -- Feedback type
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('bug', 'feature_request', 'general_feedback', 'issue', 'other')),
  
  -- Content
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT, -- Optional category (e.g., 'audio', 'ui', 'performance', 'mobile')
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional context (browser, OS, URL, etc.)
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'in_progress', 'resolved', 'closed', 'duplicate')),
  admin_notes TEXT, -- Internal notes from admins
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- User contact (optional)
  contact_email TEXT, -- Optional email if user wants follow-up
  allow_contact BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_feedback_profile ON public.user_feedback(profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_feedback_device ON public.user_feedback(device_id) WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_feedback_type ON public.user_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON public.user_feedback(status);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created ON public.user_feedback(created_at DESC);

-- Enable RLS
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own feedback
DROP POLICY IF EXISTS "Users can view their own feedback" ON public.user_feedback;
CREATE POLICY "Users can view their own feedback"
ON public.user_feedback FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR device_id = current_setting('request.headers', true)::json->>'x-device-id'
);

-- Policy: Users can insert their own feedback
DROP POLICY IF EXISTS "Users can insert their own feedback" ON public.user_feedback;
CREATE POLICY "Users can insert their own feedback"
ON public.user_feedback FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR device_id = current_setting('request.headers', true)::json->>'x-device-id'
);

-- Policy: Admins can view all feedback
DROP POLICY IF EXISTS "Admins can view all feedback" ON public.user_feedback;
CREATE POLICY "Admins can view all feedback"
ON public.user_feedback FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Policy: Admins can update feedback
DROP POLICY IF EXISTS "Admins can update feedback" ON public.user_feedback;
CREATE POLICY "Admins can update feedback"
ON public.user_feedback FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_user_feedback_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_user_feedback_updated_at_trigger ON public.user_feedback;
CREATE TRIGGER update_user_feedback_updated_at_trigger
BEFORE UPDATE ON public.user_feedback
FOR EACH ROW
EXECUTE FUNCTION public.update_user_feedback_updated_at();

-- Grant permissions
GRANT SELECT, INSERT ON public.user_feedback TO authenticated, anon;
GRANT UPDATE ON public.user_feedback TO authenticated;

