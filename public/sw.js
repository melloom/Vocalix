// Service Worker for caching audio files and assets
const CACHE_VERSION = "v3"; // Incremented for enhanced prefetching
const CACHE_NAME = `echo-garden-${CACHE_VERSION}`;
const AUDIO_CACHE_NAME = `echo-garden-audio-${CACHE_VERSION}`;
const STATIC_CACHE_NAME = `echo-garden-static-${CACHE_VERSION}`;
const HTML_CACHE_NAME = `echo-garden-html-${CACHE_VERSION}`;
const API_CACHE_NAME = `echo-garden-api-${CACHE_VERSION}`;
const PREFETCH_CACHE_NAME = `echo-garden-prefetch-${CACHE_VERSION}`;
const PREFETCH_CACHE_NAME = `echo-garden-prefetch-${CACHE_VERSION}`;

// Cache duration settings
const AUDIO_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
const STATIC_CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days
const HTML_CACHE_DURATION = 1 * 60 * 60 * 1000; // 1 hour
const API_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Cache size limits (approximate)
const MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB per cache
const MAX_AUDIO_CACHE_SIZE = 500 * 1024 * 1024; // 500MB for audio

// Install event - cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        // Cache critical static assets
        return cache.addAll([
          "/",
          "/favicon.ico",
        ]).catch((error) => {
          console.warn("Failed to cache some static assets:", error);
        });
      }),
      // Pre-cache HTML pages for offline access
      caches.open(HTML_CACHE_NAME).then((cache) => {
        // Cache common routes and offline page
        return cache.addAll([
          "/",
          "/offline.html",
        ]).catch((error) => {
          console.warn("Failed to cache some HTML pages:", error);
        });
      }),
    ])
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return (
                cacheName !== CACHE_NAME &&
                cacheName !== AUDIO_CACHE_NAME &&
                cacheName !== STATIC_CACHE_NAME &&
                cacheName !== HTML_CACHE_NAME &&
                cacheName !== API_CACHE_NAME &&
                cacheName !== PREFETCH_CACHE_NAME &&
                cacheName.startsWith("echo-garden-")
              );
            })
            .map((cacheName) => {
              console.log("Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            })
        );
      }),
      // Clean up old cache entries
      cleanOldCacheEntries(),
      // Manage cache sizes
      manageCacheSizes(),
    ])
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip chrome-extension and other unsupported schemes
  if (url.protocol === "chrome-extension:" || 
      url.protocol === "moz-extension:" ||
      url.protocol === "safari-extension:") {
    return; // Let the browser handle it
  }

  // Skip Vite HMR WebSocket connections
  if (url.protocol === "ws:" || url.protocol === "wss:") {
    return; // Let Vite handle WebSocket connections
  }

  // Handle audio files
  if (
    url.pathname.includes("/audio/") ||
    event.request.destination === "audio" ||
    url.searchParams.has("token") // Supabase signed URLs have token param
  ) {
    event.respondWith(handleAudioRequest(event.request));
    return;
  }

  // Handle HTML pages with network-first strategy
  if (
    event.request.method === "GET" &&
    event.request.headers.get("accept")?.includes("text/html")
  ) {
    event.respondWith(handleHTMLRequest(event.request));
    return;
  }

  // Handle API requests with stale-while-revalidate strategy
  if (
    url.pathname.startsWith("/rest/") ||
    url.hostname.includes("supabase") ||
    event.request.url.includes("/api/")
  ) {
    event.respondWith(handleAPIRequest(event.request));
    return;
  }

  // Handle static assets
  if (
    event.request.destination === "image" ||
    event.request.destination === "font" ||
    event.request.destination === "style" ||
    event.request.destination === "script"
  ) {
    event.respondWith(handleStaticRequest(event.request));
    return;
  }

  // For other requests, use network-first strategy
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses (skip chrome-extension URLs)
        if (response.status === 200 && 
            !url.protocol.startsWith("chrome-extension") &&
            !url.protocol.startsWith("moz-extension") &&
            !url.protocol.startsWith("safari-extension")) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch((error) => {
              // Silently fail if caching is not supported for this request
              console.warn("Failed to cache request:", event.request.url, error);
            });
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(event.request);
      })
  );
});

