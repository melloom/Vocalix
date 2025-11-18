# News API Setup Guide

This guide will help you set up the news feed in the right sidebar.

## ✅ What's Been Created

1. **Edge Function**: `supabase/functions/fetch-news/index.ts` - Fetches news from external APIs
2. **Updated Component**: `src/components/CommunityRecommendationsSidebar.tsx` - Displays news in the sidebar

## 🚀 Setup Steps

### Step 1: Deploy the Edge Function

**Option A: Using Supabase Dashboard (Easiest)**

1. Go to your **Supabase Dashboard**
2. Navigate to **Edge Functions** in the sidebar
3. Click **New Function** or **Deploy Function**
4. Name: `fetch-news`
5. Copy the entire contents of `supabase/functions/fetch-news/index.ts`
6. Paste into the code editor
7. Click **Deploy** or **Save**

**Option B: Using Supabase CLI**

```powershell
# If you have Supabase CLI installed
supabase functions deploy fetch-news
```

### Step 2: (Optional) Add NewsAPI.org API Key

For better news coverage, you can add a free API key from NewsAPI.org:

1. Sign up at https://newsapi.org/ (free tier: 100 requests/day)
2. Get your API key
3. In Supabase Dashboard:
   - Go to **Project Settings** → **Edge Functions** → **Secrets**
   - Click **Add New Secret**
   - Name: `NEWS_API_KEY`
   - Value: Your NewsAPI.org API key
   - Click **Save**

**Note**: The function will work without an API key using free RSS feeds (BBC, CNN), but having a NewsAPI key gives you more sources and better coverage.

### Step 3: Test the Function

After deployment, test it by visiting:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/fetch-news
```

You should see JSON with news articles.

## 📰 How It Works

The news section shows:
1. **External News** - Fetched from NewsAPI.org or RSS feeds (BBC/CNN)
2. **Community Announcements** - From your communities
3. **News Category Clips** - Clips tagged with "news" category

The function tries multiple sources:
- First: NewsAPI.org (if API key is set)
- Fallback 1: BBC News RSS feed
- Fallback 2: CNN RSS feed

## 🔧 Customization

You can customize the news sources by editing `supabase/functions/fetch-news/index.ts`:

- Change categories: `category=general` → `category=technology`, `sports`, etc.
- Change country: `country=us` → `country=gb`, `ca`, etc.
- Add more RSS feeds: Add additional RSS sources in the fallback sections

## ✅ Verification

Once deployed, refresh your app and check the right sidebar. You should see:
- "News & Updates" section
- Recent news articles with titles, descriptions, and sources
- Links that open in new tabs

The news will update automatically as you scroll and the component refetches!

