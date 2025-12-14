-- Audio Communities Migration (SIMPLE VERSION)
-- Creates tables first, then adds constraints and policies
-- This version is more resilient to errors

-- ============================================
-- STEP 1: Create tables WITHOUT foreign keys
-- ============================================

-- Create communities table (without foreign key initially)
CREATE TABLE IF NOT EXISTS public.communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  avatar_emoji TEXT NOT NULL DEFAULT '🎙️',
  created_by_profile_id UUID, -- Will add FK constraint later
  member_count INT NOT NULL DEFAULT 0,
  clip_count INT NOT NULL DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  guidelines TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create community_members table (without foreign keys initially)
CREATE TABLE IF NOT EXISTS public.community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID, -- Will add FK constraint later
  profile_id UUID, -- Will add FK constraint later
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(community_id, profile_id)
);

-- Create community_moderators table (without foreign keys initially)
CREATE TABLE IF NOT EXISTS public.community_moderators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID, -- Will add FK constraint later
  moderator_profile_id UUID, -- Will add FK constraint later
  elected_at TIMESTAMPTZ DEFAULT now(),
  elected_by_profile_id UUID, -- Will add FK constraint later
  UNIQUE(community_id, moderator_profile_id)
);

-- ============================================
-- STEP 2: Add foreign key constraints
-- ============================================

-- Add FK constraint for communities.created_by_profile_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.communities
    DROP CONSTRAINT IF EXISTS communities_created_by_profile_id_fkey;
    
    ALTER TABLE public.communities
    ADD CONSTRAINT communities_created_by_profile_id_fkey
    FOREIGN KEY (created_by_profile_id) 
    REFERENCES public.profiles(id) 
    ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add FK constraint for communities.created_by_profile_id: %', SQLERRM;
END $$;

