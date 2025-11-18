# CDN Configuration Guide

This guide explains how to set up a CDN (Content Delivery Network) for Echo Garden to optimize audio file delivery and improve performance globally.

## Overview

CDN setup will:
- Reduce latency by serving audio files from edge locations closer to users
- Improve load times, especially for users far from your Supabase region
- Reduce bandwidth costs on Supabase storage
- Provide better reliability and availability

## Options

### 1. Supabase Storage CDN (Recommended - Built-in)

Supabase Storage automatically provides CDN functionality through:
- **Automatic edge caching** for frequently accessed files
- **Global distribution** via Supabase's infrastructure
- **Signed URLs** that work with CDN caching

**Setup**: No additional setup required! Supabase handles this automatically.

**Optimization**:
- Use signed URLs with appropriate expiry times (1 hour recommended)
- Enable public storage buckets for frequently accessed content (if appropriate)

### 2. Cloudflare CDN

If you want more control or additional features:

**Setup Steps**:

1. **Create Cloudflare account** and add your domain

2. **Set up Cloudflare Workers**:
   ```javascript
   // worker.js - Proxy Supabase storage through Cloudflare
   addEventListener('fetch', event => {
     event.respondWith(handleRequest(event.request))
   })

   async function handleRequest(request) {
     const url = new URL(request.url)
     
     // Proxy to Supabase storage
     const supabaseUrl = `https://YOUR_PROJECT.supabase.co/storage/v1/object/public/audio/${url.pathname}`
     
     // Add caching headers
     const response = await fetch(supabaseUrl, {
       headers: {
         'CF-Cache-Status': 'HIT'
       }
     })
     
     const modifiedResponse = new Response(response.body, response)
     modifiedResponse.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
     modifiedResponse.headers.set('CDN-Cache-Control', 'public, max-age=31536000')
     
     return modifiedResponse
   }
   ```

3. **Update audio URL generation** in your code to use Cloudflare URLs

### 3. Netlify/Vercel CDN

If deploying on Netlify or Vercel:

**Netlify**:
- Use Netlify Edge Functions to proxy Supabase storage
- Configure in `netlify.toml`:
   ```toml
   [[redirects]]
     from = "/cdn/audio/*"
     to = "https://YOUR_PROJECT.supabase.co/storage/v1/object/public/audio/:splat"
     status = 200
     force = true
     headers = {X-From = "Netlify-CDN"}
   ```

**Vercel**:
- Use Vercel Edge Functions
- Configure in `vercel.json`:
   ```json
   {
     "rewrites": [
       {
         "source": "/cdn/audio/:path*",
         "destination": "https://YOUR_PROJECT.supabase.co/storage/v1/object/public/audio/:path*"
       }
     ],
     "headers": [
       {
         "source": "/cdn/audio/:path*",
         "headers": [
           {
             "key": "Cache-Control",
             "value": "public, max-age=31536000, immutable"
           }
         ]
       }
     ]
   }
   ```

## Implementation in Code

### Update Audio URL Generation

Update `src/context/AudioPlayerContext.tsx` and other places where audio URLs are generated:

```typescript
// Option 1: Use environment variable for CDN URL
const CDN_URL = import.meta.env.VITE_CDN_URL || '';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const getAudioUrl = async (audioPath: string): Promise<string> => {
  if (CDN_URL) {
    // Use CDN URL
    return `${CDN_URL}/audio/${audioPath}`;
  } else {
    // Fallback to Supabase signed URL
    const { data } = await supabase.storage
      .from("audio")
      .createSignedUrl(audioPath, 3600);
    return data?.signedUrl || '';
  }
};
```

### Environment Variables

Add to `.env`:

```env
# CDN Configuration (optional)
VITE_CDN_URL=https://cdn.yourdomain.com

# Or use Supabase CDN (automatic)
VITE_USE_SUPABASE_CDN=true
```

## Caching Strategy

### Audio Files
- **Cache-Control**: `public, max-age=31536000, immutable` (1 year)
- Audio files are immutable once uploaded, so aggressive caching is safe
- Use content hashing in filenames for cache busting when needed

### Images
- **Cache-Control**: `public, max-age=2592000, must-revalidate` (30 days)
- Images may change, so include must-revalidate

## Monitoring

Monitor CDN performance:
- Track cache hit rates
- Monitor latency improvements
- Check bandwidth savings
- Track error rates

## Cost Optimization

1. **Use Cloudflare Free Tier**: 100GB/month bandwidth
2. **Supabase Storage**: Already includes CDN functionality
3. **Optimize file sizes**: Compress audio files before upload
4. **Implement lazy loading**: Only load audio when needed

## Testing

Test CDN setup:

```bash
# Test response times from different locations
curl -w "@curl-format.txt" -o /dev/null -s "https://your-cdn.com/audio/file.webm"

# Check cache headers
curl -I "https://your-cdn.com/audio/file.webm"
```

## Current Implementation

Currently, Echo Garden uses Supabase Storage's built-in CDN functionality:
- Signed URLs provide secure access
- Automatic edge caching
- Global distribution via Supabase infrastructure

No additional CDN setup is required, but you can enhance performance with:
1. Custom CDN (Cloudflare, etc.) for more control
2. Image optimization service (Cloudinary, etc.) for avatars
3. Progressive loading strategies

## Next Steps

1. Monitor current performance
2. If latency is high in certain regions, consider custom CDN
3. Implement image optimization service for avatars
4. Add performance monitoring tools