// Handle audio requests with cache-first strategy
async function handleAudioRequest(request) {
  const cache = await caches.open(AUDIO_CACHE_NAME);

  // Try cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    // Check if cache is still valid
    const cachedDate = cachedResponse.headers.get("sw-cached-date");
    if (cachedDate) {
      const cacheAge = Date.now() - parseInt(cachedDate, 10);
      if (cacheAge < AUDIO_CACHE_DURATION) {
        return cachedResponse;
      }
    }
  }

  // Fetch from network
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.status === 200) {
      // Clone response and add cache date header
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set("sw-cached-date", Date.now().toString());

      const modifiedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers,
      });

      // Cache the response
      await cache.put(request, modifiedResponse);

      return networkResponse;
    }
    return networkResponse;
  } catch (error) {
    // If network fails and we have a cached version, return it even if stale
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Handle static asset requests with cache-first strategy
async function handleStaticRequest(request) {
  // Skip chrome-extension and other unsupported schemes
  if (request.url.startsWith("chrome-extension:") || 
      request.url.startsWith("moz-extension:") ||
      request.url.startsWith("safari-extension:")) {
    return fetch(request);
  }

  const cache = await caches.open(STATIC_CACHE_NAME);

  // Try cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    // Check if cache is still valid
    const cachedDate = cachedResponse.headers.get("sw-cached-date");
    if (cachedDate) {
      const cacheAge = Date.now() - parseInt(cachedDate, 10);
      if (cacheAge < STATIC_CACHE_DURATION) {
        return cachedResponse;
      }
    }
  }

  // Fetch from network
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.status === 200) {
      // Double-check: Don't cache chrome-extension URLs
      if (request.url.startsWith("chrome-extension:") || 
          request.url.startsWith("moz-extension:") ||
          request.url.startsWith("safari-extension:")) {
        return networkResponse;
      }

      // Clone response and add cache date header
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set("sw-cached-date", Date.now().toString());

      const modifiedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers,
      });

      // Cache the response (with error handling)
      try {
        await cache.put(request, modifiedResponse);
      } catch (cacheError) {
        // If caching fails (e.g., unsupported scheme), just return the response
        console.warn("Failed to cache request:", request.url, cacheError);
      }

      return networkResponse;
    }
    return networkResponse;
  } catch (error) {
    // If network fails and we have a cached version, return it even if stale
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Clean up old cache entries periodically
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAN_CACHE") {
    cleanOldCacheEntries();
  }
});

// Push notification event handler
self.addEventListener("push", (event) => {
  let notificationData = {
    title: "Echo Garden",
    body: "You have a new notification",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title: data.title || notificationData.title,
        body: data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        badge: data.badge || notificationData.badge,
        tag: data.tag,
        data: data.data,
      };
    } catch (e) {
      console.error("Error parsing push notification data:", e);
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      data: notificationData.data,
      requireInteraction: false,
    })
  );
});

// Notification click event handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notificationData = event.notification.data;
  let url = "/";

  // Determine URL based on notification type
  if (notificationData) {
    if (notificationData.clip_id) {
      url = `/clip/${notificationData.clip_id}`;
    } else if (notificationData.profile_handle) {
      url = `/profile/${notificationData.profile_handle}`;
    } else if (notificationData.challenge_id) {
      url = "/challenges";
    }
  }

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        // If a window is already open, focus it
        for (const client of clientList) {
          if (client.url === url && "focus" in client) {
            return client.focus();
          }
        }
        // Otherwise, open a new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Handle HTML requests with network-first strategy
