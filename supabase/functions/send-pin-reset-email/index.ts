import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const APP_URL = Deno.env.get("APP_URL") || "https://echogarden.app";

interface ResetEmailRequest {
  handle: string;
  recovery_email: string;
}

// Generate HTML email template for PIN reset
const generateResetEmailHTML = (
  handle: string,
  resetToken: string,
  resetUrl: string
): string => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Login PIN - Echo Garden</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 28px; margin: 0; color: #111827;">🎧 Echo Garden</h1>
          <p style="color: #6b7280; margin-top: 8px;">Reset Your Login PIN</p>
        </div>
        
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 32px;">
          <p style="margin: 0; color: #4b5563;">
            Hey ${handle}! 👋
          </p>
          <p style="margin: 8px 0 0 0; color: #4b5563;">
            We received a request to reset your login PIN. Click the button below to reset it:
          </p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Reset PIN</a>
        </div>

        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 4px;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            <strong>⚠️ Security Notice:</strong> This link will expire in 1 hour. If you didn't request this reset, please ignore this email. Your PIN will remain unchanged.
          </p>
        </div>

        <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #9ca3af;">
          <p style="margin: 0;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="margin: 8px 0 0 0; word-break: break-all;">
            <a href="${resetUrl}" style="color: #3b82f6; text-decoration: none;">${resetUrl}</a>
          </p>
        </div>
      </body>
    </html>
  `;
};

// Generate plain text email
const generateResetEmailText = (
  handle: string,
  resetUrl: string
): string => {
  return `
Reset Your Login PIN - Echo Garden

Hey ${handle}!

We received a request to reset your login PIN. Click the link below to reset it:

${resetUrl}

⚠️ Security Notice: This link will expire in 1 hour. If you didn't request this reset, please ignore this email. Your PIN will remain unchanged.

If you have any questions, please contact support.

---
Echo Garden
  `.trim();
};

// Send email via SMTP2GO (final fallback - 1,000 emails/month free forever)
const sendResetEmailViaSMTP2GO = async (
  handle: string,
  recoveryEmail: string,
  resetToken: string,
  resetUrl: string
): Promise<boolean> => {
  const SMTP2GO_API_KEY = Deno.env.get("SMTP2GO_API_KEY");
  
  if (!SMTP2GO_API_KEY) {
    return false; // SMTP2GO not configured
  }

  try {
    const emailData = {
      api_key: SMTP2GO_API_KEY,
      to: [recoveryEmail],
      sender: "noreply@echogarden.app",
      subject: `🔐 Reset Your Login PIN - Echo Garden`,
      html_body: generateResetEmailHTML(handle, resetToken, resetUrl),
      text_body: generateResetEmailText(handle, resetUrl),
    };

    const response = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.data?.error_code === 0) {
        console.log("Reset email sent successfully via SMTP2GO fallback");
        return true;
      } else {
        console.warn("SMTP2GO API error:", result.data?.error);
        return false;
      }
    } else {
      const errorText = await response.text();
      console.warn("SMTP2GO API error:", response.status, errorText);
      return false;
    }
  } catch (error) {
    console.error("Error sending reset email via SMTP2GO fallback:", error);
    return false;
  }
};

// Send email via Brevo (free fallback - 300 emails/day = 9,000/month free forever)
const sendResetEmailViaBrevo = async (
  handle: string,
  recoveryEmail: string,
  resetToken: string,
  resetUrl: string
): Promise<boolean> => {
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  
  if (!BREVO_API_KEY) {
    return false; // Brevo not configured
  }

  try {
    const emailData = {
      sender: {
        name: "Echo Garden",
        email: "noreply@echogarden.app",
      },
      to: [
        {
          email: recoveryEmail,
        },
      ],
      subject: `🔐 Reset Your Login PIN - Echo Garden`,
      htmlContent: generateResetEmailHTML(handle, resetToken, resetUrl),
      textContent: generateResetEmailText(handle, resetUrl),
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
      console.log("Reset email sent successfully via Brevo fallback:", result.messageId);
      return true;
    } else {
      const errorText = await response.text();
      console.warn("Brevo API error:", response.status, errorText);
      return false;
    }
  } catch (error) {
    console.error("Error sending reset email via Brevo fallback:", error);
    return false;
  }
};

// Send email via Resend (primary) with Mailgun fallback
const sendResetEmail = async (
  handle: string,
  recoveryEmail: string,
  resetToken: string
): Promise<boolean> => {
  const resetUrl = `${APP_URL}/reset-pin?handle=${encodeURIComponent(handle)}&token=${encodeURIComponent(resetToken)}`;

  // Try Resend first (primary service)
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
          subject: `🔐 Reset Your Login PIN - Echo Garden`,
          html: generateResetEmailHTML(handle, resetToken, resetUrl),
          text: generateResetEmailText(handle, resetUrl),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("Reset email sent successfully via Resend:", result.id);
        return true;
      } else {
        const errorText = await response.text();
        console.warn("Resend API error, trying fallback:", response.status, errorText);
      }
    } catch (error) {
      console.warn("Resend failed, trying fallback:", error);
    }
  } else {
    console.warn("RESEND_API_KEY not set, trying fallback");
  }

  // Fallback 1: Try Brevo (free tier: 300 emails/day = 9,000/month, free forever)
  const brevoSuccess = await sendResetEmailViaBrevo(handle, recoveryEmail, resetToken, resetUrl);
  if (brevoSuccess) {
    return true;
  }

  // Fallback 2: Try SMTP2GO (free tier: 1,000 emails/month, free forever)
  const smtp2goSuccess = await sendResetEmailViaSMTP2GO(handle, recoveryEmail, resetToken, resetUrl);
  if (smtp2goSuccess) {
    return true;
  }

  console.warn("All email services failed. Reset email not sent to:", recoveryEmail);
  console.warn("To enable fallbacks, set up:");
  console.warn("  1. Brevo: https://www.brevo.com (free: 300 emails/day = 9,000/month forever)");
  console.warn("     Set BREVO_API_KEY in Supabase Edge Functions secrets");
  console.warn("  2. SMTP2GO: https://www.smtp2go.com (free: 1,000 emails/month forever)");
  console.warn("     Set SMTP2GO_API_KEY in Supabase Edge Functions secrets");
  
  return false;
};

serve(async (req) => {
  // Handle CORS
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
    const { handle, recovery_email }: ResetEmailRequest = await req.json();

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

    // Generate reset token
    const { data: token, error: tokenError } = await supabase.rpc(
      "generate_pin_reset_token",
      {
        p_handle: handle,
        p_recovery_email: recovery_email,
      }
    );

    if (tokenError) {
      console.error("Error generating token:", tokenError);
      // Don't reveal if handle/email is wrong (security)
      return new Response(
        JSON.stringify({
          success: true,
          message: "If an account with that handle and email exists, a reset link has been sent.",
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
      // User not found or no PIN set - don't reveal this
      return new Response(
        JSON.stringify({
          success: true,
          message: "If an account with that handle and email exists, a reset link has been sent.",
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

    // Send email
    const emailSent = await sendResetEmail(handle, recovery_email, token);

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
        message: "Reset email sent successfully",
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
    console.error("Error in send-pin-reset-email:", error);
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

