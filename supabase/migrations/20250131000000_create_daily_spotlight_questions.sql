-- Create daily spotlight questions table
-- This stores one AI-generated question per day, replacing the old rotation system

CREATE TABLE IF NOT EXISTS public.daily_spotlight_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  question TEXT NOT NULL,
  topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
  topic_title TEXT,
  topic_description TEXT,
  generated_by TEXT DEFAULT 'openai', -- 'openai' or 'fallback'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for date lookups
CREATE INDEX IF NOT EXISTS idx_daily_spotlight_questions_date 
ON public.daily_spotlight_questions(date DESC);

-- Enable RLS
ALTER TABLE public.daily_spotlight_questions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Everyone can read, only service role can write
CREATE POLICY "Anyone can read daily spotlight questions"
ON public.daily_spotlight_questions
FOR SELECT
TO authenticated, anon
USING (true);

CREATE POLICY "Service role can manage daily spotlight questions"
ON public.daily_spotlight_questions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.daily_spotlight_questions IS 
'Stores AI-generated spotlight questions, one per day. Generated daily by the daily-spotlight-question edge function.';

