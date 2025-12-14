# Email Fallback Setup Guide

## Overview

The email system now has a **free fallback** in case Resend doesn't work. Both the daily digest and PIN reset emails will automatically try Brevo if Resend fails.

## How It Works

1. **Primary**: Tries Resend first (if `RESEND_API_KEY` is set)
2. **Fallback 1**: If Resend fails, automatically tries Brevo (if configured)
3. **Fallback 2**: If Brevo fails/is suspended, automatically tries SMTP2GO (if configured)
4. **Logs**: If all fail, logs a warning with setup instructions

## Free Email Services Comparison

| Service | Free Tier | Forever Free? | Setup Difficulty |
|---------|-----------|---------------|------------------|
| **Resend** (Primary) | 3,000 emails/month | ✅ Yes | Easy |
| **Brevo** (Fallback 1) | 300 emails/day = 9,000/month | ✅ Yes | Easy |
| **SMTP2GO** (Fallback 2) | 1,000 emails/month | ✅ Yes | Easy |

## Setting Up Brevo Fallback (Free Forever)

### Step 1: Sign Up for Brevo

1. Go to [https://www.brevo.com](https://www.brevo.com) (formerly Sendinblue)
2. Sign up for a free account
3. Verify your email address
4. **No credit card required** - free tier is forever!

### Step 2: Create API Key

1. In Brevo dashboard, go to **Settings** → **API Keys**
2. Click **Generate a new API key**
3. Name it (e.g., "Echo Garden Fallback")
4. Copy the API key immediately (you won't see it again!)
   - API key looks like: `xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### Step 3: Verify Sender (Optional but Recommended)

1. Go to **Senders** → **Add a sender**
2. Add your email address and verify it
3. This improves deliverability

### Step 4: Add to Supabase Secrets

1. Go to **Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**
2. Add this secret:
   - **Name**: `BREVO_API_KEY`
   - **Value**: Your Brevo API key (starts with `xkeysib-`)

### Step 5: Test It

The fallback will automatically activate if Resend fails. To test:

1. Temporarily remove or invalidate `RESEND_API_KEY`
2. Trigger a digest or PIN reset
3. Check logs - you should see "Email sent successfully via Brevo fallback"

## Current Configuration

### Daily Digest (`daily-digest` function)
- ✅ Primary: Resend
- ✅ Fallback 1: Brevo (if configured)
- ✅ Fallback 2: SMTP2GO (if configured)

### PIN Reset Email (`send-pin-reset-email` function)
- ✅ Primary: Resend
- ✅ Fallback 1: Brevo (if configured)
- ✅ Fallback 2: SMTP2GO (if configured)

## Environment Variables

### Required for Primary (Resend)
- `RESEND_API_KEY` - Your Resend API key

### Required for Fallback 1 (Brevo)
- `BREVO_API_KEY` - Your Brevo API key

### Required for Fallback 2 (SMTP2GO)
- `SMTP2GO_API_KEY` - Your SMTP2GO API key

### Auto-set by Supabase
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `APP_URL` - Your app URL (optional, defaults to `https://echogarden.app`)

## Free Tier Limits

### Brevo Free Tier (Fallback)
- ✅ **300 emails/day** = **9,000 emails/month** free
- ✅ **Free forever** (no credit card required)
- ✅ **Best free tier available!**
- ✅ Perfect for fallback use

### Resend Free Tier (Primary)
- ✅ **3,000 emails/month** free
- ✅ **100 emails/day** free
- ✅ **Free forever** (no credit card required)

## Troubleshooting

### Fallback Not Working?

1. **Check secrets are set:**
   ```bash
   # In Supabase Dashboard → Edge Functions → Secrets
   # Verify BREVO_API_KEY is set
   ```

2. **Check API key:**
   - Go to Brevo dashboard → Settings → API Keys
   - Make sure your API key is active

3. **Check logs:**
   - Go to Supabase Dashboard → Edge Functions → daily-digest → Logs
   - Look for "Brevo API error" or "Email sent successfully via Brevo fallback"

### Both Services Failing?

If both Resend and Brevo fail, check:
- Email address is valid
- API keys are correct
- Rate limits haven't been exceeded:
  - Resend: 3,000/month
  - Brevo: 300/day = 9,000/month
- Sender is verified in Brevo (if required)

## Benefits of Fallback

1. **Reliability**: If one service is down, the other works
2. **Free**: Both services have generous free tiers
3. **Automatic**: No code changes needed - just configure secrets
4. **Transparent**: Logs show which service was used

## Setting Up SMTP2GO Fallback 2 (Free Forever)

### Step 1: Sign Up for SMTP2GO

1. Go to [https://www.smtp2go.com](https://www.smtp2go.com)
2. Sign up for a free account
3. Verify your email address
4. **No credit card required** - free tier is forever!

### Step 2: Get Your API Key

1. In SMTP2GO dashboard, go to **Settings** → **API Keys**
2. Click **Create API Key**
3. Name it (e.g., "Echo Garden Fallback")
4. Copy the API key (you'll see it once)

### Step 3: Add to Supabase Secrets

1. Go to **Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**
2. Add this secret:
   - **Name**: `SMTP2GO_API_KEY`
   - **Value**: Your SMTP2GO API key

## Next Steps

1. Set up Brevo account (5 minutes) - **Free forever!**
2. Create API key in Brevo dashboard
3. Add `BREVO_API_KEY` secret to Supabase (2 minutes)
4. Set up SMTP2GO account (5 minutes) - **Free forever!**
5. Add `SMTP2GO_API_KEY` secret to Supabase (2 minutes)
6. Test the fallbacks (optional)
7. Done! Your emails now have triple redundancy ✅

## Why These Services?

### Brevo (Fallback 1)
- ✅ **Best free tier**: 300 emails/day = 9,000/month
- ✅ **Free forever**: No credit card, no trial period
- ✅ **Reliable**: Used by 500,000+ companies
- ✅ **Use when**: Not suspended, need high volume

### SMTP2GO (Fallback 2)
- ✅ **Free forever**: 1,000 emails/month
- ✅ **No credit card required**
- ✅ **Reliable backup**: Perfect when Brevo is suspended
- ✅ **Use when**: Brevo is suspended or unavailable

