# reCAPTCHA Enterprise Migration Guide

This document outlines the migration from reCAPTCHA v2 (checkbox) to reCAPTCHA Enterprise (score-based).

## Key Differences

### reCAPTCHA v2 (Old)
- Visible checkbox component
- User must click "I'm not a robot"
- Uses `react-google-recaptcha` component
- Verification endpoint: `https://www.google.com/recaptcha/api/siteverify`

### reCAPTCHA Enterprise (New)
- **Invisible** - no UI component needed
- Runs automatically in background
- Uses `grecaptcha.enterprise.execute()` API
- Assessment endpoint: `https://recaptchaenterprise.googleapis.com/v1/projects/{PROJECT_ID}/assessments`

## Required Changes

### Frontend (`src/components/OnboardingFlow.tsx`)

1. **Remove** `react-google-recaptcha` import and component
2. **Load Enterprise script** in `index.html`:
   ```html
   <script src="https://www.google.com/recaptcha/enterprise.js?render=SITE_KEY"></script>
   ```
3. **Execute on form submit**:
   ```javascript
   grecaptcha.enterprise.ready(async () => {
     const token = await grecaptcha.enterprise.execute('SITE_KEY', {
       action: 'ACCOUNT_CREATION'
     });
     // Send token to backend
   });
   ```

### Backend (`supabase/functions/validate-account-creation/index.ts`)

1. **Replace verification endpoint**:
   - Old: `https://www.google.com/recaptcha/api/siteverify`
   - New: `https://recaptchaenterprise.googleapis.com/v1/projects/{PROJECT_ID}/assessments?key={API_KEY}`

2. **Update request format**:
   ```json
   {
     "event": {
       "token": "TOKEN_FROM_FRONTEND",
       "expectedAction": "ACCOUNT_CREATION",
       "siteKey": "6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf"
     }
   }
   ```

3. **Check score** in response:
   - Score range: 0.0 (bot) to 1.0 (human)
   - Recommended threshold: 0.5

### Environment Variables

**Frontend (Netlify):**
- `VITE_RECAPTCHA_SITE_KEY` = `6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf`

**Backend (Supabase Edge Functions Secrets):**
- `RECAPTCHA_PROJECT_ID` = `echo-garden-479222`
- `RECAPTCHA_API_KEY` = Your Google Cloud API key (for authentication)
- `RECAPTCHA_SITE_KEY` = `6LfbDRwsAAAAALkpP7AGaJhKR1ptRuuYSUcPjMsf` (for verification)

## Implementation Steps

1. ✅ Update frontend to load Enterprise script
2. ✅ Update frontend to use `grecaptcha.enterprise.execute()`
3. ⏳ Update backend to use Assessment API
4. ⏳ Set environment variables
5. ⏳ Test in production

## Notes

- Enterprise is **invisible** - users won't see a checkbox
- Works better for understanding user behavior patterns
- Requires Google Cloud API key for backend assessment
- Score-based system (0.0-1.0) instead of pass/fail

