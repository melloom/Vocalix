# Cross-Browser Login Implementation Guide

## Overview

This document outlines the changes required to implement cross-browser login using **server-side sessions with HTTP-only cookies** instead of the current **localStorage-based device authentication**.

## Current System Architecture

### Current Authentication Flow:
1. **Device ID** → Generated client-side, stored in `localStorage`
2. **Profile ID** → Stored in `localStorage` after login/onboarding
3. **Supabase Auth Tokens** → Stored in `localStorage` (though not heavily used)
4. **Magic Login Links** → Allow linking new devices, but still requires manual link sharing
5. **Authentication** → Based on `x-device-id` header sent with every request

### Current Limitations:
- ❌ Each browser has isolated `localStorage` → no cross-browser login
- ❌ Users must manually share magic login links between browsers
- ❌ No automatic session persistence across browsers
- ❌ Device ID can be easily manipulated/cleared

---

## Proposed System Architecture

### New Authentication Flow:
1. **Session Token** → Generated server-side, stored in HTTP-only cookie
2. **Session Table** → Database table tracking active sessions
3. **Profile Lookup** → Based on session token, not device ID
4. **Cookie-Based Auth** → Automatic cookie handling by browsers
5. **Cross-Browser Support** → Same cookie domain = same session

---

## Required Changes

### 1. Database Schema Changes

#### A. Create Sessions Table

```sql
-- Create sessions table
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of token
  device_id TEXT, -- Optional: track original device
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX sessions_token_hash_idx ON public.sessions (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX sessions_profile_id_idx ON public.sessions (profile_id, expires_at DESC);
CREATE INDEX sessions_expires_at_idx ON public.sessions (expires_at) WHERE revoked_at IS NULL;

-- Enable RLS
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own sessions"
ON public.sessions FOR SELECT
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

-- No direct insert/update/delete - use RPC functions only
CREATE POLICY "No direct access to sessions"
ON public.sessions FOR ALL
USING (false)
WITH CHECK (false);
```

#### B. Create Session Management Functions

```sql
-- Create a new session
CREATE OR REPLACE FUNCTION public.create_session(
  p_profile_id UUID,
  p_device_id TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_duration_hours INTEGER DEFAULT 720 -- 30 days default
)
RETURNS TABLE (session_token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_token TEXT;
  v_token_hash TEXT;
  v_expires_at TIMESTAMPTZ;
  v_request_ip INET;
BEGIN
  -- Validate profile exists
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Generate secure session token (UUID + random bytes)
  v_session_token := gen_random_uuid()::text || encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_session_token, 'sha256'), 'hex');
  v_expires_at := now() + (p_duration_hours || ' hours')::interval;

  -- Get request IP if available
  BEGIN
    v_request_ip := inet(current_setting('request.headers', true)::json->>'x-forwarded-for');
  EXCEPTION WHEN OTHERS THEN
    v_request_ip := NULL;
  END;

  -- Insert session
  INSERT INTO public.sessions (
    profile_id,
    session_token,
    token_hash,
    device_id,
    user_agent,
    ip_address,
    expires_at
  )
  VALUES (
    p_profile_id,
    v_session_token,
    v_token_hash,
    p_device_id,
    p_user_agent,
    v_request_ip,
    v_expires_at
  );

  -- Clean up expired sessions for this profile
  DELETE FROM public.sessions
  WHERE profile_id = p_profile_id
    AND (expires_at < now() OR revoked_at IS NOT NULL);

  RETURN QUERY
  SELECT v_session_token, v_expires_at;
END;
$$;

-- Validate session token
CREATE OR REPLACE FUNCTION public.validate_session(p_token_hash TEXT)
RETURNS TABLE (
  profile_id UUID,
  session_id UUID,
  is_valid BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.sessions%ROWTYPE;
BEGIN
  -- Find session
  SELECT * INTO v_session
  FROM public.sessions
  WHERE token_hash = p_token_hash
    AND revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Session not found'::TEXT;
    RETURN;
  END IF;

  -- Check expiration
  IF v_session.expires_at < now() THEN
    -- Auto-revoke expired session
    UPDATE public.sessions
    SET revoked_at = now()
    WHERE id = v_session.id;

    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Session expired'::TEXT;
    RETURN;
  END IF;

  -- Update last accessed
  UPDATE public.sessions
  SET last_accessed_at = now()
  WHERE id = v_session.id;

  RETURN QUERY
  SELECT v_session.profile_id, v_session.id, true, 'Valid'::TEXT;
END;
$$;

-- Get current session profile
CREATE OR REPLACE FUNCTION public.get_session_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_headers JSON;
  v_token_hash TEXT;
  v_session_profile_id UUID;
  v_profile public.profiles%ROWTYPE;
BEGIN
  -- Get token from cookie (will be set by middleware)
  v_request_headers := current_setting('request.headers', true)::json;
  v_token_hash := v_request_headers->>'x-session-token-hash';

  IF v_token_hash IS NULL OR length(trim(v_token_hash)) = 0 THEN
    RAISE EXCEPTION 'No session token provided';
  END IF;

  -- Validate session
  SELECT s.profile_id INTO v_session_profile_id
  FROM public.sessions s
  WHERE s.token_hash = v_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
  LIMIT 1;

  IF v_session_profile_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session';
  END IF;

  -- Get profile
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_session_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for session';
  END IF;

  RETURN v_profile;
END;
$$;

-- Revoke session
CREATE OR REPLACE FUNCTION public.revoke_session(p_token_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sessions
  SET revoked_at = now()
  WHERE token_hash = p_token_hash
    AND revoked_at IS NULL;

  RETURN FOUND;
END;
$$;

-- Revoke all sessions for a profile
CREATE OR REPLACE FUNCTION public.revoke_all_sessions(p_profile_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.sessions
  SET revoked_at = now()
  WHERE profile_id = p_profile_id
    AND revoked_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
```

