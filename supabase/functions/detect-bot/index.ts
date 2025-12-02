import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { getRequestIPAddress } from "../_shared/security.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables for detect-bot.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const origin = Deno.env.get("ORIGIN") || "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

interface BotDetectionRequest {
  user_agent?: string;
  device_fingerprint?: string;
  device_id?: string;
  action_type?: string;
  behavioral_data?: {
    interaction_times?: number[];
    mouse_movements?: number;
    keystroke_timing?: number[];
    scroll_events?: number;
  };
}

interface BotDetectionResponse {
  is_bot: boolean;
  confidence: number; // 0-100
  reasons: string[];
  risk_score: number; // 0-100
  action: "allow" | "challenge" | "block";
}

/**
 * Detect known bot user agents
 */
function detectBotUserAgent(userAgent: string | null | undefined): { detected: boolean; reason?: string } {
  if (!userAgent) return { detected: false };

  const ua = userAgent.toLowerCase();
  const botPatterns = [
    { pattern: /selenium/i, reason: "Selenium automation tool" },
    { pattern: /webdriver/i, reason: "WebDriver automation" },
    { pattern: /headless/i, reason: "Headless browser" },
    { pattern: /puppeteer/i, reason: "Puppeteer automation" },
    { pattern: /playwright/i, reason: "Playwright automation" },
    { pattern: /phantomjs/i, reason: "PhantomJS headless browser" },
    { pattern: /chromium/i, reason: "Chromium automation" },
    { pattern: /bot/i, reason: "Bot user agent" },
    { pattern: /crawler/i, reason: "Web crawler" },
    { pattern: /spider/i, reason: "Web spider" },
    { pattern: /scraper/i, reason: "Web scraper" },
    { pattern: /curl/i, reason: "cURL client" },
    { pattern: /wget/i, reason: "Wget client" },
    { pattern: /python-requests/i, reason: "Python requests library" },
    { pattern: /go-http-client/i, reason: "Go HTTP client" },
    { pattern: /java/i, reason: "Java HTTP client" },
    { pattern: /httpclient/i, reason: "HTTP client library" },
  ];

  for (const { pattern, reason } of botPatterns) {
    if (pattern.test(ua)) {
      return { detected: true, reason };
    }
  }

  return { detected: false };
}

/**
 * Analyze behavioral patterns for bot detection
 */
function analyzeBehavioralPatterns(
  behavioralData?: BotDetectionRequest["behavioral_data"]
): { suspicious: boolean; reasons: string[]; riskScore: number } {
  const reasons: string[] = [];
  let riskScore = 0;

  if (!behavioralData) {
    // Missing behavioral data is slightly suspicious
    riskScore += 5;
    return { suspicious: false, reasons, riskScore };
  }

  // Check interaction timing patterns
  if (behavioralData.interaction_times && behavioralData.interaction_times.length >= 3) {
    const intervals: number[] = [];
    for (let i = 1; i < behavioralData.interaction_times.length; i++) {
      intervals.push(behavioralData.interaction_times[i] - behavioralData.interaction_times[i - 1]);
    }

    // Check for too-fast interactions (< 50ms apart)
    const tooFast = intervals.filter((interval) => interval < 50).length;
    if (tooFast > intervals.length * 0.5) {
      reasons.push("Too many rapid interactions");
      riskScore += 30;
    }

    // Check for perfect timing (very low variance)
    if (intervals.length >= 3) {
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
      if (variance < 100 && avgInterval > 0) {
        reasons.push("Perfect timing pattern detected");
        riskScore += 25;
      }
    }
  }

  // Check for missing mouse movements (bots often don't simulate mouse)
  if (behavioralData.mouse_movements !== undefined && behavioralData.mouse_movements === 0) {
    reasons.push("No mouse movements detected");
    riskScore += 15;
  }

  // Check for missing keystroke timing (bots often type instantly)
  if (behavioralData.keystroke_timing && behavioralData.keystroke_timing.length > 0) {
    const avgKeystrokeTime = behavioralData.keystroke_timing.reduce((a, b) => a + b, 0) / behavioralData.keystroke_timing.length;
    if (avgKeystrokeTime < 50) {
      reasons.push("Keystrokes too fast (likely automated)");
      riskScore += 20;
    }
  }

  // Check for missing scroll events (bots often don't scroll)
  if (behavioralData.scroll_events !== undefined && behavioralData.scroll_events === 0) {
    riskScore += 5; // Less suspicious alone
  }

  return {
    suspicious: reasons.length > 0 || riskScore > 30,
    reasons,
    riskScore: Math.min(100, riskScore),
  };
}

