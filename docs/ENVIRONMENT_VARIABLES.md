# Environment Variables Reference

Complete reference for all environment variables used in Echo Garden.

## 📋 Table of Contents

- [Frontend Variables](#frontend-variables)
- [Backend Variables](#backend-variables)
- [Development vs Production](#development-vs-production)
- [Where to Set Variables](#where-to-set-variables)
- [Security Considerations](#security-considerations)

## 🎨 Frontend Variables

### Required

#### `VITE_SUPABASE_URL`
- **Description**: Your Supabase project URL
- **Example**: `https://your-project.supabase.co`
- **Where to Get**: Supabase Dashboard → Settings → API → Project URL
- **Required**: Yes
- **Default**: None

#### `VITE_SUPABASE_ANON_KEY`
- **Description**: Your Supabase anonymous/public key
- **Example**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Where to Get**: Supabase Dashboard → Settings → API → anon/public key
- **Required**: Yes
- **Default**: None
- **Security**: Safe to expose (public key)

### Optional

#### `VITE_SENTRY_DSN`
- **Description**: Sentry DSN for error tracking
- **Example**: `https://abc123@o123456.ingest.sentry.io/123456`
- **Where to Get**: Sentry Dashboard → Project Settings → Client Keys (DSN)
- **Required**: No
- **Default**: None
- **Security**: Safe to expose (public DSN)

#### `VITE_RECAPTCHA_SITE_KEY`
- **Description**: Google reCAPTCHA Enterprise site key (score-based, invisible)
- **Example**: `6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf`
- **Where to Get**: [Google reCAPTCHA Admin](https://www.google.com/recaptcha/admin) → Your site → Site Key
- **Required**: No (but recommended for production)
- **Default**: None
- **Security**: Safe to expose (public key)
- **Type**: Enterprise (score-based) - invisible, runs automatically

#### `VITE_FREEPIK_API_KEY`
- **Description**: Freepik API key for fetching avatar icons
- **Example**: `FPSXfc1a259779cf474dd68722a2ce500c9f`
- **Where to Get**: [Freepik API Dashboard](https://www.freepik.com/api)
- **Required**: No (avatars will show fallback if not set)
- **Default**: None
- **Security**: ⚠️ **WARNING: This key will be visible in the browser!** All `VITE_*` variables are bundled into JavaScript and can be seen by anyone. Consider moving Freepik API calls to a backend Edge Function if the key should remain secret.

#### `VITE_API_BASE_URL`
- **Description**: Base URL for API (if different from Supabase)
- **Example**: `https://api.echogarden.com`
- **Required**: No
- **Default**: Uses Supabase URL

## 🔧 Backend Variables (Edge Functions)

### Supabase Edge Functions Secrets

Set these in Supabase Dashboard → Project Settings → Edge Functions → Secrets

#### `SUPABASE_URL`
- **Description**: Supabase project URL (for Edge Functions)
- **Example**: `https://your-project.supabase.co`
- **Required**: Yes (for Edge Functions)

#### `SUPABASE_SERVICE_ROLE_KEY`
- **Description**: Supabase service role key (secret!)
- **Example**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Required**: Yes (for Edge Functions)
- **Security**: ⚠️ **SECRET** - Never expose!

#### `OPENAI_API_KEY`
- **Description**: OpenAI API key for transcription and summarization
- **Example**: `sk-...`
- **Required**: Yes (for clip processing)
- **Security**: ⚠️ **SECRET** - Never expose!

#### `RESEND_API_KEY`
- **Description**: Resend API key for email delivery
- **Example**: `re_...`
- **Required**: Yes (for daily digest)
- **Security**: ⚠️ **SECRET** - Never expose!

#### `ELEVENLABS_API_KEY`
- **Description**: ElevenLabs API key for voice cloning (accessibility feature)
- **Example**: `sk_...`
- **Required**: No (optional, for voice cloning feature)
- **Where to Get**: [ElevenLabs Dashboard](https://elevenlabs.io/app/settings/api-keys)
- **Security**: ⚠️ **SECRET** - Never expose!
- **Note**: Voice cloning will be disabled if this key is not set

#### `SENTRY_DSN`
- **Description**: Sentry DSN for error tracking (Edge Functions)
- **Example**: `https://abc123@o123456.ingest.sentry.io/123456`
- **Required**: No
- **Security**: Safe to expose (public DSN)

#### `RECAPTCHA_PROJECT_ID`
- **Description**: Google Cloud project ID for reCAPTCHA Enterprise
- **Example**: `echo-garden-479222`
- **Where to Get**: Google Cloud Console → Project ID
- **Required**: Yes (for Enterprise verification)
- **Security**: ⚠️ **SECRET** - Keep in Supabase Edge Functions secrets
- **Note**: Used for Enterprise Assessment API calls

#### `RECAPTCHA_API_KEY`
- **Description**: Google Cloud API key for reCAPTCHA Enterprise Assessment API
- **Example**: `AIzaSyAbCdEfGhIjKlMnO-pQrStUvWxYz1234567`
- **Where to Get**: [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create API Key (see `GOOGLE_CLOUD_API_KEY_GUIDE.md`)
- **Required**: Yes (for Enterprise verification)
- **Security**: ⚠️ **SECRET** - Never expose! Keep in Supabase Edge Functions secrets
- **Note**: Must be restricted to "reCAPTCHA Enterprise API" for security

#### `RECAPTCHA_SITE_KEY`
- **Description**: reCAPTCHA Enterprise site key (for backend verification)
- **Example**: `6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf`
- **Required**: Yes (for Enterprise verification in backend)
- **Security**: Safe to expose (same as frontend site key)
- **Note**: Must match `VITE_RECAPTCHA_SITE_KEY` used in frontend

#### `RECAPTCHA_SECRET_KEY` (Legacy v2 - Optional Fallback)
- **Description**: reCAPTCHA v2 secret key (legacy, for backward compatibility)
- **Example**: `6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe`
- **Required**: No (only if not using Enterprise)
- **Security**: ⚠️ **SECRET** - Never expose!
- **Note**: System will use Enterprise if `RECAPTCHA_API_KEY` and `RECAPTCHA_PROJECT_ID` are set, otherwise falls back to v2

## 🔄 Development vs Production

### Development (.env)

```env
# Required
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=your-local-anon-key

# Optional
VITE_SENTRY_DSN=
VITE_RECAPTCHA_SITE_KEY=
```

### Production

Set in hosting dashboard (Vercel/Netlify):

```env
# Required
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-production-anon-key

# Optional
VITE_SENTRY_DSN=https://your-sentry-dsn
VITE_RECAPTCHA_SITE_KEY=your-recaptcha-key
VITE_FREEPIK_API_KEY=your-freepik-api-key
```

## 📍 Where to Set Variables

### Local Development

Create `.env` file in project root:

```bash
# .env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Note**: `.env` files should be in `.gitignore`!

### Vercel

1. Go to Project Settings → Environment Variables
2. Add variables for:
   - Production
   - Preview
   - Development
3. Redeploy after adding variables

### Netlify

1. Go to Site Settings → Environment Variables
2. Add variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_RECAPTCHA_SITE_KEY` (optional)
   - `VITE_FREEPIK_API_KEY` (optional - for avatar icons)
   - `VITE_SENTRY_DSN` (optional)
3. **Important**: Redeploy after adding/updating variables (Deploys → Trigger deploy)

### Supabase Edge Functions

1. Go to Project Settings → Edge Functions → Secrets
2. Add secrets
3. Secrets are automatically available to Edge Functions

## 🔒 Security Considerations

### Safe to Expose (Public)

These can be in client-side code:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (anon key only!)
- `VITE_SENTRY_DSN`
- `VITE_RECAPTCHA_SITE_KEY`

**⚠️ IMPORTANT**: All `VITE_*` variables are bundled into your JavaScript code and **visible to anyone** who views your site's source code. Never put truly secret keys here!

### Never Expose (Secret)

These must stay server-side:
- `SUPABASE_SERVICE_ROLE_KEY` ⚠️
- `OPENAI_API_KEY` ⚠️
- `RESEND_API_KEY` ⚠️
- `ELEVENLABS_API_KEY` ⚠️

### Best Practices

1. **Never commit `.env` files**
   - Add `.env` to `.gitignore`
   - Use `.env.example` for documentation

2. **Use different keys for dev/prod**
   - Separate Supabase projects
   - Different API keys

3. **Rotate keys regularly**
   - Especially service role keys
   - After security incidents

4. **Use environment-specific values**
   - Development: Local Supabase
   - Staging: Staging Supabase
   - Production: Production Supabase

5. **Validate variables on startup**
   ```typescript
   if (!import.meta.env.VITE_SUPABASE_URL) {
     throw new Error('VITE_SUPABASE_URL is required');
   }
   ```

## 📝 .env.example Template

Create `.env.example` (commit this, not `.env`):

```env
# Supabase (Required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Sentry (Optional)
VITE_SENTRY_DSN=

# reCAPTCHA (Optional)
VITE_RECAPTCHA_SITE_KEY=

# Freepik API (Optional - for avatar icons)
VITE_FREEPIK_API_KEY=
```

## 🔍 Verifying Variables

### Check Variables in Code

```typescript
// Check if variable is set
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);

// Validate required variables
const requiredVars = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
];

requiredVars.forEach(varName => {
  if (!import.meta.env[varName]) {
    console.error(`Missing required variable: ${varName}`);
  }
});
```

### Check in Browser

```javascript
// Browser console
console.log('Env vars:', {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  hasAnonKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
});
```

## 📚 Additional Resources

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Supabase Environment Variables](https://supabase.com/docs/guides/getting-started/local-development#environment-variables)
- [SECURITY.md](./SECURITY.md) - Security best practices

---

**Last Updated**: 2025-01-27