#### C. Update Profile Lookup Function

```sql
-- Update to support both device-based and session-based auth
CREATE OR REPLACE FUNCTION public.profile_ids_for_request(
  request_device_id TEXT DEFAULT NULL,
  request_session_token_hash TEXT DEFAULT NULL
)
RETURNS TABLE (id UUID)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  -- Try session-based auth first
  SELECT p.id
  FROM public.sessions s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.token_hash = COALESCE(
    request_session_token_hash,
    (current_setting('request.headers', true)::json ->> 'x-session-token-hash')
  )
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
  
  UNION
  
  -- Fall back to device-based auth (backward compatibility)
  WITH resolved_device AS (
    SELECT NULLIF(trim(
      COALESCE(
        request_device_id,
        (current_setting('request.headers', true)::json ->> 'x-device-id')
      )
    ), '') AS device_id
  )
  SELECT p.id
  FROM resolved_device r
  JOIN public.profiles p ON p.device_id = r.device_id
  WHERE r.device_id IS NOT NULL
  
  UNION
  
  SELECT d.profile_id
  FROM resolved_device r
  JOIN public.devices d ON d.device_id = r.device_id
  WHERE r.device_id IS NOT NULL
    AND d.profile_id IS NOT NULL;
$$;
```

---

### 2. Backend/Middleware Changes

#### A. Create Supabase Edge Function for Cookie Management

**File: `supabase/functions/auth-middleware/index.ts`**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const COOKIE_NAME = "echo_session";
const COOKIE_DOMAIN = Deno.env.get("COOKIE_DOMAIN") || ".yourdomain.com";
const COOKIE_SECURE = Deno.env.get("COOKIE_SECURE") === "true";
const COOKIE_SAME_SITE = "Lax";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Extract session token from cookie
  const cookies = req.headers.get("Cookie") || "";
  const sessionToken = extractCookie(cookies, COOKIE_NAME);

  // If no session token, create one for new users or return 401
  if (!sessionToken) {
    return new Response(
      JSON.stringify({ error: "No session" }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
          "Access-Control-Allow-Credentials": "true",
        },
      }
    );
  }

  // Validate session
  const tokenHash = await hashToken(sessionToken);
  const { data, error } = await supabase.rpc("validate_session", {
    p_token_hash: tokenHash,
  });

  if (error || !data || !data[0]?.is_valid) {
    // Clear invalid cookie
    return new Response(
      JSON.stringify({ error: "Invalid session" }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": clearCookie(COOKIE_NAME, COOKIE_DOMAIN),
          "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
          "Access-Control-Allow-Credentials": "true",
        },
      }
    );
  }

  // Add session info to headers for downstream processing
  const response = new Response(
    JSON.stringify({ profile_id: data[0].profile_id }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Session-Profile-Id": data[0].profile_id,
        "X-Session-Token-Hash": tokenHash,
        "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
        "Access-Control-Allow-Credentials": "true",
      },
    }
  );

  return response;
});

