import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { getUserAgent } from "@/lib/deviceSecurity";

interface Device {
  id: string;
  device_id: string;
  profile_id: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
  first_seen_at: string | null;
  user_agent: string | null;
  ip_address: string | null;
  is_revoked: boolean;
  is_suspicious: boolean;
  request_count: number;
}

// Helper function to create a synthetic device when DB operations fail
const createSyntheticDevice = (deviceId: string, profileId: string | null | undefined): Device[] => {
  return [{
    id: deviceId, // Use deviceId as id for synthetic device
    device_id: deviceId,
    profile_id: profileId || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    first_seen_at: new Date().toISOString(),
    user_agent: null,
    ip_address: null,
    is_revoked: false,
    is_suspicious: false,
    request_count: 0,
  }];
};

export const useDevices = () => {
  const { profileId, deviceId } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: devices,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["devices", profileId, deviceId],
    queryFn: async () => {
      // CRITICAL: Always return at least the current device if deviceId exists
      if (!deviceId) return [];


      // Try RPC function first - this should work if database is set up correctly
      try {
        // First, update the current device's user_agent if needed (fire-and-forget)
        // This ensures user_agent is always current
        // Pass the user_agent directly from the browser using native fetch
        const userAgent = getUserAgent();
        if (userAgent && userAgent !== "unknown" && deviceId) {
          // Try direct update first (most reliable), then fallback to RPC
          // This MUST happen before get_user_devices so the user_agent is stored
          try {
            // @ts-ignore - user_agent column exists but not in generated types
            const { error: directError } = await supabase
              .from("devices")
              // @ts-ignore - user_agent field exists in DB but not in types
              .update({
                user_agent: userAgent,
                last_seen_at: new Date().toISOString(),
              } as any)
              .eq("device_id", deviceId);
            
            if (directError) {
              console.warn("⚠️ Direct update failed, trying RPC function:", directError);
              // Fallback to RPC function
              const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
              const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
              const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_current_device_user_agent`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "apikey": SUPABASE_KEY,
                  "Authorization": `Bearer ${SUPABASE_KEY}`,
                  "x-device-id": deviceId,
                },
                body: JSON.stringify({ p_user_agent: userAgent }),
              });
              if (response.ok) {
                console.log("✅ Updated device user_agent via RPC:", userAgent.substring(0, 50));
              } else {
                const errorData = await response.json().catch(() => ({}));
                console.warn("⚠️ RPC update also failed:", response.status, errorData);
              }
            } else {
              console.log("✅ Direct update successful:", userAgent.substring(0, 50));
            }
            // Wait a bit to ensure the update is processed
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (updateError) {
            console.warn("⚠️ Failed to update user_agent:", updateError);
            // Continue anyway - might not be critical
          }
        }
        
        // @ts-ignore - get_user_devices exists but not in types yet
        const { data, error } = await supabase.rpc("get_user_devices");
        
        // If we got data (even if empty array), return it
        if (data !== null && data !== undefined) {
          if (Array.isArray(data) && data.length > 0) {
            console.log("✅ RPC function returned devices from database:", data.length);
            return (data || []) as Device[];
          }
          // If data is empty array, continue to try direct query
          if (Array.isArray(data) && data.length === 0) {
            console.log("⚠️ RPC function returned empty array, trying direct query");
          }
        }
        
        // Log the error so we can debug what's wrong
        if (error) {
          // If it's a function signature error, 400 error, or function doesn't exist, fall through to direct query
          if (
            error.code === "42883" || // function does not exist
            error.message?.includes("does not exist") ||
            error.message?.includes("not found") ||
            (error as any).status === 400 // Bad Request from HTTP
          ) {
            console.warn("⚠️ get_user_devices RPC not available, trying direct query:", error.message);
            // Don't throw, let it fall through to direct query below
          } else {
            console.error("❌ RPC function error:", {
              code: error.code,
              message: error.message,
              details: error.details,
              hint: error.hint
            });
            throw error; // Will be caught and handled below
          }
        }
      } catch (rpcError: any) {
        console.error("❌ RPC call exception:", rpcError);
        // Continue to try direct query
      }
      
      // Try direct query to devices table
      try {
        const { data: devicesData, error: devicesError } = await supabase
          .from("devices")
          .select("*")
          .eq("device_id", deviceId)
          .order("last_seen_at", { ascending: false });
        
        if (devicesError) {
          console.error("❌ Direct query error:", {
            code: devicesError.code,
            message: devicesError.message,
            details: devicesError.details,
            hint: devicesError.hint
          });
          
          // If it's a permission error, the RLS policies might be blocking
          if (devicesError.code === "42501" || devicesError.code === "PGRST301") {
            console.error("Permission denied - RLS policies may be blocking access");
          }
          
          throw devicesError;
        }
        
        if (devicesData && devicesData.length > 0) {
          console.log("✅ Direct query returned devices from database:", devicesData.length);
          return (devicesData || []) as Device[];
        }
        
        // If no devices found, try to create one in the database
        console.log("⚠️ No devices found in database, attempting to create device");
        const { data: newDevice, error: insertError } = await supabase
          .from("devices")
          .insert({
            device_id: deviceId,
            profile_id: profileId || null,
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            request_count: 1,
          })
          .select()
          .single();
        
        if (!insertError && newDevice) {
          console.log("✅ Created new device in database");
          return [newDevice as Device];
        }
        
        if (insertError) {
          console.error("❌ Failed to create device:", {
            code: insertError.code,
            message: insertError.message
          });
        }
      } catch (queryErr: any) {
        console.error("❌ Query exception:", queryErr);
        // Continue to fallback
      }
      
      // LAST RESORT: Only use synthetic device if ALL database operations failed
      console.warn("⚠️ All database operations failed, using synthetic device as last resort");
      console.warn("This means the device won't be saved to the database. Check the errors above.");
      return createSyntheticDevice(deviceId, profileId);
    },
    enabled: !!deviceId, // Enable if we have a deviceId (don't require profileId)
    staleTime: 5000, // 5 seconds - refresh more often to show current activity
    retry: false, // Don't retry - we'll use synthetic device on first failure
    // Ensure we always get a result, even if it's synthetic
    refetchOnWindowFocus: true, // Refetch when window gains focus
    refetchOnReconnect: true, // Refetch when reconnecting
    refetchInterval: 30000, // Refetch every 30 seconds to keep last_seen_at current
  });

  const revokeDevice = useMutation({
    mutationFn: async (deviceIdToRevoke: string) => {
      // @ts-ignore - revoke_device exists but not in types yet
      const { error } = await supabase.rpc("revoke_device", {
        p_device_id: deviceIdToRevoke,
        p_reason: "User revoked device",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate all device queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      // Also refetch immediately
      queryClient.refetchQueries({ queryKey: ["devices"] });
    },
  });

  const clearSuspiciousFlag = useMutation({
    mutationFn: async (deviceIdToClear: string) => {
      // @ts-ignore - clear_device_suspicious_flag exists but not in types yet
      const { error } = await supabase.rpc("clear_device_suspicious_flag", {
        p_device_id: deviceIdToClear,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate all device queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      // Also refetch immediately
      queryClient.refetchQueries({ queryKey: ["devices"] });
    },
  });

  // Unrevoke device
  const unrevokeDevice = useMutation({
    mutationFn: async (deviceIdToUnrevoke: string) => {
      // @ts-ignore - unrevoke_device exists but not in types yet
      const { error } = await supabase.rpc("unrevoke_device", {
        p_device_id: deviceIdToUnrevoke,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate all device queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      // Also refetch immediately
      queryClient.refetchQueries({ queryKey: ["devices"] });
    },
  });

  // Return devices from database (or synthetic only if ALL database operations failed)
  // The queryFn above handles all the database logic and only uses synthetic as last resort
  return {
    devices: Array.isArray(devices) ? devices : [],
    isLoading,
    error, // Show errors so user knows if database isn't working
    refetch,
    revokeDevice: revokeDevice.mutateAsync,
    isRevoking: revokeDevice.isPending,
    clearSuspiciousFlag: clearSuspiciousFlag.mutateAsync,
    isClearingSuspicious: clearSuspiciousFlag.isPending,
    unrevokeDevice: unrevokeDevice.mutateAsync,
    isUnrevoking: unrevokeDevice.isPending,
  };
};

