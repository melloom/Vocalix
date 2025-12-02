-- Test Script for get_for_you_feed
-- Run this to test if the function works correctly after the fix

-- Step 1: Get a sample profile_id (use this in the test below)
SELECT 
  'Sample Profile IDs:' as info,
  id as profile_id,
  handle,
  created_at
FROM public.profiles
ORDER BY created_at DESC
LIMIT 5;

-- Step 2: Test get_for_you_feed with a real profile_id
-- Replace 'YOUR_PROFILE_ID_HERE' with one of the profile_ids from above
-- Example: SELECT * FROM get_for_you_feed('a8c24193-3912-4a7e-af33-328b3c756a32'::UUID, 10, 0) LIMIT 5;

-- Step 3: Test with NULL profile_id (should return trending clips only)
SELECT 
  clip_id,
  relevance_score,
  clip_data->>'title' as title,
  clip_data->>'created_at' as created_at
FROM get_for_you_feed(NULL::UUID, 10, 0)
LIMIT 5;

-- Step 4: Test calculate_personalized_relevance function
-- Get a sample clip_id first
SELECT 
  'Sample Clip IDs:' as info,
  id as clip_id,
  title,
  trending_score,
  profile_id
FROM public.clips
WHERE status = 'live'
ORDER BY created_at DESC
LIMIT 5;

-- Step 5: Test calculate_personalized_relevance with a clip and profile
-- Replace with actual IDs from above queries
-- Example: 
-- SELECT calculate_personalized_relevance(
--   'CLIP_ID_HERE'::UUID,
--   'PROFILE_ID_HERE'::UUID
-- );

-- Step 6: Test calculate_personalized_relevance with NULL profile (trending only)
-- SELECT 
--   id as clip_id,
--   title,
--   calculate_personalized_relevance(id, NULL) as relevance_score
-- FROM public.clips
-- WHERE status = 'live'
-- ORDER BY relevance_score DESC
-- LIMIT 10;

-- Step 7: Check if there are any clips available for the feed
SELECT 
  COUNT(*) as total_live_clips,
  COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as recent_clips,
  COUNT(CASE WHEN trending_score > 100 THEN 1 END) as trending_clips
FROM public.clips
WHERE status = 'live';

