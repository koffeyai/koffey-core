/**
 * PDF Parser - Extracts text and entities from PDF files
 * Note: This is a simplified version. For production, consider using a PDF parsing library
 */

interface ParseResult {
  entities: any[];
  rawData: any;
  summary: string;
  searchableText: string;
  confidence: number;
}

export async function parsePDF(buffer: ArrayBuffer, filename: string): Promise<ParseResult> {
  console.log(`Parsing PDF file: ${filename}`);

  // For now, we'll return a placeholder with basic extraction
  // In production, you'd want to use a proper PDF parsing library like pdf-parse
  // However, Deno doesn't have great PDF library support yet

  try {
    // Convert buffer to text (this is a very basic approach and won't work for complex PDFs)
    const text = new TextDecoder().decode(buffer);

    // Extract visible text using simple heuristics
    // This will work for text-based PDFs but not scanned images
    const textContent = extractTextFromPDFBuffer(text);

    // If we got text, parse it like a TXT file
    if (textContent && textContent.length > 50) {
      // Import and use the TXT parser
      const { parseTXT } = await import('./txtParser.ts');
      const result = await parseTXT(textContent, filename);

      return {
        ...result,
        summary: `PDF file: ${result.summary}`,
        confidence: result.confidence * 0.8 // Slightly lower confidence for PDF extraction
      };
    }

    // If no text extracted, return minimal result
    return {
      entities: [],
      rawData: { size: buffer.byteLength },
      summary: 'PDF file (unable to extract structured data - may be image-based)',
      searchableText: textContent,
      confidence: 0.2
    };

  } catch (error) {
    console.error('PDF parsing error:', error);
    return {
      entities: [],
      rawData: null,
      summary: 'PDF parsing failed',
      searchableText: '',
      confidence: 0
    };
  }
}

function extractTextFromPDFBuffer(rawText: string): string {
  // Very basic text extraction - looks for readable text between PDF markers
  // This won't work for all PDFs but handles simple text-based ones

  const lines: string[] = [];

  // Look for common PDF text patterns
  const textPatterns = [
    /BT\s+(.*?)\s+ET/gs, // Between BT (Begin Text) and ET (End Text)
    /\((.*?)\)/g, // Text in parentheses (common in PDF)
  ];

  for (const pattern of textPatterns) {
    const matches = rawText.matchAll(pattern);
    for (const match of matches) {
      const text = match[1]?.trim();
      if (text && text.length > 2 && text.length < 200) {
        // Filter out non-readable content
        if (/[a-zA-Z]/.test(text)) {
          lines.push(text);
        }
      }
    }
  }

  return lines.join('\n');
}
