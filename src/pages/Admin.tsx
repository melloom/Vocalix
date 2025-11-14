import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { useToast } from "@/hooks/use-toast";

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
}

interface ReportItem {
  id: number;
  clip: ClipForCard;
  reason: string;
  details: string | null;
  created_at: string | null;
  reporter?: {
    handle: string | null;
    emoji_avatar: string | null;
  };
}

interface FlagRecord {
  id: number;
  reasons: string[] | null;
  risk: number | null;
  source: string | null;
  created_at: string | null;
  clips: RawClip | null;
}

interface ReportRecord {
  id: number;
  reason: string | null;
  details: string | null;
  created_at: string | null;
  clip: RawClip | null;
  reporter?: {
    handle: string | null;
    emoji_avatar: string | null;
  } | null;
}

interface ModerationPayload {
  flags?: FlagRecord[] | null;
  reports?: ReportRecord[] | null;
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
    }));

  const reports: ReportItem[] = rawReports
    .filter((report): report is ReportRecord & { clip: RawClip } => Boolean(report?.clip))
    .map((report) => ({
      id: report.id,
      clip: mapClip(report.clip),
      reason: report.reason ?? "other",
      details: report.details ?? null,
      created_at: report.created_at ?? null,
      reporter: report.reporter
        ? {
            handle: report.reporter.handle ?? null,
            emoji_avatar: report.reporter.emoji_avatar ?? null,
          }
        : undefined,
    }));

  return { flags, reports };
};

const Admin = () => {
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [flaggedClips, setFlaggedClips] = useState<FlaggedClip[]>([]);
  const [openReports, setOpenReports] = useState<ReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActioning, setIsActioning] = useState(false);
  const { toast } = useToast();

  const applyQueues = useCallback((payload?: ModerationPayload | null) => {
    const { flags, reports } = mapQueues(payload);
    setFlaggedClips(flags);
    setOpenReports(reports);
  }, []);

  const loadAdminData = useCallback(async () => {
    setIsLoading(true);
    try {
      const deviceId = localStorage.getItem("deviceId");
      const { data, error } = await supabase.functions.invoke("admin-review", {
        body: { action: "list" },
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
  }, [applyQueues, toast]);

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
          body: { action: "list" },
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
      } catch (error) {
        console.error("Admin access check failed:", error);
        setIsAdmin(false);
      } finally {
        setIsCheckingAccess(false);
      }
    };

    checkAccess();
  }, [applyQueues]);

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
        await loadAdminData();
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
    [loadAdminData, toast],
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
      } catch (error) {
        console.error("Report resolution failed:", error);
        toast({
          title: "Couldn't resolve report",
          description: "Try again shortly.",
          variant: "destructive",
        });
      }
    },
    [loadAdminData, toast],
  );

  const flaggedCount = useMemo(() => flaggedClips.length, [flaggedClips]);
  const reportsCount = useMemo(() => openReports.length, [openReports]);

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
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b border-border bg-background/80 backdrop-blur-lg sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Moderation Queue</h1>
            <p className="text-sm text-muted-foreground">
              {flaggedCount} flagged • {reportsCount} reports waiting
            </p>
          </div>
          <Button variant="outline" onClick={loadAdminData} disabled={isLoading} className="rounded-2xl">
            {isLoading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">AI Flags</h2>
            <span className="text-sm text-muted-foreground">{flaggedCount} pending</span>
          </div>

          {flaggedClips.length === 0 ? (
            <Card className="p-6 rounded-3xl text-center text-muted-foreground">
              Nothing flagged right now. 🎉
            </Card>
          ) : (
            flaggedClips.map((flag) => (
              <Card key={flag.id} className="p-6 space-y-4 rounded-3xl">
                <ClipCard clip={flag.clip} />
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>
                      Flagged by <span className="font-medium uppercase">{flag.source}</span> • risk score{" "}
                      {flag.risk.toFixed(2)}
                    </p>
                    {flag.reasons.length > 0 && (
                      <p>Reasons: {flag.reasons.map((reason) => reason.toLowerCase()).join(", ")}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
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
            <h2 className="text-xl font-semibold">Community Reports</h2>
            <span className="text-sm text-muted-foreground">{reportsCount} open</span>
          </div>

          {openReports.length === 0 ? (
            <Card className="p-6 rounded-3xl text-center text-muted-foreground">
              No community reports at the moment.
            </Card>
          ) : (
            openReports.map((report) => (
              <Card key={report.id} className="p-6 space-y-4 rounded-3xl">
                <ClipCard clip={report.clip} />
                <div className="space-y-2 border-t border-border pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
                    <div>
                      <p className="font-medium capitalize">Reason: {report.reason}</p>
                      {report.details && <p>Details: {report.details}</p>}
                      {report.reporter && (
                        <p>
                          Reporter: {report.reporter.emoji_avatar ?? "🕵️"} {report.reporter.handle ?? "Anonymous"}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        disabled={isActioning}
                        onClick={() =>
                          handleModerationAction({
                            clipId: report.clip.id,
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
                            clipId: report.clip.id,
                            newStatus: "removed",
                            reportIds: [report.id],
                          })
                        }
                      >
                        Remove
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-full"
                        disabled={isActioning}
                        onClick={() => handleResolveReport(report.id)}
                      >
                        Mark safe
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </section>
      </main>
    </div>
  );
};

export default Admin;

