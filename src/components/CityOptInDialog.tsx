import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MapPin, ShieldCheck } from "lucide-react";

interface CityOptInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCity?: string | null;
  initialConsent?: boolean;
  onSave: (options: { city: string | null; consent: boolean }) => Promise<void> | void;
}

export const CityOptInDialog = ({
  open,
  onOpenChange,
  initialCity,
  initialConsent,
  onSave,
}: CityOptInDialogProps) => {
  const [city, setCity] = useState(initialCity ?? "");
  const [consent, setConsent] = useState(initialConsent ?? false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCity(initialCity ?? "");
      setConsent(initialConsent ?? false);
    }
  }, [open, initialCity, initialConsent]);

  const handleSubmit = async () => {
    if (!consent) {
      setIsSaving(true);
      await onSave({ city: null, consent: false });
      setIsSaving(false);
      onOpenChange(false);
      return;
    }

    if (!city.trim()) {
      return;
    }

    setIsSaving(true);
    await onSave({ city: city.trim(), consent: true });
    setIsSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-left text-xl font-semibold tracking-tight">
            Share your city?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="rounded-2xl border border-muted-foreground/10 bg-muted/40 p-4 text-left shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    We never store precise GPS.
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Opting in adds a city-level tag so nearby listeners can discover your voice. You can
                    switch this off anytime.
                  </p>
                </div>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="flex items-start gap-3 rounded-2xl border border-muted-foreground/10 bg-background p-4 shadow-sm transition hover:border-primary/30">
            <Checkbox
              id="consent-city"
              checked={consent}
              onCheckedChange={(value) => setConsent(Boolean(value))}
              className="mt-1 rounded-md"
            />
            <div className="space-y-1">
              <Label htmlFor="consent-city" className="text-sm font-medium text-foreground leading-tight">
                I’m okay sharing my city on future clips.
              </Label>
              <p className="text-xs text-muted-foreground">
                Your existing recordings stay unchanged. We only tag new clips once you confirm.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="city-input" className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              City tag
            </Label>
            <Input
              id="city-input"
              placeholder="City, State / Region"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              disabled={!consent}
              className="rounded-2xl border-muted-foreground/20 disabled:cursor-not-allowed disabled:bg-muted text-sm"
              aria-describedby="city-helper"
            />
            <p
              id="city-helper"
              className="text-xs text-muted-foreground"
            >
              {consent
                ? "Examples: “Austin, TX” or “Vancouver, BC”."
                : "Turn on sharing to enter the city listeners will see."}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-2xl">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving || (consent && !city.trim())} className="rounded-2xl">
            {isSaving ? "Saving..." : consent ? "Save city" : "Keep private"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

