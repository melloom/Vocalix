import { useState, useEffect } from "react";
import { Sparkles, Lightbulb, FileText, TrendingUp, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAIContentCreation, type SuggestionType } from "@/hooks/useAIContentCreation";
import { useProfile } from "@/hooks/useProfile";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AIContentSuggestionsProps {
  onSelectTopic?: (topic: string) => void;
  onSelectScript?: (script: string) => void;
  onSelectIdea?: (idea: string) => void;
  className?: string;
}

export function AIContentSuggestions({
  onSelectTopic,
  onSelectScript,
  onSelectIdea,
  className,
}: AIContentSuggestionsProps) {
  const { profile } = useProfile();
  const { getSuggestions, isLoading, error } = useAIContentCreation();
  const { toast } = useToast();

  const [topics, setTopics] = useState<string[]>([]);
  const [scripts, setScripts] = useState<string[]>([]);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<{ type: string; index: number } | null>(null);
  const [activeTab, setActiveTab] = useState<"topics" | "scripts" | "ideas">("topics");

  const loadSuggestions = async (type: SuggestionType, setter: (items: string[]) => void) => {
    if (!profile?.id) return;

    try {
      const suggestions = await getSuggestions(profile.id, type, {
        interests: [], // Could be enhanced with actual user interests
        trending_topics: [], // Could be enhanced with actual trending topics
      });

      setter(suggestions);
    } catch (err) {
      console.error(`Error loading ${type} suggestions:`, err);
    }
  };

  useEffect(() => {
    if (profile?.id && activeTab === "topics" && topics.length === 0) {
      loadSuggestions("topic", setTopics);
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

  const handleSelect = (text: string, type: "topic" | "script" | "idea") => {
    if (type === "topic" && onSelectTopic) {
      onSelectTopic(text);
    } else if (type === "script" && onSelectScript) {
      onSelectScript(text);
    } else if (type === "idea" && onSelectIdea) {
      onSelectIdea(text);
    }
    toast({
      title: "Selected!",
      description: "Suggestion selected",
    });
  };

  const handleRefresh = () => {
    if (activeTab === "topics") {
      setTopics([]);
      loadSuggestions("topic", setTopics);
    } else if (activeTab === "scripts") {
      setScripts([]);
      loadSuggestions("script", setScripts);
    } else if (activeTab === "ideas") {
      setIdeas([]);
      loadSuggestions("content_idea", setIdeas);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle>AI Content Suggestions</CardTitle>
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
              "Refresh"
            )}
          </Button>
        </div>
        <CardDescription>
          Get AI-powered suggestions for topics, scripts, and content ideas
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
            <TabsTrigger value="topics" onClick={() => {
              if (topics.length === 0) loadSuggestions("topic", setTopics);
            }}>
              <TrendingUp className="w-4 h-4 mr-2" />
              Topics
            </TabsTrigger>
            <TabsTrigger value="scripts" onClick={() => {
              if (scripts.length === 0) loadSuggestions("script", setScripts);
            }}>
              <FileText className="w-4 h-4 mr-2" />
              Scripts
            </TabsTrigger>
            <TabsTrigger value="ideas" onClick={() => {
              if (ideas.length === 0) loadSuggestions("content_idea", setIdeas);
            }}>
              <Lightbulb className="w-4 h-4 mr-2" />
              Ideas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="topics" className="mt-4">
            <ScrollArea className="h-[400px]">
              {isLoading && topics.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : topics.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No topic suggestions available
                </div>
              ) : (
                <div className="space-y-3">
                  {topics.map((topic, index) => (
                    <div
                      key={index}
                      className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <p className="text-sm mb-3">{topic}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSelect(topic, "topic")}
                        >
                          Use This
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(topic, "topic", index)}
                        >
                          {copiedIndex?.type === "topic" && copiedIndex?.index === index ? (
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

          <TabsContent value="scripts" className="mt-4">
            <ScrollArea className="h-[400px]">
              {isLoading && scripts.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : scripts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No script suggestions available
                </div>
              ) : (
                <div className="space-y-3">
                  {scripts.map((script, index) => (
                    <div
                      key={index}
                      className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <p className="text-sm mb-3 whitespace-pre-line">{script}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSelect(script, "script")}
                        >
                          Use This
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(script, "script", index)}
                        >
                          {copiedIndex?.type === "script" && copiedIndex?.index === index ? (
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

          <TabsContent value="ideas" className="mt-4">
            <ScrollArea className="h-[400px]">
              {isLoading && ideas.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : ideas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No content ideas available
                </div>
              ) : (
                <div className="space-y-3">
                  {ideas.map((idea, index) => (
                    <div
                      key={index}
                      className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <p className="text-sm mb-3">{idea}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSelect(idea, "idea")}
                        >
                          Use This
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(idea, "idea", index)}
                        >
                          {copiedIndex?.type === "idea" && copiedIndex?.index === index ? (
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
        </Tabs>
      </CardContent>
    </Card>
  );
}

