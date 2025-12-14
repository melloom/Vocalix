-- Community Features Migration
-- Adds announcements, activity feed, member roles, events, and tags

-- Add columns to communities table
ALTER TABLE public.communities 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS banner_color TEXT,
ADD COLUMN IF NOT EXISTS accent_color TEXT;

-- Create community_announcements table
CREATE TABLE IF NOT EXISTS public.community_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.community_announcements ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Announcements are viewable by everyone" ON public.community_announcements;
DROP POLICY IF EXISTS "Community creators and moderators can create announcements" ON public.community_announcements;
DROP POLICY IF EXISTS "Community creators and moderators can update announcements" ON public.community_announcements;
DROP POLICY IF EXISTS "Community creators and moderators can delete announcements" ON public.community_announcements;

-- Announcements are viewable by everyone (if community is public) or by members
CREATE POLICY "Announcements are viewable by everyone"
ON public.community_announcements FOR SELECT
USING (
  community_id IN (
    SELECT id FROM public.communities 
    WHERE is_public = true 
    OR id IN (
      SELECT community_id FROM public.community_members
      WHERE profile_id IN (
        SELECT id FROM public.profiles
        WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
      )
    )
  )
);

-- Community creators and moderators can create announcements
CREATE POLICY "Community creators and moderators can create announcements"
ON public.community_announcements FOR INSERT
WITH CHECK (
  created_by_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  AND (
    community_id IN (
      SELECT id FROM public.communities
      WHERE created_by_profile_id IN (
        SELECT id FROM public.profiles
        WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
      )
    )
    OR community_id IN (
      SELECT community_id FROM public.community_moderators
      WHERE moderator_profile_id IN (
        SELECT id FROM public.profiles
        WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
      )
    )
  )
);

-- Community creators and moderators can update announcements
CREATE POLICY "Community creators and moderators can update announcements"
ON public.community_announcements FOR UPDATE
USING (
  community_id IN (
    SELECT id FROM public.communities
    WHERE created_by_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR community_id IN (
    SELECT community_id FROM public.community_moderators
    WHERE moderator_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Community creators and moderators can delete announcements
CREATE POLICY "Community creators and moderators can delete announcements"
ON public.community_announcements FOR DELETE
USING (
  community_id IN (
    SELECT id FROM public.communities
    WHERE created_by_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR community_id IN (
    SELECT community_id FROM public.community_moderators
    WHERE moderator_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Create community_activity table
CREATE TABLE IF NOT EXISTS public.community_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL, -- 'clip_posted', 'member_joined', 'room_created', 'announcement_created'
  activity_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.community_activity ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Activity is viewable by everyone" ON public.community_activity;
DROP POLICY IF EXISTS "Activity can be created" ON public.community_activity;

-- Activity is viewable by everyone (if community is public) or by members
CREATE POLICY "Activity is viewable by everyone"
ON public.community_activity FOR SELECT
USING (
  community_id IN (
    SELECT id FROM public.communities 
    WHERE is_public = true 
    OR id IN (
      SELECT community_id FROM public.community_members
      WHERE profile_id IN (
        SELECT id FROM public.profiles
        WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
      )
    )
  )
);

-- Activity can be created by system (via triggers or authenticated users)
CREATE POLICY "Activity can be created"
ON public.community_activity FOR INSERT
WITH CHECK (true);

-- Create community_events table
CREATE TABLE IF NOT EXISTS public.community_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  event_type TEXT DEFAULT 'general', -- 'general', 'live_room', 'meetup', 'workshop'
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern TEXT, -- 'daily', 'weekly', 'monthly'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Events are viewable by everyone" ON public.community_events;
DROP POLICY IF EXISTS "Community members can create events" ON public.community_events;
DROP POLICY IF EXISTS "Event creators and moderators can update events" ON public.community_events;
DROP POLICY IF EXISTS "Event creators and moderators can delete events" ON public.community_events;

-- Events are viewable by everyone (if community is public) or by members
CREATE POLICY "Events are viewable by everyone"
ON public.community_events FOR SELECT
USING (
  community_id IN (
    SELECT id FROM public.communities 
    WHERE is_public = true 
    OR id IN (
      SELECT community_id FROM public.community_members
      WHERE profile_id IN (
        SELECT id FROM public.profiles
        WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
      )
    )
  )
);

-- Community members can create events
CREATE POLICY "Community members can create events"
ON public.community_events FOR INSERT
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

-- Event creators and moderators can update events
CREATE POLICY "Event creators and moderators can update events"
ON public.community_events FOR UPDATE
USING (
  created_by_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR community_id IN (
    SELECT id FROM public.communities
    WHERE created_by_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR community_id IN (
    SELECT community_id FROM public.community_moderators
    WHERE moderator_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Event creators and moderators can delete events
CREATE POLICY "Event creators and moderators can delete events"
ON public.community_events FOR DELETE
USING (
  created_by_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR community_id IN (
    SELECT id FROM public.communities
    WHERE created_by_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR community_id IN (
    SELECT community_id FROM public.community_moderators
    WHERE moderator_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Add role column to community_members (for future role system)
ALTER TABLE public.community_members 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member'; -- 'member', 'vip', 'founder', etc.

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_community_announcements_community_id ON public.community_announcements(community_id);
CREATE INDEX IF NOT EXISTS idx_community_announcements_is_pinned ON public.community_announcements(is_pinned);
CREATE INDEX IF NOT EXISTS idx_community_activity_community_id ON public.community_activity(community_id);
CREATE INDEX IF NOT EXISTS idx_community_activity_created_at ON public.community_activity(created_at);
CREATE INDEX IF NOT EXISTS idx_community_events_community_id ON public.community_events(community_id);
CREATE INDEX IF NOT EXISTS idx_community_events_event_date ON public.community_events(event_date);

