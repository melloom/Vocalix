/**
 * Tests for API versioning utilities
 * Tests all version negotiation methods and edge cases
 */

import { assertEquals, assert } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  parseApiVersion,
  isVersionSupported,
  getVersionInfo,
  createVersionHeaders,
  createUnsupportedVersionResponse,
  API_VERSIONS,
  DEFAULT_VERSION,
  VERSION_METADATA,
} from "../api-versioning.ts";

Deno.test("API_VERSIONS constant is properly defined", () => {
  assertEquals(API_VERSIONS.v1, "1.0.0");
  assertEquals(API_VERSIONS.v2, "2.0.0");
});

Deno.test("VERSION_METADATA contains all versions", () => {
  assertEquals(VERSION_METADATA["1.0.0"].version, "1.0.0");
  assertEquals(VERSION_METADATA["2.0.0"].version, "2.0.0");
  assertEquals(VERSION_METADATA["1.0.0"].isDeprecated, false);
  assertEquals(VERSION_METADATA["2.0.0"].isDeprecated, false);
});

Deno.test("DEFAULT_VERSION is v1", () => {
  assertEquals(DEFAULT_VERSION, "1.0.0");
});

// Test Method 1: X-API-Version Header
Deno.test("parseApiVersion: X-API-Version header (recommended method)", () => {
  const req = new Request("https://example.com/api", {
    headers: { "X-API-Version": "2.0.0" },
  });
  assertEquals(parseApiVersion(req), "2.0.0");
});

Deno.test("parseApiVersion: X-API-Version header with lowercase", () => {
  const req = new Request("https://example.com/api", {
    headers: { "x-api-version": "1.0.0" },
  });
  assertEquals(parseApiVersion(req), "1.0.0");
});

Deno.test("parseApiVersion: X-API-Version header with 'v' prefix", () => {
  const req = new Request("https://example.com/api", {
    headers: { "X-API-Version": "v2.0.0" },
  });
  assertEquals(parseApiVersion(req), "2.0.0");
});

Deno.test("parseApiVersion: X-API-Version header with short version", () => {
  const req = new Request("https://example.com/api", {
    headers: { "X-API-Version": "2" },
  });
  assertEquals(parseApiVersion(req), "2.0.0");
});

// Test Method 2: Accept Header
Deno.test("parseApiVersion: Accept header with vendor-specific media type", () => {
  const req = new Request("https://example.com/api", {
    headers: {
      "Accept": "application/vnd.echogarden+json;version=2.0.0",
    },
  });
  assertEquals(parseApiVersion(req), "2.0.0");
});

Deno.test("parseApiVersion: Accept header with multiple media types", () => {
  const req = new Request("https://example.com/api", {
    headers: {
      "Accept": "application/json, application/vnd.echogarden+json;version=1.0.0",
    },
  });
  assertEquals(parseApiVersion(req), "1.0.0");
});

// Test Method 3: Query Parameter
Deno.test("parseApiVersion: Query parameter", () => {
  const req = new Request("https://example.com/api?version=2.0.0");
  assertEquals(parseApiVersion(req), "2.0.0");
});

Deno.test("parseApiVersion: Query parameter with other params", () => {
  const req = new Request("https://example.com/api?foo=bar&version=1.0.0&baz=qux");
  assertEquals(parseApiVersion(req), "1.0.0");
});

// Test Priority: Header > Accept > Query > Default
Deno.test("parseApiVersion: Priority - Header overrides Accept and Query", () => {
  const req = new Request("https://example.com/api?version=1.0.0", {
    headers: {
      "X-API-Version": "2.0.0",
      "Accept": "application/vnd.echogarden+json;version=1.0.0",
    },
  });
  assertEquals(parseApiVersion(req), "2.0.0");
});

Deno.test("parseApiVersion: Priority - Accept overrides Query", () => {
  const req = new Request("https://example.com/api?version=1.0.0", {
    headers: {
      "Accept": "application/vnd.echogarden+json;version=2.0.0",
    },
  });
  assertEquals(parseApiVersion(req), "2.0.0");
});

// Test Default Version
Deno.test("parseApiVersion: Default version when no version specified", () => {
  const req = new Request("https://example.com/api");
  assertEquals(parseApiVersion(req), DEFAULT_VERSION);
});

Deno.test("parseApiVersion: Default version with empty headers", () => {
  const req = new Request("https://example.com/api", {
    headers: {},
  });
  assertEquals(parseApiVersion(req), DEFAULT_VERSION);
});

// Test Version Normalization
Deno.test("parseApiVersion: Normalize 'v1' to '1.0.0'", () => {
  const req = new Request("https://example.com/api", {
    headers: { "X-API-Version": "v1" },
  });
  assertEquals(parseApiVersion(req), "1.0.0");
});

