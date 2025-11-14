-- Performance Optimization: Add Database Indexes
-- This migration adds indexes for common queries to improve performance

-- Note: pg_trgm extension should be enabled at database level for trigram indexes
-- If not available, the migration will use fallback indexes

-- Indexes for clips table queries
-- Index for filtering by status and parent_clip_id (common in feed queries)
CREATE INDEX IF NOT EXISTS idx_clips_status_parent 
ON public.clips(status, parent_clip_id) 
WHERE status IN ('live', 'processing') AND parent_clip_id IS NULL;

-- Index for topic-based queries
CREATE INDEX IF NOT EXISTS idx_clips_topic_status 
ON public.clips(topic_id, status, created_at DESC) 
WHERE status = 'live';

-- Index for hashtag queries (tags array contains)
CREATE INDEX IF NOT EXISTS idx_clips_tags_gin 
ON public.clips USING gin(tags) 
WHERE status = 'live';

-- Index for city-based filtering
CREATE INDEX IF NOT EXISTS idx_clips_city_status 
ON public.clips(city, status, created_at DESC) 
WHERE status = 'live' AND city IS NOT NULL;

-- Index for profile queries (user's clips)
CREATE INDEX IF NOT EXISTS idx_clips_profile_status 
ON public.clips(profile_id, status, created_at DESC) 
WHERE status = 'live';

-- Index for reply counts (parent_clip_id lookups)
CREATE INDEX IF NOT EXISTS idx_clips_parent_status 
ON public.clips(parent_clip_id, status) 
WHERE parent_clip_id IS NOT NULL AND status = 'live';

-- Index for remix counts
CREATE INDEX IF NOT EXISTS idx_clips_remix_status 
ON public.clips(remix_of_clip_id, status) 
WHERE remix_of_clip_id IS NOT NULL AND status = 'live';

-- Indexes for profiles table
-- Index for handle lookups (case-insensitive)
-- Using index on lowercased handle for efficient case-insensitive lookups
-- Note: For ILIKE pattern matching, consider enabling pg_trgm extension at database level
CREATE INDEX IF NOT EXISTS idx_profiles_handle_lower 
ON public.profiles(lower(handle))
WHERE handle IS NOT NULL;

-- Additional index for exact handle matches (if needed)
CREATE INDEX IF NOT EXISTS idx_profiles_handle 
ON public.profiles(handle)
WHERE handle IS NOT NULL;

-- Index for device_id lookups
CREATE INDEX IF NOT EXISTS idx_profiles_device_id 
ON public.profiles(device_id) 
WHERE device_id IS NOT NULL;

-- Indexes for badges table
-- Index for community badges
CREATE INDEX IF NOT EXISTS idx_badges_community 
ON public.badges(community_id, criteria_value) 
WHERE community_id IS NOT NULL;

-- Index for global badges
CREATE INDEX IF NOT EXISTS idx_badges_global 
ON public.badges(criteria_value) 
WHERE community_id IS NULL;

-- Indexes for user_badges table
CREATE INDEX IF NOT EXISTS idx_user_badges_profile_earned 
ON public.user_badges(profile_id, earned_at DESC);

-- Index for badge lookups
CREATE INDEX IF NOT EXISTS idx_user_badges_badge 
ON public.user_badges(badge_id);

-- Indexes for topics table
-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_topics_date_active 
ON public.topics(date DESC, is_active) 
WHERE is_active = true;

-- Indexes for topic subscriptions
CREATE INDEX IF NOT EXISTS idx_topic_subscriptions_profile_topic 
ON public.topic_subscriptions(profile_id, topic_id);

-- Indexes for playlists/collections
CREATE INDEX IF NOT EXISTS idx_playlists_public_updated 
ON public.playlists(is_public, updated_at DESC) 
WHERE is_public = true AND is_auto_generated = false;

-- Index for playlist clips count queries
CREATE INDEX IF NOT EXISTS idx_playlist_clips_playlist 
ON public.playlist_clips(playlist_id);

-- Indexes for comments
CREATE INDEX IF NOT EXISTS idx_comments_clip_created 
ON public.comments(clip_id, created_at DESC);

-- Note: Reactions are stored as JSONB in clips.reactions column, not a separate table
-- No index needed for reactions as they're part of the clips table

-- Add comment explaining the indexes
COMMENT ON INDEX idx_clips_status_parent IS 'Optimizes feed queries that filter by status and exclude replies';
COMMENT ON INDEX idx_clips_topic_status IS 'Optimizes topic page queries';
COMMENT ON INDEX idx_clips_tags_gin IS 'Optimizes hashtag search queries';
COMMENT ON INDEX idx_clips_city_status IS 'Optimizes city-based filtering';
COMMENT ON INDEX idx_clips_profile_status IS 'Optimizes user profile clip queries';
COMMENT ON INDEX idx_profiles_handle_lower IS 'Optimizes case-insensitive profile handle lookups';
COMMENT ON INDEX idx_profiles_handle IS 'Optimizes exact profile handle lookups';

