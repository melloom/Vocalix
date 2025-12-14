# reCAPTCHA Enterprise Script Loading Issues

## Problem
The reCAPTCHA Enterprise script is failing to load, showing:
```
[OnboardingFlow] ❌ Failed to load reCAPTCHA Enterprise script
```

## Causes & Solutions

### 1. Domain Not Registered (Most Common)
**Problem:** Your domain isn't registered in the reCAPTCHA Enterprise console.

**Solution:**
1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Click on your reCAPTCHA site key
3. Go to **Settings** → **Domains**
4. Add your domain (e.g., `echogarden.netlify.app` or your custom domain)
5. **Wait 5-10 minutes** for changes to propagate
6. Try again

### 2. Site Key Not Set in Environment Variables
**Problem:** `VITE_RECAPTCHA_SITE_KEY` is not set in Netlify.

**Solution:**
1. Go to Netlify Dashboard → Your Site → **Environment Variables**
2. Add/Update:
   - **Key**: `VITE_RECAPTCHA_SITE_KEY`
   - **Value**: `6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf`
3. **Redeploy** your site

### 3. Content Security Policy (CSP) Blocking
**Problem:** Your site's CSP is blocking Google scripts.

**Check:**
- Look for CSP errors in browser console
- Check Network tab for blocked requests to `google.com` or `gstatic.com`

**Solution:**
Add to your CSP headers (if you have them):
```
script-src 'self' https://www.google.com https://www.gstatic.com;
frame-src 'self' https://www.google.com;
```

### 4. Network/Ad Blocker
**Problem:** Browser extensions or network filters blocking Google.

**Solution:**
- Disable ad blockers temporarily to test
- Check browser console for blocked requests
- Try in incognito mode

### 5. Invalid Site Key
**Problem:** Site key doesn't match your reCAPTCHA configuration.

**Solution:**
1. Verify site key in [reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Make sure you're using the **Enterprise** site key, not v2 or v3
3. Update `VITE_RECAPTCHA_SITE_KEY` if wrong

## Quick Diagnostic Steps

1. **Check if site key is set:**
   - Open browser console
   - Type: `import.meta.env.VITE_RECAPTCHA_SITE_KEY` (should show your key)
   - Or check Netlify environment variables

2. **Check if script is loading:**
   - Open Network tab in browser DevTools
   - Look for request to `recaptcha/enterprise.js`
   - Check if it's being blocked or returning 404/403

3. **Check domain registration:**
   - Go to reCAPTCHA Admin Console
   - Verify your production domain is listed
   - If not, add it and wait 5-10 minutes

4. **Check browser console errors:**
   - Look for specific error messages
   - Check for CSP violations
   - Check for network errors

## What Happens When Enterprise Fails?

**Good news:** The app is designed to work without reCAPTCHA!

- Account creation will still work
- Backend validation will skip reCAPTCHA if token is missing
- You'll see a warning but can still create accounts

**However:** This means no bot protection, so you should fix it for production.

## Testing After Fix

1. Clear browser cache
2. Hard refresh (Ctrl+Shift+R)
3. Open browser console
4. Try to create an account
5. Look for: `[OnboardingFlow] ✅ reCAPTCHA Enterprise script loaded`

If you see that message, Enterprise is working! ✅

## Still Not Working?

If after trying all these steps Enterprise still doesn't load:

1. **Check reCAPTCHA Enterprise API is enabled** in Google Cloud Console
2. **Verify site key type** - must be Enterprise (score-based), not v2 or v3
3. **Check project ID** matches: `echo-garden-479222`
4. **Try a different browser** to rule out browser-specific issues
5. **Check Netlify logs** for any deployment/build issues

The most common issue is **domain not registered** - make sure your domain is in the reCAPTCHA console!

