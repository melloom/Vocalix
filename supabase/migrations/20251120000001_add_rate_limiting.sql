-- Rate limiting infrastructure
-- This table tracks rate limit requests for persistent rate limiting across Edge Functions

CREATE TABLE IF NOT EXISTS public.rate_limit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  identifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS rate_limit_logs_key_created_idx 
ON public.rate_limit_logs(key, created_at DESC);

-- Index for cleanup operations
CREATE INDEX IF NOT EXISTS rate_limit_logs_created_idx 
ON public.rate_limit_logs(created_at);

-- Enable RLS (only Edge Functions with service role can access)
ALTER TABLE public.rate_limit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (Edge Functions use service role)
CREATE POLICY "Service role only"
ON public.rate_limit_logs
FOR ALL
USING (false) -- Deny all public access
WITH CHECK (false);

-- Function to clean up old rate limit logs (run periodically)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete logs older than 24 hours
  DELETE FROM public.rate_limit_logs
  WHERE created_at < now() - interval '24 hours';
END;
$$;

-- Add rate limiting to profile updates (prevent handle spam)
CREATE OR REPLACE FUNCTION public.check_profile_update_rate_limit(profile_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recent_updates INTEGER;
  max_updates INTEGER := 5;
  window_minutes INTEGER := 60;
BEGIN
  SELECT COUNT(*)
  INTO recent_updates
  FROM public.profiles
  WHERE id = profile_id_param
    AND updated_at > now() - (window_minutes || ' minutes')::interval;
  
  RETURN recent_updates < max_updates;
END;
$$;

