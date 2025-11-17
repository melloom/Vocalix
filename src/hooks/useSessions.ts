import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface Session {
  id: string;
  device_id: string | null;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  last_accessed_at: string;
  expires_at: string;
}

export const useSessions = () => {
  const { profileId } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: sessions,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["sessions", profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data, error } = await supabase.rpc("get_active_sessions", {
        p_profile_id: profileId,
      });

      if (error) {
        // If function doesn't exist, return empty array (backward compatibility)
        if (error.message?.includes("does not exist") || error.message?.includes("not found")) {
          return [];
        }
        throw error;
      }

      return (data || []) as Session[];
    },
    enabled: !!profileId,
    staleTime: 30 * 1000, // Refresh every 30 seconds
  });

  const revokeSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.rpc("revoke_session_by_id", {
        p_session_id: sessionId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions", profileId] });
    },
  });

  const revokeAllSessions = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error("No profile ID");

      const { error } = await supabase.rpc("revoke_all_sessions", {
        p_profile_id: profileId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions", profileId] });
    },
  });

  return {
    sessions: sessions || [],
    isLoading,
    error,
    refetch,
    revokeSession: revokeSession.mutateAsync,
    isRevoking: revokeSession.isPending,
    revokeAllSessions: revokeAllSessions.mutateAsync,
    isRevokingAll: revokeAllSessions.isPending,
  };
};

