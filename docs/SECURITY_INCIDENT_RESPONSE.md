# Security Incident Response Procedures

This document outlines the procedures for responding to security incidents in Echo Garden.

## 🚨 Incident Severity Levels

### Critical (P0)
- Active data breach
- System compromise
- Unauthorized admin access
- Large-scale account compromise
- SQL injection or XSS exploitation
- **Response Time**: Immediate (within 1 hour)

### High (P1)
- Multiple account bans needed
- Suspicious automated activity
- Rate limit bypass attempts
- Content moderation violations
- **Response Time**: Within 4 hours

### Medium (P2)
- Single account abuse
- Minor security policy violations
- Suspicious device activity
- **Response Time**: Within 24 hours

### Low (P3)
- False positive security alerts
- Minor policy violations
- **Response Time**: Within 72 hours

## 📋 Incident Response Checklist

### Phase 1: Detection & Assessment

1. **Identify the Incident**
   - Review security audit logs (`security_audit_log` table)
   - Check automated alerts
   - Review user reports
   - Monitor abuse patterns in admin dashboard

2. **Assess Severity**
   - Determine severity level (P0-P3)
   - Identify affected users/systems
   - Estimate potential impact

3. **Document Initial Findings**
   - Record incident type
   - Note affected profiles/devices
   - Capture timestamps
   - Save relevant logs

### Phase 2: Containment

#### For Account Abuse:
```sql
-- Check if profile is banned
SELECT is_banned, banned_until, ban_reason 
FROM profiles 
WHERE id = '<profile_id>';

-- Manually ban if needed
SELECT ban_profile(
  '<profile_id>'::uuid,
  '<admin_profile_id>'::uuid,
  'Security incident: [reason]',
  NULL -- NULL = permanent, or hours for temporary
);
```

#### For Device Compromise:
```sql
-- Revoke device
SELECT revoke_device(
  '<device_id>',
  'Security incident: [reason]'
);
```

#### For System-Wide Issues:
- Enable maintenance mode if needed
- Temporarily disable affected features
- Increase rate limiting
- Add additional validation

### Phase 3: Investigation

1. **Gather Evidence**
   ```sql
   -- Get security audit logs for profile
   SELECT * FROM security_audit_log
   WHERE profile_id = '<profile_id>'
   ORDER BY created_at DESC
   LIMIT 100;
   
   -- Get ban history
   SELECT * FROM ban_history
   WHERE profile_id = '<profile_id>'
   ORDER BY banned_at DESC;
   
   -- Get query performance logs (if relevant)
   SELECT * FROM query_performance_log
   WHERE profile_id = '<profile_id>'
   ORDER BY created_at DESC
   LIMIT 100;
   ```

2. **Analyze Patterns**
   - Review violation history
   - Check for related incidents
   - Identify attack vectors
   - Document findings

3. **Determine Root Cause**
   - Was it a vulnerability?
   - Was it user error?
   - Was it automated abuse?
   - Document findings

### Phase 4: Eradication

1. **Remove Threat**
   - Ban offending accounts
   - Revoke compromised devices
   - Remove malicious content
   - Block IP addresses if needed

2. **Fix Vulnerabilities**
   - Patch security holes
   - Update security policies
   - Enhance validation
   - Deploy fixes

3. **Update Security Measures**
   - Adjust rate limits if needed
   - Update detection rules
   - Enhance monitoring

### Phase 5: Recovery

1. **Restore Services**
   - Verify fixes are working
   - Re-enable features if disabled
   - Monitor for recurrence

2. **Notify Affected Users** (if applicable)
   - Inform users of security incident
   - Provide guidance if needed
   - Update privacy policy if required

3. **Document Incident**
   - Create incident report
   - Update security procedures
   - Share learnings with team

### Phase 6: Post-Incident

1. **Review & Learn**
   - Conduct post-mortem
   - Identify improvements
   - Update procedures

2. **Prevent Recurrence**
   - Implement additional safeguards
   - Update monitoring
   - Enhance training

## 🔧 Common Incident Response Actions

### Ban a Profile
```sql
-- Temporary ban (24 hours)
SELECT ban_profile(
  '<profile_id>'::uuid,
  '<admin_profile_id>'::uuid,
  'Violation: [reason]',
  24
);

-- Permanent ban
SELECT ban_profile(
  '<profile_id>'::uuid,
  '<admin_profile_id>'::uuid,
  'Violation: [reason]',
  NULL
);
```

