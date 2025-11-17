/**
 * CSRF Protection Utilities
 * Implements CSRF token generation and validation for state-changing operations
 */

/**
 * Generate a CSRF token
 * In production, this should use a cryptographically secure random generator
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Store CSRF token in session storage
 */
export function storeCsrfToken(token: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('csrf_token', token);
  }
}

/**
 * Get stored CSRF token
 */
export function getCsrfToken(): string | null {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('csrf_token');
  }
  return null;
}

/**
 * Validate CSRF token
 */
export function validateCsrfToken(token: string | null): boolean {
  const storedToken = getCsrfToken();
  if (!storedToken || !token) {
    return false;
  }
  return storedToken === token;
}

/**
 * Generate and store a new CSRF token
 * Call this when the page loads or after authentication
 */
export function initializeCsrfToken(): string {
  const token = generateCsrfToken();
  storeCsrfToken(token);
  return token;
}

/**
 * Get CSRF token for use in request headers
 */
export function getCsrfTokenForRequest(): string | null {
  return getCsrfToken();
}

/**
 * Check if an operation requires CSRF protection
 * State-changing operations (POST, PUT, DELETE, PATCH) require CSRF tokens
 */
export function requiresCsrfProtection(method: string): boolean {
  const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  return stateChangingMethods.includes(method.toUpperCase());
}

