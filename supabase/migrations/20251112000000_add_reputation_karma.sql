-- Add reputation/karma field to profiles
-- This will be calculated dynamically, but we'll add a computed column for performance

-- Function to calculate reputation based on listens + reactions
CREATE OR REPLACE FUNCTION public.calculate_user_reputation(p_profile_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_listens_score INTEGER;
  v_reactions_score INTEGER;
  v_total_reputation INTEGER;
BEGIN
  -- Calculate listens score (1 point per listen on user's clips)
  SELECT COALESCE(SUM(listens_count), 0)
  INTO v_listens_score
  FROM public.clips
  WHERE profile_id = p_profile_id
    AND status = 'live';

  -- Calculate reactions score (1 point per reaction on user's clips)
  -- Sum all reaction counts from the JSONB object
  SELECT COALESCE(SUM(
    (
      SELECT SUM((value::text)::INTEGER)
      FROM jsonb_each(reactions)
      WHERE (value::text)::INTEGER IS NOT NULL
    )
  ), 0)
  INTO v_reactions_score
  FROM public.clips
  WHERE profile_id = p_profile_id
    AND status = 'live';

  -- Total reputation = listens + reactions
  v_total_reputation := v_listens_score + v_reactions_score;
  
  RETURN v_total_reputation;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add reputation column to profiles (cached value, updated via trigger)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS reputation INTEGER DEFAULT 0;

-- Create index for reputation queries
CREATE INDEX IF NOT EXISTS idx_profiles_reputation ON public.profiles(reputation DESC);

-- Function to update reputation for a user
CREATE OR REPLACE FUNCTION public.update_user_reputation(p_profile_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET reputation = public.calculate_user_reputation(p_profile_id)
  WHERE id = p_profile_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update reputation when clips change
CREATE OR REPLACE FUNCTION public.update_reputation_on_clip_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Update reputation for the clip owner
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.profile_id IS NOT NULL THEN
      PERFORM public.update_user_reputation(NEW.profile_id);
    END IF;
  END IF;
  
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF OLD.profile_id IS NOT NULL AND (OLD.profile_id != NEW.profile_id OR TG_OP = 'DELETE') THEN
      PERFORM public.update_user_reputation(OLD.profile_id);
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update reputation when clips are inserted/updated/deleted
DROP TRIGGER IF EXISTS trigger_update_reputation_on_clip_change ON public.clips;
CREATE TRIGGER trigger_update_reputation_on_clip_change
  AFTER INSERT OR UPDATE OR DELETE ON public.clips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reputation_on_clip_change();

-- Trigger function to update reputation when reactions change
CREATE OR REPLACE FUNCTION public.update_reputation_on_reaction_change()
RETURNS TRIGGER AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Get the profile_id of the clip owner
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    SELECT profile_id INTO v_profile_id
    FROM public.clips
    WHERE id = COALESCE(NEW.clip_id, OLD.clip_id);
    
    IF v_profile_id IS NOT NULL THEN
      PERFORM public.update_user_reputation(v_profile_id);
    END IF;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    SELECT profile_id INTO v_profile_id
    FROM public.clips
    WHERE id = OLD.clip_id;
    
    IF v_profile_id IS NOT NULL THEN
      PERFORM public.update_user_reputation(v_profile_id);
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update reputation when reactions are added/removed
DROP TRIGGER IF EXISTS trigger_update_reputation_on_reaction_change ON public.clip_reactions;
CREATE TRIGGER trigger_update_reputation_on_reaction_change
  AFTER INSERT OR UPDATE OR DELETE ON public.clip_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reputation_on_reaction_change();

-- Trigger to update reputation when listens are added
CREATE OR REPLACE FUNCTION public.update_reputation_on_listen_change()
RETURNS TRIGGER AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT profile_id INTO v_profile_id
    FROM public.clips
    WHERE id = NEW.clip_id;
    
    IF v_profile_id IS NOT NULL THEN
      PERFORM public.update_user_reputation(v_profile_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update reputation when listens are added
DROP TRIGGER IF EXISTS trigger_update_reputation_on_listen_change ON public.listens;
CREATE TRIGGER trigger_update_reputation_on_listen_change
  AFTER INSERT ON public.listens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reputation_on_listen_change();

-- Initialize reputation for all existing users
DO $$
DECLARE
  v_profile RECORD;
BEGIN
  FOR v_profile IN SELECT id FROM public.profiles LOOP
    PERFORM public.update_user_reputation(v_profile.id);
  END LOOP;
END $$;

