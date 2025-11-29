# reCAPTCHA Enterprise Setup Instructions

You've provided your Enterprise credentials:
- **Site Key**: `6LdrJBcsAAAAAKWjfoIW-YDTcHH9g9N5S2Zb8cYH`
- **Project ID**: `echo-garden-479222`

## What's Different from v2?

1. **No Checkbox** - Enterprise is invisible and runs in the background
2. **Score-Based** - Returns a score (0.0-1.0) instead of pass/fail
3. **Assessment API** - Requires Google Cloud API key for backend verification

## What You Need to Provide

**Google Cloud API Key** - This is needed for the backend to call the Assessment API:
- Go to Google Cloud Console → APIs & Services → Credentials
- Create an API key or use an existing one
- This will be set in Supabase Edge Functions secrets as `RECAPTCHA_API_KEY`

## Implementation Status

The migration is being implemented now. Here's what will change:

### Frontend Changes:
- ✅ Load Enterprise script dynamically
- ⏳ Remove v2 checkbox component  
- ⏳ Execute Enterprise on form submit with `grecaptcha.enterprise.execute()`
- ⏳ Enterprise is invisible - no UI component needed

### Backend Changes:
- ⏳ Replace v2 verify endpoint with Enterprise Assessment API
- ⏳ Use Project ID and API key for authentication
- ⏳ Check score (threshold: 0.5)

## Environment Variables Needed

### Frontend (Netlify):
- `VITE_RECAPTCHA_SITE_KEY` = `6LdrJBcsAAAAAKWjfoIW-YDTcHH9g9N5S2Zb8cYH`

### Backend (Supabase Edge Functions Secrets):
- `RECAPTCHA_PROJECT_ID` = `echo-garden-479222`
- `RECAPTCHA_API_KEY` = [Your Google Cloud API key - **you need to provide this**]
- `RECAPTCHA_SITE_KEY` = `6LdrJBcsAAAAAKWjfoIW-YDTcHH9g9N5S2Zb8cYH`

## Next Steps

1. ✅ I'm implementing the code changes now
2. ⏳ You need to get your Google Cloud API key
3. ⏳ Set it in Supabase Edge Functions secrets
4. ⏳ Set `VITE_RECAPTCHA_SITE_KEY` in Netlify
5. ⏳ Test the implementation

The implementation will be completed shortly!

