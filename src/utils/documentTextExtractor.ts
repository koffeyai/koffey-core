/**
 * Client-side text extraction for text-based file formats.
 * Binary formats (PDF, DOCX, images) return null and defer to the edge function.
 */

export interface ExtractionResult {
  text: string;
  method: 'client_text' | 'client_html' | 'client_eml';
  metadata?: {
    subject?: string;
    from?: string;
    to?: string;
    date?: string;
  };
}

/**
 * Attempts to extract text from a file client-side.
 * Returns null if the file requires server-side processing.
 */
export async function extractTextFromFile(file: File): Promise<ExtractionResult | null> {
  const extension = getFileExtension(file.name);
  const mimeType = file.type.toLowerCase();

  // Text-based files we can handle client-side
  if (isPlainText(extension, mimeType)) {
    const text = await file.text();
    return { text, method: 'client_text' };
  }

  if (extension === 'html' || mimeType === 'text/html') {
    const html = await file.text();
    const text = extractTextFromHtml(html);
    return { text, method: 'client_html' };
  }

  if (extension === 'eml' || mimeType === 'message/rfc822') {
    const content = await file.text();
    return parseEmailContent(content);
  }

  // Binary files - defer to server
  return null;
}

function getFileExtension(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function isPlainText(extension: string, mimeType: string): boolean {
  const textExtensions = ['txt', 'md', 'markdown', 'text', 'log'];
  const textMimeTypes = ['text/plain', 'text/markdown', 'text/x-markdown'];
  
  return textExtensions.includes(extension) || textMimeTypes.includes(mimeType);
}

/**
 * Extracts readable text from HTML while preserving structure.
 */
function extractTextFromHtml(html: string): string {
  // Create a temporary element to parse HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Remove script and style elements
  const scripts = doc.querySelectorAll('script, style, noscript');
  scripts.forEach(el => el.remove());
  
  // Get text content with basic structure preservation
  const walker = document.createTreeWalker(
    doc.body || doc.documentElement,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    null
  );
  
  const lines: string[] = [];
  let currentLine = '';
  
  while (walker.nextNode()) {
    const node = walker.currentNode;
    
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim() || '';
      if (text) {
        currentLine += (currentLine ? ' ' : '') + text;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = (node as Element).tagName.toLowerCase();
      
      // Block elements create new lines
      if (['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr'].includes(tagName)) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
        }
      }
      
      // Add prefix for list items
      if (tagName === 'li') {
        currentLine = '• ';
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Parses .eml email format and extracts headers + body.
 */
function parseEmailContent(content: string): ExtractionResult {
  const lines = content.split(/\r?\n/);
  const headers: Record<string, string> = {};
  let bodyStartIndex = 0;
  
  // Parse headers (until empty line)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line === '') {
      bodyStartIndex = i + 1;
      break;
    }
    
    // Header continuation (starts with whitespace)
    if (/^\s+/.test(line) && Object.keys(headers).length > 0) {
      const lastKey = Object.keys(headers).pop()!;
      headers[lastKey] += ' ' + line.trim();
      continue;
    }
    
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).toLowerCase();
      const value = line.substring(colonIndex + 1).trim();
      headers[key] = value;
    }
  }
  
  // Extract body
  let body = lines.slice(bodyStartIndex).join('\n');
  
  // Handle multipart content (simplified - just get text/plain or strip HTML)
  const contentType = headers['content-type'] || '';
  
  if (contentType.includes('multipart')) {
    // Find boundary
    const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i);
    if (boundaryMatch) {
      const boundary = boundaryMatch[1];
      const parts = body.split(new RegExp(`--${escapeRegExp(boundary)}`));
      
      // Find text/plain part, or use first text part
      for (const part of parts) {
        if (part.includes('text/plain') || (!part.includes('text/html') && part.trim().length > 50)) {
          // Skip the headers of this part
          const partLines = part.split(/\r?\n/);
          let partBodyStart = 0;
          for (let i = 0; i < partLines.length; i++) {
            if (partLines[i] === '') {
              partBodyStart = i + 1;
              break;
            }
          }
          body = partLines.slice(partBodyStart).join('\n').trim();
          break;
        }
      }
    }
  }
  
  // If still HTML, strip tags
  if (body.includes('<html') || body.includes('<body') || body.includes('<div')) {
    body = extractTextFromHtml(body);
  }
  
  // Format output with headers
  const formattedText = [
    headers['subject'] ? `Subject: ${headers['subject']}` : null,
    headers['from'] ? `From: ${headers['from']}` : null,
    headers['to'] ? `To: ${headers['to']}` : null,
    headers['date'] ? `Date: ${headers['date']}` : null,
    '',
    body.trim()
  ].filter(line => line !== null).join('\n');
  
  return {
    text: formattedText,
    method: 'client_eml',
    metadata: {
      subject: headers['subject'],
      from: headers['from'],
      to: headers['to'],
      date: headers['date'],
    }
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if a file can be processed client-side or needs server processing.
 */
export function requiresServerProcessing(file: File): boolean {
  const extension = getFileExtension(file.name);
  const mimeType = file.type.toLowerCase();
  
  // Files that require server-side processing
  const serverExtensions = ['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'tiff'];
  const serverMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'image/'
  ];
  
  if (serverExtensions.includes(extension)) return true;
  if (serverMimeTypes.some(type => mimeType.startsWith(type))) return true;
  
  return false;
}

/**
 * Get human-readable file type description.
 */
export function getFileTypeDescription(file: File): string {
  const extension = getFileExtension(file.name);
  
  const descriptions: Record<string, string> = {
    pdf: 'PDF Document',
    docx: 'Word Document',
    doc: 'Word Document (Legacy)',
    txt: 'Text File',
    md: 'Markdown',
    html: 'HTML Document',
    eml: 'Email',
    jpg: 'JPEG Image',
    jpeg: 'JPEG Image',
    png: 'PNG Image',
    gif: 'GIF Image',
    webp: 'WebP Image',
  };
  
  return descriptions[extension] || file.type || 'Unknown';
}

/**
 * Validate file before upload.
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  const MAX_SIZE = 20 * 1024 * 1024; // 20MB
  
  const allowedExtensions = [
    'txt', 'md', 'html', 'eml',
    'pdf', 'docx', 'doc',
    'jpg', 'jpeg', 'png', 'gif', 'webp'
  ];
  
  const extension = getFileExtension(file.name);
  
  if (file.size > MAX_SIZE) {
    return { valid: false, error: 'File exceeds 20MB limit' };
  }
  
  if (!allowedExtensions.includes(extension)) {
    return { 
      valid: false, 
      error: `Unsupported format (.${extension}). Please use PDF, Word, text, HTML, or image files.`
    };
  }
  
  return { valid: true };
}
