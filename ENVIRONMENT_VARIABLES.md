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
- **Description**: Google reCAPTCHA site key
- **Example**: `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI`
- **Where to Get**: [Google reCAPTCHA Admin](https://www.google.com/recaptcha/admin)
- **Required**: No
- **Default**: None
- **Security**: Safe to expose (public key)

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

#### `SENTRY_DSN`
- **Description**: Sentry DSN for error tracking (Edge Functions)
- **Example**: `https://abc123@o123456.ingest.sentry.io/123456`
- **Required**: No
- **Security**: Safe to expose (public DSN)

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
2. Add variables
3. Redeploy after adding variables

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

### Never Expose (Secret)

These must stay server-side:
- `SUPABASE_SERVICE_ROLE_KEY` ⚠️
- `OPENAI_API_KEY` ⚠️
- `RESEND_API_KEY` ⚠️

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

