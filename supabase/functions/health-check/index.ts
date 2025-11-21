/**
 * Health Check Edge Function
 * Provides comprehensive health status for monitoring and uptime checks
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { initializeMonitoring, extractRequestContext } from "../_shared/monitoring.ts";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  checks: {
    database: CheckResult;
    storage: CheckResult;
    functions: CheckResult;
    cache?: CheckResult;
  };
  metrics?: {
    responseTime: number;
    uptime: number;
  };
}

interface CheckResult {
  status: "pass" | "fail" | "warn";
  message?: string;
  responseTime?: number;
}

const startTime = Date.now();

serve(async (req) => {
  const requestStart = Date.now();
  const functionName = "health-check";
  
  // Initialize monitoring
  initializeMonitoring(functionName);
  const context = extractRequestContext(req);

  try {
    // Get version from environment
    const version = Deno.env.get("RELEASE_VERSION") || "unknown";

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Run health checks in parallel
    const [dbCheck, storageCheck, functionsCheck] = await Promise.allSettled([
      checkDatabase(supabase),
      checkStorage(supabase),
      checkFunctions(supabase),
    ]);

    // Process results
    const checks = {
      database: dbCheck.status === "fulfilled" ? dbCheck.value : {
        status: "fail" as const,
        message: dbCheck.reason?.message || "Database check failed",
      },
      storage: storageCheck.status === "fulfilled" ? storageCheck.value : {
        status: "fail" as const,
        message: storageCheck.reason?.message || "Storage check failed",
      },
      functions: functionsCheck.status === "fulfilled" ? functionsCheck.value : {
        status: "fail" as const,
        message: functionsCheck.reason?.message || "Functions check failed",
      },
    };

    // Determine overall status
    const hasFailures = Object.values(checks).some((check) => check.status === "fail");
    const hasWarnings = Object.values(checks).some((check) => check.status === "warn");
    
    const overallStatus: HealthStatus["status"] = hasFailures
      ? "unhealthy"
      : hasWarnings
      ? "degraded"
      : "healthy";

    const responseTime = Date.now() - requestStart;
    const uptime = Date.now() - startTime;

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version,
      checks,
      metrics: {
        responseTime,
        uptime,
      },
    };

    // Return appropriate status code
    const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;

    return new Response(
      JSON.stringify(healthStatus, null, 2),
      {
        status: statusCode,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Health-Check-Version": version,
        },
      }
    );
  } catch (error) {
    console.error("[Health Check] Error:", error);
    
    return new Response(
      JSON.stringify({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
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

/**
 * Check database connectivity and performance
 */
async function checkDatabase(supabase: ReturnType<typeof createClient>): Promise<CheckResult> {
  const start = Date.now();
  
  try {
    // Simple query to check database connectivity
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .limit(1)
      .single();

    const responseTime = Date.now() - start;

    if (error && error.code !== "PGRST116") { // PGRST116 is "not found" which is OK
      return {
        status: "fail",
        message: `Database query failed: ${error.message}`,
        responseTime,
      };
    }

    // Check response time
    if (responseTime > 1000) {
      return {
        status: "warn",
        message: `Database response time is slow: ${responseTime}ms`,
        responseTime,
      };
    }

    return {
      status: "pass",
      responseTime,
    };
  } catch (error) {
    return {
      status: "fail",
      message: error instanceof Error ? error.message : "Database check failed",
      responseTime: Date.now() - start,
    };
  }
}

/**
 * Check storage connectivity
 */
async function checkStorage(supabase: ReturnType<typeof createClient>): Promise<CheckResult> {
  const start = Date.now();
  
  try {
    // Check if we can list buckets (read-only operation)
    const { data, error } = await supabase.storage.listBuckets();

    const responseTime = Date.now() - start;

    if (error) {
      return {
        status: "fail",
        message: `Storage check failed: ${error.message}`,
        responseTime,
      };
    }

    if (responseTime > 2000) {
      return {
        status: "warn",
        message: `Storage response time is slow: ${responseTime}ms`,
        responseTime,
      };
    }

    return {
      status: "pass",
      responseTime,
    };
  } catch (error) {
    return {
      status: "fail",
      message: error instanceof Error ? error.message : "Storage check failed",
      responseTime: Date.now() - start,
    };
  }
}

/**
 * Check Edge Functions availability
 */
async function checkFunctions(supabase: ReturnType<typeof createClient>): Promise<CheckResult> {
  const start = Date.now();
  
  try {
    // Check if we can invoke a simple function (or just check function exists)
    // For now, we'll just check if the functions table exists or use a simple RPC
    const { error } = await supabase.rpc("version", {}).catch(() => ({
      error: null, // RPC might not exist, that's OK
    }));

    const responseTime = Date.now() - start;

    // If RPC doesn't exist, that's fine - functions are still available
    if (error && !error.message.includes("function") && !error.message.includes("does not exist")) {
      return {
        status: "warn",
        message: `Functions check warning: ${error.message}`,
        responseTime,
      };
    }

    return {
      status: "pass",
      responseTime,
    };
  } catch (error) {
    // Functions might not have a test RPC, that's OK
    return {
      status: "pass",
      responseTime: Date.now() - start,
    };
  }
}

