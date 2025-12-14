-- Create profiles table for anonymous users
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT UNIQUE NOT NULL,
  handle TEXT UNIQUE NOT NULL,
  emoji_avatar TEXT NOT NULL DEFAULT '🎧',
  joined_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone" 
ON public.profiles FOR SELECT 
USING (true);
CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (true);
CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (device_id = current_setting('request.headers', true)::json->>'x-device-id');
-- Create topics table
CREATE TABLE public.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  date DATE NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Topics are viewable by everyone" 
ON public.topics FOR SELECT 
USING (true);
-- Create clips table
CREATE TABLE public.clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  audio_path TEXT NOT NULL,
  duration_seconds INT NOT NULL CHECK (duration_seconds <= 30),
  mood_emoji TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  captions TEXT,
  summary TEXT,
  tags TEXT[],
  listens_count INT NOT NULL DEFAULT 0,
  reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Live clips are viewable by everyone" 
ON public.clips FOR SELECT 
USING (status = 'live' OR status = 'processing');
CREATE POLICY "Users can insert their own clips" 
ON public.clips FOR INSERT 
WITH CHECK (true);
CREATE POLICY "Users can update their own clips" 
ON public.clips FOR UPDATE 
USING (profile_id IN (SELECT id FROM public.profiles WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'));
-- Create listens table
CREATE TABLE public.listens (
  id BIGSERIAL PRIMARY KEY,
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  listened_at TIMESTAMPTZ DEFAULT now(),
  seconds INT DEFAULT 0
);
ALTER TABLE public.listens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can log listens" 
ON public.listens FOR INSERT 
WITH CHECK (true);
-- Create storage bucket for audio files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('audio', 'audio', false);
-- Storage policies for audio bucket
CREATE POLICY "Anyone can upload audio" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'audio');
CREATE POLICY "Anyone can view audio" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'audio');
-- Seed some initial topics
INSERT INTO public.topics (title, date, description) VALUES
  ('What made you smile today?', CURRENT_DATE, 'Share a moment of joy'),
  ('A tiny win', CURRENT_DATE - INTERVAL '1 day', 'Celebrate the small stuff'),
  ('One thing you''re grateful for', CURRENT_DATE - INTERVAL '2 days', 'Practice gratitude'),
  ('A random act of kindness', CURRENT_DATE - INTERVAL '3 days', 'Spread positivity'),
  ('Your mood in three words', CURRENT_DATE - INTERVAL '4 days', 'Express yourself'),
  ('Something that surprised you', CURRENT_DATE - INTERVAL '5 days', 'Share the unexpected'),
  ('A moment of peace', CURRENT_DATE - INTERVAL '6 days', 'Find your calm');
-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- Triggers for updated_at
CREATE TRIGGER set_updated_at_profiles
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_topics
BEFORE UPDATE ON public.topics
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_clips
BEFORE UPDATE ON public.clips
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
