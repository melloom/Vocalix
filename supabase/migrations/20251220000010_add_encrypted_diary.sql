-- Add encrypted diary feature for users
-- Fully encrypted, password-protected diary entries

-- ============================================================================
-- 1. DIARY ENTRIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.diary_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Encrypted content (encrypted client-side before storage)
  encrypted_content TEXT NOT NULL,
  encrypted_title TEXT, -- Optional encrypted title
  
  -- Metadata (not encrypted, for sorting/filtering)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Tags/categories (encrypted JSON array)
  encrypted_tags TEXT,
  
  -- Mood/feeling (optional, encrypted)
  encrypted_mood TEXT,
  
  -- Entry metadata
  word_count INTEGER DEFAULT 0, -- Approximate word count (for stats)
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  
  -- Rich text support
  entry_type TEXT DEFAULT 'text' CHECK (entry_type IN ('text', 'rich_text', 'markdown')),
  
  -- Location (encrypted)
  encrypted_location TEXT,
  
  -- Weather (encrypted)
  encrypted_weather TEXT,
  
  -- Soft delete
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_diary_entries_profile ON public.diary_entries(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diary_entries_profile_active ON public.diary_entries(profile_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_diary_entries_favorite ON public.diary_entries(profile_id, is_favorite, created_at DESC) WHERE is_favorite = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_diary_entries_pinned ON public.diary_entries(profile_id, is_pinned, created_at DESC) WHERE is_pinned = true AND deleted_at IS NULL;

-- ============================================================================
-- 2. DIARY PASSWORD TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.diary_passwords (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Password/PIN hash (PBKDF2 with salt, stored client-side in encrypted form)
  -- Note: We store a hash of the password hash for verification
  -- The actual encryption key is derived from the password/PIN client-side
  password_hash TEXT NOT NULL, -- Hash of the password/PIN (for verification only)
  salt TEXT NOT NULL, -- Random salt for password/PIN hashing
  
  -- Authentication type
  auth_type TEXT NOT NULL DEFAULT 'password' CHECK (auth_type IN ('password', 'pin')), -- 'password' or 'pin'
  
  -- Security metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ,
  
  -- Failed unlock attempts tracking
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ, -- Lock diary after too many failed attempts
  
  -- Recovery options (encrypted)
  encrypted_hint TEXT, -- Optional password/PIN hint (encrypted)
  encrypted_recovery_questions TEXT, -- Encrypted recovery questions (JSON)
  encrypted_recovery_answers TEXT, -- Encrypted recovery answers (JSON, hashed)
  
  -- Security settings
  auto_lock_minutes INTEGER DEFAULT 30, -- Auto-lock after inactivity
  require_password_on_view BOOLEAN NOT NULL DEFAULT true,
  
  -- Password reset token (temporary, expires after use)
  reset_token TEXT,
  reset_token_expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_diary_passwords_profile ON public.diary_passwords(profile_id);

-- ============================================================================
-- 3. DIARY STATISTICS TABLE (for analytics without decrypting)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.diary_statistics (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  total_entries INTEGER NOT NULL DEFAULT 0,
  total_words INTEGER NOT NULL DEFAULT 0,
  longest_entry_words INTEGER DEFAULT 0,
  average_entry_words NUMERIC(10, 2) DEFAULT 0,
  
  first_entry_date TIMESTAMPTZ,
  last_entry_date TIMESTAMPTZ,
  
  entries_this_week INTEGER DEFAULT 0,
  entries_this_month INTEGER DEFAULT 0,
  entries_this_year INTEGER DEFAULT 0,
  
  current_streak_days INTEGER DEFAULT 0,
  longest_streak_days INTEGER DEFAULT 0,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diary_statistics_profile ON public.diary_statistics(profile_id);

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary_passwords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary_statistics ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own diary entries" ON public.diary_entries;
DROP POLICY IF EXISTS "Users can create their own diary entries" ON public.diary_entries;
DROP POLICY IF EXISTS "Users can update their own diary entries" ON public.diary_entries;
DROP POLICY IF EXISTS "Users can delete their own diary entries" ON public.diary_entries;

DROP POLICY IF EXISTS "Users can view their own diary password" ON public.diary_passwords;
DROP POLICY IF EXISTS "Users can create their own diary password" ON public.diary_passwords;
DROP POLICY IF EXISTS "Users can update their own diary password" ON public.diary_passwords;

DROP POLICY IF EXISTS "Users can view their own diary statistics" ON public.diary_statistics;
DROP POLICY IF EXISTS "Users can update their own diary statistics" ON public.diary_statistics;

-- Diary Entries Policies
CREATE POLICY "Users can view their own diary entries"
ON public.diary_entries FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND (
        p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
        OR EXISTS (
          SELECT 1
          FROM public.devices d
          WHERE d.device_id = current_setting('request.headers', true)::json->>'x-device-id'
            AND d.profile_id = p.id
        )
      )
  )
);

CREATE POLICY "Users can create their own diary entries"
ON public.diary_entries FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND (
        p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
        OR EXISTS (
          SELECT 1
          FROM public.devices d
          WHERE d.device_id = current_setting('request.headers', true)::json->>'x-device-id'
            AND d.profile_id = p.id
        )
      )
  )
);

