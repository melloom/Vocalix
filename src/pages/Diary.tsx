import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useDiaryPassword } from '@/hooks/useDiaryPassword';
import {
  encryptDiaryEntry,
  decryptDiaryEntry,
  calculateWordCount,
} from '@/lib/diary-encryption';
import { supabase } from '@/integrations/supabase/client';
import {
  Lock,
  Plus,
  Edit,
  Trash2,
  Star,
  StarOff,
  Pin,
  PinOff,
  BookOpen,
  Calendar,
  Search,
  Download,
  Settings,
  Key,
  KeyRound,
  RefreshCw,
  Grid3x3,
  List,
  FileText,
  Palette,
  Shield,
  Clock,
  TrendingUp,
  Heart,
  Sparkles,
  X,
  Check,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DiaryEntry {
  id: string;
  profile_id: string;
  encrypted_content: string;
  encrypted_title?: string | null;
  encrypted_tags?: string | null;
  encrypted_mood?: string | null;
  created_at: string;
  updated_at: string;
  word_count: number;
  is_favorite: boolean;
  is_pinned: boolean;
  deleted_at?: string | null;
}

interface DecryptedEntry {
  id: string;
  content: string;
  title?: string;
  tags?: string[];
  mood?: string;
  created_at: string;
  updated_at: string;
  word_count: number;
  is_favorite: boolean;
  is_pinned: boolean;
}

type ViewMode = 'list' | 'grid' | 'calendar';
type Theme = 'default' | 'warm' | 'cool' | 'dark';

export default function Diary() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    hasPassword: checkHasPassword,
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
    isLoading: passwordLoading,
  } = useDiaryPassword();

  const [isCheckingPassword, setIsCheckingPassword] = useState(true);
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
  const [authType, setAuthType] = useState<'password' | 'pin'>('password');
  const [resetToken, setResetToken] = useState('');
  const [showResetTokenInput, setShowResetTokenInput] = useState(false);

  const [decryptedEntries, setDecryptedEntries] = useState<DecryptedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<DecryptedEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState('');
  const [editMood, setEditMood] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [theme, setTheme] = useState<Theme>('default');
  const [stats, setStats] = useState<any>(null);

  // Check if password exists and unlock status
  useEffect(() => {
    const checkPassword = async () => {
      setIsCheckingPassword(true);
      const hasPwd = await checkHasPassword();

      if (hasPwd) {
        const passwordInfo = await getPasswordInfo();
        if (passwordInfo) {
          setAuthType(passwordInfo.auth_type);
        }
        const isUnlocked = checkUnlockStatus();
        if (!isUnlocked) {
          setShowUnlockDialog(true);
        }
      } else {
        setShowPasswordSetup(true);
      }
      setIsCheckingPassword(false);
    };

    checkPassword();
  }, [checkHasPassword, getPasswordInfo, checkUnlockStatus]);

  // Load entries when unlocked
  const loadEntries = useCallback(async () => {
    if (!isUnlocked) return;

    setIsLoading(true);
    try {
      const profileId = localStorage.getItem('profileId');
      if (!profileId) return;

      const { data, error } = await (supabase as any)
        .from('diary_entries')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const entriesData = (data || []) as DiaryEntry[];

      // Decrypt entries
      const password = getStoredPassword();
      const salt = await getSalt();
      if (!password || !salt) {
        toast({
          title: 'Error',
          description: 'Unable to decrypt entries. Please unlock your diary again.',
          variant: 'destructive',
        });
        return;
      }

      const decrypted = await Promise.all(
        entriesData.map(async (entry: DiaryEntry) => {
          try {
            const decrypted = await decryptDiaryEntry(entry, password, salt);
            return {
              ...decrypted,
              id: entry.id,
              created_at: entry.created_at,
              updated_at: entry.updated_at,
              word_count: entry.word_count,
              is_favorite: entry.is_favorite,
              is_pinned: entry.is_pinned,
            };
          } catch (error) {
            console.error('Failed to decrypt entry:', error);
            return null;
          }
        })
      );

      setDecryptedEntries(decrypted.filter((e): e is DecryptedEntry => e !== null));

      // Load statistics
      const { data: statsData } = await (supabase as any)
        .from('diary_statistics')
        .select('*')
        .eq('profile_id', profileId)
        .maybeSingle();
      
      setStats(statsData);
    } catch (error) {
      console.error('Error loading entries:', error);
      toast({
        title: 'Error',
        description: 'Failed to load diary entries.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [isUnlocked, getStoredPassword, getSalt, toast]);

  useEffect(() => {
    if (isUnlocked) {
      loadEntries();
    }
  }, [isUnlocked, loadEntries]);

  // Handle password setup
  const handleSetPassword = async () => {
    if (authType === 'pin') {
      if (!/^\d{4,6}$/.test(newPassword)) {
        toast({
          title: 'Invalid PIN',
          description: 'PIN must be 4-6 digits.',
          variant: 'destructive',
        });
        return;
      }
    } else {
      if (newPassword.length < 6) {
        toast({
          title: 'Password too short',
          description: 'Password must be at least 6 characters.',
          variant: 'destructive',
        });
        return;
      }
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure both passwords match.',
        variant: 'destructive',
      });
      return;
    }

    const success = await setPassword(newPassword, passwordHint, authType);
    if (success) {
      setShowPasswordSetup(false);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordHint('');
      await unlockDiary(newPassword);
    }
  };

  // Handle unlock
  const handleUnlock = async () => {
    if (!passwordInput) {
      toast({
        title: 'Password required',
        description: `Please enter your diary ${authType === 'pin' ? 'PIN' : 'password'}.`,
        variant: 'destructive',
      });
      return;
    }

    const success = await unlockDiary(passwordInput);
    if (success) {
      setShowUnlockDialog(false);
      setPasswordInput('');
    }
  };

  // Handle password reset
  const handleRequestReset = async () => {
    const token = await generateResetToken();
    if (token) {
      setResetToken(token);
      setShowResetTokenInput(true);
      toast({
        title: 'Reset Token Generated',
        description: 'Use this token to reset your password. Token expires in 1 hour.',
      });
    }
  };

  const handleResetPassword = async () => {
    if (!resetToken || !newPassword) {
      toast({
        title: 'Missing information',
        description: 'Please enter the reset token and new password.',
        variant: 'destructive',
      });
      return;
    }

    if (authType === 'pin' && !/^\d{4,6}$/.test(newPassword)) {
      toast({
        title: 'Invalid PIN',
        description: 'PIN must be 4-6 digits.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure both passwords match.',
        variant: 'destructive',
      });
      return;
    }

    const success = await resetPassword(resetToken, newPassword, authType);
    if (success) {
      setShowPasswordReset(false);
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
      setShowResetTokenInput(false);
      await unlockDiary(newPassword);
    }
  };

  // Handle create new entry
  const handleCreateEntry = () => {
    setSelectedEntry(null);
    setIsEditing(true);
    setEditContent('');
    setEditTitle('');
    setEditTags([]);
    setEditTagInput('');
    setEditMood('');
  };

  // Handle save entry
  const handleSaveEntry = async () => {
    if (!editContent.trim()) {
      toast({
        title: 'Content required',
        description: 'Please write something in your diary entry.',
        variant: 'destructive',
      });
      return;
    }

    const password = getStoredPassword();
    const salt = await getSalt();
    if (!password || !salt) {
      toast({
        title: 'Error',
        description: 'Unable to encrypt entry. Please unlock your diary again.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const wordCount = calculateWordCount(editContent);
      const encrypted = await encryptDiaryEntry(
        {
          content: editContent,
          title: editTitle || undefined,
          tags: editTags.length > 0 ? editTags : undefined,
          mood: editMood || undefined,
        },
        password,
        salt
      );

      const profileId = localStorage.getItem('profileId');
      if (!profileId) return;

      if (selectedEntry) {
        const { error } = await (supabase as any)
          .from('diary_entries')
          .update({
            encrypted_content: encrypted.encryptedContent,
            encrypted_title: encrypted.encryptedTitle || null,
            encrypted_tags: encrypted.encryptedTags || null,
            encrypted_mood: encrypted.encryptedMood || null,
            word_count: wordCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', selectedEntry.id);

        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('diary_entries')
          .insert({
            profile_id: profileId,
            encrypted_content: encrypted.encryptedContent,
            encrypted_title: encrypted.encryptedTitle || null,
            encrypted_tags: encrypted.encryptedTags || null,
            encrypted_mood: encrypted.encryptedMood || null,
            word_count: wordCount,
          });

        if (error) throw error;
      }

      toast({
        title: 'Success',
        description: selectedEntry ? 'Entry updated successfully.' : 'Entry created successfully.',
      });

      setIsEditing(false);
      setSelectedEntry(null);
      setEditContent('');
      setEditTitle('');
      setEditTags([]);
      setEditTagInput('');
      setEditMood('');
      await loadEntries();
    } catch (error) {
      console.error('Error saving entry:', error);
      toast({
        title: 'Error',
        description: 'Failed to save entry.',
        variant: 'destructive',
      });
    }
  };

  // Handle delete entry
  const handleDeleteEntry = async () => {
    if (!entryToDelete) return;

    try {
      const { error } = await (supabase as any)
        .from('diary_entries')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', entryToDelete);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Entry deleted successfully.',
      });

      setShowDeleteDialog(false);
      setEntryToDelete(null);
      await loadEntries();
    } catch (error) {
      console.error('Error deleting entry:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete entry.',
        variant: 'destructive',
      });
    }
  };

  // Handle toggle favorite
  const handleToggleFavorite = async (entryId: string, currentValue: boolean) => {
    try {
      const { error } = await (supabase as any)
        .from('diary_entries')
        .update({ is_favorite: !currentValue })
        .eq('id', entryId);

      if (error) throw error;
      await loadEntries();
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  // Handle toggle pin
  const handleTogglePin = async (entryId: string, currentValue: boolean) => {
    try {
      const { error } = await (supabase as any)
        .from('diary_entries')
        .update({ is_pinned: !currentValue })
        .eq('id', entryId);

      if (error) throw error;
      await loadEntries();
    } catch (error) {
      console.error('Error toggling pin:', error);
    }
  };

  // Export entries
  const handleExport = async () => {
    try {
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        entries: decryptedEntries.map(entry => ({
          title: entry.title,
          content: entry.content,
          tags: entry.tags,
          mood: entry.mood,
          created_at: entry.created_at,
          updated_at: entry.updated_at,
          is_favorite: entry.is_favorite,
          is_pinned: entry.is_pinned,
        })),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diary-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Export Successful',
        description: 'Your diary entries have been exported.',
      });
    } catch (error) {
      console.error('Error exporting:', error);
      toast({
        title: 'Export Failed',
        description: 'Failed to export diary entries.',
        variant: 'destructive',
      });
    }
  };

  // Add tag
  const handleAddTag = () => {
    if (editTagInput.trim() && !editTags.includes(editTagInput.trim())) {
      setEditTags([...editTags, editTagInput.trim()]);
      setEditTagInput('');
    }
  };

  // Remove tag
  const handleRemoveTag = (tag: string) => {
    setEditTags(editTags.filter(t => t !== tag));
  };

  // Filter entries
  const filteredEntries = useMemo(() => {
    return decryptedEntries.filter((entry) => {
      if (showFavoritesOnly && !entry.is_favorite) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          entry.content.toLowerCase().includes(query) ||
          entry.title?.toLowerCase().includes(query) ||
          entry.tags?.some((tag) => tag.toLowerCase().includes(query)) ||
          entry.mood?.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [decryptedEntries, showFavoritesOnly, searchQuery]);

  // Get theme classes
  const getThemeClasses = () => {
    switch (theme) {
      case 'warm':
        return 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950';
      case 'cool':
        return 'bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950 dark:to-cyan-950';
      case 'dark':
        return 'bg-gradient-to-br from-gray-900 to-gray-800';
      default:
        return 'bg-background';
    }
  };

  if (isCheckingPassword || passwordLoading) {
    return (
      <div className={`min-h-screen ${getThemeClasses()} flex items-center justify-center`}>
        <div className="text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Loading diary...</p>
        </div>
      </div>
    );
  }

  // Password setup dialog
  if (showPasswordSetup) {
    return (
      <div className={`min-h-screen ${getThemeClasses()} flex items-center justify-center p-4`}>
        <Card className="w-full max-w-md p-6 space-y-4 shadow-2xl border-2">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto bg-gradient-to-br from-primary to-purple-600 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              Set Up Your Diary
            </h2>
            <p className="text-muted-foreground">
              Create a {authType === 'pin' ? 'PIN' : 'password'} to protect your diary entries. All entries are encrypted and only you can read them.
            </p>
          </div>

          <Tabs value={authType} onValueChange={(v) => setAuthType(v as 'password' | 'pin')} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="password">
                <Key className="w-4 h-4 mr-2" />
                Password
              </TabsTrigger>
              <TabsTrigger value="pin">
                <KeyRound className="w-4 h-4 mr-2" />
                PIN
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-4">
            <div>
              <Label htmlFor="new-password">
                {authType === 'pin' ? 'PIN (4-6 digits)' : 'Password (min 6 characters)'}
              </Label>
              <Input
                id="new-password"
                type={authType === 'pin' ? 'tel' : 'password'}
                value={newPassword}
                onChange={(e) => {
                  const value = authType === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value;
                  setNewPassword(value);
                }}
                placeholder={authType === 'pin' ? 'Enter 4-6 digit PIN' : 'Enter password'}
                className="mt-1"
                maxLength={authType === 'pin' ? 6 : undefined}
              />
            </div>

            <div>
              <Label htmlFor="confirm-password">Confirm {authType === 'pin' ? 'PIN' : 'Password'}</Label>
              <Input
                id="confirm-password"
                type={authType === 'pin' ? 'tel' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  const value = authType === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value;
                  setConfirmPassword(value);
                }}
                placeholder={`Confirm ${authType === 'pin' ? 'PIN' : 'password'}`}
                className="mt-1"
                maxLength={authType === 'pin' ? 6 : undefined}
              />
            </div>

            <div>
              <Label htmlFor="hint">Hint (Optional)</Label>
              <Input
                id="hint"
                type="text"
                value={passwordHint}
                onChange={(e) => setPasswordHint(e.target.value)}
                placeholder="A hint to help you remember"
                className="mt-1"
              />
            </div>

            <Button onClick={handleSetPassword} className="w-full" size="lg" disabled={!newPassword || !confirmPassword}>
              <Shield className="w-4 h-4 mr-2" />
              Set {authType === 'pin' ? 'PIN' : 'Password'}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Unlock dialog
  if (showUnlockDialog && !isUnlocked) {
    return (
      <div className={`min-h-screen ${getThemeClasses()} flex items-center justify-center p-4`}>
        <Card className="w-full max-w-md p-6 space-y-4 shadow-2xl border-2">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto bg-gradient-to-br from-primary to-purple-600 rounded-full flex items-center justify-center">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              Unlock Your Diary
            </h2>
            <p className="text-muted-foreground">
              Enter your {authType === 'pin' ? 'PIN' : 'password'} to access your encrypted diary entries.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="unlock-password">{authType === 'pin' ? 'PIN' : 'Password'}</Label>
              <Input
                id="unlock-password"
                type={authType === 'pin' ? 'tel' : 'password'}
                value={passwordInput}
                onChange={(e) => {
                  const value = authType === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value;
                  setPasswordInput(value);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                placeholder={`Enter your ${authType === 'pin' ? 'PIN' : 'password'}`}
                className="mt-1 text-center text-2xl tracking-widest"
                autoFocus
                maxLength={authType === 'pin' ? 6 : undefined}
              />
            </div>

            <Button onClick={handleUnlock} className="w-full" size="lg" disabled={!passwordInput}>
              <Lock className="w-4 h-4 mr-2" />
              Unlock Diary
            </Button>

            <Button
              variant="ghost"
              onClick={handleRequestReset}
              className="w-full text-sm"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Forgot {authType === 'pin' ? 'PIN' : 'Password'}?
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                lockDiary();
                navigate('/');
              }}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Main diary interface
  return (
    <div className={`min-h-screen ${getThemeClasses()} pb-24 transition-colors`}>
      {/* Enhanced Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-purple-600 rounded-xl flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                  My Diary
                </h1>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Sparkles className="w-3 h-3" />
                  {decryptedEntries.length} {decryptedEntries.length === 1 ? 'entry' : 'entries'}
                  {stats && (
                    <>
                      {' • '}
                      <TrendingUp className="w-3 h-3" />
                      {stats.entries_this_week || 0} this week
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Diary Settings</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {
                    setShowPasswordReset(true);
                    setShowResetTokenInput(false);
                  }}>
                    <Shield className="w-4 h-4 mr-2" />
                    Security Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExport}>
                    <Download className="w-4 h-4 mr-2" />
                    Export Entries
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowPasswordReset(true)}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reset Password
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    lockDiary();
                    navigate('/');
                  }}>
                    <Lock className="w-4 h-4 mr-2" />
                    Lock Diary
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={handleCreateEntry} size="lg" className="bg-gradient-to-r from-primary to-purple-600">
                <Plus className="w-4 h-4 mr-2" />
                New Entry
              </Button>
            </div>
          </div>

          {/* Enhanced Search and Filters */}
          <div className="flex gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search entries, tags, moods..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={showFavoritesOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              >
                {showFavoritesOnly ? <Star className="w-4 h-4 mr-2 fill-current" /> : <StarOff className="w-4 h-4 mr-2" />}
                Favorites
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Grid3x3 className="w-4 h-4 mr-2" />
                    {viewMode === 'list' ? 'List' : viewMode === 'grid' ? 'Grid' : 'Calendar'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setViewMode('list')}>
                    <List className="w-4 h-4 mr-2" />
                    List View
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setViewMode('grid')}>
                    <Grid3x3 className="w-4 h-4 mr-2" />
                    Grid View
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setViewMode('calendar')}>
                    <Calendar className="w-4 h-4 mr-2" />
                    Calendar View
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Palette className="w-4 h-4 mr-2" />
                    Theme
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setTheme('default')}>
                    Default
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('warm')}>
                    Warm
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('cool')}>
                    Cool
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('dark')}>
                    Dark
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Card className="p-4 bg-gradient-to-r from-primary/10 to-purple-600/10 border-primary/20">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">{stats.total_entries || 0}</div>
                <div className="text-xs text-muted-foreground">Total Entries</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{stats.total_words || 0}</div>
                <div className="text-xs text-muted-foreground">Total Words</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{stats.entries_this_week || 0}</div>
                <div className="text-xs text-muted-foreground">This Week</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{stats.entries_this_month || 0}</div>
                <div className="text-xs text-muted-foreground">This Month</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{stats.current_streak_days || 0}</div>
                <div className="text-xs text-muted-foreground">Day Streak</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Entries List/Grid */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading entries...</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <Card className="p-12 text-center border-2 border-dashed">
            <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">No entries yet</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || showFavoritesOnly
                ? 'No entries match your filters.'
                : 'Start writing your first diary entry!'}
            </p>
            {!searchQuery && !showFavoritesOnly && (
              <Button onClick={handleCreateEntry} size="lg" className="bg-gradient-to-r from-primary to-purple-600">
                <Plus className="w-4 h-4 mr-2" />
                Create First Entry
              </Button>
            )}
          </Card>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEntries.map((entry) => (
              <Card
                key={entry.id}
                className={`p-6 cursor-pointer hover:shadow-xl transition-all border-2 ${
                  entry.is_pinned ? 'border-l-4 border-l-primary' : ''
                } ${entry.is_favorite ? 'bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950 dark:to-amber-950' : ''}`}
                onClick={() => {
                  setSelectedEntry(entry);
                  setIsEditing(false);
                }}
              >
                {entry.is_pinned && (
                  <div className="flex justify-end mb-2">
                    <Pin className="w-4 h-4 text-primary fill-primary" />
                  </div>
                )}
                {entry.title && (
                  <h3 className="text-lg font-semibold mb-2 line-clamp-2">{entry.title}</h3>
                )}
                <p className="text-muted-foreground line-clamp-4 mb-4">{entry.content}</p>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{new Date(entry.created_at).toLocaleDateString()}</span>
                  <div className="flex gap-2">
                    {entry.is_favorite && <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />}
                    <span>{entry.word_count} words</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredEntries.map((entry) => (
              <Card
                key={entry.id}
                className={`p-6 cursor-pointer hover:shadow-xl transition-all border ${
                  entry.is_pinned ? 'border-l-2 border-l-primary/20' : ''
                } ${entry.is_favorite ? 'bg-gradient-to-br from-yellow-50/50 to-amber-50/50 dark:from-yellow-950/50 dark:to-amber-950/50' : ''}`}
                onClick={() => {
                  setSelectedEntry(entry);
                  setIsEditing(false);
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    {entry.title && (
                      <h3 className="text-xl font-semibold mb-2">{entry.title}</h3>
                    )}
                    <p className="text-muted-foreground line-clamp-3">{entry.content}</p>
                  </div>
                  <div className="flex gap-1 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(entry.id, entry.is_favorite);
                      }}
                    >
                      {entry.is_favorite ? (
                        <Star className="w-5 h-5 fill-yellow-500 text-yellow-500" />
                      ) : (
                        <StarOff className="w-5 h-5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePin(entry.id, entry.is_pinned);
                      }}
                    >
                      {entry.is_pinned ? (
                        <Pin className="w-5 h-5 fill-primary text-primary" />
                      ) : (
                        <PinOff className="w-5 h-5" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {new Date(entry.created_at).toLocaleDateString('en-US', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="w-4 h-4" />
                    {entry.word_count} words
                  </span>
                  {entry.mood && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      {entry.mood}
                    </Badge>
                  )}
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {entry.tags.map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Enhanced Edit/Create Entry Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">{selectedEntry ? 'Edit Entry' : 'New Entry'}</DialogTitle>
            <DialogDescription>
              Write your thoughts. Everything is encrypted and private.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="entry-title">Title (Optional)</Label>
              <Input
                id="entry-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Entry title..."
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="entry-content">Content</Label>
              <Textarea
                id="entry-content"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Write your thoughts here..."
                className="mt-1 min-h-[400px] font-sans text-base leading-relaxed"
              />
              <div className="text-xs text-muted-foreground mt-1">
                {calculateWordCount(editContent)} words
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="entry-mood">Mood (Optional)</Label>
                <Input
                  id="entry-mood"
                  value={editMood}
                  onChange={(e) => setEditMood(e.target.value)}
                  placeholder="How are you feeling?"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="entry-tags">Tags</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="entry-tags"
                    value={editTagInput}
                    onChange={(e) => setEditTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="Add tag..."
                  />
                  <Button type="button" onClick={handleAddTag} variant="outline">
                    Add
                  </Button>
                </div>
                {editTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {editTags.map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                        {tag}
                        <X
                          className="w-3 h-3 cursor-pointer"
                          onClick={() => handleRemoveTag(tag)}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEntry} className="bg-gradient-to-r from-primary to-purple-600">
              <Check className="w-4 h-4 mr-2" />
              Save Entry
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Entry Dialog */}
      <Dialog
        open={!!selectedEntry && !isEditing}
        onOpenChange={(open) => !open && setSelectedEntry(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedEntry && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{selectedEntry.title || 'Untitled Entry'}</DialogTitle>
                <DialogDescription className="flex items-center gap-4">
                  <span>{new Date(selectedEntry.created_at).toLocaleString()}</span>
                  {selectedEntry.updated_at !== selectedEntry.created_at && (
                    <span className="text-xs">Updated: {new Date(selectedEntry.updated_at).toLocaleString()}</span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {selectedEntry.mood && (
                  <div className="p-4 bg-gradient-to-r from-primary/10 to-purple-600/10 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2">
                      <Heart className="w-5 h-5 text-primary" />
                      <strong>Mood:</strong> {selectedEntry.mood}
                    </div>
                  </div>
                )}

                <div className="prose max-w-none dark:prose-invert">
                  <p className="whitespace-pre-wrap text-base leading-relaxed">{selectedEntry.content}</p>
                </div>

                {selectedEntry.tags && selectedEntry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-4 border-t">
                    {selectedEntry.tags.map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="text-sm">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-4 text-sm text-muted-foreground pt-4 border-t">
                  <span className="flex items-center gap-1">
                    <FileText className="w-4 h-4" />
                    {selectedEntry.word_count} words
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {Math.ceil((selectedEntry.content.length / 200))} min read
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditContent(selectedEntry.content);
                    setEditTitle(selectedEntry.title || '');
                    setEditTags(selectedEntry.tags || []);
                    setEditMood(selectedEntry.mood || '');
                    setIsEditing(true);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setEntryToDelete(selectedEntry.id);
                    setShowDeleteDialog(true);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={showPasswordReset} onOpenChange={setShowPasswordReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password/PIN</DialogTitle>
            <DialogDescription>
              Generate a reset token to change your diary {authType === 'pin' ? 'PIN' : 'password'}.
            </DialogDescription>
          </DialogHeader>

          {!showResetTokenInput ? (
            <div className="space-y-4">
              <Button onClick={handleRequestReset} className="w-full">
                <RefreshCw className="w-4 h-4 mr-2" />
                Generate Reset Token
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Reset Token</Label>
                <Input
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Enter reset token"
                  className="font-mono"
                />
              </div>
              <div>
                <Label>New {authType === 'pin' ? 'PIN' : 'Password'}</Label>
                <Input
                  type={authType === 'pin' ? 'tel' : 'password'}
                  value={newPassword}
                  onChange={(e) => {
                    const value = authType === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value;
                    setNewPassword(value);
                  }}
                  placeholder={`Enter new ${authType === 'pin' ? 'PIN' : 'password'}`}
                  maxLength={authType === 'pin' ? 6 : undefined}
                />
              </div>
              <div>
                <Label>Confirm {authType === 'pin' ? 'PIN' : 'Password'}</Label>
                <Input
                  type={authType === 'pin' ? 'tel' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    const value = authType === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value;
                    setConfirmPassword(value);
                  }}
                  placeholder={`Confirm new ${authType === 'pin' ? 'PIN' : 'password'}`}
                  maxLength={authType === 'pin' ? 6 : undefined}
                />
              </div>
              <Button onClick={handleResetPassword} className="w-full">
                Reset {authType === 'pin' ? 'PIN' : 'Password'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry} className="bg-destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
