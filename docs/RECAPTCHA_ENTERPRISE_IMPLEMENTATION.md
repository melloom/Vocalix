# reCAPTCHA Enterprise Implementation Status

## What Needs to Be Done

Based on your reCAPTCHA Enterprise setup:
- **Site Key**: `6LdrJBcsAAAAAKWjfoIW-YDTcHH9g9N5S2Zb8cYH`
- **Project ID**: `echo-garden-479222`
- **Type**: Score-based (invisible)

## Implementation Steps

### ✅ Step 1: Load Enterprise Script
- Add script to `index.html` or load dynamically in component
- Script: `https://www.google.com/recaptcha/enterprise.js?render=6LdrJBcsAAAAAKWjfoIW-YDTcHH9g9N5S2Zb8cYH`

### ⏳ Step 2: Update Frontend Component
- Remove `react-google-recaptcha` dependency
- Remove checkbox UI component
- Add `grecaptcha.enterprise.execute()` call on form submit
- Enterprise is invisible - no UI needed

### ⏳ Step 3: Update Backend Validation
- Replace v2 verify endpoint with Enterprise Assessment API
- Endpoint: `https://recaptchaenterprise.googleapis.com/v1/projects/echo-garden-479222/assessments`
- Requires Google Cloud API key for authentication
- Check score in response (0.0-1.0, threshold 0.5)

### ⏳ Step 4: Environment Variables
**Frontend (Netlify):**
- `VITE_RECAPTCHA_SITE_KEY` = `6LdrJBcsAAAAAKWjfoIW-YDTcHH9g9N5S2Zb8cYH`

**Backend (Supabase Edge Functions Secrets):**
- `RECAPTCHA_PROJECT_ID` = `echo-garden-479222`
- `RECAPTCHA_API_KEY` = [Your Google Cloud API key - needs to be provided]
- `RECAPTCHA_SITE_KEY` = `6LdrJBcsAAAAAKWjfoIW-YDTcHH9g9N5S2Zb8cYH`

## Key Differences

### Old (v2 Checkbox):
```javascript
<ReCAPTCHA
  sitekey={siteKey}
  onChange={(token) => setToken(token)}
/>
```

### New (Enterprise):
```javascript
// No UI component needed!
grecaptcha.enterprise.ready(async () => {
  const token = await grecaptcha.enterprise.execute(siteKey, {
    action: 'ACCOUNT_CREATION'
  });
  // Send token to backend
});
```

## Next Steps

1. Implement frontend Enterprise execution
2. Update backend Assessment API integration
3. Set environment variables
4. Test in production

