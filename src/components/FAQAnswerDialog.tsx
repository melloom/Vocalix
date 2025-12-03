import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield, Headphones, Mic, Radio } from "lucide-react";

interface FAQAnswer {
  id: string;
  question: string;
  answer: string;
  icon: typeof Shield;
}

const FAQ_ANSWERS: Record<string, FAQAnswer> = {
  anonymous: {
    id: "anonymous",
    question: "Is Echo Garden really anonymous?",
    answer: "Yes! We don't require any personal information. No email, no phone number, no real name. You create an account with just a handle and an avatar. Your device ID is used for authentication, but it's not linked to any personal data. You're as anonymous as you want to be.",
    icon: Shield,
  },
  "clip-length": {
    id: "clip-length",
    question: "How long can my voice clips be?",
    answer: "Regular voice clips are limited to 30 seconds—perfect for quick thoughts, reactions, or brief stories. For longer content, you can use Podcast Mode which allows up to 10-minute segments. This keeps the feed dynamic while still allowing for deeper conversations when needed.",
    icon: Headphones,
  },
  "how-to-record": {
    id: "how-to-record",
    question: "How do I record a voice clip?",
    answer: "Click the microphone button in the bottom navigation or use the 'Record' button on the home page. Grant microphone permissions when prompted, then tap and hold the record button to start recording. Release to stop. You can preview your clip, add a title, select a mood emoji, and add tags before publishing.",
    icon: Mic,
  },
  "live-rooms": {
    id: "live-rooms",
    question: "What are Live Rooms?",
    answer: "Live Rooms are real-time audio discussion spaces where you can join conversations with other users. There are three roles: Hosts (room creators who manage the room), Speakers (who can talk), and Viewers (who can listen but not speak). Think of it like Clubhouse or Twitter Spaces, but built for Echo Garden.",
    icon: Radio,
  },
  account: {
    id: "account",
    question: "Can I delete my account?",
    answer: "Yes, you can delete your account at any time. Go to Settings → Account → Delete Account. This will permanently remove your profile, clips, and all associated data. This action cannot be undone.",
    icon: Shield,
  },
  privacy: {
    id: "privacy",
    question: "Is it really anonymous?",
    answer: "Yes! Echo Garden is designed to be fully anonymous. We don't collect email addresses, phone numbers, or real names. Your device ID is used for authentication but isn't linked to any personal information. You can participate completely anonymously with just a handle and avatar.",
    icon: Shield,
  },
  clips: {
    id: "clips",
    question: "How long are clips?",
    answer: "Regular voice clips are 30 seconds long, perfect for quick thoughts and reactions. For longer content, Podcast Mode allows up to 10-minute segments. This keeps the feed dynamic while still allowing for deeper conversations when needed.",
    icon: Headphones,
  },
};

interface FAQAnswerDialogProps {
  faqId: string | null;
  onClose: () => void;
}

export const FAQAnswerDialog = ({ faqId, onClose }: FAQAnswerDialogProps) => {
  if (!faqId || !FAQ_ANSWERS[faqId]) {
    return null;
  }

  const faq = FAQ_ANSWERS[faqId];
  const Icon = faq.icon;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-500/10 border border-red-500/20">
              <Icon className="h-5 w-5 text-red-400" />
            </div>
            <DialogTitle className="text-left">{faq.question}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="py-4">
          <DialogDescription className="text-left text-sm text-gray-300 leading-relaxed">
            {faq.answer}
          </DialogDescription>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={onClose}
            className="bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white"
          >
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

