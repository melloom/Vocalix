import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
// @deno-types="https://esm.sh/@types/web-push@3.6.4/index.d.ts"
import * as webPush from "https://esm.sh/web-push@3.6.5?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:support@echogarden.app";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration");
}

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn("VAPID keys not configured. Push notifications will not work.");
}

// Configure web-push with VAPID keys
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-id",
};

interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    clip_id?: string;
    profile_handle?: string;
    challenge_id?: string;
    notification_id?: string;
    url?: string;
  };
}

/**
 * Send push notification to a single subscription
 */
async function sendPushToSubscription(
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: PushNotificationPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const subscriptionObject = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    await webPush.sendNotification(
      subscriptionObject,
      JSON.stringify(payload),
      {
        TTL: 86400, // 24 hours
        urgency: "normal",
      }
    );

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // If subscription is invalid, mark it for deletion
    if (
      errorMessage.includes("410") ||
      errorMessage.includes("expired") ||
      errorMessage.includes("invalid")
    ) {
      return { success: false, error: "invalid_subscription" };
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Send push notification to a user
 */
async function sendPushToUser(
  profileId: string,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number; errors: string[] }> {
  // Get all push subscriptions for the user
  const { data: subscriptions, error } = await supabase.rpc(
    "get_push_subscriptions",
    { p_profile_id: profileId }
  );

  if (error || !subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0, errors: [] };
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const invalidSubscriptions: string[] = [];

  // Send to all subscriptions
  for (const sub of subscriptions) {
    const result = await sendPushToSubscription(
      {
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
      payload
    );

    if (result.success) {
      sent++;
    } else {
      failed++;
      if (result.error === "invalid_subscription") {
        invalidSubscriptions.push(sub.endpoint);
      } else {
        errors.push(result.error || "Unknown error");
      }
    }
  }

  // Clean up invalid subscriptions
  if (invalidSubscriptions.length > 0) {
    for (const endpoint of invalidSubscriptions) {
      await supabase.rpc("delete_push_subscription", {
        p_profile_id: profileId,
        p_endpoint: endpoint,
      });
    }
  }

  return { sent, failed, errors };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({
          error: "Push notifications not configured. VAPID keys missing.",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { profile_id, title, body, icon, badge, tag, data } = await req.json();

    if (!profile_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: profile_id, title, body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const payload: PushNotificationPayload = {
      title,
      body,
      icon: icon || "/favicon.ico",
      badge: badge || "/favicon.ico",
      tag,
      data,
    };

    const result = await sendPushToUser(profile_id, payload);

    return new Response(
      JSON.stringify({
        success: true,
        sent: result.sent,
        failed: result.failed,
        errors: result.errors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending push notification:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

