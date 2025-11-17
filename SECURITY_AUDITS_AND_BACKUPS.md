# Security Audits and Backup & Recovery Plan

This document outlines the security audit schedule and backup/recovery procedures for Echo Garden.

## 🔍 Security Audits

### ✅ Automated Security Audit System

**All security checks are now automated!** The system runs comprehensive security audits automatically at scheduled intervals and stores results in the `security_audit_results` table.

**Automated Audit Schedule:**
- **Daily Audits:** Every day at 2 AM UTC - Quick health checks
- **Weekly Audits:** Every Monday at 3 AM UTC - Comprehensive review
- **Monthly Audits:** First day of month at 4 AM UTC - Full security scan
- **Quarterly Audits:** First day of quarter (Jan, Apr, Jul, Oct) at 5 AM UTC - Deep security analysis

**How It Works:**
1. Cron jobs automatically trigger the `security-audit` edge function
2. The function runs all security checks via database functions
3. Results are stored in `security_audit_results` table with:
   - Check status (pass/fail/warning/error)
   - Severity level
   - Detailed findings
   - Remediation steps
4. Old audit results are automatically cleaned up after 90 days

**Viewing Audit Results:**
```sql
-- Get latest audit summary
SELECT * FROM public.get_latest_audit_summary('daily');

-- Get detailed results
SELECT * FROM public.security_audit_results 
WHERE audit_type = 'daily' 
ORDER BY created_at DESC 
LIMIT 50;

-- Get failed checks only
SELECT * FROM public.security_audit_results 
WHERE status IN ('fail', 'error') 
ORDER BY severity DESC, created_at DESC;
```

