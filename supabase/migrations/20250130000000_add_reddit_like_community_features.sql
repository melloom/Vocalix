-- Reddit-like Community Features
-- Adds voting, polls, flairs, crossposting, and enhanced community features

-- ============================================================================
-- 1. VOTING SYSTEM (Upvote/Downvote)
-- ============================================================================

-- Create clip_votes table for upvote/downvote system
CREATE TABLE IF NOT EXISTS public.clip_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('upvote', 'downvote')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(clip_id, profile_id)
);

ALTER TABLE public.clip_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Votes are viewable by everyone"
ON public.clip_votes FOR SELECT
USING (true);

CREATE POLICY "Users can vote on clips"
ON public.clip_votes FOR ALL
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Add vote_score to clips table
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS vote_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS upvote_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS downvote_count INTEGER DEFAULT 0;

-- Function to update clip vote scores
CREATE OR REPLACE FUNCTION public.update_clip_vote_score()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.clips
    SET 
      upvote_count = (
        SELECT COUNT(*) FROM public.clip_votes 
        WHERE clip_id = NEW.clip_id AND vote_type = 'upvote'
      ),
      downvote_count = (
        SELECT COUNT(*) FROM public.clip_votes 
        WHERE clip_id = NEW.clip_id AND vote_type = 'downvote'
      ),
      vote_score = (
        SELECT COUNT(*) FILTER (WHERE vote_type = 'upvote') - 
               COUNT(*) FILTER (WHERE vote_type = 'downvote')
        FROM public.clip_votes 
        WHERE clip_id = NEW.clip_id
      )
    WHERE id = NEW.clip_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.clips
    SET 
      upvote_count = (
        SELECT COUNT(*) FROM public.clip_votes 
        WHERE clip_id = OLD.clip_id AND vote_type = 'upvote'
      ),
      downvote_count = (
        SELECT COUNT(*) FROM public.clip_votes 
        WHERE clip_id = OLD.clip_id AND vote_type = 'downvote'
      ),
      vote_score = (
        SELECT COUNT(*) FILTER (WHERE vote_type = 'upvote') - 
               COUNT(*) FILTER (WHERE vote_type = 'downvote')
        FROM public.clip_votes 
        WHERE clip_id = OLD.clip_id
      )
    WHERE id = OLD.clip_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_clip_vote_score
  AFTER INSERT OR UPDATE OR DELETE ON public.clip_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_clip_vote_score();

-- Indexes for votes
CREATE INDEX IF NOT EXISTS idx_clip_votes_clip_id ON public.clip_votes(clip_id);
CREATE INDEX IF NOT EXISTS idx_clip_votes_profile_id ON public.clip_votes(profile_id);
CREATE INDEX IF NOT EXISTS idx_clips_vote_score ON public.clips(vote_score DESC);

-- ============================================================================
-- 2. CLIP FLAIRS (Like Reddit Post Flairs)
-- ============================================================================

-- Create clip_flairs table
CREATE TABLE IF NOT EXISTS public.clip_flairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#888888',
  background_color TEXT DEFAULT '#f0f0f0',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(community_id, name)
);

ALTER TABLE public.clip_flairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Flairs are viewable by everyone"
ON public.clip_flairs FOR SELECT
USING (true);

