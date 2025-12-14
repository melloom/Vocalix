# Backup and Recovery Guide

Backup strategies and recovery procedures for Echo Garden.

## 📋 Table of Contents

- [Backup Strategy](#backup-strategy)
- [Recovery Procedures](#recovery-procedures)
- [Disaster Recovery](#disaster-recovery)
- [Data Retention](#data-retention)
- [Backup Checklist](#backup-checklist)
- [Automated Backup Scripts](#automated-backup-scripts)

## 💾 Backup Strategy

### Database Backups

**Supabase Automatic Backups**:
- Daily backups (managed by Supabase)
- Point-in-time recovery available
- Backups retained for 7 days (Pro plan)

**Manual Backups**:
```sql
-- Export specific table
COPY clips TO '/path/to/backup/clips.csv' CSV HEADER;

-- Full database dump (via Supabase CLI)
supabase db dump -f backup.sql
```

### Storage Backups

**Supabase Storage**:
- Automatic redundancy
- Versioning available (if enabled)
- Manual export via Supabase Dashboard

### Code Backups

- **Git Repository**: Primary backup
- **Deployment Platforms**: Vercel/Netlify keep deployment history
- **Local Backups**: Regular local repository clones

## 🔄 Recovery Procedures

### Database Recovery

**Point-in-Time Recovery** (Supabase Pro):
1. Go to Supabase Dashboard
2. Database → Backups
3. Select restore point
4. Restore database

**Manual Recovery**:
```sql
-- Restore from SQL dump
psql -U postgres -d postgres < backup.sql

-- Restore specific table
COPY clips FROM '/path/to/backup/clips.csv' CSV HEADER;
```

### Storage Recovery

1. Go to Supabase Dashboard
2. Storage → Buckets
3. Restore from version history (if enabled)
4. Or restore from backup

### Code Recovery

**From Git**:
```bash
git checkout <commit-hash>
git push --force origin main
```

**From Deployment Platform**:
- Vercel: Promote previous deployment
- Netlify: Publish previous deploy

## 🚨 Disaster Recovery

### Disaster Recovery Plan

1. **Assess Impact**
   - Identify affected systems
   - Determine data loss extent
   - Estimate recovery time

2. **Notify Stakeholders**
   - Inform team
   - Notify users (if needed)
   - Update status page

3. **Execute Recovery**
   - Restore from backups
   - Verify data integrity
   - Test functionality

4. **Post-Recovery**
   - Document incident
   - Review backup procedures
   - Implement improvements

### Recovery Time Objectives (RTO)

- **Database**: < 1 hour
- **Storage**: < 2 hours
- **Application**: < 30 minutes

### Recovery Point Objectives (RPO)

- **Database**: < 24 hours (daily backups)
- **Storage**: < 24 hours
- **Code**: Real-time (Git)

## 📦 Data Retention

### User Data

- **Active Users**: Data retained indefinitely
- **Deleted Accounts**: Data removed per user request
- **Inactive Accounts**: Retained for 2 years, then anonymized

### Content Data

- **Clips**: Retained unless deleted by user or removed for violations
- **Comments**: Retained with parent clip
- **Reactions**: Retained with parent clip

### Logs

- **Application Logs**: 30 days
- **Error Logs**: 90 days (Sentry)
- **Access Logs**: 90 days

## 🔒 Backup Security

### Encryption

- Backups encrypted at rest
- Encrypted in transit
- Access controlled

### Access Control

- Limit backup access to admins
- Use secure storage
- Regular access audits

## 📋 Backup Checklist

### Daily
- [x] **Automated:** Verify automatic backups running
  - Run: `node scripts/backup/daily-backup-check.mjs`
  - Schedule: Daily at 2 AM UTC (recommended)
  - Verifies: Database connectivity, storage buckets, backup availability
- [x] **Automated:** Check backup storage space
  - Included in daily backup check script
  - Manual verification: Supabase Dashboard → Settings → Storage

### Weekly
- [x] **Automated:** Test backup restoration
  - Run: `node scripts/backup/weekly-backup-check.mjs`
  - Schedule: Weekly on Monday at 3 AM UTC (recommended)
  - Performs: Dry-run restoration test, creates weekly backup metadata
- [x] **Automated:** Review backup logs
  - Included in weekly backup check script
  - Reviews last 7 days of backup logs
- [x] **Automated:** Verify backup integrity
  - Included in weekly backup check script
  - Verifies: Storage backups, local backups, database backup availability

### Monthly
- [x] **Automated:** Full disaster recovery drill
  - Run: `node scripts/backup/monthly-backup-drill.mjs`
  - Schedule: First day of month at 4 AM UTC (recommended)
  - Performs: Full DR simulation, system health assessment
- [x] **Automated:** Review and update procedures
  - Included in monthly drill script
  - Checks: Procedure document freshness, required sections
- [x] **Automated:** Document any issues
  - Included in monthly drill script
  - Generates: Issues document with recommendations

## 🤖 Automated Backup Scripts

All backup checklist items are now automated! See [scripts/backup/README.md](./scripts/backup/README.md) for details.

### Quick Start

1. **Set environment variables:**
   ```bash
   export SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   ```

2. **Run scripts manually:**
   ```bash
   # Daily check
   node scripts/backup/daily-backup-check.mjs
   
   # Weekly check
   node scripts/backup/weekly-backup-check.mjs
   
   # Monthly drill
   node scripts/backup/monthly-backup-drill.mjs
   ```

3. **Schedule automation:**
   - **Supabase pg_cron** ⭐ **RECOMMENDED - Easiest!**: 
     - Enable `pg_cron` extension in Supabase Dashboard
     - Run migration: `supabase/migrations/20250128000002_setup_backup_automation_cron.sql`
     - Everything runs directly in Supabase - no external setup needed!
     - See [scripts/backup/SETUP_SUPABASE_CRON.md](./scripts/backup/SETUP_SUPABASE_CRON.md) for details
   - **GitHub Actions**: Already configured! Just add secrets in GitHub Settings
   - **Cron (Linux/Mac)**: Run `./scripts/backup/setup-cron.sh`
   - **Task Scheduler (Windows)**: Run `.\scripts\backup\setup-cron.ps1` as Administrator
   - See [scripts/backup/SETUP_SCHEDULING.md](./scripts/backup/SETUP_SCHEDULING.md) for detailed instructions

### Script Outputs

- **Logs**: `logs/backup-check-YYYY-MM-DD.log`
- **Reports**: `logs/backup-report-YYYY-MM-DD.json`
- **Backups**: `backups/weekly-backup-YYYY-MM-DD.json`

### Manual Verification

While scripts automate most checks, some items require manual verification in Supabase Dashboard:
- Automatic backup status: Dashboard → Database → Backups
- Storage quota: Dashboard → Settings → Storage
- Point-in-time recovery: Dashboard → Database → Backups

## 🔗 Related Documentation

- [SECURITY.md](./SECURITY.md) - Security practices
- [MONITORING_AND_ALERTING.md](./MONITORING_AND_ALERTING.md) - Monitoring

---

**Last Updated**: 2025-01-28

