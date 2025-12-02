-- Reddit-like Posts Feature
-- Adds support for text posts, video posts, and audio posts (like Reddit)
-- Users can post thoughts, videos, or audio clips

-- ============================================================================
-- 1. POSTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
  
  -- Content type: 'text', 'video', 'audio', 'link'
  post_type TEXT NOT NULL DEFAULT 'text' CHECK (post_type IN ('text', 'video', 'audio', 'link')),
  
  -- Text content (for text posts or captions)
  title TEXT,
  content TEXT,
  
  -- Media content
  video_path TEXT,
  video_thumbnail_path TEXT,
  audio_path TEXT,
  link_url TEXT,
  link_preview JSONB, -- For link previews (title, description, image)
  
  -- Metadata
  duration_seconds INT, -- For video/audio posts
  mood_emoji TEXT,
  tags TEXT[],
  
  -- Engagement metrics
  upvote_count INTEGER DEFAULT 0,
  downvote_count INTEGER DEFAULT 0,
  vote_score INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  
  -- Status and visibility
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('draft', 'live', 'hidden', 'archived')),
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'community')),
  is_private BOOLEAN DEFAULT false,
  
  -- Moderation
  is_nsfw BOOLEAN DEFAULT false,
  content_rating TEXT DEFAULT 'general',
  
  -- Flair support
  flair_id UUID REFERENCES public.clip_flairs(id) ON DELETE SET NULL,
  
  -- Location
  city TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_posts_profile_id ON public.posts(profile_id);
CREATE INDEX IF NOT EXISTS idx_posts_community_id ON public.posts(community_id);
CREATE INDEX IF NOT EXISTS idx_posts_topic_id ON public.posts(topic_id);
CREATE INDEX IF NOT EXISTS idx_posts_post_type ON public.posts(post_type);
CREATE INDEX IF NOT EXISTS idx_posts_status ON public.posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_vote_score ON public.posts(vote_score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON public.posts(visibility);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_posts_content_fts ON public.posts USING gin(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')));

-- Enable RLS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Posts are viewable by everyone if live and public"
ON public.posts FOR SELECT
USING (
  status = 'live' 
  AND (visibility = 'public' OR visibility = 'community')
  AND deleted_at IS NULL
);

CREATE POLICY "Users can view their own posts"
ON public.posts FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Users can insert their own posts"
ON public.posts FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Users can update their own posts"
ON public.posts FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Users can delete their own posts"
ON public.posts FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
)
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Admins can do everything
CREATE POLICY "Admins can manage all posts"
ON public.posts FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE profile_id IN (
      SELECT id FROM public.profiles 
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- ============================================================================
-- 2. POST VOTES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.post_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('upvote', 'downvote')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, profile_id)
);

ALTER TABLE public.post_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Post votes are viewable by everyone"
ON public.post_votes FOR SELECT
USING (true);

CREATE POLICY "Users can vote on posts"
ON public.post_votes FOR ALL
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Index for post votes
CREATE INDEX IF NOT EXISTS idx_post_votes_post_id ON public.post_votes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_votes_profile_id ON public.post_votes(profile_id);

-- ============================================================================
-- 3. POST COMMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  audio_path TEXT, -- For voice comments
  parent_comment_id UUID REFERENCES public.post_comments(id) ON DELETE CASCADE,
  upvote_count INTEGER DEFAULT 0,
  downvote_count INTEGER DEFAULT 0,
  vote_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Post comments are viewable by everyone"
ON public.post_comments FOR SELECT
USING (deleted_at IS NULL);

