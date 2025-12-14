import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { X, UserPlus, Trophy, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

interface GroupChallengeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  challengeId: string;
}

interface Team {
  id: string;
  team_name: string;
  team_description: string | null;
  created_by_profile_id: string;
  max_members: number;
  current_member_count: number;
  total_score: number;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface TeamMember {
  profile_id: string;
  handle: string;
  emoji_avatar: string;
  role: string;
  contribution_score: number;
}

export const GroupChallengeDialog = ({
  isOpen,
  onClose,
  challengeId,
}: GroupChallengeDialogProps) => {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [maxMembers, setMaxMembers] = useState(10);

  useEffect(() => {
    if (isOpen && challengeId) {
      loadTeams();
    }
  }, [isOpen, challengeId]);

  const loadTeams = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("challenge_teams")
        .select(
          `
          *,
          profiles:created_by_profile_id (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("challenge_id", challengeId)
        .order("total_score", { ascending: false });

      if (error) throw error;
      setTeams(data || []);
    } catch (error) {
      console.error("Error loading teams:", error);
      toast({
        title: "Error",
        description: "Failed to load teams",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadTeamMembers = async (teamId: string) => {
    try {
      const { data, error } = await supabase
        .from("challenge_team_members")
        .select(
          `
          *,
          profiles:profile_id (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("team_id", teamId);

      if (error) throw error;

      const members: TeamMember[] = (data || []).map((item: any) => ({
        profile_id: item.profile_id,
        handle: item.profiles?.handle || "Unknown",
        emoji_avatar: item.profiles?.emoji_avatar || "👤",
        role: item.role,
        contribution_score: item.contribution_score,
      }));

      setTeamMembers(members);
    } catch (error) {
      console.error("Error loading team members:", error);
    }
  };

  const handleCreateTeam = async () => {
    if (!profile?.id || !teamName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a team name",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingTeam(true);
    try {
      const { data: team, error } = await supabase
        .from("challenge_teams")
        .insert({
          challenge_id: challengeId,
          team_name: teamName.trim(),
          team_description: teamDescription.trim() || null,
          created_by_profile_id: profile.id,
          max_members: maxMembers,
        })
        .select()
        .single();

      if (error) throw error;

      // Add creator as team leader
      await supabase.from("challenge_team_members").insert({
        team_id: team.id,
        profile_id: profile.id,
        role: "leader",
      });

      toast({
        title: "Success",
        description: "Team created successfully",
      });

      setTeamName("");
      setTeamDescription("");
      setMaxMembers(10);
      setShowCreateForm(false);
      await loadTeams();
    } catch (error) {
      console.error("Error creating team:", error);
      toast({
        title: "Error",
        description: "Failed to create team",
        variant: "destructive",
      });
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const handleJoinTeam = async (teamId: string) => {
    if (!profile?.id) return;

    try {
      const { error } = await supabase.from("challenge_team_members").insert({
        team_id: teamId,
        profile_id: profile.id,
        role: "member",
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "You joined the team!",
      });

      await loadTeams();
      if (selectedTeam?.id === teamId) {
        await loadTeamMembers(teamId);
      }
    } catch (error) {
      console.error("Error joining team:", error);
      toast({
        title: "Error",
        description: "Failed to join team",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Group Challenge Teams</DialogTitle>
          <DialogDescription>
            Create or join a team to compete together in this challenge
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create Team Button */}
          {!showCreateForm && (
            <Button onClick={() => setShowCreateForm(true)} className="w-full">
              <Trophy className="h-4 w-4 mr-2" />
              Create New Team
            </Button>
          )}

          {/* Create Team Form */}
          {showCreateForm && (
            <Card className="p-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="team-name">Team Name</Label>
                  <Input
                    id="team-name"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Enter team name"
                  />
                </div>
                <div>
                  <Label htmlFor="team-description">Description (Optional)</Label>
                  <Textarea
                    id="team-description"
                    value={teamDescription}
                    onChange={(e) => setTeamDescription(e.target.value)}
                    placeholder="Describe your team..."
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="max-members">Max Members</Label>
                  <Input
                    id="max-members"
                    type="number"
                    min={2}
                    max={50}
                    value={maxMembers}
                    onChange={(e) => setMaxMembers(parseInt(e.target.value) || 10)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreateTeam} disabled={isCreatingTeam}>
                    Create Team
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCreateForm(false);
                      setTeamName("");
                      setTeamDescription("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Teams List */}
          <div className="space-y-3">
            {isLoading ? (
              <div className="text-center text-muted-foreground py-8">Loading teams...</div>
            ) : teams.length > 0 ? (
              teams.map((team) => (
                <Card
                  key={team.id}
                  className={`p-4 cursor-pointer transition-colors ${
                    selectedTeam?.id === team.id ? "border-primary" : ""
                  }`}
                  onClick={() => {
                    setSelectedTeam(team);
                    loadTeamMembers(team.id);
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Trophy className="h-4 w-4 text-yellow-500" />
                        <h3 className="font-semibold">{team.team_name}</h3>
                        <Badge variant="secondary">
                          Score: {team.total_score.toFixed(1)}
                        </Badge>
                      </div>
                      {team.team_description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {team.team_description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {team.current_member_count}/{team.max_members} members
                        </div>
                        {team.profiles && (
                          <div className="flex items-center gap-1">
                            <span>Created by</span>
                            <span className="font-medium">@{team.profiles.handle}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleJoinTeam(team.id);
                      }}
                      disabled={
                        team.current_member_count >= team.max_members ||
                        teamMembers.some((m) => m.profile_id === profile?.id)
                      }
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Join
                    </Button>
                  </div>

                  {/* Team Members */}
                  {selectedTeam?.id === team.id && teamMembers.length > 0 && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      <div className="text-sm font-medium mb-2">Team Members:</div>
                      {teamMembers.map((member) => (
                        <div
                          key={member.profile_id}
                          className="flex items-center justify-between p-2 rounded border"
                        >
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-sm">
                                {member.emoji_avatar}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <Link
                                to={`/profile/${member.handle}`}
                                className="font-medium text-sm hover:underline"
                              >
                                @{member.handle}
                              </Link>
                              <Badge variant="outline" className="ml-2 text-xs">
                                {member.role}
                              </Badge>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {member.contribution_score.toFixed(1)} pts
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-8">
                No teams yet. Be the first to create one!
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

