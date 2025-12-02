-- Audio Communities Migration (FIXED VERSION)
-- Creates communities, community members, and community moderators tables
-- Allows users to create and join audio-first communities
--
-- This version fixes the dependency issue by creating the UPDATE policy
-- after the community_moderators table exists

-- Clean up any existing policies that might conflict (safe to run multiple times)
DROP POLICY IF EXISTS "Community creators and moderators can update" ON public.communities;

-- Create communities table
CREATE TABLE IF NOT EXISTS public.communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  avatar_emoji TEXT NOT NULL DEFAULT '🎙️',
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  member_count INT NOT NULL DEFAULT 0,
  clip_count INT NOT NULL DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  guidelines TEXT, -- Audio-based community guidelines
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Communities are viewable by everyone" ON public.communities;
DROP POLICY IF EXISTS "Users can create communities" ON public.communities;

-- Communities are viewable by everyone (if public)
CREATE POLICY "Communities are viewable by everyone"
ON public.communities FOR SELECT
USING (is_public = true OR is_active = true);

-- Users can create communities
CREATE POLICY "Users can create communities"
ON public.communities FOR INSERT
WITH CHECK (
  created_by_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Create community_members table for join/leave functionality
CREATE TABLE IF NOT EXISTS public.community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(community_id, profile_id)
);

-- Enable RLS
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Members can view their own memberships" ON public.community_members;
DROP POLICY IF EXISTS "Community memberships viewable by everyone" ON public.community_members;
DROP POLICY IF EXISTS "Users can join communities" ON public.community_members;
DROP POLICY IF EXISTS "Users can leave communities" ON public.community_members;

-- Members can view their own memberships
CREATE POLICY "Members can view their own memberships"
ON public.community_members FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Anyone can view memberships (for public display of member counts)
CREATE POLICY "Community memberships viewable by everyone"
ON public.community_members FOR SELECT
USING (true);

-- Users can join communities
CREATE POLICY "Users can join communities"
ON public.community_members FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can leave communities
CREATE POLICY "Users can leave communities"
ON public.community_members FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Create community_moderators table for community-elected moderators
CREATE TABLE IF NOT EXISTS public.community_moderators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  moderator_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  elected_at TIMESTAMPTZ DEFAULT now(),
  elected_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE(community_id, moderator_profile_id)
);

-- Enable RLS
ALTER TABLE public.community_moderators ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Moderators can view their own moderatorships" ON public.community_moderators;
DROP POLICY IF EXISTS "Community moderators viewable by everyone" ON public.community_moderators;
DROP POLICY IF EXISTS "Community creators can add moderators" ON public.community_moderators;
DROP POLICY IF EXISTS "Community creators can remove moderators" ON public.community_moderators;

-- Moderators can view their own moderatorships
CREATE POLICY "Moderators can view their own moderatorships"
ON public.community_moderators FOR SELECT
USING (
  moderator_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Anyone can view moderators (for public display)
CREATE POLICY "Community moderators viewable by everyone"
ON public.community_moderators FOR SELECT
USING (true);

-- Community creators can add moderators
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

-- Community creators can remove moderators
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

-- Community creators and moderators can update communities
-- (Created AFTER community_moderators table exists)
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

-- Add community_id column to clips table
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_communities_slug ON public.communities(slug);
CREATE INDEX IF NOT EXISTS idx_communities_created_by ON public.communities(created_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_communities_is_active ON public.communities(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_community_members_community_id ON public.community_members(community_id);
CREATE INDEX IF NOT EXISTS idx_community_members_profile_id ON public.community_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_community_moderators_community_id ON public.community_moderators(community_id);
CREATE INDEX IF NOT EXISTS idx_community_moderators_moderator_id ON public.community_moderators(moderator_profile_id);
CREATE INDEX IF NOT EXISTS idx_clips_community_id ON public.clips(community_id);

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

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_community_member_count_trigger ON public.community_members;

-- Trigger to update member count
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
    -- If community_id changed
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

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_community_clip_count_trigger ON public.clips;

-- Trigger to update clip count
CREATE TRIGGER update_community_clip_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.clips
FOR EACH ROW EXECUTE FUNCTION public.update_community_clip_count();

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS set_updated_at_communities ON public.communities;

-- Add trigger for updated_at on communities
CREATE TRIGGER set_updated_at_communities
BEFORE UPDATE ON public.communities
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

