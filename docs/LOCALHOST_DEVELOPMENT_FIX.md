# Fixing Localhost Development Issues

## 🚨 Common Issues on Localhost

### Issue 1: CORS Errors on Localhost

**Error:**
```
Access to fetch at 'https://...supabase.co/rest/v1/...' from origin 'http://localhost:8080' 
has been blocked by CORS policy
```

**Solution:**
The service worker has been updated to **skip intercepting requests on localhost**. 

**To apply the fix:**
1. **Unregister the service worker**:
   - Open DevTools → **Application** tab → **Service Workers**
   - Click **Unregister** for any registered service workers
   - Or click **Update** to force update

2. **Hard refresh** the page (Ctrl+Shift+R or Cmd+Shift+R)

3. The service worker will now automatically skip localhost requests

---

### Issue 2: reCAPTCHA Not Loading

**Warning:**
```
[OnboardingFlow] reCAPTCHA script did not load within timeout
```

**This is normal in development!** reCAPTCHA requires:
1. A site key set in environment variables
2. `localhost` registered in Google reCAPTCHA console

**Options:**

#### Option A: Skip reCAPTCHA in Development (Recommended)
- The app will work fine without reCAPTCHA
- reCAPTCHA is only required in production
- No action needed - the warning is harmless

#### Option B: Set Up reCAPTCHA for Localhost
1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Edit your reCAPTCHA site
3. Add `localhost` and `127.0.0.1` to the domains list
4. Create a `.env` file in your project root:
   ```env
   VITE_RECAPTCHA_SITE_KEY=your_site_key_here
   ```
5. Restart your dev server

---

## ✅ Quick Fixes

### Fix CORS Errors

1. **Unregister service worker**:
   ```
   DevTools → Application → Service Workers → Unregister
   ```

2. **Hard refresh**: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

3. **Clear cache**: DevTools → Application → Clear storage → Clear site data

### Fix reCAPTCHA Warnings

**Option 1: Ignore it** (recommended for development)
- The warning is harmless
- App works without reCAPTCHA

**Option 2: Set up reCAPTCHA**
- Add `localhost` to reCAPTCHA console
- Set `VITE_RECAPTCHA_SITE_KEY` in `.env`
- Restart dev server

---

## 🔍 Verify It's Working

### Check Service Worker
1. Open DevTools → **Application** → **Service Workers**
2. Should see: "No service workers are currently registered" (or updated one)
3. If old one is still there, click **Unregister**

### Check CORS
1. Open DevTools → **Network** tab
2. Make a request to Supabase
3. Should see successful response (no CORS errors)

### Check reCAPTCHA
1. If you set up reCAPTCHA, you should see the checkbox
2. If not, the warning is harmless - app still works

---

## 📝 Development vs Production

| Feature | Development (localhost) | Production |
|---------|------------------------|------------|
| **Service Worker** | Skipped automatically | Active |
| **reCAPTCHA** | Optional (warning if missing) | Required if configured |
| **CORS** | Handled by browser | Handled by service worker |

---

## 🐛 Still Having Issues?

### Service Worker Won't Unregister
1. Close all tabs with your app
2. Clear browser cache completely
3. Reopen the app

### CORS Still Failing
1. Check if service worker is still active
2. Try incognito/private browsing mode
3. Verify Supabase project is accessible

### reCAPTCHA Still Not Working
1. Check `.env` file exists and has `VITE_RECAPTCHA_SITE_KEY`
2. Verify `localhost` is in reCAPTCHA console
3. Restart dev server after adding env variable

---

**Last Updated**: 2025-01-XX

