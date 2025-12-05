# Pseudo ID Setup Guide

This document explains how to set up and use the device ID pseudonymization system for enhanced privacy.

## Overview

The pseudo_id system uses HMAC hashing to create pseudonymized device IDs. This provides:
- **Privacy**: Raw device IDs are never stored in the database
- **Consistency**: Same device always gets the same pseudo_id
- **Security**: Cannot reverse pseudo_id without the secret key

## Setup Steps

### 1. Set the Secret Key

You need to set the `DEVICE_HASH_SECRET` environment variable in Supabase:

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Edge Functions** → **Secrets**
3. Add a new secret:
   - **Name**: `DEVICE_HASH_SECRET`
   - **Value**: A long, random string (at least 32 characters)
   - Generate one using: `openssl rand -hex 32`

**Important**: Keep this secret secure and never commit it to version control.

### 2. Deploy Edge Functions

Deploy both edge functions:

```bash
# Deploy pseudonymize-device function
npx supabase functions deploy pseudonymize-device

# Deploy migration function (for existing users)
npx supabase functions deploy migrate-pseudo-ids
```

### 3. Run Database Migration

Apply the database migration to add the `pseudo_id` column:

```bash
npx supabase db push
```

Or manually run the migration file:
- `supabase/migrations/20250105000000_add_pseudo_id_for_pseudonymity.sql`

### 4. Migrate Existing Users

Run the migration function to populate `pseudo_id` for existing users:

```bash
# Get your service role key from Supabase dashboard
# Settings → API → service_role key

curl -X POST \
  'https://YOUR_PROJECT.supabase.co/functions/v1/migrate-pseudo-ids' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

**Note**: This processes 100 profiles at a time. Run it multiple times until it returns "No profiles to migrate".

### 5. Add Unique Constraint (After Migration)

Once all existing users are migrated, add a unique constraint:

```sql
-- Run this in Supabase SQL Editor after migration is complete
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_pseudo_id_unique UNIQUE (pseudo_id)
WHERE pseudo_id IS NOT NULL;
```

## How It Works

### For New Users

1. User opens app → Device ID is generated/stored locally
2. On first launch → Device ID is sent to `pseudonymize-device` function
3. Function returns `pseudo_id` (HMAC hash)
4. Profile is created with `pseudo_id`
5. `pseudo_id` is stored locally for future lookups

### For Existing Users

1. Migration script processes all profiles without `pseudo_id`
2. For each profile, it:
   - Takes the existing `device_id`
   - Generates `pseudo_id` using HMAC
   - Updates the profile with `pseudo_id`

### Profile Lookup Priority

The system looks up profiles in this order:
1. **pseudo_id** (new, most privacy-preserving)
2. **device_id** (backward compatibility)
3. **auth_user_id** (Supabase auth)
4. **profile id** (stored in localStorage)

## Web vs Mobile

### Web
- Generates a random UUID on first visit
- Stores in `localStorage`
- Same UUID persists across sessions

### Mobile (Future)
- Can use device-specific ID (IDFV on iOS, Android ID on Android)
- Or generate UUID and store securely
- Would use React Native libraries like `expo-device` or `react-native-device-info`

## "Burn Persona" Feature

Users can reset their persona:
1. Clear `pseudo_id` from localStorage
2. Generate new device ID
3. Create new profile with new `pseudo_id`
4. Old profile and all data remain (or can be deleted)

## Security Considerations

1. **Never log raw device IDs** in production
2. **Never store device IDs** in database (only `pseudo_id`)
3. **Rotate secret** periodically if compromised
4. **Use strong secret** (32+ random characters)
5. **Limit access** to migration function (admin only)

## Testing

1. Clear localStorage: `localStorage.clear()`
2. Open app → Should generate new device ID
3. Check network tab → Should see call to `pseudonymize-device`
4. Check database → Profile should have `pseudo_id` populated
5. Refresh page → Should find profile by `pseudo_id`

## Troubleshooting

### "DEVICE_HASH_SECRET not configured"
- Make sure you set the secret in Supabase Edge Functions secrets
- Redeploy the function after setting the secret

### Migration returns 0 migrated
- Check that profiles have `device_id` populated
- Check that `pseudo_id` is NULL for those profiles
- Verify the function has service role key access

### Profile not found after migration
- Check that `pseudo_id` was populated in database
- Verify the lookup is using the correct `pseudo_id`
- Check browser console for errors

