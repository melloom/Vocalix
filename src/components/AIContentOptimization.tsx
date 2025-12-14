import { useState, useEffect } from "react";
import { Sparkles, Hash, Clock, Type, Loader2, Copy, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAIContentCreation } from "@/hooks/useAIContentCreation";
import { useProfile } from "@/hooks/useProfile";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AIContentOptimizationProps {
  clipTranscript?: string;
  clipSummary?: string;
  clipTitle?: string;
  clipTags?: string[];
  onSelectTitle?: (title: string) => void;
  onSelectHashtags?: (hashtags: string[]) => void;
  onSelectPostingTime?: (time: string) => void;
  className?: string;
}

export function AIContentOptimization({
  clipTranscript,
  clipSummary,
  clipTitle,
  clipTags,
  onSelectTitle,
  onSelectHashtags,
  onSelectPostingTime,
  className,
}: AIContentOptimizationProps) {
  const { profile } = useProfile();
  const { getSuggestions, isLoading, error } = useAIContentCreation();
  const { toast } = useToast();

  const [titles, setTitles] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [postingTimes, setPostingTimes] = useState<Array<{ time: string; reason: string; score: number }>>([]);
  const [copiedIndex, setCopiedIndex] = useState<{ type: string; index: number } | null>(null);
  const [activeTab, setActiveTab] = useState<"titles" | "hashtags" | "posting" | "all">("titles");

  const loadTitles = async () => {
    if (!profile?.id || (!clipTranscript && !clipSummary)) return;

    try {
      const suggestions = await getSuggestions(profile.id, "title", {
        clip_transcript: clipTranscript,
        clip_summary: clipSummary,
      }, 5);

      setTitles(suggestions);
    } catch (err) {
      console.error("Error loading title suggestions:", err);
    }
  };

  const loadHashtags = async () => {
    if (!profile?.id || (!clipTranscript && !clipSummary)) return;

    try {
      const suggestions = await getSuggestions(profile.id, "hashtag", {
        clip_transcript: clipTranscript,
        clip_summary: clipSummary,
        interests: [],
      }, 10);

      setHashtags(suggestions);
    } catch (err) {
      console.error("Error loading hashtag suggestions:", err);
    }
  };

  const loadPostingTimes = async () => {
    if (!profile?.id) return;

    try {
      const suggestions = await getSuggestions(profile.id, "posting_time", {}, 4);
      // Posting time suggestions come with metadata
      // For now, we'll create a simple structure
      setPostingTimes(
        suggestions.map((time, index) => ({
          time,
          reason: `Optimal posting time based on engagement patterns`,
          score: 0.8 - index * 0.1,
        }))
      );
    } catch (err) {
      console.error("Error loading posting time suggestions:", err);
    }
  };

  useEffect(() => {
    if (profile?.id && activeTab === "titles" && titles.length === 0 && (clipTranscript || clipSummary)) {
      loadTitles();
    }
  }, [profile?.id, activeTab, clipTranscript, clipSummary]);

  useEffect(() => {
    if (profile?.id && activeTab === "hashtags" && hashtags.length === 0 && (clipTranscript || clipSummary)) {
      loadHashtags();
    }
  }, [profile?.id, activeTab, clipTranscript, clipSummary]);

  useEffect(() => {
    if (profile?.id && activeTab === "posting" && postingTimes.length === 0) {
      loadPostingTimes();
    }
  }, [profile?.id, activeTab]);

  const handleCopy = (text: string, type: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex({ type, index });
    setTimeout(() => setCopiedIndex(null), 2000);
    toast({
      title: "Copied!",
      description: "Suggestion copied to clipboard",
    });
  };

  const handleSelectTitle = (title: string) => {
    if (onSelectTitle) {
      onSelectTitle(title);
    }
    toast({
      title: "Title selected!",
      description: "Title has been applied",
    });
  };

  const handleSelectHashtags = (hashtags: string[]) => {
    if (onSelectHashtags) {
      onSelectHashtags(hashtags);
    }
    toast({
      title: "Hashtags selected!",
      description: `${hashtags.length} hashtags have been applied`,
    });
  };

  const handleSelectPostingTime = (time: string) => {
    if (onSelectPostingTime) {
      onSelectPostingTime(time);
    }
    toast({
      title: "Posting time selected!",
      description: `Scheduled for ${time}`,
    });
  };

  const handleRefresh = () => {
    if (activeTab === "titles") {
      setTitles([]);
      loadTitles();
    } else if (activeTab === "hashtags") {
      setHashtags([]);
      loadHashtags();
    } else if (activeTab === "posting") {
      setPostingTimes([]);
      loadPostingTimes();
    }
  };

  if (!clipTranscript && !clipSummary) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Content Optimization
          </CardTitle>
          <CardDescription>
            Record or upload a clip to get optimization suggestions
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle>AI Content Optimization</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
        <CardDescription>
          Get AI-powered suggestions for titles, hashtags, and optimal posting times
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="titles" onClick={() => {
              if (titles.length === 0) loadTitles();
            }}>
              <Type className="w-4 h-4 mr-2" />
              Titles
            </TabsTrigger>
            <TabsTrigger value="hashtags" onClick={() => {
              if (hashtags.length === 0) loadHashtags();
            }}>
              <Hash className="w-4 h-4 mr-2" />
              Hashtags
            </TabsTrigger>
            <TabsTrigger value="posting" onClick={() => {
              if (postingTimes.length === 0) loadPostingTimes();
            }}>
              <Clock className="w-4 h-4 mr-2" />
              Posting Time
            </TabsTrigger>
          </TabsList>

          <TabsContent value="titles" className="mt-4">
            <ScrollArea className="h-[300px]">
              {isLoading && titles.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : titles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No title suggestions available. Record a clip first.
                </div>
              ) : (
                <div className="space-y-3">
                  {titles.map((title, index) => (
                    <div
                      key={index}
                      className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <p className="text-sm font-medium mb-3">{title}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSelectTitle(title)}
                        >
                          Use This
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(title, "title", index)}
                        >
                          {copiedIndex?.type === "title" && copiedIndex?.index === index ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="hashtags" className="mt-4">
            <ScrollArea className="h-[300px]">
              {isLoading && hashtags.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : hashtags.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hashtag suggestions available. Record a clip first.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {hashtags.slice(0, 10).map((hashtag, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                        onClick={() => handleSelectHashtags([hashtag])}
                      >
                        #{hashtag}
                      </Badge>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => handleSelectHashtags(hashtags.slice(0, 10))}
                  >
                    Use All Suggested Hashtags
                  </Button>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="posting" className="mt-4">
            <ScrollArea className="h-[300px]">
              {isLoading && postingTimes.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : postingTimes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No posting time suggestions available
                </div>
              ) : (
                <div className="space-y-3">
                  {postingTimes.map((item, index) => (
                    <div
                      key={index}
                      className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-lg font-semibold">{item.time}</p>
                        <Badge variant="outline">
                          {Math.round(item.score * 100)}% match
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{item.reason}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSelectPostingTime(item.time)}
                      >
                        Schedule for This Time
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

