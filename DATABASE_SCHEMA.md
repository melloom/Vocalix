# Database Schema

Complete documentation of the Echo Garden database schema.

## 📋 Table of Contents

- [Overview](#overview)
- [Core Tables](#core-tables)
- [Relationships](#relationships)
- [Indexes](#indexes)
- [Functions](#functions)
- [Triggers](#triggers)
- [Policies (RLS)](#policies-rls)

## 🗄️ Overview

Echo Garden uses PostgreSQL via Supabase with the following characteristics:
- Row Level Security (RLS) enabled on all tables
- UUID primary keys
- Timestamps with timezone (TIMESTAMPTZ)
- JSONB for flexible data storage
- Full-text search capabilities

## 📊 Core Tables

### profiles

User profiles with device-based authentication.

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT UNIQUE NOT NULL,
  handle TEXT UNIQUE NOT NULL,
  emoji_avatar TEXT NOT NULL DEFAULT '🎧',
  city TEXT,
  consent_city BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Additional fields
  playback_speed NUMERIC DEFAULT 1.0,
  current_streak_days INTEGER DEFAULT 0,
  longest_streak_days INTEGER DEFAULT 0,
  last_post_date DATE
);
```

**Key Fields**:
- `id`: Unique profile identifier
- `device_id`: Device identifier for authentication
- `handle`: User's display name
- `emoji_avatar`: Emoji representing the user

### clips

Voice clips with metadata.

```sql
CREATE TABLE public.clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
  audio_path TEXT NOT NULL,
  duration_seconds INT NOT NULL,
  title TEXT,
  captions TEXT,
  summary TEXT,
  tags TEXT[],
  mood_emoji TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  listens_count INT NOT NULL DEFAULT 0,
  reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
  city TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Additional fields
  parent_clip_id UUID REFERENCES public.clips(id),
  remix_of_clip_id UUID REFERENCES public.clips(id),
  chain_id UUID,
  quality_score NUMERIC,
  quality_badge TEXT,
  detected_emotion TEXT,
  voice_characteristics JSONB,
  is_private BOOLEAN DEFAULT false,
  visibility TEXT DEFAULT 'public'
);
```

**Key Fields**:
- `id`: Unique clip identifier
- `profile_id`: Creator profile
- `audio_path`: Storage path to audio file
- `status`: `processing`, `live`, `hidden`
- `reactions`: JSONB object with emoji counts

### topics

Daily discussion topics.

```sql
CREATE TABLE public.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### communities

Audio communities.

```sql
CREATE TABLE public.communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  avatar_emoji TEXT NOT NULL DEFAULT '🎙️',
  created_by_profile_id UUID REFERENCES public.profiles(id),
  member_count INT NOT NULL DEFAULT 0,
  clip_count INT NOT NULL DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  guidelines TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### live_rooms

Live audio rooms.

```sql
CREATE TABLE public.live_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  host_id UUID REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'scheduled',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  community_id UUID REFERENCES public.communities(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### follows

Follow relationships between profiles.

```sql
CREATE TABLE public.follows (
  follower_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (follower_id, following_id)
);
```

### clip_reactions

Emoji reactions to clips.

```sql
CREATE TABLE public.clip_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(clip_id, profile_id, emoji)
);
```

### voice_reactions

Voice reactions (short audio clips).

```sql
CREATE TABLE public.voice_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  audio_path TEXT NOT NULL,
  duration_seconds INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### comments

Comments on clips (text or voice).

```sql
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  audio_path TEXT,
  parent_comment_id UUID REFERENCES public.comments(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### admins

Admin users.

```sql
CREATE TABLE public.admins (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## 🔗 Relationships

### Entity Relationship Diagram

```
profiles (1) ──< (many) clips
profiles (1) ──< (many) follows (follower)
profiles (1) ──< (many) follows (following)
topics (1) ──< (many) clips
communities (1) ──< (many) community_members
communities (1) ──< (many) live_rooms
clips (1) ──< (many) clip_reactions
clips (1) ──< (many) voice_reactions
clips (1) ──< (many) comments
clips (1) ──< (many) clips (parent_clip_id)
```

### Foreign Keys

- `clips.profile_id` → `profiles.id`
- `clips.topic_id` → `topics.id`
- `clips.parent_clip_id` → `clips.id`
- `follows.follower_id` → `profiles.id`
- `follows.following_id` → `profiles.id`
- `communities.created_by_profile_id` → `profiles.id`

## 📇 Indexes

### Performance Indexes

```sql
-- Clips indexes
CREATE INDEX idx_clips_status ON clips(status);
CREATE INDEX idx_clips_created_at ON clips(created_at DESC);
CREATE INDEX idx_clips_profile_id ON clips(profile_id);
CREATE INDEX idx_clips_topic_id ON clips(topic_id);
CREATE INDEX idx_clips_chain_id ON clips(chain_id);

-- Full-text search
CREATE INDEX idx_clips_captions_fts ON clips USING gin(to_tsvector('english', captions));

-- Profiles indexes
CREATE INDEX idx_profiles_device_id ON profiles(device_id);
CREATE INDEX idx_profiles_handle ON profiles(handle);

-- Topics indexes
CREATE INDEX idx_topics_date ON topics(date DESC);
CREATE INDEX idx_topics_is_active ON topics(is_active);

-- Communities indexes
CREATE INDEX idx_communities_slug ON communities(slug);
CREATE INDEX idx_communities_created_by ON communities(created_by_profile_id);
```

## ⚙️ Functions

### Database Functions

Common database functions include:

- `create_session()` - Create user session
- `get_user_devices()` - Get user's devices
- `search_clips_enhanced()` - Enhanced clip search
- `publish_scheduled_clips()` - Publish scheduled content
- `calculate_trending_score()` - Calculate trending scores

See migration files in `supabase/migrations/` for function definitions.

## 🔔 Triggers

### Automatic Updates

```sql
-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

## 🔒 Policies (RLS)

### Row Level Security

All tables have RLS enabled with policies like:

**Profiles**:
- Everyone can view profiles
- Users can insert their own profile
- Users can update their own profile

**Clips**:
- Everyone can view live clips
- Users can insert their own clips
- Users can update their own clips
- Admins can update any clip

**Follows**:
- Users can view their own follows
- Users can insert their own follows
- Users can delete their own follows

See migration files for complete RLS policy definitions.

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs/guides/database)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- Migration files in `supabase/migrations/`

---

**Last Updated**: 2025-01-27

