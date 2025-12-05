import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useDeviceId } from './useDeviceId';
import { getOrRegisterPseudoId } from '@/lib/pseudoId';

const ANIMAL_EMOJIS = ['🦊', '🐻', '🐼', '🦁', '🐯', '🐨', '🐰', '🦝', '🦦', '🦘'];
const ADJECTIVES = ['Calm', 'Happy', 'Gentle', 'Bright', 'Peaceful', 'Cheerful', 'Cozy', 'Warm'];

type ProfileRow = Tables<'profiles'>;

const generateHandle = () => {
  const emoji = ANIMAL_EMOJIS[Math.floor(Math.random() * ANIMAL_EMOJIS.length)];
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${emoji.codePointAt(0)?.toString(36).toUpperCase()}${num}`;
};

export const useProfile = () => {
  const deviceId = useDeviceId();
  const queryClient = useQueryClient();

  const {
    data: profile,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['profile', deviceId],
    queryFn: async () => {
      if (!deviceId) return null;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (error) throw error;
      return data as ProfileRow | null;
    },
    enabled: !!deviceId,
  });

  const createProfile = useMutation({
    mutationFn: async (emojiAvatar?: string) => {
      if (!deviceId) throw new Error('No device ID');

      // Get or register pseudo_id
      const pseudoId = await getOrRegisterPseudoId();

      const handle = generateHandle();
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          device_id: deviceId,
          pseudo_id: pseudoId || undefined, // Include pseudo_id if available
          handle,
          emoji_avatar: emojiAvatar || ANIMAL_EMOJIS[Math.floor(Math.random() * ANIMAL_EMOJIS.length)],
        } satisfies TablesInsert<'profiles'>)
        .select()
        .single();

      if (error) throw error;
      return data as ProfileRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', deviceId] });
    },
  });

  const updateProfile = useMutation({
    mutationFn: async (updates: TablesUpdate<'profiles'>) => {
      if (!deviceId) throw new Error('No device ID');

      // Use rate-limited profile update function for security
      // Convert updates to JSONB format expected by the function
      const updatesJsonb: Record<string, any> = {};
      
      if (updates.emoji_avatar !== undefined) {
        updatesJsonb.emoji_avatar = updates.emoji_avatar;
      }
      if (updates.bio !== undefined) {
        updatesJsonb.bio = updates.bio;
      }
      if (updates.default_captions !== undefined) {
        updatesJsonb.default_captions = updates.default_captions;
      }
      if (updates.profile_picture_url !== undefined) {
        updatesJsonb.profile_picture_url = updates.profile_picture_url;
      }
      if (updates.cover_image_url !== undefined) {
        updatesJsonb.cover_image_url = updates.cover_image_url;
      }
      if (updates.color_scheme !== undefined) {
        updatesJsonb.color_scheme = updates.color_scheme;
      }

      // If only handle is being updated, use change_pseudonym function instead
      if (updates.handle !== undefined && Object.keys(updatesJsonb).length === 0) {
        const { data, error } = await supabase
          .rpc('change_pseudonym', { new_handle: updates.handle });

        if (error) throw error;
        if (!data) throw new Error('Profile not found');

        // Refetch profile to get updated data
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('device_id', deviceId)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!profileData) throw new Error('Profile not found');

        return profileData as ProfileRow;
      }

      // Use rate-limited update function for other fields
      if (Object.keys(updatesJsonb).length > 0) {
        const { data, error } = await supabase
          .rpc('update_profile_with_rate_limit', { p_updates: updatesJsonb });

        if (error) throw error;
        if (!data) throw new Error('Profile not found');

        return data as ProfileRow;
      }

      // Fallback to direct update if no rate-limited fields are being updated
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('device_id', deviceId)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Profile not found');

      return data as ProfileRow;
    },
    onSuccess: (data) => {
      // Update the cache for this specific query
      queryClient.setQueryData(['profile', deviceId], data);
      // Invalidate all profile queries so other components (like AuthContext, Profile page) refetch
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  return {
    profile,
    isLoading,
    error,
    createProfile: createProfile.mutate,
    isCreating: createProfile.isPending,
    updateProfile: updateProfile.mutateAsync,
    isUpdating: updateProfile.isPending,
    updateError: updateProfile.error ?? null,
    refetch,
  };
};