CREATE POLICY "Community moderators can manage flairs"
ON public.clip_flairs FOR ALL
USING (
  community_id IN (
    SELECT community_id FROM public.community_moderators
    WHERE moderator_profile_id IN (
      SELECT id FROM public.profiles 
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR community_id IN (
    SELECT id FROM public.communities
    WHERE created_by_profile_id IN (
      SELECT id FROM public.profiles 
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Add flair_id to clips
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS flair_id UUID REFERENCES public.clip_flairs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clips_flair_id ON public.clips(flair_id) WHERE flair_id IS NOT NULL;

-- ============================================================================
-- 3. COMMUNITY POLLS
-- ============================================================================

-- Create community_polls table
CREATE TABLE IF NOT EXISTS public.community_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE NOT NULL,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  options JSONB NOT NULL, -- Array of option objects: [{"id": "1", "text": "Option 1"}, ...]
  is_multiple_choice BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  is_closed BOOLEAN DEFAULT false,
  total_votes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.community_polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Polls are viewable by everyone"
ON public.community_polls FOR SELECT
USING (true);

CREATE POLICY "Community members can create polls"
ON public.community_polls FOR INSERT
WITH CHECK (
  created_by_profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  AND community_id IN (
    SELECT community_id FROM public.community_members
    WHERE profile_id IN (
      SELECT id FROM public.profiles 
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Create poll_votes table
CREATE TABLE IF NOT EXISTS public.poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID REFERENCES public.community_polls(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  option_id TEXT NOT NULL, -- References option id in poll.options JSONB
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(poll_id, profile_id, option_id)
);

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Poll votes are viewable by everyone"
ON public.poll_votes FOR SELECT
USING (true);

CREATE POLICY "Users can vote on polls"
ON public.poll_votes FOR ALL
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Function to update poll vote counts
CREATE OR REPLACE FUNCTION public.update_poll_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.community_polls
  SET 
    total_votes = (
      SELECT COUNT(DISTINCT profile_id) FROM public.poll_votes 
      WHERE poll_id = COALESCE(NEW.poll_id, OLD.poll_id)
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.poll_id, OLD.poll_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_poll_vote_count
  AFTER INSERT OR DELETE ON public.poll_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_poll_vote_count();

-- Indexes for polls
CREATE INDEX IF NOT EXISTS idx_community_polls_community ON public.community_polls(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON public.poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_profile ON public.poll_votes(profile_id);

-- ============================================================================
-- 4. CROSSPOSTING (Share clips between communities)
-- ============================================================================

-- Create crossposts table
CREATE TABLE IF NOT EXISTS public.crossposts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  crossposted_to_community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE NOT NULL,
  crossposted_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT, -- Optional custom title for crosspost
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(original_clip_id, crossposted_to_community_id)
);

ALTER TABLE public.crossposts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Crossposts are viewable by everyone"
ON public.crossposts FOR SELECT
USING (true);

CREATE POLICY "Community members can crosspost"
ON public.crossposts FOR INSERT
WITH CHECK (
  crossposted_by_profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  AND crossposted_to_community_id IN (
    SELECT community_id FROM public.community_members
    WHERE profile_id IN (
      SELECT id FROM public.profiles 
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Add crosspost_count to clips
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS crosspost_count INTEGER DEFAULT 0;

-- Function to update crosspost count
CREATE OR REPLACE FUNCTION public.update_crosspost_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.clips
    SET crosspost_count = (
      SELECT COUNT(*) FROM public.crossposts 
      WHERE original_clip_id = NEW.original_clip_id
    )
    WHERE id = NEW.original_clip_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.clips
    SET crosspost_count = (
      SELECT COUNT(*) FROM public.crossposts 
      WHERE original_clip_id = OLD.original_clip_id
    )
    WHERE id = OLD.original_clip_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_crosspost_count
  AFTER INSERT OR DELETE ON public.crossposts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_crosspost_count();

-- Indexes for crossposts
CREATE INDEX IF NOT EXISTS idx_crossposts_clip ON public.crossposts(original_clip_id);
CREATE INDEX IF NOT EXISTS idx_crossposts_community ON public.crossposts(crossposted_to_community_id, created_at DESC);

-- ============================================================================
-- 5. USER FLAIRS IN COMMUNITIES (Like Reddit User Flairs)
-- ============================================================================

-- Create user_flairs table
CREATE TABLE IF NOT EXISTS public.user_flairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  flair_text TEXT NOT NULL,
  flair_color TEXT DEFAULT '#000000',
  background_color TEXT DEFAULT '#f0f0f0',
  assigned_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(community_id, profile_id)
);

ALTER TABLE public.user_flairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User flairs are viewable by everyone"
ON public.user_flairs FOR SELECT
USING (true);

CREATE POLICY "Community moderators can assign user flairs"
ON public.user_flairs FOR ALL
USING (
  community_id IN (
    SELECT community_id FROM public.community_moderators
    WHERE moderator_profile_id IN (
      SELECT id FROM public.profiles 
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR community_id IN (
    SELECT id FROM public.communities
    WHERE created_by_profile_id IN (
      SELECT id FROM public.profiles 
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Indexes for user flairs
CREATE INDEX IF NOT EXISTS idx_user_flairs_community ON public.user_flairs(community_id);
CREATE INDEX IF NOT EXISTS idx_user_flairs_profile ON public.user_flairs(profile_id);

-- ============================================================================
-- 6. COMMUNITY WIKI/KNOWLEDGE BASE
-- ============================================================================

-- Create community_wiki_pages table
CREATE TABLE IF NOT EXISTS public.community_wiki_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revision_number INTEGER DEFAULT 1,
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(community_id, slug)
);

ALTER TABLE public.community_wiki_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wiki pages are viewable by everyone"
ON public.community_wiki_pages FOR SELECT
USING (true);

CREATE POLICY "Community moderators can manage wiki"
ON public.community_wiki_pages FOR ALL
USING (
  community_id IN (
    SELECT community_id FROM public.community_moderators
    WHERE moderator_profile_id IN (
      SELECT id FROM public.profiles 
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR community_id IN (
    SELECT id FROM public.communities
    WHERE created_by_profile_id IN (
      SELECT id FROM public.profiles 
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Create wiki_revisions table for history
CREATE TABLE IF NOT EXISTS public.community_wiki_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_page_id UUID REFERENCES public.community_wiki_pages(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  edited_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  edit_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.community_wiki_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wiki revisions are viewable by everyone"
ON public.community_wiki_revisions FOR SELECT
USING (true);

-- Indexes for wiki
CREATE INDEX IF NOT EXISTS idx_wiki_pages_community ON public.community_wiki_pages(community_id, slug);
CREATE INDEX IF NOT EXISTS idx_wiki_revisions_page ON public.community_wiki_revisions(wiki_page_id, revision_number DESC);

-- ============================================================================
-- 7. COMMUNITY-SPECIFIC SORTING
-- ============================================================================

-- Add community-specific sort preferences
ALTER TABLE public.communities
ADD COLUMN IF NOT EXISTS default_sort TEXT DEFAULT 'hot' CHECK (default_sort IN ('hot', 'new', 'top', 'controversial', 'rising'));

-- Function to get controversial clips (high upvotes AND downvotes)
CREATE OR REPLACE FUNCTION public.get_controversial_clips(
  p_community_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  clip_id UUID,
  controversy_score NUMERIC,
  clip_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as clip_id,
    LEAST(c.upvote_count, c.downvote_count)::NUMERIC / GREATEST(c.upvote_count + c.downvote_count, 1)::NUMERIC as controversy_score,
    jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'vote_score', c.vote_score,
      'upvote_count', c.upvote_count,
      'downvote_count', c.downvote_count,
      'created_at', c.created_at
    ) as clip_data
  FROM public.clips c
  WHERE c.status = 'live'
    AND (p_community_id IS NULL OR c.community_id = p_community_id)
    AND c.upvote_count > 0
    AND c.downvote_count > 0
  ORDER BY controversy_score DESC, c.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get rising clips (recent with high engagement velocity)
CREATE OR REPLACE FUNCTION public.get_rising_clips(
  p_community_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  clip_id UUID,
  rising_score NUMERIC,
  clip_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as clip_id,
    (
      (c.vote_score::NUMERIC / GREATEST(EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 3600, 1)) +
      (c.listens_count::NUMERIC / GREATEST(EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 3600, 1)) * 0.1
    ) as rising_score,
    jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'vote_score', c.vote_score,
      'listens_count', c.listens_count,
      'created_at', c.created_at
    ) as clip_data
  FROM public.clips c
  WHERE c.status = 'live'
    AND (p_community_id IS NULL OR c.community_id = p_community_id)
    AND c.created_at > NOW() - INTERVAL '24 hours'
  ORDER BY rising_score DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- 8. COMMUNITY AWARDS/RECOGNITIONS
-- ============================================================================

-- Create community_awards table
CREATE TABLE IF NOT EXISTS public.community_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  emoji TEXT NOT NULL,
  color TEXT DEFAULT '#FFD700',
  cost_points INTEGER DEFAULT 0, -- Cost in community points/karma
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.community_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Awards are viewable by everyone"
ON public.community_awards FOR SELECT
USING (true);

CREATE POLICY "Community moderators can manage awards"
ON public.community_awards FOR ALL
USING (
  community_id IN (
    SELECT community_id FROM public.community_moderators
    WHERE moderator_profile_id IN (
      SELECT id FROM public.profiles 
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR community_id IN (
    SELECT id FROM public.communities
    WHERE created_by_profile_id IN (
      SELECT id FROM public.profiles 
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Create clip_awards table (awards given to clips)
CREATE TABLE IF NOT EXISTS public.clip_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  award_id UUID REFERENCES public.community_awards(id) ON DELETE CASCADE NOT NULL,
  given_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clip_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clip awards are viewable by everyone"
ON public.clip_awards FOR SELECT
USING (true);

CREATE POLICY "Users can award clips"
ON public.clip_awards FOR INSERT
WITH CHECK (
  given_by_profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Indexes for awards
CREATE INDEX IF NOT EXISTS idx_community_awards_community ON public.community_awards(community_id);
CREATE INDEX IF NOT EXISTS idx_clip_awards_clip ON public.clip_awards(clip_id);
CREATE INDEX IF NOT EXISTS idx_clip_awards_award ON public.clip_awards(award_id);

-- ============================================================================
-- 9. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_controversial_clips(UUID, INTEGER, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_rising_clips(UUID, INTEGER, INTEGER) TO authenticated, anon;

-- ============================================================================
-- 10. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.clip_votes IS 'Upvote/downvote system for clips (Reddit-like voting)';
COMMENT ON TABLE public.clip_flairs IS 'Post flairs for clips in communities (like Reddit post flairs)';
COMMENT ON TABLE public.community_polls IS 'Polls created in communities';
COMMENT ON TABLE public.poll_votes IS 'Votes cast in community polls';
COMMENT ON TABLE public.crossposts IS 'Crossposting clips between communities';
COMMENT ON TABLE public.user_flairs IS 'User flairs in communities (like Reddit user flairs)';
COMMENT ON TABLE public.community_wiki_pages IS 'Wiki/knowledge base pages for communities';
COMMENT ON TABLE public.community_wiki_revisions IS 'Revision history for wiki pages';
COMMENT ON TABLE public.community_awards IS 'Awards/recognitions that can be given in communities';
COMMENT ON TABLE public.clip_awards IS 'Awards given to specific clips';

