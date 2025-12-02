/**
 * Diary Encryption Utility
 * 
 * Uses Web Crypto API for client-side encryption/decryption
 * All encryption happens in the browser before data is sent to the server
 */

// Algorithm configuration
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16;
const ITERATIONS = 100000; // PBKDF2 iterations

/**
 * Derive an encryption key from a password using PBKDF2
 */
async function deriveKey(
  password: string,
  salt: Uint8Array,
  usage: 'encrypt' | 'decrypt' = 'encrypt'
): Promise<CryptoKey> {
  // Import password as a key
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive the encryption key
  // Create a new ArrayBuffer from the Uint8Array to ensure proper type
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    false,
    [usage]
  );

  return key;
}

/**
 * Generate a random salt
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Generate a random IV (Initialization Vector)
 */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Convert Uint8Array to base64 string
 */
export function arrayToBase64(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array));
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToArray(base64: string): Uint8Array {
  const binary = atob(base64);
  return new Uint8Array(binary.split('').map(char => char.charCodeAt(0)));
}

/**
 * Hash a password for storage (using SHA-256)
 * This is used to verify the password without storing it
 */
export async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + arrayToBase64(salt));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a password against a stored hash
 */
export async function verifyPassword(
  password: string,
  salt: Uint8Array,
  storedHash: string
): Promise<boolean> {
  const computedHash = await hashPassword(password, salt);
  return computedHash === storedHash;
}

/**
 * Encrypt text using AES-GCM
 */
export async function encryptText(
  text: string,
  password: string,
  salt: Uint8Array
): Promise<string> {
  try {
    // Generate IV
    const iv = generateIV();

    // Derive encryption key
    const key = await deriveKey(password, salt, 'encrypt');

    // Encrypt the text
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
    const encrypted = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: ivBuffer,
      },
      key,
      data
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Return as base64 string
    return arrayToBase64(combined);
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt text');
  }
}

/**
 * Decrypt text using AES-GCM
 */
export async function decryptText(
  encryptedData: string,
  password: string,
  salt: Uint8Array
): Promise<string> {
  try {
    // Decode from base64
    const combined = base64ToArray(encryptedData);

    // Extract IV and encrypted data
    const iv = combined.slice(0, IV_LENGTH);
    const encrypted = combined.slice(IV_LENGTH);

    // Derive decryption key
    const key = await deriveKey(password, salt, 'decrypt');

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv,
      },
      key,
      encrypted
    );

    // Convert to string
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt text. Wrong password?');
  }
}

/**
 * Encrypt a diary entry (content, title, tags, mood)
 */
export async function encryptDiaryEntry(
  entry: {
    content: string;
    title?: string;
    tags?: string[];
    mood?: string;
  },
  password: string,
  salt: Uint8Array
): Promise<{
  encryptedContent: string;
  encryptedTitle?: string;
  encryptedTags?: string;
  encryptedMood?: string;
}> {
  const encryptedContent = await encryptText(entry.content, password, salt);
  
  const result: {
    encryptedContent: string;
    encryptedTitle?: string;
    encryptedTags?: string;
    encryptedMood?: string;
  } = {
    encryptedContent,
  };

  if (entry.title) {
    result.encryptedTitle = await encryptText(entry.title, password, salt);
  }

  if (entry.tags && entry.tags.length > 0) {
    const tagsJson = JSON.stringify(entry.tags);
    result.encryptedTags = await encryptText(tagsJson, password, salt);
  }

  if (entry.mood) {
    result.encryptedMood = await encryptText(entry.mood, password, salt);
  }

  return result;
}

/**
 * Decrypt a diary entry
 */
export async function decryptDiaryEntry(
  encryptedEntry: {
    encrypted_content: string;
    encrypted_title?: string | null;
    encrypted_tags?: string | null;
    encrypted_mood?: string | null;
  },
  password: string,
  salt: Uint8Array
): Promise<{
  content: string;
  title?: string;
  tags?: string[];
  mood?: string;
}> {
  const content = await decryptText(encryptedEntry.encrypted_content, password, salt);
  
  const result: {
    content: string;
    title?: string;
    tags?: string[];
    mood?: string;
  } = {
    content,
  };

  if (encryptedEntry.encrypted_title) {
    result.title = await decryptText(encryptedEntry.encrypted_title, password, salt);
  }

  if (encryptedEntry.encrypted_tags) {
    try {
      const tagsJson = await decryptText(encryptedEntry.encrypted_tags, password, salt);
      result.tags = JSON.parse(tagsJson);
    } catch (error) {
      console.error('Failed to decrypt tags:', error);
      result.tags = [];
    }
  }

  if (encryptedEntry.encrypted_mood) {
    result.mood = await decryptText(encryptedEntry.encrypted_mood, password, salt);
  }

  return result;
}

/**
 * Calculate word count (approximate)
 */
export function calculateWordCount(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

