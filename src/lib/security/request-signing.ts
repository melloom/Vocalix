/**
 * Request Signing Utilities
 * Implements HMAC request signing to prevent replay attacks
 */

/**
 * Generate a request signature using HMAC-SHA256
 * @param method HTTP method
 * @param path Request path
 * @param body Request body (stringified)
 * @param timestamp Request timestamp
 * @param secret Secret key for signing (should be stored securely)
 * @returns Base64-encoded signature
 */
export async function signRequest(
  method: string,
  path: string,
  body: string | null,
  timestamp: number,
  secret: string
): Promise<string> {
  // Create the message to sign
  const message = `${method.toUpperCase()}\n${path}\n${timestamp}\n${body || ''}`;
  
  // Import the secret key
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Sign the message
  const messageData = encoder.encode(message);
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  
  // Convert to base64
  const signatureArray = Array.from(new Uint8Array(signature));
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
  
  return signatureBase64;
}

/**
 * Verify a request signature
 * @param method HTTP method
 * @param path Request path
 * @param body Request body (stringified)
 * @param timestamp Request timestamp
 * @param signature Provided signature
 * @param secret Secret key for verification
 * @param maxAgeMs Maximum age of request in milliseconds (default: 5 minutes)
 * @returns true if signature is valid and request is not expired
 */
export async function verifyRequestSignature(
  method: string,
  path: string,
  body: string | null,
  timestamp: number,
  signature: string,
  secret: string,
  maxAgeMs: number = 5 * 60 * 1000 // 5 minutes
): Promise<boolean> {
  // Check if request is too old (prevent replay attacks)
  const now = Date.now();
  const age = now - timestamp;
  if (age > maxAgeMs || age < 0) {
    return false; // Request expired or timestamp in future
  }
  
  // Generate expected signature
  const expectedSignature = await signRequest(method, path, body, timestamp, secret);
  
  // Constant-time comparison to prevent timing attacks
  return constantTimeEquals(signature, expectedSignature);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Get client secret from environment or generate a device-specific secret
 * In production, this should be stored securely per device/user
 */
export function getClientSecret(): string {
  // In a real implementation, this should:
  // 1. Use a device-specific secret stored securely
  // 2. Or use a user session secret
  // 3. Or use an API key
  
  // For now, we'll use a device ID-based approach
  if (typeof window !== 'undefined') {
    const deviceId = localStorage.getItem('deviceId');
    if (deviceId) {
      // In production, derive a secret from device ID + server-side secret
      // This is just a placeholder - actual implementation should be more secure
      return `device_secret_${deviceId}`;
    }
  }
  
  // Fallback (not secure, but better than nothing)
  return 'default_secret_change_in_production';
}

/**
 * Add signature headers to a request
 */
export async function addSignatureHeaders(
  method: string,
  path: string,
  body: string | null
): Promise<Record<string, string>> {
  const timestamp = Date.now();
  const secret = getClientSecret();
  const signature = await signRequest(method, path, body, timestamp, secret);
  
  return {
    'X-Request-Timestamp': timestamp.toString(),
    'X-Request-Signature': signature,
  };
}

