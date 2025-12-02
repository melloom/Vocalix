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

### 7. **Session Timeout Management**

Sessions automatically expire after a configurable timeout period (default: 24 hours):
- **Session Expiration**: Sessions expire after inactivity or timeout period
- **Auto-Refresh**: Sessions automatically refresh when close to expiring (within 1 hour)
- **Activity Tracking**: Last activity timestamp is tracked for session management
- **Client-Side Monitoring**: Automatic session checking and refresh on the client
- **Graceful Expiration**: Expired sessions clear auth state and require re-authentication

**Session Functions:**
- `is_session_valid(device_id)` - Checks if session is valid
- `refresh_device_session(device_id, timeout_hours)` - Refreshes session expiration
- `initialize_device_session(device_id, timeout_hours)` - Initializes new session
- `get_session_status(device_id)` - Gets current session status

### 8. **Anomaly Detection (Statistical ML Models)**

Advanced anomaly detection using statistical methods to identify suspicious device behavior:
- **Feature Extraction**: Calculates statistical features from device activity
- **Z-Score Detection**: Detects outliers using statistical Z-scores
- **Threshold-Based Detection**: Multiple anomaly rules (request rates, auth failures, IP changes)
- **Risk Scoring**: 0-100 anomaly score with risk levels (low, medium, high, critical)
- **Automatic Flagging**: High-risk devices are automatically marked as suspicious
- **Anomaly Storage**: All detection results stored for analysis and auditing

**Detected Anomalies:**
- Excessive request rates (Z-score > 3)
- High failed authentication rates (>50%)
- Frequent IP address changes (>10)
- Frequent user agent changes (>5)
- Burst activity patterns (>100 events/hour)
- Extremely high daily request rates (>10,000/day)

**Anomaly Functions:**
- `calculate_device_features(device_id)` - Calculates statistical features
- `detect_device_anomalies(device_id)` - Runs anomaly detection
- `record_anomaly_detection(device_id)` - Stores detection results
- `get_latest_anomaly_score(device_id)` - Gets latest anomaly score

### 9. **Enhanced Authentication Functions**

#### `profile_ids_for_request_secure()`
- Checks if device is revoked before returning profile IDs
- Validates device isn't suspicious
- Checks session validity
- Updates device activity with session management
- Runs periodic anomaly detection
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
-- Get device security status (now includes trust score and geolocation)
SELECT * FROM get_device_security_status('device-id-here');

-- Calculate/update device trust score
SELECT calculate_device_trust_score('device-id-here');

-- Update device geolocation
SELECT update_device_geolocation('device-id-here', '192.168.1.1'::INET);

-- Revoke a device
SELECT revoke_device('device-id-here', 'Reason for revocation');

-- Check if device is suspicious
SELECT check_device_suspicious('device-id-here');

-- Get session status
SELECT * FROM get_session_status('device-id-here');

-- Refresh device session
SELECT refresh_device_session('device-id-here', 24);

-- Run anomaly detection
SELECT * FROM detect_device_anomalies('device-id-here');

-- Get latest anomaly score
SELECT * FROM get_latest_anomaly_score('device-id-here');

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

-- Devices with low trust scores
SELECT device_id, trust_score, trust_score_factors, country_name, city
FROM devices
WHERE trust_score < 30
ORDER BY trust_score ASC;

-- Devices by country
SELECT country_code, country_name, COUNT(*) as device_count
FROM devices
WHERE country_code IS NOT NULL
GROUP BY country_code, country_name
ORDER BY device_count DESC;

-- Trust score distribution
SELECT 
  CASE 
    WHEN trust_score >= 80 THEN 'High (80-100)'
    WHEN trust_score >= 50 THEN 'Medium (50-79)'
    WHEN trust_score >= 30 THEN 'Low (30-49)'
    ELSE 'Very Low (0-29)'
  END as trust_level,
  COUNT(*) as device_count
FROM devices
GROUP BY trust_level
ORDER BY trust_level;
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
- Average trust score across devices
- Devices with low trust scores (< 30)
- Geolocation distribution by country
- Devices with location changes

### 8. **IP-Based Geolocation Tracking**

Tracks device location based on IP address:
- **Country & Region**: Country code, country name, region, city
- **Coordinates**: Latitude and longitude (when available)
- **Timezone**: Device timezone information
- **ISP**: Internet Service Provider information
- **Automatic Updates**: Geolocation is updated when IP address changes
- **Location Consistency**: Tracks location changes for trust scoring

**Database Columns:**
- `country_code`, `country_name`, `region`, `city`
- `latitude`, `longitude`
- `timezone`, `isp`
- `geolocation_updated_at`, `geolocation_source`

**Functions:**
- `lookup_ip_geolocation(ip_address)` - Looks up geolocation for an IP (extensible for API integration)
- `update_device_geolocation(device_id, ...)` - Updates device geolocation data

### 9. **Device Trust Scoring**

Calculates a trust score (0-100) for each device based on multiple factors:

**Trust Score Factors:**
- **Device Age** (0-30 points): Older devices are more trusted
  - 90+ days: +30 points
  - 30+ days: +20 points
  - 7+ days: +10 points
  - 1+ days: +5 points

- **Failed Auth Attempts** (-0 to -40 points): More failures = less trusted
  - 20+ failures: -40 points
  - 10+ failures: -25 points
  - 5+ failures: -15 points
  - 1+ failures: -5 points

- **Suspicious Flags** (-0 to -50 points):
  - Revoked device: -50 points
  - Suspicious device: -30 points

- **Request Consistency** (0-20 points): Regular activity indicates legitimate use
  - 100+ requests in 7 days: +20 points
  - 50+ requests: +15 points
  - 20+ requests: +10 points
  - 5+ requests: +5 points

- **Geolocation Consistency** (0-15 points): Same location = more trusted
  - 1 location: +15 points
  - 2 locations: +10 points
  - 3 locations: +5 points

- **Request Volume** (0-10 points): Reasonable volume indicates legitimate use
  - 10-10,000 requests: +10 points
  - 5-50,000 requests: +5 points
  - 100,000+ requests: -10 points (suspicious)

**Base Score:** 50 points

**Database Columns:**
- `trust_score` (0-100)
- `trust_score_updated_at`
- `trust_score_factors` (JSONB with detailed breakdown)

**Functions:**
- `calculate_device_trust_score(device_id)` - Calculates and updates trust score
- Trust scores are automatically recalculated every 10 requests or every 24 hours
- Low trust scores (< 20) can trigger suspicious device detection

**Integration:**
- Trust scores are integrated into `check_device_suspicious()` function
- Devices with trust scores < 20 are automatically marked as suspicious
- Trust score factors are stored in JSONB for analysis and debugging

## 🔄 Future Enhancements

Potential additional security measures:
- [x] IP-based geolocation tracking ✅
- [x] Device trust scoring ✅
- [ ] Automatic device rotation
- [ ] Two-factor authentication
- [ ] Biometric authentication
- [ ] Device encryption keys
- [x] Session timeout management ✅
- [x] Anomaly detection ML models ✅

---

**Last Updated**: 2025-12-15
**Maintained By**: Development Team

