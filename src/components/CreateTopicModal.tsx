import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface CreateTopicModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  communityId?: string | null;
}

export const CreateTopicModal = ({ open, onOpenChange, onSuccess, communityId: initialCommunityId }: CreateTopicModalProps) => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(initialCommunityId || null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get user's communities for selection
  const { data: userCommunities } = useQuery({
    queryKey: ['user-communities', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      const { data, error } = await supabase
        .from('community_members')
        .select(`
          community_id,
          communities (
            id,
            name,
            slug,
            avatar_emoji
          )
        `)
        .eq('profile_id', profile.id);

      if (error) throw error;
      return (data || []).map((item: any) => ({
        id: item.community_id,
        ...item.communities,
      }));
    },
    enabled: !!profile?.id && open,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile?.id) {
      toast.error('Please log in to create topics');
      return;
    }

    if (!title.trim()) {
      toast.error('Please enter a topic title');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase
        .from('topics')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          date: new Date().toISOString().split('T')[0], // Today's date
          user_created_by: profile.id,
          community_id: selectedCommunityId || null,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Topic created successfully! It will appear in the topics catalog.');
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['trending-topics'] });
      queryClient.invalidateQueries({ queryKey: ['recent-topics'] });
      queryClient.invalidateQueries({ queryKey: ['all-topics'] });
      
      // Reset form
      setTitle('');
      setDescription('');
      setSelectedCommunityId(initialCommunityId || null);
      
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating topic:', error);
      toast.error(error.message || 'Failed to create topic');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Topic</DialogTitle>
          <DialogDescription>
            Start a new discussion topic. It can be community-specific or general.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Topic Title *</Label>
            <Input
              id="title"
              placeholder="e.g., What's your favorite memory?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Add more context about this topic..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          {userCommunities && userCommunities.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="community">Community (Optional)</Label>
              <Select
                value={selectedCommunityId || 'none'}
                onValueChange={(value) => setSelectedCommunityId(value === 'none' ? null : value)}
                disabled={isSubmitting}
              >
                <SelectTrigger id="community">
                  <SelectValue placeholder="Select a community" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General Topic (No Community)</SelectItem>
                  {userCommunities.map((community) => (
                    <SelectItem key={community.id} value={community.id}>
                      <div className="flex items-center gap-2">
                        <span>{community.avatar_emoji}</span>
                        <span>{community.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Community topics can appear in trending if they get popular
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Topic'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

