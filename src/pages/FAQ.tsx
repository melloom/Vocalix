import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Search,
  MessageCircle,
  Mic,
  Users,
  Shield,
  Smartphone,
  Headphones,
  Radio,
  Settings,
  Heart,
  Zap,
  Globe,
  Lock,
  Bell,
  BookOpen,
  HelpCircle,
  ChevronRight,
  ArrowLeft,
  Hash,
  TrendingUp,
  PlayCircle,
  Download,
  Share2,
  Volume2,
  Video,
  Music,
  Calendar,
  Award,
  Eye,
  FileText,
  Code,
  Database,
  Server,
  Wifi,
  WifiOff,
  AlertCircle,
  Scale,
  Copyright,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  icon: React.ComponentType<{ className?: string }>;
  tags: string[];
}

const faqData: FAQItem[] = [
  // Getting Started
  {
    id: "what-is-vocalix",
    category: "Getting Started",
    question: "What is Vocalix?",
    answer: "Vocalix is an audio-first social platform where voice is the primary medium of expression. Instead of text posts, users share 30-second voice clips or 10-minute podcast segments. It's like a voice-based social network where conversations happen through audio, creating a more authentic and engaging way to connect.",
    icon: MessageCircle,
    tags: ["basics", "what is", "introduction", "overview"],
  },
  {
    id: "how-to-sign-up",
    category: "Getting Started",
    question: "How do I create an account?",
    answer: "You don't need to create an account with email or phone! Just visit Vocalix and choose a handle. Your account is created automatically using device-based authentication. No email, no phone number, no personal information required. You're as anonymous as you want to be.",
    icon: Users,
    tags: ["sign up", "account", "register", "create account", "authentication"],
  },
  {
    id: "is-it-free",
    category: "Getting Started",
    question: "Is Vocalix free to use?",
    answer: "Yes! Vocalix is completely free to use. All core features including recording clips, joining communities, participating in live rooms, and discovering content are available at no cost.",
    icon: Heart,
    tags: ["free", "pricing", "cost", "money"],
  },
  {
    id: "what-platforms",
    category: "Getting Started",
    question: "What platforms does Vocalix support?",
    answer: "Vocalix is a web application that works in all modern browsers (Chrome, Firefox, Safari, Edge). It's optimized for both desktop and mobile devices. You can also install it as a Progressive Web App (PWA) on your phone for an app-like experience.",
    icon: Smartphone,
    tags: ["platforms", "browsers", "mobile", "desktop", "pwa"],
  },

  // Recording & Clips
  {
    id: "clip-length",
    category: "Recording & Clips",
    question: "How long can my voice clips be?",
    answer: "Regular voice clips are limited to 30 seconds—perfect for quick thoughts, reactions, or brief stories. For longer content, you can use Podcast Mode which allows up to 10-minute segments. This keeps the feed dynamic while still allowing for deeper conversations when needed.",
    icon: Headphones,
    tags: ["recording", "length", "duration", "30 seconds", "podcast mode", "10 minutes"],
  },
  {
    id: "how-to-record",
    category: "Recording & Clips",
    question: "How do I record a voice clip?",
    answer: "Click the microphone button in the bottom navigation or use the 'Record' button on the home page. Grant microphone permissions when prompted, then tap and hold the record button to start recording. Release to stop. You can preview your clip, add a title, select a mood emoji, and add tags before publishing.",
    icon: Mic,
    tags: ["recording", "how to", "record", "microphone", "voice"],
  },
  {
    id: "edit-clips",
    category: "Recording & Clips",
    question: "Can I edit my clips after publishing?",
    answer: "No, you cannot edit clips after they're published. However, you can edit captions/transcriptions if you're the clip owner. For audio changes, you'll need to delete the clip and create a new one. You can use the audio editor before publishing to trim, adjust volume, add effects, or mix in background music.",
    icon: Settings,
    tags: ["edit", "modify", "change", "update", "delete", "captions"],
  },
  {
    id: "delete-clips",
    category: "Recording & Clips",
    question: "Can I delete my clips?",
    answer: "Yes! You can delete individual clips at any time from your profile or the clip detail page. When you delete a clip, it's permanently removed from Vocalix. You can also delete your entire account from Settings, which removes all your clips and profile data.",
    icon: Shield,
    tags: ["delete", "remove", "clip", "account"],
  },
  {
    id: "transcription",
    category: "Recording & Clips",
    question: "Are my clips automatically transcribed?",
    answer: "Yes! All voice clips are automatically transcribed using AI. This makes your clips searchable and accessible. You can see the transcription on the clip detail page, and it's used for search functionality so people can find your content by what you actually said.",
    icon: FileText,
    tags: ["transcription", "captions", "text", "search", "ai"],
  },

  // Live Rooms
  {
    id: "what-are-live-rooms",
    category: "Live Rooms",
    question: "What are Live Rooms?",
    answer: "Live Rooms are real-time audio discussion spaces where you can join conversations with other users. There are three roles: Hosts (room creators who manage the room), Speakers (who can talk), and Viewers (who can listen but not speak). Think of it like Clubhouse or Twitter Spaces, but built for Vocalix.",
    icon: Radio,
    tags: ["live rooms", "audio", "discussion", "conversation", "real-time"],
  },
  {
    id: "how-to-join-live-room",
    category: "Live Rooms",
    question: "How do I join a Live Room?",
    answer: "Browse available live rooms from the Live Rooms page. Click on any room to join as a viewer. You can listen to the conversation immediately. If you want to speak, you can request to speak, and the host can promote you to a speaker.",
    icon: PlayCircle,
    tags: ["join", "live room", "participate", "viewer"],
  },
  {
    id: "request-to-speak",
    category: "Live Rooms",
    question: "How do I request to speak in a Live Room?",
    answer: "When you're viewing a live room, click the 'Request to Speak' button at the bottom. The host will be notified and can promote you to a speaker. Once you're a speaker, you can unmute your microphone and join the conversation.",
    icon: Mic,
    tags: ["request", "speak", "speaker", "host", "promote"],
  },
  {
    id: "create-live-room",
    category: "Live Rooms",
    question: "How do I create a Live Room?",
    answer: "Go to the Live Rooms page and click the 'Create Room' button. Give your room a title and description, set the maximum number of speakers and viewers, and choose whether to make it public or private. You can also schedule rooms for later. Once created, you're automatically the host.",
    icon: Radio,
    tags: ["create", "host", "live room", "start", "schedule"],
  },
  {
    id: "live-room-roles",
    category: "Live Rooms",
    question: "What are the different roles in Live Rooms?",
    answer: "Host: The room creator who can manage speakers, invite viewers, mute participants, and end the room. Speaker: Can talk and participate in the conversation. Viewers: Can listen but not speak unless promoted by the host. Hosts can promote viewers to speakers or invite them directly.",
    icon: Users,
    tags: ["roles", "host", "speaker", "viewer", "permissions"],
  },

  // Communities
  {
    id: "what-are-communities",
    category: "Communities",
    question: "What are Communities?",
    answer: "Communities are audio-focused groups where people with shared interests can connect. Each community has its own feed of voice clips, live rooms, events, and discussions. You can join communities, follow them, and participate in community-specific content.",
    icon: Users,
    tags: ["communities", "groups", "interests", "connect"],
  },
  {
    id: "join-community",
    category: "Communities",
    question: "How do I join a Community?",
    answer: "Browse communities from the Communities page, search for topics you're interested in, or discover them from the home feed. Click on a community to view it, then click 'Join Community' to become a member. Once joined, you can post clips, join live rooms, and participate in community events.",
    icon: Users,
    tags: ["join", "community", "member", "participate"],
  },
  {
    id: "create-community",
    category: "Communities",
    question: "Can I create my own Community?",
    answer: "Yes! Click 'Create Community' from the Communities page. Give it a name, description, choose an emoji avatar, and set whether it's public or private. Once created, you're the community creator and can manage members, moderate content, and customize the community settings.",
    icon: Users,
    tags: ["create", "community", "start", "founder"],
  },

  // Privacy & Security
  {
    id: "is-it-anonymous",
    category: "Privacy & Security",
    question: "Is Vocalix really anonymous?",
    answer: "Yes! We don't require any personal information. No email, no phone number, no real name. You create an account with just a handle and an avatar. Your device ID is used for authentication, but it's not linked to any personal data. You're as anonymous as you want to be.",
    icon: Shield,
    tags: ["anonymous", "privacy", "personal information", "data"],
  },
  {
    id: "block-users",
    category: "Privacy & Security",
    question: "Can I block users?",
    answer: "Yes! You can block users from their profile page. Blocked users won't be able to see your clips, interact with you, or send you messages. You can manage your blocked users list in Settings under Privacy & Security.",
    icon: Lock,
    tags: ["block", "privacy", "safety", "users"],
  },
  {
    id: "report-content",
    category: "Privacy & Security",
    question: "How do I report inappropriate content?",
    answer: "Click the report button on any clip, comment, or profile. Our moderation team will review it. You can also report users from their profile page. All reports are reviewed, and action is taken against violations of our community guidelines.",
    icon: AlertCircle,
    tags: ["report", "moderation", "inappropriate", "safety"],
  },
  {
    id: "data-privacy",
    category: "Privacy & Security",
    question: "What data does Vocalix collect?",
    answer: "Vocalix collects minimal data: your handle, avatar, voice clips, and device ID for authentication. We don't collect email addresses, phone numbers, or real names unless you choose to provide them. Your voice clips are stored securely, and you can delete them or your entire account at any time.",
    icon: Lock,
    tags: ["data", "privacy", "collection", "information"],
  },

  // Features
  {
    id: "voice-reactions",
    category: "Features",
    question: "What are Voice Reactions?",
    answer: "Voice Reactions are 3-5 second voice clips you can use to react to other people's clips. Instead of just emoji reactions, you can record a quick voice response. This adds personality and nuance that text can't match, and creates viral 'reaction chains' where people react to reactions.",
    icon: Heart,
    tags: ["voice reactions", "react", "response", "interaction"],
  },
  {
    id: "collections",
    category: "Features",
    question: "What are Collections?",
    answer: "Collections are user-curated playlists of voice clips. You can create collections around topics, themes, or anything you want. Others can follow your collections, and you can share them. It's like creating your own audio magazine or podcast series.",
    icon: BookOpen,
    tags: ["collections", "playlists", "curate", "organize"],
  },
  {
    id: "trending",
    category: "Features",
    question: "How does Trending work?",
    answer: "Trending clips are determined by an algorithm that considers freshness, engagement (listens, reactions, replies), and velocity (how quickly engagement is growing). The trending feed shows clips that are gaining traction right now, not just the most popular overall.",
    icon: TrendingUp,
    tags: ["trending", "algorithm", "popular", "viral"],
  },
  {
    id: "topics",
    category: "Features",
    question: "What are Daily Topics?",
    answer: "Daily Topics are automatically generated conversation starters that inspire discussions. Each day, a new topic is created, and you can filter the feed to see clips related to that topic. Topics from the past 7 days are shown, and you can browse topic-specific pages.",
    icon: Calendar,
    tags: ["topics", "daily", "conversation", "discussions"],
  },
  {
    id: "hashtags",
    category: "Features",
    question: "How do Hashtags work?",
    answer: "You can add hashtags to your clips when recording. Hashtags help people discover your content. Click on any hashtag to see all clips with that tag. Hashtags are searchable and help organize content around themes, events, or topics.",
    icon: Hash,
    tags: ["hashtags", "tags", "discover", "organize"],
  },
  {
    id: "offline-mode",
    category: "Features",
    question: "Can I listen to clips offline?",
    answer: "Yes! Vocalix has an offline mode. You can download clips for offline listening. Go to any clip and click the download button. Downloaded clips are stored locally on your device using IndexedDB and can be accessed even without an internet connection. You can manage your downloads in Settings. Note: Downloads are stored per-device and don't sync across devices automatically.",
    icon: Download,
    tags: ["offline", "download", "listen", "internet", "indexeddb"],
  },
  {
    id: "background-playback",
    category: "Features",
    question: "Can I listen while using other apps?",
    answer: "Yes! Vocalix supports background playback using the Media Session API. You can minimize the browser tab or switch to other apps while audio continues playing. The audio player controls appear in your device's media controls (lock screen, notification area), so you can pause, play, or skip without opening Vocalix. This works best when Vocalix is installed as a PWA.",
    icon: PlayCircle,
    tags: ["background", "playback", "multitask", "media controls", "pwa"],
  },
  {
    id: "playback-speed",
    category: "Features",
    question: "Can I change playback speed?",
    answer: "Yes! You can adjust playback speed from 0.5x to 2.0x. Your speed preference is saved to your profile and automatically applied to all clips you listen to. You can change it in the mini player or audio controls. This is great for listening to longer clips or catching up on content faster.",
    icon: Volume2,
    tags: ["playback speed", "speed", "1.5x", "2x", "faster", "profile"],
  },

  // Search & Discovery
  {
    id: "how-to-search",
    category: "Search & Discovery",
    question: "How do I search for content?",
    answer: "Use the search bar at the top of the page. You can search by what people actually said (transcription search), by handle, by hashtags, or by topics. Voice search is also available - click the microphone icon in the search bar to search using your voice.",
    icon: Search,
    tags: ["search", "find", "discover", "voice search"],
  },
  {
    id: "voice-search",
    category: "Search & Discovery",
    question: "How does Voice Search work?",
    answer: "Voice Search lets you search using your voice instead of typing. Click the microphone icon in the search bar, speak your search query, and Vocalix will find clips matching what you said. Voice search uses your browser's Web Speech API and works best in Chrome, Edge, or Safari. If your browser doesn't support it, the microphone button won't appear.",
    icon: Mic,
    tags: ["voice search", "speak", "audio search", "microphone", "browser"],
  },
  {
    id: "discover-content",
    category: "Search & Discovery",
    question: "How do I discover new content?",
    answer: "Browse the home feed (Hot, Top, Rising, Controversial), explore Daily Topics, check out Trending clips, browse Communities, search by hashtags, or use the Discovery page for personalized recommendations based on your interests and listening history.",
    icon: Globe,
    tags: ["discover", "explore", "feed", "recommendations"],
  },

  // Account & Settings
  {
    id: "lose-device",
    category: "Account & Settings",
    question: "What happens if I lose my device?",
    answer: "Your account is tied to your device, but you can link multiple devices using the 'Link Account' feature in Settings. This creates a PIN or magic link that you can use to access your account on other devices. Make sure to set this up before losing your device!",
    icon: Smartphone,
    tags: ["device", "lost", "recover", "link account", "pin"],
  },
  {
    id: "link-devices",
    category: "Account & Settings",
    question: "How do I link multiple devices?",
    answer: "Go to Settings and use the 'Link Account' feature. You can create a PIN (4-6 digits) or generate a magic link. Use the PIN or link on your other device to access the same account. This lets you use Vocalix on multiple devices with the same profile.",
    icon: Smartphone,
    tags: ["link", "devices", "multiple", "sync", "pin"],
  },
  {
    id: "delete-account",
    category: "Account & Settings",
    question: "How do I delete my account?",
    answer: "Go to Settings, scroll to the Account section, and click 'Delete Account'. This will permanently remove your profile, all your clips, and all associated data. This action cannot be undone, so make sure you really want to delete everything.",
    icon: Shield,
    tags: ["delete", "account", "remove", "permanent"],
  },
  {
    id: "change-handle",
    category: "Account & Settings",
    question: "Can I change my handle?",
    answer: "Yes, but with limitations. You can change your handle in Settings, but there's a cooldown period between changes to prevent abuse. The exact cooldown period is shown in Settings. This helps maintain consistency while still allowing flexibility. If you need to change it more frequently, you may need to wait for the cooldown to expire.",
    icon: Settings,
    tags: ["handle", "username", "change", "modify", "cooldown"],
  },
  {
    id: "notifications",
    category: "Account & Settings",
    question: "How do notifications work?",
    answer: "You'll receive notifications for reactions, replies, follows, mentions, and when someone requests to speak in your live room. You can customize notification preferences in Settings. Notifications appear in the app and can be enabled for browser push notifications.",
    icon: Bell,
    tags: ["notifications", "alerts", "preferences", "settings"],
  },

  // Technical
  {
    id: "microphone-not-working",
    category: "Technical",
    question: "Why isn't my microphone working?",
    answer: "Check browser permissions (allow microphone access in your browser settings), make sure you're on HTTPS (required for recording), try a different browser, check your microphone settings in your device's system preferences, and ensure no other app is using the microphone.",
    icon: Mic,
    tags: ["microphone", "recording", "permissions", "troubleshooting"],
  },
  {
    id: "slow-processing",
    category: "Technical",
    question: "Why are my clips taking so long to process?",
    answer: "Processing includes transcription, summarization, and moderation. This usually takes 10-30 seconds. High traffic may cause delays. If processing takes longer than 2 minutes, try refreshing the page or contact support if the issue persists.",
    icon: Zap,
    tags: ["processing", "slow", "transcription", "delay"],
  },
  {
    id: "download-clips",
    category: "Technical",
    question: "Can I download clips?",
    answer: "Yes! You can download clips for offline listening. Click the download button on any clip. Downloaded clips are stored locally and can be accessed offline. You can manage your downloads in the Offline section of your profile.",
    icon: Download,
    tags: ["download", "offline", "save", "local"],
  },
  {
    id: "clip-expiration",
    category: "Technical",
    question: "Do clips expire?",
    answer: "No, clips stay on Vocalix indefinitely unless you delete them or they're removed for violations. There's no automatic expiration. Your content remains available as long as you want it to be.",
    icon: Calendar,
    tags: ["expiration", "delete", "permanent", "storage"],
  },
  {
    id: "see-listeners",
    category: "Technical",
    question: "Can I see who listened to my clips?",
    answer: "You can see listen counts, but not individual listeners (privacy feature). This protects user privacy while still giving you engagement metrics. You can see total listens, reactions, and replies on each clip.",
    icon: Eye,
    tags: ["listeners", "privacy", "analytics", "engagement"],
  },
  {
    id: "cors-errors",
    category: "Technical",
    question: "Why am I getting CORS errors?",
    answer: "CORS errors usually indicate a configuration issue. Check that your Supabase CORS settings include your domain, verify your environment variables are correct, and ensure you're accessing Vocalix from the correct URL. If issues persist, contact support.",
    icon: AlertCircle,
    tags: ["cors", "error", "technical", "troubleshooting"],
  },
  {
    id: "offline-indicator",
    category: "Technical",
    question: "How do I know if I'm offline?",
    answer: "Vocalix shows an offline banner at the top of the screen when you lose internet connection. You can still access downloaded clips and view cached content. The app will automatically sync when you're back online.",
    icon: WifiOff,
    tags: ["offline", "internet", "connection", "sync"],
  },

  // Sharing & Social
  {
    id: "share-clips",
    category: "Sharing & Social",
    question: "How do I share clips?",
    answer: "Click the share button on any clip to get a shareable link. You can share clips via social media, messaging apps, or copy the link. Shared clips can be viewed by anyone with the link, even if they don't have a Vocalix account.",
    icon: Share2,
    tags: ["share", "link", "social media", "export"],
  },
  {
    id: "follow-users",
    category: "Sharing & Social",
    question: "How do I follow other users?",
    answer: "Visit any user's profile and click the 'Follow' button. You'll see their clips in your Following feed. You can unfollow at any time. Following someone doesn't give them access to your private information - it just adds their content to your feed.",
    icon: Users,
    tags: ["follow", "users", "profile", "feed"],
  },
  {
    id: "reply-to-clips",
    category: "Sharing & Social",
    question: "How do I reply to clips?",
    answer: "Click the reply button on any clip to record a voice reply. Your reply will appear as a thread under the original clip. You can also add text comments. Replies create conversation threads that others can participate in.",
    icon: MessageCircle,
    tags: ["reply", "comment", "thread", "conversation"],
  },
  {
    id: "remix-clips",
    category: "Sharing & Social",
    question: "What is Remixing?",
    answer: "Remixing lets you create new content by combining your voice with an existing clip. You can create duets where you record your voice alongside someone else's clip, creating collaborative audio content. Remixes are credited to both the original creator and you. Use the 'Duet' button on any clip to create a remix.",
    icon: Music,
    tags: ["remix", "duet", "collaborate", "overlay"],
  },

  // Analytics & Stats
  {
    id: "view-analytics",
    category: "Analytics & Stats",
    question: "Can I see analytics for my clips?",
    answer: "Yes! Visit the Analytics page from your profile or the main menu. You can see total listens, reactions, replies, follower growth, and trending performance. Analytics help you understand what content resonates with your audience.",
    icon: TrendingUp,
    tags: ["analytics", "stats", "metrics", "performance"],
  },
  {
    id: "leaderboards",
    category: "Analytics & Stats",
    question: "What are Leaderboards?",
    answer: "Leaderboards show top creators based on various metrics like total listens, reactions, followers, or trending clips. You can filter by time period (daily, weekly, monthly, all-time) and see where you rank among other creators.",
    icon: Award,
    tags: ["leaderboards", "ranking", "top", "creators"],
  },
];

