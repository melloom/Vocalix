/**
 * API Versioning utilities for Supabase Edge Functions
 * Supports version negotiation and backward compatibility
 */

export const API_VERSIONS = {
  v1: "1.0.0",
  v2: "2.0.0",
} as const;

export const DEFAULT_VERSION = API_VERSIONS.v1;

export interface VersionInfo {
  version: string;
  isDeprecated: boolean;
  deprecationDate?: string;
  sunsetDate?: string;
  migrationGuide?: string;
}

/**
 * Version metadata for each API version
 */
export const VERSION_METADATA: Record<string, VersionInfo> = {
  "1.0.0": {
    version: "1.0.0",
    isDeprecated: false,
  },
  "2.0.0": {
    version: "2.0.0",
    isDeprecated: false,
  },
};

/**
 * Parse API version from request headers
 * Supports:
 * - Accept header: application/vnd.echogarden+json;version=1.0.0
 * - X-API-Version header: 1.0.0
 * - Query parameter: ?version=1.0.0
 */
export function parseApiVersion(req: Request): string {
  // Check X-API-Version header first (explicit version)
  const headerVersion = req.headers.get("x-api-version");
  if (headerVersion) {
    return normalizeVersion(headerVersion);
  }

  // Check Accept header (vendor-specific media type)
  const acceptHeader = req.headers.get("accept");
  if (acceptHeader) {
    const versionMatch = acceptHeader.match(/version=([0-9]+\.[0-9]+\.[0-9]+)/i);
    if (versionMatch) {
      return normalizeVersion(versionMatch[1]);
    }
  }

  // Check query parameter
  const url = new URL(req.url);
  const queryVersion = url.searchParams.get("version");
  if (queryVersion) {
    return normalizeVersion(queryVersion);
  }

  // Return default version
  return DEFAULT_VERSION;
}

/**
 * Normalize version string (e.g., "v1" -> "1.0.0", "1" -> "1.0.0")
 */
function normalizeVersion(version: string): string {
  // Remove 'v' prefix if present
  let normalized = version.replace(/^v/i, "");

  // If version is just a number, append ".0.0"
  if (/^\d+$/.test(normalized)) {
    return `${normalized}.0.0`;
  }

  // If version is "x.y", append ".0"
  if (/^\d+\.\d+$/.test(normalized)) {
    return `${normalized}.0`;
  }

  // Return as-is if already in semver format
  return normalized;
}

/**
 * Check if a version is supported
 */
export function isVersionSupported(version: string): boolean {
  return version in VERSION_METADATA;
}

/**
 * Get version info
 */
export function getVersionInfo(version: string): VersionInfo | null {
  return VERSION_METADATA[version] || null;
}

/**
 * Create version headers for response
 */
export function createVersionHeaders(version: string): Record<string, string> {
  const versionInfo = getVersionInfo(version);
  const headers: Record<string, string> = {
    "X-API-Version": version,
    "API-Version": version,
  };

  if (versionInfo?.isDeprecated) {
    headers["X-API-Deprecated"] = "true";
    if (versionInfo.deprecationDate) {
      headers["X-API-Deprecation-Date"] = versionInfo.deprecationDate;
    }
    if (versionInfo.sunsetDate) {
      headers["X-API-Sunset-Date"] = versionInfo.sunsetDate;
    }
    if (versionInfo.migrationGuide) {
      headers["X-API-Migration-Guide"] = versionInfo.migrationGuide;
    }
  }

  return headers;
}

/**
 * Create error response for unsupported version
 */
export function createUnsupportedVersionResponse(
  requestedVersion: string,
  supportedVersions: string[] = Object.keys(VERSION_METADATA)
): Response {
  return new Response(
    JSON.stringify({
      error: "Unsupported API version",
      requestedVersion,
      supportedVersions,
      message: `API version ${requestedVersion} is not supported. Supported versions: ${supportedVersions.join(", ")}`,
      defaultVersion: DEFAULT_VERSION,
    }),
    {
      status: 400,
      headers: {
        "content-type": "application/json",
        ...createVersionHeaders(DEFAULT_VERSION),
      },
    }
  );
}

/**
 * Version middleware wrapper
 * Wraps an Edge Function handler to add version negotiation
 */
export function withApiVersioning(
  handler: (req: Request, version: string) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const requestedVersion = parseApiVersion(req);

    // Check if version is supported
    if (!isVersionSupported(requestedVersion)) {
      return createUnsupportedVersionResponse(requestedVersion);
    }

    // Call handler with version
    const response = await handler(req, requestedVersion);

    // Add version headers to response
    const versionHeaders = createVersionHeaders(requestedVersion);
    const newHeaders = new Headers(response.headers);
    Object.entries(versionHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}
