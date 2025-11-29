# reCAPTCHA Production Troubleshooting Guide

This guide helps you diagnose and fix reCAPTCHA issues in production.

## 🚨 Common Issues & Solutions

### Issue 1: reCAPTCHA Not Showing in Production

**Symptoms:**
- reCAPTCHA widget doesn't appear on the account creation page
- Console shows: "Invalid domain for site key" or similar errors
- reCAPTCHA shows error state

**Causes & Solutions:**

#### ✅ Solution 1: Add Production Domain to reCAPTCHA Site

**This is the #1 most common issue!**

1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Click on your reCAPTCHA site
3. Click **Settings** (gear icon)
4. Scroll to **Domains** section
5. Add your production domain(s):
   - `yourdomain.com`
   - `www.yourdomain.com`
   - Any subdomains you use
6. Click **Save**
7. **Wait 5-10 minutes** for changes to propagate
8. Clear browser cache and test again

**Important:** You can add multiple domains to the same reCAPTCHA site. You don't need separate sites for dev/prod.

#### ✅ Solution 2: Verify Environment Variable is Set

**Frontend Environment Variable:**

1. Check your hosting platform (Vercel/Netlify/etc.):
   - **Vercel**: Project Settings → Environment Variables
   - **Netlify**: Site Settings → Environment Variables
2. Verify `VITE_RECAPTCHA_SITE_KEY` is set for **Production** environment
3. **Redeploy** after adding/updating the variable
4. Verify the variable is available at build time (not runtime)

**To verify it's set:**
- Check browser console for: `console.log(import.meta.env.VITE_RECAPTCHA_SITE_KEY)`
- Should show your site key (not `undefined`)

#### ✅ Solution 3: Check Browser Console Errors

Open browser DevTools → Console and look for:
- `Invalid domain for site key` → Domain not registered
- `Failed to load reCAPTCHA script` → Network/CSP issue
- `reCAPTCHA script did not load within timeout` → Script loading issue

---

### Issue 2: reCAPTCHA Verification Failing

**Symptoms:**
- User completes reCAPTCHA but gets "verification failed" error
- Account creation fails with reCAPTCHA error
- Error in Supabase Edge Function logs

**Causes & Solutions:**

#### ✅ Solution 1: Verify Secret Key is Set in Supabase

1. Go to your **Supabase Dashboard**
2. Navigate to **Project Settings** → **Edge Functions** → **Secrets**
3. Verify `RECAPTCHA_SECRET_KEY` exists and is set correctly
4. The value should match the **Secret Key** from Google reCAPTCHA console

**To set it via CLI:**
```bash
supabase secrets set RECAPTCHA_SECRET_KEY=your_secret_key_here --project-ref your-project-ref
```

**To set it via Dashboard:**
1. Go to **Settings** → **Edge Functions** → **Secrets**
2. Click **Add Secret**
3. Name: `RECAPTCHA_SECRET_KEY`
4. Value: Your secret key from Google
5. Click **Save**

#### ✅ Solution 2: Check Supabase Edge Function Logs

1. Go to **Supabase Dashboard** → **Edge Functions** → **Logs**
2. Look for errors containing:
   - `recaptcha_failed`
   - `recaptcha_verification`
   - `invalid-input-secret`
   - `invalid-input-response`

**Common Error Codes:**
- `invalid-input-secret` → Secret key is wrong or not set
- `invalid-input-response` → Token is invalid/expired
- `timeout-or-duplicate` → Token was already used or expired
- `bad-request` → Request format issue

#### ✅ Solution 3: Verify Site Key and Secret Key Match

**Critical:** The site key and secret key must be from the **same reCAPTCHA site**!

1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Click on your site
3. Verify:
   - **Site Key** matches `VITE_RECAPTCHA_SITE_KEY` in frontend
   - **Secret Key** matches `RECAPTCHA_SECRET_KEY` in Supabase
4. If they don't match, update one or both to use the same site

---

### Issue 3: reCAPTCHA Works Locally But Not in Production

**Symptoms:**
- Works perfectly on `localhost`
- Fails in production
- No errors in console

**Causes & Solutions:**

#### ✅ Solution 1: Environment Variable Not Set in Production

**Most common cause!**

1. Check if `VITE_RECAPTCHA_SITE_KEY` is set in production environment
2. Vite environment variables must be set **at build time**, not runtime
3. **Redeploy** after setting the variable

**Vercel:**
```bash
# Set in dashboard or via CLI
vercel env add VITE_RECAPTCHA_SITE_KEY production
```

**Netlify:**
```bash
# Set in dashboard or via CLI
netlify env:set VITE_RECAPTCHA_SITE_KEY your_key production
```

#### ✅ Solution 2: Production Domain Not Added

Even if it works on localhost, production domain must be added:

1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Add your production domain to the site
3. Wait 5-10 minutes for propagation

