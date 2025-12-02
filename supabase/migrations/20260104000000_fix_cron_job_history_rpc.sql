-- Fix get_cron_job_history function to handle missing table gracefully
-- This fixes the 400 error when the cron.job_run_details table doesn't exist

CREATE OR REPLACE FUNCTION public.get_cron_job_history(
  p_job_id BIGINT DEFAULT NULL,
  p_job_name TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  jobid BIGINT,
  runid BIGINT,
  job_pid BIGINT,
  database TEXT,
  username TEXT,
  command TEXT,
  status TEXT,
  return_message TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  jobname TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id BIGINT;
BEGIN
  -- Check if execution history table exists - if not, return empty result gracefully
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'cron' AND table_name = 'job_run_details'
  ) THEN
    -- Return empty result set with proper structure
    RETURN QUERY
    SELECT 
      NULL::BIGINT, NULL::BIGINT, NULL::BIGINT,
      NULL::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::TEXT, NULL::TEXT,
      NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::TEXT
    WHERE FALSE; -- Never returns rows
    RETURN;
  END IF;
  
  -- Resolve job ID from job name if provided
  IF p_job_id IS NULL AND p_job_name IS NOT NULL AND trim(COALESCE(p_job_name, '')) != '' THEN
    BEGIN
      SELECT jobid INTO v_job_id
      FROM cron.job
      WHERE jobname = p_job_name
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_job_id := NULL;
    END;
  ELSE
    v_job_id := p_job_id;
  END IF;
  
  -- Return query results with error handling
  BEGIN
    RETURN QUERY
    SELECT 
      jrd.jobid,
      jrd.runid,
      jrd.job_pid,
      jrd.database::TEXT,
      jrd.username::TEXT,
      jrd.command::TEXT,
      jrd.status::TEXT,
      jrd.return_message::TEXT,
      jrd.start_time,
      jrd.end_time,
      COALESCE(j.jobname::TEXT, '')::TEXT as jobname
    FROM cron.job_run_details jrd
    LEFT JOIN cron.job j ON j.jobid = jrd.jobid
    WHERE (v_job_id IS NULL OR jrd.jobid = v_job_id)
    ORDER BY jrd.start_time DESC NULLS LAST
    LIMIT GREATEST(COALESCE(NULLIF(p_limit, 0), 100), 1);
  EXCEPTION WHEN OTHERS THEN
    -- If query fails for any reason, return empty result
    RETURN QUERY
    SELECT 
      NULL::BIGINT, NULL::BIGINT, NULL::BIGINT,
      NULL::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::TEXT, NULL::TEXT,
      NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::TEXT
    WHERE FALSE;
  END;
END;
$$;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION public.get_cron_job_history(BIGINT, TEXT, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_cron_job_history(BIGINT, TEXT, INTEGER) IS 'Returns execution history for cron jobs. Returns empty result if history table is not available.';

