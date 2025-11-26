import { useState } from "react";
import { Sparkles, Lightbulb, FileText, TrendingUp, Type, Hash, Clock, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AIContentSuggestions } from "@/components/AIContentSuggestions";
import { AIContentOptimization } from "@/components/AIContentOptimization";
import { AIContentAnalysis } from "@/components/AIContentAnalysis";
import { useProfile } from "@/hooks/useProfile";
import { useAIContentCreation } from "@/hooks/useAIContentCreation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AIContentCreation() {
  const { profile } = useProfile();
  const { getTrendingTopics, isLoading } = useAIContentCreation();
  
  const [testTranscript, setTestTranscript] = useState("");
  const [testSummary, setTestSummary] = useState("");
  const [testTitle, setTestTitle] = useState("");
  const [testTags, setTestTags] = useState<string[]>([]);
  const [trendingTopics, setTrendingTopics] = useState<any[]>([]);

  const loadTrendingTopics = async () => {
    if (trendingTopics.length === 0) {
      const topics = await getTrendingTopics(10);
      setTrendingTopics(topics);
    }
  };

  return (
    <div className="w-full px-4 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">AI-Powered Content Creation</h1>
        </div>
        <p className="text-muted-foreground">
          Get AI-powered suggestions for topics, scripts, titles, hashtags, and more to create better content
        </p>
      </div>

      <Tabs defaultValue="suggestions" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="suggestions">
            <Lightbulb className="w-4 h-4 mr-2" />
            Content Suggestions
          </TabsTrigger>
          <TabsTrigger value="optimization">
            <TrendingUp className="w-4 h-4 mr-2" />
            Optimization
          </TabsTrigger>
          <TabsTrigger value="analysis">
            <BarChart3 className="w-4 h-4 mr-2" />
            Analysis
          </TabsTrigger>
          <TabsTrigger value="trending">
            <FileText className="w-4 h-4 mr-2" />
            Trending Topics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suggestions" className="space-y-6">
          <AIContentSuggestions
            onSelectTopic={(topic) => {
              // Could navigate to create clip with this topic
              console.log("Selected topic:", topic);
            }}
            onSelectScript={(script) => {
              setTestTranscript(script);
            }}
            onSelectIdea={(idea) => {
              setTestSummary(idea);
            }}
          />
        </TabsContent>

        <TabsContent value="optimization" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Test Content Optimization</CardTitle>
              <CardDescription>
                Enter some content to get AI-powered optimization suggestions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="test-transcript">Transcript or Content</Label>
                <Textarea
                  id="test-transcript"
                  value={testTranscript}
                  onChange={(e) => setTestTranscript(e.target.value)}
                  placeholder="Enter your clip transcript or content here..."
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-summary">Summary (optional)</Label>
                <Textarea
                  id="test-summary"
                  value={testSummary}
                  onChange={(e) => setTestSummary(e.target.value)}
                  placeholder="Enter a summary of your content..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-title">Current Title (optional)</Label>
                <Input
                  id="test-title"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  placeholder="Enter your current title..."
                />
              </div>
            </CardContent>
          </Card>

          {(testTranscript || testSummary) && (
            <AIContentOptimization
              clipTranscript={testTranscript || undefined}
              clipSummary={testSummary || undefined}
              clipTitle={testTitle || undefined}
              clipTags={testTags}
              onSelectTitle={(title) => {
                setTestTitle(title);
              }}
              onSelectHashtags={(hashtags) => {
                setTestTags(hashtags);
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="analysis" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Content Analysis</CardTitle>
              <CardDescription>
                Analyze your content for sentiment, engagement potential, and quality
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="analysis-transcript">Content to Analyze</Label>
                <Textarea
                  id="analysis-transcript"
                  value={testTranscript}
                  onChange={(e) => setTestTranscript(e.target.value)}
                  placeholder="Enter your clip transcript or content here..."
                  rows={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="analysis-summary">Summary (optional)</Label>
                <Textarea
                  id="analysis-summary"
                  value={testSummary}
                  onChange={(e) => setTestSummary(e.target.value)}
                  placeholder="Enter a summary..."
                  rows={3}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Note: For full analysis, you need to create a clip first. This is a preview of analysis features.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trending" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>AI-Identified Trending Topics</CardTitle>
                  <CardDescription>
                    Topics that are currently trending based on AI analysis
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadTrendingTopics}
                  disabled={isLoading}
                >
                  {isLoading ? "Loading..." : "Load Trending Topics"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {trendingTopics.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Click "Load Trending Topics" to see AI-identified trending topics</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-4">
                    {trendingTopics.map((topic, index) => (
                      <Card key={topic.id || index} className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline">#{index + 1}</Badge>
                              <h3 className="font-semibold">{topic.topic_title}</h3>
                            </div>
                            {topic.topic_description && (
                              <p className="text-sm text-muted-foreground mb-2">
                                {topic.topic_description}
                              </p>
                            )}
                            {topic.trend_score && (
                              <div className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-primary" />
                                <span className="text-xs text-muted-foreground">
                                  Trend Score: {topic.trend_score}
                                </span>
                              </div>
                            )}
                            {topic.suggested_hashtags && topic.suggested_hashtags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {topic.suggested_hashtags.map((tag: string, tagIndex: number) => (
                                  <Badge key={tagIndex} variant="secondary" className="text-xs">
                                    #{tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

