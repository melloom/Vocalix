-- Test RPC functions directly to verify they work
-- Run these tests one at a time in Supabase SQL Editor

-- Test 1: get_smart_notification_digest
-- This should return a JSONB object with unread_count, by_type, and priority_notifications
SELECT public.get_smart_notification_digest(
  (SELECT id FROM public.profiles LIMIT 1)::UUID,
  NOW() - INTERVAL '24 hours'
) as test_result;

-- Test 2: get_enhanced_for_you_feed
-- This should return a table with clip_id, relevance_score, and clip_data
-- If there are no clips or all have relevance 0, it will return empty
SELECT * FROM public.get_enhanced_for_you_feed(
  (SELECT id FROM public.profiles LIMIT 1)::UUID,
  10,  -- limit
  0,   -- offset
  NULL, -- current_hour
  NULL  -- device_type
) LIMIT 5;

-- Test 3: calculate_enhanced_personalized_relevance
-- This returns a numeric score between 0 and 1
-- 0 means low relevance (no trending score, doesn't follow creator, etc.)
-- Higher scores mean better relevance
-- If no clips exist, this will fail - check first:
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM public.clips WHERE status = 'live' LIMIT 1) 
    THEN public.calculate_enhanced_personalized_relevance(
      (SELECT id FROM public.clips WHERE status = 'live' LIMIT 1)::UUID,
      (SELECT id FROM public.profiles LIMIT 1)::UUID,
      NULL, 
      NULL
    )::TEXT
    ELSE 'No live clips found'
  END as test_result;

