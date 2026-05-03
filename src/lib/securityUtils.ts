import DOMPurify from 'dompurify';

// Security utilities for preventing XSS and other vulnerabilities
export class SecurityUtils {
  // Sanitize HTML content to prevent XSS
  static sanitizeHTML(html: string): string {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: ['href', 'target'],
      ALLOWED_URI_REGEXP: /^https?:\/\/|^mailto:|^tel:/
    });
  }

  // Sanitize CSS content for dynamic styles
  static sanitizeCSS(css: string): string {
    // Remove potentially dangerous CSS
    return css
      .replace(/javascript:/gi, '')
      .replace(/expression\(/gi, '')
      .replace(/url\([^)]*javascript:/gi, 'url(')
      .replace(/@import/gi, '')
      .replace(/\beval\b/gi, '')
      .replace(/\bfunction\b/gi, '');
  }

  // Validate and sanitize user input
  static sanitizeInput(input: string, maxLength = 1000): string {
    if (!input || typeof input !== 'string') return '';
    return input
      .trim()
      .slice(0, maxLength)
      .replace(/[<>'"&]/g, (char) => {
        const entities: Record<string, string> = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        };
        return entities[char] || char;
      });
  }

  // Protected browser storage:
  // - sensitive data: sessionStorage (short-lived, tab-scoped)
  // - non-sensitive data: localStorage (persistent)
  static secureStorage = {
    set(key: string, value: any, protectSensitive = true): void {
      try {
        const serialized = JSON.stringify(value);
        const target = protectSensitive ? sessionStorage : localStorage;
        target.setItem(`secure_${key}`, serialized);
      } catch (error) {
        console.error('Failed to set secure storage:', error);
      }
    },

    get(key: string, protectSensitive = true): any {
      try {
        const data = protectSensitive
          ? sessionStorage.getItem(`secure_${key}`) || localStorage.getItem(`secure_${key}`)
          : localStorage.getItem(`secure_${key}`);
        if (!data) return null;
        return JSON.parse(data);
      } catch (error) {
        console.error('Failed to get secure storage:', error);
        return null;
      }
    },

    remove(key: string): void {
      localStorage.removeItem(`secure_${key}`);
      sessionStorage.removeItem(`secure_${key}`);
    },

    clear(): void {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('secure_')) {
          localStorage.removeItem(key);
        }
      });
      const sessionKeys = Object.keys(sessionStorage);
      sessionKeys.forEach((key) => {
        if (key.startsWith('secure_')) {
          sessionStorage.removeItem(key);
        }
      });
    }
  };

  // Rate limiting for API calls
  static rateLimiter = {
    requests: new Map<string, number[]>(),
    
    isAllowed(key: string, maxRequests = 100, windowMs = 60000): boolean {
      const now = Date.now();
      const windowStart = now - windowMs;
      
      if (!this.requests.has(key)) {
        this.requests.set(key, []);
      }
      
      const requests = this.requests.get(key)!;
      // Remove old requests outside the window
      const validRequests = requests.filter(time => time > windowStart);
      
      if (validRequests.length >= maxRequests) {
        return false;
      }
      
      validRequests.push(now);
      this.requests.set(key, validRequests);
      return true;
    },

    clear(): void {
      this.requests.clear();
    }
  };

  // Content Security Policy helpers
  static CSP = {
    generateNonce(): string {
      const array = new Uint8Array(16);
      crypto.getRandomValues(array);
      return btoa(String.fromCharCode.apply(null, Array.from(array)));
    },

    isInlineContentAllowed(nonce?: string): boolean {
      // Check if current execution context allows inline content
      return !!nonce || this.isDevelopment();
    },

    isDevelopment(): boolean {
      return process.env.NODE_ENV === 'development';
    }
  };

  // Input validation helpers
  static validators = {
    email(email: string): boolean {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    },

    phone(phone: string): boolean {
      const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
      return phoneRegex.test(phone);
    },

    url(url: string): boolean {
      try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    },

    sqlInjection(input: string): boolean {
      const sqlPatterns = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i;
      return !sqlPatterns.test(input);
    }
  };
}

// Enhanced error handling with security considerations
export class SecureErrorHandler {
  static sanitizeError(error: any): { message: string; code?: string } {
    if (!error) return { message: 'Unknown error' };
    
    // Don't expose sensitive information in errors
    const sensitivePatterns = [
      /password/i,
      /token/i,
      /key/i,
      /secret/i,
      /credential/i,
      /auth/i
    ];

    let message = error.message || 'An error occurred';
    
    // Remove sensitive information from error messages
    sensitivePatterns.forEach(pattern => {
      message = message.replace(pattern, '[REDACTED]');
    });

    return {
      message: SecurityUtils.sanitizeInput(message, 200),
      code: error.code || error.status
    };
  }
}

export default SecurityUtils;
