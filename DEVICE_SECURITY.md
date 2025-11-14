# Device-Based Authentication Security

This document outlines the security measures implemented for device-based authentication in Echo Garden.

## 🔒 Security Features Implemented

### 1. **Device Tracking & Validation**

#### Database Enhancements
- **Device Metadata**: Tracks IP address, user agent, first/last seen timestamps
- **Activity Monitoring**: Request count, failed authentication attempts
- **Suspicious Activity Detection**: Automatic flagging of suspicious devices
- **Device Revocation**: Ability to revoke compromised devices

#### Client-Side Validation
- **Device ID Format Validation**: Ensures device IDs are valid UUIDs
- **Device Fingerprinting**: Browser-based fingerprinting to detect device changes
- **Metadata Validation**: Validates device metadata hasn't changed suspiciously
- **Environment Detection**: Detects automation tools and suspicious environments

### 2. **Security Audit Logging**

All security events are logged to `security_audit_log` table:
- Failed authentication attempts
- Device revocation events
- Suspicious activity detection
- Revoked device access attempts
- Device metadata changes

**Event Types:**
- `failed_authentication` - Failed login attempts
- `device_marked_suspicious` - Device flagged as suspicious
- `device_revoked` - Device was revoked
- `revoked_device_access_attempt` - Attempted access with revoked device
- `suspicious_device_access` - Access from suspicious device

**Severity Levels:**
- `info` - Normal security events
- `warning` - Suspicious but not critical
- `error` - Security violations
- `critical` - Major security incidents

### 3. **Suspicious Activity Detection**

Devices are automatically marked as suspicious if:
- **5+ failed authentication attempts** in the last hour
- **1000+ requests** in the last hour (potential bot/abuse)
- Device is revoked
- Unusual request patterns detected

### 4. **Device Revocation**

Admins can revoke devices that are:
- Compromised
- Lost or stolen
- Showing suspicious activity
- No longer trusted

Revoked devices:
- Cannot access any protected resources
- All access attempts are logged
- User must use magic login link to re-authenticate

### 5. **Rate Limiting Per Device**

- **Reactions**: 30 per minute per device
- **Listen Tracking**: 100 per minute per device
- **Uploads**: Tracked via rate limit logs
- **Failed Auth**: Tracked and can trigger device suspension

### 6. **Device Activity Tracking**

Every request automatically:
- Updates `last_seen_at` timestamp
- Increments `request_count`
- Tracks IP address and user agent
- Validates device isn't revoked or suspicious

### 7. **Enhanced Authentication Functions**

#### `profile_ids_for_request_secure()`
- Checks if device is revoked before returning profile IDs
- Validates device isn't suspicious
- Updates device activity
- Logs security events

#### `update_device_activity()`
- Updates device last seen timestamp
- Tracks request count
- Stores IP and user agent

#### `check_device_suspicious()`
- Automatically detects suspicious patterns
- Marks devices as suspicious
- Logs security events

#### `record_failed_auth()`
- Tracks failed authentication attempts
- Can trigger device suspension
- Logs security events

#### `revoke_device()`
- Revokes device access
- Logs critical security event
- Prevents future access

## 🛡️ Client-Side Security

### Device Fingerprinting
Generates a unique fingerprint based on:
- Screen resolution and color depth
- Timezone
- Language settings
- Platform information
- Hardware concurrency
- Canvas fingerprint

### Environment Detection
Detects suspicious environments:
- Automation tools (Selenium, WebDriver)
- Headless browsers
- Missing browser APIs
- Invalid screen dimensions

### Device Metadata Validation
- Validates device ID format (UUID)
- Checks for suspicious device IDs
- Validates device metadata consistency
- Stores metadata for tracking

## 📊 Security Monitoring

### Database Functions for Admins

```sql
-- Get device security status
SELECT * FROM get_device_security_status('device-id-here');

-- Revoke a device
SELECT revoke_device('device-id-here', 'Reason for revocation');

-- Check if device is suspicious
SELECT check_device_suspicious('device-id-here');

-- View security audit logs
SELECT * FROM security_audit_log 
WHERE severity IN ('error', 'critical')
ORDER BY created_at DESC
LIMIT 100;
```

### Security Audit Log Queries

```sql
-- Failed authentication attempts in last 24 hours
SELECT * FROM security_audit_log
WHERE event_type = 'failed_authentication'
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;

-- Suspicious devices
SELECT d.*, COUNT(sal.id) as security_events
FROM devices d
LEFT JOIN security_audit_log sal ON sal.device_id = d.device_id
WHERE d.is_suspicious = true
GROUP BY d.id
ORDER BY security_events DESC;

-- Revoked devices
SELECT * FROM devices
WHERE is_revoked = true
ORDER BY revoked_at DESC;
```

## 🔐 Best Practices

### For Users
1. **Don't share devices** - Each device has unique authentication
2. **Report suspicious activity** - If you see unusual activity, report it
3. **Use magic login links** - For secure multi-device access
4. **Keep devices secure** - Use device lock screens and passwords

### For Administrators
1. **Monitor audit logs** - Regularly review security events
2. **Revoke compromised devices** - Immediately revoke lost/stolen devices
3. **Review suspicious devices** - Investigate flagged devices
4. **Set up alerts** - Monitor for critical security events
5. **Regular security audits** - Review device access patterns

## 🚨 Security Incident Response

### If a device is compromised:
1. **Immediately revoke the device**:
   ```sql
   SELECT revoke_device('compromised-device-id', 'Security breach');
   ```

2. **Review security audit logs**:
   ```sql
   SELECT * FROM security_audit_log
   WHERE device_id = 'compromised-device-id'
   ORDER BY created_at DESC;
   ```

3. **Check for unauthorized access**:
   ```sql
   SELECT * FROM clips
   WHERE profile_id IN (
     SELECT profile_id FROM devices WHERE device_id = 'compromised-device-id'
   )
   AND created_at > 'suspected-breach-time';
   ```

4. **Notify affected users** - If profile data was accessed

5. **Force re-authentication** - User must use magic login link

## 📈 Security Metrics

Track these metrics for security health:
- Failed authentication rate
- Suspicious device count
- Revoked device count
- Security events per day
- Average requests per device
- Devices with high request counts

## 🔄 Future Enhancements

Potential additional security measures:
- [ ] IP-based geolocation tracking
- [ ] Device trust scoring
- [ ] Automatic device rotation
- [ ] Two-factor authentication
- [ ] Biometric authentication
- [ ] Device encryption keys
- [ ] Session timeout management
- [ ] Anomaly detection ML models

---

**Last Updated**: 2025-01-XX
**Maintained By**: Development Team

