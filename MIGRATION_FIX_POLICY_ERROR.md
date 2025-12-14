# Migration Fix - Policy Already Exists Error

## ❌ Error
```
ERROR: 42710: policy "nsfw_regulations_readable_by_all" for table "nsfw_space_regulations" already exists
```

## ✅ Fix Applied

Updated `supabase/migrations/20260113000000_add_18plus_space_backend_functions.sql` to drop the policy before creating it:

```sql
-- Everyone can read regulations
DROP POLICY IF EXISTS "nsfw_regulations_readable_by_all" ON public.nsfw_space_regulations;
CREATE POLICY "nsfw_regulations_readable_by_all"
ON public.nsfw_space_regulations FOR SELECT
USING (is_active = true);
```

Also fixed the same pattern in `supabase/migrations/20260113000001_add_nsfw_automated_analysis_and_reporting.sql`:

```sql
-- Only admins can read analysis logs
DROP POLICY IF EXISTS "nsfw_logs_readable_by_admins" ON public.nsfw_analysis_logs;
CREATE POLICY "nsfw_logs_readable_by_admins"
ON public.nsfw_analysis_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE profile_id = auth.uid()
  )
);
```

## ✅ Status

- [x] First migration file fixed
- [x] Second migration file fixed
- [x] All policies now use DROP IF EXISTS before CREATE
- [x] Migrations should now run without errors

## 🚀 Next Steps

Run the migrations again - they should work now!

