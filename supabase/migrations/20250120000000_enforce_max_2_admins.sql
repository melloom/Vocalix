-- Enforce Maximum of 2 Admins
-- This migration ensures only 2 admins can exist in the system (main + backup)

-- Create a function to check admin count before insert/update
CREATE OR REPLACE FUNCTION public.check_admin_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_count INTEGER;
BEGIN
  -- Count current admins (excluding the one being inserted/updated if it's an update)
  SELECT COUNT(*) INTO current_count
  FROM public.admins
  WHERE profile_id != COALESCE(NEW.profile_id, '00000000-0000-0000-0000-000000000000'::uuid);
  
  -- If we're at the limit (2) and this is a new admin, prevent insertion
  IF current_count >= 2 THEN
    RAISE EXCEPTION 'Maximum of 2 admins allowed. Current count: %. Please remove an existing admin before adding a new one.', current_count;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to enforce limit on INSERT
DROP TRIGGER IF EXISTS enforce_admin_limit_insert ON public.admins;
CREATE TRIGGER enforce_admin_limit_insert
  BEFORE INSERT ON public.admins
  FOR EACH ROW
  EXECUTE FUNCTION public.check_admin_limit();

-- Note: We don't need a trigger on UPDATE because UPDATE won't change the count
-- But we should still check on UPDATE in case someone tries to update a non-admin to admin
CREATE OR REPLACE FUNCTION public.check_admin_limit_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_count INTEGER;
  was_admin BOOLEAN;
BEGIN
  -- Check if the profile was already an admin
  SELECT EXISTS(SELECT 1 FROM public.admins WHERE profile_id = NEW.profile_id) INTO was_admin;
  
  -- If it wasn't an admin before, we need to check the limit
  IF NOT was_admin THEN
    SELECT COUNT(*) INTO current_count
    FROM public.admins;
    
    IF current_count >= 2 THEN
      RAISE EXCEPTION 'Maximum of 2 admins allowed. Current count: %. Please remove an existing admin before adding a new one.', current_count;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.check_admin_limit() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_admin_limit_update() TO service_role;

-- Add a comment to the table
COMMENT ON TABLE public.admins IS 'Maximum of 2 admins allowed (main + backup). Enforced by triggers.';

-- Verify current admin count
DO $$
DECLARE
  admin_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO admin_count FROM public.admins;
  
  IF admin_count > 2 THEN
    RAISE WARNING 'WARNING: There are currently % admins in the system. The limit is 2. Please remove excess admins.', admin_count;
  ELSIF admin_count = 0 THEN
    RAISE NOTICE 'INFO: No admins currently in the system. Add your main admin account.';
  ELSIF admin_count = 1 THEN
    RAISE NOTICE 'INFO: 1 admin in the system. You can add 1 more backup admin.';
  ELSE
    RAISE NOTICE 'INFO: 2 admins in the system (main + backup). Limit reached.';
  END IF;
END $$;

