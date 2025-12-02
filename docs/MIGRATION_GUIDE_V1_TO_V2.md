# Migration Guide: API v1.0.0 to v2.0.0

This guide helps you migrate from API version 1.0.0 to 2.0.0.

## Overview

API version 2.0.0 introduces enhanced features while maintaining backward compatibility with version 1.0.0. This is a **non-breaking** update, meaning existing v1.0.0 clients will continue to work without changes.

## What's New in v2.0.0

### Enhanced Response Format

Version 2.0.0 includes additional metadata in responses:

**v1.0.0 Response:**
```json
{
  "flags": [...],
  "reports": [...]
}
```

**v2.0.0 Response:**
```json
{
  "flags": [...],
  "reports": [...],
  "version": "2.0.0",
  "metadata": {
    "timestamp": "2025-01-27T12:00:00Z",
    "totalCount": 42
  }
}
```

### Improved Error Messages

Version 2.0.0 provides more detailed error information:

**v1.0.0 Error:**
```json
{
  "error": "Action is required"
}
```

**v2.0.0 Error:**
```json
{
  "error": "Action is required",
  "code": "MISSING_ACTION",
  "details": {
    "field": "action",
    "expected": "string",
    "received": "undefined"
  }
}
```

## Migration Steps

### Step 1: Update Your Client Code

#### Option A: Gradual Migration (Recommended)

Continue using v1.0.0 while testing v2.0.0:

```typescript
// Test v2.0.0 in development
const testResponse = await fetch('/functions/v1/admin-review', {
  method: 'POST',
  headers: {
    'X-API-Version': '2.0.0', // Test new version
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action: 'list' }),
});

// Production still uses v1.0.0
const prodResponse = await fetch('/functions/v1/admin-review', {
  method: 'POST',
  headers: {
    'X-API-Version': '1.0.0', // Current version
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action: 'list' }),
});
```

#### Option B: Immediate Migration

Update all requests to use v2.0.0:

```typescript
// Before (v1.0.0)
const response = await fetch('/functions/v1/admin-review', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action: 'list' }),
});

// After (v2.0.0)
const response = await fetch('/functions/v1/admin-review', {
  method: 'POST',
  headers: {
    'X-API-Version': '2.0.0',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action: 'list' }),
});
```

### Step 2: Handle New Response Fields

If you want to use the new metadata fields:

```typescript
const response = await fetch('/functions/v1/admin-review', {
  method: 'POST',
  headers: {
    'X-API-Version': '2.0.0',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action: 'list' }),
});

const data = await response.json();

// v2.0.0 includes additional fields
if (data.version === '2.0.0') {
  console.log('Total count:', data.metadata?.totalCount);
  console.log('Timestamp:', data.metadata?.timestamp);
}
```

### Step 3: Update Error Handling

Take advantage of improved error messages:

```typescript
try {
  const response = await fetch('/functions/v1/admin-review', {
    method: 'POST',
    headers: {
      'X-API-Version': '2.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'list' }),
  });

  if (!response.ok) {
    const error = await response.json();
    
    // v2.0.0 provides error codes
    if (error.code === 'MISSING_ACTION') {
      // Handle missing action error
      console.error('Action is required:', error.details);
    }
  }
} catch (error) {
  console.error('Request failed:', error);
}
```

## Backward Compatibility

Version 2.0.0 is **fully backward compatible** with v1.0.0. This means:

- ✅ All v1.0.0 requests will continue to work
- ✅ No breaking changes to existing endpoints
- ✅ Existing clients don't need immediate updates
- ✅ You can migrate at your own pace

## Testing Your Migration

### 1. Test in Development

```bash
# Test v2.0.0
curl -X POST https://your-dev-project.supabase.co/functions/v1/admin-review \
  -H "X-API-Version: 2.0.0" \
  -H "Content-Type: application/json" \
  -d '{"action":"list"}'
```

### 2. Verify Response Format

Ensure your code handles both response formats:

```typescript
const data = await response.json();

// Handle both v1.0.0 and v2.0.0 responses
const flags = data.flags || [];
const reports = data.reports || [];

// v2.0.0 specific fields (optional)
if (data.version === '2.0.0') {
  // Use new metadata
  const totalCount = data.metadata?.totalCount;
}
```

### 3. Monitor Deprecation Headers

Check for deprecation warnings:

```typescript
const response = await fetch('/functions/v1/admin-review', {
  method: 'POST',
  headers: {
    'X-API-Version': '1.0.0',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action: 'list' }),
});

const isDeprecated = response.headers.get('X-API-Deprecated') === 'true';
if (isDeprecated) {
  const sunsetDate = response.headers.get('X-API-Sunset-Date');
  console.warn(`v1.0.0 will be sunset on ${sunsetDate}`);
}
```

## Common Pitfalls

### ❌ Don't Assume v2.0.0 Fields Exist

```typescript
// Bad: Assumes v2.0.0 fields exist
const totalCount = data.metadata.totalCount; // May be undefined in v1.0.0

// Good: Check version or use optional chaining
const totalCount = data.version === '2.0.0' 
  ? data.metadata?.totalCount 
  : undefined;
```

### ❌ Don't Ignore Error Codes

```typescript
// Bad: Only checks error message
if (error.error === 'Action is required') { ... }

// Good: Use error code for reliable checks
if (error.code === 'MISSING_ACTION') { ... }
```

## Timeline

- **2025-01-27**: v2.0.0 released
- **Future**: v1.0.0 will be deprecated (6 months notice)
- **Future**: v1.0.0 will be sunset (after deprecation period)

## Support

If you encounter issues during migration:

1. Check the [API Versioning Guide](./API_VERSIONING.md)
2. Review error responses for detailed information
3. Test with both versions to identify differences

## Summary

- ✅ v2.0.0 is backward compatible with v1.0.0
- ✅ No breaking changes
- ✅ Enhanced features available in v2.0.0
- ✅ Migrate at your own pace
- ✅ Test thoroughly before production deployment

---

**Last Updated**: 2025-01-27

