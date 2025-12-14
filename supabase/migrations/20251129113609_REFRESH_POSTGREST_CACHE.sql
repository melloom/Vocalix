-- ============================================================================
-- REFRESH POSTGREST CACHE - Try to force PostgREST to see the function
-- ============================================================================
-- Note: PostgREST caches the schema. After creating functions, it needs to refresh.
-- This tries to trigger a refresh, but may require manual intervention.

-- Method 1: Notify PostgREST (may not work, but worth trying)
NOTIFY pgrst, 'reload schema';

-- Method 2: Create a dummy function and drop it (forces schema change)
-- This sometimes triggers PostgREST to refresh
CREATE OR REPLACE FUNCTION public._refresh_postgrest_cache_dummy()
RETURNS void
LANGUAGE sql
AS $$
  SELECT NULL;
$$;

DROP FUNCTION IF EXISTS public._refresh_postgrest_cache_dummy();

-- Method 3: Re-annotate the function (forces schema reload)
COMMENT ON FUNCTION public.create_magic_login_link(TEXT, TEXT, INTEGER) IS 
'Creates a magic login link for cross-device authentication. [REFRESHED] Parameters: target_email (optional), p_link_type (standard/extended/one_time), p_duration_hours (optional). Returns token, expires_at, link_type.';

-- Verification: Show function is definitely there
SELECT 
  'Function is DEFINITELY in database' AS status,
  proname AS function_name,
  pg_get_function_identity_arguments(oid) AS signature,
  'If you see this, function exists. PostgREST just needs to catch up.' AS note
FROM pg_proc
WHERE proname = 'create_magic_login_link'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
LIMIT 1;

