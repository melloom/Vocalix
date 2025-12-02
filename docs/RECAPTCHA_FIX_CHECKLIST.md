# reCAPTCHA Fix Checklist

If you're seeing "reCAPTCHA unavailable", follow these steps in order:

## ✅ Step 1: Verify Environment Variable is Set

**For Netlify:**
1. Go to Netlify Dashboard → Your Site → Environment Variables
2. Check if `VITE_RECAPTCHA_SITE_KEY` exists
3. Verify it's set for **Production** environment (not just Preview/Development)
4. **Important:** After adding/changing, you must **Redeploy** your site

**To check if it's working:**
1. Open your site in browser
2. Press F12 → Console tab
3. Type: `console.log(import.meta.env.VITE_RECAPTCHA_SITE_KEY)`
4. Should show your site key (first 10 and last 4 characters), NOT `undefined`

---

## ✅ Step 2: Register Your Production Domain

**This is the #1 most common issue!**

1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Click on your reCAPTCHA site
3. Click **Settings** (gear icon) or scroll to **Domains** section
4. Add your production domain:
   - If your site is `echogarden.netlify.app`, add: `echogarden.netlify.app`
   - If you have a custom domain like `echogarden.com`, add: `echogarden.com` and `www.echogarden.com`
   - **Don't forget subdomains!** Add all variations you use
5. Click **Save**
6. **Wait 5-10 minutes** for changes to propagate globally
7. Clear browser cache (Ctrl+Shift+Delete) and hard refresh (Ctrl+Shift+R)

**Important:** You can use the same reCAPTCHA site for multiple domains. Just add all domains to the list.

---

## ✅ Step 3: Verify Site Key Matches

1. In Google reCAPTCHA Admin Console, find your **Site Key** (starts with `6L...`)
2. In your Netlify Environment Variables, verify `VITE_RECAPTCHA_SITE_KEY` matches exactly
3. Make sure there are no extra spaces or quotes

---

## ✅ Step 4: Check Browser Console for Errors

Open your site → Press F12 → Console tab → Look for:

### ✅ Good Signs:
- `[OnboardingFlow] ✅ reCAPTCHA already loaded`
- `[OnboardingFlow] reCAPTCHA script loaded successfully`

### ❌ Bad Signs:

**Error: "Invalid domain for site key"**
- **Fix:** Go to Step 2 - Add domain to reCAPTCHA console

**Error: "Failed to load reCAPTCHA script"**
- **Check:** Network tab → Look for blocked requests to `google.com` or `gstatic.com`
- **Fix:** Check if you have ad blockers or browser extensions blocking scripts

**Error: CSP (Content Security Policy) violation**
- The CSP is already configured correctly, but check:
  - Network tab → Look for CSP errors
  - Should allow: `https://www.google.com` and `https://www.gstatic.com`

**No errors, but reCAPTCHA still doesn't load**
- Check: Site key might be invalid
- Fix: Verify site key in Google console matches environment variable

---

## ✅ Step 5: Test the Fix

1. **Hard refresh** your browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Clear browser cache if needed
3. Go to the onboarding page
4. Check browser console (F12) for diagnostic messages
5. Look for reCAPTCHA widget to appear

---

## 🔧 Quick Diagnostic Commands

Open browser console (F12) and run:

```javascript
// Check if site key is set
console.log('Site Key:', import.meta.env.VITE_RECAPTCHA_SITE_KEY);

// Check current domain
console.log('Domain:', window.location.hostname);

// Check if reCAPTCHA script loaded
console.log('reCAPTCHA loaded:', typeof grecaptcha !== 'undefined');

// Check for reCAPTCHA scripts in page
console.log('Scripts:', document.querySelectorAll('script[src*="recaptcha"]').length);
```

---

## 📋 Common Issues Summary

| Issue | Symptom | Fix |
|-------|---------|-----|
| Domain not registered | "Invalid domain for site key" | Add domain to reCAPTCHA console |
| Environment variable missing | Site key shows as `undefined` | Set `VITE_RECAPTCHA_SITE_KEY` in Netlify |
| Site key mismatch | Works on one domain, not another | Verify site key matches Google console |
| Cache issue | Changes not showing | Hard refresh (Ctrl+Shift+R) |
| Propagation delay | Just added domain, not working | Wait 5-10 minutes after adding domain |

---

## 🆘 Still Not Working?

1. **Check the browser console** (F12 → Console) - it now shows detailed diagnostics
2. **Check Network tab** - look for failed requests to `google.com` or `gstatic.com`
3. **Try incognito/private mode** - rules out browser extensions
4. **Try different browser** - rules out browser-specific issues
5. **Check if working on localhost** - if yes, it's definitely a domain registration issue

---

## 💡 Pro Tips

- **You can use the same site key for dev and prod** - just add both domains to the reCAPTCHA console
- **After redeploying Netlify**, wait a few minutes for the new build to propagate
- **After adding domain to reCAPTCHA**, wait 5-10 minutes for Google's CDN to update
- **The app works fine without reCAPTCHA** - users can proceed without verification (shown in the error message)

---

## ✅ Verification Checklist

Before reporting the issue, verify:

- [ ] `VITE_RECAPTCHA_SITE_KEY` is set in Netlify environment variables
- [ ] Site has been redeployed after setting the variable
- [ ] Production domain is added to Google reCAPTCHA console
- [ ] Waited 5-10 minutes after adding domain
- [ ] Hard refreshed browser (Ctrl+Shift+R)
- [ ] Checked browser console for specific error messages
- [ ] Site key in Netlify matches site key in Google console

If all checked and still not working, check the browser console - it will show detailed diagnostics!

