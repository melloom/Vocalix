# Development Guide

This guide will help you set up and work with the Echo Garden codebase.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Running the Project](#running-the-project)
- [Project Structure](#project-structure)
- [Code Organization](#code-organization)
- [Common Tasks](#common-tasks)
- [Debugging](#debugging)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## 📦 Prerequisites

### Required

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **npm** (comes with Node.js) or **bun**
- **Git** ([Download](https://git-scm.com/))
- **Supabase Account** ([Sign up](https://supabase.com))

### Recommended

- **VS Code** with extensions:
  - ESLint
  - Prettier
  - TypeScript
  - Tailwind CSS IntelliSense
- **Supabase CLI** (for local development)

## 🚀 Local Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/echo-garden-49-main.git
cd echo-garden-49-main
```

### 2. Install Dependencies

```bash
npm install
```

Or with bun:

```bash
bun install
```

### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env  # If .env.example exists
# Or create .env manually
```

Add your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for all variables.

### 4. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:8080/`

## 🔧 Environment Variables

### Required for Development

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | Supabase Dashboard → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key | Supabase Dashboard → Settings → API |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_SENTRY_DSN` | Sentry DSN for error tracking | - |
| `VITE_RECAPTCHA_SITE_KEY` | reCAPTCHA site key | - |

See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for complete reference.

## 🏃 Running the Project

### Development Server

```bash
npm run dev
```

- Hot module replacement (HMR)
- Fast refresh
- Source maps enabled
- Runs on `http://localhost:8080/`

### Build for Production

```bash
npm run build
```

Outputs to `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

### Linting

```bash
npm run lint
```

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

## 📁 Project Structure

```
echo-garden-49-main/
├── src/
│   ├── components/      # React components
│   │   ├── ui/         # shadcn-ui base components
│   │   └── ...         # Feature components
│   ├── pages/          # Route-level components
│   ├── context/        # React contexts
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utility functions
│   ├── integrations/   # External integrations
│   └── utils/          # Helper utilities
├── supabase/
│   ├── migrations/     # Database migrations
│   └── functions/      # Edge functions
├── public/             # Static assets
├── docs/               # Documentation
└── package.json        # Dependencies
```

### Key Directories

**`src/components/`**
- Reusable UI components
- Feature-specific components
- `ui/` contains shadcn-ui base components

**`src/pages/`**
- Route-level components
- One file per route
- Lazy loaded for code splitting

**`src/hooks/`**
- Custom React hooks
- Reusable logic
- Data fetching hooks

**`src/context/`**
- Global state management
- Auth context, Audio player context, etc.

**`src/lib/`**
- Utility functions
- Validation schemas
- Helper functions

**`supabase/migrations/`**
- Database schema changes
- Run in chronological order
- Timestamped files

**`supabase/functions/`**
- Edge functions (Deno)
- Background processing
- API endpoints

## 📝 Code Organization

### Component Structure

```typescript
// Component file structure
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface ComponentProps {
  // Props interface
}

export function Component({ ...props }: ComponentProps) {
  // Component logic
  return (
    // JSX
  );
}
```

### Hook Structure

```typescript
// Custom hook
import { useState, useEffect } from 'react';

export function useCustomHook() {
  const [state, setState] = useState();
  
  useEffect(() => {
    // Side effects
  }, []);
  
  return { state, setState };
}
```

### File Naming

- Components: `PascalCase.tsx` (e.g., `ClipCard.tsx`)
- Hooks: `camelCase.ts` with `use` prefix (e.g., `useFollow.ts`)
- Utilities: `camelCase.ts` (e.g., `utils.ts`)
- Pages: `PascalCase.tsx` (e.g., `Index.tsx`)

## 🔨 Common Tasks

### Adding a New Component

1. Create component file in `src/components/`
2. Import and use in parent component
3. Add to exports if reusable

### Adding a New Page

1. Create page file in `src/pages/`
2. Add route in `src/App.tsx`
3. Lazy load for code splitting

### Adding a New Hook

1. Create hook file in `src/hooks/`
2. Export hook function
3. Use in components

### Adding a Database Migration

1. Create migration file in `supabase/migrations/`
2. Use timestamp format: `YYYYMMDDHHMMSS_description.sql`
3. Run migration via Supabase CLI or Dashboard

### Adding an Edge Function

1. Create function directory in `supabase/functions/`
2. Create `index.ts` file
3. Deploy via Supabase CLI

## 🐛 Debugging

### Browser DevTools

- **React DevTools**: Inspect component tree
- **Network Tab**: Monitor API requests
- **Console**: View logs and errors
- **Application Tab**: Check localStorage, IndexedDB

### VS Code Debugging

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Launch Chrome",
      "url": "http://localhost:8080",
      "webRoot": "${workspaceFolder}/src"
    }
  ]
}
```

### Console Logging

```typescript
// Use logger utility for consistent logging
import { logger } from '@/lib/logger';

logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');
```

### Supabase Debugging

- Check Supabase Dashboard → Logs
- Monitor Edge Function logs
- Check database queries in SQL Editor
- Use Supabase CLI for local debugging

## 🧪 Testing

### Running Tests

```bash
npm test
```

### Writing Tests

See [TESTING.md](./TESTING.md) for testing guide.

### Test Structure

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Component } from './Component';

describe('Component', () => {
  it('should render correctly', () => {
    render(<Component />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

## 🔍 Troubleshooting

### Common Issues

**Port already in use**
```bash
# Kill process on port 8080
# Windows
netstat -ano | findstr :8080
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:8080 | xargs kill
```

**Module not found**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Supabase connection issues**
- Check environment variables
- Verify Supabase project is active
- Check network connectivity

**Build errors**
```bash
# Clear build cache
rm -rf dist .vite
npm run build
```

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for more solutions.

## 📚 Additional Resources

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - API reference
- [TESTING.md](./TESTING.md) - Testing guide
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines

---

**Last Updated**: 2025-01-27

