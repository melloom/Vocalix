import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SMTP2GO_API_KEY = Deno.env.get("SMTP2GO_API_KEY");
const APP_URL = Deno.env.get("APP_URL") || "https://echogarden.app";

interface WelcomeEmailRequest {
  profile_id: string;
}

const generateWelcomeEmailHTML = (handle: string, email: string | null): string => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Vocalix</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #e5e7eb; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #020617;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 28px; margin: 0; background: linear-gradient(to right, #f97316, #fb7185); -webkit-background-clip: text; color: transparent;">
            🎧 Vocalix
          </h1>
          <p style="color: #9ca3af; margin-top: 8px;">Welcome to the underground voice chamber</p>
        </div>

        <div style="background: radial-gradient(circle at top left, rgba(248, 113, 113, 0.2), transparent), radial-gradient(circle at bottom right, rgba(251, 191, 36, 0.2), transparent); border-radius: 16px; padding: 20px; border: 1px solid rgba(148, 163, 184, 0.3); margin-bottom: 24px;">
          <p style="margin: 0 0 8px 0; color: #e5e7eb;">
            Hey @${handle} 👋
          </p>
          <p style="margin: 0; color: #cbd5f5;">
            You just stepped into <strong>Vocalix</strong> — an anonymous, voice-first space for sharing thoughts, stories, and vibes without the pressure of photos or follower counts.
          </p>
        </div>

        <div style="background-color: rgba(15, 23, 42, 0.9); border-radius: 12px; padding: 16px 18px; border: 1px solid rgba(148, 163, 184, 0.35); margin-bottom: 20px;">
          <p style="margin: 0 0 6px 0; color: #e5e7eb; font-weight: 600;">What this platform is</p>
          <ul style="margin: 0; padding-left: 18px; color: #cbd5f5; font-size: 14px;">
            <li>Voice-only clips and conversations — no profile photos by default.</li>
            <li>Communities and topics built around what you say, not how you look.</li>
            <li>Spaces designed for late-night rants, deep thoughts, and honest check-ins.</li>
          </ul>
        </div>

        <div style="background-color: rgba(24, 24, 27, 0.9); border-radius: 12px; padding: 16px 18px; border: 1px solid rgba(248, 113, 113, 0.6); margin-bottom: 20px;">
          <p style="margin: 0 0 6px 0; color: #fecaca; font-weight: 600;">What you agreed to</p>
          <ul style="margin: 0; padding-left: 18px; color: #f3f4f6; font-size: 14px;">
            <li>Keep it respectful — no hate, harassment, or targeted bullying.</li>
            <li>No sexual exploitation, self-harm encouragement, or illegal content.</li>
            <li>We may use AI-powered safety systems to flag abusive or high-risk content.</li>
          </ul>
        </div>

        <div style="background-color: rgba(15, 118, 110, 0.08); border-radius: 12px; padding: 16px 18px; border: 1px solid rgba(45, 212, 191, 0.5); margin-bottom: 24px;">
          <p style="margin: 0 0 6px 0; color: #a5f3fc; font-weight: 600;">What Vocalix can provide</p>
          <ul style="margin: 0; padding-left: 18px; color: #e0f2fe; font-size: 14px;">
            <li>A low-pressure place to speak freely and listen to real voices.</li>
            <li>Discovery tools for topics, communities, and trending clips.</li>
            <li>Optional features like email digests and login links if you choose to connect an email.</li>
          </ul>
        </div>

        <div style="background-color: rgba(15, 23, 42, 0.9); border-radius: 12px; padding: 16px 18px; border: 1px solid rgba(148, 163, 184, 0.4); margin-bottom: 24px; font-size: 13px; color: #9ca3af;">
          <p style="margin: 0 0 6px 0; font-weight: 600;">Your email & privacy</p>
          <p style="margin: 0 0 6px 0;">
            Email is <strong>optional</strong>. We only use it for things like login links, digests, or account recovery that you turn on.
          </p>
          <p style="margin: 0;">
            You can review or remove your email anytime from Settings inside the app.
          </p>
        </div>

        <div style="text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid rgba(31, 41, 55, 1); padding-top: 16px; margin-top: 24px;">
          <p style="margin: 0 0 4px 0;">Ready when you are. Step back into the chamber:</p>
          <p style="margin: 4px 0 0 0;">
            <a href="${APP_URL}" style="color: #f97316; text-decoration: none;">Open Vocalix</a>
          </p>
          ${email ? `<p style="margin: 10px 0 0 0;">If you didn’t expect this email, you can safely ignore it.</p>` : ""}
        </div>
      </body>
    </html>
  `;
};

const generateWelcomeEmailText = (handle: string, email: string | null): string => {
  return `