CREATE POLICY "Users can insert their own comments"
ON public.post_comments FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Users can update their own comments"
ON public.post_comments FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Indexes for post comments
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON public.post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_profile_id ON public.post_comments(profile_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_parent_comment_id ON public.post_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_created_at ON public.post_comments(created_at DESC);

-- ============================================================================
-- 4. FUNCTIONS TO UPDATE POST METRICS
-- ============================================================================

-- Function to update post vote scores
CREATE OR REPLACE FUNCTION public.update_post_vote_score()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.posts
    SET 
      upvote_count = (
        SELECT COUNT(*) FROM public.post_votes 
        WHERE post_id = NEW.post_id AND vote_type = 'upvote'
      ),
      downvote_count = (
        SELECT COUNT(*) FROM public.post_votes 
        WHERE post_id = NEW.post_id AND vote_type = 'downvote'
      ),
      vote_score = (
        SELECT COUNT(*) FILTER (WHERE vote_type = 'upvote') - 
               COUNT(*) FILTER (WHERE vote_type = 'downvote')
        FROM public.post_votes 
        WHERE post_id = NEW.post_id
      )
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET 
      upvote_count = (
        SELECT COUNT(*) FROM public.post_votes 
        WHERE post_id = OLD.post_id AND vote_type = 'upvote'
      ),
      downvote_count = (
        SELECT COUNT(*) FROM public.post_votes 
        WHERE post_id = OLD.post_id AND vote_type = 'downvote'
      ),
      vote_score = (
        SELECT COUNT(*) FILTER (WHERE vote_type = 'upvote') - 
               COUNT(*) FILTER (WHERE vote_type = 'downvote')
        FROM public.post_votes 
        WHERE post_id = OLD.post_id
      )
    WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update vote scores
DROP TRIGGER IF EXISTS trigger_update_post_vote_score ON public.post_votes;
CREATE TRIGGER trigger_update_post_vote_score
  AFTER INSERT OR UPDATE OR DELETE ON public.post_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_vote_score();

-- Function to update post comment count
CREATE OR REPLACE FUNCTION public.update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET comment_count = (
      SELECT COUNT(*) FROM public.post_comments 
      WHERE post_id = NEW.post_id AND deleted_at IS NULL
    )
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET comment_count = (
      SELECT COUNT(*) FROM public.post_comments 
      WHERE post_id = OLD.post_id AND deleted_at IS NULL
    )
    WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update comment count
DROP TRIGGER IF EXISTS trigger_update_post_comment_count ON public.post_comments;
CREATE TRIGGER trigger_update_post_comment_count
  AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_comment_count();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_posts_updated_at ON public.posts;
CREATE TRIGGER trigger_update_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_posts_updated_at();

-- ============================================================================
-- 5. STORAGE BUCKETS (if they don't exist)
-- ============================================================================

-- Note: Storage buckets are typically created via Supabase dashboard
-- But we can add policies here if needed

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Function to get trending posts
CREATE OR REPLACE FUNCTION public.get_trending_posts(
  limit_count INTEGER DEFAULT 20,
  community_id_param UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  profile_id UUID,
  community_id UUID,
  topic_id UUID,
  post_type TEXT,
  title TEXT,
  content TEXT,
  video_path TEXT,
  audio_path TEXT,
  link_url TEXT,
  vote_score INTEGER,
  comment_count INTEGER,
  view_count INTEGER,
  created_at TIMESTAMPTZ,
  profile_handle TEXT,
  profile_emoji_avatar TEXT,
  community_name TEXT,
  community_slug TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.profile_id,
    p.community_id,
    p.topic_id,
    p.post_type,
    p.title,
    p.content,
    p.video_path,
    p.audio_path,
    p.link_url,
    p.vote_score,
    p.comment_count,
    p.view_count,
    p.created_at,
    prof.handle AS profile_handle,
    prof.emoji_avatar AS profile_emoji_avatar,
    c.name AS community_name,
    c.slug AS community_slug
  FROM public.posts p
  LEFT JOIN public.profiles prof ON p.profile_id = prof.id
  LEFT JOIN public.communities c ON p.community_id = c.id
  WHERE p.status = 'live'
    AND p.visibility = 'public'
    AND p.deleted_at IS NULL
    AND (community_id_param IS NULL OR p.community_id = community_id_param)
  ORDER BY 
    -- Trending algorithm: balance between recency and engagement
    (p.vote_score * 2 + p.comment_count * 3 + p.view_count * 0.1) / 
    GREATEST(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600, 1) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_trending_posts TO authenticated, anon;

-- ============================================================================
-- 7. SAVED POSTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.saved_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, profile_id)
);

ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved posts"
ON public.saved_posts FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Users can save posts"
ON public.saved_posts FOR ALL
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- ============================================================================
-- 8. POST COMMENT VOTES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.post_comment_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID REFERENCES public.post_comments(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('upvote', 'downvote')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(comment_id, profile_id)
);

ALTER TABLE public.post_comment_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comment votes are viewable by everyone"
ON public.post_comment_votes FOR SELECT
USING (true);

CREATE POLICY "Users can vote on comments"
ON public.post_comment_votes FOR ALL
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Function to update comment vote scores
CREATE OR REPLACE FUNCTION public.update_post_comment_vote_score()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.post_comments
    SET 
      upvote_count = (
        SELECT COUNT(*) FROM public.post_comment_votes 
        WHERE comment_id = NEW.comment_id AND vote_type = 'upvote'
      ),
      downvote_count = (
        SELECT COUNT(*) FROM public.post_comment_votes 
        WHERE comment_id = NEW.comment_id AND vote_type = 'downvote'
      ),
      vote_score = (
        SELECT COUNT(*) FILTER (WHERE vote_type = 'upvote') - 
               COUNT(*) FILTER (WHERE vote_type = 'downvote')
        FROM public.post_comment_votes 
        WHERE comment_id = NEW.comment_id
      )
    WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.post_comments
    SET 
      upvote_count = (
        SELECT COUNT(*) FROM public.post_comment_votes 
        WHERE comment_id = OLD.comment_id AND vote_type = 'upvote'
      ),
      downvote_count = (
        SELECT COUNT(*) FROM public.post_comment_votes 
        WHERE comment_id = OLD.comment_id AND vote_type = 'downvote'
      ),
      vote_score = (
        SELECT COUNT(*) FILTER (WHERE vote_type = 'upvote') - 
               COUNT(*) FILTER (WHERE vote_type = 'downvote')
        FROM public.post_comment_votes 
        WHERE comment_id = OLD.comment_id
      )
    WHERE id = OLD.comment_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update comment vote scores
DROP TRIGGER IF EXISTS trigger_update_post_comment_vote_score ON public.post_comment_votes;
CREATE TRIGGER trigger_update_post_comment_vote_score
  AFTER INSERT OR UPDATE OR DELETE ON public.post_comment_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_comment_vote_score();

