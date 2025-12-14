# Echo Garden Architecture

This document provides a comprehensive overview of the Echo Garden system architecture.

## 📋 Table of Contents

- [System Overview](#system-overview)
- [Technology Stack](#technology-stack)
- [Frontend Architecture](#frontend-architecture)
- [Backend Architecture](#backend-architecture)
- [Database Architecture](#database-architecture)
- [API Architecture](#api-architecture)
- [Data Flow](#data-flow)
- [Security Architecture](#security-architecture)
- [Deployment Architecture](#deployment-architecture)

## 🏗️ System Overview

Echo Garden is an audio-first social platform built as a modern web application with the following architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Browser)                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  React App (Vite + TypeScript)                       │  │
│  │  - Components, Pages, Hooks, Contexts               │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                  Supabase Platform                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   REST API   │  │   Realtime   │  │   Storage    │    │
│  │  (PostgREST) │  │  (WebSocket) │  │  (S3-like)   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Database   │  │   Edge      │  │   Auth       │    │
│  │ (PostgreSQL) │  │  Functions  │  │  (Magic      │    │
│  │              │  │  (Deno)     │  │   Links)     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
                        │
                        │
┌───────────────────────▼─────────────────────────────────────┐
│              External Services                               │
│  - OpenAI (Whisper for transcription)                       │
│  - OpenAI (GPT for summarization)                            │
│  - Resend (Email service)                                   │
│  - Sentry (Error tracking)                                   │
└─────────────────────────────────────────────────────────────┘
```

## 🛠️ Technology Stack

### Frontend

- **React 18** - UI framework with hooks
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **TanStack Query** - Data fetching and caching
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn-ui** - High-quality React components
- **next-themes** - Dark mode support
- **React Hook Form** - Form management
- **Zod** - Schema validation

### Backend (Supabase)

- **PostgreSQL** - Relational database
- **PostgREST** - Auto-generated REST API
- **Realtime** - WebSocket subscriptions
- **Storage** - Object storage for audio files
- **Edge Functions** - Serverless functions (Deno)
- **Row Level Security (RLS)** - Database-level security

### External Services

- **OpenAI Whisper** - Audio transcription
- **OpenAI GPT** - Content summarization and tagging
- **Resend** - Email delivery
- **Sentry** - Error tracking and monitoring
- **reCAPTCHA** - Bot protection

## 🎨 Frontend Architecture

### Project Structure

```
src/
├── components/          # React components
│   ├── ui/             # shadcn-ui base components
│   ├── ClipCard.tsx    # Clip display component
│   ├── RecordModal.tsx  # Recording interface
│   └── ...
├── pages/              # Route-level components
│   ├── Index.tsx       # Main feed
│   ├── Profile.tsx     # User profiles
│   └── ...
├── context/             # React contexts
│   ├── AuthContext.tsx  # Authentication state
│   ├── AudioPlayerContext.tsx # Audio playback
│   └── UploadQueueContext.tsx  # Upload management
├── hooks/              # Custom React hooks
│   ├── useFollow.ts    # Follow/unfollow logic
│   ├── useSearch.ts    # Search functionality
│   └── ...
├── lib/                 # Utility functions
│   ├── utils.ts        # General utilities
│   ├── validation.ts   # Form validation
│   └── ...
└── integrations/       # External integrations
    └── supabase/        # Supabase client
```

### Key Patterns

**Component Architecture**
- Functional components with hooks
- Composition over inheritance
- Separation of concerns (UI, logic, data)

**State Management**
- React Context for global state
- TanStack Query for server state
- Local state for component-specific data

**Data Fetching**
- TanStack Query for caching and synchronization
- Optimistic updates for better UX
- Real-time subscriptions via Supabase

**Routing**
- React Router for client-side routing
- Lazy loading for code splitting
- Route-based code splitting

## 🗄️ Backend Architecture

### Supabase Services

**PostgreSQL Database**
- Relational database with JSONB support
- Row Level Security (RLS) policies
- Functions and triggers
- Full-text search capabilities

**PostgREST API**
- Auto-generated REST API from database schema
- Automatic OpenAPI documentation
- Built-in filtering, pagination, sorting

**Realtime Subscriptions**
- WebSocket-based real-time updates
- Channel-based subscriptions
- Automatic reconnection

**Storage**
- S3-compatible object storage
- Public and private buckets
- Signed URLs for secure access

**Edge Functions**
- Deno runtime
- Serverless functions
- Background processing
- External API integrations

### Edge Functions

**Core Functions**
- `on-clip-uploaded` - Process uploaded clips (transcription, moderation)
- `daily-topic` - Generate daily topics
- `daily-digest` - Send email digests
- `admin-review` - Admin moderation tools
- `publish-scheduled-clips` - Publish scheduled content

**Processing Pipeline**
1. User uploads audio → Storage
2. Edge function triggered → `on-clip-uploaded`
3. Transcription via Whisper
4. Summarization via GPT
5. Moderation checks
6. Database update
7. Real-time notification

## 📊 Database Architecture

### Core Tables

**profiles**
- User profiles with device-based authentication
- Fields: `id`, `handle`, `emoji_avatar`, `device_id`, `city`, `joined_at`

**clips**
- Voice clips with metadata
- Fields: `id`, `profile_id`, `audio_path`, `duration_seconds`, `captions`, `summary`, `status`, `topic_id`

**topics**
- Daily discussion topics
- Fields: `id`, `title`, `description`, `date`, `is_active`

**communities**
- Audio communities
- Fields: `id`, `name`, `slug`, `description`, `creator_id`

**live_rooms**
- Live audio rooms
- Fields: `id`, `title`, `host_id`, `status`, `started_at`

### Relationships

```
profiles (1) ──< (many) clips
topics (1) ──< (many) clips
communities (1) ──< (many) community_members
profiles (1) ──< (many) follows (following)
profiles (1) ──< (many) follows (follower)
```

### Security (RLS)

- Row Level Security enabled on all tables
- Policies enforce access control
- Device-based authentication
- Profile-based permissions

## 🔌 API Architecture

### REST API (PostgREST)

**Base URL**: `https://[project].supabase.co/rest/v1/`

**Endpoints**
- `GET /clips` - List clips with filtering
- `GET /clips/:id` - Get single clip
- `POST /clips` - Create clip
- `GET /profiles` - List profiles
- `GET /topics` - List topics
- `GET /communities` - List communities

**Features**
- Automatic filtering via query parameters
- Pagination support
- Sorting and ordering
- Full-text search

### Edge Functions API

**Base URL**: `https://[project].supabase.co/functions/v1/`

**Functions**
- `public-api` - Public REST API with API keys
- `admin-review` - Admin moderation API
- `daily-digest` - Email digest generation

### Public API

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for complete API reference.

## 🔄 Data Flow

### Clip Upload Flow

```
1. User records audio (MediaRecorder API)
   ↓
2. Audio blob created
   ↓
3. Upload to Supabase Storage
   ↓
4. Create clip record in database
   ↓
5. Edge function triggered (on-clip-uploaded)
   ↓
6. Process audio:
   - Transcribe (Whisper)
   - Summarize (GPT)
   - Moderate (OpenAI)
   ↓
7. Update clip record with results
   ↓
8. Real-time notification to feed
   ↓
9. Clip appears in feed
```

### Real-time Updates

```
1. Database change (INSERT/UPDATE/DELETE)
   ↓
2. Supabase Realtime detects change
   ↓
3. WebSocket message sent to subscribed clients
   ↓
4. TanStack Query cache updated
   ↓
5. React components re-render
```

## 🔒 Security Architecture

### Authentication

- **Device-based**: Device ID stored in localStorage
- **Magic Links**: Passwordless email authentication
- **Anonymous**: No email required for basic usage

### Authorization

- **Row Level Security (RLS)**: Database-level access control
- **Policies**: Profile-based permissions
- **Edge Functions**: Server-side validation

### Data Protection

- **HTTPS**: All communications encrypted
- **Environment Variables**: Secrets not in code
- **RLS Policies**: Prevent unauthorized access
- **Input Validation**: Client and server-side

See [SECURITY.md](./SECURITY.md) for detailed security information.

## 🚀 Deployment Architecture

### Frontend

- **Build**: Vite production build
- **Hosting**: Vercel or Netlify
- **CDN**: Automatic via hosting provider
- **Environment**: Environment variables in hosting dashboard

### Backend

- **Database**: Supabase managed PostgreSQL
- **Edge Functions**: Supabase Edge Functions
- **Storage**: Supabase Storage
- **API**: Supabase REST API

### Monitoring

- **Sentry**: Error tracking
- **Supabase Dashboard**: Database metrics
- **Edge Function Logs**: Function execution logs

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment details.

## 📈 Scalability Considerations

### Current Architecture

- **Frontend**: Static hosting (scales automatically)
- **Database**: Supabase managed (auto-scaling)
- **Edge Functions**: Serverless (auto-scaling)
- **Storage**: Supabase Storage (auto-scaling)

### Future Optimizations

- Database indexing for performance
- Caching strategies (CDN, Redis)
- Database read replicas
- Edge function optimization

## 🔗 Related Documentation

- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development setup
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Database schema details
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - API reference
- [SECURITY.md](./SECURITY.md) - Security details
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment guide

---

**Last Updated**: 2025-01-27

