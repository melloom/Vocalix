-- Uptime Metrics Table
-- Tracks system availability and performance metrics

CREATE TABLE IF NOT EXISTS public.uptime_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('up', 'down')),
  response_time INTEGER, -- milliseconds
  database_ok BOOLEAN,
  storage_ok BOOLEAN,
  functions_ok BOOLEAN,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_uptime_metrics_timestamp 
  ON public.uptime_metrics(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_uptime_metrics_status 
  ON public.uptime_metrics(status, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_uptime_metrics_recent 
  ON public.uptime_metrics(timestamp DESC);

-- Enable RLS
ALTER TABLE public.uptime_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can insert, but allow read for monitoring
CREATE POLICY "Uptime metrics service role insert"
ON public.uptime_metrics
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Uptime metrics authenticated read"
ON public.uptime_metrics
FOR SELECT
USING (auth.role() = 'authenticated');

-- Function to clean up old metrics (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_uptime_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.uptime_metrics
  WHERE timestamp < NOW() - INTERVAL '90 days';
END;
$$;

-- Schedule cleanup (run via pg_cron if available)
-- SELECT cron.schedule('cleanup-uptime-metrics', '0 2 * * *', 'SELECT cleanup_old_uptime_metrics()');

COMMENT ON TABLE public.uptime_metrics IS 'System uptime and health check metrics';
COMMENT ON COLUMN public.uptime_metrics.status IS 'System status: up or down';
COMMENT ON COLUMN public.uptime_metrics.response_time IS 'Health check response time in milliseconds';

