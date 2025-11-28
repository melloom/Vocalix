# 🔧 Simple Fix Steps

## Step 1: Run the Diagnostic Script

1. **Open Supabase SQL Editor**
   - Go to: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/sql/new

2. **Open `DIAGNOSE_AND_FIX.sql`**
   - Copy ALL contents (Ctrl+A, Ctrl+C)

3. **Paste and Run**
   - Paste into SQL Editor
   - Click **Run** or press **Ctrl+Enter**

4. **Check Results**
   - Look for all ✅ checkmarks
   - All sections should show success

## Step 2: Wait and Test

1. **Wait 2-3 minutes** for PostgREST cache refresh
2. **Hard refresh browser**: Press **Ctrl+Shift+R**
3. **Try QR code generation** again

## What This Script Does

✅ **Checks and enables pgcrypto**  
✅ **Recreates the function** with explicit pgcrypto reference  
✅ **Uses `pgcrypto.digest()`** instead of just `digest()`  
✅ **Grants all permissions**  
✅ **Verifies everything works**

## Key Fix

The script uses `SET search_path = public, pgcrypto` and `pgcrypto.digest()` to ensure the digest function is found even if pgcrypto isn't in the default search path.

## If Still Not Working

After 5 minutes, if you still get errors:

1. **Contact Supabase Support**
   - Go to: https://supabase.com/dashboard/support
   - Request: "Please refresh PostgREST schema cache for project xgblxtopsapvacyaurcr"

2. **Or check what error you're getting**
   - Open browser console (F12)
   - Try generating QR code
   - Tell me the exact error message

---

**Run `DIAGNOSE_AND_FIX.sql` now - it fixes everything in one go!** 🚀

