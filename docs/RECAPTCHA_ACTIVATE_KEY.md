# Activating Your reCAPTCHA Key

## What "Finish setting up your key: Request tokens" Means

This message in Google reCAPTCHA console is **normal** for a new key. It means:
- ✅ Your key is created
- ⏳ It hasn't generated any tokens yet
- 🔧 Once tokens are generated (from your website), the key will be "activated"

## How to Activate the Key

The key will activate automatically once:

1. **Script loads successfully** on your website
2. **Execution happens** (when user submits the form)
3. **Token is generated** and sent to backend

## Current Status

Your code is already set up to:
- ✅ Load reCAPTCHA script
- ✅ Execute on form submission
- ✅ Generate tokens

**The issue:** Script isn't loading successfully (that's what we're fixing)

## Once It Works

Once the script loads and executes successfully **even once**, the message will disappear and your key will be active.

## Quick Test

After fixing the script loading issue:

1. Go to your onboarding page
2. Fill out the form
3. Submit it
4. Check browser console - should see: `✅ reCAPTCHA Enterprise token obtained`
5. Go back to reCAPTCHA console - message should be gone

## Next Steps

1. Fix script loading (make sure domain is registered: `localhost` and `127.0.0.1`)
2. Test form submission
3. Key will auto-activate after first successful token generation

