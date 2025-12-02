-- Background Jobs Table
-- Supports background job processing for scalability

CREATE TABLE IF NOT EXISTS public.background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 0,
  scheduled_for TIMESTAMPTZ,
  max_retries INTEGER NOT NULL DEFAULT 3,
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  result_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient job processing
CREATE INDEX IF NOT EXISTS idx_background_jobs_status_priority 
  ON public.background_jobs(status, priority DESC, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_background_jobs_scheduled 
  ON public.background_jobs(scheduled_for, status)
  WHERE scheduled_for IS NOT NULL AND status = 'pending';

CREATE INDEX IF NOT EXISTS idx_background_jobs_type 
  ON public.background_jobs(type, status);

CREATE INDEX IF NOT EXISTS idx_background_jobs_created 
  ON public.background_jobs(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_background_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER background_jobs_updated_at
  BEFORE UPDATE ON public.background_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_background_jobs_updated_at();

-- Enable RLS
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access
CREATE POLICY "Background jobs service role only"
ON public.background_jobs
FOR ALL
USING (false)
WITH CHECK (false);

COMMENT ON TABLE public.background_jobs IS 'Background job queue for async processing';
COMMENT ON COLUMN public.background_jobs.type IS 'Job type identifier (e.g., "send_email", "process_audio")';
COMMENT ON COLUMN public.background_jobs.payload IS 'Job-specific data';
COMMENT ON COLUMN public.background_jobs.priority IS 'Job priority (higher = more important)';
COMMENT ON COLUMN public.background_jobs.scheduled_for IS 'When to process this job (null = process immediately)';

