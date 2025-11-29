# Netlify Session Cookie Setup Guide

## Overview

This guide explains how to set up the Netlify function for setting session cookies on your `echogarden.netlify.app` domain.

## What Was Created

1. **Netlify Function**: `netlify/functions/set-session-cookie.ts`
   - Proxies the Supabase edge function call
   - Sets the cookie on your Netlify domain
   - Validates session tokens before setting cookies

2. **Netlify Configuration**: `netlify.toml`
   - Configures function directory
   - Sets up CORS headers
   - Configures build settings

3. **Updated Client Code**: `src/integrations/supabase/client.ts`
   - Automatically detects Netlify domain
   - Uses Netlify function on `echogarden.netlify.app`
   - Falls back to Supabase edge function if needed

## Setup Steps

### 1. Install Dependencies

```bash
npm install --save-dev @netlify/functions
```

### 2. Configure Environment Variables in Netlify

Go to your Netlify dashboard → Site settings → Environment variables and add:

- `VITE_SUPABASE_URL` or `SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_PUBLISHABLE_KEY` - Your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (for server-side validation)

**Important**: The `SUPABASE_SERVICE_ROLE_KEY` should be kept secret and only used in server-side functions.

### 3. Deploy to Netlify

The function will be automatically deployed when you push to your repository or deploy via Netlify CLI:

```bash
netlify deploy --prod
```

Or if using Git integration, just push to your main branch.

### 4. Verify the Function Works

1. Log in to your app on `echogarden.netlify.app`
2. Check browser DevTools → Application → Cookies
3. You should see the `echo_session` cookie set for `echogarden.netlify.app`
4. Try logging in from a different browser - the cookie should work across browsers

## How It Works

1. **User logs in** → Session token is created in Supabase
2. **Frontend calls Netlify function** → `/.netlify/functions/set-session-cookie`
3. **Netlify function validates token** → Calls Supabase RPC to verify session
4. **Cookie is set** → On `echogarden.netlify.app` domain
5. **Cross-browser login** → Cookie works across all browsers on the same domain

## Security Features

- ✅ **Token Validation**: Validates session token before setting cookie
- ✅ **HTTP-Only**: Cookie cannot be accessed via JavaScript (XSS protection)
- ✅ **Secure Flag**: Automatically set for HTTPS connections
- ✅ **SameSite=Lax**: Prevents CSRF attacks
- ✅ **Service Role Key**: Only used server-side, never exposed to client

## Troubleshooting

### Cookie Not Being Set

1. **Check Netlify Function Logs**:
   - Go to Netlify Dashboard → Functions → `set-session-cookie`
   - Check for errors in the logs

2. **Verify Environment Variables**:
   - Ensure all required env vars are set in Netlify dashboard
   - Check that `SUPABASE_SERVICE_ROLE_KEY` is correct

3. **Check CORS**:
   - Ensure your origin is allowed in CORS headers
   - Check browser console for CORS errors

### Function Returns 500 Error

1. **Check Supabase Connection**:
   - Verify `SUPABASE_URL` is correct
   - Verify `SUPABASE_SERVICE_ROLE_KEY` has proper permissions

2. **Check Function Logs**:
   - Look for specific error messages in Netlify function logs

### Cookie Not Persisting Across Browsers

1. **Check Domain**:
   - Cookie should be set for `echogarden.netlify.app` (exact domain)
   - Not for `.netlify.app` (subdomain sharing requires different config)

2. **Check Secure Flag**:
   - Ensure you're using HTTPS (Netlify provides this automatically)

3. **Check Browser Settings**:
   - Some browsers block third-party cookies
   - Check if cookies are enabled in browser settings

## Testing Locally

To test the Netlify function locally:

```bash
# Install Netlify CLI if not already installed
npm install -g netlify-cli

# Start local development server
netlify dev
```

This will:
- Start your Vite dev server
- Start Netlify Functions locally
- Proxy requests to `/.netlify/functions/*`

## Fallback Behavior

The client code automatically falls back to the Supabase edge function if:
- The Netlify function returns a 500+ error
- The function is not available
- You're running on a different domain

This ensures backward compatibility and graceful degradation.

## Next Steps

1. ✅ Install `@netlify/functions` package
2. ✅ Set environment variables in Netlify dashboard
3. ✅ Deploy to Netlify
4. ✅ Test cross-browser login
5. ✅ Verify cookies are set correctly

## Support

If you encounter issues:
1. Check Netlify function logs
2. Check browser console for errors
3. Verify environment variables are set correctly
4. Ensure Supabase RPC functions are deployed

