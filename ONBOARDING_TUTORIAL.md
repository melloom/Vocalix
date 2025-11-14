# Echo Garden - Complete Onboarding Tutorial 🌱

Welcome to Echo Garden! This comprehensive guide will help you understand the project structure, features, and how everything works.

---

## 📖 Table of Contents

1. [What is Echo Garden?](#what-is-echo-garden)
2. [Getting Started](#getting-started)
3. [Project Structure](#project-structure)
4. [Key Features Overview](#key-features-overview)
5. [Navigation Guide](#navigation-guide)
6. [Core User Flows](#core-user-flows)
7. [Technical Architecture](#technical-architecture)
8. [Database Schema](#database-schema)
9. [Development Workflow](#development-workflow)
10. [Deployment](#deployment)
11. [Common Tasks](#common-tasks)
12. [Troubleshooting](#troubleshooting)

---

## What is Echo Garden?

**Echo Garden** is an audio-first social platform where users share short voice clips instead of text posts. Think of it as a voice-based social network where:

- 🎤 Users record 30-second voice clips (or 10-minute podcast clips)
- 🎧 Listen to voice content from the community
- 💬 React with emojis and voice reactions
- 🔗 Reply to clips with voice replies
- 👥 Follow creators and join communities
- 📍 Discover content by topics, hashtags, cities, and more
- 🎙️ Participate in live audio rooms

### Key Differentiators

- **Audio-First**: Everything revolves around voice content
- **Anonymous-Friendly**: Users can participate with pseudonyms
- **Topic-Driven**: Daily topics inspire conversations
- **Community-Focused**: Audio communities and live rooms
- **Privacy-Conscious**: City opt-in, device-based authentication

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm/bun
- **Supabase Account** (for backend)
- **Git** (for version control)

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd echo-garden-49-main
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   bun install
   ```

3. **Set up environment variables**
   - Create a `.env` file in the root directory
   - Add your Supabase credentials:
     ```
     VITE_SUPABASE_URL=your_supabase_url
     VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
     ```

4. **Start the development server**
   ```bash
   npm run dev
   # or
   bun dev
   ```
   The app will be available at `http://localhost:8080/`

5. **Run database migrations**
   - Migrations are in `supabase/migrations/`
   - Run them in order (they're timestamped)
   - See `RUN_COMMUNITIES_MIGRATION.md` for community-specific migrations

---

## Project Structure

```
echo-garden-49-main/
├── src/
│   ├── components/          # React components
│   │   ├── ui/             # shadcn-ui components
│   │   ├── ClipCard.tsx    # Display individual clips
│   │   ├── RecordModal.tsx  # Recording interface
│   │   ├── LiveRoom.tsx     # Live audio rooms
│   │   └── ...
│   ├── pages/              # Page components (routes)
│   │   ├── Index.tsx       # Main feed page
│   │   ├── Profile.tsx     # User profiles
│   │   ├── Communities.tsx # Community discovery
│   │   └── ...
│   ├── context/            # React contexts
│   │   ├── AuthContext.tsx  # Authentication state
│   │   ├── AudioPlayerContext.tsx # Audio playback
│   │   └── UploadQueueContext.tsx # Upload management
│   ├── hooks/              # Custom React hooks
│   │   ├── useFollow.ts    # Follow/unfollow logic
│   │   ├── useLiveRooms.ts # Live rooms data
│   │   └── ...
│   ├── integrations/      # External integrations
│   │   └── supabase/       # Supabase client & types
│   ├── lib/                # Utility functions
│   │   ├── utils.ts        # General utilities
│   │   └── validation.ts   # Form validation
│   └── App.tsx             # Main app component
├── supabase/
│   ├── migrations/         # Database migrations
│   └── functions/         # Edge functions
│       ├── daily-topic/    # Generate daily topics
│       ├── process-clip/   # Process uploaded clips
│       └── ...
├── public/                # Static assets
└── package.json           # Dependencies
```

### Key Directories Explained

**`src/components/`**
- Reusable UI components
- `ClipCard.tsx` - The main component for displaying voice clips
- `RecordModal.tsx` - Recording interface with waveform
- `OnboardingFlow.tsx` - First-time user setup

**`src/pages/`**
- Route-level components
- Each file corresponds to a URL route
- See `src/App.tsx` for routing configuration

**`src/context/`**
- Global state management
- `AuthContext` - User authentication and profile
- `AudioPlayerContext` - Manages audio playback across the app

**`supabase/migrations/`**
- Database schema changes
- Run in chronological order
- Each migration is timestamped

**`supabase/functions/`**
- Serverless edge functions
- Handle background processing (transcription, moderation, etc.)

---

## Key Features Overview

### 1. **Voice Clips** 🎤
- Record 30-second clips (or 10-minute podcast clips)
- Automatic transcription via Whisper AI
- AI-generated summaries and tags
- Mood emoji selection
- City tagging (optional)

### 2. **Feed System** 📰
- **Hot**: Trending now (freshness × engagement)
- **Top**: All-time, week, or month (pure engagement)
- **Controversial**: High engagement with mixed reactions
- **Rising**: Gaining traction (recent + accelerating)
- **Trending**: Pre-calculated trending scores

### 3. **Topics** 📅
- Daily topics generated automatically
- Past 7 days shown with activity counts
- Click to filter feed by topic
- Topic-specific pages at `/topic/:topicId`

### 4. **Interactions** 💬
- **Emoji Reactions**: React with emojis (😊, 🔥, ❤️, etc.)
- **Voice Replies**: Reply to clips with your own voice
- **Remixes**: Remix clips with voice overlay
- **Chains**: Continue audio story chains
- **Comments**: Text comments (nested threading)

### 5. **Discovery** 🔍
- **Search**: Search by content, creator, topic, mood
- **Advanced Filters**: Duration, date range, city, mood, topic
- **Saved Searches**: Save frequently used search filters
- **Hashtags**: Browse by hashtag at `/tag/:tagName`
- **City Filter**: Filter by "Everyone" or "Near you"

### 6. **Social Features** 👥
- **Follow System**: Follow creators
- **Following Feed**: See clips from people you follow
- **Profiles**: View creator profiles with stats
- **Activity Page**: See your activity and interactions

### 7. **Communities** 🏘️
- Create and join audio communities
- Community-specific feeds
- Community follows
- Community pages at `/community/:slug`

### 8. **Live Audio Rooms** 🎙️
- Host live audio discussions
- Join as listener or speaker
- Real-time chat
- Live room pages at `/live-room/:id`

### 9. **Collections & Playlists** 📚
- **Saved Clips**: Save clips for later
- **Playlists**: Create custom playlists
- **Collections**: User-curated collections
- **Collections Discovery**: Browse collections

### 10. **Challenges** 🏆
- Participate in voice challenges
- Challenge-specific pages
- Leaderboards and rewards

---

## Navigation Guide

### Main Navigation (Header)

Located at the top of every page:

- **Echo Garden** (logo) - Returns to home feed
- **🌙 Theme Toggle** - Switch between light/dark mode
- **⌨️ Keyboard Shortcuts** - View available shortcuts
- **📻 Live Rooms** - Browse live audio rooms
- **👥 Communities** - Discover communities
- **✓ Following** - See people you follow
- **🔔 Notifications** - View notifications
- **🔖 Saved** - Your saved clips
- **🎤 My Recordings** - Your published clips
- **⚙️ Settings** - Account settings
- **📍 City** - Set your city (if opted in)

### Keyboard Shortcuts

- **`/`** - Focus search
- **`n`** - New recording
- **`d`** - Toggle dark mode
- **`Esc`** - Clear search (when in search input)

### Main Routes

| Route | Description | Component |
|-------|-------------|-----------|
| `/` | Main feed | `Index.tsx` |
| `/profile/:handle` | User profile | `Profile.tsx` |
| `/topic/:topicId` | Topic page | `Topic.tsx` |
| `/clip/:id` | Clip detail | `ClipDetail.tsx` |
| `/communities` | Community discovery | `Communities.tsx` |
| `/community/:slug` | Community page | `CommunityDetail.tsx` |
| `/live-rooms` | Live rooms list | `LiveRooms.tsx` |
| `/live-room/:id` | Live room | `LiveRoom.tsx` |
| `/following` | Following feed | `Following.tsx` |
| `/saved` | Saved clips | `SavedClips.tsx` |
| `/my-recordings` | Your clips | `MyRecordings.tsx` |
| `/playlists` | Your playlists | `Playlists.tsx` |
| `/playlist/:playlistId` | Playlist detail | `PlaylistDetail.tsx` |
| `/collections` | Collections discovery | `CollectionsDiscovery.tsx` |
| `/activity` | Activity feed | `Activity.tsx` |
| `/challenges` | Challenges | `Challenges.tsx` |
| `/tag/:tagName` | Hashtag page | `Hashtag.tsx` |
| `/settings` | Settings | `Settings.tsx` |
| `/admin` | Admin panel | `Admin.tsx` |

---

## Core User Flows

### 1. First-Time User Onboarding

**Location**: `src/components/OnboardingFlow.tsx`

1. User visits the site
2. If no profile exists, `OnboardingFlow` is shown
3. User selects:
   - **Handle** (username/pseudonym)
   - **Emoji Avatar** (visual identifier)
4. Profile is created in Supabase
5. Device ID is stored for authentication
6. User is redirected to main feed

**Key Code**:
```typescript
// Onboarding creates profile and device
const { data } = await supabase
  .from("profiles")
  .insert({
    device_id: deviceId,
    handle: handle.trim(),
    emoji_avatar: selectedEmoji,
  });
```

### 2. Recording a Clip

**Location**: `src/components/RecordModal.tsx`

1. User clicks the **+** button (bottom right) or "Share your voice"
2. `RecordModal` opens
3. User clicks record button
4. Browser requests microphone permission
5. Recording starts (waveform animation)
6. User can:
   - Stop recording (max 30 seconds for regular, 10 min for podcast)
   - Preview audio
   - Re-record
7. After recording:
   - Select **mood emoji** (😊, 🔥, ❤️, etc.)
   - Optionally add **title** and **tags**
   - Choose **topic** (defaults to today's topic)
8. Click "Publish"
9. Clip uploads to Supabase Storage
10. `process-clip` edge function:
    - Transcribes audio (Whisper AI)
    - Generates summary (GPT)
    - Extracts tags
    - Runs moderation
    - Updates clip status to "live"

**Key Code**:
```typescript
// Recording flow
const startRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  // ... recording logic
};
```

### 3. Viewing the Feed

**Location**: `src/pages/Index.tsx`

1. Feed loads clips from database
2. Clips are sorted by selected mode (Hot, Top, etc.)
3. Each clip shows:
   - Creator avatar and handle
   - Audio player with waveform
   - Summary and captions
   - Reaction counts
   - Reply/remix/chain buttons
4. User can:
   - Play audio
   - React with emojis
   - Reply/remix/continue chain
   - View full clip detail
   - Follow creator

**Key Code**:
```typescript
// Feed sorting logic
const displayClips = useMemo(() => {
  // Apply filters and sorting
  return clips
    .filter(/* filters */)
    .map(clip => ({ clip, score: calculateScore(clip) }))
    .sort((a, b) => b.score - a.score);
}, [clips, sortMode, filters]);
```

### 4. Reacting to a Clip

**Location**: `src/components/ClipCard.tsx`

1. User clicks emoji reaction button
2. Optimistic update (UI updates immediately)
3. API call to `react-to-clip` edge function
4. Reaction is stored in database
5. Clip's reaction counts update
6. If error, UI reverts

**Key Code**:
```typescript
const handleReaction = async (emoji: string) => {
  // Optimistic update
  setReactions(prev => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
  
  // API call
  await supabase.functions.invoke("react-to-clip", {
    body: { clipId, emoji }
  });
};
```

### 5. Replying to a Clip

**Location**: `src/components/ClipCard.tsx` → `RecordModal.tsx`

1. User clicks "Reply" on a clip
2. `RecordModal` opens with context (replying to @handle)
3. User records reply (same flow as recording)
4. Reply is published with `parent_clip_id` set
5. Reply appears in thread view below original clip

**Key Code**:
```typescript
const handleReply = (clipId: string) => {
  setReplyingToClipId(clipId);
  setIsRecordModalOpen(true);
};
```

### 6. Following a User

**Location**: `src/hooks/useFollow.ts`

1. User clicks "Follow" on a profile
2. Follow relationship is created in `follows` table
3. User appears in "Following" feed
4. Notifications can be sent (if enabled)

**Key Code**:
```typescript
const toggleFollow = async () => {
  if (isFollowing) {
    await supabase.from("follows").delete().eq("follower_id", profileId);
  } else {
    await supabase.from("follows").insert({ follower_id: profileId, following_id: userId });
  }
};
```

---

## Technical Architecture

### Frontend Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **TanStack Query** - Data fetching and caching
- **Tailwind CSS** - Styling
- **shadcn-ui** - UI component library
- **next-themes** - Dark mode support

### Backend Stack

- **Supabase** - Backend-as-a-Service
  - PostgreSQL database
  - Storage (audio files)
  - Edge Functions (serverless)
  - Realtime subscriptions
  - Row Level Security (RLS)

### Key Technologies

- **Whisper AI** - Audio transcription (via edge function)
- **GPT** - Content summarization and tagging (via edge function)
- **MediaRecorder API** - Browser audio recording
- **Web Audio API** - Waveform visualization

### Data Flow

1. **User Action** → React component
2. **Component** → Supabase client
3. **Supabase Client** → Supabase API
4. **Database/Storage** → Data stored
5. **Edge Functions** → Background processing
6. **Realtime** → UI updates automatically

---

## Database Schema

### Core Tables

**`profiles`**
- User profiles
- Fields: `id`, `handle`, `emoji_avatar`, `device_id`, `city`, `consent_city`, `joined_at`

**`clips`**
- Voice clips
- Fields: `id`, `profile_id`, `audio_path`, `duration_seconds`, `captions`, `summary`, `status`, `topic_id`, `mood_emoji`, `city`, `reactions`, `parent_clip_id`, `remix_of_clip_id`, `chain_id`

**`topics`**
- Daily topics
- Fields: `id`, `title`, `description`, `date`, `is_active`

**`listens`**
- Track who listened to what
- Fields: `id`, `profile_id`, `clip_id`, `listened_at`, `completion_rate`

**`clip_reactions`**
- Emoji reactions
- Fields: `id`, `clip_id`, `profile_id`, `emoji`, `created_at`

**`follows`**
- Follow relationships
- Fields: `follower_id`, `following_id`, `created_at`

**`communities`**
- Audio communities
- Fields: `id`, `name`, `slug`, `description`, `creator_id`, `created_at`

**`community_follows`**
- Community memberships
- Fields: `community_id`, `profile_id`, `created_at`

**`live_rooms`**
- Live audio rooms
- Fields: `id`, `title`, `host_id`, `status`, `created_at`

**`saved_clips`**
- Saved clips
- Fields: `profile_id`, `clip_id`, `created_at`

**`playlists`**
- User playlists
- Fields: `id`, `profile_id`, `name`, `description`, `created_at`

**`playlist_clips`**
- Clips in playlists
- Fields: `playlist_id`, `clip_id`, `position`

### Row Level Security (RLS)

All tables have RLS policies:
- Users can read public data
- Users can only modify their own data
- Admins have elevated permissions

---

## Development Workflow

### Running Locally

1. **Start dev server**
   ```bash
   npm run dev
   ```

2. **Make changes**
   - Edit files in `src/`
   - Changes hot-reload automatically

3. **Test features**
   - Use browser dev tools
   - Check Supabase dashboard for data

### Database Changes

1. **Create migration**
   ```sql
   -- supabase/migrations/YYYYMMDDHHMMSS_feature_name.sql
   CREATE TABLE new_table (...);
   ```

2. **Test migration**
   - Run locally against Supabase
   - Verify RLS policies

3. **Commit migration**
   - Add to git
   - Deploy to production Supabase

### Edge Functions

1. **Create function**
   ```bash
   # In supabase/functions/your-function/
   # Create index.ts
   ```

2. **Deploy function**
   ```bash
   supabase functions deploy your-function
   ```

3. **Test function**
   ```bash
   supabase functions serve your-function
   ```

### Code Style

- **TypeScript** - Strict mode enabled
- **ESLint** - Code linting
- **Prettier** - Code formatting (if configured)
- **Component structure** - Functional components with hooks

### Testing Checklist

Before committing:
- [ ] Code compiles without errors
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] Feature works in browser
- [ ] Database changes tested
- [ ] Edge functions tested

---

## Deployment

### Build for Production

```bash
npm run build
```

Output goes to `dist/` directory.

### Deploy to Vercel

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Deploy**
   ```bash
   vercel
   ```

3. **Set environment variables**
   - In Vercel dashboard
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

### Deploy to Netlify

1. **Install Netlify CLI**
   ```bash
   npm i -g netlify-cli
   ```

2. **Deploy**
   ```bash
   netlify deploy --prod
   ```

3. **Set environment variables**
   - In Netlify dashboard
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

### Database Migrations

Run migrations on production Supabase:
1. Go to Supabase dashboard
2. SQL Editor
3. Run migration SQL files in order

---

## Common Tasks

### Adding a New Page

1. **Create page component**
   ```typescript
   // src/pages/NewPage.tsx
   export default function NewPage() {
     return <div>New Page</div>;
   }
   ```

2. **Add route**
   ```typescript
   // src/App.tsx
   import NewPage from "./pages/NewPage";
   
   <Route path="/new-page" element={<NewPage />} />
   ```

3. **Add navigation link** (if needed)
   ```typescript
   <Link to="/new-page">New Page</Link>
   ```

### Adding a New Database Table

1. **Create migration**
   ```sql
   -- supabase/migrations/YYYYMMDDHHMMSS_add_new_table.sql
   CREATE TABLE new_table (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     profile_id UUID REFERENCES profiles(id),
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   
   -- Add RLS
   ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;
   
   CREATE POLICY "Users can read their own data"
     ON new_table FOR SELECT
     USING (auth.uid() = profile_id);
   ```

2. **Run migration**
   - Locally: Supabase dashboard SQL editor
   - Production: Same process

3. **Update TypeScript types**
   ```bash
   # Generate types from Supabase
   npx supabase gen types typescript --project-id your-project > src/integrations/supabase/types.ts
   ```

### Adding a New Edge Function

1. **Create function directory**
   ```bash
   mkdir supabase/functions/new-function
   ```

2. **Create index.ts**
   ```typescript
   // supabase/functions/new-function/index.ts
   import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
   
   serve(async (req) => {
     const { data } = await req.json();
     // Function logic
     return new Response(JSON.stringify({ success: true }), {
       headers: { "Content-Type": "application/json" },
     });
   });
   ```

3. **Deploy**
   ```bash
   supabase functions deploy new-function
   ```

### Adding a New Component

1. **Create component**
   ```typescript
   // src/components/NewComponent.tsx
   interface NewComponentProps {
     // props
   }
   
   export function NewComponent({ }: NewComponentProps) {
     return <div>New Component</div>;
   }
   ```

2. **Use in pages**
   ```typescript
   import { NewComponent } from "@/components/NewComponent";
   ```

---

## Troubleshooting

### Common Issues

**1. "Cannot connect to Supabase"**
- Check `.env` file has correct credentials
- Verify Supabase project is active
- Check network connection

**2. "Audio recording not working"**
- Check browser permissions (microphone)
- Verify HTTPS (required for MediaRecorder)
- Check browser console for errors

**3. "Clips not appearing in feed"**
- Check clip status is "live" (not "processing")
- Verify RLS policies allow reading
- Check database for clips

**4. "Edge function failing"**
- Check function logs in Supabase dashboard
- Verify function is deployed
- Check function code for errors

**5. "TypeScript errors"**
- Run `npm run build` to see all errors
- Update types: `npx supabase gen types typescript --project-id your-project > src/integrations/supabase/types.ts`

### Debug Tips

1. **Browser DevTools**
   - Console for errors
   - Network tab for API calls
   - Application tab for localStorage

2. **Supabase Dashboard**
   - Table Editor to view data
   - Logs for edge functions
   - SQL Editor for queries

3. **React DevTools**
   - Inspect component state
   - Check props and hooks

4. **Network Tab**
   - Check API requests
   - Verify responses
   - Check for CORS errors

---

## Additional Resources

### Documentation Files

- `README.md` - Basic setup
- `ECHO_GARDEN_IMPROVEMENTS.md` - Feature ideas
- `TOP_PRIORITY_FEATURES.md` - Priority features
- `SECURITY.md` - Security practices
- `DEVICE_SECURITY.md` - Device tracking security

### Key Files to Understand

- `src/App.tsx` - Routing and app structure
- `src/pages/Index.tsx` - Main feed logic
- `src/components/ClipCard.tsx` - Clip display
- `src/components/RecordModal.tsx` - Recording flow
- `src/context/AuthContext.tsx` - Authentication
- `src/integrations/supabase/client.ts` - Supabase setup

### External Resources

- [Supabase Docs](https://supabase.com/docs)
- [React Docs](https://react.dev)
- [Vite Docs](https://vitejs.dev)
- [TanStack Query Docs](https://tanstack.com/query)
- [shadcn-ui Docs](https://ui.shadcn.com)

---

## Quick Reference

### Important URLs

- **Local Dev**: `http://localhost:8080/`
- **Supabase Dashboard**: `https://supabase.com/dashboard`
- **Vercel Dashboard**: `https://vercel.com/dashboard`

### Important Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run lint             # Run linter

# Supabase
supabase functions deploy <function>  # Deploy edge function
supabase db reset                     # Reset local database
```

### Important Environment Variables

```
VITE_SUPABASE_URL=your_url
VITE_SUPABASE_ANON_KEY=your_key
```

---

## Next Steps

1. **Explore the codebase**
   - Start with `src/pages/Index.tsx`
   - Look at `src/components/ClipCard.tsx`
   - Check `src/context/AuthContext.tsx`

2. **Try the app**
   - Record a clip
   - React to clips
   - Follow a user
   - Join a community

3. **Read the code**
   - Understand the data flow
   - See how components interact
   - Check edge functions

4. **Make a small change**
   - Add a new feature
   - Fix a bug
   - Improve UI

---

**Welcome to Echo Garden! 🌱**

If you have questions, check the code comments, documentation files, or ask the team. Happy coding!