function extractCookie(cookies: string, name: string): string | null {
  const match = cookies.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : null;
}

function clearCookie(name: string, domain: string): string {
  return `${name}=; Path=/; Domain=${domain}; Max-Age=0; HttpOnly; Secure; SameSite=${COOKIE_SAME_SITE}`;
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

#### B. Update Supabase Client Configuration

**File: `src/integrations/supabase/client.ts`**

```typescript
// Add cookie handling to fetch interceptor
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage, // Keep for backward compatibility
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: async (url, options: RequestInit = {}) => {
      const existingHeaders = options.headers;
      const headers = existingHeaders instanceof Headers 
        ? existingHeaders 
        : new Headers(existingHeaders as HeadersInit | undefined);
      
      // Include cookies in requests
      options.credentials = 'include';
      
      // Get session token from cookie (if available)
      const sessionToken = getCookie('echo_session');
      if (sessionToken) {
        // Hash token client-side and send hash in header
        const tokenHash = await hashToken(sessionToken);
        headers.set("x-session-token-hash", tokenHash);
      }
      
      // Fallback: still send device ID for backward compatibility
      const deviceId = localStorage.getItem("deviceId");
      if (deviceId && !sessionToken) {
        headers.set("x-device-id", deviceId);
      }

      const response = await fetch(url, { ...options, headers, credentials: 'include' });
      
      // Handle Set-Cookie headers from server
      const setCookieHeader = response.headers.get('Set-Cookie');
      if (setCookieHeader) {
        // Cookie will be automatically set by browser
        // But we can trigger a storage event if needed
      }
      
      return response;
    },
  },
});

// Helper to get cookie
function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

// Helper to hash token (SHA-256)
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

---

### 3. Frontend Changes

#### A. Update AuthContext

**File: `src/context/AuthContext.tsx`**

```typescript
// Add session management
const [sessionToken, setSessionToken] = useState<string | null>(() => {
  if (typeof window === "undefined") return null;
  return getCookie('echo_session');
});

// Create session on login/onboarding
const createSession = async (profileId: string) => {
  try {
    const deviceId = localStorage.getItem("deviceId");
    const userAgent = navigator.userAgent;
    
    const { data, error } = await supabase.rpc("create_session", {
      p_profile_id: profileId,
      p_device_id: deviceId,
      p_user_agent: userAgent,
      p_duration_hours: 720, // 30 days
    });

    if (error) throw error;

    const result = data?.[0];
    if (result?.session_token) {
      // Set HTTP-only cookie via API endpoint
      await fetch('/api/set-session-cookie', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: result.session_token }),
      });
      
      setSessionToken(result.session_token);
    }
  } catch (error) {
    logError("Failed to create session", error);
  }
};

