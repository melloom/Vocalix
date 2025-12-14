import { useState } from "react";
import { Sparkles, Mic, Heart, Lightbulb, BookOpen, HelpCircle, Music, Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface AudioTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  moodEmoji: string;
  suggestedTitle?: string;
  suggestedTags: string[];
  suggestedCategory?: string;
  durationHint?: string;
}

const TEMPLATES: AudioTemplate[] = [
  {
    id: "morning-motivation",
    name: "Morning Motivation",
    description: "Start the day with inspiration",
    icon: <Coffee className="h-5 w-5" />,
    moodEmoji: "☀️",
    suggestedTitle: "Morning Motivation",
    suggestedTags: ["motivation", "morning", "inspiration"],
    suggestedCategory: "advice",
    durationHint: "30-60 seconds",
  },
  {
    id: "story-time",
    name: "Story Time",
    description: "Share a personal story or experience",
    icon: <BookOpen className="h-5 w-5" />,
    moodEmoji: "📖",
    suggestedTitle: "A Story",
    suggestedTags: ["story", "personal", "experience"],
    suggestedCategory: "storytelling",
    durationHint: "1-3 minutes",
  },
  {
    id: "gratitude",
    name: "Gratitude",
    description: "Express what you're grateful for",
    icon: <Heart className="h-5 w-5" />,
    moodEmoji: "🙏",
    suggestedTitle: "Gratitude",
    suggestedTags: ["gratitude", "thankful", "appreciation"],
    suggestedCategory: "advice",
    durationHint: "30-60 seconds",
  },
  {
    id: "question",
    name: "Question of the Day",
    description: "Ask a thought-provoking question",
    icon: <HelpCircle className="h-5 w-5" />,
    moodEmoji: "💭",
    suggestedTitle: "Question",
    suggestedTags: ["question", "discussion", "thoughts"],
    suggestedCategory: "advice",
    durationHint: "15-30 seconds",
  },
  {
    id: "tip",
    name: "Quick Tip",
    description: "Share a helpful tip or advice",
    icon: <Lightbulb className="h-5 w-5" />,
    moodEmoji: "💡",
    suggestedTitle: "Tip",
    suggestedTags: ["tip", "advice", "helpful"],
    suggestedCategory: "advice",
    durationHint: "20-40 seconds",
  },
  {
    id: "music",
    name: "Music Share",
    description: "Share music or discuss a song",
    icon: <Music className="h-5 w-5" />,
    moodEmoji: "🎵",
    suggestedTitle: "Music",
    suggestedTags: ["music", "song", "audio"],
    suggestedCategory: "music",
    durationHint: "30-60 seconds",
  },
  {
    id: "podcast",
    name: "Podcast Episode",
    description: "Long-form discussion or monologue",
    icon: <Mic className="h-5 w-5" />,
    moodEmoji: "🎙️",
    suggestedTitle: "Podcast Episode",
    suggestedTags: ["podcast", "discussion", "long-form"],
    suggestedCategory: "podcast",
    durationHint: "5-10 minutes",
  },
];

interface AudioTemplateSelectorProps {
  onSelectTemplate: (template: AudioTemplate) => void;
  onClose: () => void;
}

export const AudioTemplateSelector = ({ onSelectTemplate, onClose }: AudioTemplateSelectorProps) => {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Choose a Template
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Select a template to pre-fill your clip with suggested settings
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
        {TEMPLATES.map((template) => (
          <Card
            key={template.id}
            className="cursor-pointer hover:bg-accent transition-colors"
            onClick={() => {
              onSelectTemplate(template);
              onClose();
            }}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="text-2xl">{template.icon}</div>
                <CardTitle className="text-sm">{template.name}</CardTitle>
              </div>
              <CardDescription className="text-xs">{template.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-xs">
                  {template.moodEmoji}
                </Badge>
                {template.suggestedCategory && (
                  <Badge variant="outline" className="text-xs">
                    {template.suggestedCategory}
                  </Badge>
                )}
                {template.durationHint && (
                  <Badge variant="outline" className="text-xs">
                    {template.durationHint}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button variant="outline" onClick={onClose} className="w-full">
        Skip Template
      </Button>
    </div>
  );
};

export { TEMPLATES };

