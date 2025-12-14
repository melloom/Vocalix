import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info, Shield, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface Regulation {
  id: string;
  rule_number: number;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
}

export const NSFWSpaceRegulations = () => {
  const [isOpen, setIsOpen] = useState(false);
  
  const { data: regulations, isLoading } = useQuery({
    queryKey: ['nsfw-regulations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nsfw_space_regulations')
        .select('*')
        .eq('is_active', true)
        .order('rule_number', { ascending: true });
      
      if (error) throw error;
      return (data || []) as Regulation[];
    },
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Shield className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive" className="text-xs">Critical</Badge>;
      case 'warning':
        return <Badge variant="secondary" className="text-xs bg-yellow-500/20 text-yellow-600 dark:text-yellow-400">Warning</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Info</Badge>;
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="p-4 border border-border/30 bg-gradient-to-r from-yellow-500/5 via-red-500/5 to-yellow-500/5">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div className="text-left">
                <h3 className="font-semibold text-sm">18+ Space Regulations</h3>
                <p className="text-xs text-muted-foreground">Minimal rules for this free speech zone</p>
              </div>
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="pt-4 space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : regulations && regulations.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {regulations.map((regulation) => (
                <div
                  key={regulation.id}
                  className={`p-3 rounded-lg border ${
                    regulation.severity === 'critical'
                      ? 'border-red-500/20 bg-red-500/5'
                      : regulation.severity === 'warning'
                      ? 'border-yellow-500/20 bg-yellow-500/5'
                      : 'border-border/30 bg-muted/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      {getSeverityIcon(regulation.severity)}
                      <h4 className="font-semibold text-sm">
                        {regulation.rule_number}. {regulation.title}
                      </h4>
                    </div>
                    {getSeverityBadge(regulation.severity)}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {regulation.description}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">No regulations found</p>
            </div>
          )}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

