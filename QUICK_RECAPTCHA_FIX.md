# Quick reCAPTCHA Fix for Localhost

## The Problem
reCAPTCHA Enterprise script is failing to load on localhost.

## Quick Fix (2 Steps)

### Step 1: Create `.env` File

Create a file named `.env` in the project root (same folder as `package.json`):

```env
VITE_RECAPTCHA_SITE_KEY=6LdrJBcsAAAAAKWjfoIW-YDTcHH9g9N5S2Zb8cYH
```

**⚠️ IMPORTANT:** Restart your dev server after creating/editing `.env` file!

### Step 2: Register Localhost Domains (No Ports!)

1. Go to: https://www.google.com/recaptcha/admin
2. Click on site key: `6LdrJBcsAAAAAKWjfoIW-YDTcHH9g9N5S2Zb8cYH`
3. Click **Settings** → **Domains**
4. Add these two domains (reCAPTCHA doesn't accept port numbers):
   ```
   localhost
   127.0.0.1
   ```
   **Note:** These work for ALL ports (8080, 5173, etc.). You don't need port-specific domains.
5. Click **Save**
6. **Wait 5-10 minutes**

## Verify It's Working

1. Restart dev server
2. Hard refresh: `Ctrl+Shift+R`
3. Check console - should see: `✅ reCAPTCHA Enterprise API is ready!`

## Still Not Working?

Open browser console and check what it says for:
- Site key (should show, not "NOT SET")
- Current domain (should show localhost)
- Full hostname (should show localhost:8080 or your port)

The console will tell you exactly what to add to reCAPTCHA console.

