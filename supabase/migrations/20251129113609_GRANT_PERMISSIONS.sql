-- Grant Permissions for get_for_you_feed Functions
-- Run this in Supabase SQL Editor to ensure permissions are correct

-- Method 1: Grant using the exact function signatures (with DEFAULT parameters)
-- This matches what the user saw in the verification query

-- Grant for get_for_you_feed with all parameters
GRANT EXECUTE ON FUNCTION public.get_for_you_feed(UUID, INTEGER, INTEGER) TO authenticated, anon;

-- Grant for get_for_you_feed with default parameters (if PostgreSQL creates separate variants)
-- This handles the case where defaults create function overloads
DO $$
BEGIN
  -- Grant for get_for_you_feed(p_profile_id, p_limit, p_offset)
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_for_you_feed(UUID, INTEGER, INTEGER) TO authenticated, anon';
  
  -- Try to grant for variant with defaults (if it exists as separate function)
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_for_you_feed(UUID) TO authenticated, anon';
  EXCEPTION WHEN undefined_function THEN
    NULL; -- Function variant doesn't exist, skip
  END;
  
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_for_you_feed(UUID, INTEGER) TO authenticated, anon';
  EXCEPTION WHEN undefined_function THEN
    NULL; -- Function variant doesn't exist, skip
  END;
END $$;

-- Grant for calculate_personalized_relevance
GRANT EXECUTE ON FUNCTION public.calculate_personalized_relevance(UUID, UUID) TO authenticated, anon;

-- Method 2: Grant using function OID (most reliable)
-- This grants permissions directly to the function regardless of parameter names
DO $$
DECLARE
  func_record RECORD;
BEGIN
  -- Grant permissions for all variants of get_for_you_feed
  FOR func_record IN
    SELECT oid, proname, pg_get_function_arguments(oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'get_for_you_feed'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, anon', func_record.oid::regprocedure);
    RAISE NOTICE 'Granted permissions for: % (%)', func_record.proname, func_record.args;
  END LOOP;

  -- Grant permissions for all variants of calculate_personalized_relevance
  FOR func_record IN
    SELECT oid, proname, pg_get_function_arguments(oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'calculate_personalized_relevance'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, anon', func_record.oid::regprocedure);
    RAISE NOTICE 'Granted permissions for: % (%)', func_record.proname, func_record.args;
  END LOOP;
END $$;

-- Verify permissions were granted
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  r.rolname as role_name,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
FROM pg_proc p
CROSS JOIN pg_roles r
WHERE p.proname IN ('get_for_you_feed', 'calculate_personalized_relevance')
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND r.rolname IN ('authenticated', 'anon', 'postgres')
ORDER BY p.proname, r.rolname;

