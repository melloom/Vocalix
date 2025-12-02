import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SMTP2GO_API_KEY = Deno.env.get("SMTP2GO_API_KEY");
const APP_URL = Deno.env.get("APP_URL") || "https://echogarden.app";

interface MagicLinkRequest {
  handle: string;
  recovery_email: string;
}

// Generate HTML email template for magic login link
const generateMagicLinkEmailHTML = (
  handle: string,
  loginUrl: string
): string => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Login Link - Echo Garden</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 28px; margin: 0; color: #111827;">🎧 Echo Garden</h1>
          <p style="color: #6b7280; margin-top: 8px;">Your Login Link</p>
        </div>
        
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 32px;">
          <p style="margin: 0; color: #4b5563;">
            Hey ${handle}! 👋
          </p>
          <p style="margin: 8px 0 0 0; color: #4b5563;">
            We received a request for a login link. Click the button below to sign in:
          </p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Sign In</a>
        </div>

        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 4px;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            <strong>⚠️ Security Notice:</strong> This link will expire in 1 hour and can only be used once. If you didn't request this link, please ignore this email.
          </p>
        </div>

        <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #9ca3af;">
          <p style="margin: 0;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="margin: 8px 0 0 0; word-break: break-all;">
            <a href="${loginUrl}" style="color: #3b82f6; text-decoration: none;">${loginUrl}</a>
          </p>
        </div>
      </body>
    </html>
  `;
};

// Generate plain text email
const generateMagicLinkEmailText = (
  handle: string,
  loginUrl: string
): string => {
  return `
Your Login Link - Echo Garden

Hey ${handle}!

We received a request for a login link. Click the link below to sign in:

${loginUrl}

⚠️ Security Notice: This link will expire in 1 hour and can only be used once. If you didn't request this link, please ignore this email.

If you have any questions, please contact support.

---
Echo Garden
  `.trim();
};

// Send email via SMTP2GO (final fallback)
const sendMagicLinkEmailViaSMTP2GO = async (
  handle: string,
  recoveryEmail: string,
  loginUrl: string
): Promise<boolean> => {
  if (!SMTP2GO_API_KEY) return false;

  try {
    const emailData = {
      api_key: SMTP2GO_API_KEY,
      to: [recoveryEmail],
      sender: "noreply@echogarden.app",
      subject: `🔗 Your Login Link - Echo Garden`,
      html_body: generateMagicLinkEmailHTML(handle, loginUrl),
      text_body: generateMagicLinkEmailText(handle, loginUrl),
    };

    const response = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(emailData),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.data?.error_code === 0) {
        console.log("Magic link email sent via SMTP2GO");
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("Error sending email via SMTP2GO:", error);
    return false;
  }
};

// Send email via Brevo (fallback 1)
const sendMagicLinkEmailViaBrevo = async (
  handle: string,
  recoveryEmail: string,
  loginUrl: string
): Promise<boolean> => {
  if (!BREVO_API_KEY) return false;

  try {
    const emailData = {
      sender: {
        name: "Echo Garden",
        email: "noreply@echogarden.app",
      },
      to: [{ email: recoveryEmail }],
      subject: `🔗 Your Login Link - Echo Garden`,
      htmlContent: generateMagicLinkEmailHTML(handle, loginUrl),
      textContent: generateMagicLinkEmailText(handle, loginUrl),
    };

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    });

    if (response.ok) {
      const result = await response.json();
      console.log("Magic link email sent via Brevo:", result.messageId);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error sending email via Brevo:", error);
    return false;
  }
};

// Send email via Resend (primary) with fallbacks
const sendMagicLinkEmail = async (
  handle: string,
  recoveryEmail: string,
  loginUrl: string
): Promise<boolean> => {
  // Try Resend first
  if (RESEND_API_KEY) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Echo Garden <noreply@echogarden.app>",
          to: recoveryEmail,
          subject: `🔗 Your Login Link - Echo Garden`,
          html: generateMagicLinkEmailHTML(handle, loginUrl),
          text: generateMagicLinkEmailText(handle, loginUrl),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("Magic link email sent via Resend:", result.id);
        return true;
      }
    } catch (error) {
      console.warn("Resend failed, trying fallback:", error);
    }
  }

  // Fallback 1: Brevo
  if (await sendMagicLinkEmailViaBrevo(handle, recoveryEmail, loginUrl)) {
    return true;
  }

  // Fallback 2: SMTP2GO
  if (await sendMagicLinkEmailViaSMTP2GO(handle, recoveryEmail, loginUrl)) {
    return true;
  }

  return false;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  try {
    const { handle, recovery_email }: MagicLinkRequest = await req.json();

    if (!handle || !recovery_email) {
      return new Response(
        JSON.stringify({ error: "handle and recovery_email are required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate magic login link token
    const { data: token, error: tokenError } = await supabase.rpc(
      "generate_magic_link_for_recovery",
      {
        p_handle: handle.trim().replace(/^@+/, ""),
        p_recovery_email: recovery_email.trim(),
      }
    );

    if (tokenError) {
      console.error("Error generating token:", tokenError);
      // Don't reveal if handle/email is wrong (security)
      return new Response(
        JSON.stringify({
          success: true,
          message: "If an account with that handle and email exists, a login link has been sent.",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    if (!token) {
      // User not found - don't reveal this
      return new Response(
        JSON.stringify({
          success: true,
          message: "If an account with that handle and email exists, a login link has been sent.",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Build login URL
    const loginUrl = `${APP_URL}/login-link?token=${encodeURIComponent(token)}`;

    // Send email
    const emailSent = await sendMagicLinkEmail(
      handle.trim().replace(/^@+/, ""),
      recovery_email.trim(),
      loginUrl
    );

    if (!emailSent) {
      return new Response(
        JSON.stringify({ error: "Failed to send email" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Login link sent successfully",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error in send-magic-link-email:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});

