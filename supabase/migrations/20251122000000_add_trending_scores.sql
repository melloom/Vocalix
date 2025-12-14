-- Add trending_score column to clips table
-- This score is calculated based on engagement × freshness × quality

ALTER TABLE public.clips 
ADD COLUMN IF NOT EXISTS trending_score NUMERIC(10, 4) DEFAULT 0;

-- Create index for efficient sorting by trending score
CREATE INDEX IF NOT EXISTS clips_trending_score_idx 
ON public.clips(trending_score DESC NULLS LAST) 
WHERE status = 'live';

-- Create index for efficient updates (status + created_at for freshness calculation)
CREATE INDEX IF NOT EXISTS clips_trending_update_idx 
ON public.clips(status, created_at DESC) 
WHERE status = 'live';

-- Function to calculate trending score for a single clip
-- Algorithm: engagement × freshness × quality
CREATE OR REPLACE FUNCTION public.calculate_trending_score(
  clip_id_param UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  clip_record RECORD;
  engagement_score NUMERIC;
  freshness_score NUMERIC;
  quality_score NUMERIC;
  final_score NUMERIC;
  hours_old NUMERIC;
  reaction_total INTEGER;
  listens_count INTEGER;
  completion_rate NUMERIC;
  reply_count INTEGER;
  remix_count INTEGER;
  created_at_ts TIMESTAMPTZ;
BEGIN
  -- Get clip data
  SELECT 
    c.id,
    c.created_at,
    c.listens_count,
    c.reactions,
    c.completion_rate,
    c.reply_count,
    c.remix_count,
    c.status,
    c.content_rating,
    c.moderation
  INTO clip_record
  FROM public.clips c
  WHERE c.id = clip_id_param;
  
  -- If clip doesn't exist or isn't live, return 0
  IF NOT FOUND OR clip_record.status != 'live' THEN
    RETURN 0;
  END IF;
  
  -- Calculate hours since creation
  hours_old := EXTRACT(EPOCH FROM (NOW() - clip_record.created_at)) / 3600.0;
  
  -- Calculate total reactions
  reaction_total := (
    SELECT COALESCE(SUM(value::INTEGER), 0)
    FROM jsonb_each_text(clip_record.reactions)
  );
  
  listens_count := COALESCE(clip_record.listens_count, 0);
  reply_count := COALESCE(clip_record.reply_count, 0);
  remix_count := COALESCE(clip_record.remix_count, 0);
  completion_rate := COALESCE(clip_record.completion_rate, 0.5);
  
  -- ENGAGEMENT SCORE (0-1)
  -- Combines reactions, listens, replies, remixes
  -- Uses logarithmic scaling to prevent very popular clips from dominating
  engagement_score := LEAST(1.0, 
    (LN(1 + reaction_total * 2 + listens_count * 0.5 + reply_count * 3 + remix_count * 4) / LN(100))
  );
  
  -- FRESHNESS SCORE (0-1)
  -- Exponential decay: newer content scores higher
  -- Half-life of 12 hours (similar to Reddit's algorithm)
  freshness_score := EXP(-hours_old / 12.0);
  
  -- QUALITY SCORE (0-1)
  -- Based on completion rate, content rating, and moderation
  quality_score := 1.0;
  
  -- Completion rate bonus (clips that are listened to fully are higher quality)
  quality_score := quality_score * (0.5 + completion_rate * 0.5);
  
  -- Penalty for sensitive content (still shown, but ranked lower)
  IF clip_record.content_rating = 'sensitive' THEN
    quality_score := quality_score * 0.85;
  END IF;
  
  -- Moderation penalty (clips with higher risk scores are ranked lower)
  IF clip_record.moderation IS NOT NULL AND 
     (clip_record.moderation->>'risk')::NUMERIC > 0 THEN
    DECLARE
      risk_value NUMERIC;
    BEGIN
      risk_value := LEAST(1.0, (clip_record.moderation->>'risk')::NUMERIC);
      quality_score := quality_score * (1.0 - risk_value * 0.3);
    END;
  END IF;
  
  -- FINAL SCORE: engagement × freshness × quality
  -- Multiplied by 1000 for better precision in storage
  final_score := engagement_score * freshness_score * quality_score * 1000;
  
  RETURN final_score;
END;
$$;

-- Function to update trending scores for all live clips
-- This should be called periodically (e.g., every hour via cron or edge function)
CREATE OR REPLACE FUNCTION public.update_trending_scores()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER := 0;
  clip_record RECORD;
BEGIN
  -- Update trending scores for all live clips
  FOR clip_record IN 
    SELECT id FROM public.clips WHERE status = 'live'
  LOOP
    UPDATE public.clips
    SET trending_score = public.calculate_trending_score(clip_record.id)
    WHERE id = clip_record.id;
    
    updated_count := updated_count + 1;
  END LOOP;
  
  RETURN updated_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.calculate_trending_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trending_scores() TO authenticated;

-- Trigger function to update trending score when a clip is updated
CREATE OR REPLACE FUNCTION public.update_clip_trending_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update trending score for the clip that was updated
  NEW.trending_score := public.calculate_trending_score(NEW.id);
  RETURN NEW;
END;
$$;

-- Create trigger to automatically update trending score on clip updates
DROP TRIGGER IF EXISTS update_trending_score_trigger ON public.clips;
CREATE TRIGGER update_trending_score_trigger
  BEFORE UPDATE ON public.clips
  FOR EACH ROW
  WHEN (
    -- Only update if relevant fields changed
    OLD.listens_count IS DISTINCT FROM NEW.listens_count OR
    OLD.reactions IS DISTINCT FROM NEW.reactions OR
    OLD.reply_count IS DISTINCT FROM NEW.reply_count OR
    OLD.remix_count IS DISTINCT FROM NEW.remix_count OR
    OLD.completion_rate IS DISTINCT FROM NEW.completion_rate OR
    OLD.status IS DISTINCT FROM NEW.status OR
    OLD.content_rating IS DISTINCT FROM NEW.content_rating OR
    OLD.moderation IS DISTINCT FROM NEW.moderation
  )
  EXECUTE FUNCTION public.update_clip_trending_score();

-- Initial update of trending scores for existing clips
-- This will populate scores for clips that already exist
DO $$
BEGIN
  PERFORM public.update_trending_scores();
END $$;

