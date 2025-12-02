import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, Clock, Shield } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ModerationAnalyticsProps {
  communityId: string;
}

export const ModerationAnalytics = ({ communityId }: ModerationAnalyticsProps) => {
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState("30");
  const { toast } = useToast();

  useEffect(() => {
    loadAnalytics();
  }, [communityId, period]);

  const loadAnalytics = async () => {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(period));

      const { data, error } = await supabase.rpc("get_community_moderation_stats", {
        p_community_id: communityId,
        p_start_date: startDate.toISOString(),
        p_end_date: new Date().toISOString(),
      });

      if (error) throw error;
      setStats(data?.[0] || null);
    } catch (error) {
      console.error("Error loading analytics:", error);
      toast({
        title: "Error loading analytics",
        description: "Could not load moderation analytics.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Moderation Analytics</h3>
          <p className="text-sm text-muted-foreground">
            Insights into your community's moderation activity.
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px] rounded-2xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <TrendingUp className="h-4 w-4 text-green-500" />
          </div>
          <p className="text-sm text-muted-foreground">Items Reviewed</p>
          <p className="text-2xl font-bold">{stats?.items_reviewed || 0}</p>
        </Card>

        <Card className="p-4 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <TrendingDown className="h-5 w-5 text-muted-foreground" />
            <TrendingDown className="h-4 w-4 text-red-500" />
          </div>
          <p className="text-sm text-muted-foreground">Items Removed</p>
          <p className="text-2xl font-bold">{stats?.items_removed || 0}</p>
        </Card>

        <Card className="p-4 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <TrendingUp className="h-4 w-4 text-green-500" />
          </div>
          <p className="text-sm text-muted-foreground">Items Approved</p>
          <p className="text-2xl font-bold">{stats?.items_approved || 0}</p>
        </Card>

        <Card className="p-4 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Avg Response Time</p>
          <p className="text-2xl font-bold">
            {stats?.avg_response_time_minutes
              ? `${Math.round(stats.avg_response_time_minutes)}m`
              : "N/A"}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 rounded-2xl">
          <p className="text-sm text-muted-foreground mb-2">Reports Received</p>
          <p className="text-3xl font-bold">{stats?.reports_received || 0}</p>
        </Card>

        <Card className="p-4 rounded-2xl">
          <p className="text-sm text-muted-foreground mb-2">Auto-Mod Actions</p>
          <p className="text-3xl font-bold">{stats?.auto_mod_actions || 0}</p>
        </Card>
      </div>
    </div>
  );
};

