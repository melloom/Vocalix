# reCAPTCHA Production Fix Summary

This document summarizes the fixes applied to resolve reCAPTCHA issues in production.

## Issues Fixed

### 1. Removed Hardcoded Enterprise Script from index.html
**Problem:** `index.html` had a hardcoded reCAPTCHA Enterprise script with a hardcoded site key that didn't match the component's v2 implementation.

**Fix:** Removed the hardcoded script. The `react-google-recaptcha` component now loads the script dynamically based on the `VITE_RECAPTCHA_SITE_KEY` environment variable.

**File Changed:** `index.html`

### 2. Added Backend Validation with reCAPTCHA Token
**Problem:** The component collected the reCAPTCHA token but never sent it to the backend for verification.

**Fix:** Added a call to the `validate-account-creation` edge function before profile creation. This ensures:
- reCAPTCHA token is verified on the backend
- Rate limiting is enforced
- Handle availability is double-checked
- Bot detection runs

**File Changed:** `src/components/OnboardingFlow.tsx`

### 3. Improved Error Handling
**Problem:** Missing proper error handling for validation failures and edge function unavailability.

**Fix:** Added comprehensive error handling that:
- Gracefully handles 404 errors (if edge function doesn't exist)
- Provides clear error messages for reCAPTCHA failures
- Resets reCAPTCHA widget on token expiration
- Allows graceful degradation in development

## What to Verify in Production

### 1. Environment Variables
Ensure these are set in your production environment:

**Frontend (Vercel/Netlify/etc.):**
- `VITE_RECAPTCHA_SITE_KEY` - Your reCAPTCHA v2 site key

**Supabase:**
- `RECAPTCHA_SECRET_KEY` - Your reCAPTCHA secret key (must match the site key)

### 2. reCAPTCHA Site Configuration
1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Verify your production domain is added to the allowed domains list
3. Ensure you're using **reCAPTCHA v2** ("I'm not a robot" Checkbox), not Enterprise
4. Verify the site key matches `VITE_RECAPTCHA_SITE_KEY`
5. Verify the secret key matches `RECAPTCHA_SECRET_KEY` in Supabase

### 3. Edge Function Deployment
Ensure the `validate-account-creation` edge function is deployed:
- The function should be at: `supabase/functions/validate-account-creation/`
- Deploy it using: `supabase functions deploy validate-account-creation`

### 4. Testing in Production
After deployment, test:
1. ✅ reCAPTCHA widget appears on account creation page
2. ✅ reCAPTCHA can be completed successfully
3. ✅ Account creation works with valid reCAPTCHA
4. ✅ Account creation is blocked without reCAPTCHA (if configured)
5. ✅ Error messages appear if reCAPTCHA fails
6. ✅ reCAPTCHA resets on token expiration

## Troubleshooting

### reCAPTCHA Not Showing
- Check `VITE_RECAPTCHA_SITE_KEY` is set in production
- Verify production domain is in reCAPTCHA console
- Check browser console for errors
- Ensure you're using reCAPTCHA v2, not Enterprise

### reCAPTCHA Verification Failing
- Check `RECAPTCHA_SECRET_KEY` is set in Supabase
- Verify site key and secret key are from the same reCAPTCHA site
- Check Supabase Edge Function logs for detailed errors
- Ensure production domain is registered in reCAPTCHA console

### Validation Function Not Found (404)
- The app will gracefully degrade if the function doesn't exist
- Deploy the edge function: `supabase functions deploy validate-account-creation`
- Check that the function is deployed to the correct Supabase project

## Key Changes Made

1. **index.html**: Removed hardcoded Enterprise script (line 54)
2. **OnboardingFlow.tsx**:
   - Added `SUPABASE_URL` import (line 10)
   - Added validation function call before profile creation (lines 663-747)
   - Improved error handling for validation failures

## Next Steps

1. Set environment variables in production
2. Verify reCAPTCHA site configuration
3. Deploy edge function (if not already deployed)
4. Test account creation flow in production
5. Monitor Supabase Edge Function logs for any errors

---

**Last Updated:** 2025-02-28
**Related Files:**
- `index.html`
- `src/components/OnboardingFlow.tsx`
- `supabase/functions/validate-account-creation/index.ts`
- `RECAPTCHA_PRODUCTION_TROUBLESHOOTING.md`

