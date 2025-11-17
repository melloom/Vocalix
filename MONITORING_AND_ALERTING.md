# Monitoring & Alerting Guide

This document explains how monitoring and alerting is implemented in Echo Garden using Sentry and other tools.

## Overview

Monitoring and alerting helps us:
- Track errors and exceptions in production
- Monitor application performance
- Alert on security incidents
- Understand user behavior
- Debug issues quickly

## Architecture

### Frontend Monitoring
- **Error Tracking**: Sentry captures React errors, unhandled promise rejections
- **Performance Monitoring**: Track page load times, API response times
- **User Actions**: Track important user interactions

### Backend Monitoring (Edge Functions)
- **Error Tracking**: Sentry captures Edge Function errors
- **Performance Metrics**: Track function execution times
- **Security Incidents**: Monitor suspicious activity, failed authentications

## Setup

### 1. Get Sentry DSN

1. Sign up at [sentry.io](https://sentry.io)
2. Create a new project
3. Copy your DSN (Data Source Name)

### 2. Configure Environment Variables

#### For Frontend

Add to your `.env` file:

```bash
VITE_SENTRY_DSN=https://your-dsn@sentry.io/project-id
```

For production, set this in your deployment platform (Vercel, Netlify, etc.)

#### For Edge Functions

Add to your Supabase Edge Functions secrets:

```bash
supabase secrets set SENTRY_DSN=https://your-dsn@sentry.io/project-id
```

Or set in Supabase Dashboard:
1. Go to Project Settings
2. Navigate to Edge Functions
3. Add secret: `SENTRY_DSN`

### 3. Initialize Monitoring

#### Frontend (Already Implemented)

Monitoring is automatically initialized in `src/main.tsx`:

```typescript
import { initializeMonitoring } from "@/lib/monitoring";

// Initialize monitoring (Sentry) first
initializeMonitoring();
```

#### Edge Functions (Example)

Add to your Edge Function:

```typescript
import { initializeMonitoring, captureException, extractRequestContext } from "../_shared/monitoring.ts";

// Initialize monitoring
initializeMonitoring("your-function-name");

serve(async (req: Request) => {
  const context = extractRequestContext(req);
  
  try {
    // Your function logic...
  } catch (error) {
    // Capture error to Sentry
    await captureException(error, {
      functionName: "your-function-name",
      ...context,
      additionalData: {
        // Any additional context
      },
    });
    throw error;
  }
});
```

## Production Setup with Sentry SDK

✅ **The Sentry SDK has been integrated!** The implementation uses the actual Sentry SDK for both frontend and Edge Functions. To enable it in production, just set the DSN environment variables.

### Frontend

✅ **Already implemented!** The Sentry SDK is already integrated in `src/lib/monitoring.ts` using `@sentry/react`.

If you need to customize the configuration, you can modify `src/lib/monitoring.ts`:

```typescript
import * as Sentry from "@sentry/react";

export function initializeSentry(dsn: string | null): void {
  if (!dsn) return;
  
  Sentry.init({
    dsn: dsn,
    environment: import.meta.env.MODE,
    integrations: [
      new Sentry.BrowserTracing(),
      new Sentry.Replay(),
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

export function captureException(error: Error | unknown, context?: ErrorContext): void {
  Sentry.captureException(error, {
    tags: {
      userId: context?.userId,
      deviceId: context?.deviceId,
    },
    extra: context?.additionalData,
  });
}
```

### Edge Functions (Deno)

✅ **Already implemented!** The Sentry SDK for Deno is already integrated in `supabase/functions/_shared/monitoring.ts` using `https://deno.land/x/sentry/index.mjs`.

The implementation automatically:
- Initializes Sentry with your DSN
- Captures exceptions with context
- Tracks performance metrics
- Filters sensitive data

No additional setup needed - just set the `SENTRY_DSN` environment variable!

## Usage Examples

### Frontend

#### Capture Errors

```typescript
import { captureException } from "@/lib/monitoring";

try {
  // Your code
} catch (error) {
  captureException(error, {
    userId: currentUser?.id,
    deviceId: localStorage.getItem("deviceId"),
    additionalData: {
      action: "uploadClip",
      clipId: clip.id,
    },
  });
}
```

#### Track User Actions

```typescript
import { trackUserAction } from "@/lib/monitoring";

trackUserAction("clip_uploaded", {
  clipId: clip.id,
  duration: clip.duration,
});
```

#### Track Performance

```typescript
import { trackPerformance } from "@/lib/monitoring";

const startTime = performance.now();
// ... your code ...
const duration = performance.now() - startTime;

trackPerformance("api_request", duration, "ms", {
  endpoint: "/api/clips",
  method: "POST",
});
```

### Edge Functions

#### Capture Errors

```typescript
import { captureException, extractRequestContext } from "../_shared/monitoring.ts";

serve(async (req: Request) => {
  const context = extractRequestContext(req);
  
  try {
    // Your function logic
  } catch (error) {
    await captureException(error, {
      functionName: "admin-review",
      ...context,
      additionalData: {
        action: body?.action,
      },
    });
    
    // Re-throw or handle error
    throw error;
  }
});
```

#### Track Security Incidents

```typescript
import { trackSecurityIncident, extractRequestContext } from "../_shared/monitoring.ts";

serve(async (req: Request) => {
  const context = extractRequestContext(req);
  
  // Detect suspicious activity
  if (failedAuthAttempts > 5) {
    await trackSecurityIncident(
      "multiple_failed_auth_attempts",
      "high",
      {
        deviceId: context.deviceId,
        attemptCount: failedAuthAttempts,
      },
      context
    );
  }
});
```

#### Track Performance

```typescript
import { trackPerformance } from "../_shared/monitoring.ts";

serve(async (req: Request) => {
  const startTime = Date.now();
  
  // Your function logic...
  
  const duration = Date.now() - startTime;
  trackPerformance({
    name: "function_execution_time",
    value: duration,
    unit: "ms",
    tags: {
      function: "admin-review",
      action: body?.action,
    },
  });
});
```

## Alerting

### Sentry Alerts

Configure alerts in Sentry Dashboard:

1. **Error Rate Alerts**
   - Alert when error rate exceeds threshold
   - Example: Alert if > 100 errors/hour

2. **Performance Alerts**
   - Alert on slow API responses
   - Example: Alert if p95 latency > 2 seconds

3. **Security Alerts**
   - Alert on security incidents
   - Example: Alert on failed authentication spikes

### Alert Channels

Configure notification channels:
- **Email**: For critical errors
- **Slack**: For team notifications
- **PagerDuty**: For on-call rotations
- **Webhooks**: For custom integrations

## Monitoring Dashboard

### Key Metrics to Monitor

1. **Error Rate**
   - Total errors per hour/day
   - Error rate by endpoint
   - Error rate by version

2. **Performance**
   - API response times (p50, p95, p99)
   - Function execution times
   - Database query times

3. **Usage**
   - Requests per minute/hour
   - Active users
   - Feature usage

4. **Security**
   - Failed authentication attempts
   - Suspicious activity
   - Rate limit violations

## Best Practices

### 1. Include Context

Always include relevant context when capturing errors:

```typescript
// Good
captureException(error, {
  userId: user.id,
  deviceId: deviceId,
  additionalData: {
    action: "upload",
    clipId: clip.id,
    fileSize: file.size,
  },
});

// Bad
captureException(error); // No context!
```

### 2. Don't Capture Sensitive Data

Never include sensitive information:

```typescript
// Good
captureException(error, {
  additionalData: {
    userId: user.id, // OK - public ID
  },
});

// Bad
captureException(error, {
  additionalData: {
    password: user.password, // BAD - sensitive!
    apiKey: process.env.API_KEY, // BAD - sensitive!
  },
});
```

### 3. Use Appropriate Log Levels

```typescript
// Info: Normal operation
captureMessage("User logged in", "info");

// Warning: Potential issues
captureMessage("Rate limit approaching", "warning", {
  requestsRemaining: 5,
});

// Error: Actual errors
captureException(error, context);
```

### 4. Track Business Metrics

Monitor business-critical metrics:

```typescript
trackUserAction("clip_uploaded", {
  clipId: clip.id,
  duration: clip.duration,
  fileSize: file.size,
});
```

### 5. Set Up Alerts Early

Don't wait for issues to occur:
- Set up error rate alerts immediately
- Configure performance alerts from day one
- Monitor security incidents in real-time

## Error Boundaries

React Error Boundaries automatically capture errors:

```typescript
// Already implemented in src/components/ErrorBoundary.tsx
export class ErrorBoundary extends Component {
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    captureException(error, {
      additionalData: {
        componentStack: errorInfo.componentStack,
      },
    });
  }
}
```

## Security Considerations

1. **Filter Sensitive Data**
   - Current implementation filters sensitive patterns
   - Review logs before sending to Sentry

2. **Rate Limiting**
   - Sentry has built-in rate limiting
   - Monitor Sentry quota usage

3. **Privacy**
   - Respect user privacy
   - Don't log PII unless necessary
   - Comply with GDPR/privacy regulations

## Troubleshooting

### Monitoring Not Working

1. **Check Environment Variables**
   ```bash
   # Frontend
   echo $VITE_SENTRY_DSN
   
   # Edge Functions
   supabase secrets list
   ```

2. **Check Console Logs**
   - Look for "[Monitoring]" messages
   - Verify Sentry initialization

3. **Test Error Capture**
   ```typescript
   captureException(new Error("Test error"));
   ```

### Too Many Events

1. **Adjust Sample Rates**
   ```typescript
   Sentry.init({
     tracesSampleRate: 0.1, // 10% of transactions
     replaysSessionSampleRate: 0.01, // 1% of sessions
   });
   ```

2. **Filter Events**
   - Configure beforeSend hook
   - Ignore specific errors

## Resources

- [Sentry Documentation](https://docs.sentry.io/)
- [Sentry React Setup](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Sentry Deno Setup](https://docs.sentry.io/platforms/javascript/guides/deno/)
- [Error Tracking Best Practices](https://docs.sentry.io/product/best-practices/)

---

**Last Updated**: 2025-01-XX
**Status**: Implementation complete, requires Sentry SDK integration for production

