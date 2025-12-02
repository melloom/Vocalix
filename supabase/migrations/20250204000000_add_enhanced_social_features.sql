-- Enhanced Social Features Migration
-- Implements: Mention Analytics, Co-create Clips, Group Challenges, Community Projects, Social Discovery, Network Effects

-- ============================================================================
-- PART 1: MENTION ANALYTICS
-- ============================================================================

-- Create mentions tracking table for analytics
CREATE TABLE IF NOT EXISTS public.mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentioned_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  mentioner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  mention_source TEXT NOT NULL CHECK (mention_source IN ('clip_title', 'clip_summary', 'clip_captions', 'comment')),
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Ensure at least one of clip_id or comment_id is set
  CONSTRAINT mentions_content_check CHECK (
    (clip_id IS NOT NULL AND comment_id IS NULL) OR 
    (clip_id IS NULL AND comment_id IS NOT NULL)
  )
);

-- Indexes for mention analytics
CREATE INDEX IF NOT EXISTS idx_mentions_mentioned_profile ON public.mentions(mentioned_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentions_mentioner_profile ON public.mentions(mentioner_profile_id);
CREATE INDEX IF NOT EXISTS idx_mentions_clip ON public.mentions(clip_id) WHERE clip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mentions_comment ON public.mentions(comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mentions_created_at ON public.mentions(created_at DESC);

-- Enable RLS
ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

-- Mentions are viewable by everyone
CREATE POLICY "Mentions are viewable by everyone"
ON public.mentions FOR SELECT
USING (true);

-- Function to get mention analytics for a profile
CREATE OR REPLACE FUNCTION public.get_mention_analytics(
  p_profile_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  total_mentions BIGINT,
  mentions_by_clip BIGINT,
  mentions_by_comment BIGINT,
  unique_mentioners BIGINT,
  top_mentioners JSONB,
  mentions_over_time JSONB,
  most_mentioned_clips JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH mention_stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(DISTINCT CASE WHEN clip_id IS NOT NULL THEN clip_id END) as clip_count,
      COUNT(DISTINCT CASE WHEN comment_id IS NOT NULL THEN comment_id END) as comment_count,
      COUNT(DISTINCT mentioner_profile_id) as mentioner_count
    FROM public.mentions
    WHERE mentioned_profile_id = p_profile_id
      AND created_at >= NOW() - (p_days || ' days')::INTERVAL
  ),
  top_mentioners_data AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'profile_id', mentioner_profile_id,
        'handle', p.handle,
        'emoji_avatar', p.emoji_avatar,
        'mention_count', mention_count
      ) ORDER BY mention_count DESC
    ) as data
    FROM (
      SELECT 
        mentioner_profile_id,
        COUNT(*) as mention_count
      FROM public.mentions
      WHERE mentioned_profile_id = p_profile_id
        AND created_at >= NOW() - (p_days || ' days')::INTERVAL
        AND mentioner_profile_id IS NOT NULL
      GROUP BY mentioner_profile_id
      ORDER BY mention_count DESC
      LIMIT 10
    ) m
    LEFT JOIN public.profiles p ON p.id = m.mentioner_profile_id
  ),
  mentions_time_series AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'date', date_trunc('day', created_at)::DATE,
        'count', mention_count
      ) ORDER BY date_trunc('day', created_at)
    ) as data
    FROM (
      SELECT 
        created_at,
        COUNT(*) as mention_count
      FROM public.mentions
      WHERE mentioned_profile_id = p_profile_id
        AND created_at >= NOW() - (p_days || ' days')::INTERVAL
      GROUP BY date_trunc('day', created_at)
    ) t
  ),
  top_clips_data AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'clip_id', clip_id,
        'title', c.title,
        'mention_count', mention_count
      ) ORDER BY mention_count DESC
    ) as data
    FROM (
      SELECT 
        clip_id,
        COUNT(*) as mention_count
      FROM public.mentions
      WHERE mentioned_profile_id = p_profile_id
        AND clip_id IS NOT NULL
        AND created_at >= NOW() - (p_days || ' days')::INTERVAL
      GROUP BY clip_id
      ORDER BY mention_count DESC
      LIMIT 10
    ) m
    LEFT JOIN public.clips c ON c.id = m.clip_id
  )
  SELECT 
    ms.total as total_mentions,
    ms.clip_count as mentions_by_clip,
    ms.comment_count as mentions_by_comment,
    ms.mentioner_count as unique_mentioners,
    COALESCE(tmd.data, '[]'::jsonb) as top_mentioners,
    COALESCE(mts.data, '[]'::jsonb) as mentions_over_time,
    COALESCE(tcd.data, '[]'::jsonb) as most_mentioned_clips
  FROM mention_stats ms
  CROSS JOIN LATERAL (SELECT data FROM top_mentioners_data) tmd
  CROSS JOIN LATERAL (SELECT data FROM mentions_time_series) mts
  CROSS JOIN LATERAL (SELECT data FROM top_clips_data) tcd;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_mention_analytics TO authenticated, anon;

