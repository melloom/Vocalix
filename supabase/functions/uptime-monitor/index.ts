/**
 * Uptime Monitoring Edge Function
 * Tracks system uptime and availability metrics
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { initializeMonitoring, extractRequestContext } from "../_shared/monitoring.ts";

interface UptimeMetrics {
  timestamp: string;
  status: "up" | "down";
  responseTime: number;
  checks: {
    database: boolean;
    storage: boolean;
    functions: boolean;
  };
  uptime: number;
  version: string;
}

serve(async (req) => {
  const requestStart = Date.now();
  const functionName = "uptime-monitor";
  
  // Initialize monitoring
  initializeMonitoring(functionName);
  const context = extractRequestContext(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Quick health checks
    const [dbOk, storageOk, functionsOk] = await Promise.allSettled([
      supabase.from("profiles").select("id").limit(1).single(),
      supabase.storage.listBuckets(),
      Promise.resolve(true), // Functions are available if we're running
    ]);

    const checks = {
      database: dbOk.status === "fulfilled" && !dbOk.value.error,
      storage: storageOk.status === "fulfilled" && !storageOk.value.error,
      functions: functionsOk.status === "fulfilled",
    };

    const allHealthy = Object.values(checks).every((check) => check === true);
    const responseTime = Date.now() - requestStart;

    // Log uptime metric
    const metrics: UptimeMetrics = {
      timestamp: new Date().toISOString(),
      status: allHealthy ? "up" : "down",
      responseTime,
      checks,
      uptime: Date.now() - (parseInt(Deno.env.get("START_TIME") || "0") || Date.now()),
      version: Deno.env.get("RELEASE_VERSION") || "unknown",
    };

    // Store metrics in database (optional)
    try {
      await supabase.from("uptime_metrics").insert({
        timestamp: metrics.timestamp,
        status: metrics.status,
        response_time: metrics.responseTime,
        database_ok: checks.database,
        storage_ok: checks.storage,
        functions_ok: checks.functions,
      }).catch(() => {
        // Table might not exist, that's OK
      });
    } catch {
      // Ignore storage errors
    }

    return new Response(
      JSON.stringify(metrics, null, 2),
      {
        status: allHealthy ? 200 : 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      }
    );
  } catch (error) {
    console.error("[Uptime Monitor] Error:", error);
    
    return new Response(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        status: "down",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
});

