# Which reCAPTCHA Key Should You Use?

You have **v2** and **v3** keys. Here's the situation:

## Current Setup: Enterprise

The code is currently configured for **reCAPTCHA Enterprise**, which requires:
- ✅ Enterprise site key
- ✅ Google Cloud API key (for backend)
- ✅ Project ID

## Option 1: Use v3 (Simpler) ⭐ **RECOMMENDED**

**Benefits:**
- ✅ You already have the key
- ✅ No Google Cloud API key needed
- ✅ Simpler backend (standard siteverify endpoint)
- ✅ Works the same way (invisible, score-based)

**I can switch the code to v3 in 5 minutes!**

## Option 2: Keep Enterprise

**Requirements:**
- Enterprise site key (not v2 or v3)
- Google Cloud API key
- Project ID

**Do you have an Enterprise key?** The key `6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf` might be Enterprise, v3, or v2 - I can't tell from the format alone.

## Recommendation

**Use your v3 key** - it's simpler and works perfectly. The code changes are minimal:
- Change script from `recaptcha/enterprise.js` to `recaptcha/api.js`
- Change API from `grecaptcha.enterprise.execute()` to `grecaptcha.execute()`
- Update backend to use standard siteverify endpoint (already supported)

## Next Steps

**Option A:** Switch to v3 (tell me your v3 key and I'll update everything)

**Option B:** Keep Enterprise (confirm your key is Enterprise, and we'll set up Google Cloud API key)

Which would you prefer?

