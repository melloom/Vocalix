-- Voice-Based Communities Migration
-- Automatically creates and organizes communities based on voice characteristics
-- This allows users to discover communities of people with similar voices

-- ============================================================================
-- STEP 1: Add voice-based community fields
-- ============================================================================

-- Add field to mark communities as voice-based (auto-generated)
ALTER TABLE public.communities
ADD COLUMN IF NOT EXISTS is_voice_based BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS voice_cluster_id TEXT DEFAULT NULL, -- Identifier for the voice cluster
ADD COLUMN IF NOT EXISTS voice_characteristics_summary JSONB DEFAULT NULL; -- Average voice characteristics of community members

-- Create index for voice-based communities
CREATE INDEX IF NOT EXISTS idx_communities_voice_based ON public.communities(is_voice_based) WHERE is_voice_based = true;
CREATE INDEX IF NOT EXISTS idx_communities_voice_cluster ON public.communities(voice_cluster_id) WHERE voice_cluster_id IS NOT NULL;

-- ============================================================================
-- STEP 2: Create function to discover voice clusters
-- ============================================================================

-- Function to discover voice clusters and create/update voice-based communities
CREATE OR REPLACE FUNCTION public.discover_voice_based_communities(
  p_min_cluster_size INT DEFAULT 5,
  p_similarity_threshold NUMERIC DEFAULT 0.6
)
RETURNS TABLE(
  community_id UUID,
  cluster_id TEXT,
  member_count BIGINT,
  action TEXT -- 'created' or 'updated'
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clip RECORD;
  v_similar_clips RECORD;
  v_cluster_id TEXT;
  v_community_id UUID;
  v_existing_community RECORD;
  v_avg_pitch NUMERIC;
  v_avg_speed NUMERIC;
  v_common_tone TEXT;
  v_community_name TEXT;
  v_community_slug TEXT;
  v_community_description TEXT;
  v_cluster_members UUID[];
  v_member_count INT;
  v_processed_communities UUID[] := ARRAY[]::UUID[];
BEGIN
  -- Find all clips with voice characteristics that don't belong to a voice-based community yet
  FOR v_clip IN
    SELECT DISTINCT ON (c.profile_id)
      c.id as clip_id,
      c.profile_id,
      c.voice_characteristics,
      c.voice_fingerprint,
      p.handle
    FROM public.clips c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.status = 'live'
      AND c.voice_characteristics IS NOT NULL
      AND c.profile_id IS NOT NULL
      AND NOT EXISTS (
        -- Exclude profiles already in a voice-based community
        SELECT 1 FROM public.community_members cm
        JOIN public.communities com ON com.id = cm.community_id
        WHERE cm.profile_id = c.profile_id
          AND com.is_voice_based = true
      )
    ORDER BY c.profile_id, c.created_at DESC
    LIMIT 1000 -- Process in batches
  LOOP
    -- Find similar voices for this clip
    v_cluster_members := ARRAY[v_clip.profile_id];
    
    -- Get similar voices using the existing find_similar_voices function
    FOR v_similar_clips IN
      SELECT DISTINCT profile_id
      FROM public.find_similar_voices(v_clip.clip_id, 20)
      WHERE similarity_score >= p_similarity_threshold
        AND profile_id != v_clip.profile_id
    LOOP
      -- Check if this profile is already in a cluster
      IF NOT (v_similar_clips.profile_id = ANY(v_cluster_members)) THEN
        v_cluster_members := array_append(v_cluster_members, v_similar_clips.profile_id);
      END IF;
    END LOOP;
    
    -- Only create community if we have enough members
    IF array_length(v_cluster_members, 1) >= p_min_cluster_size THEN
      -- Generate cluster ID based on voice characteristics
      v_cluster_id := encode(digest(
        COALESCE((v_clip.voice_characteristics->>'pitch')::TEXT, '0') || '|' ||
        COALESCE((v_clip.voice_characteristics->>'tone')::TEXT, 'neutral') || '|' ||
        COALESCE((v_clip.voice_characteristics->>'speed')::TEXT, '0'),
        'sha256'
      ), 'hex');
      
      -- Check if community for this cluster already exists
      SELECT id INTO v_existing_community
      FROM public.communities
      WHERE voice_cluster_id = v_cluster_id
        AND is_voice_based = true
      LIMIT 1;
      
      IF v_existing_community IS NULL THEN
        -- Calculate average characteristics for community description
        SELECT 
          AVG((voice_characteristics->>'pitch')::NUMERIC)::NUMERIC,
          AVG((voice_characteristics->>'speed')::NUMERIC)::NUMERIC,
          MODE() WITHIN GROUP (ORDER BY (voice_characteristics->>'tone')::TEXT)::TEXT
        INTO v_avg_pitch, v_avg_speed, v_common_tone
        FROM public.clips
        WHERE profile_id = ANY(v_cluster_members)
          AND voice_characteristics IS NOT NULL
          AND status = 'live';
        
        -- Generate community name and description
        v_community_name := CASE v_common_tone
          WHEN 'warm' THEN 'Warm Voices'
          WHEN 'cool' THEN 'Cool Voices'
          ELSE 'Similar Voices'
        END || ' Community';
        
        v_community_slug := 'voice-' || LOWER(SUBSTRING(v_cluster_id, 1, 8));
        
        v_community_description := 'A community of voices with similar characteristics. '
          || 'Join to connect with others who share similar voice qualities.';
        
        -- Create the voice-based community
        INSERT INTO public.communities (
          name,
          slug,
          description,
          avatar_emoji,
          is_voice_based,
          voice_cluster_id,
          voice_characteristics_summary,
          is_public,
          is_active,
          member_count
        ) VALUES (
          v_community_name,
          v_community_slug,
          v_community_description,
          '🎤',
          true,
          v_cluster_id,
          jsonb_build_object(
            'avg_pitch', v_avg_pitch,
            'avg_speed', v_avg_speed,
            'common_tone', v_common_tone
          ),
          true,
          true,
          array_length(v_cluster_members, 1)
        )
        RETURNING id INTO v_community_id;
        
        -- Add members to the community
        INSERT INTO public.community_members (community_id, profile_id)
        SELECT v_community_id, unnest(v_cluster_members)
        ON CONFLICT (community_id, profile_id) DO NOTHING;
        
        -- Update member count
        SELECT COUNT(*) INTO v_member_count
        FROM public.community_members
        WHERE community_id = v_community_id;
        
        UPDATE public.communities
        SET member_count = v_member_count
        WHERE id = v_community_id;
        
        v_processed_communities := array_append(v_processed_communities, v_community_id);
      ELSE
        -- Update existing community with new members
        INSERT INTO public.community_members (community_id, profile_id)
        SELECT v_existing_community.id, unnest(v_cluster_members)
        ON CONFLICT (community_id, profile_id) DO NOTHING;
        
        -- Update member count
        SELECT COUNT(*) INTO v_member_count
        FROM public.community_members
        WHERE community_id = v_existing_community.id;
        
        UPDATE public.communities
        SET member_count = v_member_count,
            updated_at = NOW()
        WHERE id = v_existing_community.id;
        
        v_processed_communities := array_append(v_processed_communities, v_existing_community.id);
      END IF;
    END IF;
  END LOOP;
  
  -- Return all processed communities
  IF array_length(v_processed_communities, 1) > 0 THEN
    RETURN QUERY
    SELECT 
      c.id,
      c.voice_cluster_id,
      c.member_count::BIGINT,
      CASE 
        WHEN c.created_at > NOW() - INTERVAL '1 minute' THEN 'created'::TEXT
        ELSE 'updated'::TEXT
      END
    FROM public.communities c
    WHERE c.id = ANY(v_processed_communities);
  END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.discover_voice_based_communities TO authenticated, anon;

-- ============================================================================
-- STEP 3: Create function to suggest voice-based communities to users
-- ============================================================================

-- Function to suggest voice-based communities for a user based on their voice
CREATE OR REPLACE FUNCTION public.suggest_voice_based_communities(
  p_profile_id UUID,
  p_limit INT DEFAULT 5
)
RETURNS TABLE(
  community_id UUID,
  community_name TEXT,
  community_slug TEXT,
  community_description TEXT,
  avatar_emoji TEXT,
  member_count INT,
  match_score NUMERIC,
  voice_similarity NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_voice RECORD;
  v_community RECORD;
  v_similarity NUMERIC;
BEGIN
  -- Get user's most recent voice characteristics
  SELECT 
    voice_characteristics,
    voice_fingerprint
  INTO v_user_voice
  FROM public.clips
  WHERE profile_id = p_profile_id
    AND status = 'live'
    AND voice_characteristics IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- If user has no voice characteristics, return empty
  IF v_user_voice.voice_characteristics IS NULL THEN
    RETURN;
  END IF;
  
  -- Find voice-based communities that match user's voice
  FOR v_community IN
    SELECT 
      c.id,
      c.name,
      c.slug,
      c.description,
      c.avatar_emoji,
      c.member_count,
      c.voice_characteristics_summary,
      c.voice_cluster_id
    FROM public.communities c
    WHERE c.is_voice_based = true
      AND c.is_active = true
      AND c.is_public = true
      AND NOT EXISTS (
        -- Exclude communities user is already a member of
        SELECT 1 FROM public.community_members cm
        WHERE cm.community_id = c.id
          AND cm.profile_id = p_profile_id
      )
    ORDER BY c.member_count DESC
    LIMIT p_limit * 2 -- Get more to filter by similarity
  LOOP
    -- Calculate similarity score
    v_similarity := 0.0;
    
    IF v_community.voice_characteristics_summary IS NOT NULL AND v_user_voice.voice_characteristics IS NOT NULL THEN
      -- Compare pitch
      IF (v_community.voice_characteristics_summary->>'avg_pitch') IS NOT NULL 
         AND (v_user_voice.voice_characteristics->>'pitch') IS NOT NULL THEN
        IF ABS((v_community.voice_characteristics_summary->>'avg_pitch')::NUMERIC - 
               (v_user_voice.voice_characteristics->>'pitch')::NUMERIC) < 0.15 THEN
          v_similarity := v_similarity + 0.4;
        ELSIF ABS((v_community.voice_characteristics_summary->>'avg_pitch')::NUMERIC - 
                  (v_user_voice.voice_characteristics->>'pitch')::NUMERIC) < 0.25 THEN
          v_similarity := v_similarity + 0.2;
        END IF;
      END IF;
      
      -- Compare tone
      IF (v_community.voice_characteristics_summary->>'common_tone') IS NOT NULL 
         AND (v_user_voice.voice_characteristics->>'tone') IS NOT NULL THEN
        IF (v_community.voice_characteristics_summary->>'common_tone')::TEXT = 
           (v_user_voice.voice_characteristics->>'tone')::TEXT THEN
          v_similarity := v_similarity + 0.3;
        END IF;
      END IF;
      
      -- Compare speed
      IF (v_community.voice_characteristics_summary->>'avg_speed') IS NOT NULL 
         AND (v_user_voice.voice_characteristics->>'speed') IS NOT NULL THEN
        IF ABS((v_community.voice_characteristics_summary->>'avg_speed')::NUMERIC - 
               (v_user_voice.voice_characteristics->>'speed')::NUMERIC) < 25 THEN
          v_similarity := v_similarity + 0.3;
        ELSIF ABS((v_community.voice_characteristics_summary->>'avg_speed')::NUMERIC - 
                  (v_user_voice.voice_characteristics->>'speed')::NUMERIC) < 50 THEN
          v_similarity := v_similarity + 0.15;
        END IF;
      END IF;
    END IF;
    
    -- Only return communities with reasonable similarity (>= 0.4)
    IF v_similarity >= 0.4 THEN
      RETURN QUERY SELECT 
        v_community.id,
        v_community.name,
        v_community.slug,
        v_community.description,
        v_community.avatar_emoji,
        v_community.member_count,
        v_similarity as match_score,
        v_similarity as voice_similarity
      ORDER BY v_similarity DESC, v_community.member_count DESC
      LIMIT p_limit;
    END IF;
  END LOOP;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.suggest_voice_based_communities TO authenticated, anon;

-- ============================================================================
-- STEP 4: Add comments
-- ============================================================================

COMMENT ON COLUMN public.communities.is_voice_based IS 'True if this community was automatically created based on voice characteristics';
COMMENT ON COLUMN public.communities.voice_cluster_id IS 'Unique identifier for the voice cluster this community represents';
COMMENT ON COLUMN public.communities.voice_characteristics_summary IS 'Average voice characteristics of community members: {avg_pitch, avg_speed, common_tone}';

COMMENT ON FUNCTION public.discover_voice_based_communities IS 'Discovers voice clusters and creates/updates voice-based communities automatically';
COMMENT ON FUNCTION public.suggest_voice_based_communities IS 'Suggests voice-based communities to a user based on their voice characteristics';

