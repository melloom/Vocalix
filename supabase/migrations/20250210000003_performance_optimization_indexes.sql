-- Performance Optimization Indexes
-- Additional indexes for improved query performance and scalability

-- ============================================================================
-- 1. CLIPS TABLE OPTIMIZATIONS
-- ============================================================================

-- Only create indexes if clips table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clips') THEN
    -- Composite index for trending feed queries (status + parent_clip_id + trending_score)
    CREATE INDEX IF NOT EXISTS idx_clips_trending_feed 
      ON public.clips(status, parent_clip_id, trending_score DESC NULLS LAST)
      WHERE status = 'live' AND parent_clip_id IS NULL;

    -- Composite index for topic-based queries
    CREATE INDEX IF NOT EXISTS idx_clips_topic_trending 
      ON public.clips(topic_id, trending_score DESC NULLS LAST, created_at DESC)
      WHERE status = 'live' AND topic_id IS NOT NULL;

    -- Composite index for city-based queries
    CREATE INDEX IF NOT EXISTS idx_clips_city_trending 
      ON public.clips(city, trending_score DESC NULLS LAST, created_at DESC)
      WHERE status = 'live' AND city IS NOT NULL;

    -- Index for scheduled clips
    CREATE INDEX IF NOT EXISTS idx_clips_scheduled 
      ON public.clips(scheduled_for, status)
      WHERE scheduled_for IS NOT NULL AND status = 'scheduled';

    -- Index for profile clips with status
    CREATE INDEX IF NOT EXISTS idx_clips_profile_status 
      ON public.clips(profile_id, status, created_at DESC);

    -- Index for reply queries
    CREATE INDEX IF NOT EXISTS idx_clips_replies 
      ON public.clips(parent_clip_id, created_at DESC)
      WHERE parent_clip_id IS NOT NULL;

    -- Partial index for active clips only
    CREATE INDEX IF NOT EXISTS idx_clips_active 
      ON public.clips(created_at DESC, trending_score DESC NULLS LAST)
      WHERE status = 'live';
  END IF;
END $$;

-- ============================================================================
-- 2. REACTIONS TABLE OPTIMIZATIONS
-- ============================================================================

-- Only create indexes if reactions table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reactions') THEN
    -- Composite index for clip reactions with type
    CREATE INDEX IF NOT EXISTS idx_reactions_clip_type 
      ON public.reactions(clip_id, reaction_type, created_at DESC)
      WHERE clip_id IS NOT NULL;

    -- Index for profile reactions
    CREATE INDEX IF NOT EXISTS idx_reactions_profile 
      ON public.reactions(profile_id, created_at DESC);

    -- Composite index for reaction counts
    CREATE INDEX IF NOT EXISTS idx_reactions_count 
      ON public.reactions(clip_id, reaction_type)
      WHERE clip_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 3. COMMENTS TABLE OPTIMIZATIONS
-- ============================================================================

-- Only create indexes if comments table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'comments') THEN
    -- Composite index for clip comments
    CREATE INDEX IF NOT EXISTS idx_comments_clip_created 
      ON public.comments(clip_id, created_at DESC)
      WHERE clip_id IS NOT NULL;

    -- Index for profile comments
    CREATE INDEX IF NOT EXISTS idx_comments_profile 
      ON public.comments(profile_id, created_at DESC);

    -- Index for parent comments (nested comments)
    CREATE INDEX IF NOT EXISTS idx_comments_parent 
      ON public.comments(parent_comment_id, created_at DESC)
      WHERE parent_comment_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 4. FOLLOWS TABLE OPTIMIZATIONS
-- ============================================================================

-- Only create indexes if follows table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'follows') THEN
    -- Composite index for follower queries
    CREATE INDEX IF NOT EXISTS idx_follows_follower 
      ON public.follows(follower_id, created_at DESC);

    -- Composite index for following queries
    CREATE INDEX IF NOT EXISTS idx_follows_following 
      ON public.follows(following_id, created_at DESC);

    -- Unique index to prevent duplicate follows (if not already exists)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_follows_unique 
      ON public.follows(follower_id, following_id)
      WHERE follower_id IS NOT NULL AND following_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 5. SAVED CLIPS TABLE OPTIMIZATIONS
-- ============================================================================

-- Only create indexes if saved_clips table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'saved_clips') THEN
    -- Index for user saved clips
    CREATE INDEX IF NOT EXISTS idx_saved_clips_profile 
      ON public.saved_clips(profile_id, created_at DESC);

    -- Composite index for clip saves
    CREATE INDEX IF NOT EXISTS idx_saved_clips_clip 
      ON public.saved_clips(clip_id, created_at DESC);
  END IF;
END $$;

-- ============================================================================
-- 6. NOTIFICATIONS TABLE OPTIMIZATIONS
-- ============================================================================

