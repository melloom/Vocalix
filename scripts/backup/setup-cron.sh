#!/bin/bash
# Setup script for automated backup checks using cron
# This script helps you set up cron jobs for backup automation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CRON_FILE="$PROJECT_DIR/backup-cron.txt"

echo "=========================================="
echo "Backup Automation Cron Setup"
echo "=========================================="
echo ""

# Check if required environment variables are set
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "⚠️  Warning: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set in environment"
  echo "   These will need to be set in your crontab or .env file"
  echo ""
fi

# Create cron entries
cat > "$CRON_FILE" << EOF
# Echo Garden Backup Automation
# Generated on $(date)

# Daily backup check at 2 AM UTC
0 2 * * * cd $PROJECT_DIR && node scripts/backup/daily-backup-check.mjs >> logs/cron.log 2>&1

# Weekly backup check on Monday at 3 AM UTC
0 3 * * 1 cd $PROJECT_DIR && node scripts/backup/weekly-backup-check.mjs >> logs/cron.log 2>&1

# Monthly disaster recovery drill on first day of month at 4 AM UTC
0 4 1 * * cd $PROJECT_DIR && node scripts/backup/monthly-backup-drill.mjs >> logs/cron.log 2>&1
EOF

echo "✅ Created cron configuration file: $CRON_FILE"
echo ""
echo "To install these cron jobs, run:"
echo "  crontab $CRON_FILE"
echo ""
echo "To view your current cron jobs:"
echo "  crontab -l"
echo ""
echo "To remove these cron jobs:"
echo "  crontab -r"
echo ""
echo "Note: Make sure to set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
echo "      in your environment or .env file before running cron jobs."

