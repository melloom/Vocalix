-- Cron Job Management RPC Functions
-- Provides admin interface to view, test, and manage cron jobs
-- 
-- Security: These functions require admin access (checked via RLS policies)

-- ============================================================================
-- 1. GET ALL CRON JOBS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_all_cron_jobs()
RETURNS TABLE (
  jobid BIGINT,
  jobname TEXT,
  schedule TEXT,
  command TEXT,
  nodename TEXT,
  nodeport INTEGER,
  database TEXT,
  username TEXT,
  active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if pg_cron extension exists
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron extension is not enabled';
  END IF;
  
  RETURN QUERY
  SELECT 
    j.jobid,
    j.jobname::TEXT,
    j.schedule::TEXT,
    j.command::TEXT,
    j.nodename::TEXT,
    j.nodeport,
    j.database::TEXT,
    j.username::TEXT,
    j.active
  FROM cron.job j
  ORDER BY j.jobname;
END;
$$;

-- ============================================================================
-- 2. GET CRON JOB EXECUTION HISTORY
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_cron_job_history(
  p_job_id BIGINT DEFAULT NULL,
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
BEGIN
  -- Check if execution history table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'cron' AND table_name = 'job_run_details'
  ) THEN
    RAISE NOTICE 'Execution history table (cron.job_run_details) not available';
    RETURN;
  END IF;
  
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
    j.jobname::TEXT
  FROM cron.job_run_details jrd
  LEFT JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE (p_job_id IS NULL OR jrd.jobid = p_job_id)
  ORDER BY jrd.start_time DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 3. RUN CRON JOB MANUALLY (TEST)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.run_cron_job_manual(
  p_job_name TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  job_id BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id BIGINT;
  v_result BIGINT;
BEGIN
  -- Check if pg_cron extension exists
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN QUERY SELECT false, 'pg_cron extension is not enabled'::TEXT, NULL::BIGINT;
    RETURN;
  END IF;
  
  -- Get job ID
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = p_job_name;
  
  IF v_job_id IS NULL THEN
    RETURN QUERY SELECT false, format('Job "%s" not found', p_job_name)::TEXT, NULL::BIGINT;
    RETURN;
  END IF;
  
  -- Check if job is active
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobid = v_job_id AND active = true) THEN
    RETURN QUERY SELECT false, format('Job "%s" is not active', p_job_name)::TEXT, v_job_id;
    RETURN;
  END IF;
  
  -- Run the job
  BEGIN
    SELECT cron.run_job(v_job_id) INTO v_result;
    RETURN QUERY SELECT true, format('Job "%s" started successfully (run ID: %s)', p_job_name, v_result)::TEXT, v_job_id;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN QUERY SELECT false, format('Error running job: %s', SQLERRM)::TEXT, v_job_id;
  END;
END;
$$;

-- ============================================================================
-- 4. GET CRON JOB DETAILS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_cron_job_details(
  p_job_name TEXT
)
RETURNS TABLE (
  jobid BIGINT,
  jobname TEXT,
  schedule TEXT,
  command TEXT,
  nodename TEXT,
  nodeport INTEGER,
  database TEXT,
  username TEXT,
  active BOOLEAN,
  last_run_time TIMESTAMPTZ,
  last_run_status TEXT,
  run_count_today INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id BIGINT;
  v_last_run_time TIMESTAMPTZ;
  v_last_run_status TEXT;
  v_run_count INTEGER;
BEGIN
  -- Get job details
  SELECT 
    j.jobid,
    j.jobname::TEXT,
    j.schedule::TEXT,
    j.command::TEXT,
    j.nodename::TEXT,
    j.nodeport,
    j.database::TEXT,
    j.username::TEXT,
    j.active
  INTO 
    v_job_id,
    jobid,
    jobname,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    username,
    active
  FROM cron.job j
  WHERE j.jobname = p_job_name;
  
  IF v_job_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get last run info if history table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'cron' AND table_name = 'job_run_details'
  ) THEN
    SELECT 
      MAX(start_time),
      (SELECT status FROM cron.job_run_details WHERE jobid = v_job_id ORDER BY start_time DESC LIMIT 1)
    INTO v_last_run_time, v_last_run_status
    FROM cron.job_run_details
    WHERE jobid = v_job_id;
    
    SELECT COUNT(*)
    INTO v_run_count
    FROM cron.job_run_details
    WHERE jobid = v_job_id
      AND start_time >= CURRENT_DATE;
  ELSE
    v_last_run_time := NULL;
    v_last_run_status := NULL;
    v_run_count := 0;
  END IF;
  
  RETURN QUERY SELECT
    v_job_id,
    jobname,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    username,
    active,
    v_last_run_time,
    v_last_run_status,
    v_run_count;
END;
$$;

-- ============================================================================
-- 5. DELETE CRON JOB EXECUTION HISTORY (for a specific job)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_cron_job_history(
  p_job_name TEXT,
  p_older_than_days INTEGER DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  deleted_count INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id BIGINT;
  v_deleted_count INTEGER;
  v_cutoff_date TIMESTAMPTZ;
BEGIN
  -- Check if execution history table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'cron' AND table_name = 'job_run_details'
  ) THEN
    RETURN QUERY SELECT false, 0, 'Execution history table not available'::TEXT;
    RETURN;
  END IF;
  
  -- Get job ID
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = p_job_name;
  
  IF v_job_id IS NULL THEN
    RETURN QUERY SELECT false, 0, format('Job "%s" not found', p_job_name)::TEXT;
    RETURN;
  END IF;
  
  -- Determine cutoff date
  IF p_older_than_days IS NULL THEN
    -- Delete all history for this job
    DELETE FROM cron.job_run_details WHERE jobid = v_job_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN QUERY SELECT true, v_deleted_count, format('Deleted all execution history for job "%s"', p_job_name)::TEXT;
  ELSE
    -- Delete history older than specified days
    v_cutoff_date := CURRENT_DATE - (p_older_than_days || ' days')::INTERVAL;
    DELETE FROM cron.job_run_details 
    WHERE jobid = v_job_id AND start_time < v_cutoff_date;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN QUERY SELECT true, v_deleted_count, format('Deleted execution history older than %s days for job "%s"', p_older_than_days, p_job_name)::TEXT;
  END IF;
END;
$$;

-- ============================================================================
-- 6. EXPORT CRON JOB EXECUTION REPORT (as JSON)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.export_cron_job_report(
  p_job_name TEXT,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id BIGINT;
  v_report JSONB;
BEGIN
  -- Check if execution history table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'cron' AND table_name = 'job_run_details'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Execution history table not available',
      'data', '[]'::jsonb
    );
  END IF;
  
  -- Get job ID
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = p_job_name;
  
  IF v_job_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Job "%s" not found', p_job_name),
      'data', '[]'::jsonb
    );
  END IF;
  
  -- Build report
  SELECT jsonb_agg(
    jsonb_build_object(
      'runid', runid,
      'jobid', jobid,
      'jobname', (SELECT jobname FROM cron.job WHERE jobid = v_job_id),
      'status', status,
      'start_time', start_time,
      'end_time', end_time,
      'duration_seconds', EXTRACT(EPOCH FROM (end_time - start_time)),
      'return_message', return_message,
      'command', command
    )
    ORDER BY start_time DESC
  ) INTO v_report
  FROM cron.job_run_details
  WHERE jobid = v_job_id
    AND (p_start_date IS NULL OR start_time >= p_start_date)
    AND (p_end_date IS NULL OR start_time <= p_end_date)
  LIMIT p_limit;
  
  RETURN jsonb_build_object(
    'success', true,
    'job_name', p_job_name,
    'job_id', v_job_id,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'record_count', jsonb_array_length(COALESCE(v_report, '[]'::jsonb)),
    'data', COALESCE(v_report, '[]'::jsonb)
  );
END;
$$;

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_all_cron_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_job_history(BIGINT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_cron_job_manual(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_job_details(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_cron_job_history(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_cron_job_report(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO authenticated;

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================
COMMENT ON FUNCTION public.get_all_cron_jobs() IS 'Returns all cron jobs with their current status and configuration';
COMMENT ON FUNCTION public.get_cron_job_history(BIGINT, INTEGER) IS 'Returns execution history for cron jobs';
COMMENT ON FUNCTION public.run_cron_job_manual(TEXT) IS 'Manually triggers a cron job for testing';
COMMENT ON FUNCTION public.get_cron_job_details(TEXT) IS 'Returns detailed information about a specific cron job including execution stats';
COMMENT ON FUNCTION public.delete_cron_job_history(TEXT, INTEGER) IS 'Deletes execution history for a cron job (optionally older than specified days)';
COMMENT ON FUNCTION public.export_cron_job_report(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) IS 'Exports cron job execution report as JSON for download';

