# 🌱 Echo Garden (Vocalix)

<div align="center">

**An audio-first social platform where voice is the primary medium of expression**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)

🌐 **[Live Demo → Vocalix.netlify.app](https://Vocalix.netlify.app/)**

[Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation)

</div>

---

## 📖 About

**Echo Garden** (also known as **Vocalix**) is an innovative audio-first social platform where users share short voice clips instead of text posts. Think of it as a voice-based social network where conversations happen through audio, creating a more authentic and engaging way to connect.

### Key Features

- 🎤 **Audio-First**: Everything revolves around voice content
- 🎧 **Voice Clips**: Share 30-second clips or 10-minute podcast segments
- 💬 **Voice Reactions**: React with emojis and voice replies
- 👥 **Communities**: Join audio communities and participate in live rooms
- 🔒 **Privacy-Conscious**: Anonymous-friendly with device-based authentication
- 📍 **Topic-Driven**: Daily topics inspire conversations
- 🌍 **Location-Based**: Discover content by topics, hashtags, cities, and more

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm/bun
- **Supabase Account** (for backend)
- **Git** (for version control)

### Installation

```bash
# Clone the repository
git clone https://github.com/melloom/Echo-Garden.git
cd echo-garden-49-main

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your Supabase credentials

# Start the development server
npm run dev
```

The development server runs on `http://localhost:8080/` by default.

### Environment Variables

See [`.env.example`](.env.example) for required variables, or check the [complete environment variables documentation](docs/ENVIRONMENT_VARIABLES.md).

**Required:**
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anonymous key

---

## ✨ Features

### Core Features
- 🎙️ **Voice Recording**: Record and share voice clips (30 seconds or 10 minutes)
- 🎧 **Audio Playback**: High-quality audio playback with waveform visualization
- 💬 **Voice Replies**: Reply to clips with your own voice responses
- 👤 **User Profiles**: Customizable profiles with voice bios
- 🔍 **Discovery**: Search by transcription, topics, hashtags, and location
- 📱 **Mobile-First**: Responsive design optimized for all devices

### Social Features
- 👥 **Communities**: Create and join audio communities
- 🎙️ **Live Audio Rooms**: Host live audio discussions and AMAs
- 📊 **Trending Algorithm**: Algorithm-driven trending clips
- 📚 **Collections**: User-curated collections of favorite clips
- 🏆 **Gamification**: Achievement badges, streaks, and leaderboards
- 🔔 **Notifications**: Real-time notifications for interactions

### Advanced Features
- 🔒 **Device-Based Auth**: No email required, device-based authentication
- 🛡️ **Security**: reCAPTCHA, bot detection, rate limiting
- 🌐 **Anonymous-Friendly**: Participate with pseudonyms
- 📈 **Analytics**: Creator analytics and engagement metrics
- 🎨 **Themes**: Dark mode and customizable themes
- ♿ **Accessibility**: WCAG compliant with screen reader support

---

## 🛠️ Tech Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component library
- **TanStack Query** - Data fetching and caching
- **React Router** - Routing
- **Zod** - Schema validation

### Backend
- **Supabase** - Backend as a Service
  - PostgreSQL database
  - Authentication
  - Storage (audio files)
  - Edge Functions (Deno)
  - Real-time subscriptions

### Additional Tools
- **Sentry** - Error tracking
- **reCAPTCHA** - Bot protection
- **Vitest** - Testing framework
- **ESLint** - Code linting

---

## 📚 Documentation

Comprehensive documentation is available in the [`docs/`](docs/) folder:

### Getting Started
- **[SETUP_INSTRUCTIONS.md](docs/SETUP_INSTRUCTIONS.md)** - Initial setup guide
- **[ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md)** - Complete environment variables reference
- **[ONBOARDING_TUTORIAL.md](docs/ONBOARDING_TUTORIAL.md)** - Comprehensive onboarding guide

### User Guides
- **[USER_TUTORIAL.md](docs/USER_TUTORIAL.md)** - Complete user tutorial
- **[ADMIN_SETUP_GUIDE.md](docs/ADMIN_SETUP_GUIDE.md)** - Admin dashboard setup

### Development
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System architecture
- **[API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md)** - Complete API reference
- **[DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)** - Database schema documentation

**See [docs/README.md](docs/README.md) for the complete documentation index.**

---

## 🚀 Production Ready

Echo Garden is production-ready with:

- ✅ **Security**: RLS policies, rate limiting, reCAPTCHA, HTTPS
- ✅ **Performance**: Optimized builds, code splitting, caching
- ✅ **Monitoring**: Sentry error tracking, logging
- ✅ **Deployment**: Netlify/Vercel ready

See [docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md](docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md) for deployment checklist.

---

## 📝 Scripts

```bash
# Development
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview production build

# Testing
npm test             # Run tests
npm run test:ui      # Run tests with UI
npm run test:coverage # Run tests with coverage

# Linting
npm run lint         # Run ESLint
```

---

## 🤝 Contributing

Contributions are welcome! Please see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🔗 Links

- **Live Site**: [Vocalix.netlify.app](https://Vocalix.netlify.app/)
- **Documentation**: [docs/README.md](docs/README.md)
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions

---

<div align="center">

Made with ❤️ for the audio community

</div>