**Manual Audit Trigger:**
You can manually trigger an audit via the edge function:
```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/security-audit?type=daily" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

### Regular Security Audit Schedule

**Automated Checks (No Manual Action Required):**
- ✅ Review all authentication and authorization mechanisms
- ✅ Audit Row Level Security (RLS) policies
- ✅ Check for exposed secrets or credentials
- ✅ Review environment variable usage and security
- ✅ Audit rate limiting effectiveness
- ✅ Check for SQL injection patterns
- ✅ Check for XSS patterns
- ✅ Verify logs don't contain sensitive data

**Manual Reviews (Still Required):**
- Review Edge Function security and error handling (code review)
- Review security headers configuration (infrastructure review)
- Check for dependency vulnerabilities (use `npm audit`, `snyk`, etc.)
- Full penetration testing (annual)
- Code security review (annual)
- Infrastructure security assessment (annual)
- Compliance review (if applicable)
- Third-party security audit (recommended)

### Security Audit Checklist

#### Authentication & Authorization
- ✅ **AUTOMATED:** Device-based authentication is secure
- ⚠️ **MANUAL:** Magic login links are properly secured (review code)
- ✅ **AUTOMATED:** RLS policies are correctly configured
- ✅ **AUTOMATED:** No privilege escalation vulnerabilities
- ⚠️ **MANUAL:** Session management is secure (review implementation)

#### Data Protection
- ✅ **AUTOMATED:** No hardcoded credentials (database check)
- ✅ **AUTOMATED:** Environment variables are properly secured (guidance provided)
- ⚠️ **MANUAL:** Sensitive data is encrypted at rest (verify Supabase settings)
- ✅ **AUTOMATED:** HTTPS is enforced everywhere (Supabase handles this)
- ✅ **AUTOMATED:** API keys are rotated regularly (tracks old keys)

#### Input Validation & Sanitization
- ⚠️ **MANUAL:** All user inputs are validated (code review)
- ✅ **AUTOMATED:** SQL injection prevention is in place (pattern detection)
- ✅ **AUTOMATED:** XSS prevention is implemented (pattern detection)
- ⚠️ **MANUAL:** Error messages don't expose sensitive info (code review)
- ⚠️ **MANUAL:** File uploads are validated (code review)

#### Infrastructure
- ⚠️ **MANUAL:** Security headers are configured (infrastructure review)
- ⚠️ **MANUAL:** CORS is properly restricted (code review)
- ✅ **AUTOMATED:** Rate limiting is effective
- ✅ **AUTOMATED:** Logs don't contain sensitive data (pattern detection)
- ⚠️ **MANUAL:** Monitoring and alerting is set up (verify configuration)

### Audit Logging

The application maintains security audit logs in the `security_audit_log` table:
- Failed authentication attempts
- Device revocation events
- Suspicious activity detection
- Security policy violations

**Automated Audit Results:**
All automated security audit results are stored in the `security_audit_results` table:
- Check status and severity
- Detailed findings and metrics
- Remediation steps
- Historical trends

**Review Schedule:** 
- **Automated:** Daily/weekly/monthly/quarterly audits run automatically
- **Manual Review:** Review audit results weekly for any failures or warnings
- **Action Items:** Address any failed checks or warnings within 48 hours

## 💾 Backup & Recovery Plan

### Database Backups

**Supabase Automated Backups:**
- Supabase provides automated daily backups for all projects
- Backups are retained for 7 days (free tier) or 30 days (paid tiers)
- Point-in-time recovery is available

**Manual Backup Procedures:**

1. **Via Supabase Dashboard:**
   - Navigate to Settings > Database > Backups
   - Download backup as needed
   - Store backups securely (encrypted storage)

2. **Via Supabase CLI:**
   ```bash
   # Create a backup
   supabase db dump -f backup_$(date +%Y%m%d).sql
   ```

3. **Programmatic Backup (Recommended for Production):**
   - Set up scheduled backups using Supabase API
   - Store backups in secure cloud storage (S3, GCS, etc.)
   - Encrypt backups before storage

### Backup Schedule

**Production Environment:**
- **Daily:** Automated Supabase backups (handled by Supabase)
- **Weekly:** Manual backup download and storage
- **Before Major Updates:** Always create a backup

**Development/Staging:**
- **Weekly:** Manual backups before significant changes

### Backup Retention Policy

- **Daily backups:** Retain for 30 days
- **Weekly backups:** Retain for 90 days
- **Monthly backups:** Retain for 1 year
- **Pre-deployment backups:** Retain for 90 days

### Storage Bucket Backups

**Audio Files:**
- Supabase Storage provides redundancy
- Consider setting up cross-region replication for critical data
- Regular verification of storage integrity

**User Backups:**
- Users can create their own backups via Settings page
- Backups are stored in the `backups` storage bucket
- Each user's backups are isolated by profile_id

### Recovery Procedures

#### Database Recovery

1. **Point-in-Time Recovery (Supabase):**
   - Access Supabase Dashboard
   - Navigate to Database > Backups
   - Select restore point
   - Confirm restoration

2. **Manual Backup Restoration:**
   ```bash
   # Restore from backup file
   supabase db reset
   psql -h [host] -U [user] -d [database] < backup_file.sql
   ```

3. **Partial Recovery:**
   - Restore specific tables if needed
   - Use Supabase SQL Editor for targeted restoration

#### Storage Recovery

1. **Audio Files:**
   - Restore from Supabase Storage backups
   - Verify file integrity after restoration
   - Update database references if needed

2. **User Backups:**
   - Users can restore their own backups via Settings
   - Admin can assist with manual restoration if needed

### Disaster Recovery Plan

**Recovery Time Objective (RTO):** 4 hours
**Recovery Point Objective (RPO):** 24 hours (daily backups)

**Steps:**
1. Assess the scope of the incident
2. Notify stakeholders
3. Restore from most recent backup
4. Verify data integrity
5. Test application functionality
6. Resume normal operations
7. Document incident and lessons learned

### Testing Recovery Procedures

**Quarterly Recovery Testing:**
- Test database restoration process
- Verify backup integrity
- Test partial recovery scenarios
- Document any issues or improvements needed

### Backup Verification

**Monthly Verification:**
- Verify backup files are accessible
- Test restoration process in staging environment
- Check backup file integrity
- Verify backup retention policy compliance

## 📋 Maintenance Schedule

### Hourly (Automated)
- ✅ Update trending scores - Every hour
- ✅ Check for stuck processing clips - Every 4 hours

### Daily (Automated)
- ✅ Security audit runs automatically at 2 AM UTC
- ✅ Comprehensive storage cleanup at 1 AM UTC
- ✅ Cleanup old clips (90+ days) at 2 AM UTC
- ✅ Cleanup query performance logs at 3 AM UTC
- ✅ Cleanup security audit logs at 3:30 AM UTC
- ✅ Cleanup account creation logs at 4 AM UTC
- ✅ Cleanup clip upload logs at 4:30 AM UTC
- ✅ Cleanup IP activity logs at 5 AM UTC
- ✅ Cleanup reputation action logs at 5:30 AM UTC
- ✅ Cleanup digest request logs at 6 AM UTC
- ✅ Cleanup rate limit logs at 6:30 AM UTC
- ✅ Check for missing audio files at 7 AM UTC
- ✅ Reset API key quotas at midnight UTC
- ✅ Results stored in `security_audit_results` table
- ⚠️ Review any failed checks or warnings

### Weekly (Automated)
- ✅ Security audit runs automatically every Monday at 3 AM UTC
- ✅ Cleanup inactive account clips on Sunday at 3 AM UTC
- ✅ Recalculate all storage on Sunday at 4 AM UTC
- ✅ Cleanup old audit results on Sunday at 1 AM UTC
- Review security audit results from the week
- Check for failed backup jobs
- Monitor storage usage
- Address any security warnings or failures

### Monthly (Automated)
- ✅ Security audit runs automatically on the 1st at 4 AM UTC
- Review security audit logs in detail
- Verify backup integrity
- Update security documentation if needed
- Review and update backup retention policy
- Review automated audit trends and patterns

### Quarterly (Automated)
- ✅ Security audit runs automatically on first day of quarter at 5 AM UTC
- Review quarterly audit results
- Test recovery procedures
- Review and update disaster recovery plan
- Dependency security updates (run `npm audit`, `snyk test`, etc.)
- Code security review

### Annually
- Comprehensive security audit (automated quarterly audits + manual review)
- Full disaster recovery drill
- Review and update all security policies
- Third-party security assessment (recommended)
- Penetration testing

## 🤖 Automated Maintenance Tasks

All the following tasks run automatically via cron jobs:

### Clip Management
- **Old Clips Cleanup**: Removes clips older than 90 days (daily)
- **Failed Clips Cleanup**: Removes clips stuck in processing/failed status for 24+ hours (every 6 hours)
- **Inactive Account Cleanup**: Removes clips from accounts with no activity in 90 days (weekly)
- **Stuck Processing Check**: Marks clips stuck in processing for 12+ hours as failed (every 4 hours)
- **Missing Audio Check**: Removes clips with missing audio files (daily)

### Storage Management
- **Comprehensive Cleanup**: Runs full cleanup-storage edge function (daily)
- **Storage Recalculation**: Recalculates storage usage for all profiles (weekly)

### Trending & Scores
- **Trending Scores Update**: Updates trending scores for all clips (hourly)

### Log Cleanup
- **Query Performance Logs**: Removes logs older than 30 days (daily)
- **Security Audit Logs**: Removes logs older than 90 days (daily)
- **Account Creation Logs**: Removes logs older than 30 days (daily)
- **Clip Upload Logs**: Removes logs older than 30 days (daily)
- **IP Activity Logs**: Removes logs older than 90 days (daily)
- **Reputation Action Logs**: Removes logs older than 90 days (daily)
- **Digest Request Logs**: Removes logs older than 30 days (daily)
- **Rate Limit Logs**: Removes logs older than 30 days (daily)
- **Security Audit Results**: Removes results older than 90 days (weekly)

### API Management
- **API Quota Reset**: Resets daily quotas for all API keys (daily)

## 🔐 Backup Security

### Encryption
- All backups should be encrypted at rest
- Use strong encryption (AES-256 recommended)
- Secure backup storage credentials

### Access Control
- Limit backup access to authorized personnel only
- Use multi-factor authentication for backup systems
- Log all backup access and restoration activities

### Storage Location
- Store backups in secure, geographically distributed locations
- Ensure backups comply with data residency requirements
- Use cloud storage with redundancy

## 📞 Emergency Contacts

- **Supabase Support:** https://supabase.com/support
- **Security Incident:** [Your security team contact]
- **Backup Administrator:** [Your backup admin contact]

---

## 🚀 Setting Up Automated Security Audits

### Prerequisites
1. Enable `pg_cron` extension in Supabase Dashboard (Database → Extensions)
2. Deploy the `security-audit` edge function
3. Run the migration files:
   - `20251215000000_add_automated_security_audits.sql`
   - `20251215000001_setup_security_audit_cron.sql`

### Deployment Steps

1. **Deploy Edge Function:**
   ```bash
   supabase functions deploy security-audit
   ```

2. **Run Migrations:**
   ```bash
   supabase migration up
   ```

3. **Verify Cron Jobs:**
   ```sql
   SELECT jobname, schedule, active 
   FROM cron.job 
   WHERE jobname LIKE 'security-audit%';
   ```

4. **Test Manual Audit:**
   ```bash
   curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/security-audit?type=daily" \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
   ```

### Monitoring Audit Results

**View Latest Results:**
```sql
-- Get summary
SELECT * FROM public.get_latest_audit_summary('daily');

-- Get all failed/warning checks
SELECT check_category, check_name, status, severity, message, created_at
FROM public.security_audit_results
WHERE status IN ('fail', 'warning', 'error')
ORDER BY severity DESC, created_at DESC;
```

**Set Up Alerts:**
Consider setting up alerts (via Supabase webhooks or external monitoring) for:
- Any checks with `status = 'fail'` or `severity = 'error'`
- Multiple warnings in a single audit
- Trends showing increasing failures

---

**Last Updated:** 2025-01-15
**Next Review Date:** Quarterly (automated)
**Maintained By:** Development Team
**Automation Status:** ✅ Fully Automated

