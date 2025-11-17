# reCAPTCHA Setup Guide

This guide explains how to set up Google reCAPTCHA for local development and production.

## 🎯 Quick Answer: Local Development

**You don't need to deploy your project to get a domain!** Google reCAPTCHA supports `localhost` for testing. Just register `localhost` as a domain in the reCAPTCHA console.

---

## 📋 Step-by-Step Setup

### 1. Create a Google reCAPTCHA Account

1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin/create)
2. Sign in with your Google account
3. Click **"Create"** to register a new site

### 2. Register Your Site

Fill in the registration form:

- **Label**: Give it a name (e.g., "Echo Garden - Development")
- **reCAPTCHA type**: Choose **reCAPTCHA v2** → **"I'm not a robot" Checkbox**
  - For local development, v2 is recommended as it's simpler
  - v3 is invisible but requires score-based verification
- **Domains**: Add these domains:
  - `localhost` (for local development)
  - `127.0.0.1` (alternative localhost)
  - Your production domain (e.g., `echogarden.app`)
  - Any staging domains you use

**Important**: You can add multiple domains to the same reCAPTCHA site!

### 3. Get Your Keys

After creating the site, you'll receive:
- **Site Key** (public, used in frontend)
- **Secret Key** (private, used in backend)

### 4. Configure Environment Variables

#### Frontend (`.env` or `.env.local`)

Create or update your `.env` file in the project root:

```env
VITE_RECAPTCHA_SITE_KEY=your_site_key_here
```

#### Backend (Supabase Edge Function)

Set the secret key in your Supabase project:

**Option A: Using Supabase Dashboard**
1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Edge Functions** → **Secrets**
3. Add a new secret:
   - **Name**: `RECAPTCHA_SECRET_KEY`
   - **Value**: Your secret key from Google

**Option B: Using Supabase CLI**
```bash
supabase secrets set RECAPTCHA_SECRET_KEY=your_secret_key_here
```

### 5. Test Locally

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Open `http://localhost:8080` (or your configured port)

3. Navigate to the account creation page

4. You should see the reCAPTCHA checkbox appear

5. Complete the reCAPTCHA and try creating an account

---

## 🔧 Configuration Details

### reCAPTCHA Types

#### reCAPTCHA v2 ("I'm not a robot" Checkbox)
- **Best for**: Most use cases, including local development
- **User experience**: User clicks a checkbox
- **Implementation**: Already configured in `OnboardingFlow.tsx`

#### reCAPTCHA v3 (Invisible)
- **Best for**: Production with minimal user friction
- **User experience**: Invisible, runs in background
- **Note**: Requires score-based verification (score 0.0-1.0)
- **Implementation**: Would require changes to use `execute()` instead of checkbox

### Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `VITE_RECAPTCHA_SITE_KEY` | Frontend `.env` | Public site key (safe to expose) |
| `RECAPTCHA_SECRET_KEY` | Supabase Secrets | Private secret key (never expose) |

---

## 🚀 Production Deployment

When deploying to production:

1. **Update reCAPTCHA site**:
   - Add your production domain to the reCAPTCHA site
   - You can use the same site for both localhost and production

2. **Set environment variables**:
   - Frontend: Set `VITE_RECAPTCHA_SITE_KEY` in your hosting platform (Vercel, Netlify, etc.)
   - Backend: Set `RECAPTCHA_SECRET_KEY` in Supabase secrets

3. **Optional: Create separate sites**:
   - Development site: `localhost`, `127.0.0.1`
   - Production site: `echogarden.app`, `www.echogarden.app`

---

## 🐛 Troubleshooting

### reCAPTCHA not showing

1. **Check environment variable**:
   - Ensure `VITE_RECAPTCHA_SITE_KEY` is set
   - Restart your dev server after adding the variable

2. **Check domain**:
   - Verify `localhost` is added to your reCAPTCHA site domains
   - Try `127.0.0.1` if `localhost` doesn't work

3. **Check browser console**:
   - Look for reCAPTCHA errors
   - Common error: "Invalid domain for site key"

### Verification failing

1. **Check secret key**:
   - Verify `RECAPTCHA_SECRET_KEY` is set in Supabase
   - Ensure it matches the secret key from Google

2. **Check network**:
   - Ensure your Supabase Edge Function can reach `https://www.google.com/recaptcha/api/siteverify`

3. **Check logs**:
   - Check Supabase Edge Function logs for reCAPTCHA errors

### Testing without reCAPTCHA

If you want to test without reCAPTCHA:

1. **Temporarily remove the environment variable**:
   - Remove `VITE_RECAPTCHA_SITE_KEY` from `.env`
   - The component will automatically hide reCAPTCHA if the key is missing

2. **Or comment out the check**:
   - The code already handles missing keys gracefully

---

## 📝 Code Locations

- **Frontend Component**: `src/components/OnboardingFlow.tsx`
- **Backend Verification**: `supabase/functions/validate-account-creation/index.ts`

---

## 🔒 Security Notes

1. **Never commit secrets**: 
   - Add `.env` to `.gitignore`
   - Never commit `RECAPTCHA_SECRET_KEY`

2. **Site key is public**: 
   - The site key is safe to expose in frontend code
   - It's designed to be public

3. **Secret key is private**: 
   - Keep `RECAPTCHA_SECRET_KEY` secret
   - Only use it in backend/server-side code

4. **Rate limiting**: 
   - reCAPTCHA works alongside your existing rate limiting
   - It adds an extra layer of bot protection

---

## ✅ Verification Flow

1. User completes reCAPTCHA → Frontend gets token
2. Frontend sends token to validation endpoint
3. Backend verifies token with Google's API
4. Google returns success/failure + score (v3)
5. Backend allows or blocks account creation

---

## 🎓 Additional Resources

- [Google reCAPTCHA Documentation](https://developers.google.com/recaptcha/docs/display)
- [reCAPTCHA v2 Guide](https://developers.google.com/recaptcha/docs/display)
- [reCAPTCHA v3 Guide](https://developers.google.com/recaptcha/docs/v3)

---

## 💡 Tips

1. **Use the same site for dev and prod**: You can add multiple domains to one reCAPTCHA site
2. **Test thoroughly**: Try creating accounts with and without completing reCAPTCHA
3. **Monitor logs**: Check Supabase logs for reCAPTCHA verification failures
4. **Consider v3 for production**: v3 is invisible but requires score-based logic

---

**Last Updated**: 2025-01-XX

