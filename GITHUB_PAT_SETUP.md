# How to Get a GitHub Personal Access Token (PAT)

## Step-by-Step Instructions

### Step 1: Go to GitHub Settings
1. Log in to your GitHub account
2. Click your **profile picture** (top right corner)
3. Click **Settings**

### Step 2: Navigate to Developer Settings
1. Scroll down in the left sidebar
2. Click **Developer settings** (at the bottom)

### Step 3: Create a Personal Access Token
1. Click **Personal access tokens** → **Tokens (classic)**
   - Or go directly to: https://github.com/settings/tokens
2. Click **Generate new token** → **Generate new token (classic)**

### Step 4: Configure Your Token
1. **Note**: Give it a descriptive name (e.g., "Echo Garden Push Token")
2. **Expiration**: Choose how long it should last
   - Recommended: 90 days or custom (you can set it to never expire, but less secure)
3. **Select scopes** (permissions):
   - ✅ **repo** (Full control of private repositories)
     - This includes: repo:status, repo_deployment, public_repo, repo:invite, security_events
   - ✅ **workflow** (if you need to update GitHub Actions workflows)
   
   **Minimum required**: Just check **repo** - this gives full repository access

### Step 5: Generate and Copy Token
1. Click **Generate token** (scroll to bottom)
2. **⚠️ IMPORTANT**: Copy the token immediately!
   - It looks like: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - You won't be able to see it again after you leave this page
   - If you lose it, you'll need to create a new one

### Step 6: Use the Token

#### Option A: Use Token When Pushing (Git will prompt)
When you push, Git will ask for credentials:
- **Username**: Your GitHub username (melloom)
- **Password**: Paste your Personal Access Token (NOT your GitHub password)

#### Option B: Store Token in Git Credential Manager (Recommended)
```powershell
# Store credentials (Git will prompt for username and password/token)
git config --global credential.helper wincred

# Or use the newer manager store
git config --global credential.helper manager-core
```

Then when you push, enter:
- Username: `melloom`
- Password: `ghp_your_token_here`

#### Option C: Use Token in Remote URL (Less Secure)
```powershell
git remote set-url origin https://ghp_YOUR_TOKEN_HERE@github.com/melloom/Echo-Garden.git
```

⚠️ **Warning**: This stores the token in your git config. Only use if you're okay with that.

### Step 7: Test the Token
```powershell
git push origin main
```

If it works, you're all set! If you get authentication errors, double-check:
- The token has the `repo` scope
- You're using the token (not your password) when prompted
- The token hasn't expired

## Troubleshooting

### "Authentication failed" error
- Make sure you're using the **token**, not your GitHub password
- Verify the token hasn't expired
- Check that the `repo` scope is selected

### "Permission denied" error
- Ensure the token has the `repo` scope enabled
- Verify you have push access to the repository

### Token expired
- Go back to https://github.com/settings/tokens
- Generate a new token
- Update your stored credentials

## Security Best Practices

1. ✅ Use tokens with the minimum required permissions
2. ✅ Set expiration dates for tokens
3. ✅ Revoke unused tokens
4. ✅ Never commit tokens to your repository
5. ✅ Use environment variables or credential managers instead of hardcoding

## Quick Links

- **Create Token**: https://github.com/settings/tokens
- **Manage Tokens**: https://github.com/settings/tokens
- **Your Repositories**: https://github.com/melloom?tab=repositories
