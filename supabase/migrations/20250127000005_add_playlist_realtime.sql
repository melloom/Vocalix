-- Collaborative Playlists Real-time Updates
-- Adds real-time subscriptions for collaborative playlist updates

-- Function to notify playlist collaborators of changes
CREATE OR REPLACE FUNCTION public.notify_playlist_collaborators()
RETURNS TRIGGER AS $$
DECLARE
  v_playlist_id UUID;
  v_change_type TEXT;
BEGIN
  -- Determine playlist_id and change type
  IF TG_TABLE_NAME = 'playlist_clips' THEN
    v_playlist_id := COALESCE(NEW.playlist_id, OLD.playlist_id);
    v_change_type := TG_OP;
  ELSIF TG_TABLE_NAME = 'playlists' THEN
    v_playlist_id := NEW.id;
    v_change_type := TG_OP;
  ELSIF TG_TABLE_NAME = 'playlist_collaborators' THEN
    v_playlist_id := COALESCE(NEW.playlist_id, OLD.playlist_id);
    v_change_type := TG_OP;
  END IF;

  -- Notify via Supabase realtime (this is handled client-side via postgres_changes)
  -- This function can be extended for push notifications if needed
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Add updated_at trigger for playlists to track changes
CREATE OR REPLACE FUNCTION public.update_playlist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_playlist_updated_at ON public.playlists;
CREATE TRIGGER trigger_update_playlist_updated_at
  BEFORE UPDATE ON public.playlists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_playlist_updated_at();

-- Note: Real-time updates are handled client-side via Supabase Realtime subscriptions
-- The schema changes here enable real-time subscriptions to work properly
-- Clients should subscribe to:
-- - playlist_clips changes (INSERT, UPDATE, DELETE) filtered by playlist_id
-- - playlists changes (UPDATE) filtered by id
-- - playlist_collaborators changes (INSERT, DELETE) filtered by playlist_id

COMMENT ON FUNCTION public.notify_playlist_collaborators() IS 'Placeholder function for playlist collaboration notifications. Real-time updates are handled via Supabase Realtime client-side subscriptions.';

