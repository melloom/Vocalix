import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Edit, User, Users, FileText, Film, BarChart3, Ban, Eye, Shield, ShieldOff, Home, Scan, Download, AlertTriangle, Activity, Lock, Unlock, Globe, Clock, TrendingUp, AlertCircle, Sparkles, Play, Settings } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ClipForCard = Parameters<typeof ClipCard>[0]["clip"];

interface RawClip {
  id: string;
  profile_id: string | null;
  audio_path: string;
  mood_emoji: string;
  duration_seconds: number;
  captions: string | null;
  summary: string | null;
  status: string;
  reactions: Record<string, number> | null;
  created_at: string;
  listens_count?: number;
  city?: string | null;
  profiles: ClipForCard["profiles"];
}

interface Profile {
  id: string;
  handle: string;
  emoji_avatar: string;
  city: string | null;
  consent_city: boolean;
  joined_at: string | null;
}

interface FlaggedClip {
  id: number;
  clip: ClipForCard;
  reasons: string[];
  risk: number;
  source: string;
  created_at: string | null;
  workflow_state?: string;
  assigned_to?: string | null;
  assigned_to_profile?: {
    id: string;
    handle: string | null;
    emoji_avatar: string | null;
  } | null;
  moderation_notes?: string | null;
  priority?: number;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

interface ReportItem {
  id: number;
  clip?: ClipForCard;
  profile?: {
    id: string;
    handle: string | null;
    emoji_avatar: string | null;
  };
  reason: string;
  details: string | null;
  created_at: string | null;
  reporter?: {
    handle: string | null;
    emoji_avatar: string | null;
  };
  isProfileReport: boolean;
  workflow_state?: string;
  assigned_to?: string | null;
  assigned_to_profile?: {
    id: string;
    handle: string | null;
    emoji_avatar: string | null;
  } | null;
  moderation_notes?: string | null;
  priority?: number;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

interface FlagRecord {
  id: number;
  reasons: string[] | null;
  risk: number | null;
  source: string | null;
  created_at: string | null;
  workflow_state?: string | null;
  assigned_to?: string | null;
  assigned_to_profile?: {
    id: string;
    handle: string | null;
    emoji_avatar: string | null;
  } | null;
  moderation_notes?: string | null;
  priority?: number | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  clips: RawClip | null;
}

interface ReportRecord {
  id: number;
  reason: string | null;
  details: string | null;
  created_at: string | null;
  clip_id: string | null;
  profile_id: string | null;
  workflow_state?: string | null;
  assigned_to?: string | null;
  assigned_to_profile?: {
    id: string;
    handle: string | null;
    emoji_avatar: string | null;
  } | null;
  moderation_notes?: string | null;
  priority?: number | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  clip: RawClip | null;
  profile?: {
    id: string;
    handle: string | null;
    emoji_avatar: string | null;
  } | null;
  reporter?: {
    handle: string | null;
    emoji_avatar: string | null;
  } | null;
}

interface ModerationPayload {
  flags?: FlagRecord[] | null;
  reports?: ReportRecord[] | null;
}

interface AbuseMetrics {
  security: {
    criticalEvents24h: number;
    errorEvents24h: number;
    totalBanned: number;
    recentlyBanned: number;
    suspiciousDevices: number;
    revokedDevices: number;
    blacklistedIPs: number;
  };
  moderation: {
    pendingFlags: number;
    openReports: number;
  };
  abusePatterns?: {
    suspiciousIPs: Array<{
      ip_address: string;
      pattern_type: string;
      severity: string;
      count: number;
      last_seen_at: string;
    }>;
    topAccountCreationIPs: Array<{ ip: string; count: number }>;
    topUploaders: Array<{ profileId: string; count: number }>;
    topReactors: Array<{ profileId: string; count: number }>;
    actionTypeCounts: Record<string, number>;
    rateLimitViolations: number;
    rateLimitByAction: Record<string, number>;
    hourlyTrends: Record<string, { events: number; uploads: number; reactions: number }>;
    totalIPActivity24h: number;
  };
}

interface ModerationFilters {
  riskLevel?: string;
  source?: string;
  type?: string;
  reason?: string;
  workflowState?: string;
  assignedTo?: string;
  search?: string;
}

interface ModerationStatistics {
  items_reviewed_today: number;
  items_reviewed_period: number;
  avg_time_to_review_minutes: number;
  high_risk_items_pending: number;
  items_older_than_24h: number;
  flags_by_source: Record<string, number>;
  reports_by_type: Record<string, number>;
  items_by_workflow_state: Record<string, number>;
}

interface SpotlightQuestionRow {
  id: string;
  date: string;
  question: string;
  topic_id: string | null;
  topic_title: string | null;
  topic_description: string | null;
  generated_by: string | null;
  created_at: string;
  updated_at: string;
}

const mapClip = (clip: RawClip): ClipForCard => ({
  id: clip.id,
  profile_id: clip.profile_id,
  audio_path: clip.audio_path,
  mood_emoji: clip.mood_emoji,
  duration_seconds: clip.duration_seconds,
  captions: clip.captions,
  summary: clip.summary,
  status: clip.status,
  reactions: clip.reactions ?? {},
  created_at: clip.created_at,
  listens_count: clip.listens_count ?? 0,
  profiles: clip.profiles,
  city: clip.city ?? null,
});

const mapQueues = (payload?: ModerationPayload | null) => {
  const rawFlags: FlagRecord[] = Array.isArray(payload?.flags) ? (payload?.flags as FlagRecord[]) : [];
  const rawReports: ReportRecord[] = Array.isArray(payload?.reports) ? (payload?.reports as ReportRecord[]) : [];

  const flags: FlaggedClip[] = rawFlags
    .filter((flag): flag is FlagRecord & { clips: RawClip } => Boolean(flag?.clips))
    .map((flag) => ({
      id: flag.id,
      clip: mapClip(flag.clips),
      reasons: Array.isArray(flag.reasons) ? flag.reasons : [],
      risk: Number(flag.risk ?? 0),
      source: flag.source ?? "ai",
      created_at: flag.created_at ?? null,
      workflow_state: flag.workflow_state ?? "pending",
      assigned_to: flag.assigned_to ?? null,
      assigned_to_profile: flag.assigned_to_profile ?? null,
      moderation_notes: flag.moderation_notes ?? null,
      priority: flag.priority ?? 0,
      reviewed_at: flag.reviewed_at ?? null,
      reviewed_by: flag.reviewed_by ?? null,
    }));

  const reports: ReportItem[] = rawReports
    .filter((report) => Boolean(report?.clip) || Boolean(report?.profile))
    .map((report) => {
      const isProfileReport = Boolean(report.profile_id && report.profile);
      return {
        id: report.id,
        clip: report.clip ? mapClip(report.clip) : undefined,
        profile: report.profile
          ? {
              id: report.profile.id,
              handle: report.profile.handle ?? null,
              emoji_avatar: report.profile.emoji_avatar ?? null,
            }
          : undefined,
        reason: report.reason ?? "other",
        details: report.details ?? null,
        created_at: report.created_at ?? null,
        reporter: report.reporter
          ? {
              handle: report.reporter.handle ?? null,
              emoji_avatar: report.reporter.emoji_avatar ?? null,
            }
          : undefined,
        isProfileReport,
        workflow_state: report.workflow_state ?? "pending",
        assigned_to: report.assigned_to ?? null,
        assigned_to_profile: report.assigned_to_profile ?? null,
        moderation_notes: report.moderation_notes ?? null,
        priority: report.priority ?? 0,
        reviewed_at: report.reviewed_at ?? null,
        reviewed_by: report.reviewed_by ?? null,
      };
    });

  return { flags, reports };
};

const Admin = () => {
  const navigate = useNavigate();
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [flaggedClips, setFlaggedClips] = useState<FlaggedClip[]>([]);
  const [openReports, setOpenReports] = useState<ReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActioning, setIsActioning] = useState(false);
  const [sortBy, setSortBy] = useState<string>("priority");
  const [selectedFlags, setSelectedFlags] = useState<Set<number>>(new Set());
  const [selectedReports, setSelectedReports] = useState<Set<number>>(new Set());
  const [abuseMetrics, setAbuseMetrics] = useState<AbuseMetrics | null>(null);
  const [showMetrics, setShowMetrics] = useState(true);
  const [filters, setFilters] = useState<ModerationFilters>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [moderationStats, setModerationStats] = useState<ModerationStatistics | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [activeTab, setActiveTab] = useState("moderation");
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersPage, setUsersPage] = useState(0);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersSearch, setUsersSearch] = useState("");
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [deletingUser, setDeletingUser] = useState<any | null>(null);
  const [viewingUser, setViewingUser] = useState<any | null>(null);
  const [banningIP, setBanningIP] = useState<{ ip: string; userId?: string } | null>(null);
  const [systemStats, setSystemStats] = useState<any | null>(null);
  const [useAiDailyTopics, setUseAiDailyTopics] = useState<boolean>(true);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState<boolean>(false);
  const [reports, setReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsPage, setReportsPage] = useState(0);
  const [reportsTotal, setReportsTotal] = useState(0);
  const [reportsStatus, setReportsStatus] = useState("all");
  const [clips, setClips] = useState<any[]>([]);
  const [clipsLoading, setClipsLoading] = useState(false);
  const [clipsPage, setClipsPage] = useState(0);
  const [clipsTotal, setClipsTotal] = useState(0);
  const [clipsStatus, setClipsStatus] = useState("all");
  const [clipsSearch, setClipsSearch] = useState("");
  const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set());
  const [ipBans, setIpBans] = useState<any[]>([]);
  const [ipBansLoading, setIpBansLoading] = useState(false);
  const [ipBansPage, setIpBansPage] = useState(0);
  const [ipBansTotal, setIpBansTotal] = useState(0);
  const [scanningReports, setScanningReports] = useState<Set<string>>(new Set());
  const [scanningAll, setScanningAll] = useState(false);
  const [scanReports, setScanReports] = useState<Record<string, any>>({});
  const [securityDevices, setSecurityDevices] = useState<any[]>([]);
  const [securityDevicesLoading, setSecurityDevicesLoading] = useState(false);
  const [securityFilter, setSecurityFilter] = useState<"all" | "suspicious" | "revoked">("all");
  const [selectedSecurityMetric, setSelectedSecurityMetric] = useState<string | null>(null);
  const { toast } = useToast();

  // Garden Spotlight admin controls
  const [spotlightQuestion, setSpotlightQuestion] = useState<SpotlightQuestionRow | null>(null);
  const [isLoadingSpotlight, setIsLoadingSpotlight] = useState(false);
  const [manualQuestion, setManualQuestion] = useState("");
  const [isUpdatingSpotlight, setIsUpdatingSpotlight] = useState(false);
  const [isGeneratingSpotlight, setIsGeneratingSpotlight] = useState(false);

  // Cron Jobs state
  const [cronJobs, setCronJobs] = useState<any[]>([]);
  const [cronJobsLoading, setCronJobsLoading] = useState(false);
  const [cronJobsError, setCronJobsError] = useState<string | null>(null);
  const [cronJobHistory, setCronJobHistory] = useState<Record<string, any[]>>({});
  const [selectedCronJob, setSelectedCronJob] = useState<string | null>(null);
  const [testingJob, setTestingJob] = useState<string | null>(null);
  const [deletingJobHistory, setDeletingJobHistory] = useState<string | null>(null);
  const [jobRunResults, setJobRunResults] = useState<Record<string, { success: boolean; message: string; timestamp: Date }>>({});

  const applyQueues = useCallback((payload?: ModerationPayload | null) => {
    const { flags, reports } = mapQueues(payload);
    setFlaggedClips(flags);
    setOpenReports(reports);
  }, []);

  const loadAdminData = useCallback(async () => {
    setIsLoading(true);
    try {
      const deviceId = localStorage.getItem("deviceId");
      const filterParams = { ...filters };
      if (searchQuery) {
        filterParams.search = searchQuery;
      }
      const { data, error } = await supabase.functions.invoke("admin-review", {
        body: { action: "list", sortBy, filters: filterParams },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) {
        throw error;
      }

      applyQueues((data ?? null) as ModerationPayload | null);
    } catch (error) {
      console.error("Error loading admin data:", error);
      toast({
        title: "Failed to load moderation queue",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [applyQueues, toast, sortBy, filters, searchQuery]);

  const loadMetrics = useCallback(async () => {
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { data, error } = await supabase.functions.invoke("admin-review", {
        body: { action: "getMetrics" },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) {
        throw error;
      }

      setAbuseMetrics(data as AbuseMetrics);
    } catch (error) {
      console.error("Error loading metrics:", error);
    }
  }, []);

  // Cron Jobs Management Functions
  const loadCronJobs = useCallback(async () => {
    setCronJobsLoading(true);
    setCronJobsError(null);
    try {
      const { data, error } = await (supabase.rpc as any)("get_all_cron_jobs");

      if (error) {
        throw error;
      }

      setCronJobs(Array.isArray(data) ? data : []);
      setCronJobsError(null);
    } catch (error) {
      console.error("Error loading cron jobs:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to load cron jobs. The RPC function 'get_all_cron_jobs' may not exist or pg_cron extension may not be enabled.";
      setCronJobsError(errorMessage);
      toast({
        title: "Failed to load cron jobs",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setCronJobsLoading(false);
    }
  }, [toast]);

  const loadCronJobHistory = useCallback(async (jobName: string, jobId?: number) => {
    try {
      const { data, error } = await (supabase.rpc as any)("get_cron_job_history", {
        p_job_id: jobId || null,
        p_limit: 50,
      });

      if (error) {
        throw error;
      }

      setCronJobHistory((prev) => ({
        ...prev,
        [jobName]: Array.isArray(data) ? data : [],
      }));
    } catch (error) {
      console.error("Error loading cron job history:", error);
      toast({
        title: "Failed to load execution history",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const testCronJob = useCallback(async (jobName: string) => {
    setTestingJob(jobName);
    
    // Clear previous result
    setJobRunResults((prev) => {
      const next = { ...prev };
      delete next[jobName];
      return next;
    });

    try {
      const { data, error } = await (supabase.rpc as any)("run_cron_job_manual", {
        p_job_name: jobName,
      });

      if (error) {
        throw error;
      }

      // Handle response - it should be an array with one result
      let result: any = null;
      if (data && Array.isArray(data) && data.length > 0) {
        result = data[0];
      } else if (data && typeof data === 'object' && !Array.isArray(data)) {
        // Sometimes RPC returns object directly
        result = data;
      } else {
        throw new Error("Unexpected response format from run_cron_job_manual");
      }

      const runResult = {
        success: result.success === true || result.success === 'true',
        message: result.message || (result.success ? "Job started successfully" : "Job failed to start"),
        timestamp: new Date(),
      };
      
      setJobRunResults((prev) => ({
        ...prev,
        [jobName]: runResult,
      }));

      if (runResult.success) {
        toast({
          title: "✅ Job triggered successfully",
          description: runResult.message,
        });
        // Reload history after a delay to see the execution
        setTimeout(() => {
          loadCronJobHistory(jobName);
        }, 3000);
      } else {
        toast({
          title: "❌ Failed to trigger job",
          description: runResult.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorResult = {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error occurred",
        timestamp: new Date(),
      };
      setJobRunResults((prev) => ({
        ...prev,
        [jobName]: errorResult,
      }));
      console.error("Error testing cron job:", error);
      toast({
        title: "Failed to test cron job",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setTestingJob(null);
    }
  }, [toast, loadCronJobHistory]);

  const downloadCronJobReport = useCallback(async (jobName: string) => {
    try {
      const { data, error } = await (supabase.rpc as any)("export_cron_job_report", {
        p_job_name: jobName,
        p_start_date: null,
        p_end_date: null,
        p_limit: 1000,
      });

      if (error) {
        throw error;
      }

      const reportData = data as any;
      if (reportData && !reportData.success) {
        toast({
          title: "Failed to generate report",
          description: reportData.message || "Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Download as JSON file
      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cron-job-report-${jobName}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Report downloaded",
        description: `Downloaded execution report for ${jobName}`,
      });
    } catch (error) {
      console.error("Error downloading cron job report:", error);
      toast({
        title: "Failed to download report",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const deleteCronJobHistory = useCallback(async (jobName: string, olderThanDays?: number) => {
    try {
      const { data, error } = await (supabase.rpc as any)("delete_cron_job_history", {
        p_job_name: jobName,
        p_older_than_days: olderThanDays || null,
      });

      if (error) {
        throw error;
      }

      if (data && Array.isArray(data) && data.length > 0) {
        const result = data[0] as any;
        if (result.success) {
          toast({
            title: "History deleted",
            description: result.message,
          });
          // Reload history
          loadCronJobHistory(jobName);
          setDeletingJobHistory(null);
        } else {
          toast({
            title: "Failed to delete history",
            description: result.message,
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Error deleting cron job history:", error);
      toast({
        title: "Failed to delete history",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [toast, loadCronJobHistory]);

  useEffect(() => {
    const checkAccess = async () => {
      setIsCheckingAccess(true);
      try {
        const profileId = localStorage.getItem("profileId");
        const deviceId = localStorage.getItem("deviceId");

        if (!profileId || !deviceId) {
          setIsAdmin(false);
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", profileId)
          .single();

        if (profileError || !profileData) {
          setIsAdmin(false);
          return;
        }

        setAdminProfile(profileData as Profile);

        const { data, error } = await supabase.functions.invoke("admin-review", {
          body: { action: "list", sortBy: "priority" },
          headers: { "x-device-id": deviceId },
        });

        if (error) {
          if ((error as { status?: number })?.status === 403) {
            setIsAdmin(false);
            return;
          }
          throw error;
        }

        setIsAdmin(true);
        applyQueues((data ?? null) as ModerationPayload | null);
        await loadMetrics();
      } catch (error) {
        console.error("Admin access check failed:", error);
        setIsAdmin(false);
      } finally {
        setIsCheckingAccess(false);
      }
    };

    checkAccess();
  }, [applyQueues, loadMetrics]);

  const loadModerationStatistics = useCallback(async () => {
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { data, error } = await supabase.functions.invoke("admin-review", {
        body: { action: "getModerationStatistics" },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) {
        throw error;
      }

      setModerationStats(data?.statistics as ModerationStatistics);
    } catch (error) {
      console.error("Error loading moderation statistics:", error);
    }
  }, []);

  // Load today's spotlight question for admins
  useEffect(() => {
    if (!isAdmin) return;

    const loadSpotlightQuestion = async () => {
      setIsLoadingSpotlight(true);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase
          .from("daily_spotlight_questions")
          .select("*")
          .eq("date", today)
          .maybeSingle();

        if (error && (error as any).code !== "PGRST116") {
          console.error("Error loading spotlight question:", error);
          toast({
            title: "Garden Spotlight",
            description: "Could not load today's spotlight question.",
            variant: "destructive",
          });
        } else if (data) {
          setSpotlightQuestion(data as SpotlightQuestionRow);
          setManualQuestion((data as SpotlightQuestionRow).question ?? "");
        } else {
          setSpotlightQuestion(null);
          setManualQuestion("");
        }
      } catch (error) {
        console.error("Error loading spotlight question:", error);
      } finally {
        setIsLoadingSpotlight(false);
      }
    };

    loadSpotlightQuestion();
  }, [isAdmin, toast]);

  const handleUpdateSpotlightQuestion = useCallback(async () => {
    if (!isAdmin) return;
    const trimmed = manualQuestion.trim();
    if (trimmed.length < 5) {
      toast({
        title: "Garden Spotlight",
        description: "Please enter a question at least 5 characters long.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingSpotlight(true);
    try {
      const deviceId = localStorage.getItem("deviceId") || undefined;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (deviceId) {
        headers["x-device-id"] = deviceId;
      }

      const { data, error } = await supabase.functions.invoke("admin-spotlight-question", {
        method: "POST",
        headers,
        body: {
          question: trimmed,
          topic_id: spotlightQuestion?.topic_id ?? null,
          topic_title: spotlightQuestion?.topic_title ?? null,
          topic_description: spotlightQuestion?.topic_description ?? null,
        },
      });

      if (error) {
        console.error("Error updating spotlight question via function:", error);
        toast({
          title: "Garden Spotlight",
          description: "Could not update today's spotlight question.",
          variant: "destructive",
        });
        return;
      }

      const updated = (data as any)?.question as SpotlightQuestionRow | undefined;
      if (updated) {
        setSpotlightQuestion(updated);
        toast({
          title: "Garden Spotlight updated",
          description: "Today's Garden Spotlight question was updated for everyone.",
        });
      } else {
        toast({
          title: "Garden Spotlight",
          description: "Spotlight question updated, but no data was returned.",
        });
      }
    } catch (error) {
      console.error("Unexpected error updating spotlight question:", error);
      toast({
        title: "Garden Spotlight",
        description: "Something went wrong while updating today's question.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingSpotlight(false);
    }
  }, [isAdmin, manualQuestion, spotlightQuestion, toast]);

  const handleGenerateSpotlightNow = useCallback(async () => {
    if (!isAdmin) return;
    setIsGeneratingSpotlight(true);
    try {
      // Trigger the daily-spotlight-question edge function to generate (or reuse) today's AI question
      const { data, error } = await supabase.functions.invoke("daily-spotlight-question", {
        body: {},
      });

      if (error) {
        console.error("Error invoking daily-spotlight-question:", error);
        toast({
          title: "Garden Spotlight",
          description: "Could not generate a new AI question.",
          variant: "destructive",
        });
        return;
      }

      // After generation, reload today's spotlight question from the table
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data: fresh, error: freshError } = await supabase
          .from("daily_spotlight_questions")
          .select("*")
          .eq("date", today)
          .maybeSingle();

        if (freshError && (freshError as any).code !== "PGRST116") {
          console.error("Error reloading spotlight question after generation:", freshError);
        } else if (fresh) {
          setSpotlightQuestion(fresh as SpotlightQuestionRow);
          setManualQuestion((fresh as SpotlightQuestionRow).question ?? "");
        }
      } catch (reloadError) {
        console.error("Error reloading spotlight question after generation:", reloadError);
      }

      toast({
        title: "AI question generated",
        description: "A fresh AI-generated Garden Spotlight question has been created for today.",
      });
    } catch (error) {
      console.error("Unexpected error generating spotlight question:", error);
      toast({
        title: "Garden Spotlight",
        description: "Something went wrong while generating a new AI question.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSpotlight(false);
    }
  }, [isAdmin, toast]);

  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
      loadMetrics();
      loadModerationStatistics();
      // Refresh metrics every 30 seconds
      const interval = setInterval(() => {
        loadMetrics();
        loadModerationStatistics();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, loadAdminData, loadMetrics, loadModerationStatistics, sortBy]);

  const handleModerationAction = useCallback(
    async ({
      clipId,
      newStatus,
      flagId,
      reportIds,
    }: {
      clipId: string;
      newStatus: "live" | "hidden" | "removed";
      flagId?: number;
      reportIds?: number[];
    }) => {
      setIsActioning(true);
      try {
        const deviceId = localStorage.getItem("deviceId");
        const { error } = await supabase.functions.invoke("admin-review", {
          body: {
            action: "updateClip",
            clipId,
            status: newStatus,
            flagId,
            reportIds,
          },
          headers: deviceId ? { "x-device-id": deviceId } : undefined,
        });

        if (error) {
          throw error;
        }

        toast({
          title: "Moderation updated",
          description: "Changes saved successfully.",
        });
        setSelectedFlags(new Set());
        setSelectedReports(new Set());
        await loadAdminData();
        await loadMetrics();
      } catch (error) {
        console.error("Moderation action failed:", error);
        toast({
          title: "Action failed",
          description: "Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsActioning(false);
      }
    },
    [loadAdminData, loadMetrics, toast],
  );

  const handleMarkAs18Plus = useCallback(
    async ({
      clipId,
      flagId,
      reportIds,
    }: {
      clipId: string;
      flagId?: number;
      reportIds?: number[];
    }) => {
      setIsActioning(true);
      try {
        const deviceId = localStorage.getItem("deviceId");
        const { error } = await supabase.functions.invoke("admin-review", {
          body: {
            action: "markAs18Plus",
            clipId,
            flagId,
            reportIds,
          },
          headers: deviceId ? { "x-device-id": deviceId } : undefined,
        });

        if (error) {
          throw error;
        }

        toast({
          title: "Content marked as 18+",
          description: "Content has been moved to the 18+ section and will be filtered from regular feeds.",
        });
        setSelectedFlags(new Set());
        setSelectedReports(new Set());
        await loadAdminData();
        await loadMetrics();
      } catch (error) {
        console.error("Failed to mark as 18+:", error);
        toast({
          title: "Action failed",
          description: "Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsActioning(false);
      }
    },
    [loadAdminData, loadMetrics, toast],
  );

  const handleBulkAction = useCallback(
    async (status: "live" | "hidden" | "removed") => {
      if (selectedFlags.size === 0 && selectedReports.size === 0) {
        toast({
          title: "No items selected",
          description: "Please select items to perform bulk action.",
          variant: "destructive",
        });
        return;
      }

      setIsActioning(true);
      try {
        const deviceId = localStorage.getItem("deviceId");
        const clipIds: string[] = [];
        const flagIds: number[] = [];
        const reportIds: number[] = [];

        // Collect clip IDs from selected flags
        selectedFlags.forEach((flagId) => {
          const flag = flaggedClips.find((f) => f.id === flagId);
          if (flag) {
            clipIds.push(flag.clip.id);
            flagIds.push(flagId);
          }
        });

        // Collect clip IDs from selected reports (only clip reports)
        selectedReports.forEach((reportId) => {
          const report = openReports.find((r) => r.id === reportId);
          if (report && !report.isProfileReport && report.clip) {
            clipIds.push(report.clip.id);
            reportIds.push(reportId);
          } else if (report) {
            // Profile reports - just add to reportIds
            reportIds.push(reportId);
          }
        });

        // Remove duplicates
        const uniqueClipIds = Array.from(new Set(clipIds));

        const { error } = await supabase.functions.invoke("admin-review", {
          body: {
            action: "bulkUpdateClips",
            clipIds: uniqueClipIds,
            status,
            flagIds: flagIds.length > 0 ? flagIds : undefined,
            reportIds: reportIds.length > 0 ? reportIds : undefined,
          },
          headers: deviceId ? { "x-device-id": deviceId } : undefined,
        });

        if (error) {
          throw error;
        }

        toast({
          title: "Bulk action completed",
          description: `Updated ${uniqueClipIds.length} item(s).`,
        });
        setSelectedFlags(new Set());
        setSelectedReports(new Set());
        await loadAdminData();
        await loadMetrics();
      } catch (error) {
        console.error("Bulk action failed:", error);
        toast({
          title: "Bulk action failed",
          description: "Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsActioning(false);
      }
    },
    [selectedFlags, selectedReports, flaggedClips, openReports, loadAdminData, loadMetrics, toast],
  );

  const handleResolveReport = useCallback(
    async (reportId: number) => {
      try {
        const deviceId = localStorage.getItem("deviceId");
        const { error } = await supabase.functions.invoke("admin-review", {
          body: { action: "resolveReport", reportId },
          headers: deviceId ? { "x-device-id": deviceId } : undefined,
        });

        if (error) {
          throw error;
        }

        toast({
          title: "Report resolved",
          description: "Marked as reviewed.",
        });
        await loadAdminData();
        await loadMetrics();
      } catch (error) {
        console.error("Report resolution failed:", error);
        toast({
          title: "Couldn't resolve report",
          description: "Try again shortly.",
          variant: "destructive",
        });
      }
    },
    [loadAdminData, loadMetrics, toast],
  );

  const toggleFlagSelection = useCallback((flagId: number) => {
    setSelectedFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flagId)) {
        next.delete(flagId);
      } else {
        next.add(flagId);
      }
      return next;
    });
  }, []);

  const toggleReportSelection = useCallback((reportId: number) => {
    setSelectedReports((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else {
        next.add(reportId);
      }
      return next;
    });
  }, []);

  const selectAllFlags = useCallback(() => {
    if (selectedFlags.size === flaggedClips.length) {
      setSelectedFlags(new Set());
    } else {
      setSelectedFlags(new Set(flaggedClips.map((f) => f.id)));
    }
  }, [flaggedClips, selectedFlags.size]);

  const selectAllReports = useCallback(() => {
    if (selectedReports.size === openReports.length) {
      setSelectedReports(new Set());
    } else {
      setSelectedReports(new Set(openReports.map((r) => r.id)));
    }
  }, [openReports, selectedReports.size]);

  const handleAssignItem = useCallback(
    async (itemType: "flag" | "report", itemId: number, assignedTo: string | null) => {
      try {
        const deviceId = localStorage.getItem("deviceId");
        const { error } = await supabase.functions.invoke("admin-review", {
          body: { action: "assignItem", itemType, itemId, assignedTo },
          headers: deviceId ? { "x-device-id": deviceId } : undefined,
        });

        if (error) throw error;

        toast({
          title: "Assignment updated",
          description: assignedTo ? "Item assigned successfully." : "Item unassigned.",
        });
        await loadAdminData();
      } catch (error) {
        console.error("Assignment failed:", error);
        toast({
          title: "Assignment failed",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    },
    [loadAdminData, toast],
  );

  const handleUpdateNotes = useCallback(
    async (itemType: "flag" | "report", itemId: number, notes: string) => {
      try {
        const deviceId = localStorage.getItem("deviceId");
        const { error } = await supabase.functions.invoke("admin-review", {
          body: { action: "updateNotes", itemType, itemId, notes },
          headers: deviceId ? { "x-device-id": deviceId } : undefined,
        });

        if (error) throw error;

        toast({
          title: "Notes updated",
          description: "Moderation notes saved.",
        });
        await loadAdminData();
      } catch (error) {
        console.error("Notes update failed:", error);
        toast({
          title: "Update failed",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    },
    [loadAdminData, toast],
  );

  const handleUpdateWorkflowState = useCallback(
    async (itemType: "flag" | "report", itemId: number, workflowState: string) => {
      try {
        const deviceId = localStorage.getItem("deviceId");
        const { error } = await supabase.functions.invoke("admin-review", {
          body: { action: "updateWorkflowState", itemType, itemId, workflowState },
          headers: deviceId ? { "x-device-id": deviceId } : undefined,
        });

        if (error) throw error;

        toast({
          title: "Status updated",
          description: "Workflow state changed.",
        });
        await loadAdminData();
      } catch (error) {
        console.error("Workflow state update failed:", error);
        toast({
          title: "Update failed",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    },
    [loadAdminData, toast],
  );

  const handleProfileAction = useCallback(
    async (reportId: number, action: "ban" | "warn" | "dismiss", banDuration?: number, warningMessage?: string) => {
      try {
        const deviceId = localStorage.getItem("deviceId");
        const { error } = await supabase.functions.invoke("admin-review", {
          body: { type: "handleProfileReport", reportId, action, banDuration, warningMessage },
          headers: deviceId ? { "x-device-id": deviceId } : undefined,
        });

        if (error) throw error;

        toast({
          title: "Action completed",
          description: `Profile ${action}ed successfully.`,
        });
        await loadAdminData();
        await loadMetrics();
      } catch (error) {
        console.error("Profile action failed:", error);
        toast({
          title: "Action failed",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    },
    [loadAdminData, loadMetrics, toast],
  );

  const getWorkflowStateColor = (state: string) => {
    switch (state) {
      case "pending":
        return "bg-yellow-500/20 text-yellow-600";
      case "in_review":
        return "bg-blue-500/20 text-blue-600";
      case "resolved":
        return "bg-green-500/20 text-green-600";
      case "actioned":
        return "bg-red-500/20 text-red-600";
      default:
        return "bg-gray-500/20 text-gray-600";
    }
  };

  const getRiskLevel = (risk: number) => {
    if (risk < 3) return "low";
    if (risk < 7) return "medium";
    if (risk < 9) return "high";
    return "critical";
  };

  const loadUsers = useCallback(async (page = 0, search = "") => {
    setUsersLoading(true);
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { data, error } = await supabase.functions.invoke("admin-review", {
        body: {
          action: "getAllUsers",
          limit: 50,
          offset: page * 50,
          search,
        },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      setUsers(data?.users || []);
      setUsersTotal(data?.totalCount || 0);
    } catch (error) {
      console.error("Error loading users:", error);
      toast({
        title: "Failed to load users",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUsersLoading(false);
    }
  }, [toast]);

  const handleUpdateUser = useCallback(async (profileId: string, updates: any) => {
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { error } = await supabase.functions.invoke("admin-review", {
        body: {
          action: "updateUser",
          profileId,
          updates,
        },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      toast({
        title: "User updated",
        description: "User information has been updated.",
      });
      setEditingUser(null);
      await loadUsers(usersPage, usersSearch);
    } catch (error) {
      console.error("Error updating user:", error);
      toast({
        title: "Update failed",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }, [toast, usersPage, usersSearch, loadUsers]);

  const handleDeleteUser = useCallback(async (profileId: string, reason: string) => {
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { error } = await supabase.functions.invoke("admin-review", {
        body: {
          action: "deleteUser",
          profileId,
          reason,
        },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      toast({
        title: "User deleted",
        description: "User and all associated data have been removed.",
      });
      setDeletingUser(null);
      await loadUsers(usersPage, usersSearch);
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast({
        title: "Delete failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    }
  }, [toast, usersPage, usersSearch, loadUsers]);

  const handleBanIP = useCallback(async (ipAddress: string, reason: string, expiresAt?: string) => {
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { error } = await supabase.functions.invoke("admin-review", {
        body: {
          action: "banIP",
          ipAddress,
          reason,
          expiresAt,
        },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      toast({
        title: "IP banned",
        description: `IP address ${ipAddress} has been banned.`,
      });
      setBanningIP(null);
      if (viewingUser) {
        // Reload user details if viewing
        const deviceId = localStorage.getItem("deviceId");
        const { data } = await supabase.functions.invoke("admin-review", {
          body: { action: "getUserDetails", profileId: viewingUser.profile?.id || viewingUser.id },
          headers: deviceId ? { "x-device-id": deviceId } : undefined,
        });
        if (data) setViewingUser(data);
      }
      await loadUsers(usersPage, usersSearch);
    } catch (error: any) {
      console.error("Error banning IP:", error);
      toast({
        title: "Ban failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    }
  }, [toast, usersPage, usersSearch, loadUsers, viewingUser]);

  const handleUnbanIP = useCallback(async (ipAddress: string) => {
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { error } = await supabase.functions.invoke("admin-review", {
        body: {
          action: "unbanIP",
          ipAddress,
        },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      toast({
        title: "IP unbanned",
        description: `IP address ${ipAddress} has been unbanned.`,
      });
      if (viewingUser) {
        // Reload user details if viewing
        const deviceId = localStorage.getItem("deviceId");
        const { data } = await supabase.functions.invoke("admin-review", {
          body: { action: "getUserDetails", profileId: viewingUser.profile?.id || viewingUser.id },
          headers: deviceId ? { "x-device-id": deviceId } : undefined,
        });
        if (data) setViewingUser(data);
      }
      await loadUsers(usersPage, usersSearch);
    } catch (error: any) {
      console.error("Error unbanning IP:", error);
      toast({
        title: "Unban failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    }
  }, [toast, usersPage, usersSearch, loadUsers, viewingUser]);

  const loadUserDetails = useCallback(async (profileId: string) => {
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { data, error } = await supabase.functions.invoke("admin-review", {
        body: { action: "getUserDetails", profileId },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      setViewingUser(data);
    } catch (error) {
      console.error("Error loading user details:", error);
      toast({
        title: "Failed to load user details",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleScanReport = useCallback(async (reportId: string) => {
    setScanningReports(prev => new Set(prev).add(reportId));
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { data, error } = await supabase.functions.invoke("admin-review", {
        body: { action: "scanReport", reportId },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      setScanReports(prev => ({ ...prev, [reportId]: data }));
      toast({
        title: "Scan completed",
        description: "Report scan results are ready.",
      });
    } catch (error: any) {
      console.error("Error scanning report:", error);
      toast({
        title: "Scan failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setScanningReports(prev => {
        const next = new Set(prev);
        next.delete(reportId);
        return next;
      });
    }
  }, [toast]);

  const downloadScanReport = useCallback((reportId: string) => {
    const scanReport = scanReports[reportId];
    if (!scanReport) return;

    const reportData = {
      scanId: scanReport.scanId,
      reportId: reportId,
      timestamp: new Date().toISOString(),
      scanResults: scanReport.results,
      summary: scanReport.summary,
      recommendations: scanReport.recommendations,
      riskScore: scanReport.riskScore,
      flags: scanReport.flags,
      details: scanReport.details,
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan-report-${reportId}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Report downloaded",
      description: "Scan report has been downloaded.",
    });
  }, [scanReports, toast]);

  const handleScanAllReports = useCallback(async () => {
    if (reports.length === 0) {
      toast({
        title: "No reports to scan",
        description: "There are no reports in the current view.",
        variant: "destructive",
      });
      return;
    }

    setScanningAll(true);
    const reportIds = reports.map(r => r.id);
    let successCount = 0;
    let failCount = 0;

    // Scan reports in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < reportIds.length; i += batchSize) {
      const batch = reportIds.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (reportId) => {
          try {
            setScanningReports(prev => new Set(prev).add(reportId));
            const deviceId = localStorage.getItem("deviceId");
            const { data, error } = await supabase.functions.invoke("admin-review", {
              body: { action: "scanReport", reportId },
              headers: deviceId ? { "x-device-id": deviceId } : undefined,
            });

            if (error) throw error;

            setScanReports(prev => ({ ...prev, [reportId]: data }));
            successCount++;
          } catch (error: any) {
            console.error(`Error scanning report ${reportId}:`, error);
            failCount++;
          } finally {
            setScanningReports(prev => {
              const next = new Set(prev);
              next.delete(reportId);
              return next;
            });
          }
        })
      );

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < reportIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setScanningAll(false);
    toast({
      title: "Bulk scan completed",
      description: `Scanned ${successCount} reports successfully${failCount > 0 ? `, ${failCount} failed` : ""}.`,
    });
  }, [reports, toast]);

  const downloadAllScanReports = useCallback(() => {
    const scannedReportIds = Object.keys(scanReports);
    if (scannedReportIds.length === 0) {
      toast({
        title: "No scan reports",
        description: "Please scan reports first before downloading.",
        variant: "destructive",
      });
      return;
    }

    const allReports = {
      exportDate: new Date().toISOString(),
      totalScans: scannedReportIds.length,
      reports: scannedReportIds.map(reportId => ({
        reportId,
        scanData: scanReports[reportId],
      })),
    };

    const blob = new Blob([JSON.stringify(allReports, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `all-scan-reports-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "All reports downloaded",
      description: `Downloaded ${scannedReportIds.length} scan reports.`,
    });
  }, [scanReports, toast]);

  const loadSecurityDevices = useCallback(async (filter: "all" | "suspicious" | "revoked" = "all") => {
    setSecurityDevicesLoading(true);
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { data, error } = await supabase.functions.invoke("admin-review", {
        body: { action: "getSuspiciousDevices", filter },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      setSecurityDevices(data?.devices || []);
    } catch (error) {
      console.error("Error loading security devices:", error);
      toast({
        title: "Failed to load security devices",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSecurityDevicesLoading(false);
    }
  }, [toast]);

  const loadSystemStats = useCallback(async () => {
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { data, error } = await supabase.functions.invoke("admin-review", {
        body: { action: "getSystemStats" },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      setSystemStats(data);

      if (data?.appSettings && typeof data.appSettings.useAiDailyTopics === "boolean") {
        setUseAiDailyTopics(data.appSettings.useAiDailyTopics);
      }
    } catch (error) {
      console.error("Error loading system stats:", error);
    }
  }, []);

  const handleToggleAiDailyTopics = useCallback(
    async (newValue: boolean) => {
      setIsUpdatingSettings(true);
      try {
        const deviceId = localStorage.getItem("deviceId");
        const { error } = await supabase.functions.invoke("admin-review", {
          body: {
            action: "updateAppSettings",
            key: "use_ai_daily_topics",
            value: newValue,
          },
          headers: deviceId ? { "x-device-id": deviceId } : undefined,
        });

        if (error) throw error;

        setUseAiDailyTopics(newValue);
        toast({
          title: "Daily prompt setting updated",
          description: newValue
            ? "AI-generated daily prompts are now enabled."
            : "AI-generated daily prompts are now disabled. Using curated questions only.",
        });
      } catch (error) {
        console.error("Error updating app settings:", error);
        toast({
          title: "Failed to update setting",
          description: "Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsUpdatingSettings(false);
      }
    },
    [toast]
  );

  const loadIPBans = useCallback(async (page = 0) => {
    setIpBansLoading(true);
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { data, error } = await supabase.functions.invoke("admin-review", {
        body: {
          action: "getAllIPBans",
          limit: 50,
          offset: page * 50,
        },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      setIpBans(data?.ipBans || []);
      setIpBansTotal(data?.totalCount || 0);
    } catch (error) {
      console.error("Error loading IP bans:", error);
      toast({
        title: "Failed to load IP bans",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIpBansLoading(false);
    }
  }, [toast]);

  const loadReports = useCallback(async (page = 0, status = "all") => {
    setReportsLoading(true);
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { data, error } = await supabase.functions.invoke("admin-review", {
        body: {
          action: "getAllReports",
          limit: 50,
          offset: page * 50,
          status,
        },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      setReports(data?.reports || []);
      setReportsTotal(data?.totalCount || 0);
    } catch (error) {
      console.error("Error loading reports:", error);
      toast({
        title: "Failed to load reports",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setReportsLoading(false);
    }
  }, [toast]);

  const loadClips = useCallback(async (page = 0, status = "all", search = "") => {
    setClipsLoading(true);
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { data, error } = await supabase.functions.invoke("admin-review", {
        body: {
          action: "getAllClips",
          limit: 50,
          offset: page * 50,
          status,
          search,
        },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      setClips(data?.clips || []);
      setClipsTotal(data?.totalCount || 0);
    } catch (error) {
      console.error("Error loading clips:", error);
      toast({
        title: "Failed to load clips",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setClipsLoading(false);
    }
  }, [toast]);

  const handleBulkClipAction = useCallback(async (clipIds: string[], status: string) => {
    if (clipIds.length === 0) return;

    setIsActioning(true);
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { error } = await supabase.functions.invoke("admin-review", {
        body: {
          action: "bulkUpdateClips",
          clipIds,
          status,
        },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      toast({
        title: "Bulk action completed",
        description: `Updated ${clipIds.length} clip(s).`,
      });
      setSelectedClips(new Set());
      await loadClips(clipsPage, clipsStatus, clipsSearch);
    } catch (error) {
      console.error("Bulk action failed:", error);
      toast({
        title: "Bulk action failed",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsActioning(false);
    }
  }, [toast, clipsPage, clipsStatus, clipsSearch, loadClips]);

  useEffect(() => {
    if (activeTab === "users" && users.length === 0) {
      loadUsers(0, usersSearch);
    }
    if (activeTab === "reports" && reports.length === 0) {
      loadReports(0, reportsStatus);
    }
    if (activeTab === "clips" && clips.length === 0) {
      loadClips(0, clipsStatus, clipsSearch);
    }
    if (activeTab === "stats") {
      loadSystemStats();
      loadIPBans(0);
    }
    if (activeTab === "security" && securityDevices.length === 0) {
      loadSecurityDevices(securityFilter);
    }
  }, [activeTab, loadUsers, loadReports, loadClips, loadSystemStats, loadIPBans, loadSecurityDevices, users.length, usersSearch, reports.length, reportsStatus, clips.length, clipsStatus, clipsSearch, securityDevices.length, securityFilter]);

  const flaggedCount = useMemo(() => flaggedClips.length, [flaggedClips]);
  const reportsCount = useMemo(() => openReports.length, [openReports]);
  const totalSelected = selectedFlags.size + selectedReports.size;

  if (isCheckingAccess) {
    return <div className="p-8 text-center text-muted-foreground">Checking admin access…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-8 text-center space-y-4">
        <h1 className="text-2xl font-semibold">Admins only</h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          This review queue is limited to moderators. Reach out to the project owner if you need access.
        </p>
        <Button variant="outline" onClick={() => window.history.back()} className="rounded-2xl">
          Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 pb-24">
      <header className="border-b border-border bg-background/95 backdrop-blur-xl sticky top-0 z-10 shadow-sm">
      <div className="w-full px-4 lg:px-8 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/")}
              className="rounded-full"
            >
              <Home className="w-4 h-4 mr-2" />
              Back to Hub
            </Button>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                Admin Dashboard
              </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {activeTab === "moderation" && `${flaggedCount} flagged • ${reportsCount} reports waiting`}
              {activeTab === "users" && `${usersTotal} total users`}
              {activeTab === "reports" && `${reportsTotal} total reports`}
              {activeTab === "clips" && `${clipsTotal} total clips`}
              {activeTab === "security" && `${securityDevices.length} ${securityFilter === "all" ? "security issues" : securityFilter === "suspicious" ? "suspicious devices" : "revoked devices"}`}
              {activeTab === "stats" && "System overview & analytics"}
            </p>
            </div>
          </div>
          <div className="flex gap-2">
            {activeTab === "moderation" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                  className="rounded-2xl"
                >
                  {showFilters ? "Hide" : "Show"} Filters
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowStats(!showStats)}
                  className="rounded-2xl"
                >
                  {showStats ? "Hide" : "Show"} Stats
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowMetrics(!showMetrics)}
                  className="rounded-2xl"
                >
                  {showMetrics ? "Hide" : "Show"} Metrics
                </Button>
                <Button variant="outline" onClick={loadAdminData} disabled={isLoading} className="rounded-2xl">
                  {isLoading ? "Refreshing…" : "Refresh"}
                </Button>
              </>
            )}
            {activeTab === "users" && (
              <Button variant="outline" onClick={() => loadUsers(usersPage, usersSearch)} disabled={usersLoading} className="rounded-2xl">
                {usersLoading ? "Refreshing…" : "Refresh"}
              </Button>
            )}
            {activeTab === "reports" && (
              <Button variant="outline" onClick={() => loadReports(reportsPage, reportsStatus)} disabled={reportsLoading} className="rounded-2xl">
                {reportsLoading ? "Refreshing…" : "Refresh"}
              </Button>
            )}
            {activeTab === "clips" && (
              <Button variant="outline" onClick={() => loadClips(clipsPage, clipsStatus, clipsSearch)} disabled={clipsLoading} className="rounded-2xl">
                {clipsLoading ? "Refreshing…" : "Refresh"}
              </Button>
            )}
            {activeTab === "stats" && (
              <Button variant="outline" onClick={loadSystemStats} className="rounded-2xl">
                Refresh
              </Button>
            )}
            {activeTab === "security" && (
              <Button variant="outline" onClick={() => loadSecurityDevices(securityFilter)} disabled={securityDevicesLoading} className="rounded-2xl">
                {securityDevicesLoading ? "Refreshing…" : "Refresh"}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="w-full px-4 lg:px-8 py-6 space-y-8">
        <Tabs value={activeTab} onValueChange={(value) => {
          setActiveTab(value);
          if (value === "security") {
            loadSecurityDevices(securityFilter);
          } else if (value === "cron") {
            loadCronJobs();
          }
        }} className="w-full">
          <TabsList className="grid w-full grid-cols-8 rounded-2xl">
            <TabsTrigger value="moderation" className="rounded-2xl">
              <FileText className="w-4 h-4 mr-2" />
              Moderation
            </TabsTrigger>
            <TabsTrigger value="users" className="rounded-2xl">
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="reports" className="rounded-2xl">
              <FileText className="w-4 h-4 mr-2" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="clips" className="rounded-2xl">
              <Film className="w-4 h-4 mr-2" />
              Clips
            </TabsTrigger>
            <TabsTrigger value="security" className="rounded-2xl">
              <Shield className="w-4 h-4 mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="stats" className="rounded-2xl">
              <BarChart3 className="w-4 h-4 mr-2" />
              Stats
            </TabsTrigger>
            <TabsTrigger value="spotlight" className="rounded-2xl">
              <Sparkles className="w-4 h-4 mr-2" />
              Spotlight
            </TabsTrigger>
            <TabsTrigger value="cron" className="rounded-2xl">
              <Settings className="w-4 h-4 mr-2" />
              Cron Jobs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="moderation" className="space-y-8">
        {/* Abuse Pattern Monitoring Dashboard */}
        {showMetrics && abuseMetrics && (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Security Metrics</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMetrics(false)}
                className="text-muted-foreground"
              >
                Hide
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card 
                className="p-5 rounded-2xl cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200 border-2 hover:border-red-500/50 bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/20 dark:to-red-900/10"
                onClick={() => {
                  setActiveTab("security");
                  setSecurityFilter("all");
                  loadSecurityDevices("all");
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-muted-foreground">Critical Events</div>
                  <AlertCircle className="w-4 h-4 text-red-500" />
                </div>
                <div className="text-3xl font-bold text-red-600">{abuseMetrics.security.criticalEvents24h}</div>
                <div className="text-xs text-muted-foreground mt-1">Last 24 hours</div>
              </Card>
              <Card 
                className="p-5 rounded-2xl cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200 border-2 hover:border-orange-500/50 bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/20 dark:to-orange-900/10"
                onClick={() => {
                  setActiveTab("security");
                  setSecurityFilter("all");
                  loadSecurityDevices("all");
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-muted-foreground">Error Events</div>
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                </div>
                <div className="text-3xl font-bold text-orange-600">{abuseMetrics.security.errorEvents24h}</div>
                <div className="text-xs text-muted-foreground mt-1">Last 24 hours</div>
              </Card>
              <Card 
                className="p-5 rounded-2xl cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200 border-2 hover:border-purple-500/50 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/20 dark:to-purple-900/10"
                onClick={() => {
                  setActiveTab("users");
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-muted-foreground">Total Banned</div>
                  <Ban className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-3xl font-bold text-purple-600">{abuseMetrics.security.totalBanned}</div>
                <div className="text-xs text-muted-foreground mt-1">All time</div>
              </Card>
              <Card 
                className="p-5 rounded-2xl cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200 border-2 hover:border-pink-500/50 bg-gradient-to-br from-pink-50 to-pink-100/50 dark:from-pink-950/20 dark:to-pink-900/10"
                onClick={() => {
                  setActiveTab("users");
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-muted-foreground">Recently Banned</div>
                  <TrendingUp className="w-4 h-4 text-pink-500" />
                </div>
                <div className="text-3xl font-bold text-pink-600">{abuseMetrics.security.recentlyBanned}</div>
                <div className="text-xs text-muted-foreground mt-1">Last 24 hours</div>
              </Card>
              <Card 
                className="p-5 rounded-2xl cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200 border-2 hover:border-yellow-500/50 bg-gradient-to-br from-yellow-50 to-yellow-100/50 dark:from-yellow-950/20 dark:to-yellow-900/10"
                onClick={() => {
                  setActiveTab("security");
                  setSecurityFilter("suspicious");
                  loadSecurityDevices("suspicious");
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-muted-foreground">Suspicious Devices</div>
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                </div>
                <div className="text-3xl font-bold text-yellow-600">{abuseMetrics.security.suspiciousDevices}</div>
                <div className="text-xs text-muted-foreground mt-1">Click to view details</div>
              </Card>
              <Card 
                className="p-5 rounded-2xl cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200 border-2 hover:border-red-500/50 bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/20 dark:to-red-900/10"
                onClick={() => {
                  setActiveTab("security");
                  setSecurityFilter("revoked");
                  loadSecurityDevices("revoked");
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-muted-foreground">Revoked Devices</div>
                  <Lock className="w-4 h-4 text-red-500" />
                </div>
                <div className="text-3xl font-bold text-red-600">{abuseMetrics.security.revokedDevices}</div>
                <div className="text-xs text-muted-foreground mt-1">Click to view details</div>
              </Card>
              <Card 
                className="p-5 rounded-2xl cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200 border-2 hover:border-red-500/50 bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/20 dark:to-red-900/10"
                onClick={() => {
                  setActiveTab("security");
                  setSecurityFilter("all");
                  loadSecurityDevices("all");
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-muted-foreground">Blacklisted IPs</div>
                  <Globe className="w-4 h-4 text-red-500" />
                </div>
                <div className="text-3xl font-bold text-red-600">{abuseMetrics.security.blacklistedIPs || 0}</div>
                <div className="text-xs text-muted-foreground mt-1">Blocked addresses</div>
              </Card>
              <Card 
                className="p-5 rounded-2xl cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200 border-2 hover:border-blue-500/50 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/20 dark:to-blue-900/10"
                onClick={() => {
                  setActiveTab("security");
                  setSecurityFilter("all");
                  loadSecurityDevices("all");
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-muted-foreground">IP Activity</div>
                  <Activity className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-3xl font-bold text-blue-600">{abuseMetrics.abusePatterns?.totalIPActivity24h || 0}</div>
                <div className="text-xs text-muted-foreground mt-1">Last 24 hours</div>
              </Card>
            </div>

            {/* Abuse Patterns Section */}
            {abuseMetrics.abusePatterns && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold">Abuse Pattern Analysis</h3>
                
                {/* Rate Limit Violations */}
                {abuseMetrics.abusePatterns.rateLimitViolations > 0 && (
                  <Card className="p-6 rounded-2xl">
                    <h4 className="font-semibold mb-4">Rate Limit Violations (24h)</h4>
                    <div className="space-y-2">
                      <div className="text-2xl font-bold text-red-500">{abuseMetrics.abusePatterns.rateLimitViolations}</div>
                      {Object.keys(abuseMetrics.abusePatterns.rateLimitByAction).length > 0 && (
                        <div className="mt-4 space-y-1">
                          <div className="text-sm font-medium text-muted-foreground">By Action Type:</div>
                          {Object.entries(abuseMetrics.abusePatterns.rateLimitByAction)
                            .sort(([, a], [, b]) => b - a)
                            .map(([action, count]) => (
                              <div key={action} className="flex justify-between text-sm">
                                <span className="capitalize">{action}</span>
                                <span className="font-medium">{count}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {/* Suspicious IPs */}
                {abuseMetrics.abusePatterns.suspiciousIPs.length > 0 && (
                  <Card className="p-6 rounded-2xl">
                    <h4 className="font-semibold mb-4">Suspicious IP Patterns (Last 7 Days)</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left p-2">IP Address</th>
                            <th className="text-left p-2">Pattern Type</th>
                            <th className="text-left p-2">Severity</th>
                            <th className="text-right p-2">Count</th>
                            <th className="text-left p-2">Last Seen</th>
                          </tr>
                        </thead>
                        <tbody>
                          {abuseMetrics.abusePatterns.suspiciousIPs.slice(0, 10).map((ip, idx) => (
                            <tr key={idx} className="border-b border-border/50">
                              <td className="p-2 font-mono text-xs">{ip.ip_address}</td>
                              <td className="p-2 capitalize">{ip.pattern_type.replace(/_/g, " ")}</td>
                              <td className="p-2">
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    ip.severity === "critical"
                                      ? "bg-red-500/20 text-red-500"
                                      : ip.severity === "high"
                                      ? "bg-orange-500/20 text-orange-500"
                                      : ip.severity === "medium"
                                      ? "bg-yellow-500/20 text-yellow-500"
                                      : "bg-gray-500/20 text-gray-500"
                                  }`}
                                >
                                  {ip.severity}
                                </span>
                              </td>
                              <td className="p-2 text-right">{ip.count}</td>
                              <td className="p-2 text-muted-foreground text-xs">
                                {new Date(ip.last_seen_at).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

                {/* Top Account Creation IPs */}
                {abuseMetrics.abusePatterns.topAccountCreationIPs.length > 0 && (
                  <Card className="p-6 rounded-2xl">
                    <h4 className="font-semibold mb-4">Top Account Creation IPs (Last 7 Days)</h4>
                    <div className="space-y-2">
                      {abuseMetrics.abusePatterns.topAccountCreationIPs.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <span className="font-mono text-xs">{item.ip}</span>
                          <span className="font-semibold text-orange-500">{item.count} accounts</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Top Uploaders */}
                {abuseMetrics.abusePatterns.topUploaders.length > 0 && (
                  <Card className="p-6 rounded-2xl">
                    <h4 className="font-semibold mb-4">Top Uploaders (Last 24h)</h4>
                    <div className="space-y-2">
                      {abuseMetrics.abusePatterns.topUploaders.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <span className="font-mono text-xs truncate flex-1">{item.profileId}</span>
                          <span className="font-semibold text-blue-500 ml-2">{item.count} uploads</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Top Reactors */}
                {abuseMetrics.abusePatterns.topReactors.length > 0 && (
                  <Card className="p-6 rounded-2xl">
                    <h4 className="font-semibold mb-4">Top Reactors (Last 24h)</h4>
                    <div className="space-y-2">
                      {abuseMetrics.abusePatterns.topReactors.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <span className="font-mono text-xs truncate flex-1">{item.profileId}</span>
                          <span className="font-semibold text-purple-500 ml-2">{item.count} reactions</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Action Type Distribution */}
                {Object.keys(abuseMetrics.abusePatterns.actionTypeCounts).length > 0 && (
                  <Card className="p-6 rounded-2xl">
                    <h4 className="font-semibold mb-4">Activity by Action Type (Last 24h)</h4>
                    <div className="space-y-2">
                      {Object.entries(abuseMetrics.abusePatterns.actionTypeCounts)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 10)
                        .map(([action, count]) => (
                          <div key={action} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                            <span className="capitalize">{action.replace(/_/g, " ")}</span>
                            <span className="font-semibold">{count}</span>
                          </div>
                        ))}
                    </div>
                  </Card>
                )}
              </div>
            )}
          </section>
        )}

        {/* Filters and Search */}
        {showFilters && (
          <Card className="p-4 rounded-2xl space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-2xl"
                />
              </div>
              <Select
                value={filters.riskLevel || "all"}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, riskLevel: value === "all" ? undefined : value }))
                }
              >
                <SelectTrigger className="w-[150px] rounded-2xl">
                  <SelectValue placeholder="Risk Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Risk Levels</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.source || "all"}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, source: value === "all" ? undefined : value }))
                }
              >
                <SelectTrigger className="w-[150px] rounded-2xl">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="ai">AI</SelectItem>
                  <SelectItem value="community">Community</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.type || "all"}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, type: value === "all" ? undefined : value }))
                }
              >
                <SelectTrigger className="w-[150px] rounded-2xl">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="clip">Clip</SelectItem>
                  <SelectItem value="profile">Profile</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.workflowState || "all"}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, workflowState: value === "all" ? undefined : value }))
                }
              >
                <SelectTrigger className="w-[150px] rounded-2xl">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="actioned">Actioned</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => {
                  setFilters({});
                  setSearchQuery("");
                }}
                className="rounded-2xl"
              >
                Clear
              </Button>
            </div>
          </Card>
        )}

        {/* Moderation Statistics */}
        {showStats && moderationStats && (
          <Card className="p-6 rounded-2xl space-y-4">
            <h2 className="text-xl font-semibold">Moderation Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Reviewed Today</div>
                <div className="text-2xl font-bold">{moderationStats.items_reviewed_today}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Reviewed (30d)</div>
                <div className="text-2xl font-bold">{moderationStats.items_reviewed_period}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Avg Review Time</div>
                <div className="text-2xl font-bold">
                  {Math.round(moderationStats.avg_time_to_review_minutes)}m
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">High Risk Pending</div>
                <div className="text-2xl font-bold text-red-500">{moderationStats.high_risk_items_pending}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Older than 24h</div>
                <div className="text-2xl font-bold text-orange-500">{moderationStats.items_older_than_24h}</div>
              </div>
            </div>
          </Card>
        )}

        {/* Priority Sorting */}
        <div className="flex items-center justify-between gap-4">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px] rounded-2xl">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Priority (Risk)</SelectItem>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
            </SelectContent>
          </Select>
          {totalSelected > 0 && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkAction("live")}
                disabled={isActioning}
                className="rounded-full"
              >
                Approve ({totalSelected})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkAction("hidden")}
                disabled={isActioning}
                className="rounded-full"
              >
                Hide ({totalSelected})
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleBulkAction("removed")}
                disabled={isActioning}
                className="rounded-full"
              >
                Remove ({totalSelected})
              </Button>
            </div>
          )}
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">AI Flags</h2>
              <span className="text-sm text-muted-foreground">{flaggedCount} pending</span>
              {flaggedCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAllFlags}
                  className="text-xs rounded-full"
                >
                  {selectedFlags.size === flaggedCount ? "Deselect All" : "Select All"}
                </Button>
              )}
            </div>
          </div>

          {flaggedClips.length === 0 ? (
            <Card className="p-6 rounded-3xl text-center text-muted-foreground">
              Nothing flagged right now. 🎉
            </Card>
          ) : (
            flaggedClips.map((flag) => (
              <Card key={flag.id} className="p-6 space-y-4 rounded-3xl">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedFlags.has(flag.id)}
                    onCheckedChange={() => toggleFlagSelection(flag.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <ClipCard clip={flag.clip} />
                  </div>
                </div>
                <div className="space-y-3 border-t border-border pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getWorkflowStateColor(flag.workflow_state || "pending")}>
                      {flag.workflow_state || "pending"}
                    </Badge>
                    <Badge variant="outline">
                      {getRiskLevel(flag.risk)} risk ({flag.risk.toFixed(2)})
                    </Badge>
                    {flag.priority && flag.priority > 0 && (
                      <Badge variant="outline" className="text-orange-600">
                        Priority: {flag.priority}
                      </Badge>
                    )}
                    {flag.assigned_to_profile && (
                      <Badge variant="outline">
                        Assigned to: {flag.assigned_to_profile.emoji_avatar} {flag.assigned_to_profile.handle}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>
                      Flagged by <span className="font-medium uppercase">{flag.source}</span>
                    </p>
                    {flag.reasons.length > 0 && (
                      <p>Reasons: {flag.reasons.map((reason) => reason.toLowerCase()).join(", ")}</p>
                    )}
                    {flag.moderation_notes && (
                      <div className="mt-2 p-2 bg-muted rounded-lg">
                        <p className="font-medium">Notes:</p>
                        <p>{flag.moderation_notes}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="rounded-full">
                          {flag.assigned_to ? "Reassign" : "Assign"}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Assign Item</DialogTitle>
                          <DialogDescription>
                            Assign this item to yourself or another admin.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <Button
                            onClick={() => handleAssignItem("flag", flag.id, adminProfile?.id || null)}
                            className="w-full"
                          >
                            Assign to Me
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleAssignItem("flag", flag.id, null)}
                            className="w-full"
                          >
                            Unassign
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="rounded-full">
                          {flag.moderation_notes ? "Edit Notes" : "Add Notes"}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Moderation Notes</DialogTitle>
                        </DialogHeader>
                        <Textarea
                          defaultValue={flag.moderation_notes || ""}
                          placeholder="Add notes about this moderation decision..."
                          className="min-h-[100px]"
                        />
                        <Button
                          onClick={async (e) => {
                            const textarea = e.currentTarget.parentElement?.querySelector("textarea");
                            const notes = textarea?.value || "";
                            await handleUpdateNotes("flag", flag.id, notes);
                            // Close dialog would need state management
                          }}
                        >
                          Save Notes
                        </Button>
                      </DialogContent>
                    </Dialog>
                    {flag.reasons && flag.reasons.some((r: string) => 
                      r.toLowerCase().includes("18+") || 
                      r.toLowerCase().includes("sexual") || 
                      r.toLowerCase().includes("nsfw") ||
                      r.toLowerCase().includes("explicit")
                    ) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full border-orange-500 text-orange-600 hover:bg-orange-50"
                        disabled={isActioning}
                        onClick={() =>
                          handleMarkAs18Plus({
                            clipId: flag.clip.id,
                            flagId: flag.id,
                          })
                        }
                      >
                        Mark as 18+
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="rounded-full"
                      disabled={isActioning}
                      onClick={() =>
                        handleModerationAction({
                          clipId: flag.clip.id,
                          newStatus: "live",
                          flagId: flag.id,
                        })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      disabled={isActioning}
                      onClick={() =>
                        handleModerationAction({
                          clipId: flag.clip.id,
                          newStatus: "hidden",
                          flagId: flag.id,
                        })
                      }
                    >
                      Hide
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="rounded-full"
                      disabled={isActioning}
                      onClick={() =>
                        handleModerationAction({
                          clipId: flag.clip.id,
                          newStatus: "removed",
                          flagId: flag.id,
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">Community Reports</h2>
              <span className="text-sm text-muted-foreground">{reportsCount} open</span>
              {reportsCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAllReports}
                  className="text-xs rounded-full"
                >
                  {selectedReports.size === reportsCount ? "Deselect All" : "Select All"}
                </Button>
              )}
            </div>
          </div>

          {openReports.length === 0 ? (
            <Card className="p-6 rounded-3xl text-center text-muted-foreground">
              No community reports at the moment.
            </Card>
          ) : (
            openReports.map((report) => (
              <Card key={report.id} className="p-6 space-y-4 rounded-3xl">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedReports.has(report.id)}
                    onCheckedChange={() => toggleReportSelection(report.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    {report.isProfileReport && report.profile ? (
                      <Card className="p-4 rounded-2xl bg-muted/50">
                        <div className="flex items-center gap-3">
                          <div className="text-4xl">{report.profile.emoji_avatar ?? "👤"}</div>
                          <div>
                            <p className="font-semibold">@{report.profile.handle ?? "Unknown"}</p>
                            <p className="text-sm text-muted-foreground">Profile Report</p>
                          </div>
                        </div>
                      </Card>
                    ) : report.clip ? (
                      <ClipCard clip={report.clip} />
                    ) : null}
                  </div>
                </div>
                <div className="space-y-3 border-t border-border pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getWorkflowStateColor(report.workflow_state || "pending")}>
                      {report.workflow_state || "pending"}
                    </Badge>
                    {report.priority && report.priority > 0 && (
                      <Badge variant="outline" className="text-orange-600">
                        Priority: {report.priority}
                      </Badge>
                    )}
                    {report.assigned_to_profile && (
                      <Badge variant="outline">
                        Assigned to: {report.assigned_to_profile.emoji_avatar} {report.assigned_to_profile.handle}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p className="font-medium capitalize">Reason: {report.reason}</p>
                    {report.details && <p>Details: {report.details}</p>}
                    {report.reporter && (
                      <p>
                        Reporter: {report.reporter.emoji_avatar ?? "🕵️"} {report.reporter.handle ?? "Anonymous"}
                      </p>
                    )}
                    {report.moderation_notes && (
                      <div className="mt-2 p-2 bg-muted rounded-lg">
                        <p className="font-medium">Notes:</p>
                        <p>{report.moderation_notes}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="rounded-full">
                          {report.assigned_to ? "Reassign" : "Assign"}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Assign Item</DialogTitle>
                          <DialogDescription>
                            Assign this item to yourself or another admin.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <Button
                            onClick={() => handleAssignItem("report", report.id, adminProfile?.id || null)}
                            className="w-full"
                          >
                            Assign to Me
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleAssignItem("report", report.id, null)}
                            className="w-full"
                          >
                            Unassign
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="rounded-full">
                          {report.moderation_notes ? "Edit Notes" : "Add Notes"}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Moderation Notes</DialogTitle>
                        </DialogHeader>
                        <Textarea
                          defaultValue={report.moderation_notes || ""}
                          placeholder="Add notes about this moderation decision..."
                          className="min-h-[100px]"
                        />
                        <Button
                          onClick={async (e) => {
                            const textarea = e.currentTarget.parentElement?.querySelector("textarea");
                            const notes = textarea?.value || "";
                            await handleUpdateNotes("report", report.id, notes);
                          }}
                        >
                          Save Notes
                        </Button>
                      </DialogContent>
                    </Dialog>
                    {report.isProfileReport && report.profile && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="rounded-full">
                            Profile Actions
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Profile Actions</DialogTitle>
                            <DialogDescription>
                              Take action on the reported profile: @{report.profile.handle}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <Button
                              variant="destructive"
                              onClick={() => handleProfileAction(report.id, "ban", 24)}
                              className="w-full"
                            >
                              Ban (24 hours)
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleProfileAction(report.id, "ban")}
                              className="w-full"
                            >
                              Ban (Permanent)
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleProfileAction(report.id, "warn", undefined, "Warning issued")}
                              className="w-full"
                            >
                              Warn
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleProfileAction(report.id, "dismiss")}
                              className="w-full"
                            >
                              Dismiss
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                    {!report.isProfileReport && report.clip && (
                      <>
                        {(report.reason === "18+ content" || report.reason === "NSFW" || report.reason === "nsfw") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full border-orange-500 text-orange-600 hover:bg-orange-50"
                            disabled={isActioning}
                            onClick={() =>
                              handleMarkAs18Plus({
                                clipId: report.clip!.id,
                                reportIds: [report.id],
                              })
                            }
                          >
                            Mark as 18+
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          disabled={isActioning}
                          onClick={() =>
                            handleModerationAction({
                              clipId: report.clip!.id,
                              newStatus: "hidden",
                              reportIds: [report.id],
                            })
                          }
                        >
                          Hide clip
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="rounded-full"
                          disabled={isActioning}
                          onClick={() =>
                            handleModerationAction({
                              clipId: report.clip!.id,
                              newStatus: "removed",
                              reportIds: [report.id],
                            })
                          }
                        >
                          Remove
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full"
                      disabled={isActioning}
                      onClick={() => handleResolveReport(report.id)}
                    >
                      Resolve
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </section>
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            <div className="flex items-center gap-4">
              <Input
                placeholder="Search users by handle..."
                value={usersSearch}
                onChange={(e) => {
                  setUsersSearch(e.target.value);
                  setUsersPage(0);
                  loadUsers(0, e.target.value);
                }}
                className="flex-1 rounded-2xl"
              />
            </div>

            {usersLoading ? (
              <Card className="p-6 rounded-2xl text-center">Loading users...</Card>
            ) : users.length === 0 ? (
              <Card className="p-6 rounded-2xl text-center text-muted-foreground">No users found.</Card>
            ) : (
              <div className="space-y-4">
                {users.map((user) => (
                  <Card key={user.id} className="p-6 rounded-2xl">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="text-4xl" role="img" aria-label="User avatar">
                          {user.emoji_avatar ? String(user.emoji_avatar) : "👤"}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="text-lg font-semibold">@{user.handle}</h3>
                            {user.is_banned && (
                              <Badge variant="destructive">Banned</Badge>
                            )}
                            {user.is_muted && (
                              <Badge variant="outline" className="text-orange-600">Muted</Badge>
                            )}
                            {user.is_paused && (
                              <Badge variant="outline" className="text-yellow-600">Paused</Badge>
                            )}
                            {user.is_deleted && (
                              <Badge variant="destructive">Deleted</Badge>
                            )}
                            {user.statistics?.suspiciousDevicesCount > 0 && (
                              <Badge variant="outline" className="text-yellow-600">
                                {user.statistics.suspiciousDevicesCount} Suspicious Devices
                              </Badge>
                            )}
                            {user.blacklistedIPs && user.blacklistedIPs.length > 0 && (
                              <Badge variant="outline" className="text-red-600">
                                {user.blacklistedIPs.length} IP(s) Banned
                              </Badge>
                            )}
                          </div>
                          {user.ipAddresses && user.ipAddresses.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-2 items-center">
                              {user.ipAddresses.map((ip: string) => {
                                const isBanned = user.blacklistedIPs?.includes(ip);
                                return (
                                  <div key={ip} className="flex items-center gap-1">
                                    <Badge
                                      variant={isBanned ? "destructive" : "outline"}
                                      className="font-mono text-xs"
                                    >
                                      {ip}
                                      {isBanned && " (Banned)"}
                                    </Badge>
                                    {!isBanned && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setBanningIP({ ip, userId: user.id })}
                                        className="h-6 w-6 p-0 rounded-full"
                                        title="Ban IP"
                                      >
                                        <Ban className="w-3 h-3 text-red-500" />
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                            <div>
                              <div className="text-muted-foreground">Clips</div>
                              <div className="font-semibold">{user.statistics?.clipsCount || 0}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Reports Made</div>
                              <div className="font-semibold">{user.statistics?.reportsMadeCount || 0}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Reports Against</div>
                              <div className="font-semibold">{user.statistics?.reportsAgainstCount || 0}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Devices</div>
                              <div className="font-semibold">{user.statistics?.devicesCount || 0}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Joined</div>
                              <div className="font-semibold">
                                {user.joined_at ? new Date(user.joined_at).toLocaleDateString() : "N/A"}
                              </div>
                            </div>
                          </div>
                          {user.is_banned && (
                            <div className="mt-2 text-sm text-muted-foreground">
                              Banned {user.banned_at ? new Date(user.banned_at).toLocaleDateString() : ""}
                              {user.banned_until && ` until ${new Date(user.banned_until).toLocaleDateString()}`}
                              {user.ban_count > 0 && ` • ${user.ban_count} ban(s)`}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => loadUserDetails(user.id)}
                          className="rounded-full"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            window.location.href = `/profile/${user.handle}`;
                          }}
                          className="rounded-full"
                        >
                          <User className="w-4 h-4 mr-2" />
                          View Profile
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingUser(user)}
                          className="rounded-full"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeletingUser(user)}
                          className="rounded-full"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const newPage = Math.max(0, usersPage - 1);
                      setUsersPage(newPage);
                      loadUsers(newPage, usersSearch);
                    }}
                    disabled={usersPage === 0 || usersLoading}
                    className="rounded-2xl"
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {usersPage + 1} of {Math.ceil(usersTotal / 50) || 1}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const newPage = usersPage + 1;
                      setUsersPage(newPage);
                      loadUsers(newPage, usersSearch);
                    }}
                    disabled={usersPage * 50 + 50 >= usersTotal || usersLoading}
                    className="rounded-2xl"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}

            {/* Edit User Dialog */}
            {editingUser && (
              <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Edit User</DialogTitle>
                    <DialogDescription>Update user information</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Handle</label>
                      <Input
                        defaultValue={editingUser.handle}
                        onChange={(e) => setEditingUser({ ...editingUser, handle: e.target.value })}
                        className="mt-1 rounded-2xl"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Emoji Avatar</label>
                      <Input
                        defaultValue={editingUser.emoji_avatar}
                        onChange={(e) => setEditingUser({ ...editingUser, emoji_avatar: e.target.value })}
                        className="mt-1 rounded-2xl"
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">City</label>
                      <Input
                        defaultValue={editingUser.city || ""}
                        onChange={(e) => setEditingUser({ ...editingUser, city: e.target.value })}
                        className="mt-1 rounded-2xl"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editingUser.is_banned || false}
                        onChange={(e) => setEditingUser({ ...editingUser, is_banned: e.target.checked })}
                        className="rounded"
                      />
                      <label className="text-sm font-medium">Banned</label>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleUpdateUser(editingUser.id, {
                          handle: editingUser.handle,
                          emoji_avatar: editingUser.emoji_avatar,
                          city: editingUser.city,
                          is_banned: editingUser.is_banned,
                        })}
                        className="flex-1 rounded-2xl"
                      >
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setEditingUser(null)}
                        className="flex-1 rounded-2xl"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {/* Delete User Dialog */}
            {deletingUser && (
              <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete User</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete @{deletingUser.handle}? This will permanently delete the user and all their data (clips, reports, devices). This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Reason (required)</label>
                    <Textarea
                      placeholder="Enter reason for deletion..."
                      className="rounded-2xl"
                      onChange={(e) => setDeletingUser({ ...deletingUser, deleteReason: e.target.value })}
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        if (deletingUser.deleteReason) {
                          handleDeleteUser(deletingUser.id, deletingUser.deleteReason);
                        } else {
                          toast({
                            title: "Reason required",
                            description: "Please provide a reason for deletion.",
                            variant: "destructive",
                          });
                        }
                      }}
                      className="rounded-2xl bg-destructive text-destructive-foreground"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* User Details Dialog */}
            {viewingUser && (
              <Dialog open={!!viewingUser} onOpenChange={(open) => !open && setViewingUser(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>User Details</DialogTitle>
                    <DialogDescription>Complete information for @{viewingUser.profile?.handle || viewingUser.handle}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6">
                    {/* Profile Info */}
                    <Card className="p-4 rounded-2xl">
                      <h3 className="font-semibold mb-3">Profile Information</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground">Avatar</div>
                          <div className="text-4xl" role="img" aria-label="User avatar">
                            {viewingUser.profile?.emoji_avatar ? String(viewingUser.profile.emoji_avatar) : "👤"}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Handle</div>
                          <div className="font-semibold">@{viewingUser.profile?.handle || viewingUser.handle}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">City</div>
                          <div>{viewingUser.profile?.city || "N/A"}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Joined</div>
                          <div>{viewingUser.profile?.joined_at ? new Date(viewingUser.profile.joined_at).toLocaleString() : "N/A"}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Status</div>
                          <div>
                            {viewingUser.profile?.is_banned ? (
                              <Badge variant="destructive">Banned</Badge>
                            ) : (
                              <Badge variant="outline">Active</Badge>
                            )}
                          </div>
                        </div>
                        {viewingUser.statistics && (
                          <>
                            <div>
                              <div className="text-sm text-muted-foreground">Clips</div>
                              <div className="font-semibold">{viewingUser.statistics.clipsCount || 0}</div>
                            </div>
                            <div>
                              <div className="text-sm text-muted-foreground">Reports Made</div>
                              <div className="font-semibold">{viewingUser.statistics.reportsMadeCount || 0}</div>
                            </div>
                            <div>
                              <div className="text-sm text-muted-foreground">Reports Against</div>
                              <div className="font-semibold">{viewingUser.statistics.reportsAgainstCount || 0}</div>
                            </div>
                            <div>
                              <div className="text-sm text-muted-foreground">Devices</div>
                              <div className="font-semibold">{viewingUser.statistics.devicesCount || 0}</div>
                            </div>
                          </>
                        )}
                      </div>
                    </Card>

                    {/* IP Addresses */}
                    {viewingUser.ipAddresses && viewingUser.ipAddresses.length > 0 && (
                      <Card className="p-4 rounded-2xl">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold">IP Addresses</h3>
                        </div>
                        <div className="space-y-2">
                          {viewingUser.ipAddresses.map((ip: string) => {
                            const isBanned = viewingUser.blacklistedIPs?.includes(ip);
                            const banEntry = viewingUser.ipBlacklistEntries?.find((entry: any) => entry.ip_address === ip);
                            return (
                              <div key={ip} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                <div className="flex items-center gap-3">
                                  <code className="font-mono text-sm">{ip}</code>
                                  {isBanned && (
                                    <Badge variant="destructive">Banned</Badge>
                                  )}
                                  {banEntry && (
                                    <span className="text-xs text-muted-foreground">
                                      {banEntry.reason && `Reason: ${banEntry.reason}`}
                                      {banEntry.expires_at && ` • Expires: ${new Date(banEntry.expires_at).toLocaleString()}`}
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  {isBanned ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleUnbanIP(ip)}
                                      className="rounded-full"
                                    >
                                      <ShieldOff className="w-4 h-4 mr-2" />
                                      Unban
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => setBanningIP({ ip, userId: viewingUser.profile?.id || viewingUser.id })}
                                      className="rounded-full"
                                    >
                                      <Ban className="w-4 h-4 mr-2" />
                                      Ban IP
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    )}

                    {/* Devices */}
                    {viewingUser.devices && viewingUser.devices.length > 0 && (
                      <Card className="p-4 rounded-2xl">
                        <h3 className="font-semibold mb-3">Devices</h3>
                        <div className="space-y-2">
                          {viewingUser.devices.map((device: any) => (
                            <div key={device.id} className="p-3 rounded-lg bg-muted/50">
                              <div className="flex items-center justify-between">
                                <div>
                                  <code className="font-mono text-xs">{device.device_id}</code>
                                  {device.is_suspicious && (
                                    <Badge variant="outline" className="text-yellow-600 ml-2">Suspicious</Badge>
                                  )}
                                  {device.is_revoked && (
                                    <Badge variant="outline" className="text-red-600 ml-2">Revoked</Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Last seen: {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "N/A"}
                                </div>
                              </div>
                              {device.ip_address && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  IP: <code>{device.ip_address}</code>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}

                    {/* Clips */}
                    {viewingUser.clips && viewingUser.clips.length > 0 && (
                      <Card className="p-4 rounded-2xl">
                        <h3 className="font-semibold mb-3">Recent Clips ({viewingUser.clips.length})</h3>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {viewingUser.clips.slice(0, 10).map((clip: any) => (
                            <div key={clip.id} className="p-2 rounded-lg bg-muted/50 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="truncate">{clip.title || clip.captions || "Untitled"}</span>
                                <Badge variant={clip.status === "live" ? "default" : "outline"}>{clip.status}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}

                    {/* Audit Logs */}
                    {viewingUser.auditLogs && viewingUser.auditLogs.length > 0 && (
                      <Card className="p-4 rounded-2xl">
                        <h3 className="font-semibold mb-3">Security Audit Logs</h3>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {viewingUser.auditLogs.slice(0, 10).map((log: any) => (
                            <div key={log.id} className="p-2 rounded-lg bg-muted/50 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{log.event_type}</span>
                                <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                              </div>
                              {log.severity && (
                                <Badge variant="outline" className="mt-1 text-xs">
                                  {log.severity}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {/* IP Ban Dialog */}
            {banningIP && (
              <Dialog open={!!banningIP} onOpenChange={(open) => !open && setBanningIP(null)}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Ban IP Address</DialogTitle>
                    <DialogDescription>
                      Ban IP address: <code className="font-mono">{banningIP.ip}</code>
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Reason (required)</label>
                      <Textarea
                        placeholder="Enter reason for IP ban..."
                        className="mt-1 rounded-2xl"
                        onChange={(e) => setBanningIP({ ...banningIP, reason: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Expires At (optional)</label>
                      <Input
                        type="datetime-local"
                        className="mt-1 rounded-2xl"
                        onChange={(e) => {
                          if (e.target.value) {
                            setBanningIP({ ...banningIP, expiresAt: new Date(e.target.value).toISOString() });
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Leave empty for permanent ban</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          if (banningIP.reason) {
                            handleBanIP(banningIP.ip, banningIP.reason, banningIP.expiresAt);
                          } else {
                            toast({
                              title: "Reason required",
                              description: "Please provide a reason for the IP ban.",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="flex-1 rounded-2xl"
                        variant="destructive"
                      >
                        <Ban className="w-4 h-4 mr-2" />
                        Ban IP
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setBanningIP(null)}
                        className="flex-1 rounded-2xl"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <div className="flex items-center gap-4 flex-wrap">
              <Select value={reportsStatus} onValueChange={(value) => {
                setReportsStatus(value);
                setReportsPage(0);
                loadReports(0, value);
              }}>
                <SelectTrigger className="w-[200px] rounded-2xl">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reports</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="actioned">Actioned</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => loadReports(reportsPage, reportsStatus)}
                disabled={reportsLoading}
                className="rounded-2xl"
              >
                {reportsLoading ? "Refreshing…" : "Refresh"}
              </Button>
              <Button
                variant="outline"
                onClick={handleScanAllReports}
                disabled={scanningAll || reportsLoading || reports.length === 0}
                className="rounded-2xl"
              >
                <Scan className="w-4 h-4 mr-2" />
                {scanningAll ? `Scanning ${reports.length} reports...` : `Scan All (${reports.length})`}
              </Button>
              {Object.keys(scanReports).length > 0 && (
                <Button
                  variant="outline"
                  onClick={downloadAllScanReports}
                  className="rounded-2xl"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download All Scans ({Object.keys(scanReports).length})
                </Button>
              )}
            </div>

            {reportsLoading ? (
              <Card className="p-6 rounded-2xl text-center">Loading reports...</Card>
            ) : reports.length === 0 ? (
              <Card className="p-6 rounded-2xl text-center text-muted-foreground">No reports found.</Card>
            ) : (
              <div className="space-y-4">
                {reports.map((report) => (
                  <Card key={report.id} className="p-6 rounded-2xl border-l-4 border-l-primary">
                    {/* Report Header */}
                    <div className="mb-4 pb-4 border-b">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl font-bold text-primary">#{report.id}</div>
                          <div>
                            <h3 className="font-semibold text-lg">
                              {report.clip ? "Clip Report" : report.profile_id ? "Profile Report" : "Report"}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {report.created_at ? new Date(report.created_at).toLocaleString() : "N/A"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={getWorkflowStateColor(report.workflow_state || "pending")}>
                            {report.workflow_state || "pending"}
                          </Badge>
                          <Badge variant={report.status === "open" ? "destructive" : "outline"}>
                            {report.status}
                          </Badge>
                          {report.priority > 0 && (
                            <Badge variant="outline" className="text-orange-600 border-orange-600">
                              Priority: {report.priority}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="flex-1 space-y-4">
                        {/* Reporter Information - Prominent */}
                        {report.reporter && (
                          <Card className="p-4 rounded-xl bg-primary/5 border-primary/20">
                            <div className="flex items-center gap-3">
                              <div className="text-3xl">{report.reporter.emoji_avatar || "🕵️"}</div>
                              <div className="flex-1">
                                <p className="font-semibold text-sm text-muted-foreground mb-1">Reported By</p>
                                <p className="font-bold text-lg">
                                  @{report.reporter.handle || "Anonymous"}
                                </p>
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="h-auto p-0 text-xs"
                                  onClick={() => navigate(`/profile/${report.reporter?.handle}`)}
                                >
                                  View Reporter Profile →
                                </Button>
                              </div>
                            </div>
                          </Card>
                        )}

                        {/* What Was Reported */}
                        {report.clip ? (
                          <div>
                            <p className="text-sm font-semibold text-muted-foreground mb-2">Reported Content:</p>
                            <ClipCard clip={mapClip(report.clip)} />
                          </div>
                        ) : report.profile_id ? (
                          <Card className="p-4 rounded-xl bg-muted/50 border">
                            <p className="text-sm font-semibold text-muted-foreground mb-3">Reported Profile:</p>
                            <div className="flex items-center gap-3">
                              <div className="text-4xl">{report.profile?.emoji_avatar || "👤"}</div>
                              <div className="flex-1">
                                <p className="font-semibold text-lg">@{report.profile?.handle || "Unknown"}</p>
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="h-auto p-0 text-xs"
                                  onClick={() => navigate(`/profile/${report.profile?.handle}`)}
                                >
                                  View Profile →
                                </Button>
                              </div>
                            </div>
                          </Card>
                        ) : null}

                        {/* Report Details */}
                        <Card className="p-4 rounded-xl bg-muted/30">
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm font-semibold text-muted-foreground mb-1">Reason</p>
                              <p className="font-medium capitalize text-base">{report.reason}</p>
                            </div>
                            {report.details && (
                              <div>
                                <p className="text-sm font-semibold text-muted-foreground mb-1">Details</p>
                                <p className="text-sm whitespace-pre-wrap">{report.details}</p>
                              </div>
                            )}
                            {report.assigned_to_profile && (
                              <div>
                                <p className="text-sm font-semibold text-muted-foreground mb-1">Assigned To</p>
                                <p className="text-sm">
                                  {report.assigned_to_profile.emoji_avatar || "👤"} @{report.assigned_to_profile.handle || "Unknown"}
                                </p>
                              </div>
                            )}
                            {report.reviewed_at && (
                              <div>
                                <p className="text-sm font-semibold text-muted-foreground mb-1">Reviewed</p>
                                <p className="text-sm">{new Date(report.reviewed_at).toLocaleString()}</p>
                              </div>
                            )}
                            {report.moderation_notes && (
                              <div className="mt-3 pt-3 border-t">
                                <p className="text-sm font-semibold text-muted-foreground mb-1">Moderation Notes</p>
                                <p className="text-sm whitespace-pre-wrap bg-background p-2 rounded-lg">{report.moderation_notes}</p>
                              </div>
                            )}
                          </div>
                        </Card>
                      </div>
                      <div className="flex flex-col gap-2">
                        {report.clip && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleModerationAction({
                                clipId: report.clip.id,
                                newStatus: "hidden",
                                reportIds: [report.id],
                              })}
                              disabled={isActioning}
                              className="rounded-full"
                            >
                              Hide Clip
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleModerationAction({
                                clipId: report.clip.id,
                                newStatus: "removed",
                                reportIds: [report.id],
                              })}
                              disabled={isActioning}
                              className="rounded-full"
                            >
                              Remove Clip
                            </Button>
                          </>
                        )}
                        {report.profile_id && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="rounded-full">
                                Profile Actions
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Profile Actions</DialogTitle>
                                <DialogDescription>
                                  Take action on the reported profile
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <Button
                                  variant="destructive"
                                  onClick={() => handleProfileAction(report.id, "ban", 24)}
                                  className="w-full"
                                >
                                  Ban (24 hours)
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => handleProfileAction(report.id, "ban")}
                                  className="w-full"
                                >
                                  Ban (Permanent)
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => handleProfileAction(report.id, "warn", undefined, "Warning issued")}
                                  className="w-full"
                                >
                                  Warn
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleResolveReport(report.id)}
                          disabled={isActioning}
                          className="rounded-full"
                        >
                          Resolve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleScanReport(report.id)}
                          disabled={scanningReports.has(report.id)}
                          className="rounded-full"
                        >
                          <Scan className="w-4 h-4 mr-2" />
                          {scanningReports.has(report.id) ? "Scanning..." : "Scan Report"}
                        </Button>
                        {scanReports[report.id] && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadScanReport(report.id)}
                            className="rounded-full"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download Report
                          </Button>
                        )}
                      </div>
                    </div>
                    {scanReports[report.id] && (
                      <div className="mt-4 p-4 bg-muted/50 rounded-lg border-t">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold">Scan Results</h4>
                          <Badge variant={scanReports[report.id].riskScore > 7 ? "destructive" : scanReports[report.id].riskScore > 4 ? "outline" : "default"}>
                            Risk: {scanReports[report.id].riskScore?.toFixed(2) || "N/A"}
                          </Badge>
                        </div>
                        <div className="space-y-2 text-sm">
                          {scanReports[report.id].summary && (
                            <>
                              <p className="font-medium">Summary:</p>
                              <p className="text-muted-foreground">{scanReports[report.id].summary}</p>
                            </>
                          )}
                          {scanReports[report.id].flags && scanReports[report.id].flags.length > 0 && (
                            <div>
                              <p className="font-medium">Flags:</p>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {scanReports[report.id].flags.map((flag: string, idx: number) => (
                                  <Badge key={idx} variant="outline">{flag}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {scanReports[report.id].recommendations && scanReports[report.id].recommendations.length > 0 && (
                            <div>
                              <p className="font-medium">Recommendations:</p>
                              <ul className="list-disc list-inside text-muted-foreground mt-1">
                                {scanReports[report.id].recommendations.map((rec: string, idx: number) => (
                                  <li key={idx}>{rec}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const newPage = Math.max(0, reportsPage - 1);
                      setReportsPage(newPage);
                      loadReports(newPage, reportsStatus);
                    }}
                    disabled={reportsPage === 0 || reportsLoading}
                    className="rounded-2xl"
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {reportsPage + 1} of {Math.ceil(reportsTotal / 50) || 1} • {reportsTotal} total
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const newPage = reportsPage + 1;
                      setReportsPage(newPage);
                      loadReports(newPage, reportsStatus);
                    }}
                    disabled={reportsPage * 50 + 50 >= reportsTotal || reportsLoading}
                    className="rounded-2xl"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="clips" className="space-y-6">
            <div className="flex items-center gap-4 flex-wrap">
              <Input
                placeholder="Search clips by title or captions..."
                value={clipsSearch}
                onChange={(e) => {
                  setClipsSearch(e.target.value);
                  setClipsPage(0);
                  loadClips(0, clipsStatus, e.target.value);
                }}
                className="flex-1 min-w-[200px] rounded-2xl"
              />
              <Select value={clipsStatus} onValueChange={(value) => {
                setClipsStatus(value);
                setClipsPage(0);
                loadClips(0, value, clipsSearch);
              }}>
                <SelectTrigger className="w-[180px] rounded-2xl">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clips</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="hidden">Hidden</SelectItem>
                  <SelectItem value="removed">Removed</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => loadClips(clipsPage, clipsStatus, clipsSearch)}
                disabled={clipsLoading}
                className="rounded-2xl"
              >
                {clipsLoading ? "Refreshing…" : "Refresh"}
              </Button>
            </div>

            {selectedClips.size > 0 && (
              <Card className="p-4 rounded-2xl bg-muted/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {selectedClips.size} clip(s) selected
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBulkClipAction(Array.from(selectedClips), "live")}
                      disabled={isActioning}
                      className="rounded-full"
                    >
                      Approve ({selectedClips.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBulkClipAction(Array.from(selectedClips), "hidden")}
                      disabled={isActioning}
                      className="rounded-full"
                    >
                      Hide ({selectedClips.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleBulkClipAction(Array.from(selectedClips), "removed")}
                      disabled={isActioning}
                      className="rounded-full"
                    >
                      Remove ({selectedClips.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedClips(new Set())}
                      className="rounded-full"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {clipsLoading ? (
              <Card className="p-6 rounded-2xl text-center">Loading clips...</Card>
            ) : clips.length === 0 ? (
              <Card className="p-6 rounded-2xl text-center text-muted-foreground">No clips found.</Card>
            ) : (
              <div className="space-y-4">
                {clips.map((clip) => (
                  <Card key={clip.id} className="p-6 rounded-2xl">
                    <div className="flex items-start gap-4">
                      <Checkbox
                        checked={selectedClips.has(clip.id)}
                        onCheckedChange={(checked) => {
                          setSelectedClips((prev) => {
                            const next = new Set(prev);
                            if (checked) {
                              next.add(clip.id);
                            } else {
                              next.delete(clip.id);
                            }
                            return next;
                          });
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <ClipCard clip={mapClip(clip)} />
                        <div className="mt-4 flex items-center gap-2 flex-wrap">
                          <Badge variant={clip.status === "live" ? "default" : clip.status === "hidden" ? "secondary" : "destructive"}>
                            {clip.status}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            Created: {clip.created_at ? new Date(clip.created_at).toLocaleString() : "N/A"}
                          </span>
                          {clip.listens_count > 0 && (
                            <span className="text-sm text-muted-foreground">
                              {clip.listens_count} listens
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          variant={clip.status === "live" ? "default" : "outline"}
                          onClick={() => handleModerationAction({
                            clipId: clip.id,
                            newStatus: "live",
                          })}
                          disabled={isActioning}
                          className="rounded-full"
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant={clip.status === "hidden" ? "secondary" : "outline"}
                          onClick={() => handleModerationAction({
                            clipId: clip.id,
                            newStatus: "hidden",
                          })}
                          disabled={isActioning}
                          className="rounded-full"
                        >
                          Hide
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleModerationAction({
                            clipId: clip.id,
                            newStatus: "removed",
                          })}
                          disabled={isActioning}
                          className="rounded-full"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const newPage = Math.max(0, clipsPage - 1);
                      setClipsPage(newPage);
                      loadClips(newPage, clipsStatus, clipsSearch);
                    }}
                    disabled={clipsPage === 0 || clipsLoading}
                    className="rounded-2xl"
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {clipsPage + 1} of {Math.ceil(clipsTotal / 50) || 1} • {clipsTotal} total
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const newPage = clipsPage + 1;
                      setClipsPage(newPage);
                      loadClips(newPage, clipsStatus, clipsSearch);
                    }}
                    disabled={clipsPage * 50 + 50 >= clipsTotal || clipsLoading}
                    className="rounded-2xl"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Security Dashboard</h2>
                <p className="text-sm text-muted-foreground mt-1">Monitor and manage suspicious devices, security events, and threats</p>
              </div>
              <div className="flex gap-2">
                <Select value={securityFilter} onValueChange={(value: "all" | "suspicious" | "revoked") => {
                  setSecurityFilter(value);
                  loadSecurityDevices(value);
                }}>
                  <SelectTrigger className="w-[180px] rounded-2xl">
                    <SelectValue placeholder="Filter devices" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Devices</SelectItem>
                    <SelectItem value="suspicious">Suspicious Only</SelectItem>
                    <SelectItem value="revoked">Revoked Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {securityDevicesLoading ? (
              <Card className="p-6 rounded-2xl text-center">Loading security devices...</Card>
            ) : securityDevices.length === 0 ? (
              <Card className="p-6 rounded-2xl text-center text-muted-foreground">
                <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-lg font-medium">No security issues found</p>
                <p className="text-sm mt-2">All devices appear to be secure.</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {securityDevices.map((device) => (
                  <Card key={device.device_id} className="p-6 rounded-2xl border-2 hover:shadow-lg transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${device.is_revoked ? 'bg-red-100 dark:bg-red-950/30' : 'bg-yellow-100 dark:bg-yellow-950/30'}`}>
                            {device.is_revoked ? (
                              <Lock className="w-5 h-5 text-red-600 dark:text-red-400" />
                            ) : (
                              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <code className="font-mono text-sm font-semibold bg-muted px-2 py-1 rounded">{device.device_id}</code>
                              {device.is_suspicious && (
                                <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                                  Suspicious
                                </Badge>
                              )}
                              {device.is_revoked && (
                                <Badge variant="outline" className="text-red-600 border-red-600">
                                  Revoked
                                </Badge>
                              )}
                            </div>
                            {device.profile && (
                              <div className="text-sm text-muted-foreground">
                                User: <span className="font-medium">{device.profile.handle || device.profile.display_name || 'Unknown'}</span>
                                {device.profile.is_banned && (
                                  <Badge variant="destructive" className="ml-2">Banned</Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                          {device.ip_address && (
                            <div className="space-y-1">
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                IP Address
                              </div>
                              <div className="font-mono text-sm font-medium">{device.ip_address}</div>
                            </div>
                          )}
                          {device.user_agent && (
                            <div className="space-y-1">
                              <div className="text-xs text-muted-foreground">User Agent</div>
                              <div className="text-sm truncate" title={device.user_agent}>
                                {device.user_agent.substring(0, 50)}...
                              </div>
                            </div>
                          )}
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Last Seen
                            </div>
                            <div className="text-sm">
                              {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "Never"}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Activity className="w-3 h-3" />
                              First Seen
                            </div>
                            <div className="text-sm">
                              {device.first_seen_at ? new Date(device.first_seen_at).toLocaleString() : "Unknown"}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Request Count</div>
                            <div className="text-lg font-semibold">{device.request_count || 0}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Failed Auth Attempts</div>
                            <div className="text-lg font-semibold text-red-600">{device.failed_auth_count || 0}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Security Events</div>
                            <div className="text-lg font-semibold">{device.auditLogs?.length || 0}</div>
                          </div>
                        </div>

                        {device.recentEvents && device.recentEvents.length > 0 && (
                          <div className="mt-4 pt-4 border-t">
                            <div className="text-sm font-semibold mb-2">Recent Security Events</div>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {device.recentEvents.slice(0, 5).map((event: any, idx: number) => (
                                <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50 text-xs">
                                  <div className={`w-2 h-2 rounded-full mt-1.5 ${
                                    event.severity === 'critical' ? 'bg-red-500' :
                                    event.severity === 'error' ? 'bg-orange-500' :
                                    event.severity === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                                  }`} />
                                  <div className="flex-1">
                                    <div className="font-medium">{event.event_type}</div>
                                    <div className="text-muted-foreground">
                                      {new Date(event.created_at).toLocaleString()}
                                    </div>
                                    {event.event_details && Object.keys(event.event_details).length > 0 && (
                                      <div className="text-muted-foreground mt-1">
                                        {JSON.stringify(event.event_details).substring(0, 100)}...
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {device.revoked_reason && (
                          <div className="mt-4 pt-4 border-t">
                            <div className="text-sm font-semibold mb-1">Revocation Reason</div>
                            <div className="text-sm text-muted-foreground">{device.revoked_reason}</div>
                            {device.revoked_at && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Revoked: {new Date(device.revoked_at).toLocaleString()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="stats" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">System Statistics</h2>
              <Button
                variant="outline"
                onClick={loadSystemStats}
                className="rounded-2xl"
              >
                Refresh
              </Button>
            </div>

                {systemStats ? (
              <div className="space-y-6">
                <Card className="p-6 rounded-2xl">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <h3 className="text-lg font-semibold mb-1">Daily Prompt Settings</h3>
                      <p className="text-sm text-muted-foreground">
                        Control whether daily topics are generated by AI or use the curated question list only.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {useAiDailyTopics ? "AI-generated prompts enabled" : "Using fixed curated prompts only"}
                      </span>
                      <Button
                        variant={useAiDailyTopics ? "default" : "outline"}
                        size="sm"
                        className="rounded-full"
                        onClick={() => handleToggleAiDailyTopics(!useAiDailyTopics)}
                        disabled={isUpdatingSettings}
                      >
                        {isUpdatingSettings
                          ? "Updating…"
                          : useAiDailyTopics
                          ? "Switch to curated prompts"
                          : "Enable AI prompts"}
                      </Button>
                    </div>
                  </div>
                </Card>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="p-6 rounded-2xl">
                    <div className="text-sm text-muted-foreground mb-2">Total Users</div>
                    <div className="text-3xl font-bold">{systemStats.totalUsers || 0}</div>
                  </Card>
                  <Card className="p-6 rounded-2xl">
                    <div className="text-sm text-muted-foreground mb-2">Total Clips</div>
                    <div className="text-3xl font-bold">{systemStats.totalClips || 0}</div>
                  </Card>
                  <Card className="p-6 rounded-2xl">
                    <div className="text-sm text-muted-foreground mb-2">Total Reports</div>
                    <div className="text-3xl font-bold">{systemStats.totalReports || 0}</div>
                  </Card>
                  <Card className="p-6 rounded-2xl">
                    <div className="text-sm text-muted-foreground mb-2">Banned Users</div>
                    <div className="text-3xl font-bold text-red-500">{systemStats.bannedUsers || 0}</div>
                  </Card>
                </div>

                {systemStats.clipsByStatus && Object.keys(systemStats.clipsByStatus).length > 0 && (
                  <Card className="p-6 rounded-2xl">
                    <h3 className="text-lg font-semibold mb-4">Clips by Status</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(systemStats.clipsByStatus).map(([status, count]) => (
                        <div key={status} className="text-center">
                          <div className="text-2xl font-bold">{count as number}</div>
                          <div className="text-sm text-muted-foreground capitalize">{status}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {systemStats.reportsByStatus && Object.keys(systemStats.reportsByStatus).length > 0 && (
                  <Card className="p-6 rounded-2xl">
                    <h3 className="text-lg font-semibold mb-4">Reports by Status</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(systemStats.reportsByStatus).map(([status, count]) => (
                        <div key={status} className="text-center">
                          <div className="text-2xl font-bold">{count as number}</div>
                          <div className="text-sm text-muted-foreground capitalize">{status}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {abuseMetrics && (
                  <Card className="p-6 rounded-2xl">
                    <h3 className="text-lg font-semibold mb-4">Security Overview</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Critical Events (24h)</div>
                        <div className="text-2xl font-bold text-red-500">{abuseMetrics.security.criticalEvents24h}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Error Events (24h)</div>
                        <div className="text-2xl font-bold text-orange-500">{abuseMetrics.security.errorEvents24h}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Suspicious Devices</div>
                        <div className="text-2xl font-bold text-yellow-500">{abuseMetrics.security.suspiciousDevices}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Blacklisted IPs</div>
                        <div className="text-2xl font-bold text-red-500">{abuseMetrics.security.blacklistedIPs || 0}</div>
                      </div>
                    </div>
                  </Card>
                )}

                {moderationStats && (
                  <Card className="p-6 rounded-2xl">
                    <h3 className="text-lg font-semibold mb-4">Moderation Performance</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Reviewed Today</div>
                        <div className="text-2xl font-bold">{moderationStats.items_reviewed_today}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Reviewed (30d)</div>
                        <div className="text-2xl font-bold">{moderationStats.items_reviewed_period}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Avg Review Time</div>
                        <div className="text-2xl font-bold">
                          {Math.round(moderationStats.avg_time_to_review_minutes)}m
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">High Risk Pending</div>
                        <div className="text-2xl font-bold text-red-500">{moderationStats.high_risk_items_pending}</div>
                      </div>
                    </div>
                  </Card>
                )}

                {/* IP Bans Management */}
                <Card className="p-6 rounded-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">IP Bans Management</h3>
                    <Button
                      variant="outline"
                      onClick={() => loadIPBans(ipBansPage)}
                      disabled={ipBansLoading}
                      className="rounded-2xl"
                    >
                      {ipBansLoading ? "Refreshing…" : "Refresh"}
                    </Button>
                  </div>
                  {ipBansLoading ? (
                    <div className="text-center py-4">Loading IP bans...</div>
                  ) : ipBans.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">No IP bans found.</div>
                  ) : (
                    <div className="space-y-2">
                      {ipBans.map((ban: any) => (
                        <div key={ban.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex-1">
                            <code className="font-mono text-sm font-semibold">{ban.ip_address}</code>
                            <div className="text-xs text-muted-foreground mt-1">
                              {ban.reason && `Reason: ${ban.reason}`}
                              {ban.banned_by_profile && (
                                <span> • Banned by: {ban.banned_by_profile.emoji_avatar} @{ban.banned_by_profile.handle}</span>
                              )}
                              <span> • Banned: {new Date(ban.banned_at).toLocaleString()}</span>
                              {ban.expires_at ? (
                                <span> • Expires: {new Date(ban.expires_at).toLocaleString()}</span>
                              ) : (
                                <span> • Permanent</span>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnbanIP(ban.ip_address)}
                            className="rounded-full"
                          >
                            <ShieldOff className="w-4 h-4 mr-2" />
                            Unban
                          </Button>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            const newPage = Math.max(0, ipBansPage - 1);
                            setIpBansPage(newPage);
                            loadIPBans(newPage);
                          }}
                          disabled={ipBansPage === 0 || ipBansLoading}
                          className="rounded-2xl"
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          Page {ipBansPage + 1} of {Math.ceil(ipBansTotal / 50) || 1} • {ipBansTotal} total
                        </span>
                        <Button
                          variant="outline"
                          onClick={() => {
                            const newPage = ipBansPage + 1;
                            setIpBansPage(newPage);
                            loadIPBans(newPage);
                          }}
                          disabled={ipBansPage * 50 + 50 >= ipBansTotal || ipBansLoading}
                          className="rounded-2xl"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            ) : (
              <Card className="p-6 rounded-2xl text-center">Loading stats...</Card>
            )}
          </TabsContent>

          <TabsContent value="spotlight" className="space-y-6">
            <section className="space-y-4">
              <Card className="p-4 md:p-6 rounded-2xl space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" />
                      Garden Spotlight
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Manually set or adjust today&apos;s Garden Spotlight question. This controls what appears on the home
                      screen card.
                    </p>
                  </div>
                </div>

                {!isAdmin && (
                  <p className="text-sm text-destructive">
                    You don&apos;t have admin permissions to change the Garden Spotlight.
                  </p>
                )}

                {isAdmin && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Today&apos;s question
                      </p>
                      {isLoadingSpotlight ? (
                        <p className="text-sm text-muted-foreground">Loading current question…</p>
                      ) : spotlightQuestion ? (
                        <div className="rounded-2xl border bg-muted/60 p-3 space-y-1 text-sm">
                          {spotlightQuestion.topic_title && (
                            <p className="text-xs text-muted-foreground">
                              Topic: <span className="font-medium">{spotlightQuestion.topic_title}</span>
                            </p>
                          )}
                          <p className="font-medium">{spotlightQuestion.question}</p>
                          <p className="text-xs text-muted-foreground">
                            Source: {spotlightQuestion.generated_by || "unknown"} · Last updated{" "}
                            {new Date(spotlightQuestion.updated_at).toLocaleString()}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No question has been generated yet for today. You can create one manually below.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Set custom question for today</label>
                      <Textarea
                        value={manualQuestion}
                        onChange={(e) => setManualQuestion(e.target.value)}
                        placeholder="What brightened your day?"
                        rows={3}
                        className="resize-none rounded-2xl"
                        disabled={isUpdatingSpotlight}
                      />
                      <p className="text-xs text-muted-foreground">
                        This will immediately replace the current Garden Spotlight question for everyone. The automatic
                        rotation still runs nightly to create a fresh question for tomorrow.
                      </p>
                    </div>

                    <div className="flex justify-between gap-2 flex-wrap">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleGenerateSpotlightNow}
                        disabled={isGeneratingSpotlight}
                        className="rounded-2xl"
                      >
                        {isGeneratingSpotlight ? "Generating…" : "Generate new AI question for today"}
                      </Button>
                      <Button
                        type="button"
                        onClick={handleUpdateSpotlightQuestion}
                        disabled={isUpdatingSpotlight}
                        className="rounded-2xl"
                      >
                        {isUpdatingSpotlight ? "Updating…" : "Save today’s question"}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </section>
          </TabsContent>

          <TabsContent value="cron" className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-bold">Cron Jobs Management</h2>
                <p className="text-sm text-muted-foreground">
                  View, test, and manage scheduled cron jobs
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => loadCronJobs()}
                disabled={cronJobsLoading}
                className="rounded-2xl"
              >
                {cronJobsLoading ? "Refreshing…" : "Refresh"}
              </Button>
            </div>

            {cronJobsLoading ? (
              <Card className="p-6 rounded-2xl text-center">
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                  <span>Loading cron jobs...</span>
                </div>
              </Card>
            ) : cronJobsError ? (
              <Card className="p-6 rounded-2xl border-destructive/50 bg-destructive/10">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-destructive mb-2">Error Loading Cron Jobs</h3>
                    <p className="text-sm text-muted-foreground mb-4">{cronJobsError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadCronJobs()}
                      className="rounded-2xl"
                    >
                      Try Again
                    </Button>
                  </div>
                </div>
              </Card>
            ) : cronJobs.length === 0 ? (
              <Card className="p-6 rounded-2xl text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="font-medium mb-1">No cron jobs found</p>
                <p className="text-sm">Make sure pg_cron extension is enabled in your Supabase database.</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {cronJobs.map((job) => {
                  const runResult = jobRunResults[job.jobname];
                  const hasHistory = cronJobHistory[job.jobname] && cronJobHistory[job.jobname].length > 0;
                  const lastRun = hasHistory ? cronJobHistory[job.jobname][0] : null;
                  
                  return (
                    <Card 
                      key={job.jobid} 
                      className={`p-6 rounded-2xl transition-all duration-200 hover:shadow-lg border-l-4 ${
                        job.active 
                          ? "border-l-green-500 bg-gradient-to-r from-green-50/80 to-background dark:from-green-950/20 dark:to-background shadow-sm" 
                          : "border-l-gray-400 bg-gradient-to-r from-gray-50/50 to-background dark:from-gray-950/10 dark:to-background shadow-sm opacity-75"
                      }`}
                    >
                      {/* Header with Status */}
                      <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-4 flex-wrap">
                            <h3 className="font-bold text-xl truncate text-foreground">{job.jobname}</h3>
                            <Badge 
                              variant={job.active ? "default" : "secondary"}
                              className={`${job.active ? "bg-green-600 hover:bg-green-700 text-white shadow-sm" : "bg-gray-400 text-gray-100"} font-semibold px-3 py-1`}
                            >
                              {job.active ? "✓ Active" : "⏸ Inactive"}
                            </Badge>
                            {lastRun && (
                              <Badge 
                                variant={lastRun.status === "succeeded" ? "default" : "destructive"}
                                className="text-xs"
                              >
                                {lastRun.status === "succeeded" ? "✓ Last: Success" : "✗ Last: Failed"}
                              </Badge>
                            )}
                            {runResult && (
                              <Badge 
                                variant={runResult.success ? "default" : "destructive"}
                                className="text-xs animate-pulse"
                              >
                                {runResult.success ? "✓ Test: Success" : "✗ Test: Failed"}
                              </Badge>
                            )}
                          </div>
                          
                          {/* Status Info */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4">
                            <div className="space-y-2.5">
                              <div className="flex items-center gap-2.5 p-2 bg-muted/50 rounded-lg">
                                <Clock className="w-4 h-4 text-primary flex-shrink-0" />
                                <span className="font-semibold text-foreground">Schedule:</span>
                                <code className="text-xs bg-background px-2.5 py-1 rounded-md border font-mono font-semibold text-primary">{job.schedule}</code>
                              </div>
                              <div className="flex items-center gap-2.5 p-2 bg-muted/50 rounded-lg">
                                <Settings className="w-4 h-4 text-primary flex-shrink-0" />
                                <span className="font-semibold text-foreground">Database:</span>
                                <span className="text-muted-foreground font-medium">{job.database}</span>
                              </div>
                              {lastRun && (
                                <div className="flex items-center gap-2.5 p-2 bg-muted/50 rounded-lg">
                                  <Activity className="w-4 h-4 text-primary flex-shrink-0" />
                                  <span className="font-semibold text-foreground">Last Run:</span>
                                  <span className="text-muted-foreground font-medium">
                                    {new Date(lastRun.start_time).toLocaleString()}
                                  </span>
                                </div>
                              )}
                              {runResult && (
                                <div className="flex items-center gap-2.5 p-2 bg-muted/50 rounded-lg">
                                  <Play className="w-4 h-4 text-primary flex-shrink-0" />
                                  <span className="font-semibold text-foreground">Last Test:</span>
                                  <span className="text-muted-foreground font-medium">
                                    {runResult.timestamp.toLocaleTimeString()}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="p-3 bg-muted/30 rounded-lg border">
                              <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-2 block">Command:</span>
                              <code className="block text-xs bg-background p-3 rounded-md border font-mono break-all text-foreground shadow-inner">{job.command}</code>
                            </div>
                          </div>

                          {/* Run Result Message */}
                          {runResult && (
                            <div className={`mt-4 p-4 rounded-xl border-2 shadow-sm animate-in slide-in-from-top-2 duration-300 ${
                              runResult.success 
                                ? "bg-gradient-to-r from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 border-green-400 dark:border-green-700" 
                                : "bg-gradient-to-r from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20 border-red-400 dark:border-red-700"
                            }`}>
                              <div className="flex items-start gap-3">
                                {runResult.success ? (
                                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="text-white text-sm font-bold">✓</span>
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="text-white text-sm font-bold">✗</span>
                                  </div>
                                )}
                                <div className="flex-1">
                                  <div className={`text-sm font-bold mb-1 ${
                                    runResult.success ? "text-green-800 dark:text-green-300" : "text-red-800 dark:text-red-300"
                                  }`}>
                                    {runResult.success ? "Test Run Successful" : "Test Run Failed"}
                                  </div>
                                  <div className={`text-xs ${
                                    runResult.success ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                                  }`}>
                                    {runResult.message}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Action Buttons */}
                        <div className="flex gap-2 flex-wrap items-start">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (selectedCronJob === job.jobname) {
                                setSelectedCronJob(null);
                              } else {
                                setSelectedCronJob(job.jobname);
                                loadCronJobHistory(job.jobname, job.jobid);
                              }
                            }}
                            className="rounded-xl shadow-sm hover:shadow-md transition-shadow font-medium"
                          >
                            <Activity className="w-4 h-4 mr-2" />
                            {selectedCronJob === job.jobname ? "Hide History" : "View History"}
                          </Button>
                          <Button
                            size="sm"
                            variant={job.active ? "default" : "secondary"}
                            onClick={() => testCronJob(job.jobname)}
                            disabled={testingJob === job.jobname || !job.active}
                            className={`rounded-xl shadow-sm hover:shadow-md transition-all font-semibold ${
                              testingJob === job.jobname ? "animate-pulse" : ""
                            }`}
                            title={!job.active ? "Cannot test inactive job" : "Manually trigger this job"}
                          >
                            {testingJob === job.jobname ? (
                              <>
                                <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                Running...
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4 mr-2" />
                                Test Run
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadCronJobReport(job.jobname)}
                            className="rounded-xl shadow-sm hover:shadow-md transition-shadow font-medium"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </Button>
                          <Dialog
                            open={deletingJobHistory === job.jobname}
                            onOpenChange={(open) => !open && setDeletingJobHistory(null)}
                          >
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setDeletingJobHistory(job.jobname)}
                              className="rounded-xl shadow-sm hover:shadow-md transition-shadow font-medium"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </Button>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Delete Execution History</DialogTitle>
                                <DialogDescription>
                                  Are you sure you want to delete execution history for job "{job.jobname}"?
                                  This action cannot be undone.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="outline"
                                  onClick={() => setDeletingJobHistory(null)}
                                  className="rounded-2xl"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => deleteCronJobHistory(job.jobname)}
                                  className="rounded-2xl"
                                >
                                  Delete All History
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>

                      {/* Execution History */}
                      {selectedCronJob === job.jobname && (
                        <div className="mt-6 pt-6 border-t-2 border-muted">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="font-bold text-lg flex items-center gap-2">
                              <Activity className="w-5 h-5 text-primary" />
                              Execution History
                            </h4>
                            {hasHistory && (
                              <Badge variant="outline" className="font-semibold px-3 py-1">
                                {cronJobHistory[job.jobname].length} execution{cronJobHistory[job.jobname].length !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                          {cronJobHistory[job.jobname] ? (
                            cronJobHistory[job.jobname].length === 0 ? (
                              <div className="p-4 rounded-lg bg-muted/50 text-center">
                                <p className="text-sm text-muted-foreground">
                                  No execution history available. This may require enabling execution logging in pg_cron.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                {cronJobHistory[job.jobname].map((run: any) => (
                                  <div
                                    key={run.runid}
                                    className={`p-3 rounded-lg border text-sm ${
                                      run.status === "succeeded"
                                        ? "bg-green-50/50 dark:bg-green-950/10 border-green-200 dark:border-green-900"
                                        : run.status === "failed"
                                        ? "bg-red-50/50 dark:bg-red-950/10 border-red-200 dark:border-red-900"
                                        : "bg-muted/50 border-border"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">
                                          {run.start_time
                                            ? new Date(run.start_time).toLocaleString()
                                            : "N/A"}
                                        </span>
                                      </div>
                                      <Badge
                                        variant={
                                          run.status === "succeeded"
                                            ? "default"
                                            : run.status === "failed"
                                            ? "destructive"
                                            : "secondary"
                                        }
                                        className="text-xs"
                                      >
                                        {run.status === "succeeded" ? "✓ Success" : run.status === "failed" ? "✗ Failed" : run.status || "unknown"}
                                      </Badge>
                                    </div>
                                    {run.end_time && run.start_time && (
                                      <div className="text-xs text-muted-foreground mb-1">
                                        <Clock className="w-3 h-3 inline mr-1" />
                                        Duration:{" "}
                                        {Math.round(
                                          (new Date(run.end_time).getTime() -
                                            new Date(run.start_time).getTime()) /
                                            1000
                                        )}{" "}
                                        seconds
                                      </div>
                                    )}
                                    {run.return_message && (
                                      <div className={`text-xs mt-2 p-2 rounded break-all ${
                                        run.status === "succeeded"
                                          ? "bg-green-100/50 dark:bg-green-900/20"
                                          : run.status === "failed"
                                          ? "bg-red-100/50 dark:bg-red-900/20"
                                          : "bg-muted"
                                      }`}>
                                        <span className="font-medium">Result:</span> {run.return_message}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )
                          ) : (
                            <div className="p-4 rounded-lg bg-muted/50 text-center">
                              <p className="text-sm text-muted-foreground">Loading history...</p>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Summary Stats */}
            {cronJobs.length > 0 && (
              <Card className="p-6 rounded-2xl">
                <h3 className="font-semibold mb-4">Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Total Jobs</div>
                    <div className="text-2xl font-bold">{cronJobs.length}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Active Jobs</div>
                    <div className="text-2xl font-bold text-green-600">
                      {cronJobs.filter((j) => j.active).length}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Inactive Jobs</div>
                    <div className="text-2xl font-bold text-red-600">
                      {cronJobs.filter((j) => !j.active).length}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Jobs with History</div>
                    <div className="text-2xl font-bold">
                      {Object.keys(cronJobHistory).length}
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
