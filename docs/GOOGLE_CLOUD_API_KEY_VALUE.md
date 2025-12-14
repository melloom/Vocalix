# What Value Should the Google Cloud API Key Be?

## Quick Answer

The Google Cloud API Key is **DIFFERENT** from your reCAPTCHA Site Key!

- **Site Key** (Frontend): `6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf` ← This is public, goes in Netlify
- **API Key** (Backend): `AIzaSy...` ← This is secret, goes in Supabase

## Step-by-Step: Get Your Google Cloud API Key

### 1. Go to Google Cloud Console
👉 **https://console.cloud.google.com/**

### 2. Select Your Project
- Click the project dropdown at the top
- Select **"echo-garden-479222"**

### 3. Enable reCAPTCHA Enterprise API
1. Go to **"APIs & Services"** → **"Library"** (left sidebar)
2. Search for: **"reCAPTCHA Enterprise API"**
3. Click on it
4. Click **"Enable"**
5. Wait a few seconds for it to enable

### 4. Create API Key
1. Go to **"APIs & Services"** → **"Credentials"** (left sidebar)
2. Click **"+ CREATE CREDENTIALS"** button at the top
3. Select **"API key"**
4. A popup will show your new API key
5. **Copy it** - it looks like: `AIzaSyAbCdEfGhIjKlMnO-pQrStUvWxYz1234567`

### 5. Restrict the API Key (IMPORTANT!)
1. Click on the API key name (or edit icon)
2. Under **"API restrictions"**:
   - Select **"Restrict key"**
   - Check **"reCAPTCHA Enterprise API"** ✅
3. Click **"Save"**

## Where to Put the Values

### Frontend (Netlify Environment Variables)
```
VITE_RECAPTCHA_SITE_KEY = 6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf
```
👉 This is your **Site Key** (public, can be exposed)

### Backend (Supabase Edge Functions Secrets)
```
RECAPTCHA_PROJECT_ID = echo-garden-479222
RECAPTCHA_API_KEY = AIzaSy... (your API key from step 4)
RECAPTCHA_SITE_KEY = 6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf
```
👉 These are **secrets** (must not be exposed)

## Summary

| Variable | Value | Where | Example |
|----------|-------|-------|---------|
| `VITE_RECAPTCHA_SITE_KEY` | Site Key | Netlify (frontend) | `6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf` |
| `RECAPTCHA_API_KEY` | API Key | Supabase (backend) | `AIzaSyAbCdEfGhIjKlMnO-pQrStUvWxYz1234567` |
| `RECAPTCHA_PROJECT_ID` | Project ID | Supabase (backend) | `echo-garden-479222` |
| `RECAPTCHA_SITE_KEY` | Site Key | Supabase (backend) | `6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf` |

## Important Notes

1. **Site Key** = Public key, safe to expose in frontend code
2. **API Key** = Secret key, must be kept in backend only
3. The API Key starts with `AIzaSy` (Google Cloud format)
4. The Site Key starts with `6Lfb` (reCAPTCHA format)
5. **Never put the API Key in Netlify!** It must only be in Supabase secrets.

## Visual Guide

```
Google Cloud Console
└── echo-garden-479222 (Project)
    ├── APIs & Services
    │   ├── Library
    │   │   └── reCAPTCHA Enterprise API ✅ (Enable this)
    │   └── Credentials
    │       └── + CREATE CREDENTIALS → API key
    │           └── Copy: AIzaSy... ← This is your API KEY
    │
    └── Use in:
        ├── Supabase Secrets: RECAPTCHA_API_KEY = AIzaSy...
        └── Netlify Env Var: VITE_RECAPTCHA_SITE_KEY = 6Lfb...
```

That's it! The API Key is the one you create in Google Cloud Console, and it's completely different from the Site Key.

