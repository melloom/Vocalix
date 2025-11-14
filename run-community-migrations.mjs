#!/usr/bin/env node
/**
 * Run Community Feature Migrations
 * Combines: Live Rooms, Chat Rooms, and Community Follows
 * 
 * Usage: node run-community-migrations.mjs
 * Or: npx node run-community-migrations.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrationsDir = join(__dirname, 'supabase', 'migrations');

const migrationsToRun = [
  '20251125000000_add_live_audio_rooms.sql',
  '20251126000000_add_community_chat_rooms.sql',
  '20251127000000_add_community_follows.sql',
];

let combinedSQL = `-- ============================================
-- Community Features Migrations
-- ============================================
-- This migration adds:
-- 1. Live Audio Rooms (with participants, recordings, transcripts)
-- 2. Community Chat Rooms (with real-time messaging)
-- 3. Community Follows (follow/unfollow communities)
-- ============================================
-- Run this in Supabase Dashboard > SQL Editor
-- Or use: npx supabase db push
-- ============================================

`;

console.log('📦 Combining migrations...\n');

for (const migrationFile of migrationsToRun) {
  const migrationPath = join(migrationsDir, migrationFile);
  try {
    console.log(`📄 Reading: ${migrationFile}`);
    const sql = readFileSync(migrationPath, 'utf-8');
    combinedSQL += `\n-- ============================================\n`;
    combinedSQL += `-- ${migrationFile}\n`;
    combinedSQL += `-- ============================================\n\n`;
    combinedSQL += sql;
    combinedSQL += `\n\n`;
  } catch (error) {
    console.error(`❌ Error reading ${migrationFile}:`, error.message);
    process.exit(1);
  }
}

const outputPath = join(__dirname, 'COMMUNITY_MIGRATIONS.sql');
writeFileSync(outputPath, combinedSQL);

console.log(`\n✅ Created combined migration file: ${outputPath}\n`);
console.log('📝 Next steps:\n');
console.log('   Option 1: Run via Supabase CLI');
console.log('   ──────────────────────────────');
console.log('   npx supabase db push\n');
console.log('   Option 2: Run manually in Supabase Dashboard');
console.log('   ─────────────────────────────────────────────');
console.log('   1. Open: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/sql/new');
console.log('   2. Copy the contents of COMMUNITY_MIGRATIONS.sql');
console.log('   3. Paste into SQL Editor and click "Run"\n');
console.log('   Option 3: Run individual migrations');
console.log('   ──────────────────────────────────');
for (const migrationFile of migrationsToRun) {
  console.log(`   - supabase/migrations/${migrationFile}`);
}
console.log('');

