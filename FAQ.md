# Frequently Asked Questions

Common questions and answers about Echo Garden.

## 📋 Table of Contents

- [General Questions](#general-questions)
- [User Questions](#user-questions)
- [Developer Questions](#developer-questions)
- [Admin Questions](#admin-questions)
- [Technical Questions](#technical-questions)

## ❓ General Questions

### What is Echo Garden?

Echo Garden is an audio-first social platform where users share short voice clips instead of text posts. Think of it as a voice-based social network.

### How is Echo Garden different from other platforms?

- **Audio-First**: Everything revolves around voice content
- **Anonymous-Friendly**: Users can participate with pseudonyms
- **Topic-Driven**: Daily topics inspire conversations
- **Community-Focused**: Audio communities and live rooms

### Is Echo Garden free?

Yes! Echo Garden is completely free to use.

### What platforms does Echo Garden support?

Currently, Echo Garden is a web application that works in modern browsers. Mobile apps may be added in the future.

## 👤 User Questions

### How do I create an account?

You don't need to create an account! Just visit Echo Garden and choose a handle. Your account is created automatically using device-based authentication.

### Do I need to use my real name?

No! Echo Garden is designed for anonymous or pseudonymous sharing. Use any handle you want.

### How long can my clips be?

- Regular clips: 30 seconds
- Podcast mode: Up to 10 minutes

### Can I edit my clips after publishing?

Currently, you can't edit clips after publishing. You can delete and re-record if needed.

### Can I delete my account?

Yes, you can delete your account in Settings. This removes your profile and clips.

### How do I report inappropriate content?

Click the report button on any clip or profile. Our moderation team will review it.

### Can I block users?

Yes! You can block users from their profile page. Blocked users won't be able to see your clips or interact with you.

## 💻 Developer Questions

### How do I contribute?

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

### What technology stack is used?

- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend: Supabase (PostgreSQL, Edge Functions)
- See [ARCHITECTURE.md](./ARCHITECTURE.md) for details

### How do I set up the development environment?

See [DEVELOPMENT.md](./DEVELOPMENT.md) for setup instructions.

### How do I run tests?

```bash
npm test
```

See [TESTING.md](./TESTING.md) for testing guide.

### Where can I find API documentation?

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for complete API reference.

### How do I deploy?

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment guide.

## 🔧 Admin Questions

### How do I access the admin dashboard?

See [ADMIN_SETUP_GUIDE.md](./ADMIN_SETUP_GUIDE.md) for admin setup instructions.

### What can I do in the admin dashboard?

- View security metrics
- Moderate content
- Manage users
- Handle reports
- See [ADMIN_DASHBOARD_FEATURES.md](./ADMIN_DASHBOARD_FEATURES.md) for details

### How do I add another admin?

Run SQL in Supabase Dashboard:

```sql
INSERT INTO public.admins (profile_id, role)
VALUES ('profile-id-here'::uuid, 'admin');
```

## 🔧 Technical Questions

### Why isn't my microphone working?

- Check browser permissions (allow microphone access)
- Make sure you're on HTTPS (required for recording)
- Try a different browser
- Check your microphone settings

### Why are my clips taking so long to process?

Processing includes transcription, summarization, and moderation. This usually takes 10-30 seconds. High traffic may cause delays.

### Can I download clips?

Currently, you can't download clips. This feature may be added later.

### Do clips expire?

No, clips stay on Echo Garden indefinitely unless you delete them or they're removed for violations.

### Can I see who listened to my clips?

You can see listen counts, but not individual listeners (privacy feature).

### Why am I getting CORS errors?

- Check Supabase CORS settings
- Verify your domain is allowed
- Check browser console for specific errors

### How do I fix database connection errors?

- Verify environment variables
- Check Supabase project is active
- Verify network connectivity
- Check RLS policies

## 📚 More Help

- [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md) - All documentation
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Troubleshooting guide
- [USER_TUTORIAL.md](./USER_TUTORIAL.md) - User guide

---

**Last Updated**: 2025-01-27

