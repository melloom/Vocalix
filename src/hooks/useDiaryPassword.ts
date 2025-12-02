import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { hashPassword, verifyPassword, generateSalt, arrayToBase64, base64ToArray } from '@/lib/diary-encryption';

interface DiaryPassword {
  profile_id: string;
  password_hash: string;
  salt: string;
  auth_type: 'password' | 'pin';
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  failed_attempts: number;
  locked_until: string | null;
  encrypted_hint: string | null;
  encrypted_recovery_questions: string | null;
  encrypted_recovery_answers: string | null;
  auto_lock_minutes: number;
  require_password_on_view: boolean;
  reset_token: string | null;
  reset_token_expires_at: string | null;
}

export function useDiaryPassword() {
  const [isLoading, setIsLoading] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const { toast } = useToast();

  /**
   * Check if diary password is set
   */
  const hasPassword = useCallback(async (): Promise<boolean> => {
    try {
      const profileId = localStorage.getItem('profileId');
      if (!profileId) return false;

      const { data, error } = await (supabase as any)
        .from('diary_passwords')
        .select('profile_id')
        .eq('profile_id', profileId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking password:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Error checking password:', error);
      return false;
    }
  }, []);

  /**
   * Get diary password info (without the actual password)
   */
  const getPasswordInfo = useCallback(async (): Promise<DiaryPassword | null> => {
    try {
      const profileId = localStorage.getItem('profileId');
      if (!profileId) return null;

      const { data, error } = await (supabase as any)
        .from('diary_passwords')
        .select('*')
        .eq('profile_id', profileId)
        .maybeSingle();

      if (error) {
        console.error('Error getting password info:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error getting password info:', error);
      return null;
    }
  }, []);

  /**
   * Set or update diary password or PIN
   */
  const setPassword = useCallback(async (
    password: string,
    hint?: string,
    authType: 'password' | 'pin' = 'password',
    recoveryQuestions?: { question: string; answer: string }[]
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      const profileId = localStorage.getItem('profileId');
      if (!profileId) {
        toast({
          title: 'Error',
          description: 'Please log in to set a diary password.',
          variant: 'destructive',
        });
        return false;
      }

      // Generate salt
      const salt = generateSalt();
      const saltBase64 = arrayToBase64(salt);

      // Hash password
      const passwordHash = await hashPassword(password, salt);

      // Validate PIN (must be 4-6 digits)
      if (authType === 'pin') {
        if (!/^\d{4,6}$/.test(password)) {
          toast({
            title: 'Invalid PIN',
            description: 'PIN must be 4-6 digits.',
            variant: 'destructive',
          });
          return false;
        }
      }

      // Encrypt hint if provided
      let encryptedHint: string | null = null;
      if (hint) {
        const hintData = new TextEncoder().encode(hint);
        encryptedHint = arrayToBase64(hintData);
      }

      // Encrypt recovery questions if provided
      let encryptedRecoveryQuestions: string | null = null;
      let encryptedRecoveryAnswers: string | null = null;
      if (recoveryQuestions && recoveryQuestions.length > 0) {
        const questionsJson = JSON.stringify(recoveryQuestions.map(q => q.question));
        encryptedRecoveryQuestions = arrayToBase64(new TextEncoder().encode(questionsJson));
        
        // Hash answers (don't encrypt, just hash for verification)
        const answersHash = await hashPassword(
          recoveryQuestions.map(q => q.answer.toLowerCase().trim()).join('|'),
          salt
        );
        encryptedRecoveryAnswers = answersHash;
      }

      // Upsert password/PIN
      const { error } = await (supabase as any)
        .from('diary_passwords')
        .upsert({
          profile_id: profileId,
          password_hash: passwordHash,
          salt: saltBase64,
          auth_type: authType,
          encrypted_hint: encryptedHint,
          encrypted_recovery_questions: encryptedRecoveryQuestions,
          encrypted_recovery_answers: encryptedRecoveryAnswers,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'profile_id',
        });

      if (error) {
        console.error('Error setting password:', error);
        toast({
          title: 'Error',
          description: 'Failed to set diary password.',
          variant: 'destructive',
        });
        return false;
      }

      toast({
        title: 'Success',
        description: `Diary ${authType === 'pin' ? 'PIN' : 'password'} set successfully.`,
      });

      return true;
    } catch (error) {
      console.error('Error setting password:', error);
      toast({
        title: 'Error',
        description: 'Failed to set diary password.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  /**
   * Generate password reset token
   */
  const generateResetToken = useCallback(async (): Promise<string | null> => {
    try {
      const profileId = localStorage.getItem('profileId');
      if (!profileId) return null;

      const { data, error } = await (supabase as any).rpc('generate_diary_reset_token', {
        p_profile_id: profileId,
      });

      if (error) throw error;
      return data || null;
    } catch (error) {
      console.error('Error generating reset token:', error);
      return null;
    }
  }, []);

  /**
   * Reset password using token
   */
  const resetPassword = useCallback(async (
    token: string,
    newPassword: string,
    authType: 'password' | 'pin' = 'password'
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      const profileId = localStorage.getItem('profileId');
      if (!profileId) return false;

      // Verify token
      const { data: isValid, error: verifyError } = await (supabase as any).rpc('verify_diary_reset_token', {
        p_profile_id: profileId,
        p_token: token,
      });

      if (verifyError || !isValid) {
        toast({
          title: 'Invalid Token',
          description: 'Reset token is invalid or expired.',
          variant: 'destructive',
        });
        return false;
      }

      // Set new password
      return await setPassword(newPassword, undefined, authType);
    } catch (error) {
      console.error('Error resetting password:', error);
      toast({
        title: 'Error',
        description: 'Failed to reset password.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [setPassword, toast]);

  /**
   * Verify password/PIN and unlock diary
   */
  const unlockDiary = useCallback(async (password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const profileId = localStorage.getItem('profileId');
      if (!profileId) {
        toast({
          title: 'Error',
          description: 'Please log in to unlock your diary.',
          variant: 'destructive',
        });
        return false;
      }

      // Get password info
      const passwordInfo = await getPasswordInfo();
      if (!passwordInfo) {
        toast({
          title: 'Error',
          description: 'No diary password set. Please set a password first.',
          variant: 'destructive',
        });
        return false;
      }

      // Check if locked
      if (passwordInfo.locked_until) {
        const lockedUntil = new Date(passwordInfo.locked_until);
        if (lockedUntil > new Date()) {
          const minutesLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
          toast({
            title: 'Diary Locked',
            description: `Too many failed attempts. Try again in ${minutesLeft} minute(s).`,
            variant: 'destructive',
          });
          return false;
        }
      }

      // Normalize input based on auth type
      const normalizedPassword = passwordInfo.auth_type === 'pin' 
        ? password.replace(/\D/g, '') // Remove non-digits for PIN
        : password;
      
      // Verify password/PIN
      const salt = base64ToArray(passwordInfo.salt);
      const isValid = await verifyPassword(normalizedPassword, salt, passwordInfo.password_hash);

      if (!isValid) {
        // Increment failed attempts
        const newFailedAttempts = (passwordInfo.failed_attempts || 0) + 1;
        let lockedUntil: string | null = null;

        // Lock after 5 failed attempts for 30 minutes
        if (newFailedAttempts >= 5) {
          const lockDate = new Date();
          lockDate.setMinutes(lockDate.getMinutes() + 30);
          lockedUntil = lockDate.toISOString();
        }

        await (supabase as any)
          .from('diary_passwords')
          .update({
            failed_attempts: newFailedAttempts,
            locked_until: lockedUntil,
          })
          .eq('profile_id', profileId);

        toast({
          title: 'Incorrect Password',
          description: newFailedAttempts >= 5
            ? 'Too many failed attempts. Diary locked for 30 minutes.'
            : `Incorrect password. ${5 - newFailedAttempts} attempts remaining.`,
          variant: 'destructive',
        });
        return false;
      }

      // Reset failed attempts and unlock
      await (supabase as any)
        .from('diary_passwords')
        .update({
          failed_attempts: 0,
          locked_until: null,
          last_accessed_at: new Date().toISOString(),
        })
        .eq('profile_id', profileId);

      // Set unlock state
      setIsUnlocked(true);
      const autoLockMinutes = passwordInfo.auto_lock_minutes || 30;
      const unlockUntilDate = new Date();
      unlockUntilDate.setMinutes(unlockUntilDate.getMinutes() + autoLockMinutes);
      setUnlockUntil(unlockUntilDate);

      // Store unlock state in sessionStorage (cleared on tab close)
      sessionStorage.setItem('diaryUnlocked', 'true');
      sessionStorage.setItem('diaryUnlockUntil', unlockUntilDate.toISOString());
      sessionStorage.setItem('diaryPassword', normalizedPassword); // Store password/PIN temporarily for encryption

      return true;
    } catch (error) {
      console.error('Error unlocking diary:', error);
      toast({
        title: 'Error',
        description: 'Failed to unlock diary.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [getPasswordInfo, toast]);

  /**
   * Lock diary
   */
  const lockDiary = useCallback(() => {
    setIsUnlocked(false);
    setUnlockUntil(null);
    sessionStorage.removeItem('diaryUnlocked');
    sessionStorage.removeItem('diaryUnlockUntil');
    sessionStorage.removeItem('diaryPassword');
  }, []);

  /**
   * Check if diary is currently unlocked
   */
  const checkUnlockStatus = useCallback((): boolean => {
    const unlocked = sessionStorage.getItem('diaryUnlocked') === 'true';
    const unlockUntilStr = sessionStorage.getItem('diaryUnlockUntil');
    
    if (!unlocked || !unlockUntilStr) {
      return false;
    }

    const unlockUntil = new Date(unlockUntilStr);
    if (unlockUntil <= new Date()) {
      lockDiary();
      return false;
    }

    setIsUnlocked(true);
    setUnlockUntil(unlockUntil);
    return true;
  }, [lockDiary]);

  /**
   * Get stored password for encryption (from sessionStorage)
   */
  const getStoredPassword = useCallback((): string | null => {
    return sessionStorage.getItem('diaryPassword');
  }, []);

  /**
   * Get salt for encryption
   */
  const getSalt = useCallback(async (): Promise<Uint8Array | null> => {
    const passwordInfo = await getPasswordInfo();
    if (!passwordInfo) return null;
    return base64ToArray(passwordInfo.salt);
  }, [getPasswordInfo]);

  return {
    hasPassword,
    getPasswordInfo,
    setPassword,
    unlockDiary,
    lockDiary,
    checkUnlockStatus,
    getStoredPassword,
    getSalt,
    generateResetToken,
    resetPassword,
    isUnlocked,
    isLoading,
  };
}

