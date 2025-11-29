# Netlify Environment Variables Cleanup

## ❌ Remove These from Netlify (They Belong in Supabase)

These are **backend secrets** that should only be in Supabase Edge Functions secrets:

### 1. `RESEND_API_KEY`
- **Where it's used**: Edge Function `daily-digest`
- **Should be in**: Supabase Dashboard → Edge Functions → Secrets
- **Action**: Remove from Netlify, add to Supabase if not already there

### 2. `RECAPTCHA_SECRET_KEY`
- **Where it's used**: Edge Function `validate-account-creation`
- **Should be in**: Supabase Dashboard → Edge Functions → Secrets
- **Action**: Remove from Netlify, add to Supabase if not already there

### 3. `NEWS_API_KEY`
- **Where it's used**: Edge Function `fetch-news`
- **Should be in**: Supabase Dashboard → Edge Functions → Secrets
- **Action**: Remove from Netlify, add to Supabase if not already there

## ✅ Keep These in Netlify (Frontend Variables)

These are **frontend variables** and should stay in Netlify:

### Required:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`)

### Optional:
- `VITE_RECAPTCHA_SITE_KEY` ← **Keep this!** (frontend public key)
- `VITE_SENTRY_DSN`
- `VITE_FREEPIK_API_KEY` (for avatar icons)

## 🔄 Quick Reference

| Variable | Frontend or Backend? | Netlify | Supabase |
|----------|---------------------|---------|----------|
| `RESEND_API_KEY` | Backend | ❌ Remove | ✅ Add |
| `RECAPTCHA_SECRET_KEY` | Backend | ❌ Remove | ✅ Add |
| `NEWS_API_KEY` | Backend | ❌ Remove | ✅ Add |
| `VITE_RECAPTCHA_SITE_KEY` | Frontend | ✅ Keep | ❌ No |
| `VITE_SUPABASE_URL` | Frontend | ✅ Keep | ❌ No |
| `VITE_SUPABASE_ANON_KEY` | Frontend | ✅ Keep | ❌ No |

## 📋 Steps to Clean Up

1. **Go to Netlify Dashboard** → Your Site → Environment Variables

2. **Remove these if present:**
   - `RESEND_API_KEY`
   - `RECAPTCHA_SECRET_KEY`
   - `NEWS_API_KEY`

3. **Verify these are in Supabase:**
   - Go to Supabase Dashboard → Project Settings → Edge Functions → Secrets
   - Make sure `RESEND_API_KEY`, `RECAPTCHA_SECRET_KEY`, and `NEWS_API_KEY` are there
   - If missing, add them

4. **Redeploy** your Netlify site after removing variables

## ⚠️ Important Notes

- **Frontend variables** (`VITE_*`) = Safe to expose, go in Netlify
- **Backend secrets** (no `VITE_`) = Must be secret, go in Supabase Edge Functions
- Removing backend secrets from Netlify won't break anything if they're in Supabase

