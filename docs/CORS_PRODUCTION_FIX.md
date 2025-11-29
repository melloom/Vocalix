# Fixing CORS Errors in Production

## 🚨 The Problem

You're seeing this error:
```
Access to fetch at 'https://xgblxtopsapvacyaurcr.supabase.co/rest/v1/rpc/get_spotlight_question' 
from origin 'https://echogarden.netlify.app' has been blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

**What this means:** Supabase is blocking requests from your production domain because it's not in the allowed origins list.

---

## ✅ Solution: Service Worker CORS Fix

**The Real Issue:** The error mentions `sw.js:487` - this is your **service worker**! Service workers can interfere with CORS if they don't properly preserve CORS headers when intercepting fetch requests.

**I've fixed the service worker** to properly handle CORS for Supabase API requests. Here's what was changed:

### Step 1: Deploy the Fixed Service Worker

The service worker has been updated to properly handle CORS. You need to:

1. **Deploy the updated `public/sw.js` file** to your production site
2. **Clear the service worker cache** on your production site:
   - Open DevTools → **Application** tab → **Service Workers**
   - Click **Unregister** for any registered service workers
   - Or click **Update** to force update

### Step 2: Hard Refresh Your Site

After deploying:

1. **Hard refresh** your production site (Ctrl+Shift+R or Cmd+Shift+R)
2. The new service worker will be installed automatically
3. The CORS error should be resolved!

### What Was Fixed?

The service worker was intercepting Supabase API requests but not preserving CORS headers. The fix:
- Explicitly sets `mode: 'cors'` on fetch requests
- Preserves all request headers
- Properly handles both GET and POST requests to Supabase

### Alternative: Temporarily Disable Service Worker

If you need a quick fix while deploying:

1. **Unregister the service worker**:
   - Open DevTools → **Application** → **Service Workers**
   - Click **Unregister**
2. **Hard refresh** the page
3. The app will work without the service worker (but offline features won't work)

---

## 📋 Complete CORS Configuration

Here's what your **Allowed CORS Origins** should look like:

```
https://echogarden.netlify.app,https://echogarden.app,https://www.echogarden.app,http://localhost:8080,http://localhost:5173
```

**Important Notes:**
- ✅ Include protocol (`https://` or `http://`)
- ✅ Include port number for localhost (`:8080`, `:5173`)
- ✅ Separate multiple domains with commas
- ✅ No trailing slashes
- ❌ Don't use wildcards like `*` in production (security risk)

---

## 🔍 Verify It's Working

### Check Browser Console

1. Open your production site
2. Open DevTools → Console
3. Look for the `get_spotlight_question` call
4. Should see successful response (no CORS errors)

### Check Network Tab

1. Open DevTools → Network
2. Filter by "get_spotlight_question"
3. Click on the request
4. Check **Response Headers**:
   - Should see: `Access-Control-Allow-Origin: https://echogarden.netlify.app`

---

## 🐛 Still Having Issues?

### Issue 1: Changes Not Taking Effect

**Solution:**
- Clear browser cache completely
- Try incognito/private browsing mode
- Wait 1-2 minutes (changes are usually instant, but can take a moment)

### Issue 2: Multiple Domains Not Working

**Solution:**
- Make sure domains are separated by commas
- No spaces around commas
- Each domain must include protocol (`https://`)

### Issue 3: Localhost Still Not Working

**Solution:**
- Make sure you included the port number: `http://localhost:8080`
- Try both `localhost` and `127.0.0.1`
- Check if your dev server is running on a different port

### Issue 4: Custom Domain Not Working

**Solution:**
- Verify your custom domain is correctly configured
- Make sure you added both `https://echogarden.app` and `https://www.echogarden.app`
- Check DNS settings if using a custom domain

---

## 🔒 Security Best Practices

### ✅ DO:
- Add only your actual production domains
- Include localhost for development
- Use HTTPS for production domains
- Keep the list minimal (only what you need)

### ❌ DON'T:
- Use `*` wildcard in production (security risk)
- Add domains you don't control
- Forget to update when adding new domains
- Use HTTP for production (use HTTPS)

---

## 📝 Quick Reference

**Supabase Dashboard Path:**
```
Settings → API → CORS Configuration → Allowed CORS Origins
```

**Your Production Domain:**
```
https://echogarden.netlify.app
```

**Common Localhost Ports:**
```
http://localhost:8080  (Vite default)
http://localhost:5173  (Vite dev server)
http://localhost:3000  (Create React App)
http://127.0.0.1:8080   (Alternative localhost)
```

---

## 🎯 What This Fixes

After adding your domain to CORS settings, these will work:
- ✅ RPC function calls (`get_spotlight_question`, etc.)
- ✅ Database queries from frontend
- ✅ Real-time subscriptions
- ✅ Storage operations
- ✅ Auth operations

---

## 🔗 Related Issues

If you're also having issues with:
- **reCAPTCHA**: See [RECAPTCHA_PRODUCTION_TROUBLESHOOTING.md](./RECAPTCHA_PRODUCTION_TROUBLESHOOTING.md)
- **Environment Variables**: See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md)
- **General Production Issues**: See [DEPLOYMENT.md](./DEPLOYMENT.md)

---

**Last Updated**: 2025-01-XX

