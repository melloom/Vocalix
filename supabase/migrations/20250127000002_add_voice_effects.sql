-- Voice Filters/Effects
-- Adds audio effects support to clips: pitch adjustment, reverb/echo, voice modulation

-- Add audio effects columns to clips table
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS audio_effects JSONB DEFAULT NULL;

-- Create indexes for queries filtering by effects
CREATE INDEX IF NOT EXISTS idx_clips_has_effects ON public.clips((audio_effects IS NOT NULL)) WHERE audio_effects IS NOT NULL;

-- Function to check if clip has effects applied
CREATE OR REPLACE FUNCTION public.has_audio_effects(clip_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.clips
    WHERE id = clip_uuid
      AND audio_effects IS NOT NULL
      AND jsonb_typeof(audio_effects) = 'object'
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Comment on the column
COMMENT ON COLUMN public.clips.audio_effects IS 'JSONB object storing audio effect parameters: { "pitch": { "value": 0.5, "enabled": true }, "reverb": { "room_size": 0.3, "damping": 0.5, "enabled": true }, "echo": { "delay": 0.2, "feedback": 0.3, "enabled": true }, "modulation": { "type": "robot", "intensity": 0.5, "enabled": true } }';