async function handleHTMLRequest(request) {
  const cache = await caches.open(HTML_CACHE_NAME);
  
  try {
    // Try network first
    const networkResponse = await fetch(request);
    if (networkResponse.status === 200) {
      // Clone and cache the response
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set("sw-cached-date", Date.now().toString());
      
      const modifiedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers,
      });
      
      await cache.put(request, modifiedResponse).catch((error) => {
        console.warn("Failed to cache HTML:", request.url, error);
      });
      
      return networkResponse;
    }
    // If network fails, try cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const offlineResponse = await cache.match('/offline.html');
      if (offlineResponse) {
        return offlineResponse;
      }
    }
    // Return offline page or error
    throw error;
  }
}

// Handle API requests with stale-while-revalidate strategy
async function handleAPIRequest(request) {
  const cache = await caches.open(API_CACHE_NAME);
  
  // Try cache first for immediate response
  const cachedResponse = await cache.match(request);
  
  // Fetch from network in background (don't await)
  const networkFetch = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.status === 200) {
        // Clone and cache the fresh response
        const responseToCache = networkResponse.clone();
        const headers = new Headers(responseToCache.headers);
        headers.set("sw-cached-date", Date.now().toString());
        
        const modifiedResponse = new Response(responseToCache.body, {
          status: responseToCache.status,
          statusText: responseToCache.statusText,
          headers: headers,
        });
        
        cache.put(request, modifiedResponse).catch((error) => {
          console.warn("Failed to cache API response:", request.url, error);
        });
      }
      return networkResponse;
    })
    .catch((error) => {
      console.warn("API fetch failed:", request.url, error);
      return null;
    });
  
  // Return cached response immediately if available and fresh
  if (cachedResponse) {
    const cachedDate = cachedResponse.headers.get("sw-cached-date");
    if (cachedDate) {
      const cacheAge = Date.now() - parseInt(cachedDate, 10);
      if (cacheAge < API_CACHE_DURATION) {
        // Return cached response, but update in background
        networkFetch.catch(() => {}); // Ignore errors
        return cachedResponse;
      }
    }
  }
  
  // Wait for network response
  try {
    const networkResponse = await networkFetch;
    if (networkResponse) {
      return networkResponse;
    }
  } catch (error) {
    // Network failed
  }
  
  // Fallback to stale cache if available
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // No cache available, return error
  return new Response(JSON.stringify({ error: "Offline" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

async function cleanOldCacheEntries() {
  const cacheConfigs = [
    { name: AUDIO_CACHE_NAME, duration: AUDIO_CACHE_DURATION },
    { name: STATIC_CACHE_NAME, duration: STATIC_CACHE_DURATION },
    { name: HTML_CACHE_NAME, duration: HTML_CACHE_DURATION },
    { name: API_CACHE_NAME, duration: API_CACHE_DURATION },
    { name: CACHE_NAME, duration: STATIC_CACHE_DURATION },
  ];
  
  for (const { name, duration } of cacheConfigs) {
    try {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      
      for (const request of requests) {
        const response = await cache.match(request);
        if (response) {
          const cachedDate = response.headers.get("sw-cached-date");
          if (cachedDate) {
            const cacheAge = Date.now() - parseInt(cachedDate, 10);
            if (cacheAge > duration) {
              await cache.delete(request);
            }
          } else {
            // If no date header, delete old entries (older than 7 days)
            await cache.delete(request);
          }
        }
      }
    } catch (error) {
      console.warn("Error cleaning cache:", name, error);
    }
  }
}

// Manage cache sizes to prevent exceeding storage limits
async function manageCacheSizes() {
  const cacheConfigs = [
    { name: AUDIO_CACHE_NAME, maxSize: MAX_AUDIO_CACHE_SIZE },
    { name: STATIC_CACHE_NAME, maxSize: MAX_CACHE_SIZE },
    { name: HTML_CACHE_NAME, maxSize: MAX_CACHE_SIZE },
    { name: API_CACHE_NAME, maxSize: MAX_CACHE_SIZE },
    { name: CACHE_NAME, maxSize: MAX_CACHE_SIZE },
  ];
  
  for (const { name, maxSize } of cacheConfigs) {
    try {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      
      // Estimate cache size (rough approximation)
      let estimatedSize = 0;
      const entries = [];
      
      for (const request of requests) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          const size = blob.size;
          estimatedSize += size;
          
          const cachedDate = response.headers.get("sw-cached-date");
          entries.push({
            request,
            size,
            date: cachedDate ? parseInt(cachedDate, 10) : 0,
          });
        }
      }
      
      // If cache exceeds limit, remove oldest entries
      if (estimatedSize > maxSize) {
        // Sort by date (oldest first)
        entries.sort((a, b) => a.date - b.date);
        
        for (const entry of entries) {
          if (estimatedSize <= maxSize * 0.9) break; // Remove until 90% of limit
          await cache.delete(entry.request);
          estimatedSize -= entry.size;
        }
      }
    } catch (error) {
      console.warn("Error managing cache size:", name, error);
    }
  }
}

// Background sync for failed requests
self.addEventListener("sync", (event) => {
  if (event.tag === "background-sync") {
    event.waitUntil(syncFailedRequests());
  } else if (event.tag === "background-upload") {
    event.waitUntil(syncFailedUploads());
  }
});

async function syncFailedRequests() {
  // Sync any failed API requests when connection is restored
  try {
    const cache = await caches.open(API_CACHE_NAME);
    const requests = await cache.keys();
    
    for (const request of requests) {
      // Check if this is a failed POST/PUT/DELETE request
      if (request.method !== "GET") {
        try {
          const response = await fetch(request.clone());
          if (response.ok) {
            // Request succeeded, remove from failed queue
            await cache.delete(request);
          }
        } catch (error) {
          // Still failing, keep in queue
          console.warn("Background sync still failing for:", request.url);
        }
      }
    }
  } catch (error) {
    console.error("Background sync error:", error);
  }
}

async function syncFailedUploads() {
  // Sync failed audio uploads when connection is restored
  try {
    // Get failed uploads from IndexedDB or cache
    // This would be implemented based on your upload queue system
    console.log("Syncing failed uploads...");
    
    // Example: Get upload queue from IndexedDB
    // const uploadQueue = await getUploadQueueFromIndexedDB();
    // for (const upload of uploadQueue) {
    //   if (upload.status === "failed") {
    //     await retryUpload(upload);
    //   }
    // }
  } catch (error) {
    console.error("Background upload sync error:", error);
  }
}

// Periodic background sync (when supported)
if ("periodicSync" in self.registration) {
  self.addEventListener("periodicsync", (event) => {
    if (event.tag === "content-sync") {
      event.waitUntil(syncContent());
    }
  });
}

async function syncContent() {
  // Sync content in background periodically
  try {
    // Prefetch next clips, update cache, etc.
    console.log("Periodic content sync");
    cleanOldCacheEntries();
    manageCacheSizes();
  } catch (error) {
    console.error("Periodic sync error:", error);
  }
}

// Prefetch next clips when user is near the end of current clip
self.addEventListener("message", async (event) => {
  if (event.data && event.data.type === "PREFETCH_AUDIO") {
    const { audioUrls } = event.data;
    if (Array.isArray(audioUrls)) {
      await prefetchAudioUrls(audioUrls);
    }
  }
});

// Prefetch audio URLs in background
async function prefetchAudioUrls(urls) {
  const cache = await caches.open(PREFETCH_CACHE_NAME);
  const prefetchPromises = urls.map(async (url) => {
    try {
      // Check if already cached
      const cached = await cache.match(url);
      if (cached) {
        return; // Already cached
      }
      
      // Prefetch with low priority
      const response = await fetch(url, {
        priority: "low", // Browser hint for low priority
      });
      
      if (response.ok) {
        await cache.put(url, response);
      }
    } catch (error) {
      // Silently fail - prefetching is optional
      console.debug("Prefetch failed for:", url, error);
    }
  });
  
  await Promise.allSettled(prefetchPromises);
}

// Periodic cache maintenance
setInterval(() => {
  cleanOldCacheEntries();
  manageCacheSizes();
}, 60 * 60 * 1000); // Every hour

