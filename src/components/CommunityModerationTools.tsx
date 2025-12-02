import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  Settings,
  Filter,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AutoModRulesManager } from "./AutoModRulesManager";
import { ModerationQueue } from "./ModerationQueue";
import { ModerationAnalytics } from "./ModerationAnalytics";

interface CommunityModerationToolsProps {
  communityId: string;
  isHost: boolean;
  canModerate: boolean;
}

export const CommunityModerationTools = ({
  communityId,
  isHost,
  canModerate,
}: CommunityModerationToolsProps) => {
  const [activeTab, setActiveTab] = useState("queue");
  const [stats, setStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!canModerate) return;

    const loadStats = async () => {
      try {
        const { data, error } = await supabase.rpc("get_community_moderation_stats", {
          p_community_id: communityId,
        });

        if (error) throw error;
        setStats(data?.[0] || null);
      } catch (error) {
        console.error("Error loading moderation stats:", error);
        toast({
          title: "Error loading stats",
          description: "Could not load moderation statistics.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingStats(false);
      }
    };

    loadStats();
  }, [communityId, canModerate, toast]);

  if (!canModerate) {
    return (
      <Card className="p-6 rounded-3xl">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Shield className="h-5 w-5" />
          <p>You don't have permission to access moderation tools.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Pending</p>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold">{stats?.pending_items || 0}</p>
              )}
            </div>
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
        </Card>

        <Card className="p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">High Priority</p>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold">{stats?.high_priority_items || 0}</p>
              )}
            </div>
            <AlertTriangle className="h-5 w-5 text-orange-500" />
          </div>
        </Card>

        <Card className="p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Reviewed Today</p>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold">{stats?.items_reviewed || 0}</p>
              )}
            </div>
            <CheckCircle className="h-5 w-5 text-green-500" />
          </div>
        </Card>

        <Card className="p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Avg Response</p>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold">
                  {stats?.avg_response_time_minutes
                    ? `${Math.round(stats.avg_response_time_minutes)}m`
                    : "N/A"}
                </p>
              )}
            </div>
            <TrendingUp className="h-5 w-5 text-blue-500" />
          </div>
        </Card>
      </div>

      {/* Moderation Tools Tabs */}
      <Card className="p-6 rounded-3xl">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 rounded-2xl">
            <TabsTrigger value="queue" className="rounded-xl">
              <Shield className="h-4 w-4 mr-2" />
              Moderation Queue
            </TabsTrigger>
            <TabsTrigger value="automod" className="rounded-xl">
              <Settings className="h-4 w-4 mr-2" />
              Auto-Mod Rules
            </TabsTrigger>
            <TabsTrigger value="analytics" className="rounded-xl">
              <TrendingUp className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="mt-4">
            <ModerationQueue communityId={communityId} isHost={isHost} />
          </TabsContent>

          <TabsContent value="automod" className="mt-4">
            <AutoModRulesManager communityId={communityId} isHost={isHost} />
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            <ModerationAnalytics communityId={communityId} />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};

