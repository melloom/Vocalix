import { Sparkles, Music, Radio, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { VoiceEffects, useVoiceEffects } from "@/hooks/useVoiceEffects";

interface VoiceEffectsControlsProps {
  effects: VoiceEffects;
  onUpdate: <K extends keyof VoiceEffects>(
    key: K,
    value: Partial<VoiceEffects[K]>
  ) => void;
  compact?: boolean;
}

export const VoiceEffectsControls = ({
  effects,
  onUpdate,
  compact = false,
}: VoiceEffectsControlsProps) => {
  const hasActiveEffects =
    effects.pitch.enabled ||
    effects.reverb.enabled ||
    effects.echo.enabled ||
    (effects.modulation.enabled && effects.modulation.type !== "none");

  if (compact) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={hasActiveEffects ? "default" : "outline"}
            size="sm"
            className="h-8 w-8 rounded-full p-0 relative"
          >
            <Sparkles className="h-4 w-4" />
            {hasActiveEffects && (
              <span className="absolute -top-1 -right-1 h-2 w-2 bg-primary rounded-full" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 max-h-[80vh] overflow-y-auto" align="end">
          <VoiceEffectsContent effects={effects} onUpdate={onUpdate} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Voice Effects</h3>
        {hasActiveEffects && (
          <span className="ml-auto text-xs text-muted-foreground">
            Active
          </span>
        )}
      </div>
      <VoiceEffectsContent effects={effects} onUpdate={onUpdate} />
    </Card>
  );
};

const VoiceEffectsContent = ({
  effects,
  onUpdate,
}: {
  effects: VoiceEffects;
  onUpdate: <K extends keyof VoiceEffects>(
    key: K,
    value: Partial<VoiceEffects[K]>
  ) => void;
}) => {
  return (
    <div className="space-y-6">
      {/* Pitch Adjustment */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="pitch-enabled" className="flex items-center gap-2 text-sm font-medium">
            <Music className="h-4 w-4" />
            Pitch Adjustment
          </Label>
          <Switch
            id="pitch-enabled"
            checked={effects.pitch.enabled}
            onCheckedChange={(checked) => onUpdate("pitch", { enabled: checked })}
          />
        </div>
        {effects.pitch.enabled && (
          <div className="space-y-2 pl-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {effects.pitch.value > 0 ? "+" : ""}
                {effects.pitch.value.toFixed(1)} semitones
              </span>
            </div>
            <Slider
              min={-12}
              max={12}
              step={0.5}
              value={[effects.pitch.value]}
              onValueChange={(value) => onUpdate("pitch", { value: value[0] })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground px-1">
              <span>Lower (-12)</span>
              <span>Normal (0)</span>
              <span>Higher (+12)</span>
            </div>
          </div>
        )}
      </div>

      {/* Reverb */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="reverb-enabled" className="flex items-center gap-2 text-sm font-medium">
            <Radio className="h-4 w-4" />
            Reverb
          </Label>
          <Switch
            id="reverb-enabled"
            checked={effects.reverb.enabled}
            onCheckedChange={(checked) => onUpdate("reverb", { enabled: checked })}
          />
        </div>
        {effects.reverb.enabled && (
          <div className="space-y-3 pl-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Room Size</span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(effects.reverb.roomSize * 100)}%
                </span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.1}
                value={[effects.reverb.roomSize]}
                onValueChange={(value) => onUpdate("reverb", { roomSize: value[0] })}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Damping</span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(effects.reverb.damping * 100)}%
                </span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.1}
                value={[effects.reverb.damping]}
                onValueChange={(value) => onUpdate("reverb", { damping: value[0] })}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>

      {/* Echo */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="echo-enabled" className="flex items-center gap-2 text-sm font-medium">
            <Radio className="h-4 w-4" />
            Echo
          </Label>
          <Switch
            id="echo-enabled"
            checked={effects.echo.enabled}
            onCheckedChange={(checked) => onUpdate("echo", { enabled: checked })}
          />
        </div>
        {effects.echo.enabled && (
          <div className="space-y-3 pl-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Delay</span>
                <span className="text-xs text-muted-foreground">
                  {(effects.echo.delay * 1000).toFixed(0)}ms
                </span>
              </div>
              <Slider
                min={0.05}
                max={1}
                step={0.05}
                value={[effects.echo.delay]}
                onValueChange={(value) => onUpdate("echo", { delay: value[0] })}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Feedback</span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(effects.echo.feedback * 100)}%
                </span>
              </div>
              <Slider
                min={0}
                max={0.8}
                step={0.1}
                value={[effects.echo.feedback]}
                onValueChange={(value) => onUpdate("echo", { feedback: value[0] })}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>

      {/* Voice Modulation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="modulation-enabled" className="flex items-center gap-2 text-sm font-medium">
            <Zap className="h-4 w-4" />
            Voice Modulation
          </Label>
          <Switch
            id="modulation-enabled"
            checked={effects.modulation.enabled && effects.modulation.type !== "none"}
            onCheckedChange={(checked) =>
              onUpdate("modulation", {
                enabled: checked,
                type: checked ? "robot" : "none",
              })
            }
          />
        </div>
        {effects.modulation.enabled && effects.modulation.type !== "none" && (
          <div className="space-y-3 pl-6">
            <div className="space-y-2">
              <Label htmlFor="modulation-type" className="text-xs text-muted-foreground">
                Effect Type
              </Label>
              <Select
                value={effects.modulation.type}
                onValueChange={(value: VoiceEffects["modulation"]["type"]) =>
                  onUpdate("modulation", { type: value })
                }
              >
                <SelectTrigger id="modulation-type" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="robot">Robot 🤖</SelectItem>
                  <SelectItem value="alien">Alien 👽</SelectItem>
                  <SelectItem value="chipmunk">Chipmunk 🐿️</SelectItem>
                  <SelectItem value="darth">Darth Vader ⚫</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Intensity</span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(effects.modulation.intensity * 100)}%
                </span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.1}
                value={[effects.modulation.intensity]}
                onValueChange={(value) => onUpdate("modulation", { intensity: value[0] })}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

