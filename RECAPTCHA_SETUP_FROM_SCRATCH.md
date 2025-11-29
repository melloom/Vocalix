# reCAPTCHA Setup from Scratch - Step by Step

## Step 1: Create a reCAPTCHA Key

1. Go to: https://www.google.com/recaptcha/admin/create
2. Sign in with your Google account
3. Fill out the form:
   - **Label**: `Echo Garden` (or any name you want)
   - **reCAPTCHA type**: Select **"reCAPTCHA v3"**
     - This is the invisible, score-based version (recommended)
     - **Important:** Choose v3, NOT Enterprise (v3 doesn't need Google Cloud!)
   - **Domains**: Add these (we'll add more later):
     - `localhost`
     - `127.0.0.1`
   - Accept the terms
4. Click **Submit**

## Step 2: Copy Your Keys

After creating, you'll see two keys:

1. **Site Key** (public, for frontend)
   - Starts with `6L...`
   - Copy this - you'll need it

2. **Secret Key** (private, for backend)
   - Starts with `6L...`
   - Copy this - you'll need it for Supabase

**📝 Save these keys somewhere safe!**

## Step 3: Add Domain to reCAPTCHA (if not already added)

1. Go to: https://www.google.com/recaptcha/admin
2. Click on your site key
3. Click **Settings** (gear icon)
4. Scroll to **Domains** section
5. Make sure you have:
   - `localhost`
   - `127.0.0.1`
   - (Add your production domain later: `echogarden.netlify.app` or your custom domain)
6. Click **Save**
7. **Wait 5-10 minutes** for changes to propagate

## Step 4: Create .env File for Local Development

1. In your project root (same folder as `package.json`), create a file named `.env`
2. Add this line (use your Site Key from Step 2):
   ```env
   VITE_RECAPTCHA_SITE_KEY=YOUR_SITE_KEY_HERE
   ```
   
   Example:
   ```env
   VITE_RECAPTCHA_SITE_KEY=6LdrJBcsAAAAAKWjfoIW-YDTcHH9g9N5S2Zb8cYH
   ```
   
3. Save the file

## Step 5: Restart Your Dev Server

⚠️ **IMPORTANT:** Vite needs to restart to load the `.env` file!

1. Stop your dev server (Ctrl+C)
2. Start it again:
   ```bash
   npm run dev
   ```

## Step 6: Add Secret Key to Supabase (Backend)

1. Go to your Supabase Dashboard
2. Go to **Project Settings** → **Edge Functions** → **Secrets**
3. Click **Add a new secret**
4. Add:
   - **Name**: `RECAPTCHA_SECRET_KEY`
   - **Value**: Your Secret Key from Step 2
5. Click **Save**

## Step 7: Update Code to Use v3

The code currently uses Enterprise, but v3 is simpler and works the same way. 

**After you create your v3 key, tell me and I'll:**
- Update the code to use v3 (takes 2 minutes)
- Switch from Enterprise script to v3 script
- Update the API calls

**For now, just create the v3 key in Step 1!**

## Step 8: Test It

1. Go to your onboarding page
2. Fill out the form
3. Submit it
4. Open browser console (F12)
5. Look for: `✅ reCAPTCHA token obtained`

## Step 9: Add Production Domain (Later)

When you're ready to deploy:

1. Go to reCAPTCHA admin: https://www.google.com/recaptcha/admin
2. Click your site key
3. Add your production domain (e.g., `echogarden.netlify.app`)
4. Add the Site Key to Netlify environment variables:
   - Netlify Dashboard → Site Settings → Environment Variables
   - Add: `VITE_RECAPTCHA_SITE_KEY` = your site key

---

## Quick Checklist

- [ ] Created reCAPTCHA key (v3 or Enterprise)
- [ ] Copied Site Key and Secret Key
- [ ] Added `localhost` and `127.0.0.1` to domains
- [ ] Created `.env` file with `VITE_RECAPTCHA_SITE_KEY`
- [ ] Restarted dev server
- [ ] Added Secret Key to Supabase secrets
- [ ] Tested form submission

---

## Need Help?

**What type of key did you create?** (v3 or Enterprise)
- If v3, I'll update the code to use v3
- If Enterprise, we'll need Google Cloud API key setup

Let me know and I'll help you complete the setup!

