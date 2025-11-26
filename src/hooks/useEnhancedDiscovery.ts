import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';
import { logError } from '@/lib/logger';

interface BecauseYouListenedToClip {
  clip_id: string;
  title: string | null;
  audio_path: string;
  duration_seconds: number;
  profile_id: string;
  profile_handle: string;
  profile_avatar: string;
  reason: string;
  similarity_score: number;
}

interface SimilarVoiceClip {
  clip_id: string;
  title: string | null;
  audio_path: string;
  duration_seconds: number;
  profile_id: string;
  profile_handle: string;
  profile_avatar: string;
  similarity_score: number;
  similarity_type: string;
}

export const useBecauseYouListenedTo = (limit: number = 10) => {
  const { profile } = useProfile();

  return useQuery({
    queryKey: ['because-you-listened-to', profile?.id, limit],
    queryFn: async () => {
      if (!profile?.id) return [];

      const { data, error } = await supabase.rpc('get_because_you_listened_to', {
        p_profile_id: profile.id,
        p_limit: limit,
      });

      if (error) {
        logError('Error fetching because you listened to', error);
        throw error;
      }

      return (data || []) as BecauseYouListenedToClip[];
    },
    enabled: !!profile?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useSimilarVoiceClips = (clipId: string | null, limit: number = 10) => {
  return useQuery({
    queryKey: ['similar-voice-clips', clipId, limit],
    queryFn: async () => {
      if (!clipId) return [];

      const { data, error } = await supabase.rpc('get_similar_voice_clips', {
        p_clip_id: clipId,
        p_limit: limit,
      });

      if (error) {
        logError('Error fetching similar voice clips', error);
        throw error;
      }

      return (data || []) as SimilarVoiceClip[];
    },
    enabled: !!clipId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

