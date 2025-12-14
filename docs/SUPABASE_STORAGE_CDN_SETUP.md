# Supabase Storage CDN Setup Guide

This guide explains how Supabase Storage CDN is configured and optimized in Echo Garden.

## ✅ Implementation Complete

The Supabase Storage CDN is now fully configured and optimized in the codebase. Supabase Storage automatically provides CDN functionality through their infrastructure.

## How It Works

### Automatic CDN
- **Supabase Storage** automatically routes all requests through their CDN infrastructure
- **Signed URLs** benefit from edge caching
- **Public URLs** (if bucket is public) get even better caching

### Current Configuration

1. **Audio URL Generation** (`src/utils/audioUrl.ts`)
   - Centralized utility for getting audio URLs
   - Optimized for CDN caching with 24-hour expiry times
   - Automatically checks offline storage first
   - Supports both signed and public URLs

2. **Updated Components**
   - `AudioPlayerContext.tsx` - Main audio player
   - `Comments.tsx` - Voice comments
   - `Embed.tsx` - Embedded clips
   - `VoiceReactionPlayer.tsx` - Voice reactions
   - `VirtualizedFeed.tsx` - Feed prefetching
   - `usePrefetchClips.ts` - Prefetch hook
   - `Index.tsx` - Main feed

### Expiry Times

- **Old**: 1 hour (3600 seconds)
- **New**: 24 hours (86400 seconds)

**Benefits of 24-hour expiry**:
- Better browser caching
- Reduced API calls to Supabase
- Improved CDN cache hit rates
- Faster load times for repeat visits

### CDN Features

#### Automatic Edge Caching
- Supabase automatically caches files at edge locations globally
- Reduces latency for users worldwide
- No additional configuration needed

#### Signed URLs with CDN
- Even signed URLs benefit from CDN caching
- Browser can cache the signed URL (valid for 24 hours)
- CDN edge servers cache the actual file content

#### Public URLs (Optional)
- If your bucket is public, you can use public URLs
- Even better caching (no expiry on URL itself)
- See `src/utils/audioUrl.ts` for `usePublicUrl` option

## Usage

### Basic Usage

```typescript
import { getAudioUrl } from "@/utils/audioUrl";

// Get audio URL with automatic CDN optimization
const url = await getAudioUrl(audioPath, {
  clipId: "clip-id", // Optional, for offline check
  expiresIn: 86400, // 24 hours (default)
});
```

### Advanced Usage

```typescript
// Use public URL if bucket is public
const url = await getAudioUrl(audioPath, {
  usePublicUrl: true,
});

// Check offline storage first
const url = await getAudioUrl(audioPath, {
  clipId: "clip-id",
  checkOffline: true, // Default: true
});

// Prefetch for better performance
import { prefetchAudioUrl } from "@/utils/audioUrl";
await prefetchAudioUrl(audioPath, clipId);
```

## Environment Variables

No additional environment variables needed! The setup uses existing Supabase configuration.

Optional: If you want to use public URLs explicitly:

```env
# Already configured in your Supabase client
VITE_SUPABASE_URL=https://your-project.supabase.co
```

## Performance Benefits

### Before (1-hour expiry)
- More frequent URL generation requests
- Lower CDN cache hit rates
- More API calls to Supabase

### After (24-hour expiry)
- ✅ Fewer URL generation requests
- ✅ Higher CDN cache hit rates  
- ✅ Reduced API calls
- ✅ Faster load times
- ✅ Better browser caching

## Monitoring

### Check CDN Performance

1. **Browser DevTools Network Tab**
   - Look for cache headers: `cache-control`, `x-cache-status`
   - Check response times (should be faster from edge locations)

2. **Supabase Dashboard**
   - Monitor storage bandwidth usage
   - Check request patterns
   - View edge cache statistics (if available)

3. **User Experience**
   - Faster audio loading
   - Smoother playback
   - Reduced buffering

## Cache Headers

Supabase automatically sets appropriate cache headers:
- `cache-control`: Based on bucket configuration
- `cdn-cache-control`: Managed by Supabase CDN

## Testing

### Test CDN Performance

```bash
# Test audio URL response time
curl -I "https://your-project.supabase.co/storage/v1/object/sign/audio/path/to/file.webm?token=..."

# Check cache headers
curl -v "https://your-project.supabase.co/storage/v1/object/sign/audio/path/to/file.webm?token=..."
```

### Verify Implementation

1. Open browser DevTools Network tab
2. Play an audio clip
3. Check the audio request:
   - Should see CDN cache headers
   - Response time should be fast
   - Subsequent loads should be cached

## Troubleshooting

### Audio URLs expiring too quickly
- Check expiry time in `getAudioUrl` calls
- Default is 24 hours (86400 seconds)
- Can be increased if needed (max: 604800 = 7 days)

### Cache not working
- Verify Supabase Storage CDN is enabled (automatic)
- Check browser cache settings
- Ensure URLs are consistent (no random query params)

### Slow load times
- Check Supabase region vs user locations
- Verify CDN is enabled in Supabase dashboard
- Consider using public URLs if bucket is public

## Future Enhancements

1. **Public Bucket**: Consider making audio bucket public for better caching
   - Requires security review
   - Enables public URLs (no expiry)
   - Better CDN performance

2. **Custom CDN**: Add Cloudflare or similar (see `CDN_SETUP.md`)
   - More control over caching
   - Additional features (image optimization, etc.)

3. **Preloading Strategy**: Enhance prefetching
   - Predictive preloading
   - User behavior-based loading
   - Smart caching strategies

## Summary

✅ **Supabase Storage CDN is fully configured**
- All audio URL generation uses optimized 24-hour expiry
- Centralized utility for consistent implementation
- Automatic edge caching via Supabase infrastructure
- Offline storage integration maintained
- Better performance with minimal code changes

No additional setup required - everything works automatically through Supabase's built-in CDN!

