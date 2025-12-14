import { useState, useEffect } from "react";
import { Settings, Eye, Type, Keyboard, Volume2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { logError } from "@/lib/logger";
import { prefersHighContrast, prefersReducedMotion } from "@/utils/accessibility";

export const AccessibilitySettings = () => {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [highContrast, setHighContrast] = useState(false);
  const [fontSize, setFontSize] = useState(1); // 0.75, 0.875, 1, 1.125, 1.25, 1.5
  const [keyboardNav, setKeyboardNav] = useState(true);
  const [screenReader, setScreenReader] = useState(false);
  const [audioDescriptions, setAudioDescriptions] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // Load user preferences
    if (profile?.accessibility_preferences) {
      const prefs = profile.accessibility_preferences as any;
      setHighContrast(prefs.high_contrast || false);
      setFontSize(prefs.font_size || 1);
      setKeyboardNav(prefs.keyboard_navigation !== false);
      setScreenReader(prefs.screen_reader || false);
      setAudioDescriptions(prefs.audio_descriptions || false);
      setReducedMotion(prefs.reduced_motion || false);
    }

    // Check system preferences
    if (prefersHighContrast()) {
      setHighContrast(true);
    }
    if (prefersReducedMotion()) {
      setReducedMotion(true);
    }
  }, [profile]);

  useEffect(() => {
    // Apply high contrast mode
    if (highContrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }

    // Apply font size
    document.documentElement.style.fontSize = `${fontSize}rem`;

    // Apply reduced motion
    if (reducedMotion) {
      document.documentElement.classList.add('reduced-motion');
    } else {
      document.documentElement.classList.remove('reduced-motion');
    }
  }, [highContrast, fontSize, reducedMotion]);

  const savePreferences = async () => {
    if (!profile?.id) return;

    try {
      const preferences = {
        high_contrast: highContrast,
        font_size: fontSize,
        keyboard_navigation: keyboardNav,
        screen_reader: screenReader,
        audio_descriptions: audioDescriptions,
        reduced_motion: reducedMotion,
      };

      const { error } = await supabase
        .from('profiles')
        .update({
          accessibility_preferences: preferences,
        })
        .eq('id', profile.id);

      if (error) throw error;

      toast({
        title: "Preferences saved",
        description: "Your accessibility settings have been saved",
      });
    } catch (error) {
      logError('Failed to save accessibility preferences', error);
      toast({
        title: "Failed to save",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const fontSizeOptions = [
    { value: 0.75, label: 'Small (0.75x)' },
    { value: 0.875, label: 'Small-Medium (0.875x)' },
    { value: 1, label: 'Medium (1x)' },
    { value: 1.125, label: 'Large (1.125x)' },
    { value: 1.25, label: 'Extra Large (1.25x)' },
    { value: 1.5, label: 'XXL (1.5x)' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Accessibility Settings</h2>
        <p className="text-muted-foreground">
          Customize your experience to make Echo Garden more accessible
        </p>
      </div>

      {/* Visual Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Visual Settings
          </CardTitle>
          <CardDescription>Adjust visual appearance and contrast</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="high-contrast">High Contrast Mode</Label>
              <p className="text-sm text-muted-foreground">
                Increase contrast for better visibility
              </p>
            </div>
            <Switch
              id="high-contrast"
              checked={highContrast}
              onCheckedChange={setHighContrast}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="font-size">Font Size</Label>
            <Select
              value={fontSize.toString()}
              onValueChange={(value) => setFontSize(parseFloat(value))}
            >
              <SelectTrigger id="font-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fontSizeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value.toString()}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Adjust the base font size for all text
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Navigation Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Navigation Settings
          </CardTitle>
          <CardDescription>Keyboard and navigation preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="keyboard-nav">Enhanced Keyboard Navigation</Label>
              <p className="text-sm text-muted-foreground">
                Enable improved keyboard shortcuts and navigation
              </p>
            </div>
            <Switch
              id="keyboard-nav"
              checked={keyboardNav}
              onCheckedChange={setKeyboardNav}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="screen-reader">Screen Reader Optimizations</Label>
              <p className="text-sm text-muted-foreground">
                Optimize content for screen readers
              </p>
            </div>
            <Switch
              id="screen-reader"
              checked={screenReader}
              onCheckedChange={setScreenReader}
            />
          </div>
        </CardContent>
      </Card>

      {/* Audio Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Audio Settings
          </CardTitle>
          <CardDescription>Audio description and playback preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="audio-desc">Audio Descriptions</Label>
              <p className="text-sm text-muted-foreground">
                Enable audio descriptions for clips when available
              </p>
            </div>
            <Switch
              id="audio-desc"
              checked={audioDescriptions}
              onCheckedChange={setAudioDescriptions}
            />
          </div>
        </CardContent>
      </Card>

      {/* Motion Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Motion Settings
          </CardTitle>
          <CardDescription>Reduce animations and motion</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="reduced-motion">Reduce Motion</Label>
              <p className="text-sm text-muted-foreground">
                Minimize animations and transitions
              </p>
            </div>
            <Switch
              id="reduced-motion"
              checked={reducedMotion}
              onCheckedChange={setReducedMotion}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={savePreferences} className="w-full">
        Save Preferences
      </Button>
    </div>
  );
};