Welcome to Vocalix

Hey @${handle},

You just created an identity on Vocalix — an anonymous, voice-first space for honest clips and conversations.

What this platform is:
- Voice-only clips and conversations.
- Communities built around what you say, not how you look.
- A space for late-night thoughts, deep talks, and real check-ins.

What you agreed to:
- Keep it respectful. No hate, harassment, or targeted bullying.
- No sexual exploitation, illegal content, or self-harm encouragement.
- We may use AI-powered safety systems to detect abusive or high-risk content.

What Vocalix can provide:
- A low-pressure place to speak freely and listen to others.
- Discovery tools for topics, communities, and trending clips.
- Optional features like digests and login links if you choose to add an email.

Email & privacy:
- Email is optional and only used for features you enable.
- You can review or remove your email from Settings at any time.

Open Vocalix: ${APP_URL}

${email ? "If you didn’t expect this email, you can safely ignore it." : ""}
  `.trim();
};

const sendWelcomeEmailViaSMTP2GO = async (
  toEmail: string,
  handle: string
): Promise<boolean> => {
  if (!SMTP2GO_API_KEY) return false;

  try {
    const emailData = {
      api_key: SMTP2GO_API_KEY,
      to: [toEmail],
      sender: "noreply@echogarden.app",
      subject: "Welcome to Vocalix",
      html_body: generateWelcomeEmailHTML(handle, toEmail),
      text_body: generateWelcomeEmailText(handle, toEmail),
    };

    const response = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(emailData),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.data?.error_code === 0) {
        console.log("Welcome email sent via SMTP2GO");
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("Error sending welcome email via SMTP2GO:", error);
    return false;
  }
};

const sendWelcomeEmailViaBrevo = async (
  toEmail: string,
  handle: string
): Promise<boolean> => {
  if (!BREVO_API_KEY) return false;

  try {
    const emailData = {
      sender: {
        name: "Vocalix",
        email: "noreply@echogarden.app",
      },
      to: [{ email: toEmail }],
      subject: "Welcome to Vocalix",
      htmlContent: generateWelcomeEmailHTML(handle, toEmail),
      textContent: generateWelcomeEmailText(handle, toEmail),
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
      console.log("Welcome email sent via Brevo:", result.messageId);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error sending welcome email via Brevo:", error);
    return false;
  }
};

const sendWelcomeEmail = async (
  toEmail: string,
  handle: string
): Promise<boolean> => {
  if (RESEND_API_KEY) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Vocalix <noreply@echogarden.app>",
          to: toEmail,
          subject: "Welcome to Vocalix",
          html: generateWelcomeEmailHTML(handle, toEmail),
          text: generateWelcomeEmailText(handle, toEmail),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("Welcome email sent via Resend:", result.id);
        return true;
      }
    } catch (error) {
      console.warn("Resend welcome email failed, trying fallback:", error);
    }
  }

  if (await sendWelcomeEmailViaBrevo(toEmail, handle)) {
    return true;
  }

  if (await sendWelcomeEmailViaSMTP2GO(toEmail, handle)) {
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
      },
    );
  }

  try {
    const { profile_id }: WelcomeEmailRequest = await req.json();

    if (!profile_id) {
      return new Response(
        JSON.stringify({ error: "profile_id is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("handle, email")
      .eq("id", profile_id)
      .single();

    if (profileError) {
      console.error("Failed to load profile for welcome email:", profileError);
      return new Response(
        JSON.stringify({ error: "Failed to load profile" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    if (!profile?.email) {
      return new Response(
        JSON.stringify({ error: "Profile has no email; nothing to send" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const success = await sendWelcomeEmail(profile.email, profile.handle);

    if (!success) {
      console.error("All providers failed to send welcome email");
      return new Response(
        JSON.stringify({ error: "Failed to send welcome email" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (error) {
    console.error("Error in send-welcome-email function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
});


