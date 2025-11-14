-- Telemetry events capture for client instrumentation
CREATE TABLE IF NOT EXISTS public.events (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    event_name IN (
      'app_open',
      'record_start',
      'record_publish',
      'listen_start',
      'listen_complete',
      'reaction_tap'
    )
  )
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Events insertable by device owners"
ON public.events FOR INSERT
WITH CHECK (
  device_id = current_setting('request.headers', true)::json->>'x-device-id'
);
CREATE POLICY "Events selectable by service role"
ON public.events FOR SELECT
USING (auth.role() = 'service_role');
CREATE INDEX IF NOT EXISTS events_device_created_idx
ON public.events (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS events_event_created_idx
ON public.events (event_name, created_at DESC);
