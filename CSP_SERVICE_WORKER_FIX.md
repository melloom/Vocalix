# CSP Service Worker Fix

## Problem

In production, the service worker was intercepting **all** fetch requests, including external images from domains like:
- `nbcsports.brightspotcdn.com`
- `sportshub.cbsistatic.com`
- `img.apmcdn.org`
- `images.jpost.com`

These external requests were being blocked by the Content Security Policy (CSP), causing errors:
```
Connecting to 'https://nbcsports.brightspotcdn.com/...' violates the following Content Security Policy directive: "connect-src 'self' https://*.supabase.co..."
```

## Root Cause

The service worker's fetch event handler was intercepting **all** requests without checking if they were from our own domain or explicitly allowed domains. This meant external images/content that users might view in the app (from RSS feeds, embedded content, etc.) were being intercepted by the service worker, triggering CSP violations.

## Solution

Added origin checking to the service worker to **only intercept requests from**:
1. Our own domain (`self.location.origin`)
2. Explicitly allowed external domains (like Supabase: `.supabase.co`, `.supabase.storage`)

All other external requests now pass through directly to the browser without service worker interception.

## Changes Made

### 1. Fetch Event Handler (`public/sw.js`)

Added origin checking at the beginning of the fetch handler:

```javascript
// CRITICAL: Only intercept requests from our own origin or explicitly allowed domains
const requestOrigin = url.origin;
const selfOrigin = self.location.origin;

const allowedExternalDomains = [
  '.supabase.co',
  '.supabase.storage',
];

const isOurOrigin = requestOrigin === selfOrigin;
const isAllowedExternal = allowedExternalDomains.some(domain => {
  if (domain.startsWith('.')) {
    return url.hostname.endsWith(domain);
  }
  return url.hostname === domain;
});

// Skip external domains that aren't explicitly allowed
if (!isOurOrigin && !isAllowedExternal) {
  return; // Let the browser handle it directly - don't intercept
}
```

### 2. Static Request Handler

Added domain checking in `handleStaticRequest()` as a backup safety measure to skip external domains.

### 3. Other Requests Handler

Updated the fallback "other requests" handler to also respect origin checking and only cache our own or allowed external domains.

## Result

- ✅ Service worker only intercepts requests from our domain or explicitly allowed domains
- ✅ External images/content pass through directly to the browser
- ✅ No more CSP violations for external content
- ✅ Service worker still caches our own assets and Supabase storage URLs

## Testing

After deploying this fix, verify:
1. No CSP errors in browser console for external images
2. Service worker still caches app assets correctly
3. Supabase storage images still work and are cached
4. External content loads normally (though not cached by service worker)

## Deployment

1. Deploy the updated `public/sw.js` file
2. Users will get the new service worker on their next visit
3. Old service worker will be replaced automatically
4. Cache version is already incremented (`v5`) so old caches will be cleared

## Notes

- External content (like RSS feed images) will still load in the browser, but won't be cached by the service worker
- This is actually **better** for performance since we're not wasting cache space on external content we don't control
- Only our own assets and Supabase storage URLs are cached, which is what we want anyway

