# Migration to Supabase Auth (Anonymous) - Instructions

## ✅ What's Been Done

1. ✅ Created migration SQL (`supabase/migrations/20250118000000_switch_to_supabase_auth.sql`)
2. ✅ Updated `AuthContext.tsx` to use Supabase Auth
3. ✅ Updated `OnboardingFlow.tsx` to use Supabase Auth

## 📋 Steps to Complete Migration

### Step 1: Enable Anonymous Auth in Supabase

1. Go to: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/auth/providers
2. Find "Anonymous" provider
3. Click "Enable"
4. Save

### Step 2: Run the Migration SQL

1. Go to: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/sql/new
2. Copy and run: `supabase/migrations/20250118000000_switch_to_supabase_auth.sql`
3. This will:
   - Add `auth_user_id` column to profiles
   - Update RLS policies to support both auth.uid() and device-based (backward compatibility)

### Step 3: Test the Changes

1. Clear browser localStorage
2. Refresh the app
3. Try creating a new account
4. It should automatically sign in anonymously and create a profile

## 🔄 Backward Compatibility

The migration keeps backward compatibility:
- Old device-based profiles still work
- New profiles use Supabase Auth
- RLS policies support both methods

## 🎯 Benefits

- ✅ No more PostgREST cache issues (no custom RPC functions needed!)
- ✅ Automatic session management
- ✅ Cross-browser support built-in
- ✅ Simpler code
- ✅ Better security

## ⚠️ Remaining Tasks

- [ ] Update LoginLink.tsx to use Supabase Auth
- [ ] Remove device-based auth code from client.ts (optional - can keep for backward compat)
- [ ] Update other components that use deviceId

## 🚀 Next Steps

After testing, you can:
1. Migrate existing profiles to link them to auth users
2. Remove device-based code completely (optional)
3. Update remaining RLS policies