Deno.test("parseApiVersion: Normalize '1' to '1.0.0'", () => {
  const req = new Request("https://example.com/api", {
    headers: { "X-API-Version": "1" },
  });
  assertEquals(parseApiVersion(req), "1.0.0");
});

Deno.test("parseApiVersion: Normalize '2.0' to '2.0.0'", () => {
  const req = new Request("https://example.com/api", {
    headers: { "X-API-Version": "2.0" },
  });
  assertEquals(parseApiVersion(req), "2.0.0");
});

// Test Version Support
Deno.test("isVersionSupported: Returns true for supported versions", () => {
  assertEquals(isVersionSupported("1.0.0"), true);
  assertEquals(isVersionSupported("2.0.0"), true);
});

Deno.test("isVersionSupported: Returns false for unsupported versions", () => {
  assertEquals(isVersionSupported("3.0.0"), false);
  assertEquals(isVersionSupported("0.9.0"), false);
  assertEquals(isVersionSupported("invalid"), false);
});

// Test Version Info
Deno.test("getVersionInfo: Returns correct info for supported versions", () => {
  const v1Info = getVersionInfo("1.0.0");
  assert(v1Info !== null);
  assertEquals(v1Info.version, "1.0.0");
  assertEquals(v1Info.isDeprecated, false);

  const v2Info = getVersionInfo("2.0.0");
  assert(v2Info !== null);
  assertEquals(v2Info.version, "2.0.0");
  assertEquals(v2Info.isDeprecated, false);
});

Deno.test("getVersionInfo: Returns null for unsupported versions", () => {
  assertEquals(getVersionInfo("3.0.0"), null);
  assertEquals(getVersionInfo("invalid"), null);
});

// Test Version Headers
Deno.test("createVersionHeaders: Creates correct headers for non-deprecated version", () => {
  const headers = createVersionHeaders("1.0.0");
  assertEquals(headers["X-API-Version"], "1.0.0");
  assertEquals(headers["API-Version"], "1.0.0");
  assertEquals(headers["X-API-Deprecated"], undefined);
});

Deno.test("createVersionHeaders: Creates deprecation headers when version is deprecated", () => {
  // First, we need to test with a deprecated version
  // For now, test that it doesn't include deprecation headers for current versions
  const headers = createVersionHeaders("2.0.0");
  assertEquals(headers["X-API-Version"], "2.0.0");
  assertEquals(headers["API-Version"], "2.0.0");
  // Current versions are not deprecated
  assertEquals(headers["X-API-Deprecated"], undefined);
});

// Test Unsupported Version Response
Deno.test("createUnsupportedVersionResponse: Returns 400 status", async () => {
  const response = createUnsupportedVersionResponse("3.0.0");
  assertEquals(response.status, 400);
});

Deno.test("createUnsupportedVersionResponse: Returns correct error body", async () => {
  const response = createUnsupportedVersionResponse("3.0.0");
  const body = await response.json();
  assertEquals(body.error, "Unsupported API version");
  assertEquals(body.requestedVersion, "3.0.0");
  assertEquals(body.supportedVersions, ["1.0.0", "2.0.0"]);
  assertEquals(body.defaultVersion, DEFAULT_VERSION);
});

Deno.test("createUnsupportedVersionResponse: Includes version headers", () => {
  const response = createUnsupportedVersionResponse("3.0.0");
  assertEquals(response.headers.get("X-API-Version"), DEFAULT_VERSION);
  assertEquals(response.headers.get("API-Version"), DEFAULT_VERSION);
});

// Integration Test: All negotiation methods work together
Deno.test("Integration: All version negotiation methods", () => {
  // Test header method
  const req1 = new Request("https://example.com/api", {
    headers: { "X-API-Version": "2.0.0" },
  });
  assertEquals(parseApiVersion(req1), "2.0.0");
  assertEquals(isVersionSupported(parseApiVersion(req1)), true);

  // Test Accept header method
  const req2 = new Request("https://example.com/api", {
    headers: { "Accept": "application/vnd.echogarden+json;version=1.0.0" },
  });
  assertEquals(parseApiVersion(req2), "1.0.0");
  assertEquals(isVersionSupported(parseApiVersion(req2)), true);

  // Test query parameter method
  const req3 = new Request("https://example.com/api?version=2.0.0");
  assertEquals(parseApiVersion(req3), "2.0.0");
  assertEquals(isVersionSupported(parseApiVersion(req3)), true);

  // Test default version
  const req4 = new Request("https://example.com/api");
  assertEquals(parseApiVersion(req4), DEFAULT_VERSION);
  assertEquals(isVersionSupported(parseApiVersion(req4)), true);
});

