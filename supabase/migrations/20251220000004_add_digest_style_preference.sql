-- Add digest_style preference to profiles to control how rich digests should be

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS digest_style TEXT
    CHECK (digest_style IN ('quiet', 'normal', 'energizing'))
    DEFAULT 'normal';


