# Migration Instructions

## Quick Method: Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard SQL Editor:**
   - Go to: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/sql/new

2. **Copy the migration file:**
   - Open `COMBINED_MIGRATION.sql` in this directory
   - Copy all contents (Ctrl+A, Ctrl+C)

3. **Paste and run:**
   - Paste into the SQL Editor
   - Click "Run" button
   - Wait for completion (should take a few seconds)

## Alternative: Using Supabase CLI

If you have Supabase CLI linked to your project:

```bash
# Link to your project (if not already linked)
npx supabase link --project-ref xgblxtopsapvacyaurcr

# Push migrations
npx supabase db push
```

## What These Migrations Do

### 1. Rate Limiting (`20251120000001_add_rate_limiting.sql`)
- Creates `rate_limit_logs` table for tracking API requests
- Adds rate limiting functions
- Enables rate limiting on profile updates

### 2. Device Security (`20251120000002_device_security.sql`)
- Adds security metadata to devices table (IP, user agent, timestamps)
- Creates `security_audit_log` table
- Adds functions for:
  - Device activity tracking
  - Security event logging
  - Suspicious activity detection
  - Device revocation

### 3. Device View Policy (`20251120000003_device_view_policy.sql`)
- Allows users to view all devices associated with their profile
- Required for the Device Activity section in Settings

### 4. Get User Devices RPC (`20251120000004_get_user_devices_rpc.sql`)
- Creates `get_user_devices()` function
- Securely returns all devices for the current user
- Used by the Settings page to display device list

## Verification

After running migrations, verify they worked:

1. **Check tables exist:**
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('rate_limit_logs', 'security_audit_log');
   ```

2. **Check functions exist:**
   ```sql
   SELECT routine_name 
   FROM information_schema.routines 
   WHERE routine_schema = 'public' 
   AND routine_name IN ('get_user_devices', 'revoke_device', 'check_device_suspicious');
   ```

3. **Test device activity:**
   - Go to Settings page
   - Scroll to "Device Activity" section
   - You should see your current device listed

## Troubleshooting

If migrations fail:

1. **Check for syntax errors** in the SQL Editor
2. **Run migrations one at a time** instead of combined
3. **Check Supabase logs** for detailed error messages
4. **Verify RLS policies** don't conflict with new functions

## Need Help?

If you encounter issues:
- Check Supabase Dashboard > Logs for errors
- Verify your database connection
- Ensure you have proper permissions

