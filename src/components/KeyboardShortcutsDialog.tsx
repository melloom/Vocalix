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
}

const shortcuts: Shortcut[] = [
  { keys: ["/"], description: "Focus search" },
  { keys: ["n"], description: "New recording" },
  { keys: ["d"], description: "Toggle dark mode" },
  { keys: ["Esc"], description: "Close modals/dialogs" },
  { keys: ["?"], description: "Show keyboard shortcuts" },
];

export const KeyboardShortcutsDialog = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Keyboard shortcuts">
          <Keyboard className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Quick actions to navigate and use Echo Garden faster.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {shortcuts.map((shortcut, index) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">{shortcut.description}</p>
              <div className="flex gap-1">
                {shortcut.keys.map((key, keyIndex) => (
                  <Badge
                    key={keyIndex}
                    variant="outline"
                    className="font-mono text-xs px-2 py-1 rounded"
                  >
                    {key}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

