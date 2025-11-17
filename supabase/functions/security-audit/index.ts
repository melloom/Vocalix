/**
 * Automated Security Audit Edge Function
 * Runs comprehensive security checks and stores results
 * 
 * This function can be triggered:
 * - Manually via HTTP request
 * - Automatically via cron job
 * - On-demand for specific audit types
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get audit type from query params or body, default to 'daily'
    const url = new URL(req.url);
    const auditType = url.searchParams.get("type") || "daily";

    // Validate audit type
    const validTypes = ["daily", "weekly", "monthly", "quarterly"];
    if (!validTypes.includes(auditType)) {
      return new Response(
        JSON.stringify({ 
          error: `Invalid audit type. Must be one of: ${validTypes.join(", ")}` 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log(`[Security Audit] Starting ${auditType} audit...`);

    // Run the security audit
    const { data: auditResults, error: auditError } = await supabase.rpc(
      "run_security_audit",
      { p_audit_type: auditType }
    );

    if (auditError) {
      console.error("[Security Audit] Error running audit:", auditError);
      return new Response(
        JSON.stringify({ 
          error: "Failed to run security audit",
          details: auditError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Get summary of results
    const { data: summary, error: summaryError } = await supabase.rpc(
      "get_latest_audit_summary",
      { p_audit_type: auditType }
    );

    if (summaryError) {
      console.error("[Security Audit] Error getting summary:", summaryError);
    }

    const result = auditResults && auditResults.length > 0 ? auditResults[0] : null;
    const summaryData = summary && summary.length > 0 ? summary[0] : null;

    // Determine if there are critical issues
    const hasCriticalIssues = result && (result.errors > 0 || result.failed > 0);
    const hasWarnings = result && result.warnings > 0;

    // Log results
    console.log(`[Security Audit] ${auditType} audit completed:`);
    console.log(`  Total checks: ${result?.total_checks || 0}`);
    console.log(`  Passed: ${result?.passed || 0}`);
    console.log(`  Failed: ${result?.failed || 0}`);
    console.log(`  Warnings: ${result?.warnings || 0}`);
    console.log(`  Errors: ${result?.errors || 0}`);

    // Get detailed results for response
    const { data: detailedResults, error: detailsError } = await supabase
      .from("security_audit_results")
      .select("*")
      .eq("audit_type", auditType)
      .order("created_at", { ascending: false })
      .limit(50); // Get latest 50 results

    if (detailsError) {
      console.error("[Security Audit] Error fetching detailed results:", detailsError);
    }

    // Prepare response
    const response = {
      success: true,
      audit_type: auditType,
      timestamp: new Date().toISOString(),
      summary: summaryData || {
        total_checks: result?.total_checks || 0,
        passed: result?.passed || 0,
        failed: result?.failed || 0,
        warnings: result?.warnings || 0,
        errors: result?.errors || 0,
      },
      has_critical_issues: hasCriticalIssues,
      has_warnings: hasWarnings,
      results: detailedResults || [],
    };

    // Return appropriate status code based on results
    const statusCode = hasCriticalIssues ? 200 : 200; // Always 200, but include flags

    return new Response(
      JSON.stringify(response, null, 2),
      {
        status: statusCode,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[Security Audit] Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

