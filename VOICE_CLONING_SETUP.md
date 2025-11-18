# Voice Cloning Setup Guide

This guide explains how to set up the ElevenLabs API key for voice cloning functionality.

## 🔑 Step 1: Get Your ElevenLabs API Key

1. Go to [ElevenLabs](https://elevenlabs.io/)
2. Sign up or log in to your account
3. Navigate to **Settings** → **API Keys**
4. Click **Create API Key** or copy your existing key
5. Save the key securely (it starts with `sk_`)

## 📍 Step 2: Add API Key to Supabase

### Option A: Via Supabase Dashboard (Recommended)

1. Go to your **Supabase Dashboard**
2. Select your project
3. Navigate to **Project Settings** (gear icon in sidebar)
4. Click **Edge Functions** in the left menu
5. Click the **Secrets** tab
6. Click **Add New Secret** or **New Secret**
7. Enter:
   - **Name**: `ELEVENLABS_API_KEY`
   - **Value**: Your ElevenLabs API key (starts with `sk_`)
8. Click **Save**

### Option B: Via Supabase CLI

If you have the Supabase CLI installed:

```bash
# Set the secret
supabase secrets set ELEVENLABS_API_KEY=your_api_key_here

# Verify it's set (won't show the value, just confirms it exists)
supabase secrets list
```

## ✅ Step 3: Verify Setup

The voice cloning feature will automatically work once the API key is set. To test:

1. Go to **Settings** in your app
2. Scroll to **Voice Cloning for Accessibility** section
3. Record a clip (at least 30 seconds)
4. Try creating a voice model

## 🔒 Security Notes

- ⚠️ **Never commit the API key to git**
- ⚠️ **Never expose the API key in client-side code**
- ✅ The key is only used in Edge Functions (server-side)
- ✅ The key is stored securely in Supabase Secrets

## 💰 Pricing

ElevenLabs offers:
- **Free tier**: Limited characters per month
- **Paid plans**: More characters and features

Check [ElevenLabs Pricing](https://elevenlabs.io/pricing) for current rates.

## 🐛 Troubleshooting

### Voice cloning not working?

1. **Check if API key is set:**
   - Go to Supabase Dashboard → Edge Functions → Secrets
   - Verify `ELEVENLABS_API_KEY` exists

2. **Check Edge Function logs:**
   - Go to Supabase Dashboard → Edge Functions → `clone-voice`
   - Check logs for errors

3. **Verify API key is valid:**
   - Test the key directly with ElevenLabs API
   - Make sure the key hasn't expired or been revoked

4. **Check function deployment:**
   - Make sure `clone-voice` function is deployed
   - Redeploy if needed: `supabase functions deploy clone-voice`

### Error: "ElevenLabs API key not configured"

This means the `ELEVENLABS_API_KEY` secret is not set in Supabase. Follow Step 2 above.

### Error: "Failed to create voice clone"

- Check your ElevenLabs account has available credits
- Verify the audio file is valid (at least 30 seconds recommended)
- Check Edge Function logs for detailed error messages

## 📚 Additional Resources

- [ElevenLabs API Documentation](https://elevenlabs.io/docs)
- [Supabase Edge Functions Secrets](https://supabase.com/docs/guides/functions/secrets)
- [Voice Cloning Feature Documentation](./NEXT_BIG_IMPROVEMENTS.md#21-voice-cloning-for-accessibility-)

---

**Last Updated**: 2025-01-31