/**
 * Check IP-based patterns for bot activity
 */
async function checkIPPatterns(
  ipAddress: string | null,
  actionType: string
): Promise<{ suspicious: boolean; reasons: string[]; riskScore: number }> {
  const reasons: string[] = [];
  let riskScore = 0;

  if (!ipAddress) {
    return { suspicious: false, reasons, riskScore };
  }

  try {
    // Check for rapid actions from same IP
    const { data: recentActions, error } = await supabase
      .from("ip_activity_logs")
      .select("created_at, action_type")
      .eq("ip_address", ipAddress)
      .eq("action_type", actionType)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error checking IP patterns:", error);
      return { suspicious: false, reasons, riskScore };
    }

    if (recentActions && recentActions.length > 50) {
      reasons.push("Excessive activity from IP address");
      riskScore += 40;
    }

    // Check for multiple accounts from same IP
    const { data: accountCreations, error: accountError } = await supabase
      .from("account_creation_logs")
      .select("profile_id, created_at")
      .eq("ip_address", ipAddress)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
      .order("created_at", { ascending: false });

    if (!accountError && accountCreations && accountCreations.length > 3) {
      reasons.push("Multiple account creations from same IP");
      riskScore += 35;
    }
  } catch (error) {
    console.error("Error checking IP patterns:", error);
  }

  return {
    suspicious: reasons.length > 0 || riskScore > 30,
    reasons,
    riskScore: Math.min(100, riskScore),
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    const ipAddress = getRequestIPAddress(req);
    const {
      user_agent,
      device_fingerprint,
      device_id,
      action_type = "unknown",
      behavioral_data,
    }: BotDetectionRequest = await req.json();

    let totalRiskScore = 0;
    const allReasons: string[] = [];

    // 1. Check user agent
    const uaDetection = detectBotUserAgent(user_agent);
    if (uaDetection.detected) {
      allReasons.push(uaDetection.reason || "Bot user agent detected");
      totalRiskScore += 50;
    }

    // 2. Analyze behavioral patterns
    const behavioralAnalysis = analyzeBehavioralPatterns(behavioral_data);
    allReasons.push(...behavioralAnalysis.reasons);
    totalRiskScore += behavioralAnalysis.riskScore;

    // 3. Check IP-based patterns
    const ipAnalysis = await checkIPPatterns(ipAddress, action_type);
    allReasons.push(...ipAnalysis.reasons);
    totalRiskScore += ipAnalysis.riskScore;

    // 4. Check device fingerprint patterns (if available)
    if (device_fingerprint && device_id) {
      try {
        const { data: fingerprintMatches, error: fingerprintError } = await supabase
          .from("account_creation_logs")
          .select("device_fingerprint, created_at")
          .eq("device_fingerprint", device_fingerprint)
          .neq("device_id", device_id)
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        if (!fingerprintError && fingerprintMatches && fingerprintMatches.length > 2) {
          allReasons.push("Device fingerprint used by multiple accounts");
          totalRiskScore += 30;
        }
      } catch (error) {
        console.error("Error checking device fingerprint:", error);
      }
    }

    // Determine action based on risk score
    let action: "allow" | "challenge" | "block" = "allow";
    let confidence = Math.min(100, totalRiskScore);

    if (totalRiskScore >= 70) {
      action = "block";
      confidence = Math.max(70, totalRiskScore);
    } else if (totalRiskScore >= 40) {
      action = "challenge";
      confidence = Math.max(40, Math.min(69, totalRiskScore));
    }

    const response: BotDetectionResponse = {
      is_bot: totalRiskScore >= 40,
      confidence,
      reasons: allReasons,
      risk_score: Math.min(100, totalRiskScore),
      action,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Error in detect-bot:", error);
    return new Response(
      JSON.stringify({
        error: "Bot detection failed",
        is_bot: false,
        confidence: 0,
        reasons: [],
        risk_score: 0,
        action: "allow",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      }
    );
  }
});
