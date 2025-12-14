# 🚨 URGENT: Fix QR Code Error - Step by Step

## ❌ Current Problem
- 404 error: Function doesn't exist
- `function digest(text, unknown) does not exist` - pgcrypto not enabled

## ✅ Solution: Run SQL in Supabase Dashboard

**You MUST run the SQL file in Supabase Dashboard. The file just sitting on your computer won't fix anything!**

---

## 📋 Step-by-Step Instructions

### Step 1: Open Supabase Dashboard
1. Go to: **https://supabase.com/dashboard**
2. Sign in if needed
3. Click on your project: **xgblxtopsapvacyaurcr**

### Step 2: Open SQL Editor
1. Look at the **left sidebar**
2. Click on **"SQL Editor"** (it has a SQL icon)
3. Click **"New query"** button (top right)

### Step 3: Copy the Fix SQL
1. Open the file: **`FIX_QR_CODE_NOW.sql`** (in your project folder)
2. Press **Ctrl+A** to select all
3. Press **Ctrl+C** to copy

### Step 4: Paste and Run
1. In the Supabase SQL Editor, click in the text area
2. Press **Ctrl+V** to paste the SQL
3. Click the **"Run"** button (or press **Ctrl+Enter**)
4. **Wait for the success message** - you should see:
   - "Success. No rows returned" or
   - Success messages with checkmarks ✅

### Step 5: Verify It Worked (Optional)
Run this in SQL Editor to verify:

```sql
-- Check if pgcrypto is enabled
SELECT EXISTS (
  SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
) AS pgcrypto_enabled;

-- Check if function exists
SELECT COUNT(*) AS function_count
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'create_magic_login_link';
```

You should see:
- `pgcrypto_enabled: true`
- `function_count: 1` (or more)

### Step 6: Wait for PostgREST Cache (Important!)
PostgREST (Supabase's API layer) needs to refresh its cache:
- **Wait 1-2 minutes** after running the SQL
- This is normal - PostgREST caches the database schema

### Step 7: Test in Your App
1. **Hard refresh your browser**: Press **Ctrl+Shift+R**
2. Go to Settings → Account tab
3. Click **"Show QR"** button
4. It should work now! ✅

---

## 🆘 If It Still Doesn't Work After 5 Minutes

If you still see 404 errors after 5 minutes, it's a PostgREST cache issue:

1. **Contact Supabase Support**:
   - Go to: https://supabase.com/dashboard/support
   - Create a support ticket
   - Say: "Please refresh PostgREST schema cache for project xgblxtopsapvacyaurcr. The function `create_magic_login_link` exists but returns 404."

2. **Or wait longer**: PostgREST auto-refreshes every 5-15 minutes

---

## 🔍 Quick Verification Query

Before running the fix, you can check current state:

Run `VERIFY_CURRENT_STATE.sql` in SQL Editor - it will tell you what's missing.

---

## ✅ After Success

Once it works, you'll be able to:
- ✅ Generate login links
- ✅ Show QR codes
- ✅ Link devices to your account

---

**Remember: The SQL file on your computer does NOTHING until you run it in Supabase Dashboard!**

