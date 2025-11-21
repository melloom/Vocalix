# Backup and Disaster Recovery Guide

Comprehensive guide for backing up and recovering Echo Garden data and infrastructure.

## 📋 Table of Contents

- [Backup Strategy](#backup-strategy)
- [Database Backups](#database-backups)
- [Storage Backups](#storage-backups)
- [Configuration Backups](#configuration-backups)
- [Recovery Procedures](#recovery-procedures)
- [Disaster Recovery Plan](#disaster-recovery-plan)
- [Testing Backups](#testing-backups)

## 🔄 Backup Strategy

### Backup Frequency

- **Database**: Daily automated backups (Supabase handles this)
- **Storage**: Weekly automated backups
- **Configuration**: On every deployment
- **Code**: Git repository (primary backup)

### Retention Policy

- **Daily backups**: 7 days
- **Weekly backups**: 4 weeks
- **Monthly backups**: 12 months
- **Yearly backups**: Indefinite

## 🗄️ Database Backups

### Automated Backups (Supabase)

Supabase automatically creates daily backups. To access:

1. Go to Supabase Dashboard
2. Navigate to **Settings** → **Database**
3. View **Backups** section
4. Download or restore from any backup point

### Manual Database Backup

```sql
-- Export specific tables
pg_dump -h <host> -U <user> -d <database> -t clips -t profiles > backup.sql

-- Export entire database
pg_dump -h <host> -U <user> -d <database> > full_backup.sql
```

### Backup Verification

```sql
-- Check backup integrity
pg_restore --list backup.sql

-- Verify table counts
SELECT 
  'clips' as table_name, 
  COUNT(*) as row_count 
FROM clips
UNION ALL
SELECT 
  'profiles' as table_name, 
  COUNT(*) as row_count 
FROM profiles;
```

### Restore from Backup

```sql
-- Restore specific table
psql -h <host> -U <user> -d <database> -c "\copy clips FROM 'backup.csv' CSV HEADER"

-- Restore entire database
psql -h <host> -U <user> -d <database> < full_backup.sql
```

## 📦 Storage Backups

### Automated Storage Backup Script

Create a script to backup Supabase Storage:

```bash
#!/bin/bash
# backup-storage.sh

SUPABASE_URL="your-project-url"
SUPABASE_KEY="your-service-role-key"
BACKUP_DIR="./backups/storage/$(date +%Y%m%d)"

mkdir -p "$BACKUP_DIR"

# List all buckets
BUCKETS=$(curl -s -H "apikey: $SUPABASE_KEY" \
  "$SUPABASE_URL/storage/v1/bucket" | jq -r '.[].name')

for bucket in $BUCKETS; do
  echo "Backing up bucket: $bucket"
  mkdir -p "$BACKUP_DIR/$bucket"
  
  # List files in bucket
  FILES=$(curl -s -H "apikey: $SUPABASE_KEY" \
    "$SUPABASE_URL/storage/v1/object/list/$bucket" | jq -r '.[].name')
  
  for file in $FILES; do
    # Download file
    curl -s -H "apikey: $SUPABASE_KEY" \
      "$SUPABASE_URL/storage/v1/object/$bucket/$file" \
      -o "$BACKUP_DIR/$bucket/$file"
  done
done

echo "Backup completed: $BACKUP_DIR"
```

### Manual Storage Backup

1. **Via Supabase Dashboard**:
   - Go to **Storage**
   - Select bucket
   - Download files individually or use API

2. **Via API**:
   ```bash
   # List all files
   curl -H "apikey: YOUR_KEY" \
     "https://YOUR_PROJECT.supabase.co/storage/v1/object/list/audio"
   
   # Download file
   curl -H "apikey: YOUR_KEY" \
     "https://YOUR_PROJECT.supabase.co/storage/v1/object/audio/file.mp3" \
     -o backup.mp3
   ```

## ⚙️ Configuration Backups

### Environment Variables

Backup all environment variables:

```bash
# Export to file
env | grep -E "^(SUPABASE|SENTRY|VITE_)" > .env.backup

# Or use Supabase secrets
supabase secrets list > secrets.backup
```

### Edge Functions

Edge functions are stored in Git, but also backup:

```bash
# Backup all functions
cp -r supabase/functions ./backups/functions/$(date +%Y%m%d)
```

### Database Migrations

Migrations are in Git, but verify:

```bash
# List all migrations
ls -la supabase/migrations/ > migrations.list
```

## 🔧 Recovery Procedures

### Database Recovery

#### Point-in-Time Recovery

1. **Via Supabase Dashboard**:
   - Go to **Database** → **Backups**
   - Select restore point
   - Click **Restore**

2. **Via SQL**:
   ```sql
   -- Restore from specific backup
   RESTORE DATABASE echo_garden FROM 'backup_20250210.dump';
   ```

#### Partial Recovery (Single Table)

```sql
-- Drop and recreate table
DROP TABLE IF EXISTS clips CASCADE;

-- Restore from backup
\i backup_clips.sql

-- Recreate indexes
\i migrations/20250210000003_performance_optimization_indexes.sql
```

### Storage Recovery

```bash
# Restore from backup
for file in backups/storage/20250210/audio/*; do
  curl -X POST \
    -H "apikey: $SUPABASE_KEY" \
    -H "Content-Type: audio/mpeg" \
    -F "file=@$file" \
    "$SUPABASE_URL/storage/v1/object/audio/$(basename $file)"
done
```

### Configuration Recovery

```bash
# Restore environment variables
source .env.backup

# Restore Supabase secrets
while IFS= read -r line; do
  supabase secrets set "$line"
done < secrets.backup
```

## 🚨 Disaster Recovery Plan

### Recovery Time Objectives (RTO)

- **Critical systems**: 1 hour
- **Non-critical systems**: 4 hours
- **Full recovery**: 24 hours

### Recovery Point Objectives (RPO)

- **Database**: 24 hours (daily backups)
- **Storage**: 7 days (weekly backups)
- **Configuration**: Real-time (Git)

### Disaster Scenarios

#### 1. Database Corruption

**Steps**:
1. Stop all write operations
2. Assess damage extent
3. Restore from most recent backup
4. Verify data integrity
5. Resume operations

**Time**: 2-4 hours

#### 2. Storage Loss

**Steps**:
1. Identify missing files
2. Restore from backup
3. Verify file integrity
4. Update CDN cache
5. Resume operations

**Time**: 4-8 hours

#### 3. Complete Infrastructure Loss

**Steps**:
1. Provision new Supabase project
2. Restore database from backup
3. Restore storage from backup
4. Update environment variables
5. Deploy application
6. Verify functionality
7. Update DNS if needed

**Time**: 12-24 hours

#### 4. Data Breach

**Steps**:
1. Isolate affected systems
2. Assess breach extent
3. Notify affected users
4. Rotate all credentials
5. Restore from pre-breach backup
6. Implement security fixes
7. Resume operations

**Time**: 24-48 hours

## ✅ Testing Backups

### Regular Testing Schedule

- **Weekly**: Verify backup integrity
- **Monthly**: Test restore procedure
- **Quarterly**: Full disaster recovery drill

### Backup Verification Script

```bash
#!/bin/bash
# verify-backup.sh

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: verify-backup.sh <backup_file>"
  exit 1
fi

# Check backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found"
  exit 1
fi

# Verify SQL backup
if [[ "$BACKUP_FILE" == *.sql ]]; then
  # Check SQL syntax
  if psql --dry-run < "$BACKUP_FILE" 2>&1 | grep -q "ERROR"; then
    echo "Error: SQL backup has syntax errors"
    exit 1
  fi
  echo "✓ SQL backup verified"
fi

# Verify file integrity
if command -v md5sum &> /dev/null; then
  md5sum "$BACKUP_FILE" > "${BACKUP_FILE}.md5"
  echo "✓ MD5 checksum created"
fi

echo "Backup verification complete"
```

### Restore Test Procedure

1. **Create test environment**
2. **Restore backup**
3. **Verify data integrity**
4. **Test application functionality**
5. **Document any issues**
6. **Clean up test environment**

## 📊 Backup Monitoring

### Health Checks

Monitor backup success:

```sql
-- Check last backup time
SELECT 
  schemaname,
  tablename,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
ORDER BY last_autovacuum DESC;
```

### Alerting

Set up alerts for:
- Failed backups
- Backup age > 25 hours
- Backup size anomalies
- Restore test failures

## 🔐 Backup Security

### Encryption

- All backups encrypted at rest
- Transfer backups over HTTPS/TLS
- Encrypt sensitive data before backup

### Access Control

- Limit backup access to admins only
- Use service role keys for backups
- Rotate backup credentials regularly

### Storage Location

- Store backups in separate region
- Use multiple backup locations
- Keep off-site backups

## 📝 Backup Checklist

### Daily
- [ ] Verify automated backups completed
- [ ] Check backup size is normal
- [ ] Review backup logs for errors

### Weekly
- [ ] Test restore from recent backup
- [ ] Verify backup integrity
- [ ] Review backup retention policy

### Monthly
- [ ] Full disaster recovery drill
- [ ] Update backup procedures
- [ ] Review and update documentation

## 🆘 Emergency Contacts

- **Supabase Support**: support@supabase.io
- **Database Admin**: [Your contact]
- **DevOps Lead**: [Your contact]
- **Security Team**: [Your contact]

## 📚 Additional Resources

- [Supabase Backup Documentation](https://supabase.com/docs/guides/platform/backups)
- [PostgreSQL Backup Guide](https://www.postgresql.org/docs/current/backup.html)
- [Disaster Recovery Best Practices](https://www.postgresql.org/docs/current/backup-dump.html)

---

**Last Updated**: 2025-02-10
**Next Review**: 2025-03-10

