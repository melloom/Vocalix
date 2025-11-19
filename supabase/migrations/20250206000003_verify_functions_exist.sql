-- Diagnostic: Verify RPC functions exist and have correct signatures
-- Run this query in Supabase SQL Editor to check if functions exist

-- Check if get_smart_notification_digest exists
SELECT 
  r.routine_name,
  r.routine_type,
  r.routine_schema,
  r.data_type as return_type,
  string_agg(
    p.parameter_name || ' ' || p.data_type, 
    ', ' ORDER BY p.ordinal_position
  ) as parameters
FROM information_schema.routines r
LEFT JOIN information_schema.parameters p
  ON r.specific_name = p.specific_name
WHERE r.routine_schema = 'public'
  AND r.routine_name IN (
    'get_smart_notification_digest',
    'get_enhanced_for_you_feed',
    'calculate_enhanced_personalized_relevance'
  )
GROUP BY r.routine_name, r.routine_type, r.routine_schema, r.data_type
ORDER BY r.routine_name;

-- Check grants on functions
SELECT 
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_smart_notification_digest',
    'get_enhanced_for_you_feed',
    'calculate_enhanced_personalized_relevance'
  )
ORDER BY routine_name, grantee, privilege_type;