### Unban a Profile
```sql
SELECT unban_profile(
  '<profile_id>'::uuid,
  '<admin_profile_id>'::uuid,
  'Appeal approved: [reason]'
);
```

### Revoke a Device
```sql
SELECT revoke_device(
  '<device_id>',
  'Security incident: [reason]'
);
```

### Check Profile Status
```sql
-- Check if banned
SELECT is_profile_banned('<profile_id>'::uuid);

-- Get full profile security status
SELECT 
  id,
  handle,
  is_banned,
  banned_at,
  banned_until,
  ban_reason,
  ban_count,
  last_ban_at
FROM profiles
WHERE id = '<profile_id>'::uuid;
```

### Review Security Logs
```sql
-- Recent critical events
SELECT * FROM security_audit_log
WHERE severity IN ('error', 'critical')
ORDER BY created_at DESC
LIMIT 50;

-- Events for specific profile
SELECT * FROM security_audit_log
WHERE profile_id = '<profile_id>'::uuid
ORDER BY created_at DESC
LIMIT 100;

-- Suspicious device activity
SELECT * FROM security_audit_log
WHERE device_id = '<device_id>'
  AND severity IN ('warning', 'error', 'critical')
ORDER BY created_at DESC
LIMIT 100;
```

## 📊 Monitoring & Alerts

### Key Metrics to Monitor

1. **Security Audit Logs**
   - Critical/error events per hour
   - Failed authentication attempts
   - Suspicious device activity
   - Ban events

2. **Query Performance**
   - Slow queries (>1 second)
   - Query rate limit violations
   - Expensive query patterns

3. **Ban Statistics**
   - Bans per day
   - Auto-ban triggers
   - Appeal rates

4. **Rate Limiting**
   - Rate limit violations
   - Patterns of abuse
   - IP-based violations

### Alert Thresholds

- **Critical**: 5+ critical events in 1 hour
- **High**: 10+ error events in 1 hour
- **Medium**: 50+ warning events in 1 hour
- **Auto-ban**: Profile reaches ban threshold

## 🛡️ Prevention Measures

### Regular Security Tasks

1. **Daily**
   - Review critical security events
   - Check for new bans
   - Monitor rate limit violations

2. **Weekly**
   - Review ban patterns
   - Analyze abuse trends
   - Update detection rules

3. **Monthly**
   - Security audit review
   - Update security procedures
   - Review and update rate limits

### Security Best Practices

1. **Always log security events**
   - Use `log_security_operation()` for all security-sensitive operations
   - Include relevant context
   - Set appropriate severity levels

2. **Verify before taking action**
   - Double-check profile IDs
   - Review evidence before banning
   - Confirm admin permissions

3. **Document everything**
   - Record all actions taken
   - Note reasons for decisions
   - Keep audit trail

4. **Follow principle of least privilege**
   - Only grant necessary permissions
   - Use service role only when needed
   - Validate all inputs

## 📞 Escalation Procedures

### When to Escalate

- **Critical incidents**: Escalate immediately to security team lead
- **High incidents**: Escalate if unable to resolve within 4 hours
- **Unclear situations**: Escalate for guidance
- **Legal concerns**: Escalate to legal team

### Escalation Contacts

- **Security Team Lead**: [Contact Information]
- **Engineering Lead**: [Contact Information]
- **Legal Team**: [Contact Information]

## 📝 Incident Report Template

```markdown
# Security Incident Report

## Incident Details
- **Date**: [Date]
- **Time**: [Time]
- **Severity**: [P0/P1/P2/P3]
- **Incident Type**: [Type]
- **Detected By**: [Name/Role]

## Summary
[Brief description of the incident]

## Affected Systems/Users
- Profiles: [List]
- Devices: [List]
- Features: [List]

## Timeline
- [Time] - Incident detected
- [Time] - Containment started
- [Time] - Investigation completed
- [Time] - Resolution deployed

## Root Cause
[Description of root cause]

## Actions Taken
1. [Action 1]
2. [Action 2]
3. [Action 3]

## Resolution
[How the incident was resolved]

## Prevention Measures
[Steps taken to prevent recurrence]

## Lessons Learned
[Key takeaways]
```

## 🔄 Continuous Improvement

- Review incident response procedures quarterly
- Update based on new threats
- Share learnings with team
- Practice incident response scenarios
- Keep documentation up to date

---

**Last Updated**: 2025-01-XX
**Version**: 1.0
**Status**: Active

