# reCAPTCHA Key Type Guide

You mentioned you have **2 keys** - one v2 and one v3. Let me help you figure out which one to use.

## Current Setup

The app is currently configured for **reCAPTCHA Enterprise** (or v3), which:
- Is **invisible** (no checkbox)
- Uses score-based verification
- Runs automatically in the background

## Key Types Explained

### reCAPTCHA v2 (Checkbox)
- Has a visible "I'm not a robot" checkbox
- User must click to verify
- **NOT compatible** with current code

### reCAPTCHA v3 (Score-Based)
- Invisible, runs automatically
- Returns a score (0.0 - 1.0)
- Uses script: `https://www.google.com/recaptcha/api.js?render=KEY`
- **Compatible** - can work with slight code changes

### reCAPTCHA Enterprise (Score-Based)
- Invisible, runs automatically
- Returns a score (0.0 - 1.0)
- Uses script: `https://www.google.com/recaptcha/enterprise.js?render=KEY`
- **Currently configured** - this is what the code expects

## Which Key Should You Use?

**Use your v3 key** - it's compatible and will work!

The code can easily be adjusted to use v3 instead of Enterprise. The APIs are almost identical.

## Next Steps

1. **Share your v3 site key** (or confirm you want to use Enterprise)
2. I'll update the code to use the correct script URL
3. Update your `.env` file with the correct key
4. Register `localhost` and `127.0.0.1` in the reCAPTCHA console

## Quick Check

**v3 keys:**
- Script URL: `https://www.google.com/recaptcha/api.js?render=YOUR_KEY`
- API: `grecaptcha.execute()` (not `grecaptcha.enterprise.execute()`)

**Enterprise keys:**
- Script URL: `https://www.google.com/recaptcha/enterprise.js?render=YOUR_KEY`
- API: `grecaptcha.enterprise.execute()`

**Current code uses:** Enterprise API (`grecaptcha.enterprise.execute()`)

## Recommendation

If you have a v3 key, I can quickly switch the code to use v3 instead. It's simpler and doesn't require Google Cloud API setup for the backend.

Would you like me to:
1. Switch to v3 (simpler, recommended)?
2. Keep Enterprise (if you already have Enterprise key)?

