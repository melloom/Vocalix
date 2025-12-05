import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.5";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { pseudo_id } = await req.json();
    if (!pseudo_id) {
      return new Response(JSON.stringify({ error: "Missing pseudo_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Find all profiles with this pseudo_id
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("pseudo_id", pseudo_id);

    if (profileError) throw profileError;

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ message: "No profile found with this pseudo_id" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        status: 200,
      });
    }

    const profileIds = profiles.map((p) => p.id);
    let totalDeleted = 0;

    // Delete all content for each profile
    for (const profileId of profileIds) {
      // Delete clips
      const { count: clipsCount } = await supabaseAdmin
        .from("clips")
        .delete()
        .eq("profile_id", profileId);
      totalDeleted += clipsCount || 0;

      // Delete clip reactions
      await supabaseAdmin.from("clip_reactions").delete().eq("profile_id", profileId);

      // Delete clip replies
      await supabaseAdmin.from("clip_replies").delete().eq("profile_id", profileId);

      // Delete listens
      await supabaseAdmin.from("listens").delete().eq("profile_id", profileId);

      // Delete comments
      await supabaseAdmin.from("comments").delete().eq("profile_id", profileId);

      // Delete posts
      await supabaseAdmin.from("posts").delete().eq("profile_id", profileId);

      // Delete saved clips
      await supabaseAdmin.from("saved_clips").delete().eq("profile_id", profileId);

      // Delete follows
      await supabaseAdmin
        .from("follows")
        .delete()
        .or(`follower_id.eq.${profileId},following_id.eq.${profileId}`);

      // Delete follow requests
      await supabaseAdmin
        .from("follow_requests")
        .delete()
        .or(`requester_id.eq.${profileId},target_id.eq.${profileId}`);

      // Delete blocked users
      await supabaseAdmin
        .from("blocked_users")
        .delete()
        .or(`blocker_id.eq.${profileId},blocked_id.eq.${profileId}`);

      // Delete community memberships
      await supabaseAdmin.from("community_members").delete().eq("profile_id", profileId);

      // Delete notifications
      await supabaseAdmin
        .from("notifications")
        .delete()
        .or(`profile_id.eq.${profileId},from_profile_id.eq.${profileId}`);

      // Delete diary entries
      await supabaseAdmin.from("diary_entries").delete().eq("profile_id", profileId);

      // Delete voice AMA sessions
      await supabaseAdmin.from("voice_ama_sessions").delete().eq("creator_profile_id", profileId);

      // Delete voice AMA questions
      await supabaseAdmin.from("voice_ama_questions").delete().eq("profile_id", profileId);

      // Delete live room participants
      await supabaseAdmin.from("live_room_participants").delete().eq("profile_id", profileId);

      // Delete user badges
      await supabaseAdmin.from("user_badges").delete().eq("profile_id", profileId);

      // Delete sessions
      await supabaseAdmin.from("sessions").delete().eq("profile_id", profileId);

      // Delete magic login links
      await supabaseAdmin.from("magic_login_links").delete().eq("profile_id", profileId);

      // Delete magic login PINs
      await supabaseAdmin.from("magic_login_pins").delete().eq("profile_id", profileId);

      // Delete account link PINs
      await supabaseAdmin.from("account_link_pins").delete().eq("profile_id", profileId);

      // Delete devices (unlink them)
      await supabaseAdmin.from("devices").update({ profile_id: null }).eq("profile_id", profileId);

      // Finally, delete the profile itself
      await supabaseAdmin.from("profiles").delete().eq("id", profileId);
    }

    return new Response(
      JSON.stringify({
        message: `Persona burned successfully. Deleted ${totalDeleted} clips and all associated content.`,
        deletedClips: totalDeleted,
      }),
      {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in burn-persona function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      status: 500,
    });
  }
});

