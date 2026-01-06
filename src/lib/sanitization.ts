import DOMPurify from 'isomorphic-dompurify';

// Configure DOMPurify for safe HTML
const purifyConfig = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  ADD_ATTR: ['target'],
  ADD_DATA_URI_TAGS: [],
  FORCE_BODY: true,
  SANITIZE_DOM: true,
  SANITIZE_NAMED_PROPS: true,
  WHOLE_DOCUMENT: false,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_TRUSTED_TYPE: false,
  IN_PLACE: false,
};

/**
 * Sanitize HTML content to prevent XSS attacks
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, purifyConfig);
}

/**
 * Sanitize plain text by escaping HTML entities
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize user input for database storage
 */
export function sanitizeInput(input: string): string {
  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Remove control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Normalize unicode
  sanitized = sanitized.normalize('NFC');

  return sanitized;
}

/**
 * Sanitize filename to prevent directory traversal
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators and null bytes
  let sanitized = filename.replace(/[\/\\:\0]/g, '_');

  // Remove special characters that could cause issues
  sanitized = sanitized.replace(/[<>:"|?*]/g, '_');

  // Remove leading/trailing dots and spaces
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');

  // Limit length
  if (sanitized.length > 255) {
    const ext = sanitized.split('.').pop();
    const name = sanitized.substring(0, 250 - (ext?.length || 0));
    sanitized = ext ? `${name}.${ext}` : name;
  }

  // Default name if empty
  return sanitized || 'unnamed';
}

/**
 * Sanitize URL to prevent javascript: and data: schemes
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Only allow safe protocols
    const allowedProtocols = ['http:', 'https:', 'mailto:'];
    if (!allowedProtocols.includes(parsed.protocol)) {
      return '';
    }

    return parsed.toString();
  } catch {
    // If not a valid URL, treat as relative path
    // Remove any protocol-like strings
    const cleaned = url.replace(/^[a-z]+:/i, '');

    // Ensure it starts with / for relative paths
    if (!cleaned.startsWith('/')) {
      return '/' + cleaned;
    }

    return cleaned;
  }
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(email: string): string {
  // Convert to lowercase and trim
  const cleaned = email.toLowerCase().trim();

  // Basic email validation regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  return emailRegex.test(cleaned) ? cleaned : '';
}

/**
 * Sanitize phone number
 */
export function sanitizePhone(phone: string): string {
  // Remove all non-numeric characters except + for country code
  return phone.replace(/[^\d+]/g, '').substring(0, 20);
}

/**
 * Sanitize numeric input
 */
export function sanitizeNumber(value: string | number): number {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) || !isFinite(num) ? 0 : num;
}

/**
 * Sanitize boolean input
 */
export function sanitizeBoolean(value: any): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * Sanitize JSON string
 */
export function sanitizeJson(jsonString: string): object | null {
  try {
    const parsed = JSON.parse(jsonString);
    // Recursively sanitize string values
    return sanitizeObject(parsed);
  } catch {
    return null;
  }
}

/**
 * Recursively sanitize object properties
 */
export function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return sanitizeInput(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Sanitize the key as well
        const sanitizedKey = sanitizeInput(key);
        sanitized[sanitizedKey] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Sanitize SQL identifier (table/column names)
 * WARNING: Use parameterized queries instead when possible
 */
export function sanitizeSqlIdentifier(identifier: string): string {
  // Only allow alphanumeric characters and underscores
  return identifier.replace(/[^a-zA-Z0-9_]/g, '');
}

/**
 * Strip all HTML tags from a string
 */
export function stripHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });
}

/**
 * Validate and sanitize credit card number (removes spaces/dashes)
 */
export function sanitizeCreditCard(cardNumber: string): string {
  // Remove all non-digits
  const digits = cardNumber.replace(/\D/g, '');

  // Basic length check (most cards are 13-19 digits)
  if (digits.length < 13 || digits.length > 19) {
    return '';
  }

  return digits;
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (data.length <= visibleChars) {
    return '*'.repeat(data.length);
  }

  const masked = '*'.repeat(data.length - visibleChars);
  return masked + data.slice(-visibleChars);
}

/**
 * Sanitize search query
 */
export function sanitizeSearchQuery(query: string): string {
  // Remove special characters that might break search
  let sanitized = query.replace(/[^\w\s-]/g, ' ');

  // Remove extra whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // Limit length
  return sanitized.substring(0, 100);
}

/**
 * Create a content security policy nonce
 */
export function generateCSPNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Buffer.from(array).toString('base64');
}

// Export a default sanitization function for general use
export default function sanitize(input: any, type: 'html' | 'text' | 'email' | 'url' | 'filename' | 'json' | 'search' = 'text'): any {
  if (input === null || input === undefined) return '';

  const inputStr = String(input);

  switch (type) {
    case 'html':
      return sanitizeHtml(inputStr);
    case 'email':
      return sanitizeEmail(inputStr);
    case 'url':
      return sanitizeUrl(inputStr);
    case 'filename':
      return sanitizeFilename(inputStr);
    case 'json':
      return sanitizeJson(inputStr);
    case 'search':
      return sanitizeSearchQuery(inputStr);
    case 'text':
    default:
      return sanitizeInput(inputStr);
  }
}