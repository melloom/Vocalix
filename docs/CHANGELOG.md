# Changelog

All notable changes to the Echo Garden API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2025-01-27

### Added
- **API Versioning System**: Comprehensive API versioning infrastructure for Edge Functions
  - Support for multiple API versions (1.0.0 and 2.0.0)
  - Three version negotiation methods:
    - `X-API-Version` header (recommended)
    - `Accept` header with vendor-specific media type
    - Query parameter (`?version=x.x.x`)
  - Automatic version normalization (e.g., "v1" → "1.0.0", "2" → "2.0.0")
  - Version headers in all API responses
  - Deprecation support with sunset dates and migration guides

- **Enhanced API Responses** (v2.0.0):
  - Additional metadata fields in responses
  - Improved error messages with error codes
  - Detailed error information for debugging

- **Testing Infrastructure**:
  - Comprehensive test suite for API versioning (`api-versioning.test.ts`)
  - Tests for all version negotiation methods
  - Tests for version normalization
  - Tests for error handling

- **Documentation**:
  - Complete API Versioning Guide (`API_VERSIONING.md`)
  - Migration Guide from v1.0.0 to v2.0.0 (`MIGRATION_GUIDE_V1_TO_V2.md`)
  - Updated client examples (JavaScript/TypeScript, cURL, Python)
  - Best practices and versioning strategies

### Changed
- **admin-review Edge Function**: Now supports version-specific logic
  - v2.0.0 returns enhanced response format with version metadata
  - Backward compatible with v1.0.0

### Technical Details
- Version negotiation priority: Header > Accept > Query > Default
- Default version: 1.0.0
- Supported versions: 1.0.0, 2.0.0
- All responses include `X-API-Version` and `API-Version` headers

## [1.0.0] - Initial Release

### Added
- Initial API version
- Basic Edge Functions
- Core functionality

---

## Version Support Policy

- **Current Versions**: 1.0.0 (default), 2.0.0 (latest)
- **Deprecation Notice**: 6 months before sunset
- **Sunset Policy**: Versions are maintained for at least 12 months after deprecation

For more information, see:
- [API Versioning Guide](./API_VERSIONING.md)
- [Migration Guide v1.0.0 to v2.0.0](./MIGRATION_GUIDE_V1_TO_V2.md)

---

[Unreleased]: https://github.com/your-org/echo-garden/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/your-org/echo-garden/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/your-org/echo-garden/releases/tag/v1.0.0