CREATE POLICY "Users can update their own diary entries"
ON public.diary_entries FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND (
        p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
        OR EXISTS (
          SELECT 1
          FROM public.devices d
          WHERE d.device_id = current_setting('request.headers', true)::json->>'x-device-id'
            AND d.profile_id = p.id
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND (
        p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
        OR EXISTS (
          SELECT 1
          FROM public.devices d
          WHERE d.device_id = current_setting('request.headers', true)::json->>'x-device-id'
            AND d.profile_id = p.id
        )
      )
  )
);

CREATE POLICY "Users can delete their own diary entries"
ON public.diary_entries FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND (
        p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
        OR EXISTS (
          SELECT 1
          FROM public.devices d
          WHERE d.device_id = current_setting('request.headers', true)::json->>'x-device-id'
            AND d.profile_id = p.id
        )
      )
  )
);

-- Diary Passwords Policies
CREATE POLICY "Users can view their own diary password"
ON public.diary_passwords FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND (
        p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
        OR EXISTS (
          SELECT 1
          FROM public.devices d
          WHERE d.device_id = current_setting('request.headers', true)::json->>'x-device-id'
            AND d.profile_id = p.id
        )
      )
  )
);

CREATE POLICY "Users can create their own diary password"
ON public.diary_passwords FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND (
        p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
        OR EXISTS (
          SELECT 1
          FROM public.devices d
          WHERE d.device_id = current_setting('request.headers', true)::json->>'x-device-id'
            AND d.profile_id = p.id
        )
      )
  )
);

CREATE POLICY "Users can update their own diary password"
ON public.diary_passwords FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND (
        p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
        OR EXISTS (
          SELECT 1
          FROM public.devices d
          WHERE d.device_id = current_setting('request.headers', true)::json->>'x-device-id'
            AND d.profile_id = p.id
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND (
        p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
        OR EXISTS (
          SELECT 1
          FROM public.devices d
          WHERE d.device_id = current_setting('request.headers', true)::json->>'x-device-id'
            AND d.profile_id = p.id
        )
      )
  )
);

-- Diary Statistics Policies
CREATE POLICY "Users can view their own diary statistics"
ON public.diary_statistics FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND (
        p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
        OR EXISTS (
          SELECT 1
          FROM public.devices d
          WHERE d.device_id = current_setting('request.headers', true)::json->>'x-device-id'
            AND d.profile_id = p.id
        )
      )
  )
);

CREATE POLICY "Users can update their own diary statistics"
ON public.diary_statistics FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND (
        p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
        OR EXISTS (
          SELECT 1
          FROM public.devices d
          WHERE d.device_id = current_setting('request.headers', true)::json->>'x-device-id'
            AND d.profile_id = p.id
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND (
        p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
        OR EXISTS (
          SELECT 1
          FROM public.devices d
          WHERE d.device_id = current_setting('request.headers', true)::json->>'x-device-id'
            AND d.profile_id = p.id
        )
      )
  )
);

-- ============================================================================
-- 5. FUNCTIONS
-- ============================================================================

-- Function to update diary entry updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_diary_entry_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS diary_entry_updated_at ON public.diary_entries;
CREATE TRIGGER diary_entry_updated_at
  BEFORE UPDATE ON public.diary_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_diary_entry_updated_at();

