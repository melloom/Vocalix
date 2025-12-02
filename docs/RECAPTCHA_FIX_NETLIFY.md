# Fix reCAPTCHA After Updating Key in Netlify

## Current Issue

You're seeing:
- Error: `6LdNCRwsAAAAAAE...` (old/wrong key)
- 400 error from account-creation endpoint
- Domain registration warnings

## Root Cause

1. **Key Mismatch**: Netlify environment variable not updated or site not redeployed
2. **API Mismatch**: Frontend uses v3 API, backend expects Enterprise
3. **Domain Not Registered**: localhost/127.0.0.1 not added to reCAPTCHA console

## Step-by-Step Fix

### Step 1: Update Netlify Environment Variable

1. Go to **Netlify Dashboard** → Your Site → **Environment Variables**
2. Find `VITE_RECAPTCHA_SITE_KEY`
3. **Update the value** to: `6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf`
4. Make sure it's set for **Production** environment (not just Preview)
5. **Click Save**

### Step 2: Redeploy Your Site

**CRITICAL**: After updating the environment variable, you MUST redeploy:

1. Go to **Deploys** tab in Netlify
2. Click **"Trigger deploy"** → **"Deploy site"**
3. Wait for deployment to complete (2-5 minutes)

**OR** if you have Git connected:
- Make a small commit and push to trigger a new deployment

### Step 3: Register Domains in reCAPTCHA Console

1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Click on your site key: `6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf`
3. Scroll to **"Domains"** section
4. Click **"Add domain"** and add:
   - `localhost` (NO port number)
   - `127.0.0.1` (NO port number)
   - Your production domain (e.g., `your-site.netlify.app`)
5. Click **Save**
6. **Wait 5-10 minutes** for changes to propagate

### Step 4: Verify Key Type

**Check if your key is v3 or Enterprise:**

1. In reCAPTCHA console, look at your site key type
2. **If it's v3**: The current code should work (uses `grecaptcha.execute()`)
3. **If it's Enterprise**: You need to update the frontend code to use `grecaptcha.enterprise.execute()`

### Step 5: Update Backend Configuration (If Using Enterprise)

If your key is **Enterprise**, you need to set these in **Supabase Edge Functions Secrets**:

1. Go to Supabase Dashboard → Your Project → **Edge Functions** → **Secrets**
2. Set these secrets:
   - `RECAPTCHA_PROJECT_ID` = `echo-garden-479222` (or your project ID)
   - `RECAPTCHA_API_KEY` = Your Google Cloud API key (starts with `AIzaSy...`)
   - `RECAPTCHA_SITE_KEY` = `6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf`

**If your key is v3**, the backend will fall back to v2 API (if `RECAPTCHA_SECRET_KEY` is set).

## Quick Verification

After redeploying, check in browser console:

```javascript
console.log(import.meta.env.VITE_RECAPTCHA_SITE_KEY)
```

Should show: `6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf`

If it shows `undefined` or the old key:
- Environment variable not set correctly
- Site not redeployed after setting variable

## Common Issues

### Issue: Still seeing old key after redeploy

**Solution:**
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh (Ctrl+Shift+R)
3. Check Netlify build logs to verify env var is being used

### Issue: 400 error from backend

**Possible causes:**
1. Backend expects Enterprise but frontend sends v3 token
2. Domain not registered in reCAPTCHA console
3. Backend secrets not configured correctly

**Solution:**
- If using v3 key: Make sure `RECAPTCHA_SECRET_KEY` is set in Supabase
- If using Enterprise: Make sure `RECAPTCHA_API_KEY` and `RECAPTCHA_PROJECT_ID` are set

### Issue: "Invalid domain" error

**Solution:**
- Add your domain to reCAPTCHA console (Step 3 above)
- Wait 5-10 minutes after adding
- Clear browser cache

## Next Steps

1. ✅ Update `VITE_RECAPTCHA_SITE_KEY` in Netlify
2. ✅ Redeploy site
3. ✅ Register domains in reCAPTCHA console
4. ✅ Verify key type (v3 vs Enterprise)
5. ✅ Configure backend secrets accordingly
6. ✅ Test account creation

After completing these steps, the reCAPTCHA should work correctly!

