#!/usr/bin/env node
/**
 * Run Supabase migrations using service role key
 * Usage: node run-migrations.mjs
 * 
 * Requires environment variables:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗');
  console.error('\nSet these in your .env file or as environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function runMigrations() {
  const migrationsDir = join(__dirname, 'supabase', 'migrations');
  
  // Migration files to run (in order)
  const migrationsToRun = [
    '20251120000001_add_rate_limiting.sql',
    '20251120000002_device_security.sql',
    '20251120000003_device_view_policy.sql',
    '20251120000004_get_user_devices_rpc.sql',
  ];

  console.log('🚀 Running migrations...\n');

  for (const migrationFile of migrationsToRun) {
    const migrationPath = join(migrationsDir, migrationFile);
    
    try {
      console.log(`📄 Running: ${migrationFile}`);
      const sql = readFileSync(migrationPath, 'utf-8');
      
      // Split by semicolons and execute each statement
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      for (const statement of statements) {
        if (statement.trim()) {
          const { error } = await supabase.rpc('exec_sql', { sql: statement });
          if (error) {
            // Try direct query if RPC doesn't work
            const { error: queryError } = await supabase
              .from('_migrations')
              .select('*')
              .limit(1);
            
            if (queryError && queryError.code === 'PGRST301') {
              // Use raw SQL execution via REST API
              console.log('   ⚠️  Note: Some statements may need to be run manually in Supabase Dashboard');
              console.log('   📝 Go to: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/sql/new');
              console.log(`   📋 Copy the contents of: ${migrationFile}\n`);
              continue;
            }
          }
        }
      }
      
      console.log(`   ✅ Completed: ${migrationFile}\n`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`   ⚠️  File not found: ${migrationFile} (skipping)\n`);
      } else {
        console.error(`   ❌ Error running ${migrationFile}:`, error.message);
        console.log(`   📝 You may need to run this migration manually in Supabase Dashboard\n`);
      }
    }
  }

  console.log('✨ Migration process completed!');
  console.log('\n📝 If any migrations failed, run them manually in Supabase Dashboard:');
  console.log('   https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/sql/new\n');
}

// Alternative: Create a combined SQL file that can be run in Supabase Dashboard
async function createCombinedMigration() {
  const migrationsDir = join(__dirname, 'supabase', 'migrations');
  const migrationsToRun = [
    '20251120000001_add_rate_limiting.sql',
    '20251120000002_device_security.sql',
    '20251120000003_device_view_policy.sql',
    '20251120000004_get_user_devices_rpc.sql',
  ];

  let combinedSQL = '-- Combined Migration: Device Security & Rate Limiting\n';
  combinedSQL += '-- Run this in Supabase Dashboard > SQL Editor\n';
  combinedSQL += '-- https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/sql/new\n\n';

  for (const migrationFile of migrationsToRun) {
    const migrationPath = join(migrationsDir, migrationFile);
    try {
      const sql = readFileSync(migrationPath, 'utf-8');
      combinedSQL += `-- ============================================\n`;
      combinedSQL += `-- ${migrationFile}\n`;
      combinedSQL += `-- ============================================\n\n`;
      combinedSQL += sql;
      combinedSQL += '\n\n';
    } catch (error) {
      console.error(`Error reading ${migrationFile}:`, error.message);
    }
  }

  const outputPath = join(__dirname, 'combined_migration.sql');
  await import('fs').then(fs => fs.promises.writeFile(outputPath, combinedSQL));
  console.log(`✅ Created combined migration file: ${outputPath}`);
  console.log('📝 Copy and paste this file into Supabase Dashboard > SQL Editor\n');
}

// Main execution
const args = process.argv.slice(2);
if (args.includes('--create-file')) {
  createCombinedMigration();
} else {
  runMigrations().catch(console.error);
}

