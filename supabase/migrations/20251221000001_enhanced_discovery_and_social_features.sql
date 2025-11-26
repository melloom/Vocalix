-- Enhanced Discovery & Social Features Migration
-- This migration adds ML-based recommendations, friends system, group chats, and mentions

-- ============================================================================
-- PART 1: ENHANCED DISCOVERY & RECOMMENDATIONS
-- ============================================================================

-- Table for storing clip similarity scores (for "Because you listened to..." recommendations)
CREATE TABLE IF NOT EXISTS public.clip_similarities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  similar_clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  similarity_score NUMERIC(5,4) NOT NULL DEFAULT 0.0,
  similarity_type TEXT NOT NULL DEFAULT 'content', -- 'content', 'voice', 'style', 'topic'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(clip_id, similar_clip_id, similarity_type),
  CHECK (clip_id != similar_clip_id),
  CHECK (similarity_score >= 0 AND similarity_score <= 1)
);

CREATE INDEX IF NOT EXISTS idx_clip_similarities_clip_id ON public.clip_similarities(clip_id, similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_clip_similarities_type ON public.clip_similarities(similarity_type);

-- Table for user listening patterns (for ML-based recommendations)
CREATE TABLE IF NOT EXISTS public.user_listening_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  completion_percentage NUMERIC(5,2) NOT NULL,
  listen_duration_seconds INT NOT NULL,
  skipped BOOLEAN DEFAULT false,
  skipped_at_seconds INT,
  reacted BOOLEAN DEFAULT false,
  shared BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, clip_id)
);

CREATE INDEX IF NOT EXISTS idx_listening_patterns_profile ON public.user_listening_patterns(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listening_patterns_clip ON public.user_listening_patterns(clip_id);

-- Table for topic-based auto-playlists
CREATE TABLE IF NOT EXISTS public.auto_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  playlist_type TEXT NOT NULL DEFAULT 'topic', -- 'topic', 'similar_voice', 'trending', 'personalized'
  is_active BOOLEAN DEFAULT true,
  clip_count INT DEFAULT 0,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_playlists_profile ON public.auto_playlists(profile_id, is_active);
CREATE INDEX IF NOT EXISTS idx_auto_playlists_topic ON public.auto_playlists(topic_id);

-- Junction table for auto-playlist clips
CREATE TABLE IF NOT EXISTS public.auto_playlist_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auto_playlist_id UUID NOT NULL REFERENCES public.auto_playlists(id) ON DELETE CASCADE,
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  position INT NOT NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(auto_playlist_id, clip_id)
);

CREATE INDEX IF NOT EXISTS idx_auto_playlist_clips_playlist ON public.auto_playlist_clips(auto_playlist_id, position);

-- ============================================================================
-- PART 2: FRIENDS SYSTEM (Separate from follows)
-- ============================================================================

-- Friends table (mutual relationships, separate from follows)
CREATE TABLE IF NOT EXISTS public.friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id_1 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  profile_id_2 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'blocked'
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(profile_id_1, profile_id_2),
  CHECK (profile_id_1 != profile_id_2),
  CHECK (requested_by = profile_id_1 OR requested_by = profile_id_2)
);

CREATE INDEX IF NOT EXISTS idx_friends_profile1 ON public.friends(profile_id_1, status);
CREATE INDEX IF NOT EXISTS idx_friends_profile2 ON public.friends(profile_id_2, status);
CREATE INDEX IF NOT EXISTS idx_friends_status ON public.friends(status);

-- Enable RLS
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

-- Friends readable by participants
CREATE POLICY "Friends readable by participants"
ON public.friends FOR SELECT
USING (
  profile_id_1 IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR profile_id_2 IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Friends insertable by requester
CREATE POLICY "Friends insertable by requester"
ON public.friends FOR INSERT
WITH CHECK (
  requested_by IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Friends updatable by recipient
CREATE POLICY "Friends updatable by recipient"
ON public.friends FOR UPDATE
USING (
  (status = 'pending' AND (
    (requested_by != profile_id_1 AND profile_id_1 IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    ))
    OR (requested_by != profile_id_2 AND profile_id_2 IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    ))
  ))
  OR (profile_id_1 IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ) OR profile_id_2 IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ))
);

-- ============================================================================
-- PART 3: GROUP CHATS
-- ============================================================================

-- Group chats table
CREATE TABLE IF NOT EXISTS public.group_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  avatar_emoji TEXT DEFAULT '💬',
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_private BOOLEAN DEFAULT false,
  max_members INT DEFAULT 50,
  member_count INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_chats_created_by ON public.group_chats(created_by);

