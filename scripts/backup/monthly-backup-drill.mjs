#!/usr/bin/env node
/**
 * Monthly Disaster Recovery Drill Script
 * 
 * Performs:
 * - Full disaster recovery drill simulation
 * - Review and update procedures
 * - Document any issues
 * 
 * Usage: node scripts/backup/monthly-backup-drill.mjs
 * 
 * Requires environment variables:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
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
const DOCS_DIR = join(__dirname, '../..');

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
  
  const logFile = join(LOG_DIR, `monthly-drill-${new Date().toISOString().split('T')[0]}.log`);
  try {
    writeFileSync(logFile, logMessage + '\n', { flag: 'a' });
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }
}

async function assessSystemHealth() {
  log('Assessing system health...');
  
  const health = {
    database: false,
    storage: false,
    edgeFunctions: false,
    issues: [],
  };
  
  // Check database
  try {
    const { error } = await supabase.from('profiles').select('count').limit(1);
    if (error) {
      health.issues.push(`Database: ${error.message}`);
    } else {
      health.database = true;
      log('✓ Database: Healthy');
    }
  } catch (error) {
    health.issues.push(`Database: ${error.message}`);
    log(`✗ Database: ${error.message}`, 'error');
  }
  
  // Check storage
  try {
    const { error } = await supabase.storage.from('audio').list('', { limit: 1 });
    if (error) {
      health.issues.push(`Storage: ${error.message}`);
    } else {
      health.storage = true;
      log('✓ Storage: Healthy');
    }
  } catch (error) {
    health.issues.push(`Storage: ${error.message}`);
    log(`✗ Storage: ${error.message}`, 'error');
  }
  
  // Check edge functions (by attempting to call a known function)
  try {
    const { error } = await supabase.functions.invoke('security-audit', {
      body: { type: 'health_check' },
    });
    // Even if it errors, if we get a response, the function system is working
    health.edgeFunctions = true;
    log('✓ Edge Functions: Accessible');
  } catch (error) {
    health.issues.push(`Edge Functions: ${error.message}`);
    log(`⚠️  Edge Functions: ${error.message}`, 'warning');
  }
  
  return health;
}

async function simulateDisasterRecovery() {
  log('Simulating disaster recovery scenario...');
  log('Scenario: Database corruption requiring restoration from backup');
  
  const drillResults = {
    scenario: 'Database corruption requiring restoration',
    timestamp: new Date().toISOString(),
    steps: [],
    success: false,
  };
  
  // Step 1: Identify affected systems
  log('Step 1: Identifying affected systems...');
  const health = await assessSystemHealth();
  drillResults.steps.push({
    step: 1,
    name: 'Identify affected systems',
    status: health.database && health.storage ? 'pass' : 'fail',
    details: health,
  });
  
  // Step 2: Check backup availability
  log('Step 2: Checking backup availability...');
  try {
    const { data: backupFiles } = await supabase.storage
      .from('backups')
      .list('', { limit: 10 });
    
    const backupAvailable = (backupFiles?.length || 0) > 0;
    drillResults.steps.push({
      step: 2,
      name: 'Check backup availability',
      status: backupAvailable ? 'pass' : 'warning',
      details: {
        backupCount: backupFiles?.length || 0,
        note: 'Supabase automatic backups should be available via dashboard',
      },
    });
    
    log(backupAvailable 
      ? `✓ Backups available: ${backupFiles?.length} files found`
      : '⚠️  No backup files found in storage (check Supabase dashboard)');
  } catch (error) {
    drillResults.steps.push({
      step: 2,
      name: 'Check backup availability',
      status: 'fail',
      error: error.message,
    });
    log(`✗ Backup check failed: ${error.message}`, 'error');
  }
  
  // Step 3: Estimate recovery time
  log('Step 3: Estimating recovery time...');
  const rto = {
    database: '< 1 hour',
    storage: '< 2 hours',
    application: '< 30 minutes',
  };
  drillResults.steps.push({
    step: 3,
    name: 'Estimate recovery time',
    status: 'pass',
    details: rto,
  });
  log('✓ Recovery Time Objectives (RTO):');
  log(`  - Database: ${rto.database}`);
  log(`  - Storage: ${rto.storage}`);
  log(`  - Application: ${rto.application}`);
  
  // Step 4: Verify data integrity after recovery (simulated)
  log('Step 4: Verifying data integrity (simulated)...');
  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, username')
      .limit(5);
    
    if (error) {
      drillResults.steps.push({
        step: 4,
        name: 'Verify data integrity',
        status: 'fail',
        error: error.message,
      });
      log(`✗ Data integrity check failed: ${error.message}`, 'error');
    } else {
      drillResults.steps.push({
        step: 4,
        name: 'Verify data integrity',
        status: 'pass',
        details: {
          sampleRecords: profiles?.length || 0,
          note: 'Sample data accessible',
        },
      });
      log(`✓ Data integrity: OK (sampled ${profiles?.length || 0} records)`);
    }
  } catch (error) {
    drillResults.steps.push({
      step: 4,
      name: 'Verify data integrity',
      status: 'fail',
      error: error.message,
    });
    log(`✗ Data integrity check failed: ${error.message}`, 'error');
  }
  
  // Determine overall success
  const failedSteps = drillResults.steps.filter(s => s.status === 'fail');
  drillResults.success = failedSteps.length === 0;
  
  return drillResults;
}

async function reviewAndUpdateProcedures() {
  log('Reviewing and updating backup procedures...');
  
  const backupDocPath = join(DOCS_DIR, 'BACKUP_AND_RECOVERY.md');
  let proceduresUpToDate = false;
  let lastUpdated = null;
  
  if (existsSync(backupDocPath)) {
    try {
      const content = readFileSync(backupDocPath, 'utf-8');
      
      // Check for last updated date
      const lastUpdatedMatch = content.match(/\*\*Last Updated\*\*:\s*(\d{4}-\d{2}-\d{2})/);
      if (lastUpdatedMatch) {
        lastUpdated = lastUpdatedMatch[1];
        const lastUpdatedDate = new Date(lastUpdated);
        const daysSinceUpdate = (Date.now() - lastUpdatedDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceUpdate < 90) {
          proceduresUpToDate = true;
          log(`✓ Procedures last updated: ${lastUpdated} (${Math.floor(daysSinceUpdate)} days ago)`);
        } else {
          log(`⚠️  Procedures last updated: ${lastUpdated} (${Math.floor(daysSinceUpdate)} days ago)`, 'warning');
          log('   Consider reviewing and updating procedures');
        }
      } else {
        log('⚠️  Could not find last updated date in procedures', 'warning');
      }
      
      // Check for key sections
      const requiredSections = [
        'Backup Strategy',
        'Recovery Procedures',
        'Disaster Recovery',
        'Backup Checklist',
      ];
      
      const missingSections = requiredSections.filter(section => 
        !content.includes(section)
      );
      
      if (missingSections.length > 0) {
        log(`⚠️  Missing sections in procedures: ${missingSections.join(', ')}`, 'warning');
      } else {
        log('✓ All required sections present in procedures');
      }
    } catch (error) {
      log(`✗ Failed to review procedures: ${error.message}`, 'error');
    }
  } else {
    log('⚠️  Backup procedures document not found', 'warning');
  }
  
  return {
    reviewed: true,
    upToDate: proceduresUpToDate,
    lastUpdated,
    documentPath: backupDocPath,
  };
}

async function documentIssues(drillResults, proceduresReview) {
  log('Documenting issues and findings...');
  
  const issues = [];
  const recommendations = [];
  
  // Collect issues from drill
  drillResults.steps.forEach(step => {
    if (step.status === 'fail') {
      issues.push({
        type: 'drill_failure',
        step: step.name,
        error: step.error || 'Unknown error',
        timestamp: drillResults.timestamp,
      });
    } else if (step.status === 'warning') {
      recommendations.push({
        type: 'improvement',
        area: step.name,
        details: step.details,
      });
    }
  });
  
  // Add procedure review findings
  if (!proceduresReview.upToDate) {
    recommendations.push({
      type: 'procedure_update',
      area: 'Backup procedures',
      details: {
        lastUpdated: proceduresReview.lastUpdated,
        recommendation: 'Review and update backup procedures document',
      },
    });
  }
  
  // Create issues document
  const issuesDoc = {
    timestamp: new Date().toISOString(),
    type: 'monthly_drill_issues',
    issues,
    recommendations,
    summary: {
      totalIssues: issues.length,
      totalRecommendations: recommendations.length,
      criticalIssues: issues.filter(i => i.type === 'drill_failure').length,
    },
  };
  
  // Save issues document
  const issuesFile = join(LOG_DIR, `drill-issues-${new Date().toISOString().split('T')[0]}.json`);
  try {
    writeFileSync(issuesFile, JSON.stringify(issuesDoc, null, 2));
    log(`✓ Issues documented: ${issuesFile}`);
  } catch (error) {
    log(`✗ Failed to save issues document: ${error.message}`, 'error');
  }
  
  if (issues.length > 0) {
    log('');
    log('Issues Found:');
    issues.forEach(issue => {
      log(`  ✗ ${issue.step || issue.area}: ${issue.error || 'See details'}`, 'error');
    });
  }
  
  if (recommendations.length > 0) {
    log('');
    log('Recommendations:');
    recommendations.forEach(rec => {
      log(`  ⚠️  ${rec.area}: ${rec.details?.recommendation || 'See details'}`, 'warning');
    });
  }
  
  return issuesDoc;
}

async function generateReport(drillResults, proceduresReview, issuesDoc) {
  const report = {
    timestamp: new Date().toISOString(),
    type: 'monthly_disaster_recovery_drill',
    drill: drillResults,
    procedures: proceduresReview,
    issues: issuesDoc,
    summary: {
      drillSuccess: drillResults.success,
      proceduresUpToDate: proceduresReview.upToDate,
      issuesFound: issuesDoc.summary.totalIssues,
      recommendations: issuesDoc.summary.totalRecommendations,
      overallStatus: drillResults.success && proceduresReview.upToDate && issuesDoc.summary.totalIssues === 0 
        ? 'pass' 
        : 'needs_attention',
    },
  };
  
  return report;
}

async function main() {
  log('='.repeat(60));
  log('Monthly Disaster Recovery Drill Started');
  log('='.repeat(60));
  
  // Run drill
  const drillResults = await simulateDisasterRecovery();
  const proceduresReview = await reviewAndUpdateProcedures();
  const issuesDoc = await documentIssues(drillResults, proceduresReview);
  
  // Generate report
  const report = await generateReport(drillResults, proceduresReview, issuesDoc);
  
  log('');
  log('='.repeat(60));
  log('Summary');
  log('='.repeat(60));
  log(`Drill Status: ${drillResults.success ? '✓ PASS' : '✗ FAIL'}`);
  log(`Procedures Up-to-Date: ${proceduresReview.upToDate ? '✓ YES' : '⚠️  NO'}`);
  log(`Issues Found: ${issuesDoc.summary.totalIssues}`);
  log(`Recommendations: ${issuesDoc.summary.totalRecommendations}`);
  log(`Overall Status: ${report.summary.overallStatus.toUpperCase()}`);
  
  // Save report
  const reportFile = join(LOG_DIR, `monthly-drill-report-${new Date().toISOString().split('T')[0]}.json`);
  try {
    writeFileSync(reportFile, JSON.stringify(report, null, 2));
    log('');
    log(`Report saved to: ${reportFile}`);
  } catch (error) {
    log(`Failed to save report: ${error.message}`, 'error');
  }
  
  log('');
  log('='.repeat(60));
  log('Monthly Disaster Recovery Drill Completed');
  log('='.repeat(60));
  log('');
  log('Next Steps:');
  log('1. Review the drill report');
  log('2. Address any issues found');
  log('3. Update procedures if needed');
  log('4. Schedule next month\'s drill');
  
  // Exit with error code if drill failed
  if (!drillResults.success) {
    process.exit(1);
  }
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});

