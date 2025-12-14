import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, ToggleLeft, ToggleRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AutoModRule {
  id: string;
  rule_name: string;
  rule_type: string;
  rule_config: any;
  action: string;
  is_active: boolean;
  priority: number;
}

interface AutoModRulesManagerProps {
  communityId: string;
  isHost: boolean;
}

export const AutoModRulesManager = ({ communityId, isHost }: AutoModRulesManagerProps) => {
  const [rules, setRules] = useState<AutoModRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoModRule | null>(null);
  const [formData, setFormData] = useState({
    rule_name: "",
    rule_type: "keyword",
    rule_config: {},
    action: "flag",
    is_active: true,
    priority: 0,
  });
  const { toast } = useToast();

  useEffect(() => {
    loadRules();
  }, [communityId]);

  const loadRules = async () => {
    try {
      const { data, error } = await supabase
        .from("community_auto_mod_rules")
        .select("*")
        .eq("community_id", communityId)
        .order("priority", { ascending: false });

      if (error) throw error;
      setRules(data || []);
    } catch (error) {
      console.error("Error loading auto-mod rules:", error);
      toast({
        title: "Error loading rules",
        description: "Could not load auto-moderation rules.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const profileId = localStorage.getItem("profileId");
      if (!profileId) {
        toast({
          title: "Error",
          description: "Please log in to create rules.",
          variant: "destructive",
        });
        return;
      }

      const ruleData = {
        community_id: communityId,
        ...formData,
        created_by_profile_id: profileId,
      };

      if (editingRule) {
        const { error } = await supabase
          .from("community_auto_mod_rules")
          .update(ruleData)
          .eq("id", editingRule.id);

        if (error) throw error;
        toast({
          title: "Rule updated",
          description: "Auto-moderation rule has been updated.",
        });
      } else {
        const { error } = await supabase
          .from("community_auto_mod_rules")
          .insert(ruleData);

        if (error) throw error;
        toast({
          title: "Rule created",
          description: "New auto-moderation rule has been created.",
        });
      }

      setIsDialogOpen(false);
      setEditingRule(null);
      setFormData({
        rule_name: "",
        rule_type: "keyword",
        rule_config: {},
        action: "flag",
        is_active: true,
        priority: 0,
      });
      loadRules();
    } catch (error) {
      console.error("Error saving rule:", error);
      toast({
        title: "Error",
        description: "Could not save rule. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;

    try {
      const { error } = await supabase
        .from("community_auto_mod_rules")
        .delete()
        .eq("id", ruleId);

      if (error) throw error;
      toast({
        title: "Rule deleted",
        description: "Auto-moderation rule has been deleted.",
      });
      loadRules();
    } catch (error) {
      console.error("Error deleting rule:", error);
      toast({
        title: "Error",
        description: "Could not delete rule. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (rule: AutoModRule) => {
    try {
      const { error } = await supabase
        .from("community_auto_mod_rules")
        .update({ is_active: !rule.is_active })
        .eq("id", rule.id);

      if (error) throw error;
      loadRules();
    } catch (error) {
      console.error("Error toggling rule:", error);
      toast({
        title: "Error",
        description: "Could not update rule status.",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (rule: AutoModRule) => {
    setEditingRule(rule);
    setFormData({
      rule_name: rule.rule_name,
      rule_type: rule.rule_type,
      rule_config: rule.rule_config,
      action: rule.action,
      is_active: rule.is_active,
      priority: rule.priority,
    });
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Auto-Moderation Rules</h3>
          <p className="text-sm text-muted-foreground">
            Automatically moderate content based on rules you define.
          </p>
        </div>
        {isHost && (
          <Button
            onClick={() => {
              setEditingRule(null);
              setFormData({
                rule_name: "",
                rule_type: "keyword",
                rule_config: {},
                action: "flag",
                is_active: true,
                priority: 0,
              });
              setIsDialogOpen(true);
            }}
            className="rounded-2xl"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
        )}
      </div>

      {rules.length === 0 ? (
        <Card className="p-8 text-center rounded-2xl">
          <p className="text-muted-foreground">No auto-moderation rules yet.</p>
          {isHost && (
            <Button
              onClick={() => setIsDialogOpen(true)}
              variant="outline"
              className="mt-4 rounded-2xl"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create First Rule
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card key={rule.id} className="p-4 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold">{rule.rule_name}</h4>
                    <Badge variant={rule.is_active ? "default" : "secondary"}>
                      {rule.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant="outline">{rule.rule_type}</Badge>
                    <Badge variant="outline">Action: {rule.action}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Priority: {rule.priority}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(rule)}
                    className="rounded-xl"
                  >
                    {rule.is_active ? (
                      <ToggleRight className="h-5 w-5" />
                    ) : (
                      <ToggleLeft className="h-5 w-5" />
                    )}
                  </Button>
                  {isHost && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(rule)}
                        className="rounded-xl"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(rule.id)}
                        className="rounded-xl text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Edit Rule" : "Create Auto-Moderation Rule"}
            </DialogTitle>
            <DialogDescription>
              Define rules to automatically moderate content in your community.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rule_name">Rule Name</Label>
              <Input
                id="rule_name"
                value={formData.rule_name}
                onChange={(e) =>
                  setFormData({ ...formData, rule_name: e.target.value })
                }
                placeholder="e.g., Block spam keywords"
                className="rounded-2xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule_type">Rule Type</Label>
              <Select
                value={formData.rule_type}
                onValueChange={(value) =>
                  setFormData({ ...formData, rule_type: value })
                }
              >
                <SelectTrigger id="rule_type" className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Keyword</SelectItem>
                  <SelectItem value="spam_pattern">Spam Pattern</SelectItem>
                  <SelectItem value="user_behavior">User Behavior</SelectItem>
                  <SelectItem value="content_analysis">Content Analysis</SelectItem>
                  <SelectItem value="rate_limit">Rate Limit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="action">Action</Label>
              <Select
                value={formData.action}
                onValueChange={(value) =>
                  setFormData({ ...formData, action: value })
                }
              >
                <SelectTrigger id="action" className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="remove">Remove</SelectItem>
                  <SelectItem value="hide">Hide</SelectItem>
                  <SelectItem value="flag">Flag for Review</SelectItem>
                  <SelectItem value="warn">Warn User</SelectItem>
                  <SelectItem value="ban">Ban User</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority (0-100)</Label>
              <Input
                id="priority"
                type="number"
                min="0"
                max="100"
                value={formData.priority}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    priority: parseInt(e.target.value) || 0,
                  })
                }
                className="rounded-2xl"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="rounded-2xl"
            >
              Cancel
            </Button>
            <Button onClick={handleSave} className="rounded-2xl">
              {editingRule ? "Update" : "Create"} Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

