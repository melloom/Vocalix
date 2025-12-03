import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { ArrowLeft, Download, Trash2, Copy, Mail, Share2, FileAudio, FileText, CloudUpload, Ban, UserMinus, Search as SearchIcon, Compass, UserCheck, X, Settings as SettingsIcon, Bell, Play, Shield, User, Headphones, Volume2, Users, HelpCircle, Scale, Cookie, Copyright } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CityOptInDialog } from "@/components/CityOptInDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AccessibilitySettings } from "@/components/AccessibilitySettings";
import { useProfile } from "@/hooks/useProfile";
import { useDevices } from "@/hooks/useDevices";
import { useBlockedUsers, useBlock } from "@/hooks/useBlock";
import { useSessions } from "@/hooks/useSessions";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { logError, logWarn } from "@/lib/logger";
import { ensureScrollEnabled } from "@/utils/scrollRestore";
import { stopSessionMonitoring } from "@/lib/sessionManagement";
import JSZip from "jszip";
import { Smartphone, Monitor, Tablet, AlertTriangle, CheckCircle2, GraduationCap, RefreshCw, WifiOff, HardDrive, QrCode, Link as LinkIcon, Key, Clock, Lock, Activity, Bug, AlertCircle, Sparkles, MessageSquare } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { formatDistanceToNow } from "date-fns";
import { useOfflineDownloads } from "@/hooks/useOfflineDownloads";
import { formatFileSize } from "@/utils/offlineStorage";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import { VoiceCloningConsentManagement } from "@/components/VoiceCloningConsentManagement";
import { Slider } from "@/components/ui/slider";
import { OnboardingProgress, useOnboardingProgress } from "@/components/OnboardingProgress";
import { PersonalizationPreferences } from "@/components/PersonalizationPreferences";
import { FeedCustomizationSettings } from "@/components/FeedCustomizationSettings";
import { MuteBlockSettings } from "@/components/MuteBlockSettings";
import { ProfilePictureUpload } from "@/components/ProfilePictureUpload";
import { AvatarSelector } from "@/components/AvatarSelector";
import { CoverImageUpload } from "@/components/CoverImageUpload";
import { ColorSchemePicker } from "@/components/ColorSchemePicker";
import { ProfileBioEditor } from "@/components/ProfileBioEditor";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileMenu } from "@/components/MobileMenu";
import { FeedbackDialog } from "@/components/FeedbackDialog";

const CHANGE_WINDOW_DAYS = 7;

// Component for individual blocked user item
const BlockedUserItem = ({ block, onUnblock }: { block: any; onUnblock: () => void }) => {
  const { toggleBlock, isUnblocking } = useBlock(block.blocked_id);

  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{block.profile?.emoji_avatar || '👤'}</span>
        <div>
          <p className="font-medium">u/{block.profile?.handle || 'Unknown'}</p>
          <p className="text-xs text-muted-foreground">
            Blocked {formatDistanceToNow(new Date(block.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await toggleBlock();
            toast.success("User unblocked");
            onUnblock();
          } catch (error: any) {
            toast.error(error.message || "Failed to unblock user");
          }
        }}
        disabled={isUnblocking}
        className="rounded-xl"
      >
        <UserMinus className="h-4 w-4 mr-2" />
        {isUnblocking ? "Unblocking..." : "Unblock"}
      </Button>
    </div>
  );
};

