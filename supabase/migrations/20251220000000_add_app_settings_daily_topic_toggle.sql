-- App settings table for global feature flags (including daily topic AI toggle)

CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Simple helper to get a boolean setting with a default
CREATE OR REPLACE FUNCTION public.get_app_setting_bool(p_key TEXT, p_default BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_value BOOLEAN;
BEGIN
  SELECT (value->>'value')::BOOLEAN
  INTO v_value
  FROM public.app_settings
  WHERE key = p_key;

  IF v_value IS NULL THEN
    RETURN p_default;
  END IF;

  RETURN v_value;
END;
$$;

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.handle_updated_at_app_settings()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_app_settings ON public.app_settings;
CREATE TRIGGER set_updated_at_app_settings
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at_app_settings();

-- Seed default setting: enable AI daily topics by default
INSERT INTO public.app_settings (key, value)
VALUES ('use_ai_daily_topics', jsonb_build_object('value', true))
ON CONFLICT (key) DO NOTHING;


