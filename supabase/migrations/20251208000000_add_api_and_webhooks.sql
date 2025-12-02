-- API & Integrations Feature
-- Adds support for public API, API keys, and webhooks

-- ============================================================================
-- API Keys Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT UNIQUE NOT NULL, -- Hashed API key (never store plain text)
  name TEXT NOT NULL, -- User-friendly name for the key
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[], -- Permissions: read, write, webhooks
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60, -- Custom rate limit
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- Optional expiration
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for API keys
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_profile_id ON public.api_keys(profile_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON public.api_keys(is_active) WHERE is_active = true;

-- RLS for API keys
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can create their own API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can update their own API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can delete their own API keys" ON public.api_keys;

-- Users can only view their own API keys
CREATE POLICY "Users can view their own API keys"
ON public.api_keys FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can create their own API keys
CREATE POLICY "Users can create their own API keys"
ON public.api_keys FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can update their own API keys
CREATE POLICY "Users can update their own API keys"
ON public.api_keys FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can delete their own API keys
CREATE POLICY "Users can delete their own API keys"
ON public.api_keys FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- ============================================================================
-- Webhooks Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  url TEXT NOT NULL, -- Webhook endpoint URL
  secret TEXT NOT NULL, -- Secret for signing webhook payloads
  events TEXT[] NOT NULL, -- Events to subscribe to: clip.created, clip.updated, clip.deleted, reaction.created, etc.
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  max_failures INTEGER NOT NULL DEFAULT 5, -- Disable after N failures
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for webhooks
CREATE INDEX IF NOT EXISTS idx_webhooks_profile_id ON public.webhooks(profile_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON public.webhooks(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_webhooks_events ON public.webhooks USING gin(events);

-- RLS for webhooks
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Users can create their own webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Users can update their own webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Users can delete their own webhooks" ON public.webhooks;

-- Users can only view their own webhooks
CREATE POLICY "Users can view their own webhooks"
ON public.webhooks FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can create their own webhooks
CREATE POLICY "Users can create their own webhooks"
ON public.webhooks FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can update their own webhooks
CREATE POLICY "Users can update their own webhooks"
ON public.webhooks FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can delete their own webhooks
CREATE POLICY "Users can delete their own webhooks"
ON public.webhooks FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- ============================================================================
-- Webhook Delivery Logs Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL, -- pending, success, failed
  status_code INTEGER,
  response_body TEXT,
  error_message TEXT,
  attempted_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Indexes for webhook deliveries
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON public.webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON public.webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event_type ON public.webhook_deliveries(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_attempted_at ON public.webhook_deliveries(attempted_at DESC);

-- RLS for webhook deliveries (users can only see their own)
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can view their own webhook deliveries" ON public.webhook_deliveries;

CREATE POLICY "Users can view their own webhook deliveries"
ON public.webhook_deliveries FOR SELECT
USING (
  webhook_id IN (
    SELECT id FROM public.webhooks 
    WHERE profile_id IN (
      SELECT id FROM public.profiles 
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- ============================================================================
-- API Usage Logs Table (for analytics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  id BIGSERIAL PRIMARY KEY,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for API usage logs
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_api_key_id ON public.api_usage_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON public.api_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_endpoint ON public.api_usage_logs(endpoint);

-- RLS for API usage logs (service role only)
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Service role only" ON public.api_usage_logs;

-- Only service role can access (for internal analytics)
CREATE POLICY "Service role only"
ON public.api_usage_logs FOR ALL
USING (false);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to generate API key (returns plain text key that should be shown once)
-- Drop old version(s) if they exist (to avoid function signature conflicts)
DROP FUNCTION IF EXISTS public.generate_api_key CASCADE;

CREATE OR REPLACE FUNCTION public.generate_api_key(
  p_profile_id UUID,
  p_name TEXT,
  p_scopes TEXT[] DEFAULT ARRAY['read']::TEXT[],
  p_rate_limit_per_minute INTEGER DEFAULT 30, -- Reduced from 60 to 30/min
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_daily_quota INTEGER DEFAULT 10000 -- Default 10k requests per day
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
  v_key_hash TEXT;
  v_api_key_id UUID;
BEGIN
  -- Generate a random API key (format: eg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)
  v_key := 'eg_' || encode(gen_random_bytes(32), 'hex');
  
  -- Hash the key (using SHA256 - in production, use bcrypt or similar)
  v_key_hash := encode(digest(v_key, 'sha256'), 'hex');
  
  -- Insert the hashed key
  INSERT INTO public.api_keys (
    key_hash,
    name,
    profile_id,
    scopes,
    rate_limit_per_minute,
    expires_at,
    daily_quota,
    quota_reset_at
  ) VALUES (
    v_key_hash,
    p_name,
    p_profile_id,
    p_scopes,
    p_rate_limit_per_minute,
    p_expires_at,
    p_daily_quota,
    date_trunc('day', now()) + interval '1 day'
  ) RETURNING id INTO v_api_key_id;
  
  -- Return the plain text key (this is the only time it's visible)
  RETURN v_key;
END;
$$;

-- Function to validate API key
CREATE OR REPLACE FUNCTION public.validate_api_key(
  p_key_hash TEXT
)
RETURNS TABLE (
  api_key_id UUID,
  profile_id UUID,
  scopes TEXT[],
  rate_limit_per_minute INTEGER,
  is_active BOOLEAN,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ak.id,
    ak.profile_id,
    ak.scopes,
    ak.rate_limit_per_minute,
    ak.is_active,
    ak.expires_at
  FROM public.api_keys ak
  WHERE ak.key_hash = p_key_hash
    AND ak.is_active = true
    AND (ak.expires_at IS NULL OR ak.expires_at > now());
  
  -- Update last_used_at
  UPDATE public.api_keys
  SET last_used_at = now()
  WHERE key_hash = p_key_hash;
END;
$$;

-- Function to trigger webhooks for an event
CREATE OR REPLACE FUNCTION public.trigger_webhooks(
  p_event_type TEXT,
  p_payload JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_webhook RECORD;
BEGIN
  -- Find all active webhooks subscribed to this event type
  FOR v_webhook IN 
    SELECT * FROM public.webhooks
    WHERE is_active = true
      AND p_event_type = ANY(events)
      AND (max_failures = 0 OR failure_count < max_failures)
  LOOP
    -- Insert delivery record (will be processed by edge function)
    INSERT INTO public.webhook_deliveries (
      webhook_id,
      event_type,
      payload,
      status
    ) VALUES (
      v_webhook.id,
      p_event_type,
      p_payload,
      'pending'
    );
  END LOOP;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.generate_api_key TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.validate_api_key TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.trigger_webhooks TO authenticated, anon;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Trigger to update updated_at on api_keys
DROP TRIGGER IF EXISTS set_updated_at_api_keys ON public.api_keys;
CREATE TRIGGER set_updated_at_api_keys
BEFORE UPDATE ON public.api_keys
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger to update updated_at on webhooks
DROP TRIGGER IF EXISTS set_updated_at_webhooks ON public.webhooks;
CREATE TRIGGER set_updated_at_webhooks
BEFORE UPDATE ON public.webhooks
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger to automatically trigger webhooks on clip events
CREATE OR REPLACE FUNCTION public.handle_clip_webhook_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type TEXT;
  v_payload JSONB;
BEGIN
  -- Determine event type based on operation
  IF TG_OP = 'INSERT' AND NEW.status = 'live' THEN
    v_event_type := 'clip.created';
    v_payload := jsonb_build_object(
      'id', NEW.id,
      'profile_id', NEW.profile_id,
      'audio_path', NEW.audio_path,
      'duration_seconds', NEW.duration_seconds,
      'title', NEW.title,
      'captions', NEW.captions,
      'created_at', NEW.created_at
    );
    PERFORM public.trigger_webhooks(v_event_type, v_payload);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != 'live' AND NEW.status = 'live' THEN
      v_event_type := 'clip.created';
      v_payload := jsonb_build_object(
        'id', NEW.id,
        'profile_id', NEW.profile_id,
        'audio_path', NEW.audio_path,
        'duration_seconds', NEW.duration_seconds,
        'title', NEW.title,
        'captions', NEW.captions,
        'created_at', NEW.created_at
      );
      PERFORM public.trigger_webhooks(v_event_type, v_payload);
    ELSIF NEW.status = 'deleted' OR NEW.status = 'hidden' THEN
      v_event_type := 'clip.deleted';
      v_payload := jsonb_build_object(
        'id', NEW.id,
        'profile_id', NEW.profile_id
      );
      PERFORM public.trigger_webhooks(v_event_type, v_payload);
    ELSE
      v_event_type := 'clip.updated';
      v_payload := jsonb_build_object(
        'id', NEW.id,
        'profile_id', NEW.profile_id,
        'changes', jsonb_build_object(
          'listens_count', NEW.listens_count,
          'reactions', NEW.reactions
        )
      );
      PERFORM public.trigger_webhooks(v_event_type, v_payload);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on clips table
DROP TRIGGER IF EXISTS trigger_clip_webhooks ON public.clips;
CREATE TRIGGER trigger_clip_webhooks
AFTER INSERT OR UPDATE ON public.clips
FOR EACH ROW EXECUTE FUNCTION public.handle_clip_webhook_trigger();

