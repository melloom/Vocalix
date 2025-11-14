#!/usr/bin/env node
/**
 * Simple script to create a combined SQL file for manual execution
 * Run this, then copy the output to Supabase Dashboard SQL Editor
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrationsDir = join(__dirname, 'supabase', 'migrations');

const migrationsToRun = [
  '20251120000001_add_rate_limiting.sql',
  '20251120000002_device_security.sql',
  '20251120000003_device_view_policy.sql',
  '20251120000004_get_user_devices_rpc.sql',
];

let combinedSQL = `-- ============================================
-- Device Security & Rate Limiting Migrations
-- ============================================
-- Run this in Supabase Dashboard > SQL Editor
-- https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/sql/new
-- 
-- This migration adds:
-- 1. Rate limiting infrastructure
-- 2. Device security tracking
-- 3. Security audit logging
-- 4. Device management functions
-- ============================================

`;

for (const migrationFile of migrationsToRun) {
  const migrationPath = join(migrationsDir, migrationFile);
  try {
    console.log(`Reading: ${migrationFile}`);
    const sql = readFileSync(migrationPath, 'utf-8');
    combinedSQL += `\n-- ============================================\n`;
    combinedSQL += `-- ${migrationFile}\n`;
    combinedSQL += `-- ============================================\n\n`;
    combinedSQL += sql;
    combinedSQL += `\n\n`;
  } catch (error) {
    console.error(`❌ Error reading ${migrationFile}:`, error.message);
  }
}

const outputPath = join(__dirname, 'COMBINED_MIGRATION.sql');
import('fs').then(fs => {
  fs.promises.writeFile(outputPath, combinedSQL).then(() => {
    console.log(`\n✅ Created: ${outputPath}`);
    console.log('\n📝 Next steps:');
    console.log('   1. Open Supabase Dashboard: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/sql/new');
    console.log('   2. Copy the contents of COMBINED_MIGRATION.sql');
    console.log('   3. Paste into SQL Editor and click "Run"\n');
  });
});

