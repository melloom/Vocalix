# Enable Anonymous Auth in Supabase

## The 422 Error

The error you're seeing (`422` from `/auth/v1/signup`) means **Anonymous Auth is not enabled** in your Supabase project.

## How to Fix

### Step 1: Enable Anonymous Auth

1. Go to: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/auth/providers
2. Scroll down to find **"Anonymous"** provider
3. Click the toggle to **Enable** it
4. Click **Save**

### Step 2: Test Again

1. Refresh your browser
2. The app should now sign in anonymously automatically
3. No more 422 errors!

## What Happens After Enabling

- ✅ Users will automatically sign in anonymously when they visit
- ✅ Sessions are managed automatically by Supabase
- ✅ Cross-browser support works out of the box
- ✅ No more PostgREST cache issues!

## Note

The app will still work even if anonymous auth fails (it just won't have a user ID). But to get full functionality, you need to enable it.

