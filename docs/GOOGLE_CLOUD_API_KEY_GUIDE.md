# How to Get Your Google Cloud API Key for reCAPTCHA Enterprise

## Step-by-Step Instructions

### Step 1: Go to Google Cloud Console
1. Open your browser and go to: **https://console.cloud.google.com/**
2. Make sure you're signed in with the Google account that has access to the `echo-garden-479222` project

### Step 2: Select Your Project
1. At the top of the page, click the project dropdown (next to "Google Cloud")
2. Select **"echo-garden-479222"** (or search for it if it's not visible)
3. If you don't see it, you may need to be added as a collaborator

### Step 3: Enable reCAPTCHA Enterprise API
1. In the left sidebar, click **"APIs & Services"** → **"Library"**
2. In the search bar, type: **"reCAPTCHA Enterprise API"**
3. Click on **"reCAPTCHA Enterprise API"** from the results
4. Click the **"Enable"** button
5. Wait for it to enable (usually takes a few seconds)

### Step 4: Create an API Key
1. Go to **"APIs & Services"** → **"Credentials"** (in the left sidebar)
2. Click the **"+ CREATE CREDENTIALS"** button at the top
3. Select **"API key"** from the dropdown
4. A popup will appear with your new API key
5. **Copy the API key** - it looks like: `AIzaSy...` (long string)
6. Click **"Close"** (don't restrict it yet, we'll do that next)

### Step 5: Restrict the API Key (IMPORTANT for Security)
1. In the Credentials page, find your newly created API key
2. Click on the API key name (or the edit icon/pencil)
3. Under **"API restrictions"**, select **"Restrict key"**
4. In the dropdown, check **"reCAPTCHA Enterprise API"**
5. Under **"Application restrictions"**, you can optionally:
   - Select **"HTTP referrers"** for web apps
   - Add your domain (e.g., `yourdomain.com/*`)
6. Click **"Save"** at the bottom

### Step 6: Save the API Key
- **Save this API key somewhere safe** - you'll need it for Supabase
- It should look like: `AIzaSyAbCdEfGhIjKlMnO-pQrStUvWxYz1234567`

## What to Do Next

1. **Copy your API key**
2. **Go to Supabase Dashboard**:
   - Navigate to your Supabase project
   - Go to **Edge Functions** → **Secrets**
   - Add a new secret:
     - **Name**: `RECAPTCHA_API_KEY`
     - **Value**: Your API key (the `AIzaSy...` string)
3. **Also add these secrets if not already present**:
   - `RECAPTCHA_PROJECT_ID` = `echo-garden-479222`
   - `RECAPTCHA_SITE_KEY` = `6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf`

## Troubleshooting

### "API key not valid" error
- Make sure the API key is copied correctly (no extra spaces)
- Verify the reCAPTCHA Enterprise API is enabled in your project
- Check that the API key is restricted to "reCAPTCHA Enterprise API"

### "Permission denied" error
- Make sure you have access to the `echo-garden-479222` project
- Verify you're using the correct Google account

### Can't find the project
- Ask the project owner to add you as a collaborator
- Or create a new project and set up reCAPTCHA Enterprise there

## Visual Guide

```
Google Cloud Console
├── Project: echo-garden-479222
├── APIs & Services
│   ├── Library
│   │   └── Enable "reCAPTCHA Enterprise API" ✅
│   └── Credentials
│       └── Create API Key
│           ├── Copy the key (AIzaSy...)
│           └── Restrict to "reCAPTCHA Enterprise API"
└── Use key in Supabase Edge Functions Secrets
```

## Quick Checklist

- [ ] Logged into Google Cloud Console
- [ ] Selected project: `echo-garden-479222`
- [ ] Enabled "reCAPTCHA Enterprise API"
- [ ] Created API key
- [ ] Restricted API key to "reCAPTCHA Enterprise API"
- [ ] Copied API key
- [ ] Added `RECAPTCHA_API_KEY` to Supabase Edge Functions Secrets
- [ ] Added `RECAPTCHA_PROJECT_ID` to Supabase Edge Functions Secrets
- [ ] Added `RECAPTCHA_SITE_KEY` to Supabase Edge Functions Secrets

Once you have the API key, the implementation I'm creating will work automatically!

