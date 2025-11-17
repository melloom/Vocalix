# Deployment Guide

This guide covers deploying Echo Garden to production.

## 📋 Table of Contents

- [Deployment Overview](#deployment-overview)
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Deploying to Vercel](#deploying-to-vercel)
- [Deploying to Netlify](#deploying-to-netlify)
- [Environment Setup](#environment-setup)
- [Database Migrations](#database-migrations)
- [Post-Deployment Verification](#post-deployment-verification)
- [Rollback Procedures](#rollback-procedures)

## 🚀 Deployment Overview

Echo Garden consists of:
- **Frontend**: Static React app (Vite build)
- **Backend**: Supabase (managed service)

### Deployment Architecture

```
┌─────────────────┐
│   Frontend      │  → Vercel/Netlify
│   (Static)      │
└─────────────────┘
        │
        │ HTTPS
        ▼
┌─────────────────┐
│   Supabase      │  → Managed Service
│   (Backend)     │
└─────────────────┘
```

## ✅ Pre-Deployment Checklist

### Code Quality

- [ ] All tests pass (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] Code reviewed and approved
- [ ] No console errors in browser
- [ ] No TypeScript errors

### Environment

- [ ] Environment variables configured
- [ ] Production Supabase project set up
- [ ] Database migrations applied
- [ ] Edge functions deployed
- [ ] Storage buckets configured

### Security

- [ ] Security headers configured
- [ ] CORS settings correct
- [ ] API keys secured
- [ ] RLS policies verified
- [ ] No secrets in code

### Performance

- [ ] Build optimized (`npm run build`)
- [ ] Images optimized
- [ ] Code splitting enabled
- [ ] Lazy loading implemented

## 🚢 Deploying to Vercel

### Initial Setup

1. **Install Vercel CLI** (optional):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Link Project**:
   ```bash
   vercel link
   ```

### Deploy

**Option 1: Via CLI**
```bash
vercel --prod
```

**Option 2: Via Dashboard**
1. Go to [vercel.com](https://vercel.com)
2. Import your Git repository
3. Configure build settings:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
4. Add environment variables
5. Deploy

### Environment Variables

In Vercel Dashboard → Project Settings → Environment Variables:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SENTRY_DSN=your-sentry-dsn (optional)
```

### Configuration

Create `vercel.json` (if needed):

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        }
      ]
    }
  ]
}
```

## 🌐 Deploying to Netlify

### Initial Setup

1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**:
   ```bash
   netlify login
   ```

### Deploy

**Option 1: Via CLI**
```bash
# Build first
npm run build

# Deploy
netlify deploy --prod
```

**Option 2: Via Dashboard**
1. Go to [netlify.com](https://netlify.com)
2. Add new site → Import from Git
3. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Add environment variables
5. Deploy

### Environment Variables

In Netlify Dashboard → Site Settings → Environment Variables:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SENTRY_DSN=your-sentry-dsn (optional)
```

### Configuration

Create `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    X-XSS-Protection = "1; mode=block"
```

## 🔧 Environment Setup

### Required Variables

| Variable | Description | Where to Set |
|----------|-------------|--------------|
| `VITE_SUPABASE_URL` | Supabase project URL | Hosting dashboard |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | Hosting dashboard |

### Optional Variables

| Variable | Description | Where to Set |
|----------|-------------|--------------|
| `VITE_SENTRY_DSN` | Sentry DSN | Hosting dashboard |
| `VITE_RECAPTCHA_SITE_KEY` | reCAPTCHA key | Hosting dashboard |

See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for complete list.

## 🗄️ Database Migrations

### Running Migrations

**Option 1: Via Supabase Dashboard**
1. Go to SQL Editor
2. Copy migration SQL
3. Run migration
4. Verify migration success

**Option 2: Via Supabase CLI**
```bash
# Link project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### Migration Best Practices

- Test migrations in staging first
- Backup database before migrations
- Run migrations during low-traffic periods
- Verify migrations don't break existing data
- Have rollback plan ready

## ✅ Post-Deployment Verification

### Functional Checks

- [ ] Homepage loads correctly
- [ ] User can create account
- [ ] User can record and upload clips
- [ ] Clips appear in feed
- [ ] Audio playback works
- [ ] Search works
- [ ] Profile pages work
- [ ] Admin dashboard accessible (if admin)

### Performance Checks

- [ ] Page load time < 3 seconds
- [ ] Time to interactive < 5 seconds
- [ ] No console errors
- [ ] No network errors
- [ ] Images load correctly

### Security Checks

- [ ] HTTPS enabled
- [ ] Security headers present
- [ ] CORS configured correctly
- [ ] No exposed API keys
- [ ] RLS policies working

### Monitoring

- [ ] Error tracking working (Sentry)
- [ ] Analytics configured (if applicable)
- [ ] Logs accessible
- [ ] Alerts configured

## 🔄 Rollback Procedures

### Frontend Rollback

**Vercel:**
1. Go to Deployments
2. Find previous deployment
3. Click "..." → "Promote to Production"

**Netlify:**
1. Go to Deploys
2. Find previous deployment
3. Click "..." → "Publish deploy"

### Database Rollback

1. Identify migration to rollback
2. Create reverse migration
3. Test in staging
4. Apply to production
5. Verify data integrity

### Emergency Rollback

If critical issue:
1. Immediately rollback frontend
2. Assess database impact
3. Create fix
4. Test thoroughly
5. Redeploy

## 🔍 Monitoring Post-Deployment

### Key Metrics

- **Error Rate**: Monitor Sentry for errors
- **Performance**: Check page load times
- **User Activity**: Monitor user registrations, clips
- **API Usage**: Monitor Supabase usage

### Alerts

Set up alerts for:
- High error rate
- Slow response times
- Database connection issues
- Storage quota warnings

## 📚 Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Netlify Documentation](https://docs.netlify.com/)
- [Supabase Documentation](https://supabase.com/docs)
- [QUICK_DEPLOY.md](./QUICK_DEPLOY.md) - Quick deployment guide

---

**Last Updated**: 2025-01-27

