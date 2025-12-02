import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export function useAdminStatus() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { profileId } = useAuth();

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        if (!profileId) {
          setIsAdmin(false);
          setIsLoading(false);
          return;
        }

        // Check if user is in admins table
        const { data, error } = await supabase
          .from("admins")
          .select("profile_id")
          .eq("profile_id", profileId)
          .maybeSingle();

        if (error) {
          console.error("Error checking admin status:", error);
          setIsAdmin(false);
        } else {
          setIsAdmin(!!data);
        }
      } catch (error) {
        console.error("Error checking admin status:", error);
        setIsAdmin(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminStatus();
  }, [profileId]);

  return { isAdmin, isLoading };
}

