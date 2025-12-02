import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { Plus, Users, Calendar, Target, TrendingUp } from "lucide-react";

interface CommunityProject {
  id: string;
  community_id: string;
  title: string;
  description: string | null;
  project_type: string;
  created_by_profile_id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  participant_count: number;
  submission_count: number;
  goal_description: string | null;
  communities: {
    name: string;
    slug: string;
  } | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface CommunityProjectsProps {
  communityId?: string;
  showCreateButton?: boolean;
}

export const CommunityProjects = ({
  communityId,
  showCreateButton = true,
}: CommunityProjectsProps) => {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [projects, setProjects] = useState<CommunityProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    project_type: "collaborative",
    goal_description: "",
    end_date: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [communityId]);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("community_projects")
        .select(
          `
          *,
          communities:community_id (
            name,
            slug
          ),
          profiles:created_by_profile_id (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (communityId) {
        query = query.eq("community_id", communityId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error("Error loading community projects:", error);
      toast({
        title: "Error",
        description: "Failed to load community projects",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!profile?.id || !formData.title.trim() || !communityId) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("community_projects").insert({
        community_id: communityId,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        project_type: formData.project_type,
        created_by_profile_id: profile.id,
        goal_description: formData.goal_description.trim() || null,
        end_date: formData.end_date ? new Date(formData.end_date).toISOString() : null,
        status: "active",
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Community project created!",
      });

      setFormData({
        title: "",
        description: "",
        project_type: "collaborative",
        goal_description: "",
        end_date: "",
      });
      setShowCreateForm(false);
      await loadProjects();
    } catch (error) {
      console.error("Error creating project:", error);
      toast({
        title: "Error",
        description: "Failed to create project",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinProject = async (projectId: string) => {
    if (!profile?.id) return;

    try {
      const { error } = await supabase.from("community_project_participants").insert({
        project_id: projectId,
        profile_id: profile.id,
        role: "participant",
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "You joined the project!",
      });

      await loadProjects();
    } catch (error) {
      console.error("Error joining project:", error);
      toast({
        title: "Error",
        description: "Failed to join project",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showCreateButton && communityId && (
        <div className="flex justify-end">
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>
            <Plus className="h-4 w-4 mr-2" />
            {showCreateForm ? "Cancel" : "Create Project"}
          </Button>
        </div>
      )}

      {showCreateForm && (
        <Card className="p-4">
          <CardHeader>
            <CardTitle>Create Community Project</CardTitle>
            <CardDescription>
              Start a collaborative project for your community
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="project-title">Project Title *</Label>
              <Input
                id="project-title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="Enter project title"
              />
            </div>
            <div>
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Describe the project..."
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="project-type">Project Type</Label>
              <Select
                value={formData.project_type}
                onValueChange={(value) =>
                  setFormData({ ...formData, project_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="collaborative">Collaborative</SelectItem>
                  <SelectItem value="contest">Contest</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="collection">Collection</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="goal-description">Goal</Label>
              <Input
                id="goal-description"
                value={formData.goal_description}
                onChange={(e) =>
                  setFormData({ ...formData, goal_description: e.target.value })
                }
                placeholder="What's the goal of this project?"
              />
            </div>
            <div>
              <Label htmlFor="end-date">End Date (Optional)</Label>
              <Input
                id="end-date"
                type="date"
                value={formData.end_date}
                onChange={(e) =>
                  setFormData({ ...formData, end_date: e.target.value })
                }
              />
            </div>
            <Button onClick={handleCreateProject} disabled={isSubmitting}>
              Create Project
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.length > 0 ? (
          projects.map((project) => (
            <Card key={project.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      {project.title}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {project.communities && (
                        <Link
                          to={`/community/${project.communities.slug}`}
                          className="hover:underline"
                        >
                          {project.communities.name}
                        </Link>
                      )}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">{project.project_type}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {project.description && (
                  <p className="text-sm text-muted-foreground">{project.description}</p>
                )}
                {project.goal_description && (
                  <div>
                    <div className="text-sm font-medium mb-1">Goal:</div>
                    <p className="text-sm text-muted-foreground">{project.goal_description}</p>
                  </div>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {project.participant_count} participants
                  </div>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    {project.submission_count} submissions
                  </div>
                </div>
                {project.end_date && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Ends: {new Date(project.end_date).toLocaleDateString()}
                  </div>
                )}
                {project.profiles && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Created by</span>
                    <Link
                      to={`/profile/${project.profiles.handle}`}
                      className="flex items-center gap-1 hover:underline"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {project.profiles.emoji_avatar}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">@{project.profiles.handle}</span>
                    </Link>
                  </div>
                )}
                <Button
                  className="w-full"
                  onClick={() => handleJoinProject(project.id)}
                >
                  Join Project
                </Button>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No active community projects yet
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

