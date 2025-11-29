-- ============================================================================
-- VERIFY create_magic_login_link EXISTS - Run this first
-- ============================================================================
-- This will show if the function exists in the database
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================================

-- Check if function exists in pg_catalog (PostgreSQL's internal catalog)
SELECT 
  'Function in PostgreSQL:' as status,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'create_magic_login_link';

-- If you see a row above, the function EXISTS in the database
-- The 404 error means PostgREST (the API layer) can't see it
-- This is a PostgREST schema cache issue

-- Check permissions
SELECT 
  'Permissions check:' as status,
  p.proname as function_name,
  r.rolname as role,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
CROSS JOIN pg_roles r
WHERE n.nspname = 'public'
  AND p.proname = 'create_magic_login_link'
  AND r.rolname IN ('authenticated', 'anon', 'public')
ORDER BY r.rolname;

-- All should show can_execute = true