// Update onboarding flow to create session
useEffect(() => {
  if (profile?.id && !sessionToken) {
    createSession(profile.id);
  }
}, [profile?.id, sessionToken]);
```

#### B. Update LoginLink Component

**File: `src/pages/LoginLink.tsx`**

```typescript
// After redeeming magic login link, create session
const redeem = async () => {
  setStatus("redeeming");
  try {
    const { data, error } = await supabase.rpc("redeem_magic_login_link", { 
      link_token: token 
    });
    if (error) throw error;

    const result = data?.[0];
    if (!result?.profile_id) {
      throw new Error("We couldn't find the account connected to this link.");
    }

    // Create session instead of just storing profileId
    const { data: sessionData, error: sessionError } = await supabase.rpc("create_session", {
      p_profile_id: result.profile_id,
      p_device_id: deviceId,
      p_user_agent: navigator.userAgent,
      p_duration_hours: 720,
    });

    if (sessionError) throw sessionError;

    const sessionToken = sessionData?.[0]?.session_token;
    if (sessionToken) {
      // Set cookie via API
      await fetch('/api/set-session-cookie', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: sessionToken }),
      });
    }

    localStorage.setItem("profileId", result.profile_id);
    setProfileHandle(result.handle ?? null);
    setStatus("success");
    
    setTimeout(() => {
      window.location.href = "/";
    }, 2000);
  } catch (error) {
    // ... error handling
  }
};
```

#### C. Create API Endpoint for Setting Cookies

**File: `src/routes/api/set-session-cookie.ts`** (or use Supabase Edge Function)

Since you can't set HTTP-only cookies from client-side JavaScript, you need a server endpoint:

**Supabase Edge Function: `supabase/functions/set-session-cookie/index.ts`**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const COOKIE_NAME = "echo_session";
const COOKIE_DOMAIN = Deno.env.get("COOKIE_DOMAIN") || ".yourdomain.com";
const COOKIE_SECURE = Deno.env.get("COOKIE_SECURE") === "true";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { token } = await req.json();

  if (!token) {
    return new Response("Token required", { status: 400 });
  }

  const cookieValue = `${COOKIE_NAME}=${token}; Path=/; Domain=${COOKIE_DOMAIN}; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; ${COOKIE_SECURE ? 'Secure;' : ''} SameSite=Lax`;

  return new Response(
    JSON.stringify({ success: true }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieValue,
        "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
        "Access-Control-Allow-Credentials": "true",
      },
    }
  );
});
```

---

### 4. Update RLS Policies

All existing RLS policies that use `profile_ids_for_request()` will automatically work with sessions once you update the function. However, you may want to add explicit session checks:

```sql
-- Example: Update profiles update policy
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (
  id IN (SELECT id FROM public.profile_ids_for_request())
)
WITH CHECK (
  id IN (SELECT id FROM public.profile_ids_for_request())
);
```

---

### 5. Migration Strategy

#### Phase 1: Add Session Support (Backward Compatible)
1. Create sessions table and functions
2. Update `profile_ids_for_request()` to check sessions first, then fall back to device ID
3. Keep existing device-based auth working

#### Phase 2: Enable Session Creation
1. Update onboarding to create sessions
2. Update magic login link redemption to create sessions
3. Add cookie-setting endpoint

#### Phase 3: Migrate Existing Users
1. Create migration script to generate sessions for existing active users
2. Notify users to log in again to get session cookie

#### Phase 4: Deprecate Device-Only Auth (Optional)
1. After sufficient time, make sessions required
2. Remove device-only authentication path

---

### 6. Security Considerations

1. **HTTP-Only Cookies**: Prevents XSS attacks from stealing tokens
2. **Secure Flag**: Use HTTPS in production
3. **SameSite Attribute**: Prevents CSRF attacks
4. **Token Hashing**: Never store plain tokens in database
5. **Session Expiration**: Automatic cleanup of expired sessions
6. **Revocation**: Ability to revoke individual or all sessions
7. **IP Tracking**: Optional IP validation for additional security

---

### 7. Testing Checklist

- [ ] New user onboarding creates session
- [ ] Magic login link creates session
- [ ] Session persists across browser restarts
- [ ] Session works across different browsers (same domain)
- [ ] Session expiration works correctly
- [ ] Session revocation works
- [ ] Backward compatibility with device-based auth
- [ ] RLS policies work with sessions
- [ ] Cookie security flags work correctly
- [ ] CORS handling works with credentials

---

## Estimated Effort

- **Database Changes**: 4-6 hours
- **Backend/Middleware**: 8-12 hours
- **Frontend Changes**: 6-8 hours
- **Testing & Migration**: 4-6 hours
- **Total**: ~22-32 hours

---

## Alternative: Simpler Approach

If full server-side sessions are too complex, you could:

1. **Use Supabase Auth** (if not already): Supabase has built-in session management with cookies
2. **Shared Storage API**: Use IndexedDB with cross-origin sharing (limited browser support)
3. **Keep Magic Links**: Improve UX by making magic links easier to generate/share

---

## Questions to Consider

1. Do you want to completely replace device-based auth or support both?
2. What's your cookie domain strategy? (subdomain sharing, etc.)
3. Do you need session management UI (view/revoke active sessions)?
4. Should sessions expire on inactivity or fixed time?
5. Do you want to track session metadata (IP, user agent, location)?

