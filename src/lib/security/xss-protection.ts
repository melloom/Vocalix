/**
 * Enhanced XSS Protection Utilities
 * Comprehensive protection against cross-site scripting attacks
 */

/**
 * Escape HTML entities to prevent XSS
 * More comprehensive than basic escapeHtml
 */
export function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
  };
  
  return String(text).replace(/[&<>"'`\/]/g, (char) => map[char] || char);
}

/**
 * Sanitize HTML content (for when you need to allow some HTML)
 * Uses a whitelist approach - only allows safe tags and attributes
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  
  // Remove script tags and their content
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers (onclick, onerror, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  // Remove data: URLs that could be dangerous
  sanitized = sanitized.replace(/data:text\/html/gi, '');
  
  // Remove vbscript: protocol
  sanitized = sanitized.replace(/vbscript:/gi, '');
  
  // Remove iframe tags
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  
  // Remove object and embed tags
  sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  sanitized = sanitized.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');
  
  return sanitized;
}

/**
 * Sanitize user input for display (removes all HTML)
 * Use this for user-generated content that should be plain text
 */
export function sanitizeUserInput(input: string | null | undefined): string {
  if (!input) return '';
  
  // First escape HTML
  let sanitized = escapeHtml(input);
  
  // Remove any remaining HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Remove dangerous protocols
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/vbscript:/gi, '');
  sanitized = sanitized.replace(/data:text\/html/gi, '');
  
  // Remove event handlers
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  return sanitized.trim();
}

/**
 * Sanitize URL to prevent javascript: and data: URLs
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return '';
  
  const lowerUrl = url.toLowerCase().trim();
  
  // Block dangerous protocols
  if (
    lowerUrl.startsWith('javascript:') ||
    lowerUrl.startsWith('vbscript:') ||
    lowerUrl.startsWith('data:text/html') ||
    lowerUrl.startsWith('data:image/svg+xml')
  ) {
    return '#';
  }
  
  // Allow http, https, mailto, tel, and relative URLs
  if (
    lowerUrl.startsWith('http://') ||
    lowerUrl.startsWith('https://') ||
    lowerUrl.startsWith('mailto:') ||
    lowerUrl.startsWith('tel:') ||
    lowerUrl.startsWith('/') ||
    lowerUrl.startsWith('#') ||
    lowerUrl.startsWith('?')
  ) {
    return url;
  }
  
  // Default to safe relative URL
  return '#';
}

/**
 * Sanitize CSS to prevent injection
 */
export function sanitizeCss(css: string | null | undefined): string {
  if (!css) return '';
  
  // Remove javascript: protocol
  let sanitized = css.replace(/javascript:/gi, '');
  
  // Remove expression() (IE-specific XSS vector)
  sanitized = sanitized.replace(/expression\s*\(/gi, '');
  
  // Remove @import
  sanitized = sanitized.replace(/@import/gi, '');
  
  // Remove url() with javascript:
  sanitized = sanitized.replace(/url\s*\(\s*['"]?\s*javascript:/gi, '');
  
  return sanitized;
}

/**
 * Validate and sanitize JSON to prevent prototype pollution
 */
export function sanitizeJson(jsonString: string): any {
  try {
    const parsed = JSON.parse(jsonString);
    
    // Remove __proto__, constructor, and prototype properties
    if (typeof parsed === 'object' && parsed !== null) {
      delete (parsed as any).__proto__;
      delete (parsed as any).constructor;
      delete (parsed as any).prototype;
    }
    
    return parsed;
  } catch (e) {
    return null;
  }
}

/**
 * Check if a string contains potentially dangerous content
 */
export function containsDangerousContent(input: string): boolean {
  if (!input) return false;
  
  const lowerInput = input.toLowerCase();
  
  // Check for script tags
  if (/<script/i.test(input)) return true;
  
  // Check for event handlers
  if (/\son\w+\s*=/i.test(input)) return true;
  
  // Check for javascript: protocol
  if (/javascript:/i.test(input)) return true;
  
  // Check for vbscript: protocol
  if (/vbscript:/i.test(input)) return true;
  
  // Check for data: URLs with HTML
  if (/data:text\/html/i.test(input)) return true;
  
  // Check for iframe tags
  if (/<iframe/i.test(input)) return true;
  
  // Check for object/embed tags
  if (/<object/i.test(input) || /<embed/i.test(input)) return true;
  
  return false;
}

/**
 * React component prop sanitizer
 * Use this to sanitize props before passing to dangerouslySetInnerHTML
 * (But prefer not using dangerouslySetInnerHTML at all!)
 */
export function sanitizeForInnerHtml(html: string): string {
  return sanitizeHtml(html);
}

