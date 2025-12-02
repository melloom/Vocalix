-- Add remix support to clips table
-- A remix is when someone creates their own take on an existing clip
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS remix_of_clip_id UUID REFERENCES public.clips(id) ON DELETE SET NULL;

-- Add chain support for conversation threads
-- A chain groups related clips that continue a conversation
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS chain_id UUID;

-- Create chains table to group conversation threads
CREATE TABLE IF NOT EXISTS public.clip_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  description TEXT,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create challenges table for topic-based challenges
CREATE TABLE IF NOT EXISTS public.challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ DEFAULT now(),
  end_date TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Link clips to challenges
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS challenge_id UUID REFERENCES public.challenges(id) ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_clips_remix_of_clip_id ON public.clips(remix_of_clip_id);
CREATE INDEX IF NOT EXISTS idx_clips_chain_id ON public.clips(chain_id);
CREATE INDEX IF NOT EXISTS idx_clips_challenge_id ON public.clips(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenges_topic_id ON public.challenges(topic_id);
CREATE INDEX IF NOT EXISTS idx_challenges_is_active ON public.challenges(is_active) WHERE is_active = true;

-- Enable RLS on new tables
ALTER TABLE public.clip_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

-- Chains are viewable by everyone
CREATE POLICY "Chains are viewable by everyone"
ON public.clip_chains FOR SELECT
USING (true);

-- Users can create chains
CREATE POLICY "Chains are insertable by anyone"
ON public.clip_chains FOR INSERT
WITH CHECK (true);

-- Users can update chains they created
CREATE POLICY "Chains are updatable by creator"
ON public.clip_chains FOR UPDATE
USING (
  created_by_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Challenges are viewable by everyone
CREATE POLICY "Challenges are viewable by everyone"
ON public.challenges FOR SELECT
USING (true);

-- Challenges are insertable by anyone (admin-only in practice)
CREATE POLICY "Challenges are insertable by anyone"
ON public.challenges FOR INSERT
WITH CHECK (true);

-- Challenges are updatable by anyone (admin-only in practice)
CREATE POLICY "Challenges are updatable by anyone"
ON public.challenges FOR UPDATE
USING (true);

-- Update RLS policies for clips to allow remix_of_clip_id and chain_id
-- The existing policies should already cover these cases since they're just additional columns

-- Add function to get remix count for a clip
CREATE OR REPLACE FUNCTION public.get_remix_count(clip_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.clips
    WHERE remix_of_clip_id = clip_uuid
      AND status = 'live'
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Add function to get chain count (number of clips in a chain)
CREATE OR REPLACE FUNCTION public.get_chain_clip_count(chain_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.clips
    WHERE chain_id = chain_uuid
      AND status = 'live'
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Add comments for documentation
COMMENT ON COLUMN public.clips.remix_of_clip_id IS 'References the original clip if this is a remix. NULL indicates an original clip.';
COMMENT ON COLUMN public.clips.chain_id IS 'Groups clips that continue a conversation thread. NULL indicates a standalone clip.';
COMMENT ON COLUMN public.clips.challenge_id IS 'References a challenge if this clip is a response to a challenge. NULL indicates a regular clip.';

