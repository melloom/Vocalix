import { useState, useEffect } from "react";
import { Palette, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";

const PRESET_SCHEMES = [
  { name: "Default", primary: null, secondary: null, accent: null, background: null },
  { name: "Sunset", primary: "#FF6B6B", secondary: "#FFE66D", accent: "#FF8E53", background: null },
  { name: "Ocean", primary: "#4ECDC4", secondary: "#45B7D1", accent: "#96CEB4", background: null },
  { name: "Forest", primary: "#95E1D3", secondary: "#F38181", accent: "#AA96DA", background: null },
  { name: "Purple", primary: "#A8E6CF", secondary: "#DDA0DD", accent: "#98D8C8", background: null },
  { name: "Pink", primary: "#FFB6C1", secondary: "#FF69B4", accent: "#FF1493", background: null },
  { name: "Blue", primary: "#87CEEB", secondary: "#4682B4", accent: "#1E90FF", background: null },
  { name: "Orange", primary: "#FFA07A", secondary: "#FF7F50", accent: "#FF6347", background: null },
];

interface ColorSchemePickerProps {
  onSuccess?: () => void;
}

export function ColorSchemePicker({ onSuccess }: ColorSchemePickerProps = {}) {
  const { profile, updateProfile, isUpdating } = useProfile();
  const [colorScheme, setColorScheme] = useState<{
    primary: string | null;
    secondary: string | null;
    accent: string | null;
    background: string | null;
  }>({
    primary: null,
    secondary: null,
    accent: null,
    background: null,
  });

  useEffect(() => {
    if (profile?.color_scheme) {
      setColorScheme(profile.color_scheme as any);
    }
  }, [profile]);

  const handlePresetSelect = (preset: typeof PRESET_SCHEMES[0]) => {
    setColorScheme({
      primary: preset.primary,
      secondary: preset.secondary,
      accent: preset.accent,
      background: preset.background,
    });
  };

  const handleSave = async () => {
    try {
      await updateProfile({ color_scheme: colorScheme });
      toast.success("Color scheme updated!");
      // Trigger a re-render to apply colors globally
      window.dispatchEvent(new CustomEvent("colorSchemeUpdated"));
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to update color scheme");
    }
  };

  const handleReset = async () => {
    const reset = {
      primary: null,
      secondary: null,
      accent: null,
      background: null,
    };
    setColorScheme(reset);
    try {
      await updateProfile({ color_scheme: reset });
      toast.success("Color scheme reset to default");
    } catch (error: any) {
      toast.error(error.message || "Failed to reset color scheme");
    }
  };

  return (
    <Card className="p-6 rounded-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Palette className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Color Scheme</h3>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium mb-2 block">Preset Themes</Label>
          <div className="grid grid-cols-4 gap-2">
            {PRESET_SCHEMES.map((preset) => (
              <Button
                key={preset.name}
                variant="outline"
                className="rounded-2xl h-auto py-3 flex flex-col gap-1"
                onClick={() => handlePresetSelect(preset)}
              >
                <div className="flex gap-1">
                  {preset.primary && (
                    <div
                      className="w-4 h-4 rounded-full border border-border"
                      style={{ backgroundColor: preset.primary }}
                    />
                  )}
                  {preset.secondary && (
                    <div
                      className="w-4 h-4 rounded-full border border-border"
                      style={{ backgroundColor: preset.secondary }}
                    />
                  )}
                  {preset.accent && (
                    <div
                      className="w-4 h-4 rounded-full border border-border"
                      style={{ backgroundColor: preset.accent }}
                    />
                  )}
                </div>
                <span className="text-xs">{preset.name}</span>
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium">Custom Colors</Label>
          <div className="grid grid-cols-2 gap-3">
            {(["primary", "secondary", "accent", "background"] as const).map((colorKey) => (
              <div key={colorKey} className="space-y-2">
                <Label className="text-xs capitalize">{colorKey}</Label>
                <div className="flex gap-2">
                  <div className="relative">
                    <input
                      type="color"
                      value={colorScheme[colorKey] || "#000000"}
                      onChange={(e) =>
                        setColorScheme({ ...colorScheme, [colorKey]: e.target.value })
                      }
                      className="w-12 h-12 rounded-xl border-2 border-border cursor-pointer"
                      style={{
                        backgroundColor: colorScheme[colorKey] || "transparent",
                      }}
                    />
                    {!colorScheme[colorKey] && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-xs text-muted-foreground">None</span>
                      </div>
                    )}
                  </div>
                  <Input
                    type="text"
                    placeholder="#000000"
                    value={colorScheme[colorKey] || ""}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      // Validate hex color
                      if (value === "" || /^#[0-9A-Fa-f]{6}$/.test(value)) {
                        setColorScheme({ ...colorScheme, [colorKey]: value || null });
                      }
                    }}
                    className="flex-1 rounded-xl"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={isUpdating}
          className="rounded-2xl flex-1"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Save Colors
        </Button>
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={isUpdating}
          className="rounded-2xl"
        >
          Reset
        </Button>
      </div>
    </Card>
  );
}

