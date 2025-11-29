# Fix reCAPTCHA Enterprise on Localhost

## Current Issue
reCAPTCHA Enterprise script is failing to load on localhost.

## Quick Fix Steps

### Step 1: Create `.env` File

1. Create a file named `.env` in the project root (same folder as `package.json`)
2. Add this line:
   ```env
   VITE_RECAPTCHA_SITE_KEY=6LdrJBcsAAAAAKWjfoIW-YDTcHH9g9N5S2Zb8cYH
   ```
3. **Restart your dev server** - Vite requires a restart to load .env changes

### Step 2: Register Localhost Domains

Go to: https://www.google.com/recaptcha/admin

1. Click on your site key: `6LdrJBcsAAAAAKWjfoIW-YDTcHH9g9N5S2Zb8cYH`
2. Click **Settings** (gear icon) → **Domains**
3. Add **ALL** of these (check what port you're using in your browser URL):
   ```
   localhost
   127.0.0.1
   localhost:8080
   127.0.0.1:8080
   ```
   (If you're using a different port like 5173, add those too)
4. Click **Save**
5. **Wait 5-10 minutes** for changes to propagate

### Step 3: Verify It's Working

1. Restart your dev server after creating `.env`
2. Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
3. Check browser console - should see:
   ```
   [OnboardingFlow] ✅ reCAPTCHA Enterprise API is ready!
   ```

### Step 4: Test Script URL

Open this URL directly in your browser:
```
https://www.google.com/recaptcha/enterprise.js?render=6LdrJBcsAAAAAKWjfoIW-YDTcHH9g9N5S2Zb8cYH
```

- **If it loads JavaScript code**: Script works, issue is domain registration
- **If you get an error**: Check site key or network issues

## Still Not Working?

Check browser console for these messages:
- "Site key: NOT SET" → `.env` file missing or wrong
- "Failed to load reCAPTCHA Enterprise script" → Domain not registered
- Check Network tab → Look for blocked request to `google.com/recaptcha/enterprise.js`
