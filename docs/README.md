# 🌱 Echo Garden

<div align="center">

## 🌐 [**Visit Echo Garden → echogarden.netlify.app**](https://echogarden.netlify.app/)

**An audio-first social platform where voice is the primary medium of expression**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)

[Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Contributing](#-contributing)

</div>

---

## 📖 About

**Echo Garden** is an innovative audio-first social platform where users share short voice clips instead of text posts. Think of it as a voice-based social network where conversations happen through audio, creating a more authentic and engaging way to connect.

### Key Differentiators

- 🎤 **Audio-First**: Everything revolves around voice content
- 🎧 **Voice Clips**: Share 30-second clips or 10-minute podcast segments
- 💬 **Voice Reactions**: React with emojis and voice replies
- 👥 **Communities**: Join audio communities and participate in live rooms
- 🔒 **Privacy-Conscious**: Anonymous-friendly with device-based authentication
- 📍 **Topic-Driven**: Daily topics inspire conversations
- 🌍 **Location-Based**: Discover content by topics, hashtags, cities, and more

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

# Start the development server
npm run dev
```

The development server runs on `http://localhost:8080/` by default.

### Environment Setup

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_RECAPTCHA_SITE_KEY=your-recaptcha-site-key (optional)
VITE_SENTRY_DSN=your-sentry-dsn (optional)
```

See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for complete environment variable reference.

---

## 🚀 Production Ready

Echo Garden is production-ready with the following features:

### ✅ Security
- **Row Level Security (RLS)**: All database tables protected with RLS policies
- **Rate Limiting**: API rate limiting to prevent abuse
- **reCAPTCHA**: Bot protection integrated
- **HTTPS**: Secure connections enforced
- **Security Headers**: XSS, CSRF, and clickjacking protection
- **CORS**: Properly configured for production domains
- **Environment Variables**: Secure configuration management

### ✅ Performance
- **Optimized Builds**: Production builds with code splitting
- **CDN Ready**: Static assets optimized for CDN delivery
- **Database Indexes**: Performance indexes on critical queries
- **Caching**: Query caching and optimized data fetching
- **Lazy Loading**: Components and routes loaded on demand

### ✅ Monitoring & Reliability
- **Error Tracking**: Sentry integration for error monitoring
- **Database Backups**: Automated backups via Supabase
- **Uptime Monitoring**: System health monitoring
- **Logging**: Comprehensive logging for debugging

### ✅ Deployment
- **Netlify Ready**: Configured for Netlify deployment
- **Vercel Ready**: Configured for Vercel deployment
- **Environment Setup**: Clear documentation for production setup
- **Migration System**: Organized database migrations in `supabase/migrations/`

### 📋 Pre-Deployment Checklist

Before deploying to production, ensure:

- [ ] Environment variables configured in hosting platform
- [ ] Production Supabase project set up
- [ ] Database migrations applied (`supabase/migrations/`)
- [ ] CORS configured for production domain
- [ ] Security headers configured
- [ ] reCAPTCHA keys added (if using)
- [ ] Error tracking configured (Sentry)
- [ ] Domain SSL certificate valid
- [ ] All tests passing

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

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

### 🚀 Getting Started
- **[SETUP_INSTRUCTIONS.md](./SETUP_INSTRUCTIONS.md)** - Initial setup guide
- **[COMPLETE_SETUP_GUIDE.md](./COMPLETE_SETUP_GUIDE.md)** - Complete setup instructions
- **[ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md)** - Environment variables reference
- **[ONBOARDING_TUTORIAL.md](./ONBOARDING_TUTORIAL.md)** - Comprehensive onboarding guide

### 👥 User Guides
- **[USER_TUTORIAL.md](./USER_TUTORIAL.md)** - Complete user tutorial ⭐
- **[ADMIN_SETUP_GUIDE.md](./ADMIN_SETUP_GUIDE.md)** - Admin dashboard setup ⭐
- **[ADMIN_DASHBOARD_FEATURES.md](./ADMIN_DASHBOARD_FEATURES.md)** - Admin features overview

### 🔌 API & Development
- **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)** - Complete API reference ⭐
- **[API_VERSIONING.md](./API_VERSIONING.md)** - API versioning guide
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Developer setup and workflow
- **[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)** - Database schema documentation

### 🔒 Security
- **[SECURITY.md](./SECURITY.md)** - Security guide ⭐
- **[SECURITY_TODO.md](./SECURITY_TODO.md)** - Security checklist
- **[SECURITY_INCIDENT_RESPONSE.md](./SECURITY_INCIDENT_RESPONSE.md)** - Incident response
- **[SQL_INJECTION_PREVENTION.md](./SQL_INJECTION_PREVENTION.md)** - SQL injection prevention
- **[DEVICE_SECURITY.md](./DEVICE_SECURITY.md)** - Device security

### 🚢 Deployment
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deployment guide ⭐
- **[RECAPTCHA_SETUP.md](./RECAPTCHA_SETUP.md)** - reCAPTCHA configuration
- **[MONITORING_AND_ALERTING.md](./MONITORING_AND_ALERTING.md)** - Monitoring setup

### 🎯 Features & Roadmap
- **[ROADMAP.md](./ROADMAP.md)** - Product roadmap
- **[TOP_PRIORITY_FEATURES.md](./TOP_PRIORITY_FEATURES.md)** - Feature priorities
- **[ECHO_GARDEN_IMPROVEMENTS.md](./ECHO_GARDEN_IMPROVEMENTS.md)** - Improvements list

### 🐛 Troubleshooting
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues and solutions
- **[FAQ.md](./FAQ.md)** - Frequently asked questions
- **[GLOSSARY.md](./GLOSSARY.md)** - Terminology reference

### 📖 Additional Resources
- **[DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md)** - Complete documentation index
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines
- **[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)** - Code of conduct

---

## 🏗️ Project Structure

```
echo-garden-49-main/
├── src/
│   ├── components/      # React components
│   ├── pages/          # Page components
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utility functions
│   ├── contexts/       # React contexts
│   └── types/          # TypeScript types
├── supabase/
│   ├── functions/      # Edge functions
│   └── migrations/     # Database migrations (all SQL files organized here)
├── public/             # Static assets
├── docs/               # Additional documentation
└── scripts/            # Utility scripts
```

---

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

---

## 🚢 Deployment

### Build for Production

```bash
npm run build
```

The build output will be in the `dist` directory, ready to deploy to any static hosting provider.

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Deploy to Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build and deploy
npm run build
netlify deploy --prod
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

---

## 🤝 Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](./CONTRIBUTING.md) guide for details on:

- Code of conduct
- How to submit pull requests
- Development workflow
- Coding standards
- Testing requirements

### Quick Contribution Steps

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 Scripts

```bash
# Development
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview production build

# Code Quality
npm run lint         # Run ESLint
npm test             # Run tests
npm run test:ui      # Run tests with UI
npm run test:coverage # Run tests with coverage
```

---

## 🐛 Known Issues

For known issues and troubleshooting, see:
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- [FAQ.md](./FAQ.md)

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

## 👨‍💻 Author

**Melvin Coder**

- GitHub: [@melloom](https://github.com/melloom)
- Repository: [Echo-Garden](https://github.com/melloom/Echo-Garden)

---

## 🙏 Acknowledgments

- [Supabase](https://supabase.com/) for the amazing backend platform
- [shadcn/ui](https://ui.shadcn.com/) for the beautiful component library
- [Vite](https://vitejs.dev/) for the lightning-fast build tool
- All contributors and users of Echo Garden

---

## 📊 Project Status

**Status**: 🟢 Active Development

- ✅ Core features implemented
- ✅ Security features in place
- ✅ Documentation comprehensive
- 🔄 Mobile optimization in progress
- 📋 Advanced features planned

See [ROADMAP.md](./ROADMAP.md) for detailed roadmap and future plans.

---

## 🌐 Links

- **🌐 Live Website**: [https://echogarden.netlify.app/](https://echogarden.netlify.app/)
- **GitHub Repository**: [https://github.com/melloom/Echo-Garden](https://github.com/melloom/Echo-Garden)
- **Documentation**: See [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md) for all docs
- **Issues**: [GitHub Issues](https://github.com/melloom/Echo-Garden/issues)
- **Discussions**: [GitHub Discussions](https://github.com/melloom/Echo-Garden/discussions)

---

## ⭐ Show Your Support

If you find this project helpful, please consider giving it a ⭐ on GitHub!

---

<div align="center">

**Made with ❤️ by Melvin Coder**

[⬆ Back to Top](#-echo-garden)

</div>
