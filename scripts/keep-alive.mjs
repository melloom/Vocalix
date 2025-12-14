#!/usr/bin/env node

/**
 * Supabase Keep-Alive Script
 * 
 * This script makes a lightweight query to your Supabase database
 * to prevent it from pausing due to inactivity (7-day pause policy).
 * 
 * Usage:
 *   node scripts/keep-alive.mjs
 * 
 * Environment Variables Required:
 *   SUPABASE_URL - Your Supabase project URL
 *   SUPABASE_ANON_KEY - Your Supabase anonymous/public key
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Error: Missing required environment variables');
  console.error('Required: SUPABASE_URL and SUPABASE_ANON_KEY');
  console.error('Or: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function keepAlive() {
  try {
    console.log('🔄 Pinging Supabase to prevent pause...');
    console.log(`📍 URL: ${SUPABASE_URL}`);
    
    // Make a lightweight query - just get the current timestamp from the database
    // This is the most efficient way to keep the database active
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    
    if (error) {
      // If profiles table doesn't exist or has issues, try a simpler approach
      // Just ping the REST API endpoint
      console.log('⚠️  Query returned error, trying API ping instead...');
      const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`API ping failed: ${response.status} ${response.statusText}`);
      }
      
      console.log('✅ Supabase API ping successful');
      console.log(`📊 Status: ${response.status} ${response.statusText}`);
    } else {
      console.log('✅ Supabase database query successful');
      console.log(`📊 Query returned ${data?.length || 0} result(s)`);
    }
    
    console.log('✅ Keep-alive ping completed successfully');
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    
    return true;
  } catch (error) {
    console.error('❌ Keep-alive ping failed:');
    console.error(error.message);
    
    // Don't fail the workflow if it's a minor error
    // The ping itself is what matters, not the specific query result
    if (error.message.includes('Failed to fetch') || error.message.includes('network')) {
      console.error('⚠️  Network error - Supabase might be paused or unreachable');
      process.exit(1);
    }
    
    // For other errors, log but don't fail (might be RLS policy issues, etc.)
    console.error('⚠️  Non-critical error - ping may have still worked');
    return false;
  }
}

// Run the keep-alive
keepAlive()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });

