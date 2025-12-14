# Auto-Deployment Setup Guide

This guide will help you set up automatic deployment to Netlify when you push to GitHub.

## Prerequisites

1. A Netlify account (sign up at https://netlify.com if you don't have one)
2. Your site already connected to Netlify (or you need to create a new site)

## Setup Steps

### Step 1: Get Your Netlify Credentials

1. **Get Netlify Auth Token:**
   - Go to https://app.netlify.com/user/applications
   - Click "New access token"
   - Give it a name (e.g., "GitHub Actions Deploy")
   - Copy the token (you'll only see it once!)

2. **Get Netlify Site ID:**
   - Go to your Netlify dashboard
   - Select your site
   - Go to **Site settings** → **General** → **Site details**
   - Copy the **Site ID** (it looks like: `abc123-def456-ghi789`)

### Step 2: Add Secrets to GitHub

1. Go to your GitHub repository: https://github.com/melloom/Echo-Garden
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these two secrets:

   **Secret 1:**
   - Name: `NETLIFY_AUTH_TOKEN`
   - Value: (paste your Netlify auth token from Step 1)

   **Secret 2:**
   - Name: `NETLIFY_SITE_ID`
   - Value: (paste your Site ID from Step 1)

### Step 3: Verify the Workflow

1. The workflow file is already created at `.github/workflows/deploy.yml`
2. It will automatically run when you push to `main` or `master` branch
3. You can also manually trigger it from the **Actions** tab in GitHub

## How It Works

- **Automatic**: Every push to `main`/`master` triggers a build and deployment
- **Manual**: You can trigger it manually from the GitHub Actions tab
- **Build**: Runs `npm ci` and `npm run build`
- **Deploy**: Deploys the `dist` folder to Netlify production

## Troubleshooting

### Deployment Fails

1. Check the GitHub Actions logs for errors
2. Verify your secrets are set correctly:
   - Go to Settings → Secrets and variables → Actions
   - Make sure both `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` exist
3. Verify your Netlify site is active and accessible

### Build Errors

- Check that `npm run build` works locally
- Verify all environment variables are set in Netlify dashboard
- Check the build logs in GitHub Actions

### Not Deploying

- Make sure you're pushing to `main` or `master` branch
- Check that the workflow file exists at `.github/workflows/deploy.yml`
- Verify the workflow is enabled in GitHub Actions settings

## Alternative: Netlify Git Integration

If you prefer, you can also use Netlify's built-in Git integration:

1. Go to Netlify dashboard
2. Add new site → Import from Git
3. Connect your GitHub repository
4. Netlify will automatically deploy on every push

However, using GitHub Actions gives you more control and visibility.