const Settings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile, isLoading, updateProfile, isUpdating, refetch } = useProfile();
  const { deviceId, profileId } = useAuth();

  // Ensure scrolling is enabled on Settings page mount
  // BUT: Don't override scroll lock if tutorial is active
  useEffect(() => {
    const isTutorialActive = () => {
      // Check if tutorial overlay is present
      return !!document.querySelector('[data-tutorial-active="true"]');
    };

    const enableScroll = () => {
      // Don't enable scroll if tutorial is active
      if (isTutorialActive()) {
        return;
      }

      // Use the utility function
      ensureScrollEnabled();
      
      // Additional aggressive fixes
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.position = '';
      document.documentElement.style.height = '';
      
      // Force enable scrolling via CSS classes
      document.body.classList.remove('overflow-hidden');
      document.documentElement.classList.remove('overflow-hidden');
      
      // Ensure the main container can scroll
      const mainContainer = document.querySelector('[class*="min-h-screen"]');
      if (mainContainer) {
        (mainContainer as HTMLElement).style.overflow = '';
        (mainContainer as HTMLElement).style.position = '';
      }
    };
    
    // Enable scroll immediately (only if tutorial not active)
    if (!isTutorialActive()) {
      enableScroll();
    }
    
    // Also enable scroll after delays to catch any delayed locks
    const timeouts = [
      setTimeout(enableScroll, 50),
      setTimeout(enableScroll, 100),
      setTimeout(enableScroll, 300),
      setTimeout(enableScroll, 500),
    ];
    
    // Periodically check and restore scroll (every 1.5 seconds)
    // But skip if tutorial is active
    const interval = setInterval(() => {
      if (!isTutorialActive()) {
        enableScroll();
      }
    }, 1500);
    
    return () => {
      timeouts.forEach(clearTimeout);
      clearInterval(interval);
    };
  }, []); // Run on mount only

  // Listen for color scheme updates and trigger shake animation
  useEffect(() => {
    const handleColorSchemeUpdate = () => {
      setShouldShake(true);
      // Reset shake after animation completes
      setTimeout(() => {
        setShouldShake(false);
      }, 500);
    };
    
    window.addEventListener("colorSchemeUpdated", handleColorSchemeUpdate);
    
    return () => {
      window.removeEventListener("colorSchemeUpdated", handleColorSchemeUpdate);
    };
  }, []);
  const { devices, isLoading: isLoadingDevices, revokeDevice, isRevoking, clearSuspiciousFlag, isClearingSuspicious, unrevokeDevice, isUnrevoking: isUnrevokingDevice, refetch: refetchDevices, error: devicesError } = useDevices();
  const { blockedUsers, isLoading: isLoadingBlockedUsers, refetch: refetchBlockedUsers } = useBlockedUsers();
  const { sessions, revokedSessions, isLoading: isLoadingSessions, isLoadingRevoked: isLoadingRevokedSessions, revokeSession, isRevoking: isRevokingSession, revokeAllSessions, isRevokingAll: isRevokingAllSessions, unrevokeSession, isUnrevoking: isUnrevokingSession, refetch: refetchSessions, refetchRevoked: refetchRevokedSessions } = useSessions();
  // Safely get push notification state with defaults
  const pushNotifications = usePushNotifications();
  const isPushSupported = pushNotifications?.isSupported ?? false;
  const isPushEnabled = pushNotifications?.isEnabled ?? false;
  const pushPermission = pushNotifications?.permission ?? 'default';
  const requestPermission = pushNotifications?.requestPermission ?? (() => Promise.resolve(false));

  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [isCityDialogOpen, setIsCityDialogOpen] = useState(false);
  const [cityTagEnabled, setCityTagEnabled] = useState(false);
  const [autoplayNextEnabled, setAutoplayNextEnabled] = useState(true);
  const [tapToRecordEnabled, setTapToRecordEnabled] = useState(false);
  const [topicAlertsEnabled, setTopicAlertsEnabled] = useState(true);
  const [matureFilterEnabled, setMatureFilterEnabled] = useState(true);
  const [show18PlusContent, setShow18PlusContent] = useState(false);
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestFrequency, setDigestFrequency] = useState<'never' | 'daily' | 'weekly'>('daily');
  const [digestStyle, setDigestStyle] = useState<'quiet' | 'normal' | 'energizing'>('normal');
  const [digestEmail, setDigestEmail] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [isRecoveryEmailDialogOpen, setIsRecoveryEmailDialogOpen] = useState(false);
  const [pendingRecoveryEmail, setPendingRecoveryEmail] = useState("");
  const [isSavingRecoveryEmail, setIsSavingRecoveryEmail] = useState(false);
  const [hasAcceptedRecoveryWarning, setHasAcceptedRecoveryWarning] = useState(false);
  const [isHandleDialogOpen, setIsHandleDialogOpen] = useState(false);
  const [pendingHandle, setPendingHandle] = useState("");
  const [isSavingHandle, setIsSavingHandle] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const [keepContentOnDelete, setKeepContentOnDelete] = useState(false);
  const [isMagicLinkDialogOpen, setIsMagicLinkDialogOpen] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkUrl, setMagicLinkUrl] = useState<string | null>(null);
  const [magicLinkExpiresAt, setMagicLinkExpiresAt] = useState<string | null>(null);
  const [magicLinkToken, setMagicLinkToken] = useState<string | null>(null);
  const [magicLinkType, setMagicLinkType] = useState<"standard" | "extended" | "one_time">("standard");
  const [isGeneratingMagicLink, setIsGeneratingMagicLink] = useState(false);
  const [activeLinks, setActiveLinks] = useState<Array<{
    id: string;
    url: string;
    token: string;
    expiresAt: string;
    linkType: string;
    createdAt: string;
    email?: string | null;
    isActive: boolean;
    fromDatabase?: boolean;
  }>>([]);
  const [isLoadingActiveLinks, setIsLoadingActiveLinks] = useState(false);
  const [showQRCode, setShowQRCode] = useState(true); // Show QR code by default for easy sharing
  const [showSiteQRCode, setShowSiteQRCode] = useState(false); // QR code for current site URL
  const [accountLinkPin, setAccountLinkPin] = useState<string | null>(null);
  const [pinExpiresAt, setPinExpiresAt] = useState<Date | null>(null);
  const [shouldShake, setShouldShake] = useState(false);
  const [isGeneratingPin, setIsGeneratingPin] = useState(false);
  const [pinDurationMinutes, setPinDurationMinutes] = useState(10);
  const [pinLinkingEnabled, setPinLinkingEnabled] = useState(true); // Toggle for PIN linking
  const [phoneQRCodeUrl, setPhoneQRCodeUrl] = useState<string | null>(null);
  const [isGeneratingPhoneQR, setIsGeneratingPhoneQR] = useState(false);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [deviceAccessTab, setDeviceAccessTab] = useState<"linking" | "login">("linking");
  const [sessionsTab, setSessionsTab] = useState<"active" | "revoked">("active");
  const [devicesTab, setDevicesTab] = useState<"active" | "revoked">("active");
  const [isPrivateAccount, setIsPrivateAccount] = useState(false);
  const [hideFromSearch, setHideFromSearch] = useState(false);
  const [hideFromDiscovery, setHideFromDiscovery] = useState(false);
  const [requireApprovalToFollow, setRequireApprovalToFollow] = useState(false);
  const { isAdmin } = useAdminStatus();
  const isMobile = useIsMobile();
  const emailSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [isExportingAudio, setIsExportingAudio] = useState(false);
  const [downloadedClipsList, setDownloadedClipsList] = useState<any[]>([]);
  const [isLoadingDownloads, setIsLoadingDownloads] = useState(false);
  const { getAllDownloadedClips, deleteDownloadedClip, clearAll, storageUsedFormatted } = useOfflineDownloads();
  const [voiceCloningEnabled, setVoiceCloningEnabled] = useState(false);
  const [hasVoiceModel, setHasVoiceModel] = useState(false);
  const [isCreatingVoiceClone, setIsCreatingVoiceClone] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(true);
  const [allowVoiceCloning, setAllowVoiceCloning] = useState(false);
  const [voiceCloningAutoApprove, setVoiceCloningAutoApprove] = useState(false);
  const [voiceCloningRevenueShare, setVoiceCloningRevenueShare] = useState(20);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabFromUrl || "general");
  
  // Check if tutorial is active and on account-linking step
  const [isAccountLinkingTutorialActive, setIsAccountLinkingTutorialActive] = useState(false);
  
  useEffect(() => {
    const checkTutorialState = () => {
      // Check if tutorial is active (not completed)
      const tutorialCompleted = localStorage.getItem("echo_garden_tutorial_completed");
      if (tutorialCompleted === "true") {
        setIsAccountLinkingTutorialActive(false);
        return;
      }
      
      // Check if we're on Settings page and tutorial overlay exists
      // Look for the Account tab with data-tutorial attribute being highlighted
      const accountTab = document.querySelector('[data-tutorial="settings-account-tab"]');
      const tutorialOverlay = document.querySelector('[class*="z-[100000]"]');
      
      // If tutorial overlay is visible and Account tab exists, we're likely on account-linking step
      if (tutorialOverlay && accountTab) {
        setIsAccountLinkingTutorialActive(true);
      } else {
        setIsAccountLinkingTutorialActive(false);
      }
    };
    
    // Check immediately
    checkTutorialState();
    
    // Check periodically in case tutorial state changes
    const interval = setInterval(checkTutorialState, 500);
    
    // Also listen for tutorial events
    const handleTutorialChange = () => {
      setTimeout(checkTutorialState, 100);
    };
    
    window.addEventListener("storage", handleTutorialChange);
    window.addEventListener("tutorial-completed", handleTutorialChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleTutorialChange);
      window.removeEventListener("tutorial-completed", handleTutorialChange);
    };
  }, []);

  // Update tab when URL param changes - ensure "general" is default
  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    } else if (!tabFromUrl) {
      // Default to "general" and update URL
      setActiveTab("general");
      setSearchParams({ tab: "general" }, { replace: true });
    }
  }, [tabFromUrl]);

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    // Prevent tab change if tutorial is active and trying to change away from account tab
    if (isAccountLinkingTutorialActive && value !== "account") {
      return;
    }
    
    setActiveTab(value);
    setSearchParams({ tab: value });
    
    // Enable scroll when tab changes
    ensureScrollEnabled();
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.documentElement.style.overflow = '';
  };

  // Ensure scrolling when tab changes
  useEffect(() => {
    ensureScrollEnabled();
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.documentElement.style.overflow = '';
  }, [activeTab]);

  // Get tab label for mobile dropdown
  const getTabLabel = (tab: string) => {
    const labels: Record<string, string> = {
      general: "General",
      playback: "Playback",
      notifications: "Notifications",
      privacy: "Privacy",
      profile: "Profile",
      account: "Account",
      security: "Security",
      downloads: "Downloads",
      accessibility: "Accessibility",
      voice: "Voice",
      help: "Help & Support",
    };
    return labels[tab] || tab;
  };

  // Auto-update device user_agent when Settings page loads
  useEffect(() => {
    const updateDeviceInfo = async () => {
      if (!deviceId) return;
      
      const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
      if (userAgent && userAgent !== "unknown") {
        try {
          // Try direct update first (most reliable)
          // @ts-ignore - user_agent column exists but not in generated types
          const { error: directError } = await supabase
            .from("devices")
            // @ts-ignore
            .update({
              user_agent: userAgent,
              last_seen_at: new Date().toISOString(),
            })
            .eq("device_id", deviceId);
          
          if (directError) {
            console.warn("Direct update failed, trying RPC function:", directError);
            // Fallback to RPC function
            const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
            const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
            await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_current_device_user_agent`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "x-device-id": deviceId,
              },
              body: JSON.stringify({ p_user_agent: userAgent }),
            });
          } else {
            console.log("✅ Direct update successful:", userAgent.substring(0, 50));
          }
          
          // Refetch devices after a short delay to show updated info
          setTimeout(() => {
            refetchDevices();
          }, 500);
        } catch (error) {
          // Log error for debugging
          console.warn("Failed to auto-update device user_agent:", error);
        }
      }
    };
    
    updateDeviceInfo();
  }, [deviceId, refetchDevices]);
  
  const [isExportingTranscripts, setIsExportingTranscripts] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  useEffect(() => {
    if (profile) {
      setCaptionsEnabled(profile.default_captions);
      setPendingHandle(profile.handle);
      setCityTagEnabled(profile.consent_city);
      setAutoplayNextEnabled(profile.autoplay_next_clip);
      setTapToRecordEnabled(profile.tap_to_record ?? false);
      setTopicAlertsEnabled(profile.notify_new_topics);
      setMatureFilterEnabled(profile.filter_mature_content);
      // @ts-expect-error - show_18_plus_content exists but not in generated types
      setShow18PlusContent(profile.show_18_plus_content ?? false);
      // @ts-ignore - digest fields exist but not in generated types
      setDigestEnabled(profile.digest_enabled ?? false);
      // @ts-ignore
      setDigestFrequency(profile.digest_frequency ?? 'daily');
      // @ts-ignore
      setDigestEmail(profile.email ?? "");
      // @ts-ignore - recovery_email exists but not in types
      setRecoveryEmail(profile.recovery_email ?? "");
      // @ts-ignore - digest_style exists but not in generated types
      setDigestStyle(profile.digest_style ?? 'normal');
      // @ts-ignore
      setVoiceCloningEnabled(profile.voice_cloning_enabled ?? false);
      // @ts-ignore
      setHasVoiceModel(!!profile.voice_model_id);
      // @ts-ignore
      setPreferredLanguage(profile.preferred_language || "en");
      // @ts-ignore
      setAutoTranslateEnabled(profile.auto_translate_enabled ?? true);
      // @ts-ignore - Privacy fields exist but not in generated types
      setIsPrivateAccount(profile.is_private_account ?? false);
      // @ts-ignore
      setHideFromSearch(profile.hide_from_search ?? false);
      // @ts-ignore
      setHideFromDiscovery(profile.hide_from_discovery ?? false);
      // @ts-ignore
      setRequireApprovalToFollow(profile.require_approval_to_follow ?? false);
    }
  }, [profile]);

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof (navigator as Navigator & { share?: unknown }).share === "function") {
      setCanNativeShare(true);
    }
  }, []);

  // Cleanup email save timeout on unmount
  useEffect(() => {
    return () => {
      if (emailSaveTimeoutRef.current) {
        clearTimeout(emailSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMagicLinkDialogOpen) {
      setMagicLinkUrl(null);
      setMagicLinkExpiresAt(null);
      setMagicLinkToken(null);
      setShowQRCode(false);
      setIsGeneratingMagicLink(false);
    }
  }, [isMagicLinkDialogOpen]);

  // Load active links from database
  const loadActiveLinks = async () => {
    setIsLoadingActiveLinks(true);
    try {
      // @ts-expect-error - RPC function exists but not in generated types
      const { data, error } = await (supabase.rpc as any)("get_active_magic_links");
      if (error) throw error;

      if (data && Array.isArray(data)) {
        // Construct URLs from tokens returned by database
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const dbActiveLinks = data
          .filter((link: any) => link.is_active)
          .map((link: any) => {
            // Construct URL from token if available
            const loginUrl = link.token && origin
              ? `${origin}/login-link?token=${link.token}`
              : "";
            
            return {
              id: link.id,
              url: loginUrl,
              token: link.token || "",
              expiresAt: link.expires_at,
              linkType: link.link_type ?? "standard",
              createdAt: link.created_at,
              email: link.email,
              isActive: link.is_active,
            };
          });

        // Sort by creation date (newest first)
        dbActiveLinks.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        
        setActiveLinks(dbActiveLinks);
      } else {
        setActiveLinks([]);
      }
    } catch (error) {
      logError("Failed to load active links", error);
      setActiveLinks([]);
    } finally {
      setIsLoadingActiveLinks(false);
    }
  };

  // Deactivate a magic login link
  const handleDeactivateLink = async (linkId: string) => {
    try {
      // @ts-expect-error - RPC function exists but not in generated types
      const { data, error } = await (supabase.rpc as any)("deactivate_magic_login_link", {
        p_link_id: linkId,
      });

      if (error) throw error;

      if (data) {
        // Reload active links from database after deactivation
        await loadActiveLinks();
        toast({
          title: "Link deactivated",
          description: "The login link has been deactivated and can no longer be used.",
        });
      } else {
        toast({
          title: "Couldn't deactivate link",
          description: "The link may have already been deactivated or doesn't exist.",
          variant: "destructive",
        });
      }
    } catch (error) {
      logError("Failed to deactivate link", error);
      toast({
        title: "Error",
        description: "Failed to deactivate the link. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Load active links when component mounts or device/profile changes
  useEffect(() => {
    if (deviceId && profile) {
      loadActiveLinks();
    }
  }, [deviceId, profile]);

  const nextHandleChangeDate = useMemo(() => {
    if (!profile?.handle_last_changed_at) return null;
    const lastChange = new Date(profile.handle_last_changed_at);
    if (Number.isNaN(lastChange.getTime())) return null;
    const next = new Date(lastChange);
    next.setDate(lastChange.getDate() + CHANGE_WINDOW_DAYS);
    return next;
  }, [profile?.handle_last_changed_at]);

  const isHandleChangeLocked = useMemo(() => {
    if (!nextHandleChangeDate) return false;
    return nextHandleChangeDate.getTime() > Date.now();
  }, [nextHandleChangeDate]);

  const magicLinkExpiresDisplay = useMemo(() => {
    if (!magicLinkExpiresAt) return null;
    const expires = new Date(magicLinkExpiresAt);
    if (Number.isNaN(expires.getTime())) return null;
    return expires.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [magicLinkExpiresAt]);

  const handleCaptionsToggle = async (checked: boolean) => {
    setCaptionsEnabled(checked);
    try {
      await updateProfile({ default_captions: checked });
      await refetch();
      toast({
        title: checked ? "Captions on" : "Captions off",
        description: checked
          ? "Clips will open with captions visible."
          : "Captions will stay hidden unless you tap to show them.",
      });
    } catch (error) {
      logError("Failed to update captions preference", error);
      setCaptionsEnabled((prev) => !prev);
      toast({
        title: "Couldn't update preference",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleAutoplayToggle = async (checked: boolean) => {
    setAutoplayNextEnabled(checked);
    try {
      await updateProfile({ autoplay_next_clip: checked });
      await refetch();
      toast({
        title: checked ? "Autoplay on" : "Autoplay off",
        description: checked
          ? "We'll keep the vibes going by playing the next clip automatically."
          : "Playback will pause after each clip until you press play.",
      });
    } catch (error) {
      logError("Failed to update autoplay preference", error);
      setAutoplayNextEnabled((prev) => !prev);
      toast({
        title: "Couldn't update autoplay",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleTapToRecordToggle = async (checked: boolean) => {
    setTapToRecordEnabled(checked);
    try {
      await updateProfile({ tap_to_record: checked });
      await refetch();
      toast({
        title: checked ? "Tap to record enabled" : "Hold to record enabled",
        description: checked
          ? "Tap once to start recording and tap again to finish."
          : "Press and hold the mic button while you speak.",
      });
    } catch (error) {
      logError("Failed to update tap-to-record preference", error);
      setTapToRecordEnabled((prev) => !prev);
      toast({
        title: "Couldn't update recording preference",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleTopicAlertsToggle = async (checked: boolean) => {
    setTopicAlertsEnabled(checked);
    try {
      await updateProfile({ notify_new_topics: checked });
      await refetch();
      toast({
        title: checked ? "Notifications on" : "Notifications off",
        description: checked
          ? "We'll remind you when new daily topics drop."
          : "We'll stop sending topic notifications.",
      });
    } catch (error) {
      logError("Failed to update notification preference", error);
      setTopicAlertsEnabled((prev) => !prev);
      toast({
        title: "Couldn't update notifications",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDigestToggle = async (checked: boolean) => {
    if (checked && !digestEmail.trim()) {
      toast({
        title: "Email required",
        description: "Please add your email address first to enable email digests.",
        variant: "destructive",
      });
      return;
    }

    setDigestEnabled(checked);
    try {
      // @ts-expect-error - digest fields exist but not in generated types
      await updateProfile({ 
        digest_enabled: checked,
        digest_frequency: checked ? digestFrequency : 'never'
      } as any);
      await refetch();
      toast({
        title: checked ? "Daily digest enabled" : "Daily digest disabled",
        description: checked
          ? "You'll receive email digests with the best clips from topics you follow."
          : "You won't receive email digests anymore.",
      });
    } catch (error) {
      logError("Failed to update digest preference", error);
      setDigestEnabled((prev) => !prev);
      toast({
        title: "Couldn't update digest preference",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDigestFrequencyChange = async (frequency: 'never' | 'daily' | 'weekly') => {
    setDigestFrequency(frequency);
    try {
      // @ts-expect-error - digest fields exist but not in generated types
      await updateProfile({ 
        digest_frequency: frequency,
        digest_enabled: frequency !== 'never'
      } as any);
      await refetch();
      if (frequency !== 'never') {
        setDigestEnabled(true);
      }
      toast({
        title: "Digest frequency updated",
        description: frequency === 'never' 
          ? "Digests disabled."
          : `You'll receive ${frequency} email digests with the best clips.`,
      });
    } catch (error) {
      logError("Failed to update digest frequency", error);
      toast({
        title: "Couldn't update digest frequency",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDigestStyleChange = async (style: 'quiet' | 'normal' | 'energizing') => {
    setDigestStyle(style);
    try {
      // @ts-expect-error - digest_style exists but not in generated types
      await updateProfile({
        digest_style: style,
      } as any);
      await refetch();
      toast({
        title: "Digest style updated",
        description:
          style === 'quiet'
            ? "We'll keep your digests very minimal."
            : style === 'energizing'
            ? "We'll include more highlights in your digests."
            : "You'll receive a balanced digest.",
      });
    } catch (error) {
      logError("Failed to update digest style", error);
      toast({
        title: "Couldn't update digest style",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDigestEmailChange = (email: string) => {
    setDigestEmail(email);
    
    // Clear existing timeout
    if (emailSaveTimeoutRef.current) {
      clearTimeout(emailSaveTimeoutRef.current);
    }
    
    // Debounce the save - only save after user stops typing for 1 second
    emailSaveTimeoutRef.current = setTimeout(async () => {
    try {
      // @ts-ignore - email field exists but not in generated types
      await updateProfile({ email: email.trim() || (null as any) });
      await refetch();
        
        // If email was cleared and digest is enabled, disable digest
        if (!email.trim() && digestEnabled) {
          // @ts-expect-error - digest fields exist but not in generated types
          await updateProfile({ 
            digest_enabled: false,
            digest_frequency: 'never'
          } as any);
          await refetch();
          setDigestEnabled(false);
        toast({
            title: "Digest disabled",
            description: "Email digests have been disabled since email was removed.",
          });
        } else if (email.trim()) {
          toast({
            title: "Email saved",
            description: "Your email has been saved. You can use it for digests and login links.",
        });
      }
    } catch (error) {
      logError("Failed to update email", error);
      toast({
        title: "Couldn't update email",
        description: "Please try again.",
        variant: "destructive",
      });
    }
    }, 1000); // Wait 1 second after user stops typing
  };

  const handleGenerateMagicLink = async () => {
    if (isGeneratingMagicLink) return;
    setIsGeneratingMagicLink(true);
    try {
      const trimmedEmail = magicLinkEmail.trim();
      // @ts-expect-error - RPC accepts null for optional parameters
      const { data, error } = await supabase.rpc("create_magic_login_link", {
        target_email: trimmedEmail.length > 0 ? trimmedEmail : undefined,
        p_link_type: magicLinkType,
        p_duration_hours: undefined, // Use default for link type
      } as any);
      if (error) throw error;

      const result = data?.[0];
      if (!result?.token) {
        throw new Error("Login link was not created");
      }

      // Ensure we use absolute URL for QR code (important for mobile scanning)
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      // Always use absolute URL to ensure it works when scanned on different devices
      const loginUrl = origin.length > 0 
        ? `${origin}/login-link?token=${result.token}` 
        : (typeof window !== "undefined" ? `https://${window.location.hostname}/login-link?token=${result.token}` : `/login-link?token=${result.token}`);

      setMagicLinkUrl(loginUrl);
      setMagicLinkToken(result.token);
      setMagicLinkExpiresAt(result.expires_at ?? undefined);
      setShowQRCode(false); // Reset QR code view

      // Add to active links list - check for duplicates first
      const newLink = {
        id: crypto.randomUUID(),
        url: loginUrl,
        token: result.token,
        expiresAt: result.expires_at ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        linkType: (result as any).link_type ?? magicLinkType,
        createdAt: new Date().toISOString(),
        email: trimmedEmail.length > 0 ? trimmedEmail : undefined,
        isActive: true,
      };
      // Reload active links from database to get the full list with tokens
      // The database now stores tokens, so we can get all links across devices
      await loadActiveLinks();

      let copied = false;
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(loginUrl);
          copied = true;
          toast({
            title: "Login link copied",
            description: "We copied the login link to your clipboard.",
          });
        } catch {
          copied = false;
        }
      }

      if (!copied) {
        toast({
          title: "Login link ready",
          description: "Copy or send it before it expires.",
        });
      }
    } catch (error) {
      logError("Failed to create login link", error);
      const message = error instanceof Error ? error.message : "Please try again.";
      toast({
        title: "Couldn't create login link",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingMagicLink(false);
    }
  };

  const handleGeneratePin = async () => {
    if (isGeneratingPin || !pinLinkingEnabled) return;
    setIsGeneratingPin(true);
    try {
      // @ts-ignore - Function exists but not in generated types
      const { data, error } = await (supabase.rpc as any)("generate_account_link_pin", {
        p_duration_minutes: pinDurationMinutes,
      });
      
      if (error) throw error;

      const result = data?.[0];
      if (!result?.pin_code) {
        throw new Error("PIN was not generated");
      }

      setAccountLinkPin(result.pin_code);
      setPinExpiresAt(new Date(result.expires_at));
      
      toast({
        title: "PIN generated",
        description: `Your PIN is active for ${pinDurationMinutes} minutes. Enter it on another device to link your account.`,
      });
    } catch (error) {
      logError("Failed to generate PIN", error);
      const message = error instanceof Error ? error.message : "Please try again.";
      toast({
        title: "Couldn't generate PIN",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPin(false);
    }
  };

  // Poll for PIN expiration
  useEffect(() => {
    if (!pinExpiresAt) return;

    const interval = setInterval(() => {
      if (new Date() >= pinExpiresAt) {
        setAccountLinkPin(null);
        setPinExpiresAt(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [pinExpiresAt]);

  // Clear PIN when PIN linking is disabled
  useEffect(() => {
    if (!pinLinkingEnabled) {
      setAccountLinkPin(null);
      setPinExpiresAt(null);
    }
  }, [pinLinkingEnabled]);

  const handleCopyMagicLink = async () => {
    if (!magicLinkUrl) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(magicLinkUrl);
        toast({
          title: "Link copied",
          description: "Paste it wherever you need it.",
        });
        return;
      }
      throw new Error("Clipboard unavailable");
    } catch {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = magicLinkUrl;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "absolute";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        toast({
          title: "Link copied",
          description: "Paste it wherever you need it.",
        });
      } catch (fallbackError) {
        logError("Failed to copy login link", fallbackError);
        toast({
          title: "Couldn't copy link",
          description: "Select the link text and copy it manually.",
          variant: "destructive",
        });
      }
    }
  };

  const handleShareMagicLink = async () => {
    if (!magicLinkUrl || !canNativeShare) return;
    try {
      await (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share?.({
        title: "Vocalix login link",
        text: "Tap this link to sign back in to Vocalix.",
        url: magicLinkUrl,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      logError("Failed to share login link", error);
      toast({
        title: "Couldn't share link",
        description: "Try copying it instead.",
        variant: "destructive",
      });
    }
  };

  const handleEmailMagicLink = () => {
    if (!magicLinkUrl) return;
    const trimmedEmail = magicLinkEmail.trim();
    if (trimmedEmail.length === 0) return;
    const subject = encodeURIComponent("Your Vocalix login link");
    const expiryLine = magicLinkExpiresDisplay ? `\n\nThis link expires ${magicLinkExpiresDisplay}.` : "";
    const body = encodeURIComponent(
      `Use this link to sign back in to Vocalix on another device:\n${magicLinkUrl}${expiryLine}\n\nIf you didn't request this, you can ignore the link.`,
    );
    window.open(`mailto:${trimmedEmail}?subject=${subject}&body=${body}`, "_blank");
  };

  const handleGeneratePhoneQRCode = async () => {
    if (phoneQRCodeUrl) {
      setShowSiteQRCode(!showSiteQRCode);
      return;
    }
    
    if (isGeneratingPhoneQR) return;
    setIsGeneratingPhoneQR(true);
    try {
      // @ts-expect-error - RPC accepts null for optional parameters
      const { data, error } = await supabase.rpc("create_magic_login_link", {
        target_email: undefined,
        p_link_type: "standard",
        p_duration_hours: undefined,
      } as any);
      if (error) throw error;

      const result = data?.[0];
      if (!result?.token) {
        throw new Error("Login link was not created");
      }

      // Ensure we use absolute URL for QR code (important for mobile scanning)
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      // Always use absolute URL to ensure it works when scanned on different devices
      const loginUrl = origin.length > 0 
        ? `${origin}/login-link?token=${result.token}` 
        : (typeof window !== "undefined" ? `https://${window.location.hostname}/login-link?token=${result.token}` : `/login-link?token=${result.token}`);

      setPhoneQRCodeUrl(loginUrl);
      setShowSiteQRCode(true);
    } catch (error) {
      logError("Failed to create phone QR code link", error);
      toast({
        title: "Couldn't create QR code",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPhoneQR(false);
    }
  };

  const handleEmailToMyself = () => {
    if (!magicLinkUrl) return;
    // Email to user's own email if available, otherwise prompt
    const userEmail = digestEmail.trim() || magicLinkEmail.trim() || "";
    if (userEmail.length === 0) {
      toast({
        title: "Email needed",
        description: "Please enter your email address in the email field above, or add it in Digest Settings.",
      });
      return;
    }
    const subject = encodeURIComponent("Vocalix Login Link - For Your Other Device");
    const expiryLine = magicLinkExpiresDisplay ? `\n\nThis link expires ${magicLinkExpiresDisplay}.` : "";
    const body = encodeURIComponent(
      `Hi,\n\nHere's your Vocalix login link for signing in on another device:\n\n${magicLinkUrl}${expiryLine}\n\nOpen this link on your other device to sign in automatically.\n\nYou can also scan the QR code if you saved it.`,
    );
    window.open(`mailto:${userEmail}?subject=${subject}&body=${body}`, "_blank");
    toast({
      title: "Email opened",
      description: "Send the email to yourself so you can access the link later.",
    });
  };

  const handleDownloadQRCode = () => {
    const svgElement = document.getElementById("magic-link-qr-code");
    if (!svgElement || !magicLinkUrl) return;

    try {
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();

      img.onload = () => {
        // Make canvas larger for better quality
        canvas.width = 400;
        canvas.height = 400;
        
        // Scale and draw
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }

        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `echo-garden-login-qr-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast({
              title: "QR code downloaded",
              description: "Save it to transfer to your other device. Scan it or share the image file.",
            });
          }
        }, "image/png");
      };

      // Convert SVG to image
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      img.src = url;
    } catch (error) {
      logError("Failed to download QR code", error);
      toast({
        title: "Couldn't download QR code",
        description: "Try copying the link instead.",
        variant: "destructive",
      });
    }
  };

  const handleMatureFilterToggle = async (checked: boolean) => {
    setMatureFilterEnabled(checked);
    try {
      await updateProfile({ filter_mature_content: checked });
      await refetch();
      toast({
        title: checked ? "Filter on" : "Filter off",
        description: checked
          ? "We'll hide clips tagged with mature themes."
          : "We'll include clips even if they're tagged as mature.",
      });
    } catch (error) {
      logError("Failed to update content filter", error);
      setMatureFilterEnabled((prev) => !prev);
      toast({
        title: "Couldn't update filter",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCityToggle = async (checked: boolean) => {
    setCityTagEnabled(checked);

    if (checked) {
      setIsCityDialogOpen(true);
      return;
    }

    try {
      await updateProfile({ consent_city: false, city: null });
      await refetch();
      toast({
        title: "City hidden",
        description: "Future clips will no longer include your city.",
      });
    } catch (error) {
      logError("Failed to disable city tag", error);
      setCityTagEnabled(true);
      toast({
        title: "Couldn't update city preference",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSaveCity = async ({ city, consent }: { city: string | null; consent: boolean }) => {
    try {
      await updateProfile({ city, consent_city: consent });
      await refetch();
      setCityTagEnabled(consent);
      toast({
        title: consent ? "City saved" : "City hidden",
        description: consent
          ? "We'll add your city to future clips."
          : "We won't include your city going forward.",
      });
    } catch (error) {
      logError("Failed to save city preference", error);
      setCityTagEnabled(profile?.consent_city ?? false);
      toast({
        title: "Couldn't save city",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCityDialogOpenChange = (open: boolean) => {
    setIsCityDialogOpen(open);
    if (!open && !profile?.consent_city) {
      setCityTagEnabled(false);
    }
  };

  const handleOpenHandleDialog = () => {
    if (profile) {
      setPendingHandle(profile.handle);
    }
    setIsHandleDialogOpen(true);
  };

  const handleChangePseudonym = async () => {
    if (!pendingHandle.trim()) {
      toast({
        title: "Handle required",
        description: "Please enter a pseudonym.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingHandle(true);
    try {
      const { error } = await supabase.rpc("change_pseudonym", { new_handle: pendingHandle.trim() });
      if (error) throw error;
      // Invalidate all profile queries so profile updates everywhere (header, profile page, etc.)
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      await refetch();
      toast({
        title: "Pseudonym updated",
        description: "You'll see your new name across the app.",
      });
      setIsHandleDialogOpen(false);
    } catch (error) {
      logError("Failed to change pseudonym", error);
      const message = error instanceof Error ? error.message : "Please try again.";
      toast({
        title: "Couldn't change pseudonym",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSavingHandle(false);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const { data, error } = await supabase.rpc("export_profile_data");
      if (error) throw error;

      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const dateStamp = new Date().toISOString().split("T")[0];
      anchor.href = url;
      anchor.download = `echo-garden-export-${dateStamp}.json`;
      anchor.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Export ready",
        description: "We downloaded a JSON file with your data.",
      });
    } catch (error) {
      logError("Failed to export data", error);
      toast({
        title: "Couldn't export data",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAudioClips = async () => {
    if (!profile?.id) {
      toast({
        title: "Profile required",
        description: "Please sign in to export your clips.",
        variant: "destructive",
      });
      return;
    }

    setIsExportingAudio(true);
    try {
      // Fetch all clips for the user
      const { data: clips, error: clipsError } = await supabase
        .from("clips")
        .select("id, audio_path, created_at, title, captions")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false });

      if (clipsError) throw clipsError;

      if (!clips || clips.length === 0) {
        toast({
          title: "No clips found",
          description: "You don't have any clips to export yet.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Preparing export",
        description: `Downloading ${clips.length} audio file${clips.length > 1 ? "s" : ""}...`,
      });

      const zip = new JSZip();
      let downloadedCount = 0;

      // Download each audio file and add to ZIP
      for (const clip of clips) {
        try {
          const { data: audioData, error: audioError } = await supabase.storage
            .from("audio")
            .download(clip.audio_path);

          if (audioError) {
            logWarn(`Failed to download clip ${clip.id}`, audioError);
            continue;
          }

          if (audioData) {
            // Create a safe filename
            const date = clip.created_at ? new Date(clip.created_at).toISOString().split("T")[0] : "unknown";
            const safeTitle = clip.title ? clip.title.replace(/[^a-z0-9]/gi, "_").substring(0, 50) : "clip";
            const filename = `${date}_${safeTitle}_${clip.id.substring(0, 8)}.webm`;
            
            zip.file(filename, audioData);
            downloadedCount++;
          }
        } catch (error) {
          logWarn(`Error processing clip ${clip.id}`, error);
        }
      }

      if (downloadedCount === 0) {
        toast({
          title: "Export failed",
          description: "Could not download any audio files.",
          variant: "destructive",
        });
        return;
      }

      // Generate ZIP file
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const anchor = document.createElement("a");
      const dateStamp = new Date().toISOString().split("T")[0];
      anchor.href = url;
      anchor.download = `echo-garden-audio-clips-${dateStamp}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Export complete",
        description: `Downloaded ${downloadedCount} audio file${downloadedCount > 1 ? "s" : ""} as ZIP.`,
      });
    } catch (error) {
      logError("Failed to export audio clips", error);
      toast({
        title: "Couldn't export audio clips",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingAudio(false);
    }
  };

  const handleExportTranscripts = async () => {
    if (!profile?.id) {
      toast({
        title: "Profile required",
        description: "Please sign in to export your transcriptions.",
        variant: "destructive",
      });
      return;
    }

    setIsExportingTranscripts(true);
    try {
      // Fetch all clips with transcriptions
      const { data: clips, error: clipsError } = await supabase
        .from("clips")
        .select("id, created_at, title, captions, summary, tags")
        .eq("profile_id", profile.id)
        .not("captions", "is", null)
        .order("created_at", { ascending: false });

      if (clipsError) throw clipsError;

      if (!clips || clips.length === 0) {
        toast({
          title: "No transcriptions found",
          description: "You don't have any clips with transcriptions yet.",
          variant: "destructive",
        });
        return;
      }

      // Create JSON export
      const transcriptsData = {
        exported_at: new Date().toISOString(),
        profile_id: profile.id,
        profile_handle: profile.handle,
        total_transcripts: clips.length,
        transcripts: clips.map((clip) => ({
          id: clip.id,
          created_at: clip.created_at,
          title: clip.title,
          transcription: clip.captions,
          summary: clip.summary,
          tags: clip.tags,
        })),
      };

      // Also create a text file version
      let textContent = `Vocalix Transcriptions Export\n`;
      textContent += `Exported: ${transcriptsData.exported_at}\n`;
      textContent += `Profile: ${profile.handle}\n`;
      textContent += `Total Transcripts: ${clips.length}\n`;
      textContent += `\n${"=".repeat(80)}\n\n`;

      clips.forEach((clip, index) => {
        textContent += `Transcript ${index + 1}\n`;
        textContent += `ID: ${clip.id}\n`;
        textContent += `Date: ${clip.created_at ? new Date(clip.created_at).toLocaleString() : "Unknown"}\n`;
        if (clip.title) textContent += `Title: ${clip.title}\n`;
        textContent += `\nTranscription:\n${clip.captions}\n\n`;
        if (clip.summary) textContent += `Summary: ${clip.summary}\n\n`;
        if (clip.tags && clip.tags.length > 0) textContent += `Tags: ${clip.tags.join(", ")}\n\n`;
        textContent += `${"-".repeat(80)}\n\n`;
      });

      // Download JSON version
      const jsonBlob = new Blob([JSON.stringify(transcriptsData, null, 2)], { type: "application/json" });
      const jsonUrl = URL.createObjectURL(jsonBlob);
      const jsonAnchor = document.createElement("a");
      const dateStamp = new Date().toISOString().split("T")[0];
      jsonAnchor.href = jsonUrl;
      jsonAnchor.download = `echo-garden-transcripts-${dateStamp}.json`;
      jsonAnchor.click();
      URL.revokeObjectURL(jsonUrl);

      // Download text version
      const textBlob = new Blob([textContent], { type: "text/plain" });
      const textUrl = URL.createObjectURL(textBlob);
      const textAnchor = document.createElement("a");
      textAnchor.href = textUrl;
      textAnchor.download = `echo-garden-transcripts-${dateStamp}.txt`;
      // Small delay to allow first download to complete
      setTimeout(() => {
        textAnchor.click();
        URL.revokeObjectURL(textUrl);
      }, 500);

      toast({
        title: "Transcriptions exported",
        description: `Downloaded ${clips.length} transcription${clips.length > 1 ? "s" : ""} in JSON and TXT formats.`,
      });
    } catch (error) {
      logError("Failed to export transcriptions", error);
      toast({
        title: "Couldn't export transcriptions",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingTranscripts(false);
    }
  };

  const handleBackupToCloud = async () => {
    if (!profile?.id) {
      toast({
        title: "Profile required",
        description: "Please sign in to backup your data.",
        variant: "destructive",
      });
      return;
    }

    setIsBackingUp(true);
    try {
      // Export profile data
      const { data: profileData, error: profileError } = await supabase.rpc("export_profile_data");
      if (profileError) throw profileError;

      // Fetch all clips with audio paths
      const { data: clips, error: clipsError } = await supabase
        .from("clips")
        .select("id, audio_path, created_at")
        .eq("profile_id", profile.id);

      if (clipsError) throw clipsError;

      // Create backup package
      const backupData = {
        exported_at: new Date().toISOString(),
        profile_data: profileData,
        clips_metadata: clips?.map((clip) => ({
          id: clip.id,
          audio_path: clip.audio_path,
          created_at: clip.created_at,
        })) || [],
        total_clips: clips?.length || 0,
      };

      // Convert to JSON blob
      const jsonBlob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      
      // Upload to Supabase storage backup bucket (create if doesn't exist)
      const dateStamp = new Date().toISOString().split("T")[0];
      const timestamp = Date.now();
      const backupFileName = `${profile.id}/${dateStamp}_${timestamp}.json`;
      
      // Try to upload to backup bucket, fallback to audio bucket if backup bucket doesn't exist
      let uploadError = null;
      let { error } = await supabase.storage
        .from("backups")
        .upload(backupFileName, jsonBlob, {
          contentType: "application/json",
          upsert: false,
        });
      uploadError = error;

      // If backup bucket doesn't exist or upload fails, try audio bucket as fallback
      if (uploadError) {
        logWarn("Failed to upload to backup bucket, trying audio bucket", uploadError);
        const { error: fallbackError } = await supabase.storage
          .from("audio")
          .upload(`backups/${backupFileName}`, jsonBlob, {
            contentType: "application/json",
            upsert: false,
          });
        uploadError = fallbackError;
      }

      if (uploadError) {
        // If upload fails, download the backup instead
        logWarn("Failed to upload backup to cloud, downloading instead", uploadError);
        const url = URL.createObjectURL(jsonBlob);
        const anchor = document.createElement("a");
        const dateStamp = new Date().toISOString().split("T")[0];
        anchor.href = url;
        anchor.download = `echo-garden-backup-${dateStamp}.json`;
        anchor.click();
        URL.revokeObjectURL(url);

        toast({
          title: "Backup downloaded",
          description: "Cloud backup unavailable. Downloaded backup file instead.",
        });
      } else {
        toast({
          title: "Backup complete",
          description: "Your data has been backed up to cloud storage.",
        });
      }
    } catch (error) {
      logError("Failed to backup data", error);
      toast({
        title: "Couldn't backup data",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestartTutorial = () => {
    localStorage.removeItem("echo_garden_tutorial_completed");
    navigate("/");
    toast({
      title: "Tutorial reset",
      description: "The interactive tutorial will appear when you return to the home page.",
    });
  };

  // Load downloaded clips list
  useEffect(() => {
    const loadDownloads = async () => {
      setIsLoadingDownloads(true);
      try {
        const clips = await getAllDownloadedClips();
        setDownloadedClipsList(clips);
      } catch (error) {
        logError("Error loading downloaded clips", error);
      } finally {
        setIsLoadingDownloads(false);
      }
    };
    loadDownloads();
  }, [getAllDownloadedClips]);

  const handleDeleteDownloadedClip = async (clipId: string) => {
    try {
      const success = await deleteDownloadedClip(clipId);
      if (success) {
        setDownloadedClipsList((prev) => prev.filter((clip) => clip.clipId !== clipId));
        toast({
          title: "Removed from offline",
          description: "The clip has been removed from your offline downloads.",
        });
      }
    } catch (error) {
      logError("Error deleting downloaded clip", error);
      toast({
        title: "Couldn't remove clip",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleClearAllDownloads = async () => {
    try {
      const success = await clearAll();
      if (success) {
        setDownloadedClipsList([]);
        toast({
          title: "All downloads cleared",
          description: "All offline clips have been removed.",
        });
      }
    } catch (error) {
      logError("Error clearing downloads", error);
      toast({
        title: "Couldn't clear downloads",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      // @ts-ignore - Function exists but accepts boolean parameter
      const { error } = await (supabase.rpc as any)("purge_account", {
        p_keep_content: keepContentOnDelete,
      });
      if (error) throw error;

      // Stop session monitoring
      stopSessionMonitoring();

      // Sign out from Supabase auth
      try {
        await supabase.auth.signOut();
      } catch (authError) {
        // Ignore auth signout errors - they're not critical
        console.warn("Error signing out from auth (non-critical):", authError);
      }

      // Clear all auth-related localStorage
      localStorage.removeItem("profileId");
      localStorage.removeItem("deviceId");
      localStorage.removeItem("voice-note-device-id"); // Legacy device ID
      
      // Clear sessionStorage as well
      try {
        sessionStorage.clear();
      } catch (e) {
        // Ignore sessionStorage errors
      }

      // Clear all queries
      queryClient.removeQueries({ queryKey: ["profile"] });
      queryClient.clear(); // Clear all cached data

      // Show goodbye message before redirecting
      const goodbyeMessage = keepContentOnDelete
        ? "Your account has been anonymized. Your content remains but is no longer associated with you."
        : "Your account has been deleted. Thanks for being part of Vocalix. You're welcome back anytime! 👋";
      
      // Show goodbye message in a dialog
      alert(goodbyeMessage);

      // Sign out from Supabase auth (force logout)
      try {
        await supabase.auth.signOut();
      } catch (authError) {
        console.warn("Error signing out from auth:", authError);
      }

      // Clear all auth-related localStorage
      localStorage.clear();
      
      // Clear sessionStorage as well
      try {
        sessionStorage.clear();
      } catch (e) {
        // Ignore sessionStorage errors
      }

      // Force a full page reload to completely reset the app state
      // This ensures all context, state, and cookies are properly cleared
      window.location.href = "/";
    } catch (error) {
      logError("Failed to delete account", error);
      toast({
        title: "Couldn't delete account",
        description: "Please try again.",
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">
          <Card className="p-6 rounded-3xl space-y-4">
            <div className="h-4 w-1/2 rounded-full bg-muted animate-pulse" />
            <div className="h-4 w-3/4 rounded-full bg-muted animate-pulse" />
            <div className="h-4 w-2/3 rounded-full bg-muted animate-pulse" />
          </Card>
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">
          <Card className="p-6 rounded-3xl space-y-3 text-center text-muted-foreground">
            <p>We couldn't find your profile.</p>
            <p>Please return home and start the onboarding flow.</p>
            <Button variant="outline" className="rounded-2xl mt-4" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {isMobile ? (
                <MobileMenu profile={profile} />
              ) : (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full flex-shrink-0"
                  onClick={() => {
                    // Always go to main menu (home page)
                    navigate("/");
                  }}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              )}
              <h1 className="text-xl sm:text-2xl font-bold truncate min-w-0">Settings</h1>
            </div>
          </div>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* Mobile: Dropdown Select */}
        <div className="lg:hidden sticky top-[73px] z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-3">
            <Select 
              value={activeTab} 
              onValueChange={handleTabChange}
              disabled={isAccountLinkingTutorialActive && activeTab !== "account"}
            >
              <SelectTrigger className={`w-full rounded-2xl font-medium ${isAccountLinkingTutorialActive && activeTab !== "account" ? "opacity-50 cursor-not-allowed" : ""}`}>
                <SelectValue placeholder="Select a section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general" disabled={isAccountLinkingTutorialActive}>General</SelectItem>
                <SelectItem value="playback" disabled={isAccountLinkingTutorialActive}>Playback</SelectItem>
                <SelectItem value="notifications" disabled={isAccountLinkingTutorialActive}>Notifications</SelectItem>
                <SelectItem value="privacy" disabled={isAccountLinkingTutorialActive}>Privacy</SelectItem>
                <SelectItem value="profile" disabled={isAccountLinkingTutorialActive}>Profile</SelectItem>
                <SelectItem value="account" data-tutorial="settings-account-tab">
                  Account
                </SelectItem>
                <SelectItem value="security" disabled={isAccountLinkingTutorialActive}>Security</SelectItem>
                <SelectItem value="downloads" disabled={isAccountLinkingTutorialActive}>Downloads</SelectItem>
                <SelectItem value="accessibility" disabled={isAccountLinkingTutorialActive}>Accessibility</SelectItem>
                <SelectItem value="voice" disabled={isAccountLinkingTutorialActive}>Voice</SelectItem>
                <SelectItem value="help" disabled={isAccountLinkingTutorialActive}>Help & Support</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Desktop: Sidebar Layout */}
        <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto px-4 py-6">
          {/* Sidebar Navigation - Hidden on mobile */}
          <aside className="hidden lg:block lg:w-64 lg:sticky lg:top-[89px] lg:h-[calc(100vh-89px)] lg:overflow-y-auto">
            <nav className="space-y-1">
              <button
                onClick={() => handleTabChange("general")}
                disabled={isAccountLinkingTutorialActive}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "general"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                } ${isAccountLinkingTutorialActive ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <SettingsIcon className="h-4 w-4" />
                <span>General</span>
              </button>
              <button
                onClick={() => handleTabChange("playback")}
                disabled={isAccountLinkingTutorialActive}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "playback"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                } ${isAccountLinkingTutorialActive ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Play className="h-4 w-4" />
                <span>Playback</span>
              </button>
              <button
                onClick={() => handleTabChange("notifications")}
                disabled={isAccountLinkingTutorialActive}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "notifications"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                } ${isAccountLinkingTutorialActive ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Bell className="h-4 w-4" />
                <span>Notifications</span>
              </button>
              <button
                onClick={() => handleTabChange("privacy")}
                disabled={isAccountLinkingTutorialActive}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "privacy"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                } ${isAccountLinkingTutorialActive ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Shield className="h-4 w-4" />
                <span>Privacy</span>
              </button>
              <button
                onClick={() => handleTabChange("profile")}
                disabled={isAccountLinkingTutorialActive}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "profile"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                } ${isAccountLinkingTutorialActive ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <User className="h-4 w-4" />
                <span>Profile</span>
              </button>
              <button
                onClick={() => handleTabChange("account")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "account"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                data-tutorial="settings-account-tab"
              >
                <Users className="h-4 w-4" />
                <span>Account</span>
              </button>
              <button
                onClick={() => handleTabChange("security")}
                disabled={isAccountLinkingTutorialActive}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "security"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                } ${isAccountLinkingTutorialActive ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Lock className="h-4 w-4" />
                <span>Security</span>
              </button>
              <button
                onClick={() => handleTabChange("downloads")}
                disabled={isAccountLinkingTutorialActive}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "downloads"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                } ${isAccountLinkingTutorialActive ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Download className="h-4 w-4" />
                <span>Downloads</span>
              </button>
              <button
                onClick={() => handleTabChange("accessibility")}
                disabled={isAccountLinkingTutorialActive}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "accessibility"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                } ${isAccountLinkingTutorialActive ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Headphones className="h-4 w-4" />
                <span>Accessibility</span>
              </button>
              <button
                onClick={() => handleTabChange("voice")}
                disabled={isAccountLinkingTutorialActive}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "voice"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                } ${isAccountLinkingTutorialActive ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Volume2 className="h-4 w-4" />
                <span>Voice</span>
              </button>
              <button
                onClick={() => handleTabChange("help")}
                disabled={isAccountLinkingTutorialActive}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "help"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                } ${isAccountLinkingTutorialActive ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <HelpCircle className="h-4 w-4" />
                <span>Help & Support</span>
              </button>
            </nav>
          </aside>

      <main className="flex-1 max-w-2xl lg:max-w-4xl">
        <TabsContent value="general" className="space-y-8 mt-6">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">General Settings</h2>
          <Card className="p-6 rounded-3xl space-y-6">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="font-medium">Theme</p>
                <p className="text-sm text-muted-foreground">
                  Switch between light and dark mode.
                </p>
              </div>
              <ThemeToggle />
              </div>

            <div className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <p className="font-medium">Preferred language</p>
                <p className="text-sm text-muted-foreground">
                  Clips and comments will be automatically translated to this language.
                </p>
              </div>
              <Select
                value={preferredLanguage}
                onValueChange={async (value) => {
                  setPreferredLanguage(value);
                  try {
                    // @ts-expect-error - preferred_language exists but not in generated types
                    await updateProfile({ preferred_language: value } as any);
                    await refetch();
                    toast({
                      title: "Language updated",
                      description: `Content will be shown in ${value === "en" ? "English" : value.toUpperCase()}`,
                    });
                  } catch (error) {
                    logError("Failed to update language", error);
                    setPreferredLanguage(preferredLanguage);
                  }
                }}
                disabled={isUpdating}
              >
                <SelectTrigger className="w-32 rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="it">Italian</SelectItem>
                  <SelectItem value="pt">Portuguese</SelectItem>
                  <SelectItem value="ru">Russian</SelectItem>
                  <SelectItem value="zh">Chinese</SelectItem>
                  <SelectItem value="ja">Japanese</SelectItem>
                  <SelectItem value="ko">Korean</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="font-medium">Auto-translate</p>
                <p className="text-sm text-muted-foreground">
                  Automatically show translations for clips and comments in other languages.
                </p>
              </div>
              <Switch
                checked={autoTranslateEnabled}
                onCheckedChange={async (checked) => {
                  setAutoTranslateEnabled(checked);
                  try {
                    // @ts-expect-error - auto_translate_enabled exists but not in generated types
                    await updateProfile({ auto_translate_enabled: checked } as any);
                    await refetch();
                    toast({
                      title: checked ? "Auto-translate on" : "Auto-translate off",
                      description: checked
                        ? "Translations will be shown automatically."
                        : "You'll see original text only.",
                    });
                  } catch (error) {
                    logError("Failed to update auto-translate", error);
                    setAutoTranslateEnabled(!checked);
                  }
                }}
                disabled={isUpdating}
                aria-label="Toggle auto-translate"
              />
            </div>
          </Card>
          </section>
        </TabsContent>

        <TabsContent value="playback" className="space-y-8 mt-6">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Playback Settings</h2>
            <Card className="p-6 rounded-3xl space-y-6">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="font-medium">Captions by default</p>
                <p className="text-sm text-muted-foreground">
                  Automatically show captions when you open a clip.
                </p>
              </div>
              <Switch
                checked={captionsEnabled}
                onCheckedChange={handleCaptionsToggle}
                disabled={isUpdating}
                aria-label="Toggle captions visibility by default"
              />
            </div>

            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="font-medium">Autoplay next clip</p>
                <p className="text-sm text-muted-foreground">
                  Keep listening without tapping play—perfect for hands-free sessions.
                </p>
              </div>
              <Switch
                checked={autoplayNextEnabled}
                onCheckedChange={handleAutoplayToggle}
                disabled={isUpdating}
                aria-label="Toggle autoplay for the next clip"
              />
            </div>

            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="font-medium">Tap to record</p>
                <p className="text-sm text-muted-foreground">
                  Choose whether the mic starts with a tap or while holding it down.
                </p>
              </div>
              <Switch
                checked={tapToRecordEnabled}
                onCheckedChange={handleTapToRecordToggle}
                disabled={isUpdating}
                aria-label="Toggle tap to record preference"
              />
            </div>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-8 mt-6">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Notification Settings</h2>
            <Card className="p-6 rounded-3xl space-y-6">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="font-medium">Topic alerts</p>
                <p className="text-sm text-muted-foreground">
                  Get a gentle nudge when the daily prompt is ready.
                </p>
              </div>
              <Switch
                checked={topicAlertsEnabled}
                onCheckedChange={handleTopicAlertsToggle}
                disabled={isUpdating}
                aria-label="Toggle notifications for new topics"
              />
            </div>

            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="font-medium">Browser push notifications</p>
                <p className="text-sm text-muted-foreground">
                  {isPushSupported
                    ? isPushEnabled
                      ? "Receive notifications even when the app is closed."
                      : "Enable to receive notifications for comments, replies, follows, and reactions."
                    : "Not supported in your browser."}
                </p>
              </div>
              {isPushSupported ? (
                <Switch
                  checked={isPushEnabled}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      requestPermission();
                    }
                  }}
                  disabled={pushPermission === 'denied'}
                  aria-label="Toggle browser push notifications"
                />
              ) : (
                <Switch checked={false} disabled aria-label="Push notifications not supported" />
              )}
            </div>

              <div className="space-y-4 pt-4 border-t border-border/40">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
              <div className="flex-1">
                    <Label htmlFor="digest-email" className="text-sm font-medium">
                        Email address
                      </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Used for email digests and magic login links
                    </p>
                  </div>
                </div>
                      <Input
                        id="digest-email"
                        type="email"
                        placeholder="your@email.com"
                        value={digestEmail}
                        onChange={(e) => handleDigestEmailChange(e.target.value)}
                  className="rounded-2xl"
                        disabled={isUpdating}
                      />
                <p className="text-xs text-muted-foreground">
                  {digestEmail.trim() 
                    ? "✓ Email saved. You can use it for digests and login links."
                    : "Add your email to receive digests and use the 'Email Me' feature for login links."
                  }
                </p>
                    </div>

              <div className="flex items-start justify-between gap-6 pt-2 border-t border-border/40">
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="font-medium">Email digest</p>
                    <p className="text-sm text-muted-foreground">
                      Get a daily or weekly email with gentle highlights from topics you follow.
                    </p>
                  </div>
                  {digestEnabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="digest-frequency" className="text-xs text-muted-foreground">
                          Frequency
                        </Label>
                        <Select
                          value={digestFrequency}
                          onValueChange={(value: 'never' | 'daily' | 'weekly') => handleDigestFrequencyChange(value)}
                          disabled={isUpdating}
                        >
                          <SelectTrigger id="digest-frequency" className="mt-1 rounded-2xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="never">Never</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="digest-style" className="text-xs text-muted-foreground">
                          Style
                        </Label>
                        <Select
                          value={digestStyle}
                          onValueChange={(value: 'quiet' | 'normal' | 'energizing') => handleDigestStyleChange(value)}
                          disabled={isUpdating}
                        >
                          <SelectTrigger id="digest-style" className="mt-1 rounded-2xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="quiet">Quiet (very minimal)</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="energizing">Energizing (more highlights)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              <Switch
                checked={digestEnabled}
                onCheckedChange={handleDigestToggle}
                  disabled={isUpdating || !digestEmail.trim()}
                aria-label="Toggle email digest"
              />
              </div>
              {!digestEmail.trim() && (
                <p className="text-xs text-muted-foreground italic">
                  💡 Add an email address above to enable email digests
                </p>
              )}
            </div>
            </Card>
            <NotificationPreferences />
          </section>
        </TabsContent>

        <TabsContent value="privacy" className="space-y-8 mt-6">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Privacy & Content</h2>
            <Card className="p-6 rounded-3xl space-y-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="font-medium">City-level tagging</p>
                  <p className="text-sm text-muted-foreground">
                    Let neighbors find your clips. We only store the city you provide.
                  </p>
                  {profile.consent_city && profile.city && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Current city: {profile.city}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-3">
                  <Switch
                    checked={cityTagEnabled}
                    onCheckedChange={handleCityToggle}
                    disabled={isUpdating}
                    aria-label="Toggle city-level tagging"
                  />
                  {profile.consent_city && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-2xl"
                      onClick={() => setIsCityDialogOpen(true)}
                    >
                      Update city
                    </Button>
                  )}
                </div>
              </div>

            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="font-medium">Filter mature content</p>
                <p className="text-sm text-muted-foreground">
                  Hide clips flagged with sensitive or explicit themes from your feed.
                </p>
              </div>
              <Switch
                checked={matureFilterEnabled}
                onCheckedChange={handleMatureFilterToggle}
                disabled={isUpdating}
                aria-label="Toggle mature content filter"
              />
            </div>

            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="font-medium">Show 18+ content</p>
                <p className="text-sm text-muted-foreground">
                  Enable to view and access NSFW content. When enabled, a dedicated 18+ section will appear in the header.
                </p>
              </div>
              <Switch
                checked={show18PlusContent}
                onCheckedChange={async (checked) => {
                  setShow18PlusContent(checked);
                  try {
                    // @ts-expect-error - show_18_plus_content exists but not in generated types
                    await updateProfile({ show_18_plus_content: checked } as any);
                    await refetch();
                    toast({
                      title: checked ? "18+ content enabled" : "18+ content disabled",
                      description: checked
                        ? "You can now access NSFW content. A dedicated section will appear in the header."
                        : "18+ content is now hidden from your feed and search results.",
                    });
                  } catch (error) {
                    logError("Failed to update 18+ content preference", error);
                    setShow18PlusContent(!checked);
                    toast({
                      title: "Couldn't update preference",
                      description: "Please try again.",
                      variant: "destructive",
                    });
                  }
                }}
                disabled={isUpdating}
                aria-label="Toggle 18+ content visibility"
              />
            </div>
          </Card>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Blocked Users</h2>
          <Card className="p-6 rounded-3xl space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Users you've blocked won't be able to see your clips or interact with you. You won't see their content either.
              </p>
              {isLoadingBlockedUsers ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
                  ))}
                </div>
              ) : blockedUsers.length > 0 ? (
                <div className="space-y-2">
                  {blockedUsers.map((block) => (
                      <BlockedUserItem
                        key={block.id}
                        block={block}
                        onUnblock={refetchBlockedUsers}
                      />
                    ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Ban className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No blocked users</p>
                  <p className="text-xs mt-1">You can block users from their profile page</p>
                </div>
              )}
            </div>
          </Card>
          </section>
        </TabsContent>

        <TabsContent value="profile" className="space-y-8 mt-6">
          {/* Profile overview card */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Profile Overview</h2>
            <Card className="p-6 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center gap-6 bg-gradient-to-br from-background via-background/80 to-muted/70 border-border/70">
              <div className="flex-shrink-0">
                <div className="h-16 w-16 rounded-full bg-gradient-to-tr from-violet-500 to-emerald-400 flex items-center justify-center text-2xl shadow-md">
                  {profile?.emoji_avatar ?? "🎧"}
                </div>
              </div>
              <div className="space-y-2 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Handle
                  </p>
                  {profile?.handle && (
                    <span className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-2.5 py-0.5 text-xs font-medium text-foreground">
                      {profile.handle}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {profile?.bio
                    ? (profile as any).bio
                    : "Add a short bio and avatar to help people recognize your voice and style across Vocalix."}
                </p>
                <p className="text-xs text-muted-foreground/80">
                  Changes you make below update how your profile appears on your clips and in communities.
                </p>
              </div>
            </Card>
          </section>

          {/* Profile customization controls */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Profile Customization</h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-6 rounded-3xl space-y-4">
                <div>
                  <p className="text-sm font-medium">Identity & bio</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tune your bio, profile picture, and emoji avatar so people know who they’re listening to.
                  </p>
                </div>
                <ProfileBioEditor />
                <ProfilePictureUpload />
                <AvatarSelector />
              </Card>

              <Card className="p-6 rounded-3xl space-y-4">
                <div>
                  <p className="text-sm font-medium">Visual style</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Choose a cover image and color theme to give your profile its own vibe.
                  </p>
                </div>
                <CoverImageUpload />
                <ColorSchemePicker />
              </Card>
            </div>
          </section>
          
          {/* Personalization + feed controls */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Personalization</h2>
            <Card className="p-6 rounded-3xl space-y-4">
              <div>
                <p className="text-sm font-medium">What you see & hear</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Adjust recommendations, feeds, and blocks so your experience feels tailored to you.
                </p>
              </div>
              <PersonalizationPreferences />
              <FeedCustomizationSettings />
              <MuteBlockSettings />
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="account" className="space-y-8 mt-6">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Account</h2>
          <Card className="p-6 rounded-3xl space-y-4">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="font-medium">
                    {isMobile ? "Access on your computer" : "Access on your phone"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isMobile 
                      ? "Generate a login link or PIN to link your computer to this account" + (isAdmin ? " (admin access will be transferred)" : "")
                      : "Scan QR code or generate PIN to link your phone to this account" + (isAdmin ? " (admin access will be transferred)" : "")
                    }
                  </p>
                </div>
              </div>
              
              {/* Tab Switcher */}
              <div className="flex gap-2 p-1 rounded-2xl bg-muted/40 border border-border/60">
                <Button
                  variant={deviceAccessTab === "linking" ? "default" : "ghost"}
                  className={`flex-1 rounded-xl ${deviceAccessTab === "linking" ? "" : "hover:bg-muted"}`}
                  onClick={() => setDeviceAccessTab("linking")}
                >
                  <LinkIcon className="mr-2 h-4 w-4" />
                  Device Linking
                </Button>
                <Button
                  variant={deviceAccessTab === "login" ? "default" : "ghost"}
                  className={`flex-1 rounded-xl ${deviceAccessTab === "login" ? "" : "hover:bg-muted"}`}
                  onClick={() => setDeviceAccessTab("login")}
                >
                  <Key className="mr-2 h-4 w-4" />
                  Login PIN
                </Button>
              </div>

              {/* Device Linking Tab Content */}
              {deviceAccessTab === "linking" && (
                <div className="space-y-4" data-tutorial="settings-account-linking">
                  {/* PIN Linking Toggle */}
                  <div className="flex items-center justify-between p-4 rounded-2xl border border-border/60 bg-muted/40">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-primary/10">
                        <Lock className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">PIN Account Linking</p>
                        <p className="text-xs text-muted-foreground">
                          Generate a 4-digit PIN to link devices securely
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={pinLinkingEnabled}
                      onCheckedChange={setPinLinkingEnabled}
                      className="rounded-full"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {isMobile ? (
                      <>
                        <Button
                          variant="outline"
                          className="rounded-2xl flex-1"
                          onClick={() => setIsMagicLinkDialogOpen(true)}
                        >
                          <QrCode className="mr-2 h-4 w-4" />
                          Generate Link
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-2xl flex-1"
                          onClick={handleGeneratePin}
                          disabled={isGeneratingPin || !pinLinkingEnabled}
                        >
                          <Key className="mr-2 h-4 w-4" />
                          {isGeneratingPin ? "Generating..." : "Generate PIN"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          className="rounded-2xl flex-1"
                          onClick={handleGeneratePhoneQRCode}
                          disabled={isGeneratingPhoneQR}
                        >
                          <QrCode className="mr-2 h-4 w-4" />
                          {isGeneratingPhoneQR ? "Generating..." : showSiteQRCode ? "Hide QR" : "Show QR"}
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-2xl flex-1"
                          onClick={handleGeneratePin}
                          disabled={isGeneratingPin || !pinLinkingEnabled}
                        >
                          <Key className="mr-2 h-4 w-4" />
                          {isGeneratingPin ? "Generating..." : "Generate PIN"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Login PIN Tab Content */}
              {deviceAccessTab === "login" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-2xl border border-border/60 bg-muted/40">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-primary/10">
                        <Key className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Personal Login PIN</p>
                        <p className="text-xs text-muted-foreground">
                          Choose a PIN you can use with your handle to log in on any device
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="rounded-2xl"
                      onClick={() => {
                        setPinError(null);
                        setCurrentPin("");
                        setNewPin("");
                        setConfirmNewPin("");
                        setIsPinDialogOpen(true);
                      }}
                    >
                      Set / Change PIN
                    </Button>
                  </div>
                  <div className="rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/20 p-4">
                    <p className="text-sm text-muted-foreground">
                      <strong className="text-foreground">How it works:</strong> Set a personal PIN (4-8 digits) that you can use with your handle to log in on any device. Go to <Link to="/login-pin" className="text-primary underline">/login-pin</Link> and enter your handle and PIN to sign in.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* QR Code Display - Show right after buttons (only for linking tab) */}
            {deviceAccessTab === "linking" && !isMobile && showSiteQRCode && phoneQRCodeUrl && (
              <div className="space-y-3 mt-4">
                {isAdmin && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 mb-3">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-1">
                      ⚠️ Admin Account
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      This device will receive admin access when you scan this QR code. Only scan on trusted devices.
                    </p>
                  </div>
                )}
                <div className="flex justify-center p-4 bg-background rounded-xl border-2 border-border/40">
                  <QRCodeSVG 
                    value={phoneQRCodeUrl} 
                    size={200}
                    level="M"
                    includeMargin={true}
                  />
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Scan with your phone camera to link this device to your account
                </p>
              </div>
            )}
            
            {/* PIN Display Section (only for linking tab) */}
            {deviceAccessTab === "linking" && accountLinkPin && pinExpiresAt && pinLinkingEnabled && (
              <div className="mt-4 p-4 rounded-2xl border border-primary/20 bg-primary/5 dark:bg-primary/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Key className="h-5 w-5 text-primary" />
                    <p className="font-semibold">Account Linking PIN</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => {
                      setAccountLinkPin(null);
                      setPinExpiresAt(null);
                    }}
                  >
                    ×
                  </Button>
                </div>
                <div className="text-center space-y-3">
                  <div className="text-4xl font-mono font-bold tracking-widest text-primary">
                    {accountLinkPin}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>
                      Expires in {Math.max(0, Math.floor((pinExpiresAt.getTime() - Date.now()) / 1000 / 60))} minutes
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter this PIN on another device at <strong>/link-pin</strong> or click the lock icon in the header
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(accountLinkPin);
                          toast({
                            title: "PIN copied",
                            description: "PIN copied to clipboard.",
                          });
                        } catch {
                          toast({
                            title: "Couldn't copy",
                            description: "Please copy the PIN manually.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy PIN
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      asChild
                    >
                      <Link to="/link-pin" target="_blank">
                        Open PIN Entry
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            {deviceAccessTab === "linking" && !pinLinkingEnabled && (
              <div className="mt-4 p-3 rounded-2xl border border-border/60 bg-muted/40">
                <p className="text-sm text-muted-foreground text-center">
                  PIN linking is disabled. Enable it above to generate PINs for account linking.
                </p>
              </div>
            )}
            
            {/* Privacy Settings Section */}
            <div className="mt-6 pt-6 border-t border-border/60 space-y-4">
              <div>
                <h3 className="font-semibold mb-1">Privacy Settings</h3>
                <p className="text-sm text-muted-foreground">
                  Control who can see your profile and content
                </p>
              </div>
              
              {/* Private Account */}
              <div className="flex items-center justify-between p-4 rounded-2xl border border-border/60 bg-muted/40">
                <div className="flex items-center gap-3 flex-1">
                  <div className="p-2 rounded-full bg-primary/10">
                    <Lock className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Private Account</p>
                    <p className="text-xs text-muted-foreground">
                      Only approved followers can see your clips. Others can see your profile but not your content.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isPrivateAccount}
                  onCheckedChange={async (checked) => {
                    setIsPrivateAccount(checked);
                    try {
                      // @ts-ignore
                      await updateProfile({ is_private_account: checked });
                      await refetch();
                      toast({
                        title: checked ? "Account is now private" : "Account is now public",
                        description: checked 
                          ? "Only approved followers can see your clips"
                          : "Everyone can see your clips",
                      });
                    } catch (error) {
                      setIsPrivateAccount(!checked);
                      toast({
                        title: "Failed to update privacy setting",
                        variant: "destructive",
                      });
                    }
                  }}
                  className="rounded-full"
                />
              </div>
              
              {/* Hide from Search */}
              <div className="flex items-center justify-between p-4 rounded-2xl border border-border/60 bg-muted/40">
                <div className="flex items-center gap-3 flex-1">
                  <div className="p-2 rounded-full bg-muted">
                    <SearchIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Hide from Search</p>
                    <p className="text-xs text-muted-foreground">
                      Your profile won't appear in search results
                    </p>
                  </div>
                </div>
                <Switch
                  checked={hideFromSearch}
                  onCheckedChange={async (checked) => {
                    setHideFromSearch(checked);
                    try {
                      // @ts-ignore
                      await updateProfile({ hide_from_search: checked });
                      await refetch();
                      toast({
                        title: checked ? "Hidden from search" : "Visible in search",
                      });
                    } catch (error) {
                      setHideFromSearch(!checked);
                      toast({
                        title: "Failed to update setting",
                        variant: "destructive",
                      });
                    }
                  }}
                  className="rounded-full"
                />
              </div>
              
              {/* Hide from Discovery */}
              <div className="flex items-center justify-between p-4 rounded-2xl border border-border/60 bg-muted/40">
                <div className="flex items-center gap-3 flex-1">
                  <div className="p-2 rounded-full bg-muted">
                    <Compass className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Hide from Discovery</p>
                    <p className="text-xs text-muted-foreground">
                      Your profile won't appear in recommendations or discovery feeds
                    </p>
                  </div>
                </div>
                <Switch
                  checked={hideFromDiscovery}
                  onCheckedChange={async (checked) => {
                    setHideFromDiscovery(checked);
                    try {
                      // @ts-ignore
                      await updateProfile({ hide_from_discovery: checked });
                      await refetch();
                      toast({
                        title: checked ? "Hidden from discovery" : "Visible in discovery",
                      });
                    } catch (error) {
                      setHideFromDiscovery(!checked);
                      toast({
                        title: "Failed to update setting",
                        variant: "destructive",
                      });
                    }
                  }}
                  className="rounded-full"
                />
              </div>
              
              {/* Require Approval to Follow */}
              {isPrivateAccount && (
                <div className="flex items-center justify-between p-4 rounded-2xl border border-border/60 bg-muted/40">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="p-2 rounded-full bg-muted">
                      <UserCheck className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Approve Follow Requests</p>
                      <p className="text-xs text-muted-foreground">
                        Review and approve follow requests before users can follow you
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={requireApprovalToFollow}
                    onCheckedChange={async (checked) => {
                      setRequireApprovalToFollow(checked);
                      try {
                        // @ts-ignore
                        await updateProfile({ require_approval_to_follow: checked });
                        await refetch();
                        toast({
                          title: checked ? "Follow approval enabled" : "Follow approval disabled",
                        });
                      } catch (error) {
                        setRequireApprovalToFollow(!checked);
                        toast({
                          title: "Failed to update setting",
                          variant: "destructive",
                        });
                      }
                    }}
                    className="rounded-full"
                  />
                </div>
              )}
            </div>
            
            {/* Active Links Section */}
            {(activeLinks.length > 0 || isLoadingActiveLinks) && (
              <div className="mt-6 pt-6 border-t border-border/60">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-medium">Active login links</p>
                    <p className="text-sm text-muted-foreground">
                      Links you've generated that are still valid
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-2xl"
                    onClick={loadActiveLinks}
                    disabled={isLoadingActiveLinks}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingActiveLinks ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
                {isLoadingActiveLinks && activeLinks.length === 0 ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : activeLinks.length > 0 ? (
                  <div className="space-y-2">
                    {activeLinks
                      .filter((link) => {
                        // Filter out expired links
                        const expiresAt = new Date(link.expiresAt);
                        return !isNaN(expiresAt.getTime()) && expiresAt > new Date();
                      })
                      .map((link) => {
                        const expiresAt = new Date(link.expiresAt);
                        const expiresDisplay = expiresAt.toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        });
                        const linkTypeDisplay =
                          link.linkType === "one_time"
                            ? "Quick share (1 hour)"
                            : link.linkType === "extended"
                            ? "Extended (7 days)"
                            : "Standard (7 days)";

                        return (
                          <div
                            key={link.id}
                            className="rounded-2xl border border-border/60 bg-muted/40 p-4 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <LinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                  <span className="text-sm font-medium">{linkTypeDisplay}</span>
                                  {link.isActive && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-600 dark:text-green-400">
                                      Active
                                    </span>
                                  )}
                                </div>
                                {link.url && link.url.length > 0 ? (
                                  <div className="rounded-xl bg-background/80 px-3 py-2 text-xs font-mono break-all border border-border/40 mt-2">
                                    {link.url}
                                  </div>
                                ) : (
                                  <div className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground mt-2 border border-border/40">
                                    <p className="font-medium mb-1">Link is active</p>
                                    <p className="text-xs opacity-80">
                                      The full URL isn't available on this device. Generate a new link to get the URL and QR code.
                                    </p>
                                  </div>
                                )}
                                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                  <span>Expires: {expiresDisplay}</span>
                                  {link.email && (
                                    <span>• Email: {link.email}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {link.url && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="rounded-xl"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(link.url);
                                        toast({
                                          title: "Link copied",
                                          description: "The login link has been copied to your clipboard.",
                                        });
                                      } catch {
                                        toast({
                                          title: "Couldn't copy",
                                          description: "Please select and copy the link manually.",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDeactivateLink(link.id)}
                                  title="Deactivate link"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <LinkIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No active links</p>
                    <p className="text-xs mt-1">Generate a link to see it here</p>
                  </div>
                )}
              </div>
            )}


            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-medium">Change pseudonym</p>
                <p className="text-sm text-muted-foreground">
                  Pick a new name for your clips. You can do this once every {CHANGE_WINDOW_DAYS} days.
                </p>
                {isHandleChangeLocked && nextHandleChangeDate && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Next change available on {nextHandleChangeDate.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={handleOpenHandleDialog}
                disabled={isHandleChangeLocked}
              >
                Edit name
              </Button>
            </div>

            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-medium">Export profile data</p>
                <p className="text-sm text-muted-foreground">
                  Download a JSON file with your profile, clips, listens, and reactions (GDPR compliant).
                </p>
              </div>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={handleExportData}
                disabled={isExporting}
              >
                <Download className="mr-2 h-4 w-4" />
                {isExporting ? "Preparing..." : "Export JSON"}
              </Button>
            </div>

            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-medium">Interactive Tutorial</p>
                <p className="text-sm text-muted-foreground">
                  Restart the interactive tutorial to learn how to use Vocalix.
                </p>
              </div>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={handleRestartTutorial}
              >
                <GraduationCap className="mr-2 h-4 w-4" />
                Restart Tutorial
              </Button>
            </div>

            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-medium">Log in on a new device</p>
                <p className="text-sm text-muted-foreground">
                  Generate a secure login link to sign in from another device. Links last up to 7 days.
                </p>
              </div>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => setIsMagicLinkDialogOpen(true)}
              >
                Send link
              </Button>
            </div>

            <AlertDialog open={showDeleteAccountDialog} onOpenChange={setShowDeleteAccountDialog}>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  className="rounded-2xl"
                  onClick={() => setShowDeleteAccountDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-4 pt-2">
                      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
                        <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-1">
                          ⚠️ This action cannot be undone
                        </p>
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          Choose what happens to your content before deleting your account.
                        </p>
                      </div>
                      
                      {/* Keep Content Option */}
                      <div className="flex items-start gap-3 p-3 rounded-xl border border-border/60 bg-muted/40">
                        <input
                          type="checkbox"
                          id="keepContent"
                          checked={keepContentOnDelete}
                          onChange={(e) => setKeepContentOnDelete(e.target.checked)}
                          className="mt-0.5 rounded border-border"
                        />
                        <div className="flex-1">
                          <label htmlFor="keepContent" className="text-sm font-medium cursor-pointer block mb-1">
                            Keep my content
                          </label>
                          <p className="text-xs text-muted-foreground">
                            Your clips, posts, and comments will remain visible but will be anonymized (shown as "deleted_user_xxx"). 
                            Your profile, follows, and personal data will be removed.
                          </p>
                        </div>
                      </div>
                      
                      {!keepContentOnDelete && (
                        <div>
                          <p className="text-sm text-foreground mb-2">If you choose to delete everything:</p>
                          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside ml-2">
                            <li>All your clips and posts will be permanently deleted</li>
                            <li>All comments and reactions will be removed</li>
                            <li>Your profile and all personal data will be deleted</li>
                            <li>You will be removed from all communities and chats</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 sm:gap-0">
                  <AlertDialogCancel 
                    className="rounded-2xl"
                    onClick={() => {
                      setKeepContentOnDelete(false);
                      setShowDeleteAccountDialog(false);
                    }}
                  >
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={isDeleting}
                    onClick={handleDeleteAccount}
                  >
                    {isDeleting 
                      ? (keepContentOnDelete ? "Anonymizing..." : "Deleting...") 
                      : (keepContentOnDelete ? "Anonymize Account" : "Delete Everything")
                    }
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Card>
          </section>
        </TabsContent>

        {/* Personal Login PIN Dialog */}
        <AlertDialog open={isPinDialogOpen} onOpenChange={setIsPinDialogOpen}>
          <AlertDialogContent className="rounded-3xl max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Set your login PIN</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4 pt-1">
                  <p className="text-sm text-muted-foreground">
                    This PIN lets you log in with your Vocalix name on any device. It&apos;s
                    separate from the one-time device linking PIN above.
                  </p>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Current PIN (leave blank if you&apos;ve never set one)
                      </p>
                      <Input
                        type="password"
                        inputMode="numeric"
                        maxLength={8}
                        value={currentPin}
                        onChange={(e) => setCurrentPin(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="••••"
                        className="rounded-2xl"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        New PIN (4–8 digits)
                      </p>
                      <Input
                        type="password"
                        inputMode="numeric"
                        maxLength={8}
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="Choose a PIN"
                        className="rounded-2xl"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Confirm new PIN
                      </p>
                      <Input
                        type="password"
                        inputMode="numeric"
                        maxLength={8}
                        value={confirmNewPin}
                        onChange={(e) => setConfirmNewPin(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="Repeat your PIN"
                        className="rounded-2xl"
                      />
                    </div>
                  </div>
                  {pinError && (
                    <div className="rounded-2xl bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
                      {pinError}
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-0">
              <AlertDialogCancel
                className="rounded-2xl"
                onClick={() => {
                  if (isSavingPin) return;
                  setIsPinDialogOpen(false);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="rounded-2xl"
                disabled={isSavingPin}
                onClick={async (e) => {
                  e.preventDefault();
                  if (isSavingPin) return;
                  setPinError(null);

                  if (!newPin || newPin.length < 4 || newPin.length > 8) {
                    setPinError("PIN must be 4–8 digits.");
                    return;
                  }
                  if (newPin !== confirmNewPin) {
                    setPinError("New PIN and confirmation do not match.");
                    return;
                  }

                  setIsSavingPin(true);
                  try {
                    // @ts-ignore - RPC defined in migrations but not in generated types
                    const { data, error } = await (supabase.rpc as any)("set_login_pin", {
                      p_current_pin: currentPin || null,
                      p_new_pin: newPin,
                    });

                    if (error) {
                      console.error("set_login_pin error", error);
                      throw error;
                    }

                    const result = Array.isArray(data) ? data[0] : null;
                    if (!result?.success) {
                      setPinError(result?.message || "Could not update your PIN. Please try again.");
                      return;
                    }

                    toast({
                      title: "Login PIN updated",
                      description:
                        "You can now log in with your handle and this PIN on any device via the Login with PIN page.",
                    });
                    setIsPinDialogOpen(false);
                  } catch (err: any) {
                    console.error("Failed to set login PIN", err);
                    setPinError(
                      err?.message || "Something went wrong while saving your PIN. Please try again."
                    );
                  } finally {
                    setIsSavingPin(false);
                  }
                }}
              >
                {isSavingPin ? "Saving…" : "Save PIN"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <TabsContent value="security" className="space-y-8 mt-6">
          {/* Email Recovery Section */}
          <section className="space-y-4" id="email-recovery">
            <h2 className="text-lg font-semibold">Email Recovery</h2>
            <Card className="p-6 rounded-3xl space-y-4">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Set up an email address for account recovery. If you forget your login PIN, we can send you a reset link to this email address.
                  </p>
                  
                  <div className="flex items-center justify-between p-4 rounded-2xl border border-border/60 bg-muted/40">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm mb-1">Recovery Email</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {recoveryEmail || "Not set"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl ml-4"
                      onClick={() => {
                        setPendingRecoveryEmail(recoveryEmail);
                        setHasAcceptedRecoveryWarning(false);
                        setIsRecoveryEmailDialogOpen(true);
                      }}
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      {recoveryEmail ? "Change" : "Set Email"}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </section>

          {/* Device Activity Section */}
          <section className="space-y-4" id="device-activity">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Device Activity</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  // Force update user_agent and refresh devices
                  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
                  if (userAgent && deviceId) {
                    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
                    const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
                    
                    // Try the RPC function first
                    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_current_device_user_agent`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "apikey": SUPABASE_KEY,
                        "Authorization": `Bearer ${SUPABASE_KEY}`,
                        "x-device-id": deviceId,
                      },
                      body: JSON.stringify({ p_user_agent: userAgent }),
                    });
                    
                    // If RPC function doesn't exist, try direct update
                    if (!response.ok) {
                      console.log("RPC function failed, trying direct update...");
                      // Direct update using Supabase client
                      // @ts-ignore - user_agent column exists but not in types
                      const { error: updateError } = await supabase
                        .from("devices")
                        .update({
                          user_agent: userAgent,
                          last_seen_at: new Date().toISOString(),
                        } as any)
                        .eq("device_id", deviceId);
                      
                      if (updateError) {
                        throw updateError;
                      }
                    }
                  }
                  
                  // Wait a moment for the update to process
                  await new Promise(resolve => setTimeout(resolve, 300));
                  
                  // Refetch devices to show updated info
                  await refetchDevices();
                  toast({
                    title: "Device info updated",
                    description: "Browser and activity information has been refreshed.",
                  });
                } catch (error) {
                  logError("Failed to refresh device info", error);
                  toast({
                    title: "Error",
                    description: "Failed to refresh device info. Please check the console for details.",
                    variant: "destructive",
                  });
                }
              }}
              disabled={isLoadingDevices}
              className="rounded-xl"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingDevices ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <Card className="p-6 rounded-3xl space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                View and manage devices where you're logged in. See detailed information about each device including browser, operating system, location, and activity. You can revoke access from any device to sign it out immediately.
              </p>
              
              {/* Account Linking Info */}
              <div className="mt-4 p-5 rounded-3xl border-2 border-primary/20 bg-primary/5 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-2xl bg-primary/15 flex-shrink-0">
                    <LinkIcon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base mb-2">Account Linking</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Link your account to multiple devices using magic login links. All linked devices will have access to the same account, including admin privileges if your account has them. Perfect for accessing your account on your phone, tablet, and computer.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-background/50 border border-border/60">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-sm text-foreground mb-0.5">Current devices</p>
                          <p className="text-xs text-muted-foreground">
                            {devices.filter(d => !d.is_revoked).length} device{devices.filter(d => !d.is_revoked).length !== 1 ? 's' : ''} linked to your account
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-background/50 border border-border/60">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-sm text-foreground mb-0.5">Link more devices</p>
                          <p className="text-xs text-muted-foreground">
                            Go to the <strong className="text-foreground">Account</strong> tab to generate a magic login link
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-background/50 border border-border/60 sm:col-span-2">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-sm text-foreground mb-0.5">Security</p>
                          <p className="text-xs text-muted-foreground">
                            Revoke any device to sign it out immediately. All devices show detailed information including browser, OS, location, and activity for your security.
                          </p>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => {
                        // Switch to Account tab
                        handleTabChange("account");
                      }}
                    >
                      <LinkIcon className="h-4 w-4 mr-2" />
                      Generate Login Link
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {devicesError ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-muted-foreground">Unable to load devices</p>
                <p className="text-xs text-muted-foreground">
                  {devicesError.message || "Please make sure migrations have been run."}
                </p>
                {deviceId && (
                  <div className="mt-4 p-4 rounded-2xl border border-border/60 bg-card/80">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-primary/10">
                        <Monitor className="h-5 w-5" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">Current Device</p>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                            <CheckCircle2 className="h-3 w-3" />
                            This device
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">Device ID: {deviceId.slice(0, 8)}...</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : isLoadingDevices ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Loading devices...</p>
              </div>
            ) : devices.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-muted-foreground">
                  {devicesError 
                    ? "Unable to load devices from database"
                    : "No devices found"}
                </p>
                {deviceId && (
                  <div className="mt-4 p-4 rounded-2xl border border-primary/50 bg-primary/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-primary/10">
                        <Monitor className="h-5 w-5" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">Current Device</p>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                            <CheckCircle2 className="h-3 w-3" />
                            This device
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Device ID: {deviceId.slice(0, 8)}...{deviceId.slice(-4)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Active now
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Tabs value={devicesTab} onValueChange={(v) => setDevicesTab(v as "active" | "revoked")}>
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="active" className="rounded-xl">
                    Active ({devices.filter(d => !d.is_revoked).length})
                  </TabsTrigger>
                  <TabsTrigger value="revoked" className="rounded-xl">
                    Revoked ({devices.filter(d => d.is_revoked).length})
                  </TabsTrigger>
                </TabsList>
              <TabsContent value="active" className="space-y-3">
                {/* Show count and "Revoke All Others" if multiple devices */}
                {devices.filter(d => !d.is_revoked).length > 0 && (
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/50 border border-border/60">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-primary/10">
                        <Monitor className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">
                          {devices.filter(d => !d.is_revoked).length} {devices.filter(d => !d.is_revoked).length === 1 ? "device" : "devices"} active
                        </p>
                      </div>
                    </div>
                    {devices.filter(d => d.device_id !== deviceId && !d.is_revoked).length > 0 && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl text-destructive hover:text-destructive"
                            disabled={isRevoking}
                          >
                            Revoke All Others
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-3xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke all other devices?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will sign out all other devices ({devices.filter(d => d.device_id !== deviceId && !d.is_revoked).length} device{devices.filter(d => d.device_id !== deviceId && !d.is_revoked).length !== 1 ? 's' : ''}) and prevent them from accessing your account. You can sign in again using a login link.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="rounded-2xl bg-destructive hover:bg-destructive/90"
                              onClick={async () => {
                                const otherDevices = devices.filter(d => d.device_id !== deviceId && !d.is_revoked);
                                let successCount = 0;
                                let failCount = 0;
                                
                                for (const device of otherDevices) {
                                  try {
                                    await revokeDevice(device.device_id);
                                    successCount++;
                                  } catch (error) {
                                    logError("Failed to revoke device", error, device.device_id);
                                    failCount++;
                                  }
                                }
                                
                                if (successCount > 0) {
                                  toast({
                                    title: `${successCount} device${successCount !== 1 ? 's' : ''} revoked`,
                                    description: failCount > 0 ? `${failCount} device${failCount !== 1 ? 's' : ''} could not be revoked.` : "All other devices have been signed out.",
                                  });
                                } else {
                                  toast({
                                    title: "Couldn't revoke devices",
                                    description: "Please try again.",
                                    variant: "destructive",
                                  });
                                }
                              }}
                            >
                              Revoke All
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                )}
                
                {devices.filter(d => !d.is_revoked).map((device) => {
                  const isCurrentDevice = device.device_id === deviceId;
                  const lastSeen = device.last_seen_at
                    ? formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true })
                    : "Never";
                  const firstSeen = device.first_seen_at
                    ? new Date(device.first_seen_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Unknown";
                  const lastSeenDate = device.last_seen_at
                    ? new Date(device.last_seen_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : null;

                  // Detect device type from user agent
                  const userAgent = device.user_agent || "";
                  let deviceType: "mobile" | "desktop" | "tablet" = "desktop";
                  let DeviceIcon = Monitor;
                  let osName = "";
                  if (/mobile|android|iphone|ipod/i.test(userAgent)) {
                    deviceType = "mobile";
                    DeviceIcon = Smartphone;
                    if (/iphone|ipod/i.test(userAgent)) osName = "iOS";
                    else if (/android/i.test(userAgent)) {
                      const androidMatch = userAgent.match(/Android ([0-9.]+)/i);
                      osName = `Android${androidMatch ? ` ${androidMatch[1]}` : ""}`;
                    }
                  } else if (/tablet|ipad/i.test(userAgent)) {
                    deviceType = "tablet";
                    DeviceIcon = Tablet;
                    if (/ipad/i.test(userAgent)) osName = "iPadOS";
                    else if (/android/i.test(userAgent)) osName = "Android";
                  } else {
                    if (/windows/i.test(userAgent)) osName = "Windows";
                    else if (/macintosh|mac os/i.test(userAgent)) {
                      const macMatch = userAgent.match(/Mac OS X ([0-9_]+)/i);
                      osName = macMatch ? `macOS ${macMatch[1].replace(/_/g, ".")}` : "macOS";
                    }
                    else if (/linux/i.test(userAgent)) osName = "Linux";
                    else if (/ubuntu/i.test(userAgent)) osName = "Ubuntu";
                  }

                  // Get browser name and version (improved detection)
                  let browserName = "Unknown Browser";
                  let browserVersion = "";
                  
                  if (!userAgent || userAgent.trim() === "") {
                    // Device has no user_agent - use default values
                    browserName = "Unknown Browser";
                  } else {
                    const ua = userAgent.toLowerCase();
                    
                    // Check for Edge first (since it contains Chrome)
                    if (ua.includes("edg") || ua.includes("edg/")) {
                      browserName = "Edge";
                      const match = userAgent.match(/Edg(?:e)?\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    }
                    // Check for Opera (contains Chrome)
                    else if (ua.includes("opr") || ua.includes("opera")) {
                      browserName = "Opera";
                      const match = userAgent.match(/(?:OPR|Opera)\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    }
                    // Check for Chrome (but not Edge or Opera)
                    else if (ua.includes("chrome") && !ua.includes("edg") && !ua.includes("opr")) {
                      browserName = "Chrome";
                      const match = userAgent.match(/Chrome\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    }
                    // Check for Firefox
                    else if (ua.includes("firefox")) {
                      browserName = "Firefox";
                      const match = userAgent.match(/Firefox\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    }
                    // Check for Safari (but not Chrome-based)
                    else if (ua.includes("safari") && !ua.includes("chrome")) {
                      browserName = "Safari";
                      const match = userAgent.match(/Version\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    }
                    // Check for Brave
                    else if (ua.includes("brave")) {
                      browserName = "Brave";
                      const match = userAgent.match(/Chrome\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    }
                    // Check for Vivaldi
                    else if (ua.includes("vivaldi")) {
                      browserName = "Vivaldi";
                      const match = userAgent.match(/Chrome\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    }
                    // Check for Samsung Internet
                    else if (ua.includes("samsungbrowser")) {
                      browserName = "Samsung Internet";
                      const match = userAgent.match(/SamsungBrowser\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    }
                    // Fallback: try to extract any browser name
                    else {
                      const match = userAgent.match(/([A-Za-z]+)\/([0-9.]+)/);
                      if (match && match[1]) {
                        browserName = match[1];
                        browserVersion = match[2] || "";
                      }
                    }
                  }

                  // Format IP address (mask for privacy)
                  const formatIP = (ip: string | null) => {
                    if (!ip) return null;
                    // For IPv4, show first two octets
                    if (ip.includes(".")) {
                      const parts = ip.split(".");
                      return `${parts[0]}.${parts[1]}.xxx.xxx`;
                    }
                    // For IPv6, show first segment
                    if (ip.includes(":")) {
                      const parts = ip.split(":");
                      return `${parts[0]}:${parts[1]}:xxxx:xxxx`;
                    }
                    return ip;
                  };

                  const maskedIP = formatIP(device.ip_address);
                  const deviceTypeLabel = deviceType === "mobile" ? "Mobile" : deviceType === "tablet" ? "Tablet" : "Desktop";
                  const browserVersionMajor = browserVersion ? browserVersion.split(".")[0] : "";

                  return (
                    <Card
                      key={device.id}
                      className={`rounded-3xl border-2 overflow-hidden transition-all ${
                        isCurrentDevice
                          ? "border-primary/60 bg-primary/5 shadow-lg shadow-primary/10"
                          : device.is_revoked
                          ? "border-destructive/40 bg-destructive/5 opacity-70"
                          : "border-border/60 bg-card hover:border-border/80 hover:shadow-md"
                      }`}
                    >
                      <div className="p-5 space-y-4">
                        {/* Header Row */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4 flex-1 min-w-0">
                            <div
                              className={`p-3 rounded-2xl flex-shrink-0 ${
                                isCurrentDevice 
                                  ? "bg-primary/15 text-primary" 
                                  : device.is_revoked 
                                  ? "bg-destructive/15 text-destructive"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              <DeviceIcon className="h-6 w-6" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h3 className="font-semibold text-base truncate">
                                  {browserName} {browserVersionMajor && `v${browserVersionMajor}`} {deviceTypeLabel}
                                </h3>
                                {osName && (
                                  <span className="text-xs text-muted-foreground hidden sm:inline">
                                    • {osName}
                                  </span>
                                )}
                              </div>
                              {osName && (
                                <p className="text-xs text-muted-foreground sm:hidden mb-2">{osName}</p>
                              )}
                              <div className="flex items-center gap-2 flex-wrap mt-2">
                                {isCurrentDevice && (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/20">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    This device
                                  </span>
                                )}
                                {device.is_revoked && (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/15 text-destructive border border-destructive/20">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Revoked
                                  </span>
                                )}
                                {device.is_suspicious && !device.is_revoked && (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20">
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                      Suspicious
                                    </span>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2.5 text-xs border-yellow-500/30"
                                      onClick={async () => {
                                        try {
                                          await clearSuspiciousFlag(device.device_id);
                                          toast({
                                            title: "Suspicious flag cleared",
                                            description: "This device is no longer marked as suspicious.",
                                          });
                                        } catch (error) {
                                          logError("Failed to clear suspicious flag", error);
                                          toast({
                                            title: "Error",
                                            description: "Failed to clear suspicious flag. Please try again.",
                                            variant: "destructive",
                                          });
                                        }
                                      }}
                                      disabled={isClearingSuspicious}
                                    >
                                      {isClearingSuspicious ? "Clearing..." : "Clear Flag"}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Revoke Button */}
                          {!isCurrentDevice && !device.is_revoked && (
                            <div className="flex-shrink-0">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl text-destructive hover:text-destructive hover:border-destructive"
                                    disabled={isRevoking}
                                  >
                                    Revoke
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-3xl">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Revoke this device?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      <div className="space-y-2 mt-2">
                                        <p>This will sign out this device and prevent it from accessing your account.</p>
                                        <div className="p-3 rounded-xl bg-muted space-y-1 text-sm">
                                          <p><strong>Device:</strong> {browserName} {browserVersionMajor && `v${browserVersionMajor}`} {deviceTypeLabel}</p>
                                          {osName && <p><strong>OS:</strong> {osName}</p>}
                                          <p><strong>Last seen:</strong> {lastSeen}</p>
                                          {maskedIP && <p><strong>Location:</strong> {maskedIP}</p>}
                                        </div>
                                        <p className="text-xs text-muted-foreground">You can sign in again using a login link.</p>
                                      </div>
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="rounded-2xl bg-destructive hover:bg-destructive/90"
                                      onClick={async () => {
                                        try {
                                          await revokeDevice(device.device_id);
                                          toast({
                                            title: "Device revoked",
                                            description: `${browserName} ${deviceTypeLabel} has been signed out.`,
                                          });
                                        } catch (error) {
                                          logError("Failed to revoke device", error);
                                          toast({
                                            title: "Couldn't revoke device",
                                            description: "Please try again.",
                                            variant: "destructive",
                                          });
                                        }
                                      }}
                                    >
                                      Revoke Device
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          )}
                        </div>
                        
                        {/* Device Details Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-border/60">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              <span>Last seen</span>
                            </div>
                            <p className="font-medium text-sm">{lastSeen}</p>
                            {lastSeenDate && (
                              <p className="text-xs text-muted-foreground">{lastSeenDate}</p>
                            )}
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>First seen</span>
                            </div>
                            <p className="font-medium text-sm">{firstSeen}</p>
                            {device.first_seen_at && (
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(device.first_seen_at), { addSuffix: true })}
                              </p>
                            )}
                          </div>
                          
                          {maskedIP && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Compass className="h-3.5 w-3.5" />
                                <span>Location</span>
                              </div>
                              <p className="font-medium text-sm font-mono">{maskedIP}</p>
                            </div>
                          )}
                          
                          {device.request_count > 0 && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Activity className="h-3.5 w-3.5" />
                                <span>Activity</span>
                              </div>
                              <p className="font-medium text-sm">{device.request_count.toLocaleString()} requests</p>
                              {device.last_seen_at && (
                                <p className="text-xs text-muted-foreground">
                                  {Math.round(device.request_count / Math.max(1, (Date.now() - new Date(device.first_seen_at || device.last_seen_at).getTime()) / (1000 * 60 * 60 * 24))).toLocaleString()} per day
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Device ID and Account Info */}
                        <div className="pt-3 border-t border-border/60 space-y-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                                <HardDrive className="h-3.5 w-3.5" />
                                <span>Device ID</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <p className="font-mono text-xs text-muted-foreground break-all">
                                  {device.device_id.slice(0, 10)}...{device.device_id.slice(-6)}
                                </p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(device.device_id);
                                      toast({
                                        title: "Copied!",
                                        description: "Device ID copied to clipboard",
                                      });
                                    } catch {
                                      const textArea = document.createElement("textarea");
                                      textArea.value = device.device_id;
                                      document.body.appendChild(textArea);
                                      textArea.select();
                                      document.execCommand("copy");
                                      document.body.removeChild(textArea);
                                      toast({
                                        title: "Copied!",
                                        description: "Device ID copied to clipboard",
                                      });
                                    }
                                  }}
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  Copy
                                </Button>
                              </div>
                            </div>
                          </div>
                          
                          {device.profile_id && (
                            <div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                                <LinkIcon className="h-3.5 w-3.5" />
                                <span>Linked to account</span>
                              </div>
                              <p className="font-medium text-sm">
                                @{profile?.handle || "your account"}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </TabsContent>
              <TabsContent value="revoked" className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground mb-4">
                    View your revoked devices. You can unrevoke a device to restore access if needed.
                  </p>
                </div>
                {devices.filter(d => d.is_revoked).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No revoked devices</p>
                    <p className="text-xs mt-1">Revoked devices will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {devices.filter(d => d.is_revoked).map((device) => {
                      const isCurrentDevice = device.device_id === deviceId;
                      const userAgent = device.user_agent || "Unknown";
                      let browserName = "Browser";
                      let browserVersion = "";
                      let deviceType: "mobile" | "desktop" | "tablet" = "desktop";
                      let DeviceIcon = Monitor;
                      let osName = "";
                      
                      if (userAgent !== "Unknown") {
                        const ua = userAgent.toLowerCase();
                        if (/mobile|android|iphone|ipod/i.test(userAgent)) {
                          deviceType = "mobile";
                          DeviceIcon = Smartphone;
                          if (/iphone|ipod/i.test(userAgent)) osName = "iOS";
                          else if (/android/i.test(userAgent)) {
                            const androidMatch = userAgent.match(/Android ([0-9.]+)/i);
                            osName = `Android${androidMatch ? ` ${androidMatch[1]}` : ""}`;
                          }
                        } else if (/tablet|ipad/i.test(userAgent)) {
                          deviceType = "tablet";
                          DeviceIcon = Tablet;
                          if (/ipad/i.test(userAgent)) osName = "iPadOS";
                          else if (/android/i.test(userAgent)) osName = "Android";
                        } else {
                          if (/windows/i.test(userAgent)) osName = "Windows";
                          else if (/macintosh|mac os/i.test(userAgent)) {
                            const macMatch = userAgent.match(/Mac OS X ([0-9_]+)/i);
                            osName = macMatch ? `macOS ${macMatch[1].replace(/_/g, ".")}` : "macOS";
                          }
                          else if (/linux/i.test(userAgent)) osName = "Linux";
                          else if (/ubuntu/i.test(userAgent)) osName = "Ubuntu";
                        }
                        
                        if (ua.includes("edg") || ua.includes("edg/")) {
                          browserName = "Edge";
                          const match = userAgent.match(/Edg(?:e)?\/([0-9.]+)/i);
                          browserVersion = match ? match[1] : "";
                        } else if (ua.includes("opr") || ua.includes("opera")) {
                          browserName = "Opera";
                          const match = userAgent.match(/(?:OPR|Opera)\/([0-9.]+)/i);
                          browserVersion = match ? match[1] : "";
                        } else if (ua.includes("chrome") && !ua.includes("edg") && !ua.includes("opr")) {
                          browserName = "Chrome";
                          const match = userAgent.match(/Chrome\/([0-9.]+)/i);
                          browserVersion = match ? match[1] : "";
                        } else if (ua.includes("firefox")) {
                          browserName = "Firefox";
                          const match = userAgent.match(/Firefox\/([0-9.]+)/i);
                          browserVersion = match ? match[1] : "";
                        } else if (ua.includes("safari") && !ua.includes("chrome")) {
                          browserName = "Safari";
                          const match = userAgent.match(/Version\/([0-9.]+)/i);
                          browserVersion = match ? match[1] : "";
                        } else {
                          const browserMatch = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)\/(\d+)/i);
                          if (browserMatch) {
                            browserName = browserMatch[1];
                            browserVersion = browserMatch[2] || "";
                          }
                        }
                      }

                      const formatIP = (ip: string | null) => {
                        if (!ip) return null;
                        if (ip.includes(":")) {
                          const parts = ip.split(":");
                          if (parts.length > 4) {
                            return `${parts[0]}:${parts[1]}:xxxx:xxxx`;
                          }
                          return ip;
                        }
                        const parts = ip.split(".");
                        if (parts.length === 4) {
                          return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
                        }
                        return ip;
                      };

                      const maskedIP = formatIP(device.ip_address);
                      const deviceTypeLabel = deviceType === "mobile" ? "Mobile" : deviceType === "tablet" ? "Tablet" : "Desktop";
                      const browserVersionMajor = browserVersion ? browserVersion.split(".")[0] : "";
                      const lastSeen = device.last_seen_at ? formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true }) : "Never";

                      return (
                        <Card
                          key={device.id}
                          className="rounded-3xl border-2 border-destructive/40 bg-destructive/5 opacity-90 overflow-hidden transition-all"
                        >
                          <div className="p-5 space-y-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-4 flex-1 min-w-0">
                                <div className="p-3 rounded-2xl flex-shrink-0 bg-destructive/15 text-destructive">
                                  <DeviceIcon className="h-6 w-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <h3 className="font-semibold text-base truncate">
                                      {browserName} {browserVersionMajor && `v${browserVersionMajor}`} {deviceTypeLabel}
                                    </h3>
                                    {osName && (
                                      <span className="text-xs text-muted-foreground hidden sm:inline">
                                        • {osName}
                                      </span>
                                    )}
                                  </div>
                                  {osName && (
                                    <p className="text-xs text-muted-foreground sm:hidden mb-2">{osName}</p>
                                  )}
                                  <div className="flex items-center gap-2 flex-wrap mt-2">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/15 text-destructive border border-destructive/20">
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                      Revoked
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-xl"
                                onClick={async () => {
                                  try {
                                    await unrevokeDevice(device.device_id);
                                    toast({
                                      title: "Device unrevoked",
                                      description: `${browserName} ${deviceTypeLabel} access has been restored.`,
                                    });
                                  } catch (error) {
                                    logError("Failed to unrevoke device", error);
                                    toast({
                                      title: "Couldn't unrevoke device",
                                      description: "Please try again.",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                                disabled={isUnrevokingDevice}
                              >
                                {isUnrevokingDevice ? "Unrevoking..." : "Unrevoke"}
                              </Button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-border/60">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Activity className="h-3.5 w-3.5" />
                                  <span>Last seen</span>
                                </div>
                                <p className="font-medium text-sm">{lastSeen}</p>
                              </div>
                              {maskedIP && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Compass className="h-3.5 w-3.5" />
                                    <span>Location</span>
                                  </div>
                                  <p className="font-medium text-sm font-mono">{maskedIP}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
              </Tabs>
            )}
          </Card>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Sessions</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                refetchSessions();
                if (sessionsTab === "revoked") refetchRevokedSessions();
              }}
              disabled={isLoadingSessions || isLoadingRevokedSessions}
              className="rounded-2xl"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${(isLoadingSessions || isLoadingRevokedSessions) ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <Card className="p-6 rounded-3xl space-y-4">
            <Tabs value={sessionsTab} onValueChange={(v) => setSessionsTab(v as "active" | "revoked")}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="active" className="rounded-xl">
                  Active ({sessions.length})
                </TabsTrigger>
                <TabsTrigger value="revoked" className="rounded-xl">
                  Revoked ({revokedSessions.length})
                </TabsTrigger>
              </TabsList>
            <TabsContent value="active" className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                View and manage your active login sessions across different browsers and devices. Each session shows detailed information including browser, operating system, location, and expiration time. You can revoke any session to sign out from that browser or device immediately.
              </p>
            </div>
            {isLoadingSessions ? (
              <div className="space-y-2">
                <div className="h-20 rounded-xl bg-muted animate-pulse" />
                <div className="h-20 rounded-xl bg-muted animate-pulse" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No active sessions</p>
                <p className="text-xs mt-1">Sessions will appear here when you log in from different browsers</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.length > 0 && (
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/50 border border-border/60">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-primary/10">
                        <Lock className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">
                          {sessions.length} active {sessions.length === 1 ? "session" : "sessions"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Login sessions across different browsers and devices
                        </p>
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl text-destructive hover:text-destructive hover:border-destructive"
                          disabled={isRevokingAllSessions}
                        >
                          {isRevokingAllSessions ? "Revoking..." : "Revoke All Others"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-3xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revoke all other sessions?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will sign out all other sessions ({sessions.length - 1} session{sessions.length - 1 !== 1 ? 's' : ''}) and prevent them from accessing your account. You'll stay signed in on this browser.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={async () => {
                              try {
                                await revokeAllSessions();
                                toast({
                                  title: "Sessions revoked",
                                  description: "All other sessions have been signed out.",
                                });
                              } catch (error) {
                                logError("Failed to revoke all sessions", error);
                                toast({
                                  title: "Couldn't revoke sessions",
                                  description: "Please try again.",
                                  variant: "destructive",
                                });
                              }
                            }}
                          >
                            Revoke All Others
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
                {sessions.map((session) => {
                  const isCurrentSession = session.is_current_session ?? (session.device_id === deviceId);
                  const lastAccessed = formatDistanceToNow(new Date(session.last_accessed_at), { addSuffix: true });
                  const lastAccessedDate = new Date(session.last_accessed_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  });
                  const created = formatDistanceToNow(new Date(session.created_at), { addSuffix: true });
                  const createdDate = new Date(session.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  });
                  const expires = formatDistanceToNow(new Date(session.expires_at), { addSuffix: true });
                  const expiresDate = new Date(session.expires_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  });

                  // Parse user agent with improved detection
                  const userAgent = session.user_agent || "Unknown";
                  let browserName = "Browser";
                  let browserVersion = "";
                  let deviceType: "mobile" | "desktop" | "tablet" = "desktop";
                  let DeviceIcon = Monitor;
                  let osName = "";
                  
                  if (userAgent !== "Unknown") {
                    const ua = userAgent.toLowerCase();
                    
                    // Detect device type
                    if (/mobile|android|iphone|ipod/i.test(userAgent)) {
                      deviceType = "mobile";
                      DeviceIcon = Smartphone;
                      if (/iphone|ipod/i.test(userAgent)) osName = "iOS";
                      else if (/android/i.test(userAgent)) {
                        const androidMatch = userAgent.match(/Android ([0-9.]+)/i);
                        osName = `Android${androidMatch ? ` ${androidMatch[1]}` : ""}`;
                      }
                    } else if (/tablet|ipad/i.test(userAgent)) {
                      deviceType = "tablet";
                      DeviceIcon = Tablet;
                      if (/ipad/i.test(userAgent)) osName = "iPadOS";
                      else if (/android/i.test(userAgent)) osName = "Android";
                    } else {
                      if (/windows/i.test(userAgent)) osName = "Windows";
                      else if (/macintosh|mac os/i.test(userAgent)) {
                        const macMatch = userAgent.match(/Mac OS X ([0-9_]+)/i);
                        osName = macMatch ? `macOS ${macMatch[1].replace(/_/g, ".")}` : "macOS";
                      }
                      else if (/linux/i.test(userAgent)) osName = "Linux";
                      else if (/ubuntu/i.test(userAgent)) osName = "Ubuntu";
                    }
                    
                    // Browser detection
                    if (ua.includes("edg") || ua.includes("edg/")) {
                      browserName = "Edge";
                      const match = userAgent.match(/Edg(?:e)?\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    } else if (ua.includes("opr") || ua.includes("opera")) {
                      browserName = "Opera";
                      const match = userAgent.match(/(?:OPR|Opera)\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    } else if (ua.includes("chrome") && !ua.includes("edg") && !ua.includes("opr")) {
                      browserName = "Chrome";
                      const match = userAgent.match(/Chrome\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    } else if (ua.includes("firefox")) {
                      browserName = "Firefox";
                      const match = userAgent.match(/Firefox\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    } else if (ua.includes("safari") && !ua.includes("chrome")) {
                      browserName = "Safari";
                      const match = userAgent.match(/Version\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    } else {
                      const browserMatch = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)\/(\d+)/i);
                      if (browserMatch) {
                        browserName = browserMatch[1];
                        browserVersion = browserMatch[2] || "";
                      }
                    }
                  }

                  // Format IP address (mask for privacy)
                  const formatIP = (ip: string | null) => {
                    if (!ip) return null;
                    if (ip.includes(":")) {
                      const parts = ip.split(":");
                      if (parts.length > 4) {
                        return `${parts[0]}:${parts[1]}:xxxx:xxxx`;
                      }
                      return ip;
                    }
                    const parts = ip.split(".");
                    if (parts.length === 4) {
                      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
                    }
                    return ip;
                  };

                  const maskedIP = formatIP(session.ip_address);
                  const deviceTypeLabel = deviceType === "mobile" ? "Mobile" : deviceType === "tablet" ? "Tablet" : "Desktop";
                  const browserVersionMajor = browserVersion ? browserVersion.split(".")[0] : "";

                  return (
                    <Card
                      key={session.id}
                      className={`rounded-3xl border-2 overflow-hidden transition-all ${
                        isCurrentSession
                          ? "border-primary/60 bg-primary/5 shadow-lg shadow-primary/10"
                          : "border-border/60 bg-card hover:border-border/80 hover:shadow-md"
                      }`}
                    >
                      <div className="p-5 space-y-4">
                        {/* Header Row */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4 flex-1 min-w-0">
                            <div
                              className={`p-3 rounded-2xl flex-shrink-0 ${
                                isCurrentSession ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                              }`}
                            >
                              <DeviceIcon className="h-6 w-6" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h3 className="font-semibold text-base truncate">
                                  {browserName} {browserVersionMajor && `v${browserVersionMajor}`} {deviceTypeLabel}
                                </h3>
                                {osName && (
                                  <span className="text-xs text-muted-foreground hidden sm:inline">
                                    • {osName}
                                  </span>
                                )}
                              </div>
                              {osName && (
                                <p className="text-xs text-muted-foreground sm:hidden mb-2">{osName}</p>
                              )}
                              <div className="flex items-center gap-2 flex-wrap mt-2">
                                {isCurrentSession && (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/20">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    This session
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Revoke Button */}
                          {!isCurrentSession && (
                            <div className="flex-shrink-0">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl text-destructive hover:text-destructive hover:border-destructive"
                                    disabled={isRevokingSession}
                                  >
                                    Revoke
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-3xl">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Revoke this session?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      <div className="space-y-2 mt-2">
                                        <p>This will sign out this session and prevent it from accessing your account.</p>
                                        <div className="p-3 rounded-xl bg-muted space-y-1 text-sm">
                                          <p><strong>Browser:</strong> {browserName} {browserVersionMajor && `v${browserVersionMajor}`} {deviceTypeLabel}</p>
                                          {osName && <p><strong>OS:</strong> {osName}</p>}
                                          <p><strong>Last accessed:</strong> {lastAccessed}</p>
                                          {maskedIP && <p><strong>Location:</strong> {maskedIP}</p>}
                                        </div>
                                        <p className="text-xs text-muted-foreground">You can sign in again using a login link.</p>
                                      </div>
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={async () => {
                                        try {
                                          await revokeSession(session.id);
                                          toast({
                                            title: "Session revoked",
                                            description: `${browserName} ${deviceTypeLabel} has been signed out.`,
                                          });
                                        } catch (error) {
                                          logError("Failed to revoke session", error);
                                          toast({
                                            title: "Couldn't revoke session",
                                          description: "Please try again.",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                  >
                                    Revoke Session
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </div>
                      
                      {/* Session Details Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-border/60">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Last accessed</span>
                          </div>
                          <p className="font-medium text-sm">{lastAccessed}</p>
                          <p className="text-xs text-muted-foreground">{lastAccessedDate}</p>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Created</span>
                          </div>
                          <p className="font-medium text-sm">{created}</p>
                          <p className="text-xs text-muted-foreground">{createdDate}</p>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Lock className="h-3.5 w-3.5" />
                            <span>Expires</span>
                          </div>
                          <p className="font-medium text-sm">{expires}</p>
                          <p className="text-xs text-muted-foreground">{expiresDate}</p>
                        </div>
                        
                        {maskedIP && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Compass className="h-3.5 w-3.5" />
                              <span>Location</span>
                            </div>
                            <p className="font-medium text-sm font-mono">{maskedIP}</p>
                          </div>
                        )}
                      </div>
                      
                      {/* Device ID */}
                      {session.device_id && (
                        <div className="pt-3 border-t border-border/60">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                                <HardDrive className="h-3.5 w-3.5" />
                                <span>Device ID</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <p className="font-mono text-xs text-muted-foreground break-all">
                                  {session.device_id.slice(0, 10)}...{session.device_id.slice(-6)}
                                </p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(session.device_id!);
                                      toast({
                                        title: "Copied!",
                                        description: "Device ID copied to clipboard",
                                      });
                                    } catch {
                                      const textArea = document.createElement("textarea");
                                      textArea.value = session.device_id!;
                                      document.body.appendChild(textArea);
                                      textArea.select();
                                      document.execCommand("copy");
                                      document.body.removeChild(textArea);
                                      toast({
                                        title: "Copied!",
                                        description: "Device ID copied to clipboard",
                                      });
                                    }
                                  }}
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  Copy
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                  );
                })}
              </div>
            )}
            </TabsContent>
            <TabsContent value="revoked" className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                View your revoked sessions. You can unrevoke a session to restore access if needed.
              </p>
            </div>
            {isLoadingRevokedSessions ? (
              <div className="space-y-2">
                <div className="h-20 rounded-xl bg-muted animate-pulse" />
                <div className="h-20 rounded-xl bg-muted animate-pulse" />
              </div>
            ) : revokedSessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No revoked sessions</p>
                <p className="text-xs mt-1">Revoked sessions will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {revokedSessions.map((session) => {
                  const revokedAt = session.revoked_at ? formatDistanceToNow(new Date(session.revoked_at), { addSuffix: true }) : "";
                  const revokedDate = session.revoked_at ? new Date(session.revoked_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }) : "";
                  const lastAccessed = formatDistanceToNow(new Date(session.last_accessed_at), { addSuffix: true });

                  // Parse user agent (same logic as active sessions)
                  const userAgent = session.user_agent || "Unknown";
                  let browserName = "Browser";
                  let browserVersion = "";
                  let deviceType: "mobile" | "desktop" | "tablet" = "desktop";
                  let DeviceIcon = Monitor;
                  let osName = "";
                  
                  if (userAgent !== "Unknown") {
                    const ua = userAgent.toLowerCase();
                    if (/mobile|android|iphone|ipod/i.test(userAgent)) {
                      deviceType = "mobile";
                      DeviceIcon = Smartphone;
                      if (/iphone|ipod/i.test(userAgent)) osName = "iOS";
                      else if (/android/i.test(userAgent)) {
                        const androidMatch = userAgent.match(/Android ([0-9.]+)/i);
                        osName = `Android${androidMatch ? ` ${androidMatch[1]}` : ""}`;
                      }
                    } else if (/tablet|ipad/i.test(userAgent)) {
                      deviceType = "tablet";
                      DeviceIcon = Tablet;
                      if (/ipad/i.test(userAgent)) osName = "iPadOS";
                      else if (/android/i.test(userAgent)) osName = "Android";
                    } else {
                      if (/windows/i.test(userAgent)) osName = "Windows";
                      else if (/macintosh|mac os/i.test(userAgent)) {
                        const macMatch = userAgent.match(/Mac OS X ([0-9_]+)/i);
                        osName = macMatch ? `macOS ${macMatch[1].replace(/_/g, ".")}` : "macOS";
                      }
                      else if (/linux/i.test(userAgent)) osName = "Linux";
                      else if (/ubuntu/i.test(userAgent)) osName = "Ubuntu";
                    }
                    
                    if (ua.includes("edg") || ua.includes("edg/")) {
                      browserName = "Edge";
                      const match = userAgent.match(/Edg(?:e)?\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    } else if (ua.includes("opr") || ua.includes("opera")) {
                      browserName = "Opera";
                      const match = userAgent.match(/(?:OPR|Opera)\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    } else if (ua.includes("chrome") && !ua.includes("edg") && !ua.includes("opr")) {
                      browserName = "Chrome";
                      const match = userAgent.match(/Chrome\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    } else if (ua.includes("firefox")) {
                      browserName = "Firefox";
                      const match = userAgent.match(/Firefox\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    } else if (ua.includes("safari") && !ua.includes("chrome")) {
                      browserName = "Safari";
                      const match = userAgent.match(/Version\/([0-9.]+)/i);
                      browserVersion = match ? match[1] : "";
                    } else {
                      const browserMatch = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)\/(\d+)/i);
                      if (browserMatch) {
                        browserName = browserMatch[1];
                        browserVersion = browserMatch[2] || "";
                      }
                    }
                  }

                  const formatIP = (ip: string | null) => {
                    if (!ip) return null;
                    if (ip.includes(":")) {
                      const parts = ip.split(":");
                      if (parts.length > 4) {
                        return `${parts[0]}:${parts[1]}:xxxx:xxxx`;
                      }
                      return ip;
                    }
                    const parts = ip.split(".");
                    if (parts.length === 4) {
                      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
                    }
                    return ip;
                  };

                  const maskedIP = formatIP(session.ip_address);
                  const deviceTypeLabel = deviceType === "mobile" ? "Mobile" : deviceType === "tablet" ? "Tablet" : "Desktop";
                  const browserVersionMajor = browserVersion ? browserVersion.split(".")[0] : "";

                  return (
                    <Card
                      key={session.id}
                      className="rounded-3xl border-2 border-destructive/40 bg-destructive/5 opacity-90 overflow-hidden transition-all"
                    >
                      <div className="p-5 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4 flex-1 min-w-0">
                            <div className="p-3 rounded-2xl flex-shrink-0 bg-destructive/15 text-destructive">
                              <DeviceIcon className="h-6 w-6" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h3 className="font-semibold text-base truncate">
                                  {browserName} {browserVersionMajor && `v${browserVersionMajor}`} {deviceTypeLabel}
                                </h3>
                                {osName && (
                                  <span className="text-xs text-muted-foreground hidden sm:inline">
                                    • {osName}
                                  </span>
                                )}
                              </div>
                              {osName && (
                                <p className="text-xs text-muted-foreground sm:hidden mb-2">{osName}</p>
                              )}
                              <div className="flex items-center gap-2 flex-wrap mt-2">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/15 text-destructive border border-destructive/20">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  Revoked {revokedAt}
                                </span>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl"
                            onClick={async () => {
                              try {
                                await unrevokeSession(session.id);
                                toast({
                                  title: "Session unrevoked",
                                  description: `${browserName} ${deviceTypeLabel} access has been restored.`,
                                });
                              } catch (error) {
                                logError("Failed to unrevoke session", error);
                                toast({
                                  title: "Couldn't unrevoke session",
                                  description: "Please try again.",
                                  variant: "destructive",
                                });
                              }
                            }}
                            disabled={isUnrevokingSession}
                          >
                            {isUnrevokingSession ? "Unrevoking..." : "Unrevoke"}
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-border/60">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              <span>Revoked</span>
                            </div>
                            <p className="font-medium text-sm">{revokedDate}</p>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Activity className="h-3.5 w-3.5" />
                              <span>Last accessed</span>
                            </div>
                            <p className="font-medium text-sm">{lastAccessed}</p>
                          </div>
                          {maskedIP && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Compass className="h-3.5 w-3.5" />
                                <span>Location</span>
                              </div>
                              <p className="font-medium text-sm font-mono">{maskedIP}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
            </TabsContent>
            </Tabs>
          </Card>
          </section>
        </TabsContent>

        <TabsContent value="downloads" className="space-y-8 mt-6">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Offline Downloads</h2>
          <Card className="p-6 rounded-3xl space-y-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-medium">Offline storage</p>
                <p className="text-sm text-muted-foreground">
                  {downloadedClipsList.length > 0
                    ? `${downloadedClipsList.length} clip${downloadedClipsList.length > 1 ? "s" : ""} downloaded (${storageUsedFormatted})`
                    : "No clips downloaded for offline playback"}
                </p>
              </div>
              {downloadedClipsList.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="rounded-2xl" size="sm">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Clear All
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-3xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear all offline downloads?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove all {downloadedClipsList.length} downloaded clip{downloadedClipsList.length > 1 ? "s" : ""} from your device. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleClearAllDownloads}
                        className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Clear All
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            {isLoadingDownloads ? (
              <div className="space-y-2">
                <div className="h-16 rounded-xl bg-muted animate-pulse" />
                <div className="h-16 rounded-xl bg-muted animate-pulse" />
              </div>
            ) : downloadedClipsList.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {downloadedClipsList.map((clip) => (
                  <div
                    key={clip.clipId}
                    className="flex items-center justify-between gap-4 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{clip.title || "Untitled Clip"}</p>
                      <p className="text-xs text-muted-foreground">
                        {clip.profiles?.handle || "Anonymous"} • {formatFileSize(clip.fileSize)} • Downloaded {formatDistanceToNow(new Date(clip.downloadedAt), { addSuffix: true })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteDownloadedClip(clip.clipId)}
                      className="rounded-xl"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <WifiOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No offline downloads yet</p>
                <p className="text-xs mt-1">Download clips from the feed to listen offline</p>
              </div>
            )}
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Export & Backup</h2>
          <Card className="p-6 rounded-3xl space-y-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-medium">Export all clips as audio files</p>
                <p className="text-sm text-muted-foreground">
                  Download all your audio clips as a ZIP file containing WebM audio files.
                </p>
              </div>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={handleExportAudioClips}
                disabled={isExportingAudio}
              >
                <FileAudio className="mr-2 h-4 w-4" />
                {isExportingAudio ? "Exporting..." : "Export Audio"}
              </Button>
            </div>

            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-medium">Download transcriptions</p>
                <p className="text-sm text-muted-foreground">
                  Export all your clip transcriptions as JSON and text files.
                </p>
              </div>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={handleExportTranscripts}
                disabled={isExportingTranscripts}
              >
                <FileText className="mr-2 h-4 w-4" />
                {isExportingTranscripts ? "Exporting..." : "Export Transcripts"}
              </Button>
            </div>

            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-medium">Backup to cloud storage</p>
                <p className="text-sm text-muted-foreground">
                  Create a complete backup of your profile data and metadata in cloud storage.
                </p>
              </div>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={handleBackupToCloud}
                disabled={isBackingUp}
              >
                <CloudUpload className="mr-2 h-4 w-4" />
                {isBackingUp ? "Backing up..." : "Backup to Cloud"}
              </Button>
            </div>
          </Card>
          </section>
        </TabsContent>

        <TabsContent value="accessibility" className="space-y-8 mt-6">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Accessibility Settings</h2>
            <AccessibilitySettings />
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Voice Cloning for Accessibility</h2>
            <Card className="p-6 rounded-3xl space-y-6">
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a voice model from your recordings to use for comments and clips. This helps users with speech disabilities communicate more easily.
                </p>
              </div>

              {hasVoiceModel ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Voice model created successfully</span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <div>
                      <p className="font-medium">Use cloned voice</p>
                      <p className="text-sm text-muted-foreground">
                        Enable to use your cloned voice when creating clips and comments.
                      </p>
                    </div>
                    <Switch
                      checked={voiceCloningEnabled}
                      onCheckedChange={async (checked) => {
                        setVoiceCloningEnabled(checked);
                        try {
                          // @ts-expect-error - voice_cloning_enabled exists but not in generated types
                          await updateProfile({ voice_cloning_enabled: checked } as any);
                          await refetch();
                          toast({
                            title: checked ? "Voice cloning enabled" : "Voice cloning disabled",
                            description: checked
                              ? "Your cloned voice will be used for new clips and comments."
                              : "You'll use your natural voice for recordings.",
                          });
                        } catch (error) {
                          logError("Failed to update voice cloning", error);
                          setVoiceCloningEnabled(!checked);
                        }
                      }}
                      disabled={isUpdating}
                      aria-label="Toggle voice cloning"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    To create a voice model, record a clip (at least 30 seconds) and then create your voice clone from the clip.
                  </p>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      toast({
                        title: "Coming soon",
                        description: "Select a clip from your recordings to create your voice model.",
                      });
                    }}
                    disabled={isCreatingVoiceClone}
                    className="rounded-2xl"
                  >
                    {isCreatingVoiceClone ? "Creating voice model..." : "Create voice model"}
                  </Button>
                </div>
              )}
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="voice" className="space-y-8 mt-6">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Voice Cloning Permissions</h2>
            <Card className="p-6 rounded-3xl space-y-6">
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Control whether others can clone your voice and how consent requests are handled.
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <p className="font-medium">Allow Voice Cloning</p>
                    <p className="text-sm text-muted-foreground">
                      Let other users request permission to clone your voice for ethical use cases.
                    </p>
                  </div>
                  <Switch
                    checked={allowVoiceCloning}
                    onCheckedChange={async (checked) => {
                      setAllowVoiceCloning(checked);
                      try {
                        // @ts-expect-error - allow_voice_cloning exists but not in generated types
                        await updateProfile({ allow_voice_cloning: checked } as any);
                        await refetch();
                        toast({
                          title: checked ? "Voice cloning enabled" : "Voice cloning disabled",
                          description: checked
                            ? "Users can now request to clone your voice."
                            : "Voice cloning requests are now disabled.",
                        });
                      } catch (error) {
                        logError("Failed to update voice cloning permissions", error);
                        setAllowVoiceCloning(!checked);
                      }
                    }}
                    disabled={isUpdating}
                    aria-label="Toggle allow voice cloning"
                  />
                </div>

                {allowVoiceCloning && (
                  <>
                    <div className="flex items-center justify-between gap-6">
                      <div>
                        <p className="font-medium">Auto-Approve Requests</p>
                        <p className="text-sm text-muted-foreground">
                          Automatically approve all voice cloning requests without manual review.
                        </p>
                      </div>
                      <Switch
                        checked={voiceCloningAutoApprove}
                        onCheckedChange={async (checked) => {
                          setVoiceCloningAutoApprove(checked);
                          try {
                            // @ts-expect-error - voice_cloning_auto_approve exists but not in generated types
                            await updateProfile({ voice_cloning_auto_approve: checked } as any);
                            await refetch();
                            toast({
                              title: checked ? "Auto-approve enabled" : "Auto-approve disabled",
                              description: checked
                                ? "Voice cloning requests will be automatically approved."
                                : "You'll need to manually approve each request.",
                            });
                          } catch (error) {
                            logError("Failed to update auto-approve setting", error);
                            setVoiceCloningAutoApprove(!checked);
                          }
                        }}
                        disabled={isUpdating}
                        aria-label="Toggle auto-approve"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Revenue Share Percentage</p>
                          <p className="text-sm text-muted-foreground">
                            Percentage of revenue from cloned content that goes to you (default: 20%).
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">{voiceCloningRevenueShare}%</p>
                        </div>
                      </div>
                      <Slider
                        value={[voiceCloningRevenueShare]}
                        onValueChange={async (value) => {
                          const newValue = value[0];
                          setVoiceCloningRevenueShare(newValue);
                          try {
                            // @ts-expect-error - voice_cloning_revenue_share_percentage exists but not in generated types
                            await updateProfile({ voice_cloning_revenue_share_percentage: newValue } as any);
                            await refetch();
                          } catch (error) {
                            logError("Failed to update revenue share", error);
                          }
                        }}
                        min={0}
                        max={100}
                        step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground px-1">
                        <span>0%</span>
                        <span>50%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </>
                )}

                {allowVoiceCloning && !voiceCloningAutoApprove && (
                  <div className="pt-4 border-t">
                    <VoiceCloningConsentManagement />
                  </div>
                )}
            </div>
          </Card>
          </section>
        </TabsContent>

        <TabsContent value="help" className="space-y-8 mt-6">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Help & Support</h2>
            
            <Card className="p-6 rounded-3xl space-y-6">
              <div>
                <h3 className="text-base font-semibold mb-2">Get Help</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Need help? Report a bug, suggest a feature, or share your feedback. We're here to help!
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FeedbackDialog
                  defaultType="bug"
                  trigger={
                    <Button variant="outline" className="h-auto py-4 flex flex-col items-start gap-2">
                      <div className="flex items-center gap-2 w-full">
                        <Bug className="h-5 w-5" />
                        <span className="font-semibold">Report a Bug</span>
                      </div>
                      <span className="text-xs text-muted-foreground text-left">
                        Something isn't working? Let us know!
                      </span>
                    </Button>
                  }
                />
                
                <FeedbackDialog
                  defaultType="feature_request"
                  trigger={
                    <Button variant="outline" className="h-auto py-4 flex flex-col items-start gap-2">
                      <div className="flex items-center gap-2 w-full">
                        <Sparkles className="h-5 w-5" />
                        <span className="font-semibold">Suggest a Feature</span>
                      </div>
                      <span className="text-xs text-muted-foreground text-left">
                        Have an idea? We'd love to hear it!
                      </span>
                    </Button>
                  }
                />
                
                <FeedbackDialog
                  defaultType="issue"
                  trigger={
                    <Button variant="outline" className="h-auto py-4 flex flex-col items-start gap-2">
                      <div className="flex items-center gap-2 w-full">
                        <AlertCircle className="h-5 w-5" />
                        <span className="font-semibold">Report an Issue</span>
                      </div>
                      <span className="text-xs text-muted-foreground text-left">
                        Technical or usability problems
                      </span>
                    </Button>
                  }
                />
                
                <FeedbackDialog
                  defaultType="general_feedback"
                  trigger={
                    <Button variant="outline" className="h-auto py-4 flex flex-col items-start gap-2">
                      <div className="flex items-center gap-2 w-full">
                        <MessageSquare className="h-5 w-5" />
                        <span className="font-semibold">General Feedback</span>
                      </div>
                      <span className="text-xs text-muted-foreground text-left">
                        Share your thoughts and suggestions
                      </span>
                    </Button>
                  }
                />
              </div>
            </Card>

            <Card className="p-6 rounded-3xl space-y-4">
              <h3 className="text-base font-semibold">Resources</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-xl border bg-muted/30">
                  <HelpCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">FAQ</p>
                        <p className="text-xs text-muted-foreground">
                          Everything you need to know about Vocalix
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/faq")}
                        className="ml-4"
                      >
                        View FAQ
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl border bg-muted/30">
                  <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">Privacy Policy</p>
                        <p className="text-xs text-muted-foreground">
                          Learn how we protect your privacy and data
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/privacy")}
                        className="ml-4"
                      >
                        View Policy
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl border bg-muted/30">
                  <Scale className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">Terms of Service</p>
                        <p className="text-xs text-muted-foreground">
                          Read our terms and conditions for using Vocalix
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/terms")}
                        className="ml-4"
                      >
                        View Terms
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl border bg-muted/30">
                  <Cookie className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">Cookie Policy</p>
                        <p className="text-xs text-muted-foreground">
                          Learn about how we use cookies and manage your preferences
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/cookies")}
                        className="ml-4"
                      >
                        View Policy
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl border bg-muted/30">
                  <Copyright className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">DMCA Copyright Policy</p>
                        <p className="text-xs text-muted-foreground">
                          Report copyright infringement and learn about our DMCA procedures
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/dmca")}
                        className="ml-4"
                      >
                        View Policy
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </section>
        </TabsContent>
      </main>
        </div>
      </Tabs>

      <Dialog open={isMagicLinkDialogOpen} onOpenChange={setIsMagicLinkDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-2">
            <DialogTitle>Send a login link</DialogTitle>
            <DialogDescription className="text-xs">
              Generate a secure link to sign in on another device. Links can last up to 7 days.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-2">
              <Label htmlFor="magic-link-type">Link type</Label>
              <Select value={magicLinkType} onValueChange={(value: "standard" | "extended" | "one_time") => setMagicLinkType(value)}>
                <SelectTrigger id="magic-link-type" className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard (7 days)</SelectItem>
                  <SelectItem value="extended">Extended (7 days)</SelectItem>
                  <SelectItem value="one_time">Quick share (1 hour)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {magicLinkType === "one_time" 
                  ? "Expires in 1 hour."
                  : "Expires in 7 days."
                }
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="magic-link-email">Email (optional)</Label>
              <Input
                id="magic-link-email"
                type="email"
                value={magicLinkEmail}
                onChange={(event) => setMagicLinkEmail(event.target.value)}
                placeholder="you@example.com"
                className="rounded-2xl"
              />
              <p className="text-xs text-muted-foreground">
                Optional: auto-draft an email with the link.
              </p>
            </div>

            {magicLinkUrl && (
              <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/40 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Quick Access - Copy link or scan QR code
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-xl h-7 px-2"
                    onClick={() => setShowQRCode(!showQRCode)}
                  >
                    <QrCode className="h-4 w-4 mr-1" />
                    {showQRCode ? "Hide QR" : "Show QR"}
                  </Button>
                </div>

                {showQRCode && (
                  <div className="space-y-2 mt-3">
                    <div className="flex justify-center p-3 bg-background rounded-xl border-2 border-border/40">
                      <div id="magic-link-qr-code">
                        <QRCodeSVG 
                          value={magicLinkUrl} 
                          size={180}
                          level="M"
                          includeMargin={true}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full rounded-2xl"
                      onClick={handleDownloadQRCode}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download QR Code Image
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      Save to phone or send to another device.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Or copy the link
                  </Label>
                  <div className="rounded-xl bg-background/80 px-3 py-2 text-xs font-mono break-all border border-border/40">
                    {magicLinkUrl}
                </div>
                {magicLinkExpiresDisplay && (
                  <p className="text-xs text-muted-foreground">Expires {magicLinkExpiresDisplay}</p>
                )}
                </div>
                
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Quick actions:</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                      variant="default"
                      className="rounded-2xl flex-1 min-w-[120px]"
                    onClick={handleCopyMagicLink}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                      Copy Link
                  </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-2xl flex-1 min-w-[120px]"
                      onClick={handleEmailToMyself}
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      Email Me
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                  {canNativeShare && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-2xl"
                      onClick={handleShareMagicLink}
                    >
                      <Share2 className="mr-2 h-4 w-4" />
                      Share
                    </Button>
                  )}
                    {magicLinkEmail.trim().length > 0 && magicLinkEmail !== (profile as any)?.email && (
                    <Button
                      type="button"
                      size="sm"
                        variant="outline"
                      className="rounded-2xl"
                      onClick={handleEmailMagicLink}
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      Email
                    </Button>
                  )}
                </div>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-2.5">
                  <p className="text-xs text-blue-900 dark:text-blue-100 font-medium mb-1">
                    💡 Tips:
                  </p>
                  <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-0.5 list-disc list-inside leading-relaxed">
                    <li>Download QR code or copy the link</li>
                    <li>Scan directly or email to yourself</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl"
              onClick={() => setIsMagicLinkDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              className="rounded-2xl"
              onClick={handleGenerateMagicLink}
              disabled={isGeneratingMagicLink}
            >
              {isGeneratingMagicLink ? "Creating..." : "Generate link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CityOptInDialog
        open={isCityDialogOpen}
        onOpenChange={handleCityDialogOpenChange}
        initialCity={profile.city}
        initialConsent={profile.consent_city}
        onSave={handleSaveCity}
      />

      <Dialog open={isHandleDialogOpen} onOpenChange={setIsHandleDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Choose a new pseudonym</DialogTitle>
            <DialogDescription>
              Pick something playful—no real names required. Handles must be unique and at least 3 characters.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="handle">Pseudonym</Label>
              <Input
                id="handle"
                value={pendingHandle}
                onChange={(event) => setPendingHandle(event.target.value)}
                placeholder="e.g. BrightFox42"
                className="rounded-2xl"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsHandleDialogOpen(false)}
              className="rounded-2xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleChangePseudonym}
              disabled={isSavingHandle}
              className="rounded-2xl"
            >
              {isSavingHandle ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recovery Email Dialog */}
      <Dialog open={isRecoveryEmailDialogOpen} onOpenChange={setIsRecoveryEmailDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Set Recovery Email</DialogTitle>
            <DialogDescription>
              Add an email address for account recovery. If you forget your login PIN, we'll send a reset link to this email.
            </DialogDescription>
          </DialogHeader>
          
          {!hasAcceptedRecoveryWarning ? (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                      Important Privacy Notice
                    </p>
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      This email address is your personal information and will be stored in our system. While we take security seriously and use industry-standard practices to protect your data, please be aware that:
                    </p>
                    <ul className="text-xs text-amber-800 dark:text-amber-200 space-y-1 list-disc list-inside ml-2">
                      <li>Your email will be used only for account recovery purposes</li>
                      <li>We use secure, encrypted storage and transmission</li>
                      <li>However, no system is 100% secure—data breaches can happen</li>
                      <li>Only use this if you're comfortable storing your email with us</li>
                    </ul>
                    <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                      By proceeding, you acknowledge that you understand these risks and consent to storing your email address for recovery purposes.
                    </p>
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setIsRecoveryEmailDialogOpen(false)}
                  className="rounded-2xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => setHasAcceptedRecoveryWarning(true)}
                  className="rounded-2xl"
                >
                  I Understand, Continue
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="recovery-email">Recovery Email Address</Label>
                <Input
                  id="recovery-email"
                  type="email"
                  value={pendingRecoveryEmail}
                  onChange={(event) => setPendingRecoveryEmail(event.target.value)}
                  placeholder="your.email@example.com"
                  className="rounded-2xl"
                />
                <p className="text-xs text-muted-foreground">
                  We'll only use this email to send you PIN reset links if you forget your login PIN.
                </p>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsRecoveryEmailDialogOpen(false);
                    setHasAcceptedRecoveryWarning(false);
                  }}
                  className="rounded-2xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!pendingRecoveryEmail.trim()) {
                      toast({
                        title: "Email required",
                        description: "Please enter a valid email address.",
                        variant: "destructive",
                      });
                      return;
                    }

                    // Basic email validation
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(pendingRecoveryEmail.trim())) {
                      toast({
                        title: "Invalid email",
                        description: "Please enter a valid email address.",
                        variant: "destructive",
                      });
                      return;
                    }

                    setIsSavingRecoveryEmail(true);
                    try {
                      // @ts-ignore - recovery_email exists but not in types
                      await updateProfile({ recovery_email: pendingRecoveryEmail.trim() || null });
                      setRecoveryEmail(pendingRecoveryEmail.trim());
                      setIsRecoveryEmailDialogOpen(false);
                      setHasAcceptedRecoveryWarning(false);
                      toast({
                        title: "Recovery email saved",
                        description: "Your recovery email has been set successfully.",
                      });
                    } catch (error: any) {
                      logError("Failed to save recovery email", error);
                      toast({
                        title: "Error",
                        description: error.message || "Failed to save recovery email. Please try again.",
                        variant: "destructive",
                      });
                    } finally {
                      setIsSavingRecoveryEmail(false);
                    }
                  }}
                  disabled={isSavingRecoveryEmail}
                  className="rounded-2xl"
                >
                  {isSavingRecoveryEmail ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
