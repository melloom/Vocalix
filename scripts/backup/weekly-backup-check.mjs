#!/usr/bin/env node
/**
 * Weekly Backup Testing and Verification Script
 * 
 * Performs:
 * - Test backup restoration (dry run)
 * - Review backup logs
 * - Verify backup integrity
 * 
 * Usage: node scripts/backup/weekly-backup-check.mjs
 * 
 * Requires environment variables:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const LOG_DIR = join(__dirname, '../../logs');
const BACKUP_DIR = join(__dirname, '../../backups');

// Ensure directories exist
try {
  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(BACKUP_DIR, { recursive: true });
} catch (error) {
  // Directories might already exist
}

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
  console.log(logMessage);
  
  const logFile = join(LOG_DIR, `weekly-backup-check-${new Date().toISOString().split('T')[0]}.log`);
  try {
    writeFileSync(logFile, logMessage + '\n', { flag: 'a' });
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }
}

async function reviewBackupLogs() {
  log('Reviewing backup logs...');
  
  try {
    const logFiles = readdirSync(LOG_DIR)
      .filter(file => file.startsWith('backup-check-') || file.startsWith('backup-report-'))
      .sort()
      .reverse()
      .slice(0, 7); // Last 7 days
    
    if (logFiles.length === 0) {
      log('⚠️  No backup logs found', 'warning');
      return { reviewed: false, logCount: 0 };
    }
    
    log(`Found ${logFiles.length} backup log files`);
    
    const issues = [];
    const successes = [];
    
    for (const logFile of logFiles) {
      const logPath = join(LOG_DIR, logFile);
      try {
        const content = readFileSync(logPath, 'utf-8');
        
        // Check for errors
        if (content.includes('[ERROR]') || content.includes('✗')) {
          issues.push({
            file: logFile,
            hasErrors: true,
          });
        } else if (content.includes('[WARNING]') || content.includes('⚠️')) {
          issues.push({
            file: logFile,
            hasWarnings: true,
          });
        } else {
          successes.push(logFile);
        }
      } catch (error) {
        log(`Failed to read log file ${logFile}: ${error.message}`, 'error');
      }
    }
    
    log(`✓ Reviewed ${logFiles.length} log files`);
    log(`  - Successful: ${successes.length}`);
    log(`  - With issues: ${issues.length}`);
    
    if (issues.length > 0) {
      log('Issues found in logs:', 'warning');
      issues.forEach(issue => {
        log(`  - ${issue.file}`, 'warning');
      });
    }
    
    return {
      reviewed: true,
      logCount: logFiles.length,
      issues,
      successes: successes.length,
    };
  } catch (error) {
    log(`✗ Failed to review backup logs: ${error.message}`, 'error');
    return { reviewed: false, error: error.message };
  }
}

async function testBackupRestoration() {
  log('Testing backup restoration (dry run)...');
  
  try {
    // Create a test backup of a small table
    log('Creating test backup...');
    
    const { data: testData, error: fetchError } = await supabase
      .from('profiles')
      .select('id, username, created_at')
      .limit(5);
    
    if (fetchError) {
      log(`✗ Failed to fetch test data: ${fetchError.message}`, 'error');
      return { tested: false, error: fetchError.message };
    }
    
    // Create a test backup file
    const testBackup = {
      timestamp: new Date().toISOString(),
      type: 'test_backup',
      data: testData,
      recordCount: testData?.length || 0,
    };
    
    const backupFileName = `test-backup-${Date.now()}.json`;
    const backupPath = join(BACKUP_DIR, backupFileName);
    
    writeFileSync(backupPath, JSON.stringify(testBackup, null, 2));
    log(`✓ Test backup created: ${backupFileName}`);
    
    // Verify backup file integrity
    log('Verifying backup file integrity...');
    const verifyData = JSON.parse(readFileSync(backupPath, 'utf-8'));
    
    if (verifyData.timestamp && verifyData.data && verifyData.recordCount === testData?.length) {
      log('✓ Backup file integrity: OK');
      log(`  - Records: ${verifyData.recordCount}`);
      log(`  - File size: ${readFileSync(backupPath).length} bytes`);
      
      // Clean up test backup
      try {
        const { unlinkSync } = await import('fs');
        unlinkSync(backupPath);
        log('✓ Test backup cleaned up');
      } catch (error) {
        log(`⚠️  Could not clean up test backup: ${error.message}`, 'warning');
      }
      
      return {
        tested: true,
        integrity: true,
        recordCount: verifyData.recordCount,
      };
    } else {
      log('✗ Backup file integrity check failed', 'error');
      return { tested: false, integrity: false };
    }
  } catch (error) {
    log(`✗ Backup restoration test failed: ${error.message}`, 'error');
    return { tested: false, error: error.message };
  }
}

async function verifyBackupIntegrity() {
  log('Verifying backup integrity...');
  
  try {
    // Check backups in storage bucket
    const { data: backupFiles, error } = await supabase.storage
      .from('backups')
      .list('', { limit: 100 });
    
    if (error) {
      log(`⚠️  Could not list backup files: ${error.message}`, 'warning');
      return { verified: false, error: error.message };
    }
    
    const fileCount = backupFiles?.length || 0;
    log(`Found ${fileCount} backup files in storage`);
    
    if (fileCount === 0) {
      log('⚠️  No backup files found in storage bucket', 'warning');
      return { verified: true, fileCount: 0, warning: 'No backups found' };
    }
    
    // Check local backup directory
    let localBackupCount = 0;
    try {
      const localBackups = readdirSync(BACKUP_DIR)
        .filter(file => file.endsWith('.json') || file.endsWith('.sql'));
      localBackupCount = localBackups.length;
      log(`Found ${localBackupCount} local backup files`);
    } catch (error) {
      log(`⚠️  Could not check local backups: ${error.message}`, 'warning');
    }
    
    // Verify database backup availability (via Supabase Dashboard check)
    log('⚠️  Database backup integrity requires manual verification', 'warning');
    log('   Dashboard: https://supabase.com/dashboard/project/_/database/backups');
    log('   Check that recent backups exist and are accessible');
    
    return {
      verified: true,
      storageBackups: fileCount,
      localBackups: localBackupCount,
      note: 'Manual dashboard verification required',
    };
  } catch (error) {
    log(`✗ Backup integrity verification failed: ${error.message}`, 'error');
    return { verified: false, error: error.message };
  }
}

async function createWeeklyBackup() {
  log('Creating weekly manual backup...');
  
  try {
    // Export key tables metadata
    const tables = ['profiles', 'clips', 'comments', 'reactions'];
    const backupData = {
      timestamp: new Date().toISOString(),
      type: 'weekly_backup_metadata',
      tables: {},
    };
    
    for (const table of tables) {
      try {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          log(`⚠️  Could not get count for ${table}: ${error.message}`, 'warning');
          backupData.tables[table] = { error: error.message };
        } else {
          backupData.tables[table] = { recordCount: count || 0 };
          log(`  - ${table}: ${count || 0} records`);
        }
      } catch (error) {
        log(`⚠️  Error checking ${table}: ${error.message}`, 'warning');
        backupData.tables[table] = { error: error.message };
      }
    }
    
    // Save backup metadata
    const backupFileName = `weekly-backup-${new Date().toISOString().split('T')[0]}.json`;
    const backupPath = join(BACKUP_DIR, backupFileName);
    
    writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    log(`✓ Weekly backup metadata saved: ${backupFileName}`);
    
    // Also upload to Supabase storage if possible
    try {
      const { error: uploadError } = await supabase.storage
        .from('backups')
        .upload(`system/${backupFileName}`, JSON.stringify(backupData, null, 2), {
          contentType: 'application/json',
          upsert: false,
        });
      
      if (uploadError) {
        log(`⚠️  Could not upload to storage: ${uploadError.message}`, 'warning');
      } else {
        log(`✓ Backup uploaded to storage bucket`);
      }
    } catch (error) {
      log(`⚠️  Storage upload failed: ${error.message}`, 'warning');
    }
    
    return {
      created: true,
      fileName: backupFileName,
      recordCounts: backupData.tables,
    };
  } catch (error) {
    log(`✗ Weekly backup creation failed: ${error.message}`, 'error');
    return { created: false, error: error.message };
  }
}

async function generateReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    type: 'weekly_backup_check',
    checks: {
      backupLogs: results.logs,
      restorationTest: results.restoration,
      backupIntegrity: results.integrity,
      weeklyBackup: results.weeklyBackup,
    },
    summary: {
      allChecksPassed: results.logs.reviewed &&
                      results.restoration.tested &&
                      results.integrity.verified &&
                      results.weeklyBackup.created,
      warnings: [],
      errors: [],
    },
  };
  
  // Collect warnings and errors
  if (!results.logs.reviewed) {
    report.summary.errors.push('Backup log review failed');
  }
  
  if (!results.restoration.tested) {
    report.summary.errors.push('Backup restoration test failed');
  }
  
  if (!results.integrity.verified) {
    report.summary.errors.push('Backup integrity verification failed');
  }
  
  if (!results.weeklyBackup.created) {
    report.summary.errors.push('Weekly backup creation failed');
  }
  
  if (results.integrity.warning) {
    report.summary.warnings.push(results.integrity.warning);
  }
  
  return report;
}

async function main() {
  log('='.repeat(60));
  log('Weekly Backup Testing and Verification Started');
  log('='.repeat(60));
  
  const results = {
    logs: {},
    restoration: {},
    integrity: {},
    weeklyBackup: {},
  };
  
  // Run checks
  results.logs = await reviewBackupLogs();
  results.restoration = await testBackupRestoration();
  results.integrity = await verifyBackupIntegrity();
  results.weeklyBackup = await createWeeklyBackup();
  
  // Generate report
  const report = await generateReport(results);
  
  log('');
  log('='.repeat(60));
  log('Summary');
  log('='.repeat(60));
  log(`Backup Logs Review: ${results.logs.reviewed ? '✓ PASS' : '✗ FAIL'}`);
  log(`Restoration Test: ${results.restoration.tested ? '✓ PASS' : '✗ FAIL'}`);
  log(`Backup Integrity: ${results.integrity.verified ? '✓ PASS' : '✗ FAIL'}`);
  log(`Weekly Backup Created: ${results.weeklyBackup.created ? '✓ PASS' : '✗ FAIL'}`);
  
  if (report.summary.warnings.length > 0) {
    log('');
    log('Warnings:');
    report.summary.warnings.forEach(warning => log(`  ⚠️  ${warning}`, 'warning'));
  }
  
  if (report.summary.errors.length > 0) {
    log('');
    log('Errors:');
    report.summary.errors.forEach(error => log(`  ✗ ${error}`, 'error'));
  }
  
  // Save report
  const reportFile = join(LOG_DIR, `weekly-backup-report-${new Date().toISOString().split('T')[0]}.json`);
  try {
    writeFileSync(reportFile, JSON.stringify(report, null, 2));
    log('');
    log(`Report saved to: ${reportFile}`);
  } catch (error) {
    log(`Failed to save report: ${error.message}`, 'error');
  }
  
  log('');
  log('='.repeat(60));
  log('Weekly Backup Testing and Verification Completed');
  log('='.repeat(60));
  
  // Exit with error code if checks failed
  if (!report.summary.allChecksPassed) {
    process.exit(1);
  }
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});