-- Add FK constraints for community_members
DO $$
BEGIN
  ALTER TABLE public.community_members
  DROP CONSTRAINT IF EXISTS community_members_community_id_fkey;
  
  ALTER TABLE public.community_members
  ADD CONSTRAINT community_members_community_id_fkey
  FOREIGN KEY (community_id) 
  REFERENCES public.communities(id) 
  ON DELETE CASCADE;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.community_members
    DROP CONSTRAINT IF EXISTS community_members_profile_id_fkey;
    
    ALTER TABLE public.community_members
    ADD CONSTRAINT community_members_profile_id_fkey
    FOREIGN KEY (profile_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add FK constraints for community_members: %', SQLERRM;
END $$;

-- Add FK constraints for community_moderators
DO $$
BEGIN
  ALTER TABLE public.community_moderators
  DROP CONSTRAINT IF EXISTS community_moderators_community_id_fkey;
  
  ALTER TABLE public.community_moderators
  ADD CONSTRAINT community_moderators_community_id_fkey
  FOREIGN KEY (community_id) 
  REFERENCES public.communities(id) 
  ON DELETE CASCADE;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.community_moderators
    DROP CONSTRAINT IF EXISTS community_moderators_moderator_profile_id_fkey;
    
    ALTER TABLE public.community_moderators
    ADD CONSTRAINT community_moderators_moderator_profile_id_fkey
    FOREIGN KEY (moderator_profile_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE;
    
    ALTER TABLE public.community_moderators
    DROP CONSTRAINT IF EXISTS community_moderators_elected_by_profile_id_fkey;
    
    ALTER TABLE public.community_moderators
    ADD CONSTRAINT community_moderators_elected_by_profile_id_fkey
    FOREIGN KEY (elected_by_profile_id) 
    REFERENCES public.profiles(id) 
    ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add FK constraints for community_moderators: %', SQLERRM;
END $$;

-- Add community_id to clips table (if clips table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clips') THEN
    ALTER TABLE public.clips
    ADD COLUMN IF NOT EXISTS community_id UUID;
    
    ALTER TABLE public.clips
    DROP CONSTRAINT IF EXISTS clips_community_id_fkey;
    
    ALTER TABLE public.clips
    ADD CONSTRAINT clips_community_id_fkey
    FOREIGN KEY (community_id) 
    REFERENCES public.communities(id) 
    ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add community_id to clips: %', SQLERRM;
END $$;

-- ============================================
-- STEP 3: Enable RLS
-- ============================================

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_moderators ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 4: Drop existing policies (idempotent)
-- ============================================

DROP POLICY IF EXISTS "Communities are viewable by everyone" ON public.communities;
DROP POLICY IF EXISTS "Users can create communities" ON public.communities;
DROP POLICY IF EXISTS "Community creators and moderators can update" ON public.communities;
DROP POLICY IF EXISTS "Members can view their own memberships" ON public.community_members;
DROP POLICY IF EXISTS "Community memberships viewable by everyone" ON public.community_members;
DROP POLICY IF EXISTS "Users can join communities" ON public.community_members;
DROP POLICY IF EXISTS "Users can leave communities" ON public.community_members;
DROP POLICY IF EXISTS "Moderators can view their own moderatorships" ON public.community_moderators;
DROP POLICY IF EXISTS "Community moderators viewable by everyone" ON public.community_moderators;
DROP POLICY IF EXISTS "Community creators can add moderators" ON public.community_moderators;
DROP POLICY IF EXISTS "Community creators can remove moderators" ON public.community_moderators;

-- ============================================
-- STEP 5: Create RLS policies
-- ============================================

-- Communities policies
CREATE POLICY "Communities are viewable by everyone"
ON public.communities FOR SELECT
USING (is_public = true OR is_active = true);

CREATE POLICY "Users can create communities"
ON public.communities FOR INSERT
WITH CHECK (
  created_by_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Community members policies
CREATE POLICY "Members can view their own memberships"
ON public.community_members FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Community memberships viewable by everyone"
ON public.community_members FOR SELECT
USING (true);

CREATE POLICY "Users can join communities"
ON public.community_members FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Users can leave communities"
ON public.community_members FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Community moderators policies
CREATE POLICY "Moderators can view their own moderatorships"
ON public.community_moderators FOR SELECT
USING (
  moderator_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Community moderators viewable by everyone"
ON public.community_moderators FOR SELECT
USING (true);

CREATE POLICY "Community creators can add moderators"
ON public.community_moderators FOR INSERT
WITH CHECK (
  community_id IN (
    SELECT id FROM public.communities
    WHERE created_by_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

CREATE POLICY "Community creators can remove moderators"
ON public.community_moderators FOR DELETE
USING (
  community_id IN (
    SELECT id FROM public.communities
    WHERE created_by_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Communities UPDATE policy (after moderators table exists)
CREATE POLICY "Community creators and moderators can update"
ON public.communities FOR UPDATE
USING (
  created_by_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR id IN (
    SELECT community_id FROM public.community_moderators
    WHERE moderator_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- ============================================
-- STEP 6: Create indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_communities_slug ON public.communities(slug);
CREATE INDEX IF NOT EXISTS idx_communities_created_by ON public.communities(created_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_communities_is_active ON public.communities(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_community_members_community_id ON public.community_members(community_id);
CREATE INDEX IF NOT EXISTS idx_community_members_profile_id ON public.community_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_community_moderators_community_id ON public.community_moderators(community_id);
CREATE INDEX IF NOT EXISTS idx_community_moderators_moderator_id ON public.community_moderators(moderator_profile_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clips') THEN
    CREATE INDEX IF NOT EXISTS idx_clips_community_id ON public.clips(community_id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- ============================================
-- STEP 7: Create functions and triggers
-- ============================================

-- Function to update community member count
CREATE OR REPLACE FUNCTION public.update_community_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.communities
    SET member_count = member_count + 1
    WHERE id = NEW.community_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.communities
    SET member_count = GREATEST(0, member_count - 1)
    WHERE id = OLD.community_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for member count
DROP TRIGGER IF EXISTS update_community_member_count_trigger ON public.community_members;
CREATE TRIGGER update_community_member_count_trigger
AFTER INSERT OR DELETE ON public.community_members
FOR EACH ROW EXECUTE FUNCTION public.update_community_member_count();

-- Function to update community clip count
CREATE OR REPLACE FUNCTION public.update_community_clip_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.community_id IS NOT NULL THEN
    UPDATE public.communities
    SET clip_count = clip_count + 1
    WHERE id = NEW.community_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.community_id IS DISTINCT FROM NEW.community_id THEN
      IF OLD.community_id IS NOT NULL THEN
        UPDATE public.communities
        SET clip_count = GREATEST(0, clip_count - 1)
        WHERE id = OLD.community_id;
      END IF;
      IF NEW.community_id IS NOT NULL THEN
        UPDATE public.communities
        SET clip_count = clip_count + 1
        WHERE id = NEW.community_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.community_id IS NOT NULL THEN
    UPDATE public.communities
    SET clip_count = GREATEST(0, clip_count - 1)
    WHERE id = OLD.community_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for clip count (only if clips table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clips') THEN
    DROP TRIGGER IF EXISTS update_community_clip_count_trigger ON public.clips;
    CREATE TRIGGER update_community_clip_count_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.clips
    FOR EACH ROW EXECUTE FUNCTION public.update_community_clip_count();
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Trigger for updated_at (only if function exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    AND routine_name = 'handle_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS set_updated_at_communities ON public.communities;
    CREATE TRIGGER set_updated_at_communities
    BEFORE UPDATE ON public.communities
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

