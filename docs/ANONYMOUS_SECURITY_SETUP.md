# Anonymous System Security Setup

This document outlines the security measures in place for the anonymous system account setup.

## 🔒 Security Overview

The system uses **device-based authentication** where users are identified by a unique `device_id` stored in localStorage. No email, password, or personal information is required.

## 🛡️ Security Features

### 1. Row Level Security (RLS)

All critical tables have RLS enabled to ensure users can only access their own data:

- **Profiles**: Public viewing allowed, but only owners can modify
- **Clips**: Public viewing of live clips, owners can manage their own
- **Devices**: Users can only access their own device
- **User Data**: All user-specific tables (saved clips, follows, etc.) are protected

### 2. Device-Based Authentication

- Each user is identified by a unique `device_id` stored in browser localStorage
- Device IDs are validated on every request via the `x-device-id` header
- Devices can be revoked if suspicious activity is detected
- Multi-device support via magic login links

### 3. Data Isolation

- Users can only view/modify their own profiles
- Users can only create/update/delete their own clips
- Users can only access devices matching their `device_id`
- No data leakage between anonymous users

### 4. Security Policies

#### Profiles Table
- ✅ **View**: Anyone can view profiles (public data)
- ✅ **Insert**: Users can create profiles matching their device_id
- ✅ **Update**: Users can only update their own profile
- ✅ **Delete**: Users can only delete their own profile

#### Clips Table
- ✅ **View**: Public can view live/processing clips, owners can view all their clips
- ✅ **Insert**: Users can only create clips for their own profile
- ✅ **Update**: Users can only update their own clips (cannot change profile_id)
- ✅ **Delete**: Users can only delete their own clips

#### Devices Table
- ✅ **View**: Users can only view their own device
- ✅ **Manage**: Users can only insert/update their own device
- ✅ **Isolation**: Cannot link device to another user's profile

### 5. Security Functions

- `profile_ids_for_request()`: Returns profile IDs associated with current device
- `verify_device_access()`: Verifies device is not revoked
- `check_device_suspicious()`: Detects suspicious device activity
- `log_security_event()`: Logs security events for auditing

### 6. Device Security Tracking

The system tracks:
- Device activity (last seen, request count)
- Failed authentication attempts
- Suspicious activity patterns
- Device revocation status

## 🔐 Privacy Protection

### No Personal Information Required
- No email addresses stored (optional for magic login links only)
- No passwords
- No real names
- Only device_id and user-generated content (handle, emoji avatar)

### Data Minimization
- Only necessary data is collected
- User-generated content is stored (clips, comments, etc.)
- Analytics data is anonymized

### Data Access Control
- Users can only access their own data
- Public content (live clips) is viewable by everyone
- Private data (saved clips, follows) is only accessible by owner

## 🚨 Security Measures

### 1. Device Revocation
- Devices can be revoked if suspicious activity is detected
- Revoked devices cannot access the system
- All access attempts from revoked devices are logged

### 2. Suspicious Activity Detection
- Tracks failed authentication attempts
- Monitors request patterns
- Automatically marks devices as suspicious if thresholds are exceeded

### 3. Security Audit Logging
- All security events are logged
- Includes device_id, profile_id, event type, severity
- Only service role can access audit logs

### 4. Rate Limiting
- Request count tracking per device
- Prevents abuse and DoS attacks
- Suspicious patterns trigger alerts

## ✅ Security Checklist

Before deploying, ensure:

- [x] RLS enabled on all critical tables
- [x] Policies configured for anonymous users
- [x] Device-based authentication working
- [x] Device isolation verified
- [x] No data leakage between users
- [x] Security functions in place
- [x] Audit logging configured
- [x] Device revocation working
- [x] Suspicious activity detection active

## 📋 Migration Applied

The migration `20251204000000_ensure_anonymous_security.sql` ensures:

1. ✅ All RLS policies are properly configured
2. ✅ Users can only access their own data
3. ✅ Device-based authentication is secure
4. ✅ No data leakage between anonymous users
5. ✅ Proper security for all tables
6. ✅ Security functions and indexes in place

## 🔍 How to Verify Security

### Test Device Isolation
```sql
-- As user A, try to access user B's profile
-- Should fail if device_id doesn't match

-- As user A, try to update user B's clip
-- Should fail with RLS policy violation
```

### Test Profile Access
```sql
-- View all profiles (should work - public data)
SELECT * FROM profiles;

-- Update another user's profile (should fail)
UPDATE profiles SET handle = 'hacked' WHERE id != (SELECT id FROM profile_ids_for_request());
```

### Test Clip Access
```sql
-- View live clips (should work)
SELECT * FROM clips WHERE status = 'live';

-- Update another user's clip (should fail)
UPDATE clips SET status = 'deleted' 
WHERE profile_id NOT IN (SELECT id FROM profile_ids_for_request());
```

## 🛠️ Maintenance

### Regular Security Audits
- Review security audit logs weekly
- Check for suspicious device activity
- Monitor failed authentication attempts
- Review revoked devices

### Policy Updates
- Review RLS policies quarterly
- Update policies as new features are added
- Test policies after any schema changes

## 📚 Additional Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Security Best Practices](./SECURITY.md)
- [Device Tracking Documentation](./supabase/migrations/20251202000000_consolidate_device_tracking.sql)

## 🔄 Updates

This document should be reviewed and updated whenever:
- New tables are added
- Security policies are modified
- New security features are implemented
- Security vulnerabilities are discovered

Last updated: 2025-12-04