-- Only create indexes if notifications table exists and has the correct columns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    -- Check if table has recipient_id column (newer schema)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'recipient_id') THEN
      -- Index for user notifications (using recipient_id)
      CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read 
        ON public.notifications(recipient_id, read_at, created_at DESC);

      -- Index for unread notifications (using recipient_id and read_at)
      CREATE INDEX IF NOT EXISTS idx_notifications_unread 
        ON public.notifications(recipient_id, created_at DESC)
        WHERE read_at IS NULL;

      -- Index for notification types (using type column)
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'type') THEN
        CREATE INDEX IF NOT EXISTS idx_notifications_type 
          ON public.notifications(type, created_at DESC);
      END IF;
    -- Check if table has profile_id column (older schema)
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'profile_id') THEN
      -- Index for user notifications (using profile_id)
      CREATE INDEX IF NOT EXISTS idx_notifications_profile_read 
        ON public.notifications(profile_id, read, created_at DESC);

      -- Index for unread notifications (using profile_id and read boolean)
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'read') THEN
        CREATE INDEX IF NOT EXISTS idx_notifications_unread 
          ON public.notifications(profile_id, created_at DESC)
          WHERE read = false;
      END IF;

      -- Index for notification types (using notification_type column)
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'notification_type') THEN
        CREATE INDEX IF NOT EXISTS idx_notifications_type 
          ON public.notifications(notification_type, created_at DESC);
      END IF;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 7. ANALYTICS AND METRICS OPTIMIZATIONS
-- ============================================================================

-- Only create indexes if analytics tables exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clip_analytics') THEN
    -- Index for clip analytics queries
    CREATE INDEX IF NOT EXISTS idx_clip_analytics_date 
      ON public.clip_analytics(clip_id, date DESC);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profile_analytics') THEN
    -- Index for profile analytics
    CREATE INDEX IF NOT EXISTS idx_profile_analytics_date 
      ON public.profile_analytics(profile_id, date DESC);
  END IF;
END $$;

-- ============================================================================
-- 8. SEARCH OPTIMIZATIONS
-- ============================================================================

-- GIN index for full-text search on clips (if using tsvector)
-- Note: This requires the title/summary to be converted to tsvector
-- CREATE INDEX IF NOT EXISTS idx_clips_search 
--   ON public.clips USING GIN(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(summary, '')));

-- Trigram index for fuzzy search on handles (if pg_trgm extension is enabled)
-- CREATE INDEX IF NOT EXISTS idx_profiles_handle_trgm 
--   ON public.profiles USING GIN(handle gin_trgm_ops);

-- ============================================================================
-- 9. PERFORMANCE MONITORING
-- ============================================================================

-- Only create indexes if monitoring tables exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'query_performance_log') THEN
    -- Index for query performance logs
    CREATE INDEX IF NOT EXISTS idx_query_perf_slow 
      ON public.query_performance_log(execution_time_ms DESC, created_at DESC)
      WHERE execution_time_ms > 1000;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rate_limit_logs') THEN
    -- Index for rate limit logs cleanup (regular index, predicate removed as NOW() is not immutable)
    CREATE INDEX IF NOT EXISTS idx_rate_limit_cleanup 
      ON public.rate_limit_logs(created_at);
  END IF;
END $$;

-- ============================================================================
-- 10. UPTIME METRICS (if table exists)
-- ============================================================================

-- Only create index if uptime_metrics table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'uptime_metrics') THEN
    -- Index for uptime metrics queries
    CREATE INDEX IF NOT EXISTS idx_uptime_metrics_timestamp 
      ON public.uptime_metrics(timestamp DESC);
  END IF;
END $$;

-- ============================================================================
-- ANALYZE TABLES FOR OPTIMIZER
-- ============================================================================

-- Update table statistics for better query planning (only for existing tables)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clips') THEN
    ANALYZE public.clips;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reactions') THEN
    ANALYZE public.reactions;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'comments') THEN
    ANALYZE public.comments;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'follows') THEN
    ANALYZE public.follows;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'saved_clips') THEN
    ANALYZE public.saved_clips;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    ANALYZE public.notifications;
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

-- Add comments to indexes (only if they exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_clips_trending_feed') THEN
    COMMENT ON INDEX idx_clips_trending_feed IS 'Optimizes trending feed queries (status + parent_clip_id + trending_score)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_clips_topic_trending') THEN
    COMMENT ON INDEX idx_clips_topic_trending IS 'Optimizes topic-based trending queries';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_clips_city_trending') THEN
    COMMENT ON INDEX idx_clips_city_trending IS 'Optimizes city-based trending queries';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_reactions_clip_type') THEN
    COMMENT ON INDEX idx_reactions_clip_type IS 'Optimizes reaction queries by clip and type';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_unread') THEN
    COMMENT ON INDEX idx_notifications_unread IS 'Optimizes unread notification queries';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_recipient_read') THEN
    COMMENT ON INDEX idx_notifications_recipient_read IS 'Optimizes notification queries by recipient and read status';
  END IF;
END $$;

