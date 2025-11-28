# Link Your Account to Multiple Devices

This guide shows you how to link your local account (with admin privileges) to your production device so you can access the same account from multiple devices.

## Your Account Information

- **Local Profile ID**: `a8c24193-3912-4a7e-af33-328b3c756a32` (has admin)
- **Production Profile ID**: `1de6dfce-8d08-4bc0-a91b-61128a25fa97`

## How Account Linking Works

When you link a device using a magic login link:
- The device becomes linked to the account that generated the link
- You can link as many devices as you want to the same account
- All linked devices will have access to the same account (including admin if the account has it)
- Your existing profile on the production device will be replaced/linked to your local account

## Step-by-Step Instructions

### Step 1: Generate Magic Login Link from Local Account

1. **Open your local Echo Garden app** (where you have admin access)
2. **Go to Settings** → **Account** tab
3. **Click "Send link"** button (under "Log in on a new device")
4. **Choose link type**:
   - **Standard (7 days)** - Good for linking multiple devices
   - **Extended (7 days)** - Same as standard
   - **Quick share (1 hour)** - For quick one-time linking
5. **Click "Generate link"**
6. **Copy the link** or **scan the QR code** that appears

### Step 2: Use the Link on Your Production Device

**Option A: Using the Link URL**

1. **Open the magic login link** on your production device (phone/browser)
   - You can copy the link and paste it in your production browser
   - Or email it to yourself and open it on production
2. **Confirm the device linking** when prompted
3. **Wait for the link to process** - it will link your production device to your local account

**Option B: Using the QR Code**

1. **Show the QR code** in your local app (click "Show QR" in the magic link dialog)
2. **Scan the QR code** with your production device's camera
3. **Open the link** that appears
4. **Confirm the device linking** when prompted

### Step 3: Verify the Link

After linking:

1. **Check your production device** - you should now see:
   - Your local account's handle and avatar
   - Access to all your local account's clips and data
   - Admin access (if your local account has admin)

2. **Verify in Settings**:
   - Go to **Settings** → **Security** tab
   - You should see your production device listed in "Active Devices"
   - Both devices should show the same profile

3. **Test Admin Access**:
   - Navigate to `/admin` on your production device
   - You should have full admin access

## Important Notes

- **Account Merging**: When you link a device, it doesn't merge profiles - it links the device to the account that generated the link. Your production profile will be replaced with access to your local account.

- **Multiple Devices**: You can link as many devices as you want to the same account. Just generate a new magic link for each device.

- **Admin Access**: If your local account has admin privileges, all linked devices will automatically have admin access too.

- **Link Expiration**: 
  - Standard/Extended links expire after 7 days
  - Quick share links expire after 1 hour
  - Generate a new link if yours expires

## Troubleshooting

### "This login link has already been used"

- Each magic link can only be used once
- Generate a new link from Settings if you need to link another device

### "This login link has expired"

- Links expire after their time limit (1 hour or 7 days)
- Generate a new link from your local account

### Device Not Showing in Settings

- Refresh the page after linking
- Check that you're logged in with the correct account
- The device should appear in Settings → Security → Active Devices

### Admin Access Not Working

- Make sure your local account has admin privileges
- Check that the device was successfully linked
- Try refreshing the page or clearing cache

## Quick Reference

**To link a new device:**
1. Local app → Settings → Account → "Send link" → Generate link
2. Production device → Open link → Confirm linking
3. Done! Both devices now access the same account

**To verify devices are linked:**
- Settings → Security → Active Devices (should show all linked devices)






