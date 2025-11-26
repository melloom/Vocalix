# Transfer Admin Account from Local to Production

This guide will help you transfer your admin account from your local development environment to production.

## Step 1: Get Your Local Profile ID

1. **Open your local Echo Garden app** in your browser
2. **Open Developer Console** (F12 or Right-click → Inspect → Console)
3. **Copy and paste this command** (make sure to copy only the code, not the markdown):
   ```
   localStorage.getItem('profileId')
   ```
   Or use this version:
   ```
   console.log(localStorage.getItem('profileId'))
   ```
4. **Press Enter** - the Profile ID will be displayed (it will look like: `123e4567-e89b-12d3-a456-426614174000`)
5. **Copy the Profile ID** from the console output

## Step 2: Get Your Production Profile ID

**First, check if you have a profile in production:**

1. **Go to your production Echo Garden app**
2. **Open Developer Console** (F12)
3. **Copy and paste this command**:
   ```
   localStorage.getItem('profileId')
   ```
4. **Press Enter**

### If you see `null` (no profile yet):

You need to create a profile first:

1. **Complete the onboarding** in your production app:
   - Go to your production Echo Garden URL
   - You should see an onboarding flow
   - Follow the steps to create your profile (choose emoji, handle, etc.)
   - Once complete, you'll be logged in

2. **After onboarding, get your Profile ID**:
   - Open Developer Console (F12)
   - Run: `localStorage.getItem('profileId')`
   - Copy the Profile ID that appears

### If you see a Profile ID:

Great! You already have a profile. Copy that Profile ID and proceed to Step 3.

## Step 3: Transfer Admin Access to Production

**Important:** You need to complete onboarding in production first to get a Profile ID. Once you have your production Profile ID, follow these steps:

1. **Go to your Supabase Production Dashboard**
2. **Open SQL Editor**
3. **Run this SQL script** (replace `YOUR_PRODUCTION_PROFILE_ID` with your actual production profile ID from Step 2):

```sql
-- Transfer admin access to production profile
-- Replace 'YOUR_PRODUCTION_PROFILE_ID' with your actual production profile ID

-- Option 1: Add yourself as admin (keeps existing admins)
INSERT INTO public.admins (profile_id, role, created_at)
VALUES ('YOUR_PRODUCTION_PROFILE_ID'::uuid, 'admin', now())
ON CONFLICT (profile_id) DO UPDATE 
SET role = 'admin', created_at = now();

-- Option 2: Remove all admins and make only yourself admin (uncomment if you want this)
-- DELETE FROM public.admins;
-- INSERT INTO public.admins (profile_id, role, created_at)
-- VALUES ('YOUR_PRODUCTION_PROFILE_ID'::uuid, 'admin', now());
```

## Step 4: Verify Admin Access

Run this SQL to verify you're an admin in production:

```sql
-- Verify admin access
SELECT 
  p.handle,
  p.emoji_avatar,
  a.role,
  a.created_at
FROM public.admins a
JOIN public.profiles p ON p.id = a.profile_id
ORDER BY a.created_at DESC;
```

## Step 5: Test Admin Access

1. **Navigate to** `/admin` in your production app
   - Example: `https://yourdomain.com/admin`
2. **You should now see**:
   - Security metrics dashboard
   - Moderation queue
   - User management
   - Reports management

## Important Notes

- **Maximum 2 Admins**: The system allows a maximum of 2 admins. If you hit this limit, you'll need to remove an existing admin first.
- **Profile IDs are Different**: Your local profile ID and production profile ID will be different unless you're using the same database.
- **Device Linking**: After transferring admin access, you can use the "Access on your phone" feature in Settings to link your devices.

## Troubleshooting

### "Maximum of 2 admins allowed" Error

If you get this error, you need to remove an existing admin first:

```sql
-- See current admins
SELECT 
  p.handle,
  p.emoji_avatar,
  a.profile_id,
  a.created_at
FROM public.admins a
JOIN public.profiles p ON p.id = a.profile_id;

-- Remove a specific admin (replace with the profile_id you want to remove)
DELETE FROM public.admins
WHERE profile_id = 'PROFILE_ID_TO_REMOVE'::uuid;

-- Then add yourself
INSERT INTO public.admins (profile_id, role, created_at)
VALUES ('YOUR_PRODUCTION_PROFILE_ID'::uuid, 'admin', now());
```

### Can't Access Admin Dashboard

1. **Clear your browser cache** and refresh
2. **Check that your profile ID matches** what's in the admins table
3. **Verify you're logged in** with the correct profile in production

