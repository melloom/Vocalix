import { useState } from "react";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Shortcut {
  keys: string[];
  description: string;
  category?: string;
}

const shortcuts: Shortcut[] = [
  // Navigation
  { keys: ["/"], description: "Focus search", category: "Navigation" },
  { keys: ["g", "h"], description: "Go to home", category: "Navigation" },
  { keys: ["g", "t"], description: "Go to trending", category: "Navigation" },
  { keys: ["g", "f"], description: "Go to For You feed", category: "Navigation" },
  { keys: ["g", "s"], description: "Go to saved clips", category: "Navigation" },
  { keys: ["g", "g"], description: "Scroll to top", category: "Navigation" },
  { keys: ["j"], description: "Scroll down / Next item", category: "Navigation" },
  { keys: ["k"], description: "Scroll up / Previous item", category: "Navigation" },
  { keys: ["↑"], description: "Scroll up", category: "Navigation" },
  { keys: ["↓"], description: "Scroll down", category: "Navigation" },
  { keys: ["←"], description: "Seek backward 5s", category: "Navigation" },
  { keys: ["→"], description: "Seek forward 5s", category: "Navigation" },
  
  // Actions
  { keys: ["n"], description: "New recording", category: "Actions" },
  { keys: ["Space"], description: "Play / Pause audio", category: "Actions" },
  { keys: ["s"], description: "Save clip", category: "Actions" },
  { keys: ["r"], description: "React to clip", category: "Actions" },
  { keys: ["c"], description: "Comment on clip", category: "Actions" },
  
  // Pages
  { keys: ["m"], description: "Open messages", category: "Pages" },
  { keys: ["p"], description: "Open profile", category: "Pages" },
  
  // Playback
  { keys: ["1"], description: "Playback speed 0.5x", category: "Playback" },
  { keys: ["2"], description: "Playback speed 0.75x", category: "Playback" },
  { keys: ["3"], description: "Playback speed 1.0x", category: "Playback" },
  { keys: ["4"], description: "Playback speed 1.25x", category: "Playback" },
  { keys: ["5"], description: "Playback speed 1.5x", category: "Playback" },
  
  // Settings
  { keys: ["d"], description: "Toggle dark mode", category: "Settings" },
  { keys: ["Esc"], description: "Close modals/dialogs", category: "Settings" },
  { keys: ["?"], description: "Show keyboard shortcuts", category: "Settings" },
  
  // Undo/Redo
  { keys: ["Ctrl", "z"], description: "Undo last action", category: "Editing" },
  { keys: ["Ctrl", "y"], description: "Redo last action", category: "Editing" },
  { keys: ["Ctrl", "Shift", "z"], description: "Redo (alternative)", category: "Editing" },
  
  // Additional Navigation
  { keys: ["h"], description: "Go to home", category: "Navigation" },
  { keys: ["u"], description: "Go to profile", category: "Navigation" },
  { keys: ["i"], description: "Go to saved clips", category: "Navigation" },
  { keys: ["a"], description: "Go to activity", category: "Navigation" },
  
  // Playback Controls
  { keys: ["l"], description: "Like current clip", category: "Actions" },
  { keys: ["b"], description: "Bookmark current clip", category: "Actions" },
  { keys: ["Shift", "s"], description: "Share current clip", category: "Actions" },
  
  // Utility
  { keys: ["Ctrl", "k"], description: "Open command palette", category: "Utility" },
  { keys: ["Ctrl", "f"], description: "Focus search", category: "Utility" },
];

interface KeyboardShortcutsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}

export const KeyboardShortcutsDialog = ({ 
  open: controlledOpen, 
  onOpenChange: controlledOnOpenChange,
  showTrigger = true 
}: KeyboardShortcutsDialogProps = {}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledOnOpenChange || (() => {}) : setInternalOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Keyboard shortcuts">
            <Keyboard className="h-5 w-5" />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Quick actions to navigate and use Echo Garden faster.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 max-h-[600px] overflow-y-auto">
          {Object.entries(
            shortcuts.reduce((acc, shortcut) => {
              const category = shortcut.category || "Other";
              if (!acc[category]) acc[category] = [];
              acc[category].push(shortcut);
              return acc;
            }, {} as Record<string, Shortcut[]>)
          ).map(([category, categoryShortcuts]) => (
            <div key={category} className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground mb-2">{category}</h3>
              {categoryShortcuts.map((shortcut, index) => (
                <div key={index} className="flex items-center justify-between gap-4 py-1">
                  <p className="text-sm text-muted-foreground">{shortcut.description}</p>
                  <div className="flex gap-1">
                    {shortcut.keys.map((key, keyIndex) => (
                      <Badge
                        key={keyIndex}
                        variant="outline"
                        className="font-mono text-xs px-2 py-1 rounded"
                      >
                        {key === "↑" ? "↑" : key === "↓" ? "↓" : key === "←" ? "←" : key === "→" ? "→" : key === " " ? "Space" : key}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

