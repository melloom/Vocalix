# ⚠️ IMPORTANT: Apply Migration to Fix QR Code Generation

The migration file is ready but **hasn't been applied to your database yet**. You're seeing:
- ❌ 404 error: `create_magic_login_link` function doesn't exist
- ❌ `function digest(text, unknown) does not exist` - pgcrypto extension not enabled

## 🚀 Quick Fix (2 minutes)

### Option 1: Supabase Dashboard (Easiest - Recommended)

1. **Open your Supabase Dashboard**
   - Go to: https://supabase.com/dashboard
   - Select your project: `xgblxtopsapvacyaurcr`

2. **Open SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New query"

3. **Copy and paste the migration**
   - Open the file: `supabase/migrations/20250103000000_fix_get_user_devices_ambiguous_column.sql`
   - Select ALL the contents (Ctrl+A, Ctrl+C)
   - Paste into the SQL Editor (Ctrl+V)

4. **Run the migration**
   - Click the "Run" button (or press Ctrl+Enter)
   - Wait for "Success" message

5. **Verify it worked**
   - You should see messages like:
     - "CREATE EXTENSION" (for pgcrypto)
     - "CREATE OR REPLACE FUNCTION" (multiple functions)
     - "GRANT EXECUTE" (permissions)

6. **Test in your app**
   - Refresh your browser
   - Try clicking "Show QR" button again
   - It should work now! ✅

### Option 2: Supabase CLI

If you have Supabase CLI installed:

```bash
# Navigate to your project
cd "c:\Users\Mperalta\Desktop\echo-garden-49-main"

# Link to your Supabase project (if not already)
supabase link --project-ref xgblxtopsapvacyaurcr

# Push the migration
supabase db push
```

## ✅ What This Migration Fixes

1. ✅ **Enables pgcrypto extension** - Required for `digest()` function
2. ✅ **Creates `create_magic_login_link()` function** - Fixes 404 error
3. ✅ **Fixes `get_user_devices()` function** - Removes ambiguous column errors
4. ✅ **Fixes `get_active_sessions()` function** - Removes 400 errors

## 🔍 Verification Queries

After running the migration, you can verify in SQL Editor:

```sql
-- Check if pgcrypto is enabled
SELECT * FROM pg_extension WHERE extname = 'pgcrypto';

-- Check if function exists
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'create_magic_login_link';

-- Check function permissions
SELECT routine_name, grantee 
FROM information_schema.routine_privileges 
WHERE routine_schema = 'public' 
  AND routine_name = 'create_magic_login_link';
```

## ❓ Troubleshooting

**If you get permission errors:**
- Make sure you're logged into Supabase with the right account
- The account needs to be a project owner or have SQL execution permissions

**If the migration partially runs:**
- That's okay! The `CREATE OR REPLACE` and `CREATE EXTENSION IF NOT EXISTS` commands are idempotent
- You can run it again safely

**If you still see errors after running:**
- Clear your browser cache
- Hard refresh (Ctrl+Shift+R)
- Check the browser console for any new errors

---

**After applying this migration, your QR code generation should work perfectly! 🎉**