-- Function to update diary statistics
CREATE OR REPLACE FUNCTION public.update_diary_statistics(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_entries INTEGER;
  v_total_words INTEGER;
  v_longest_entry_words INTEGER;
  v_average_entry_words NUMERIC;
  v_first_entry_date TIMESTAMPTZ;
  v_last_entry_date TIMESTAMPTZ;
  v_entries_this_week INTEGER;
  v_entries_this_month INTEGER;
  v_entries_this_year INTEGER;
BEGIN
  -- Calculate statistics from non-deleted entries
  SELECT 
    COUNT(*),
    COALESCE(SUM(word_count), 0),
    COALESCE(MAX(word_count), 0),
    COALESCE(AVG(word_count), 0),
    MIN(created_at),
    MAX(created_at)
  INTO 
    v_total_entries,
    v_total_words,
    v_longest_entry_words,
    v_average_entry_words,
    v_first_entry_date,
    v_last_entry_date
  FROM public.diary_entries
  WHERE profile_id = p_profile_id
    AND deleted_at IS NULL;

  -- Count entries by period
  SELECT COUNT(*) INTO v_entries_this_week
  FROM public.diary_entries
  WHERE profile_id = p_profile_id
    AND deleted_at IS NULL
    AND created_at >= date_trunc('week', now());

  SELECT COUNT(*) INTO v_entries_this_month
  FROM public.diary_entries
  WHERE profile_id = p_profile_id
    AND deleted_at IS NULL
    AND created_at >= date_trunc('month', now());

  SELECT COUNT(*) INTO v_entries_this_year
  FROM public.diary_entries
  WHERE profile_id = p_profile_id
    AND deleted_at IS NULL
    AND created_at >= date_trunc('year', now());

  -- Upsert statistics
  INSERT INTO public.diary_statistics (
    profile_id,
    total_entries,
    total_words,
    longest_entry_words,
    average_entry_words,
    first_entry_date,
    last_entry_date,
    entries_this_week,
    entries_this_month,
    entries_this_year,
    updated_at
  ) VALUES (
    p_profile_id,
    COALESCE(v_total_entries, 0),
    COALESCE(v_total_words, 0),
    COALESCE(v_longest_entry_words, 0),
    COALESCE(v_average_entry_words, 0),
    v_first_entry_date,
    v_last_entry_date,
    COALESCE(v_entries_this_week, 0),
    COALESCE(v_entries_this_month, 0),
    COALESCE(v_entries_this_year, 0),
    now()
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    total_entries = EXCLUDED.total_entries,
    total_words = EXCLUDED.total_words,
    longest_entry_words = EXCLUDED.longest_entry_words,
    average_entry_words = EXCLUDED.average_entry_words,
    first_entry_date = EXCLUDED.first_entry_date,
    last_entry_date = EXCLUDED.last_entry_date,
    entries_this_week = EXCLUDED.entries_this_week,
    entries_this_month = EXCLUDED.entries_this_month,
    entries_this_year = EXCLUDED.entries_this_year,
    updated_at = now();
END;
$$;

-- Trigger to update statistics when entries change
CREATE OR REPLACE FUNCTION public.trigger_update_diary_statistics()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.update_diary_statistics(COALESCE(NEW.profile_id, OLD.profile_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS diary_entry_statistics_update ON public.diary_entries;
CREATE TRIGGER diary_entry_statistics_update
  AFTER INSERT OR UPDATE OR DELETE ON public.diary_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_diary_statistics();

-- Function to generate password reset token
CREATE OR REPLACE FUNCTION public.generate_diary_reset_token(p_profile_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Generate a secure random token
  v_token := encode(gen_random_bytes(32), 'base64');
  v_expires_at := now() + interval '1 hour'; -- Token expires in 1 hour

  -- Store token in diary_passwords table
  UPDATE public.diary_passwords
  SET reset_token = v_token,
      reset_token_expires_at = v_expires_at
  WHERE profile_id = p_profile_id;

  RETURN v_token;
END;
$$;

-- Function to verify and use reset token
CREATE OR REPLACE FUNCTION public.verify_diary_reset_token(p_profile_id UUID, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_valid BOOLEAN := false;
BEGIN
  -- Check if token exists, matches, and hasn't expired
  SELECT EXISTS (
    SELECT 1
    FROM public.diary_passwords
    WHERE profile_id = p_profile_id
      AND reset_token = p_token
      AND reset_token_expires_at > now()
  ) INTO v_valid;

  -- If valid, clear the token (one-time use)
  IF v_valid THEN
    UPDATE public.diary_passwords
    SET reset_token = NULL,
        reset_token_expires_at = NULL
    WHERE profile_id = p_profile_id;
  END IF;

  RETURN v_valid;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_diary_statistics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_diary_reset_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_diary_reset_token(UUID, TEXT) TO authenticated;

