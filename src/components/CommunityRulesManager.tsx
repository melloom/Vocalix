import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, GripVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CommunityRule {
  id: string;
  rule_number: number;
  title: string;
  description: string;
}

interface CommunityRulesManagerProps {
  communityId: string;
  isHost: boolean;
}

export const CommunityRulesManager = ({
  communityId,
  isHost,
}: CommunityRulesManagerProps) => {
  const [rules, setRules] = useState<CommunityRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CommunityRule | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    loadRules();
  }, [communityId]);

  const loadRules = async () => {
    try {
      const { data, error } = await supabase
        .from("community_rules")
        .select("*")
        .eq("community_id", communityId)
        .order("rule_number", { ascending: true });

      if (error) throw error;
      setRules(data || []);
    } catch (error) {
      console.error("Error loading rules:", error);
      toast({
        title: "Error loading rules",
        description: "Could not load community rules.",
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

      if (editingRule) {
        const { error } = await supabase
          .from("community_rules")
          .update({
            title: formData.title,
            description: formData.description,
          })
          .eq("id", editingRule.id);

        if (error) throw error;
        toast({
          title: "Rule updated",
          description: "Community rule has been updated.",
        });
      } else {
        // Get next rule number
        const nextRuleNumber = rules.length > 0 ? Math.max(...rules.map(r => r.rule_number)) + 1 : 1;

        const { error } = await supabase.from("community_rules").insert({
          community_id: communityId,
          rule_number: nextRuleNumber,
          title: formData.title,
          description: formData.description,
          created_by_profile_id: profileId,
        });

        if (error) throw error;
        toast({
          title: "Rule created",
          description: "New community rule has been created.",
        });
      }

      setIsDialogOpen(false);
      setEditingRule(null);
      setFormData({ title: "", description: "" });
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
        .from("community_rules")
        .delete()
        .eq("id", ruleId);

      if (error) throw error;
      toast({
        title: "Rule deleted",
        description: "Community rule has been deleted.",
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

  const openEditDialog = (rule: CommunityRule) => {
    setEditingRule(rule);
    setFormData({
      title: rule.title,
      description: rule.description,
    });
    setIsDialogOpen(true);
  };

  if (!isHost) {
    return (
      <Card className="p-6 rounded-2xl">
        <p className="text-muted-foreground">Only community hosts can manage rules.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Community Rules</h3>
          <p className="text-sm text-muted-foreground">
            Define rules that members must follow in your community.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingRule(null);
            setFormData({ title: "", description: "" });
            setIsDialogOpen(true);
          }}
          className="rounded-2xl"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <Card className="p-8 text-center rounded-2xl">
          <p className="text-muted-foreground">No rules defined yet.</p>
          <Button
            onClick={() => setIsDialogOpen(true)}
            variant="outline"
            className="mt-4 rounded-2xl"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create First Rule
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card key={rule.id} className="p-4 rounded-2xl">
              <div className="flex items-start gap-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <GripVertical className="h-5 w-5" />
                  <span className="font-semibold text-lg">{rule.rule_number}.</span>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-1">{rule.title}</h4>
                  <p className="text-sm text-muted-foreground">{rule.description}</p>
                </div>
                <div className="flex items-center gap-2">
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
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Rule" : "Create Rule"}</DialogTitle>
            <DialogDescription>
              Define a rule that members must follow in your community.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="title">Rule Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="e.g., Be respectful"
                className="rounded-2xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Rule Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Describe the rule in detail..."
                className="rounded-2xl min-h-[100px]"
                maxLength={500}
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

