# API Versioning Guide

This document explains how API versioning is implemented in Echo Garden's Edge Functions.

## Overview

API versioning allows us to:
- Make breaking changes to the API without breaking existing clients
- Maintain backward compatibility
- Provide clear deprecation paths for old versions
- Document API changes effectively

## Version Format

We use [Semantic Versioning](https://semver.org/) (SemVer) format: `MAJOR.MINOR.PATCH`
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

Current supported versions:
- `1.0.0` - Initial API version
- `2.0.0` - Latest version (example)

## How to Request a Specific Version

Clients can request a specific API version using one of these methods:

### Method 1: X-API-Version Header (Recommended)
```http
POST /functions/v1/admin-review
X-API-Version: 1.0.0
```

### Method 2: Accept Header (Vendor-Specific Media Type)
```http
POST /functions/v1/admin-review
Accept: application/vnd.echogarden+json;version=1.0.0
```

### Method 3: Query Parameter
```http
POST /functions/v1/admin-review?version=1.0.0
```

If no version is specified, the **default version** (`1.0.0`) is used.

## Implementation in Edge Functions

### Basic Example

```typescript
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { withApiVersioning, parseApiVersion } from "../_shared/api-versioning.ts";

serve(withApiVersioning(async (req: Request, version: string) => {
  // Handle request with version context
  if (version === "1.0.0") {
    // Handle v1.0.0 request
    return new Response(JSON.stringify({ data: "v1 response" }), {
      headers: { "content-type": "application/json" },
    });
  }
  
  // Handle v2.0.0 request
  return new Response(JSON.stringify({ data: "v2 response" }), {
    headers: { "content-type": "application/json" },
  });
}));
```

### Manual Version Parsing

If you need more control, you can parse the version manually:

```typescript
import { parseApiVersion, isVersionSupported } from "../_shared/api-versioning.ts";

serve(async (req: Request) => {
  const version = parseApiVersion(req);
  
  if (!isVersionSupported(version)) {
    return new Response(
      JSON.stringify({ error: "Unsupported API version" }),
      { status: 400 }
    );
  }
  
  // Handle request...
});
```

## Version Headers in Responses

All API responses include version headers:

- `X-API-Version`: The version used for this request
- `API-Version`: Alias for X-API-Version

If a version is deprecated, additional headers are included:

- `X-API-Deprecated`: `true`
- `X-API-Deprecation-Date`: Date when version was deprecated
- `X-API-Sunset-Date`: Date when version will be removed
- `X-API-Migration-Guide`: URL to migration guide

## Deprecating a Version

To deprecate a version, update `VERSION_METADATA` in `api-versioning.ts`:

```typescript
export const VERSION_METADATA: Record<string, VersionInfo> = {
  "1.0.0": {
    version: "1.0.0",
    isDeprecated: true,
    deprecationDate: "2025-01-01",
    sunsetDate: "2025-07-01",
    migrationGuide: "https://docs.echogarden.com/migrations/v1-to-v2",
  },
  "2.0.0": {
    version: "2.0.0",
    isDeprecated: false,
  },
};
```

## Best Practices

### 1. Maintain Backward Compatibility

When adding new features, prefer adding optional fields rather than breaking changes:

```typescript
// Good: Add optional field
interface Response {
  data: string;
  newField?: string; // Optional, backward compatible
}

// Bad: Remove or change existing field
interface Response {
  // oldField: string; // Breaking change!
  newField: string;
}
```

### 2. Document Changes

Document all API changes in your changelog:

- What changed?
- Why did it change?
- How to migrate?

### 3. Provide Migration Guides

When deprecating a version, provide clear migration guides with:
- Before/after examples
- Code snippets
- Common pitfalls

### 4. Gradual Deprecation

Follow this timeline:
1. **Announce deprecation**: Add deprecation headers (6 months before)
2. **Warn users**: Log warnings for deprecated versions
3. **Sunset version**: Remove support (after notice period)

### 5. Version Strategy

- **New features** → New minor version (1.0.0 → 1.1.0)
- **Breaking changes** → New major version (1.0.0 → 2.0.0)
- **Bug fixes** → New patch version (1.0.0 → 1.0.1)

## Client Implementation

### JavaScript/TypeScript

```typescript
// Set version in headers
const response = await fetch('/functions/v1/admin-review', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Version': '2.0.0',
  },
  body: JSON.stringify({ action: 'list' }),
});

// Check if version is deprecated
const apiVersion = response.headers.get('X-API-Version');
const isDeprecated = response.headers.get('X-API-Deprecated') === 'true';

if (isDeprecated) {
  const sunsetDate = response.headers.get('X-API-Sunset-Date');
  console.warn(`API version ${apiVersion} is deprecated. Sunset date: ${sunsetDate}`);
}
```

### cURL

```bash
curl -X POST https://your-project.supabase.co/functions/v1/admin-review \
  -H "X-API-Version: 2.0.0" \
  -H "Content-Type: application/json" \
  -d '{"action":"list"}'
```

## Testing

Test your versioning implementation:

```typescript
// Test default version
const response1 = await fetch('/functions/v1/admin-review');
// Should use v1.0.0

// Test specific version
const response2 = await fetch('/functions/v1/admin-review', {
  headers: { 'X-API-Version': '2.0.0' }
});
// Should use v2.0.0

// Test unsupported version
const response3 = await fetch('/functions/v1/admin-review', {
  headers: { 'X-API-Version': '3.0.0' }
});
// Should return 400 error
```

## Migration Checklist

When adding a new version:

- [ ] Update `API_VERSIONS` constant
- [ ] Add version to `VERSION_METADATA`
- [ ] Implement version-specific logic in Edge Functions
- [ ] Update API documentation
- [ ] Add migration guide (if breaking changes)
- [ ] Test all version negotiation methods
- [ ] Update client examples
- [ ] Announce version changes in changelog

## Resources

- [Semantic Versioning](https://semver.org/)
- [REST API Versioning Best Practices](https://restfulapi.net/versioning/)
- [API Versioning Strategies](https://www.baeldung.com/rest-versioning)

---

**Last Updated**: 2025-01-XX
**Current Default Version**: 1.0.0

