import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useDeviceId } from './useDeviceId';

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

      const handle = generateHandle();
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          device_id: deviceId,
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
      queryClient.setQueryData(['profile', deviceId], data);
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
