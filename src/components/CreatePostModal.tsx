import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Type, Mic } from 'lucide-react';

interface CreatePostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  topicId: string;
}

export const CreatePostModal = ({ open, onOpenChange, onSuccess, topicId }: CreatePostModalProps) => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<'text' | 'audio'>('text');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile?.id) {
      toast.error('Please log in to create posts');
      return;
    }

    if (postType === 'text') {
      if (!title.trim() && !content.trim()) {
        toast.error('Please enter a title or content');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase
        .from('posts')
        .insert({
          topic_id: topicId,
          profile_id: profile.id,
          post_type: postType,
          title: title.trim() || null,
          content: content.trim() || null,
          status: 'live',
          visibility: 'public',
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Post created successfully!');
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['topic-posts', topicId] });
      queryClient.invalidateQueries({ queryKey: ['topic-feed', topicId] });
      
      // Reset form
      setTitle('');
      setContent('');
      setPostType('text');
      
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating post:', error);
      toast.error(error.message || 'Failed to create post');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Post</DialogTitle>
          <DialogDescription>
            Share your thoughts, story, or voice with the community
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Post Type Selector */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={postType === 'text' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPostType('text')}
              className="flex items-center gap-2"
            >
              <Type className="w-4 h-4" />
              Text Post
            </Button>
            <Button
              type="button"
              variant={postType === 'audio' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setPostType('audio');
                onOpenChange(false);
                toast.info('Use the record button to create audio posts');
              }}
              className="flex items-center gap-2"
            >
              <Mic className="w-4 h-4" />
              Audio Post
            </Button>
          </div>

          {postType === 'text' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="title">Title (Optional)</Label>
                <Input
                  id="title"
                  placeholder="Give your post a title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Your Story *</Label>
                <Textarea
                  id="content"
                  placeholder="Share your thoughts, story, or experience..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  maxLength={10000}
                  rows={8}
                  disabled={isSubmitting}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  {content.length}/10000 characters
                </p>
              </div>
            </>
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
            <Button type="submit" disabled={isSubmitting || (postType === 'text' && !title.trim() && !content.trim())}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Posting...
                </>
              ) : (
                'Post'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