-- Trigger to track mentions when they're created
CREATE OR REPLACE FUNCTION public.track_mention()
RETURNS TRIGGER AS $$
DECLARE
  v_mention_handle TEXT;
  v_mentioned_profile_id UUID;
  v_mentions TEXT[];
  v_text_content TEXT;
BEGIN
  -- Determine text content based on source
  IF TG_TABLE_NAME = 'clips' THEN
    v_text_content := COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.captions, '');
    v_mentions := public.extract_mentions(v_text_content);
    
    -- Track each mention
    FOREACH v_mention_handle IN ARRAY v_mentions
    LOOP
      SELECT id INTO v_mentioned_profile_id
      FROM public.profiles
      WHERE handle = v_mention_handle;
      
      IF v_mentioned_profile_id IS NOT NULL AND v_mentioned_profile_id != NEW.profile_id THEN
        -- Determine mention source
        INSERT INTO public.mentions (
          mentioned_profile_id,
          mentioner_profile_id,
          clip_id,
          mention_source
        ) VALUES (
          v_mentioned_profile_id,
          NEW.profile_id,
          NEW.id,
          CASE 
            WHEN NEW.title LIKE '%@' || v_mention_handle || '%' THEN 'clip_title'
            WHEN NEW.summary LIKE '%@' || v_mention_handle || '%' THEN 'clip_summary'
            WHEN NEW.captions LIKE '%@' || v_mention_handle || '%' THEN 'clip_captions'
            ELSE 'clip_captions'
          END
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  ELSIF TG_TABLE_NAME = 'comments' THEN
    v_mentions := public.extract_mentions(NEW.content);
    
    FOREACH v_mention_handle IN ARRAY v_mentions
    LOOP
      SELECT id INTO v_mentioned_profile_id
      FROM public.profiles
      WHERE handle = v_mention_handle;
      
      IF v_mentioned_profile_id IS NOT NULL AND v_mentioned_profile_id != NEW.profile_id THEN
        INSERT INTO public.mentions (
          mentioned_profile_id,
          mentioner_profile_id,
          comment_id,
          mention_source
        ) VALUES (
          v_mentioned_profile_id,
          NEW.profile_id,
          NEW.id,
          'comment'
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for mention tracking
DROP TRIGGER IF EXISTS trigger_track_mention_clips ON public.clips;
CREATE TRIGGER trigger_track_mention_clips
  AFTER INSERT OR UPDATE OF title, summary, captions ON public.clips
  FOR EACH ROW
  WHEN (NEW.status = 'live' AND (NEW.title IS NOT NULL OR NEW.summary IS NOT NULL OR NEW.captions IS NOT NULL))
  EXECUTE FUNCTION public.track_mention();

DROP TRIGGER IF EXISTS trigger_track_mention_comments ON public.comments;
CREATE TRIGGER trigger_track_mention_comments
  AFTER INSERT OR UPDATE OF content ON public.comments
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL AND NEW.content IS NOT NULL)
  EXECUTE FUNCTION public.track_mention();

-- ============================================================================
-- PART 2: CO-CREATE CLIPS (Multiple users record together)
-- ============================================================================

-- Create clip_collaborators table for co-created clips
CREATE TABLE IF NOT EXISTS public.clip_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'contributor' CHECK (role IN ('creator', 'contributor')),
  audio_segment_start NUMERIC DEFAULT 0, -- Start time in seconds for this contributor's segment
  audio_segment_end NUMERIC, -- End time in seconds (NULL means end of clip)
  contribution_percentage NUMERIC DEFAULT 0, -- Percentage of total clip duration
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(clip_id, profile_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clip_collaborators_clip ON public.clip_collaborators(clip_id);
CREATE INDEX IF NOT EXISTS idx_clip_collaborators_profile ON public.clip_collaborators(profile_id);

-- Enable RLS
ALTER TABLE public.clip_collaborators ENABLE ROW LEVEL SECURITY;

-- Collaborators are viewable by everyone
CREATE POLICY "Clip collaborators are viewable by everyone"
ON public.clip_collaborators FOR SELECT
USING (true);

-- Users can add themselves as collaborators to clips they own or are invited to
CREATE POLICY "Clip collaborators insertable by clip owner or invitee"
ON public.clip_collaborators FOR INSERT
WITH CHECK (
  clip_id IN (
    SELECT id FROM public.clips
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Add co_created_clip_id to clips table to link collaborative clips
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS is_co_created BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS co_created_with_clip_id UUID REFERENCES public.clips(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clips_co_created ON public.clips(is_co_created) WHERE is_co_created = true;
CREATE INDEX IF NOT EXISTS idx_clips_co_created_with ON public.clips(co_created_with_clip_id) WHERE co_created_with_clip_id IS NOT NULL;

-- Function to get clip collaborators
CREATE OR REPLACE FUNCTION public.get_clip_collaborators(p_clip_id UUID)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  role TEXT,
  contribution_percentage NUMERIC,
  audio_segment_start NUMERIC,
  audio_segment_end NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cc.profile_id,
    p.handle,
    p.emoji_avatar,
    cc.role,
    cc.contribution_percentage,
    cc.audio_segment_start,
    cc.audio_segment_end
  FROM public.clip_collaborators cc
  JOIN public.profiles p ON p.id = cc.profile_id
  WHERE cc.clip_id = p_clip_id
  ORDER BY cc.role DESC, cc.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_clip_collaborators TO authenticated, anon;

-- ============================================================================
-- PART 3: GROUP CHALLENGES (Team-based challenges)
-- ============================================================================

-- Create challenge_teams table
CREATE TABLE IF NOT EXISTS public.challenge_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID REFERENCES public.challenges(id) ON DELETE CASCADE NOT NULL,
  team_name TEXT NOT NULL,
  team_description TEXT,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  max_members INTEGER DEFAULT 10,
  current_member_count INTEGER DEFAULT 0,
  total_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create challenge_team_members table
CREATE TABLE IF NOT EXISTS public.challenge_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.challenge_teams(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  contribution_score NUMERIC DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_id, profile_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_challenge_teams_challenge ON public.challenge_teams(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_team_members_team ON public.challenge_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_challenge_team_members_profile ON public.challenge_team_members(profile_id);

-- Enable RLS
ALTER TABLE public.challenge_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_team_members ENABLE ROW LEVEL SECURITY;

-- Teams are viewable by everyone
CREATE POLICY "Challenge teams are viewable by everyone"
ON public.challenge_teams FOR SELECT
USING (true);

CREATE POLICY "Challenge team members are viewable by everyone"
ON public.challenge_team_members FOR SELECT
USING (true);

-- Users can create teams
CREATE POLICY "Challenge teams insertable by authenticated users"
ON public.challenge_teams FOR INSERT
WITH CHECK (true);

-- Users can join teams
CREATE POLICY "Challenge team members insertable by authenticated users"
ON public.challenge_team_members FOR INSERT
WITH CHECK (true);

-- Link clips to challenge teams
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS challenge_team_id UUID REFERENCES public.challenge_teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clips_challenge_team ON public.clips(challenge_team_id) WHERE challenge_team_id IS NOT NULL;

-- Function to update team score when clip is created
CREATE OR REPLACE FUNCTION public.update_challenge_team_score()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.challenge_team_id IS NOT NULL AND NEW.status = 'live' THEN
    UPDATE public.challenge_teams
    SET 
      total_score = total_score + (
        COALESCE(NEW.listens_count, 0) * 0.1 +
        COALESCE((SELECT SUM((value::text)::int) FROM jsonb_each_text(NEW.reactions)), 0) * 2 +
        COALESCE((SELECT COUNT(*) FROM public.comments WHERE clip_id = NEW.id), 0) * 1
      ),
      updated_at = NOW()
    WHERE id = NEW.challenge_team_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_challenge_team_score ON public.clips;
CREATE TRIGGER trigger_update_challenge_team_score
  AFTER UPDATE OF status, listens_count, reactions ON public.clips
  FOR EACH ROW
  WHEN (NEW.challenge_team_id IS NOT NULL)
  EXECUTE FUNCTION public.update_challenge_team_score();

-- Function to get challenge team leaderboard
CREATE OR REPLACE FUNCTION public.get_challenge_team_leaderboard(
  p_challenge_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  rank INTEGER,
  team_id UUID,
  team_name TEXT,
  member_count INTEGER,
  total_score NUMERIC,
  top_contributor_handle TEXT,
  top_contributor_emoji TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH ranked_teams AS (
    SELECT 
      ct.id,
      ct.team_name,
      ct.current_member_count,
      ct.total_score,
      ROW_NUMBER() OVER (ORDER BY ct.total_score DESC, ct.created_at ASC) as rn
    FROM public.challenge_teams ct
    WHERE ct.challenge_id = p_challenge_id
  ),
  top_contributors AS (
    SELECT DISTINCT ON (ctm.team_id)
      ctm.team_id,
      p.handle,
      p.emoji_avatar
    FROM public.challenge_team_members ctm
    JOIN public.profiles p ON p.id = ctm.profile_id
    WHERE ctm.team_id IN (SELECT id FROM ranked_teams)
    ORDER BY ctm.team_id, ctm.contribution_score DESC
  )
  SELECT 
    rt.rn::INTEGER,
    rt.id,
    rt.team_name,
    rt.current_member_count::INTEGER,
    rt.total_score,
    tc.handle,
    tc.emoji_avatar
  FROM ranked_teams rt
  LEFT JOIN top_contributors tc ON tc.team_id = rt.id
  WHERE rt.rn <= p_limit
  ORDER BY rt.rn;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_challenge_team_leaderboard TO authenticated, anon;

-- ============================================================================
-- PART 4: COMMUNITY PROJECTS (Community-wide collaborations)
-- ============================================================================

-- Create community_projects table
CREATE TABLE IF NOT EXISTS public.community_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  project_type TEXT NOT NULL DEFAULT 'collaborative' CHECK (project_type IN ('collaborative', 'contest', 'event', 'collection')),
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planning', 'active', 'completed', 'cancelled')),
  start_date TIMESTAMPTZ DEFAULT now(),
  end_date TIMESTAMPTZ,
  participant_count INTEGER DEFAULT 0,
  submission_count INTEGER DEFAULT 0,
  goal_description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create community_project_participants table
CREATE TABLE IF NOT EXISTS public.community_project_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.community_projects(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('organizer', 'contributor', 'participant')),
  contribution_count INTEGER DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, profile_id)
);

-- Link clips to community projects
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS community_project_id UUID REFERENCES public.community_projects(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_community_projects_community ON public.community_projects(community_id);
CREATE INDEX IF NOT EXISTS idx_community_projects_status ON public.community_projects(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_community_project_participants_project ON public.community_project_participants(project_id);
CREATE INDEX IF NOT EXISTS idx_community_project_participants_profile ON public.community_project_participants(profile_id);
CREATE INDEX IF NOT EXISTS idx_clips_community_project ON public.clips(community_project_id) WHERE community_project_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.community_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_project_participants ENABLE ROW LEVEL SECURITY;

-- Projects are viewable by everyone
CREATE POLICY "Community projects are viewable by everyone"
ON public.community_projects FOR SELECT
USING (true);

CREATE POLICY "Community project participants are viewable by everyone"
ON public.community_project_participants FOR SELECT
USING (true);

-- Community members can create projects
CREATE POLICY "Community projects insertable by community members"
ON public.community_projects FOR INSERT
WITH CHECK (true);

-- Users can join projects
CREATE POLICY "Community project participants insertable by authenticated users"
ON public.community_project_participants FOR INSERT
WITH CHECK (true);

-- Function to update project stats
CREATE OR REPLACE FUNCTION public.update_community_project_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.community_project_id IS NOT NULL AND NEW.status = 'live' THEN
    -- Update submission count
    UPDATE public.community_projects
    SET 
      submission_count = (
        SELECT COUNT(*) FROM public.clips
        WHERE community_project_id = NEW.community_project_id
          AND status = 'live'
      ),
      updated_at = NOW()
    WHERE id = NEW.community_project_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_community_project_stats ON public.clips;
CREATE TRIGGER trigger_update_community_project_stats
  AFTER INSERT OR UPDATE OF status ON public.clips
  FOR EACH ROW
  WHEN (NEW.community_project_id IS NOT NULL)
  EXECUTE FUNCTION public.update_community_project_stats();

-- ============================================================================
-- PART 5: SOCIAL DISCOVERY ENHANCEMENTS
-- ============================================================================

-- Function to get mutual connections between two users
CREATE OR REPLACE FUNCTION public.get_mutual_connections(
  p_profile_id_1 UUID,
  p_profile_id_2 UUID
)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  mutual_followers_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.handle,
    p.emoji_avatar,
    COUNT(*)::INTEGER as mutual_count
  FROM public.follows f1
  JOIN public.follows f2 ON f1.following_id = f2.following_id
  JOIN public.profiles p ON p.id = f1.following_id
  WHERE f1.follower_id = p_profile_id_1
    AND f2.follower_id = p_profile_id_2
    AND f1.following_id != p_profile_id_1
    AND f1.following_id != p_profile_id_2
  GROUP BY p.id, p.handle, p.emoji_avatar
  ORDER BY mutual_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_mutual_connections TO authenticated, anon;

-- Function to get friends of friends (2nd degree connections)
CREATE OR REPLACE FUNCTION public.get_friends_of_friends(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  mutual_connections_count INTEGER,
  connection_path JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH friends AS (
    SELECT following_id
    FROM public.follows
    WHERE follower_id = p_profile_id
  ),
  friends_of_friends AS (
    SELECT DISTINCT
      f2.following_id,
      COUNT(DISTINCT f2.follower_id) as mutual_count,
      jsonb_agg(DISTINCT jsonb_build_object('via', p.handle, 'via_id', p.id)) as path
    FROM public.follows f2
    JOIN friends f1 ON f2.follower_id = f1.following_id
    JOIN public.profiles p ON p.id = f2.follower_id
    WHERE f2.following_id NOT IN (SELECT following_id FROM friends)
      AND f2.following_id != p_profile_id
    GROUP BY f2.following_id
  )
  SELECT 
    fof.following_id,
    p.handle,
    p.emoji_avatar,
    fof.mutual_count::INTEGER,
    fof.path
  FROM friends_of_friends fof
  JOIN public.profiles p ON p.id = fof.following_id
  ORDER BY fof.mutual_count DESC, p.handle
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_friends_of_friends TO authenticated, anon;

-- Function to get social graph data for visualization
CREATE OR REPLACE FUNCTION public.get_social_graph(
  p_profile_id UUID,
  p_depth INTEGER DEFAULT 2,
  p_limit INTEGER DEFAULT 50
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH RECURSIVE social_network AS (
    -- Start with the user
    SELECT 
      p_profile_id as profile_id,
      0 as depth,
      ARRAY[p_profile_id]::UUID[] as path
    UNION ALL
    -- Get connections at each depth
    SELECT 
      f.following_id,
      sn.depth + 1,
      sn.path || f.following_id
    FROM public.follows f
    JOIN social_network sn ON f.follower_id = sn.profile_id
    WHERE sn.depth < p_depth
      AND f.following_id != ALL(sn.path) -- Prevent cycles
  ),
  nodes AS (
    SELECT DISTINCT
      jsonb_build_object(
        'id', p.id::TEXT,
        'handle', p.handle,
        'emoji_avatar', p.emoji_avatar,
        'depth', sn.depth
      ) as node
    FROM social_network sn
    JOIN public.profiles p ON p.id = sn.profile_id
    LIMIT p_limit
  ),
  edges AS (
    SELECT DISTINCT
      jsonb_build_object(
        'source', f.follower_id::TEXT,
        'target', f.following_id::TEXT
      ) as edge
    FROM public.follows f
    WHERE f.follower_id IN (SELECT profile_id FROM social_network)
      AND f.following_id IN (SELECT profile_id FROM social_network)
  )
  SELECT jsonb_build_object(
    'nodes', (SELECT jsonb_agg(node) FROM nodes),
    'edges', (SELECT jsonb_agg(edge) FROM edges)
  ) INTO v_result;
  
  RETURN COALESCE(v_result, '{"nodes": [], "edges": []}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_social_graph TO authenticated, anon;

-- ============================================================================
-- PART 6: NETWORK EFFECTS TRACKING
-- ============================================================================

-- Create network_effects table to track network growth and connections
CREATE TABLE IF NOT EXISTS public.network_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  mutual_connections_count INTEGER DEFAULT 0,
  second_degree_connections INTEGER DEFAULT 0,
  network_growth_rate NUMERIC DEFAULT 0,
  engagement_from_network NUMERIC DEFAULT 0, -- Engagement from connections
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_network_effects_profile ON public.network_effects(profile_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_network_effects_date ON public.network_effects(date DESC);

-- Enable RLS
ALTER TABLE public.network_effects ENABLE ROW LEVEL SECURITY;

-- Network effects are viewable by profile owner
CREATE POLICY "Network effects viewable by profile owner"
ON public.network_effects FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Function to calculate and store network effects
CREATE OR REPLACE FUNCTION public.calculate_network_effects(
  p_profile_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID AS $$
DECLARE
  v_follower_count INTEGER;
  v_following_count INTEGER;
  v_mutual_count INTEGER;
  v_second_degree INTEGER;
  v_previous_follower_count INTEGER;
  v_growth_rate NUMERIC;
  v_engagement NUMERIC;
BEGIN
  -- Get current counts
  SELECT COUNT(*) INTO v_follower_count
  FROM public.follows
  WHERE following_id = p_profile_id;
  
  SELECT COUNT(*) INTO v_following_count
  FROM public.follows
  WHERE follower_id = p_profile_id;
  
  -- Get mutual connections (simplified - users who follow each other)
  SELECT COUNT(*) INTO v_mutual_count
  FROM public.follows f1
  JOIN public.follows f2 ON f1.follower_id = f2.following_id AND f1.following_id = f2.follower_id
  WHERE f1.follower_id = p_profile_id OR f1.following_id = p_profile_id;
  
  -- Get second degree connections
  SELECT COUNT(DISTINCT f2.following_id) INTO v_second_degree
  FROM public.follows f1
  JOIN public.follows f2 ON f2.follower_id = f1.following_id
  WHERE f1.follower_id = p_profile_id
    AND f2.following_id != p_profile_id
    AND f2.following_id NOT IN (SELECT following_id FROM public.follows WHERE follower_id = p_profile_id);
  
  -- Get previous day's follower count for growth rate
  SELECT follower_count INTO v_previous_follower_count
  FROM public.network_effects
  WHERE profile_id = p_profile_id
    AND date = p_date - INTERVAL '1 day';
  
  -- Calculate growth rate
  IF v_previous_follower_count > 0 THEN
    v_growth_rate := ((v_follower_count - v_previous_follower_count)::NUMERIC / v_previous_follower_count) * 100;
  ELSE
    v_growth_rate := CASE WHEN v_follower_count > 0 THEN 100 ELSE 0 END;
  END IF;
  
  -- Calculate engagement from network (simplified - reactions from followers)
  SELECT COALESCE(SUM(
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM public.follows f 
        WHERE f.following_id = c.profile_id 
          AND f.follower_id = p_profile_id
      ) THEN (
        COALESCE((SELECT SUM((value::text)::int) FROM jsonb_each_text(c.reactions)), 0) +
        COALESCE(c.listens_count, 0) * 0.1
      )
      ELSE 0
    END
  ), 0) INTO v_engagement
  FROM public.clips c
  WHERE c.profile_id IN (
    SELECT following_id FROM public.follows WHERE follower_id = p_profile_id
  )
  AND c.created_at >= p_date - INTERVAL '7 days';
  
  -- Insert or update network effects
  INSERT INTO public.network_effects (
    profile_id,
    date,
    follower_count,
    following_count,
    mutual_connections_count,
    second_degree_connections,
    network_growth_rate,
    engagement_from_network
  ) VALUES (
    p_profile_id,
    p_date,
    v_follower_count,
    v_following_count,
    v_mutual_count,
    v_second_degree,
    v_growth_rate,
    v_engagement
  )
  ON CONFLICT (profile_id, date)
  DO UPDATE SET
    follower_count = EXCLUDED.follower_count,
    following_count = EXCLUDED.following_count,
    mutual_connections_count = EXCLUDED.mutual_connections_count,
    second_degree_connections = EXCLUDED.second_degree_connections,
    network_growth_rate = EXCLUDED.network_growth_rate,
    engagement_from_network = EXCLUDED.engagement_from_network;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.calculate_network_effects TO authenticated, anon;

-- Function to get network effects analytics
CREATE OR REPLACE FUNCTION public.get_network_effects_analytics(
  p_profile_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  current_followers INTEGER,
  current_following INTEGER,
  mutual_connections INTEGER,
  second_degree_connections INTEGER,
  growth_rate NUMERIC,
  engagement_from_network NUMERIC,
  network_growth_trend JSONB,
  top_network_contributors JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_stats AS (
    SELECT *
    FROM public.network_effects
    WHERE profile_id = p_profile_id
    ORDER BY date DESC
    LIMIT 1
  ),
  growth_trend AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'date', date,
        'follower_count', follower_count,
        'growth_rate', network_growth_rate
      ) ORDER BY date
    ) as data
    FROM public.network_effects
    WHERE profile_id = p_profile_id
      AND date >= CURRENT_DATE - (p_days || ' days')::INTERVAL
  ),
  top_contributors AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'profile_id', p.id,
        'handle', p.handle,
        'emoji_avatar', p.emoji_avatar,
        'engagement_score', engagement_score
      ) ORDER BY engagement_score DESC
    ) as data
    FROM (
      SELECT 
        c.profile_id,
        SUM(
          COALESCE((SELECT SUM((value::text)::int) FROM jsonb_each_text(c.reactions)), 0) +
          COALESCE(c.listens_count, 0) * 0.1
        ) as engagement_score
      FROM public.clips c
      WHERE c.profile_id IN (
        SELECT following_id FROM public.follows WHERE follower_id = p_profile_id
      )
      AND c.created_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
      GROUP BY c.profile_id
      ORDER BY engagement_score DESC
      LIMIT 10
    ) ec
    JOIN public.profiles p ON p.id = ec.profile_id
  )
  SELECT 
    COALESCE(ls.follower_count, 0)::INTEGER,
    COALESCE(ls.following_count, 0)::INTEGER,
    COALESCE(ls.mutual_connections_count, 0)::INTEGER,
    COALESCE(ls.second_degree_connections, 0)::INTEGER,
    COALESCE(ls.network_growth_rate, 0),
    COALESCE(ls.engagement_from_network, 0),
    COALESCE(gt.data, '[]'::jsonb),
    COALESCE(tc.data, '[]'::jsonb)
  FROM latest_stats ls
  CROSS JOIN LATERAL (SELECT data FROM growth_trend) gt
  CROSS JOIN LATERAL (SELECT data FROM top_contributors) tc;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_network_effects_analytics TO authenticated, anon;

-- Comments for documentation
COMMENT ON TABLE public.mentions IS 'Tracks all @mentions for analytics purposes';
COMMENT ON TABLE public.clip_collaborators IS 'Tracks users who co-created a clip together';
COMMENT ON TABLE public.challenge_teams IS 'Teams for group-based challenges';
COMMENT ON TABLE public.community_projects IS 'Community-wide collaborative projects';
COMMENT ON TABLE public.network_effects IS 'Tracks network growth and connection metrics over time';

