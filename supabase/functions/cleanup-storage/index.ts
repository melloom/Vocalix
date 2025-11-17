import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables for cleanup-storage.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Edge function to cleanup old clips and manage storage
 * This should be called by a cron job (e.g., daily)
 * 
 * Tasks:
 * 1. Cleanup clips older than 90 days
 * 2. Cleanup failed/processing clips older than 24 hours
 * 3. Cleanup clips for inactive accounts (no activity in 90 days)
 * 4. Recalculate storage usage for all profiles
 */
serve(async (req) => {
  // Only allow POST requests (for cron triggers)
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "content-type": "application/json" },
      }
    );
  }

  try {
    const results: Record<string, any> = {};

    // 1. Cleanup old clips (90+ days)
    console.log("Cleaning up old clips (90+ days)...");
    const { data: oldClipsResult, error: oldClipsError } = await supabase
      .rpc("cleanup_old_clips");

    if (oldClipsError) {
      console.error("Error cleaning up old clips:", oldClipsError);
      results.old_clips_error = oldClipsError.message;
    } else {
      results.old_clips = oldClipsResult?.[0] || { deleted_clips_count: 0, freed_storage_bytes: 0 };
      console.log(`Cleaned up ${results.old_clips.deleted_clips_count} old clips, freed ${results.old_clips.freed_storage_bytes} bytes`);
    }

    // 2. Cleanup failed/processing clips (24+ hours)
    console.log("Cleaning up failed/processing clips (24+ hours)...");
    const { data: failedClipsResult, error: failedClipsError } = await supabase
      .rpc("cleanup_failed_clips");

    if (failedClipsError) {
      console.error("Error cleaning up failed clips:", failedClipsError);
      results.failed_clips_error = failedClipsError.message;
    } else {
      results.failed_clips = failedClipsResult?.[0] || { deleted_clips_count: 0, freed_storage_bytes: 0 };
      console.log(`Cleaned up ${results.failed_clips.deleted_clips_count} failed clips, freed ${results.failed_clips.freed_storage_bytes} bytes`);
    }

    // 3. Cleanup clips for inactive accounts (no activity in 90 days)
    console.log("Cleaning up clips for inactive accounts...");
    const { data: inactiveAccountsResult, error: inactiveAccountsError } = await supabase
      .rpc("cleanup_inactive_account_clips");

    if (inactiveAccountsError) {
      console.error("Error cleaning up inactive account clips:", inactiveAccountsError);
      results.inactive_accounts_error = inactiveAccountsError.message;
    } else {
      results.inactive_accounts = inactiveAccountsResult?.[0] || { 
        deleted_clips_count: 0, 
        freed_storage_bytes: 0,
        affected_profiles_count: 0
      };
      console.log(`Cleaned up ${results.inactive_accounts.deleted_clips_count} clips from ${results.inactive_accounts.affected_profiles_count} inactive accounts, freed ${results.inactive_accounts.freed_storage_bytes} bytes`);
    }

    // 4. Auto-end expired live rooms
    console.log("Checking for expired live rooms...");
    const { data: expiredRoomsResult, error: expiredRoomsError } = await supabase
      .rpc("auto_end_expired_rooms");

    if (expiredRoomsError) {
      console.error("Error auto-ending expired rooms:", expiredRoomsError);
      results.expired_rooms_error = expiredRoomsError.message;
    } else {
      results.expired_rooms = expiredRoomsResult?.[0] || { 
        ended_rooms_count: 0,
        ended_room_ids: []
      };
      console.log(`Auto-ended ${results.expired_rooms.ended_rooms_count} expired rooms`);
    }

    // 5. Recalculate storage usage (optional - can be expensive, run less frequently)
    // Uncomment if you want to recalculate all storage on each run
    // console.log("Recalculating storage usage for all profiles...");
    // const { error: recalcError } = await supabase.rpc("recalculate_all_storage");
    // if (recalcError) {
    //   console.error("Error recalculating storage:", recalcError);
    //   results.recalculate_storage_error = recalcError.message;
    // } else {
    //   results.recalculate_storage = "completed";
    // }

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        results,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in cleanup-storage function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
});