const categories = [
  "All",
  "Getting Started",
  "Recording & Clips",
  "Live Rooms",
  "Communities",
  "Privacy & Security",
  "Features",
  "Search & Discovery",
  "Account & Settings",
  "Technical",
  "Sharing & Social",
  "Analytics & Stats",
];

export default function FAQ() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Check if we have a search query from navigation state or URL params
  useEffect(() => {
    if (location.state?.searchQuery) {
      setSearchQuery(location.state.searchQuery);
    }
    // Also check URL search params
    const urlParams = new URLSearchParams(location.search);
    const qParam = urlParams.get("q");
    if (qParam) {
      setSearchQuery(qParam);
    }
  }, [location.state, location.search]);

  const filteredFAQs = useMemo(() => {
    let filtered = faqData;

    // Filter by category
    if (selectedCategory !== "All") {
      filtered = filtered.filter((faq) => faq.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (faq) =>
          faq.question.toLowerCase().includes(query) ||
          faq.answer.toLowerCase().includes(query) ||
          faq.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [searchQuery, selectedCategory]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredFAQs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedFAQs = filteredFAQs.slice(startIndex, endIndex);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: faqData.length };
    faqData.forEach((faq) => {
      counts[faq.category] = (counts[faq.category] || 0) + 1;
    });
    return counts;
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gradient-to-b from-black/95 via-gray-900/95 to-transparent backdrop-blur-xl border-b border-red-800/20">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.history.back()}
              className="rounded-full text-white hover:bg-red-900/20 hover:text-red-400"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3 flex-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-red-600/20 to-amber-600/20 border border-red-500/30">
                <MessageCircle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white">
                  Frequently Asked Questions
                </h1>
                <p className="text-xs text-gray-400">Everything you need to know about Vocalix</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Search Bar */}
        <Card className="p-4 rounded-xl bg-gradient-to-br from-red-950/30 via-amber-950/30 to-red-950/30 border border-red-800/30 shadow-lg">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-red-400" />
            <Input
              type="text"
              placeholder="Search FAQs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 text-sm bg-gray-900/50 border-red-800/30 text-white placeholder:text-gray-500 focus:border-red-500/50 focus:ring-red-500/20"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchQuery("")}
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 text-gray-400 hover:text-white hover:bg-red-900/20"
              >
                <span className="text-xs">✕</span>
              </Button>
            )}
          </div>
        </Card>

        {/* Category Tabs - Compact */}
        <div className="overflow-x-auto pb-2">
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
            <TabsList className="w-full justify-start h-auto p-1 bg-gradient-to-r from-red-950/40 via-amber-950/40 to-red-950/40 border border-red-800/20 rounded-lg">
              {categories.slice(0, 8).map((category) => (
                <TabsTrigger
                  key={category}
                  value={category}
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-600/20 data-[state=active]:to-amber-600/20 data-[state=active]:text-white rounded-md px-3 py-1.5 text-xs whitespace-nowrap text-gray-300 hover:text-white transition-all"
                >
                  {category}
                  <Badge variant="outline" className="ml-1.5 text-[10px] border-red-700/30 text-gray-400 data-[state=active]:text-red-400 px-1 py-0">
                    {categoryCounts[category] || 0}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Results Count */}
        {searchQuery && (
          <div className="text-xs text-gray-400 px-2">
            <span className="text-red-400 font-semibold">{filteredFAQs.length}</span> {filteredFAQs.length === 1 ? "result" : "results"} for <span className="text-amber-400">"{searchQuery}"</span>
          </div>
        )}

        {/* FAQ List - Paginated */}
        {filteredFAQs.length > 0 ? (
          <div className="space-y-3">
            <Accordion type="single" collapsible className="w-full space-y-2">
              {paginatedFAQs.map((faq) => {
                const Icon = faq.icon;
                return (
                  <Card key={faq.id} className="overflow-hidden bg-gradient-to-br from-red-950/30 via-amber-950/30 to-red-950/30 border border-red-800/30 shadow-md hover:border-red-700/50 transition-colors">
                    <AccordionItem value={faq.id} className="border-0">
                      <AccordionTrigger className="px-4 py-3.5 hover:no-underline group">
                        <div className="flex items-center gap-3 flex-1 text-left">
                          <div className="flex-shrink-0">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-600/30 to-amber-600/20 border border-red-500/30 flex items-center justify-center group-hover:scale-110 group-hover:border-red-400/50 transition-all">
                              <Icon className="h-5 w-5 text-red-400" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm text-white group-hover:text-red-400 transition-colors leading-tight mb-0.5">{faq.question}</h3>
                            <p className="text-[11px] text-gray-500 line-clamp-1">{faq.category}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-red-400 flex-shrink-0 transition-all duration-200 group-data-[state=open]:rotate-90" />
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        <div className="pl-13 space-y-3">
                          <p className="text-gray-300 leading-relaxed text-sm">{faq.answer}</p>
                          {faq.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-red-800/20">
                              {faq.tags.slice(0, 5).map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-[10px] cursor-pointer hover:bg-red-900/30 border-red-700/30 text-gray-400 hover:text-red-400 hover:border-red-500/50 transition-colors px-2 py-0.5"
                                  onClick={() => setSearchQuery(tag)}
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Card>
                );
              })}
            </Accordion>

            {/* Pagination */}
            {totalPages > 1 && (
              <Card className="p-4 bg-gradient-to-br from-red-950/30 via-amber-950/30 to-red-950/30 border border-red-800/30">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-400">
                    Showing <span className="text-red-400 font-semibold">{startIndex + 1}</span> to <span className="text-red-400 font-semibold">{Math.min(endIndex, filteredFAQs.length)}</span> of <span className="text-amber-400 font-semibold">{filteredFAQs.length}</span> questions
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="h-8 px-3 text-xs border-red-700/30 text-gray-300 hover:bg-red-900/20 hover:text-red-400 disabled:opacity-50"
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(pageNum)}
                            className={`h-8 w-8 p-0 text-xs ${
                              currentPage === pageNum
                                ? "bg-gradient-to-r from-red-600 to-amber-600 text-white"
                                : "border-red-700/30 text-gray-300 hover:bg-red-900/20 hover:text-red-400"
                            }`}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="h-8 px-3 text-xs border-red-700/30 text-gray-300 hover:bg-red-900/20 hover:text-red-400 disabled:opacity-50"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        ) : (
          <Card className="p-8 text-center bg-gradient-to-br from-red-950/30 via-amber-950/30 to-red-950/30 border border-red-800/30">
            <HelpCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <h3 className="text-base font-semibold mb-2 text-white">No results found</h3>
            <p className="text-gray-400 text-sm mb-4">
              Try a different search term
            </p>
            <Button 
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("All");
              }}
              className="bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white text-sm"
              size="sm"
            >
              Clear Search
            </Button>
          </Card>
        )}

        {/* Help Section - Compact */}
        <Card className="p-4 rounded-xl bg-gradient-to-br from-red-950/40 via-amber-950/40 to-red-950/40 border border-red-800/30">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-600/30 to-amber-600/20 border border-red-500/30 flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-red-400" />
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sm mb-1 text-white">Still need help?</h3>
              <div className="flex flex-wrap gap-1.5">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigate("/")}
                  className="border-red-700/30 text-gray-300 hover:bg-red-900/20 hover:text-red-400 hover:border-red-500/50 text-xs h-7 px-2"
                >
                  <BookOpen className="h-3 w-3 mr-1" />
                  Tutorial
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigate("/settings")}
                  className="border-red-700/30 text-gray-300 hover:bg-red-900/20 hover:text-red-400 hover:border-red-500/50 text-xs h-7 px-2"
                >
                  <Settings className="h-3 w-3 mr-1" />
                  Settings
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigate("/dmca")}
                  className="border-red-700/30 text-gray-300 hover:bg-red-900/20 hover:text-red-400 hover:border-red-500/50 text-xs h-7 px-2"
                >
                  <Copyright className="h-3 w-3 mr-1" />
                  DMCA
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}