#### ✅ Solution 3: Different Keys for Dev/Prod

If you're using different keys:
- Verify production site key is set in production environment
- Verify production secret key is set in production Supabase project

---

### Issue 4: reCAPTCHA Script Loading Errors

**Symptoms:**
- "reCAPTCHA script failed to load"
- Network errors in console
- CSP (Content Security Policy) errors

**Causes & Solutions:**

#### ✅ Solution 1: Check Content Security Policy

If you have CSP headers, ensure they allow:
- `https://www.google.com`
- `https://www.gstatic.com`

**Example CSP header:**
```
script-src 'self' https://www.google.com https://www.gstatic.com;
frame-src 'self' https://www.google.com;
```

#### ✅ Solution 2: Check Network/Firewall

- Ensure production server can reach `https://www.google.com`
- Check if corporate firewall blocks Google domains
- Verify DNS resolution works

#### ✅ Solution 3: Check Browser Compatibility

- Ensure browser supports reCAPTCHA
- Try different browsers
- Check for browser extensions blocking scripts

---

## 🔍 Diagnostic Steps

### Step 1: Verify Frontend Configuration

1. Open production site in browser
2. Open DevTools → Console
3. Run: `console.log(import.meta.env.VITE_RECAPTCHA_SITE_KEY)`
4. Should show your site key (not `undefined`)

### Step 2: Verify reCAPTCHA Site Configuration

1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Click on your site
3. Verify:
   - ✅ Production domain is in the domains list
   - ✅ Site key matches frontend environment variable
   - ✅ Secret key matches Supabase secret

### Step 3: Verify Supabase Configuration

1. Go to Supabase Dashboard → Edge Functions → Secrets
2. Verify `RECAPTCHA_SECRET_KEY` exists
3. Check Edge Function logs for errors

### Step 4: Test reCAPTCHA Verification

1. Try creating an account in production
2. Complete reCAPTCHA
3. Check browser console for errors
4. Check Supabase Edge Function logs for errors

---

## 📋 Production Checklist

Before deploying to production, verify:

- [ ] Production domain added to reCAPTCHA site in Google console
- [ ] `VITE_RECAPTCHA_SITE_KEY` set in production environment (hosting platform)
- [ ] `RECAPTCHA_SECRET_KEY` set in production Supabase project
- [ ] Site key and secret key are from the same reCAPTCHA site
- [ ] Environment variables are set **before** building/deploying
- [ ] Redeployed after setting environment variables
- [ ] Tested account creation flow in production
- [ ] Checked browser console for errors
- [ ] Checked Supabase Edge Function logs for errors

---

## 🛠️ Quick Fixes

### Fix 1: Add Domain to reCAPTCHA Site

```bash
# 1. Go to https://www.google.com/recaptcha/admin
# 2. Click your site → Settings
# 3. Add production domain
# 4. Save and wait 5-10 minutes
```

### Fix 2: Set Environment Variables

**Vercel:**
```bash
vercel env add VITE_RECAPTCHA_SITE_KEY production
# Enter your site key when prompted
vercel --prod  # Redeploy
```

**Netlify:**
```bash
netlify env:set VITE_RECAPTCHA_SITE_KEY your_key production
netlify deploy --prod  # Redeploy
```

**Supabase:**
```bash
supabase secrets set RECAPTCHA_SECRET_KEY=your_secret_key --project-ref your-ref
```

### Fix 3: Verify Keys Match

1. Get site key from Google console
2. Get secret key from Google console
3. Verify frontend uses site key
4. Verify Supabase uses secret key
5. Both must be from the same reCAPTCHA site!

---

## 🐛 Error Code Reference

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `invalid-input-secret` | Secret key is wrong | Check `RECAPTCHA_SECRET_KEY` in Supabase |
| `invalid-input-response` | Token invalid/expired | User needs to complete reCAPTCHA again |
| `timeout-or-duplicate` | Token already used | Reset reCAPTCHA and try again |
| `bad-request` | Request format issue | Check Edge Function code |
| `missing-input-secret` | Secret key not set | Set `RECAPTCHA_SECRET_KEY` in Supabase |
| `missing-input-response` | Token not provided | Check frontend sends token |

---

## 📞 Still Having Issues?

1. **Check Supabase Edge Function logs** for detailed error messages
2. **Check browser console** for frontend errors
3. **Verify all environment variables** are set correctly
4. **Test with a fresh browser session** (incognito mode)
5. **Wait 5-10 minutes** after making changes to reCAPTCHA site settings

---

## 🔗 Useful Links

- [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
- [reCAPTCHA Documentation](https://developers.google.com/recaptcha/docs/display)
- [Supabase Edge Functions Secrets](https://supabase.com/docs/guides/functions/secrets)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Netlify Environment Variables](https://docs.netlify.com/environment-variables/overview/)

---

**Last Updated**: 2025-01-XX

