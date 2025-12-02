-- Topic subscriptions table
CREATE TABLE public.topic_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, topic_id)
);

ALTER TABLE public.topic_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscriptions
CREATE POLICY "Topic subscriptions readable by owner"
ON public.topic_subscriptions FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Anyone can view subscriptions (for public display)
CREATE POLICY "Topic subscriptions viewable by everyone"
ON public.topic_subscriptions FOR SELECT
USING (true);

-- Users can subscribe to topics
CREATE POLICY "Topic subscriptions insertable by owner"
ON public.topic_subscriptions FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can unsubscribe from topics
CREATE POLICY "Topic subscriptions deletable by owner"
ON public.topic_subscriptions FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Indexes for faster queries
CREATE INDEX idx_topic_subscriptions_profile_id ON public.topic_subscriptions(profile_id);
CREATE INDEX idx_topic_subscriptions_topic_id ON public.topic_subscriptions(topic_id);

