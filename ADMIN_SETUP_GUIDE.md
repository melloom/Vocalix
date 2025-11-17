# Admin Dashboard Setup Guide

This guide explains how to access the admin dashboard and restrict access to only yourself.

## 🚀 How to Access the Admin Dashboard

### Step 1: Get Your Profile ID

1. **Open your browser** and go to your Echo Garden app
2. **Open Developer Console** (F12 or Right-click → Inspect → Console)
3. **Run this command** to get your profile ID:
   ```javascript
   console.log('Profile ID:', localStorage.getItem('profileId'));
   ```
4. **Copy the Profile ID** (it will look like: `123e4567-e89b-12d3-a456-426614174000`)

### Step 2: Make Yourself an Admin

1. **Go to your Supabase Dashboard**
2. **Open SQL Editor**
3. **Run this SQL script** (replace `YOUR_PROFILE_ID` with your actual profile ID):

```sql
-- Make yourself the only admin
-- Replace 'YOUR_PROFILE_ID' with your actual profile ID from Step 1

-- First, remove all existing admins (optional - only if you want to be the only admin)
DELETE FROM public.admins;

-- Add yourself as admin
INSERT INTO public.admins (profile_id, role, created_at)
VALUES ('YOUR_PROFILE_ID'::uuid, 'admin', now())
ON CONFLICT (profile_id) DO UPDATE 
SET role = 'admin', created_at = now();

-- Verify you're now an admin
SELECT p.handle, p.emoji_avatar, a.role, a.created_at
FROM public.admins a
JOIN public.profiles p ON p.id = a.profile_id;
```

### Step 3: Access the Admin Dashboard

1. **Navigate to** `/admin` in your app
   - Example: `http://localhost:5173/admin` (local)
   - Example: `https://yourdomain.com/admin` (production)

2. **You should now see**:
   - Security metrics dashboard
   - Moderation queue
   - User management
   - Reports management

## 🔒 Restrict Access to Only You

### Option 1: Remove All Other Admins (Recommended)

Run this SQL to remove all admins except yourself:

```sql
-- Remove all admins except yourself
-- Replace 'YOUR_PROFILE_ID' with your actual profile ID

DELETE FROM public.admins
WHERE profile_id != 'YOUR_PROFILE_ID'::uuid;
```

### Option 2: Create a Secure Admin Setup Script

Create a migration file to set up your admin account securely:

```sql
-- Migration: Setup single admin
-- Replace 'YOUR_PROFILE_ID' with your actual profile ID

-- Remove all existing admins
DELETE FROM public.admins;

-- Add yourself as the only admin
INSERT INTO public.admins (profile_id, role, created_at)
VALUES ('YOUR_PROFILE_ID'::uuid, 'admin', now());

-- Add constraint to prevent easy admin creation (optional)
-- This prevents direct INSERT without proper permissions
```

### Option 3: Use Environment Variable for Admin Profile ID

1. **Add to your `.env` file**:
   ```
   ADMIN_PROFILE_ID=your-profile-id-here
   ```

2. **Create a secure admin setup function** (only you can run this)

## 📊 Admin Dashboard Features

### Security Metrics
- **Critical Events (24h)**: Number of critical security events in last 24 hours
- **Error Events (24h)**: Number of error events in last 24 hours
- **Total Banned**: Total number of banned profiles
- **Recently Banned (24h)**: Profiles banned in last 24 hours
- **Suspicious Devices**: Number of suspicious devices
- **Revoked Devices**: Number of revoked devices

### Moderation Queue
- **AI Flags**: Clips flagged by AI moderation
- **Community Reports**: Clips reported by users
- **Priority Sorting**: Sort by risk, newest, or oldest
- **Bulk Actions**: Approve, hide, or remove multiple clips at once

### User Management
- **View All Users**: See all registered users
- **User Details**: View user profiles, clips, and activity
- **Ban/Unban Users**: Manage user bans
- **User Activity**: View user activity logs

### Reports Management
- **View All Reports**: See all user reports
- **Report Details**: View detailed report information
- **Report Status**: Track report resolution status
- **Bulk Actions**: Handle multiple reports at once

## 🛡️ Security Best Practices

1. **Keep Your Profile ID Secret**: Don't share your profile ID publicly
2. **Use Strong Device ID**: Ensure your device ID is secure
3. **Monitor Admin Access**: Regularly check who has admin access
4. **Audit Logs**: Review security audit logs regularly
5. **Rotate Access**: Change admin access periodically if needed

## 🔧 Troubleshooting

### "Admin access required" Error

**Problem**: You see "Admin access required" even after setting up admin access.

**Solution**:
1. Verify your profile ID is correct in the `admins` table
2. Check that your device ID matches your profile
3. Clear browser cache and localStorage
4. Restart your app

### Can't Access Admin Dashboard

**Problem**: You can't access `/admin` route.

**Solution**:
1. Check that the route exists in `src/App.tsx`
2. Verify you're logged in (have a profile ID)
3. Check browser console for errors
4. Verify admin-review edge function is deployed

### Other Users Can Access Admin

**Problem**: Other users can access the admin dashboard.

**Solution**:
1. Remove all other admins from the `admins` table
2. Verify RLS policies are correct
3. Check edge function permissions
4. Review security audit logs

## 📝 Quick Reference

### Check if You're an Admin

Run this SQL:
```sql
SELECT p.handle, a.role
FROM public.admins a
JOIN public.profiles p ON p.id = a.profile_id
WHERE p.device_id = 'YOUR_DEVICE_ID';
```

### List All Admins

```sql
SELECT p.handle, p.emoji_avatar, a.role, a.created_at
FROM public.admins a
JOIN public.profiles p ON p.id = a.profile_id
ORDER BY a.created_at DESC;
```

### Remove an Admin

```sql
DELETE FROM public.admins
WHERE profile_id = 'PROFILE_ID_TO_REMOVE'::uuid;
```

### Add Another Admin (if needed)

```sql
INSERT INTO public.admins (profile_id, role, created_at)
VALUES ('PROFILE_ID'::uuid, 'moderator', now());
```

## 🚨 Important Notes

- **Only you should have admin access** for security
- **Backup your admin profile ID** in a secure location
- **Monitor admin actions** in security audit logs
- **Regularly review** who has admin access
- **Use strong security practices** when managing admin access

---

**Last Updated**: 2025-01-XX
**Version**: 1.0

