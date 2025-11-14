import { useState } from "react";
import { ShieldCheck, Sparkles, Timer, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase, updateSupabaseDeviceHeader } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const EMOJI_AVATARS = ["🎧", "🎵", "🎤", "🎶", "🎼", "🎹", "🥁", "🎺", "🎸", "🎻"];

const ANIMAL_ADJECTIVES = ["Calm", "Bright", "Quiet", "Bold", "Swift", "Gentle", "Wise", "Happy", "Cool", "Warm"];
const ANIMALS = ["Raccoon", "Fox", "Owl", "Deer", "Bear", "Wolf", "Raven", "Otter", "Lynx", "Swan"];

const generateHandle = () => {
  const adj = ANIMAL_ADJECTIVES[Math.floor(Math.random() * ANIMAL_ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${animal}${num}`;
};

interface OnboardingFlowProps {
  onComplete: (profileId: string) => void;
}

export const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
  const [handle, setHandle] = useState(generateHandle());
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJI_AVATARS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!handle.trim()) {
      toast({
        title: "Handle required",
        description: "Please enter a handle",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const storedDeviceId = localStorage.getItem("deviceId");
      const deviceId = storedDeviceId || crypto.randomUUID();
      updateSupabaseDeviceHeader(deviceId);

      const { error: deviceError } = await supabase
        .from("devices")
        .upsert(
          { device_id: deviceId },
          { onConflict: "device_id" }
        );

      if (deviceError && deviceError.code !== "23505") {
        throw deviceError;
      }

      const { data, error } = await supabase
        .from("profiles")
        .insert({
          device_id: deviceId,
          handle: handle.trim(),
          emoji_avatar: selectedEmoji,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Handle taken",
            description: "This handle is already in use. Try another!",
            variant: "destructive",
          });
          setHandle(generateHandle());
        } else {
          throw error;
        }
        return;
      }

      // Store profileId - AuthContext will pick it up automatically
      localStorage.setItem("profileId", data.id);
      // Trigger storage event so AuthContext updates immediately
      window.dispatchEvent(new StorageEvent("storage", {
        key: "profileId",
        newValue: data.id,
      }));
      
      // Update device association (non-blocking)
      const { error: deviceUpdateError } = await supabase
        .from("devices")
        .update({ profile_id: data.id })
        .eq("device_id", deviceId);
      
      if (deviceUpdateError) {
        console.warn("Failed to update device association:", deviceUpdateError);
        // Continue anyway - this is not critical
      }
      
      onComplete(data.id);
    } catch (error) {
      console.error("Onboarding error:", error);
      toast({
        title: "Something went wrong",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-background to-primary/10">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-[-10%] right-[15%] h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-[-15%] left-[10%] h-80 w-80 rounded-full bg-secondary/30 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.25),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.05),_transparent_55%)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,420px)] lg:items-center">
          <div className="space-y-10 text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-4 py-1 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              Welcome to Echo&nbsp;Garden
            </div>

            <div className="space-y-6">
              <h1 className="text-4xl font-semibold text-foreground md:text-5xl lg:text-6xl">
                Your daily voice journal, shared safely with the garden.
              </h1>
              <p className="max-w-2xl text-lg text-foreground/70 md:text-xl">
                Plant a thought, a feeling, a tiny win. We keep it gentle, anonymous, and human. Join in with a
                nickname and an emoji avatar—your words, your vibe.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: ShieldCheck,
                  title: "Stay anonymous",
                  description: "Handles only. No DMs, no inboxes—just voices in the garden.",
                },
                {
                  icon: Timer,
                  title: "30-second stories",
                  description: "Short and mindful. Share once a day or whenever you feel like it.",
                },
                {
                  icon: Sparkles,
                  title: "Gentle vibes",
                  description: "AI-powered moderation keeps things kind and welcoming.",
                },
              ].map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card/70 p-4 backdrop-blur supports-[backdrop-filter]:bg-card/60"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">{title}</p>
                    <p className="text-sm text-foreground/70">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Card className="glass-surface border border-border/70 shadow-soft backdrop-blur">
            <CardHeader className="space-y-1">
              <CardTitle className="text-3xl font-semibold text-foreground">Create your garden identity</CardTitle>
              <p className="text-sm text-foreground/60">
                Pick an emoji, choose a playful handle, and you’re ready to start recording.
              </p>
            </CardHeader>

            <CardContent className="space-y-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <p className="font-medium text-foreground">Pick your avatar</p>
                  <span className="text-xs text-foreground/50">Tap to select</span>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {EMOJI_AVATARS.map((emoji) => {
                    const isActive = selectedEmoji === emoji;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setSelectedEmoji(emoji)}
                        className={
                          "flex h-14 w-full items-center justify-center rounded-2xl border transition-all duration-200 " +
                          (isActive
                            ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-[1.07]"
                            : "border-border/80 bg-card/80 hover:bg-muted/80 hover:shadow-sm")
                        }
                      >
                        <span className="text-3xl">{emoji}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <p className="font-medium text-foreground">Choose your handle</p>
                  <span className="text-xs text-foreground/50">Keep it kind, 20 characters max</span>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Input
                    value={handle}
                    onChange={(event) => setHandle(event.target.value)}
                    placeholder="BrightFox95"
                    maxLength={20}
                    className="h-14 rounded-2xl bg-background/70 text-lg text-center tracking-wide shadow-inner shadow-border/40 focus-visible:ring-primary/60"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setHandle(generateHandle())}
                    className="h-12 w-full rounded-2xl border-dashed border-2 border-primary/50 text-sm font-medium text-primary shadow-none transition hover:border-primary hover:bg-primary/10 hover:text-primary sm:w-auto"
                  >
                    <Wand2 className="mr-2 h-4 w-4" />
                    Surprise me
                  </Button>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button
                onClick={handleSubmit}
                disabled={isLoading || !handle.trim()}
                className="h-14 w-full rounded-2xl bg-primary text-primary-foreground text-lg font-semibold shadow-lg shadow-primary/40 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-70"
                size="lg"
              >
                {isLoading ? "Creating your garden space..." : "Enter the garden"}
              </Button>
              <p className="text-xs text-center text-foreground/50">
                Hold to speak. Max 30 seconds. Echo Garden is a kindness-first space — please keep it gentle.
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
};
