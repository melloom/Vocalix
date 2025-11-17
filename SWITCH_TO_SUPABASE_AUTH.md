# Switch to Supabase Auth (Anonymous) - Much Easier!

## Why This Is Better

### Current System (Custom Device-Based)
- ❌ Custom RPC functions (create_session) - PostgREST cache issues
- ❌ Custom session management
- ❌ Custom cross-browser logic
- ❌ Complex device tracking
- ❌ Manual cookie handling

### Supabase Auth (Anonymous)
- ✅ Built-in anonymous authentication
- ✅ Built-in session management (no RPC functions needed!)
- ✅ Built-in cross-browser support
- ✅ Automatic cookie handling
- ✅ No PostgREST cache issues
- ✅ Works out of the box

## How It Works

1. **Anonymous Sign-In**: `supabase.auth.signInAnonymously()`
2. **Automatic Sessions**: Supabase handles everything
3. **Cross-Browser**: Works automatically via cookies
4. **RLS Integration**: Use `auth.uid()` instead of custom functions

## Migration Steps

### 1. Enable Anonymous Auth in Supabase
- Go to: Authentication → Providers → Enable "Anonymous"
- That's it!

### 2. Update Your Code

**Before (Current):**
```typescript
// Custom device-based auth
const deviceId = localStorage.getItem("deviceId");
// Custom session creation
await supabase.rpc("create_session", {...});
```

**After (Supabase Auth):**
```typescript
// Simple anonymous auth
const { data, error } = await supabase.auth.signInAnonymously();
// That's it! Session is automatic
```

### 3. Update RLS Policies

**Before:**
```sql
-- Custom device-based
WHERE device_id = (current_setting('request.headers', true)::json->>'x-device-id')
```

**After:**
```sql
-- Supabase Auth
WHERE id = auth.uid()
```

## Benefits

1. **No More RPC Functions**: No create_session, no PostgREST issues
2. **Automatic Sessions**: Supabase handles it all
3. **Cross-Browser Works**: Built-in cookie support
4. **Simpler Code**: Less custom logic
5. **Better Security**: Supabase handles token rotation, etc.

## What You'd Need to Change

1. Replace device-based auth with `supabase.auth.signInAnonymously()`
2. Update RLS policies to use `auth.uid()` instead of device_id
3. Remove custom session management code
4. Remove create_session RPC function (not needed!)

## Want Me to Help Migrate?

I can:
1. Update your AuthContext to use Supabase Auth
2. Update your RLS policies
3. Remove the custom session code
4. Make it work with anonymous users

This would solve ALL your current issues!