-- Group chat members
CREATE TABLE IF NOT EXISTS public.group_chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_chat_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- 'admin', 'moderator', 'member'
  joined_at TIMESTAMPTZ DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  UNIQUE(group_chat_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_group_chat_members_group ON public.group_chat_members(group_chat_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_members_profile ON public.group_chat_members(profile_id);

-- Group chat messages (voice + text)
CREATE TABLE IF NOT EXISTS public.group_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_chat_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'voice', 'system'
  content TEXT,
  audio_path TEXT,
  duration_seconds INT,
  transcript TEXT,
  reply_to_message_id UUID REFERENCES public.group_chat_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_chat_messages_group ON public.group_chat_messages(group_chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_chat_messages_sender ON public.group_chat_messages(sender_id);

-- Enable RLS for group chats
ALTER TABLE public.group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_messages ENABLE ROW LEVEL SECURITY;

-- Group chats readable by members
CREATE POLICY "Group chats readable by members"
ON public.group_chats FOR SELECT
USING (
  id IN (
    SELECT group_chat_id FROM public.group_chat_members
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Group chat members readable by members
CREATE POLICY "Group chat members readable by members"
ON public.group_chat_members FOR SELECT
USING (
  group_chat_id IN (
    SELECT group_chat_id FROM public.group_chat_members
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Group chat messages readable by members
CREATE POLICY "Group chat messages readable by members"
ON public.group_chat_messages FOR SELECT
USING (
  group_chat_id IN (
    SELECT group_chat_id FROM public.group_chat_members
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- ============================================================================
-- PART 4: COLLABORATIVE PLAYLISTS
-- ============================================================================

-- Add collaborator support to playlists
ALTER TABLE public.playlists 
ADD COLUMN IF NOT EXISTS is_collaborative BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS allow_anyone_to_add BOOLEAN DEFAULT false;

-- Playlist collaborators table
CREATE TABLE IF NOT EXISTS public.playlist_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'collaborator', -- 'owner', 'editor', 'collaborator'
  added_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(playlist_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_playlist_collaborators_playlist ON public.playlist_collaborators(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_collaborators_profile ON public.playlist_collaborators(profile_id);

-- ============================================================================
-- PART 5: MENTIONS IN CLIPS
-- ============================================================================

-- Mentions table (for @username mentions in clips)
CREATE TABLE IF NOT EXISTS public.mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  mentioned_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentioned_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  context_text TEXT, -- The text around the mention
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (
    (clip_id IS NOT NULL AND comment_id IS NULL) OR
    (clip_id IS NULL AND comment_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_mentions_mentioned_profile ON public.mentions(mentioned_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentions_clip ON public.mentions(clip_id);
CREATE INDEX IF NOT EXISTS idx_mentions_comment ON public.mentions(comment_id);

-- Enable RLS
ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

-- Mentions readable by mentioned user
CREATE POLICY "Mentions readable by mentioned user"
ON public.mentions FOR SELECT
USING (
  mentioned_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Mentions insertable by creator
CREATE POLICY "Mentions insertable by creator"
ON public.mentions FOR INSERT
WITH CHECK (
  mentioned_by IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- ============================================================================
-- PART 6: VOICE MESSAGE THREADS IN DMs
-- ============================================================================

-- Add thread support to direct messages
ALTER TABLE public.direct_messages
ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.direct_messages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_thread_starter BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_direct_messages_thread ON public.direct_messages(thread_id, created_at);

-- ============================================================================
-- PART 7: FUNCTIONS FOR ENHANCED DISCOVERY
-- ============================================================================

-- Function: Get "Because you listened to..." recommendations
CREATE OR REPLACE FUNCTION public.get_because_you_listened_to(
  p_profile_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  clip_id UUID,
  title TEXT,
  audio_path TEXT,
  duration_seconds INT,
  profile_id UUID,
  profile_handle TEXT,
  profile_avatar TEXT,
  reason TEXT,
  similarity_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH recent_listens AS (
    SELECT DISTINCT l.clip_id
    FROM public.listens l
    WHERE l.profile_id = p_profile_id
      AND l.completion_percentage > 70
      AND l.created_at > now() - INTERVAL '30 days'
    ORDER BY l.created_at DESC
    LIMIT 20
  ),
  similar_clips AS (
    SELECT 
      cs.similar_clip_id as clip_id,
      cs.similarity_score,
      cs.similarity_type,
      rl.clip_id as source_clip_id
    FROM recent_listens rl
    JOIN public.clip_similarities cs ON cs.clip_id = rl.clip_id
    WHERE cs.similar_clip_id NOT IN (
      SELECT clip_id FROM recent_listens
    )
    AND cs.similar_clip_id NOT IN (
      SELECT clip_id FROM public.listens
      WHERE profile_id = p_profile_id
    )
  )
  SELECT DISTINCT
    c.id as clip_id,
    c.title,
    c.audio_path,
    c.duration_seconds,
    c.profile_id,
    p.handle as profile_handle,
    p.emoji_avatar as profile_avatar,
    'Because you listened to similar content' as reason,
    MAX(sc.similarity_score) as similarity_score
  FROM similar_clips sc
  JOIN public.clips c ON c.id = sc.clip_id
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE c.status = 'live'
  GROUP BY c.id, c.title, c.audio_path, c.duration_seconds, c.profile_id, p.handle, p.emoji_avatar
  ORDER BY similarity_score DESC, c.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get similar voice/style clips
CREATE OR REPLACE FUNCTION public.get_similar_voice_clips(
  p_clip_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  clip_id UUID,
  title TEXT,
  audio_path TEXT,
  duration_seconds INT,
  profile_id UUID,
  profile_handle TEXT,
  profile_avatar TEXT,
  similarity_score NUMERIC,
  similarity_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as clip_id,
    c.title,
    c.audio_path,
    c.duration_seconds,
    c.profile_id,
    p.handle as profile_handle,
    p.emoji_avatar as profile_avatar,
    cs.similarity_score,
    cs.similarity_type
  FROM public.clip_similarities cs
  JOIN public.clips c ON c.id = cs.similar_clip_id
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE cs.clip_id = p_clip_id
    AND cs.similarity_type IN ('voice', 'style')
    AND c.status = 'live'
    AND c.id != p_clip_id
  ORDER BY cs.similarity_score DESC, c.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Create or update topic-based auto-playlist
CREATE OR REPLACE FUNCTION public.create_topic_auto_playlist(
  p_profile_id UUID,
  p_topic_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS UUID AS $$
DECLARE
  v_playlist_id UUID;
  v_topic_title TEXT;
BEGIN
  -- Get topic title
  SELECT title INTO v_topic_title FROM public.topics WHERE id = p_topic_id;
  
  -- Create or get existing auto-playlist
  INSERT INTO public.auto_playlists (profile_id, topic_id, name, description, playlist_type)
  VALUES (
    p_profile_id,
    p_topic_id,
    COALESCE(v_topic_title, 'Topic Playlist'),
    'Auto-generated playlist based on your topic preferences',
    'topic'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_playlist_id;
  
  -- If playlist already exists, get its ID
  IF v_playlist_id IS NULL THEN
    SELECT id INTO v_playlist_id
    FROM public.auto_playlists
    WHERE profile_id = p_profile_id AND topic_id = p_topic_id;
  END IF;
  
  -- Clear existing clips
  DELETE FROM public.auto_playlist_clips WHERE auto_playlist_id = v_playlist_id;
  
  -- Add clips from topic (prioritize trending and high-quality)
  INSERT INTO public.auto_playlist_clips (auto_playlist_id, clip_id, position)
  SELECT 
    v_playlist_id,
    c.id,
    ROW_NUMBER() OVER (ORDER BY COALESCE(c.trending_score, 0) DESC, COALESCE(c.quality_score, 0) DESC, c.created_at DESC)
  FROM public.clips c
  WHERE c.topic_id = p_topic_id
    AND c.status = 'live'
  ORDER BY COALESCE(c.trending_score, 0) DESC, COALESCE(c.quality_score, 0) DESC, c.created_at DESC
  LIMIT p_limit;
  
  -- Update playlist stats
  UPDATE public.auto_playlists
  SET clip_count = (SELECT COUNT(*) FROM public.auto_playlist_clips WHERE auto_playlist_id = v_playlist_id),
      last_updated_at = now()
  WHERE id = v_playlist_id;
  
  RETURN v_playlist_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Trigger notification for mentions
CREATE OR REPLACE FUNCTION public.create_mention_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Create notification for mention
  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    NEW.mentioned_profile_id,
    NEW.mentioned_by,
    'mention',
    CASE 
      WHEN NEW.clip_id IS NOT NULL THEN 'clip'
      WHEN NEW.comment_id IS NOT NULL THEN 'comment'
    END,
    COALESCE(NEW.clip_id, NEW.comment_id),
    jsonb_build_object(
      'mention_id', NEW.id,
      'context', NEW.context_text
    )
  )
  ON CONFLICT DO NOTHING; -- Prevent duplicate notifications
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for mention notifications
DROP TRIGGER IF EXISTS trigger_create_mention_notification ON public.mentions;
CREATE TRIGGER trigger_create_mention_notification
  AFTER INSERT ON public.mentions
  FOR EACH ROW
  EXECUTE FUNCTION public.create_mention_notification();

-- ============================================================================
-- PART 8: RLS POLICIES FOR NEW TABLES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE public.clip_similarities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_listening_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_playlist_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_collaborators ENABLE ROW LEVEL SECURITY;

-- Clip similarities: readable by everyone
CREATE POLICY "Clip similarities readable by everyone"
ON public.clip_similarities FOR SELECT
USING (true);

-- User listening patterns: readable by user
CREATE POLICY "User listening patterns readable by user"
ON public.user_listening_patterns FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Auto playlists: readable by owner
CREATE POLICY "Auto playlists readable by owner"
ON public.auto_playlists FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Auto playlist clips: readable by playlist owner
CREATE POLICY "Auto playlist clips readable by owner"
ON public.auto_playlist_clips FOR SELECT
USING (
  auto_playlist_id IN (
    SELECT id FROM public.auto_playlists
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Playlist collaborators: readable by collaborators
CREATE POLICY "Playlist collaborators readable by collaborators"
ON public.playlist_collaborators FOR SELECT
USING (
  playlist_id IN (
    SELECT playlist_id FROM public.playlist_collaborators
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR playlist_id IN (
    SELECT id FROM public.playlists
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

