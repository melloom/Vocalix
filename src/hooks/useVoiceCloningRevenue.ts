import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";

interface VoiceCloningRevenue {
  id: string;
  cloned_clip_id: string;
  original_clip_id: string;
  cloned_creator_id: string;
  original_creator_id: string;
  revenue_amount: number;
  cloned_creator_share: number;
  original_creator_share: number;
  sharing_percentage: number;
  is_paid: boolean;
  paid_at: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
}

interface UseVoiceCloningRevenueOptions {
  clipId?: string;
  profileId?: string;
  asOriginalCreator?: boolean;
}

/**
 * Hook to manage voice cloning revenue sharing
 */
export function useVoiceCloningRevenue(options: UseVoiceCloningRevenueOptions = {}) {
  const [revenue, setRevenue] = useState<VoiceCloningRevenue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalShare, setTotalShare] = useState(0);

  useEffect(() => {
    if (options.profileId) {
      loadRevenue();
    }
  }, [options.profileId, options.clipId, options.asOriginalCreator]);

  const loadRevenue = async () => {
    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("voice_cloning_revenue_sharing")
        .select("*");

      if (options.clipId) {
        if (options.asOriginalCreator) {
          query = query.eq("original_clip_id", options.clipId);
        } else {
          query = query.eq("cloned_clip_id", options.clipId);
        }
      } else if (options.profileId) {
        // Get revenue where user is either the cloned creator or original creator
        query = query.or(
          `cloned_creator_id.eq.${options.profileId},original_creator_id.eq.${options.profileId}`
        );
      }

      const { data, error: queryError } = await query.order("created_at", { ascending: false });

      if (queryError) throw queryError;

      setRevenue(data || []);

      // Calculate totals
      const total = (data || []).reduce((sum, r) => sum + Number(r.revenue_amount || 0), 0);
      const share = (data || []).reduce((sum, r) => {
        if (options.asOriginalCreator) {
          return sum + Number(r.original_creator_share || 0);
        } else {
          return sum + Number(r.cloned_creator_share || 0);
        }
      }, 0);

      setTotalRevenue(total);
      setTotalShare(share);
    } catch (err) {
      logError("Failed to load voice cloning revenue", err);
      setError(err instanceof Error ? err.message : "Failed to load revenue");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Calculate and record revenue for a cloned clip
   */
  const calculateRevenue = async (
    clonedClipId: string,
    revenueAmount: number,
    periodStart: string,
    periodEnd: string
  ): Promise<string | null> => {
    try {
      const { data, error: calcError } = await supabase.rpc(
        "calculate_voice_cloning_revenue",
        {
          p_cloned_clip_id: clonedClipId,
          p_revenue_amount: revenueAmount,
          p_period_start: periodStart,
          p_period_end: periodEnd,
        }
      );

      if (calcError) throw calcError;

      // Reload revenue
      await loadRevenue();

      return data;
    } catch (err) {
      logError("Failed to calculate voice cloning revenue", err);
      throw err;
    }
  };

  /**
   * Mark revenue as paid
   */
  const markAsPaid = async (revenueId: string) => {
    try {
      const { error: updateError } = await supabase
        .from("voice_cloning_revenue_sharing")
        .update({
          is_paid: true,
          paid_at: new Date().toISOString(),
        })
        .eq("id", revenueId);

      if (updateError) throw updateError;

      await loadRevenue();
    } catch (err) {
      logError("Failed to mark revenue as paid", err);
      throw err;
    }
  };

  return {
    revenue,
    isLoading,
    error,
    totalRevenue,
    totalShare,
    calculateRevenue,
    markAsPaid,
    refetch: loadRevenue,
  };
}

