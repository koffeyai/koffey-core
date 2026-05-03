import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { createSecureErrorResponse } from '../_shared/security.ts';

let corsHeaders = getCorsHeaders();

interface ProcessDocumentRequest {
  storagePath: string;
  fileName: string;
  mimeType: string;
}

interface ProcessDocumentResponse {
  success: boolean;
  text?: string;
  method?: "pdf_parse" | "google_vision_ocr" | "image_ocr";
  error?: string;
  isScanned?: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    // Get auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request
    const { storagePath, fileName, mimeType } = await req.json() as ProcessDocumentRequest;

    if (!storagePath) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing storagePath" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authorize file access by source_documents ownership/org membership.
    const { data: sourceDoc, error: sourceDocError } = await supabase
      .from('source_documents')
      .select('id, user_id, organization_id, storage_path, storage_bucket')
      .eq('storage_path', storagePath)
      .eq('storage_bucket', 'source-documents')
      .maybeSingle();

    if (sourceDocError || !sourceDoc) {
      return new Response(
        JSON.stringify({ success: false, error: "Document not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', sourceDoc.organization_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!membership) {
      return new Response(
        JSON.stringify({ success: false, error: "Document not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure storage path cannot be swapped to a different org bucket path.
    const expectedPrefix = `${sourceDoc.organization_id}/`;
    if (!storagePath.startsWith(expectedPrefix)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid storage path" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[process-document] Processing: ${fileName} (${mimeType})`);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("source-documents")
      .download(storagePath);

    if (downloadError || !fileData) {
      console.error("[process-document] Download error:", downloadError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to download file from storage" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(fileBuffer);

    let result: ProcessDocumentResponse;

    // Route based on file type
    if (mimeType === "application/pdf") {
      result = await processPdf(uint8Array, fileName);
    } else if (mimeType.startsWith("image/")) {
      result = await processImage(uint8Array, mimeType);
    } else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword"
    ) {
      // For DOCX, we'll try basic text extraction
      result = await processDocx(uint8Array);
    } else {
      result = { 
        success: false, 
        error: `Unsupported file type: ${mimeType}. Supported: PDF, images, DOCX` 
      };
    }

    console.log(`[process-document] Result: method=${result.method}, textLength=${result.text?.length || 0}, isScanned=${result.isScanned}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return createSecureErrorResponse(error, "Internal server error", 500, req);
  }
});

/**
 * Process PDF files with hybrid approach:
 * 1. Try pdf-parse for text extraction
 * 2. If scanned (low text), fall back to Google Vision OCR
 */
async function processPdf(data: Uint8Array, fileName: string): Promise<ProcessDocumentResponse> {
  try {
    // Step 1: Try pdf-parse for text extraction
    const pdfParse = await import("npm:pdf-parse@1.1.1");
    const pdfData = await pdfParse.default(Buffer.from(data));
    
    const extractedText = pdfData.text?.trim() || "";
    
    // Step 2: Detect if it's a scanned document
    const isScanned = detectScannedPdf(extractedText);
    
    console.log(`[process-document] PDF extraction: ${extractedText.length} chars, isScanned=${isScanned}`);
    
    if (isScanned) {
      // Step 3: Fall back to Google Cloud Vision OCR
      const googleApiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
      
      if (!googleApiKey) {
        console.warn("[process-document] No Google Vision API key configured, returning limited text");
        return {
          success: true,
          text: extractedText || `[Scanned document: ${fileName}]\n\nThis document appears to be scanned or image-based. To enable OCR, configure Google Cloud Vision API.`,
          method: "pdf_parse",
          isScanned: true,
        };
      }
      
      // Convert PDF to image and OCR with Google Vision
      const ocrText = await extractWithGoogleVision(data, googleApiKey);
      
      if (ocrText) {
        return {
          success: true,
          text: ocrText,
          method: "google_vision_ocr",
          isScanned: true,
        };
      }
    }
    
    return {
      success: true,
      text: extractedText,
      method: "pdf_parse",
      isScanned: false,
    };
  } catch (error) {
    console.error("[process-document] PDF processing error:", error);
    
    // Try OCR fallback
    const googleApiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
    if (googleApiKey) {
      try {
        const ocrText = await extractWithGoogleVision(data, googleApiKey);
        if (ocrText) {
          return {
            success: true,
            text: ocrText,
            method: "google_vision_ocr",
            isScanned: true,
          };
        }
      } catch (ocrError) {
        console.error("[process-document] OCR fallback error:", ocrError);
      }
    }
    
    return {
      success: false,
      error: "Failed to extract text from PDF",
    };
  }
}

/**
 * Process image files with Google Vision OCR
 */
async function processImage(data: Uint8Array, mimeType: string): Promise<ProcessDocumentResponse> {
  const googleApiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
  
  if (!googleApiKey) {
    return {
      success: false,
      error: "Image OCR requires Google Cloud Vision API. Please configure GOOGLE_CLOUD_VISION_API_KEY.",
    };
  }
  
  try {
    const ocrText = await extractWithGoogleVision(data, googleApiKey);
    
    if (!ocrText || ocrText.trim().length === 0) {
      return {
        success: true,
        text: "[No text detected in image]",
        method: "image_ocr",
        isScanned: true,
      };
    }
    
    return {
      success: true,
      text: ocrText,
      method: "image_ocr",
      isScanned: true,
    };
  } catch (error) {
    console.error("[process-document] Image OCR error:", error);
    return {
      success: false,
      error: "Failed to OCR image",
    };
  }
}

/**
 * Process DOCX files - basic text extraction
 */
async function processDocx(data: Uint8Array): Promise<ProcessDocumentResponse> {
  try {
    // DOCX is a ZIP file containing XML
    // Use a simple approach: extract text from document.xml
    const JSZip = await import("npm:jszip@3.10.1");
    const zip = await JSZip.default.loadAsync(data);
    
    const documentXml = await zip.file("word/document.xml")?.async("text");
    
    if (!documentXml) {
      return {
        success: false,
        error: "Could not find document content in DOCX file",
      };
    }
    
    // Extract text from XML (simple regex approach)
    const textMatches = documentXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    const paragraphs: string[] = [];
    let currentParagraph = "";
    
    // Track paragraph breaks
    const xmlParts = documentXml.split(/<w:p[^>]*>/);
    
    for (const part of xmlParts) {
      const textInPart = (part.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
        .map(match => {
          const textMatch = match.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
          return textMatch ? textMatch[1] : "";
        })
        .join("");
      
      if (textInPart.trim()) {
        paragraphs.push(textInPart);
      }
    }
    
    const extractedText = paragraphs.join("\n\n");
    
    return {
      success: true,
      text: extractedText,
      method: "pdf_parse", // Reusing label for simplicity
      isScanned: false,
    };
  } catch (error) {
    console.error("[process-document] DOCX processing error:", error);
    return {
      success: false,
      error: "Failed to extract text from DOCX",
    };
  }
}

/**
 * Detect if extracted PDF text indicates a scanned document
 */
function detectScannedPdf(text: string): boolean {
  if (!text || text.length < 50) {
    return true; // Very little text = likely scanned
  }
  
  // Check for high ratio of non-printable or garbage characters
  const printableChars = text.replace(/[^\x20-\x7E\n\r\t]/g, "");
  const garbageRatio = 1 - (printableChars.length / text.length);
  
  if (garbageRatio > 0.3) {
    return true; // More than 30% garbage = likely OCR artifacts
  }
  
  // Check for very short average word length (OCR garbage often produces short "words")
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length > 0) {
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
    if (avgWordLength < 2.5) {
      return true;
    }
  }
  
  return false;
}

/**
 * Extract text using Google Cloud Vision API
 */
async function extractWithGoogleVision(
  data: Uint8Array,
  apiKey: string
): Promise<string | null> {
  try {
    const base64Data = btoa(String.fromCharCode(...data));
    
    const requestBody = {
      requests: [
        {
          image: {
            content: base64Data,
          },
          features: [
            {
              type: "DOCUMENT_TEXT_DETECTION",
              maxResults: 1,
            },
          ],
        },
      ],
    };
    
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[process-document] Google Vision API error:", errorText);
      throw new Error(`Google Vision API error: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Extract full text annotation
    const textAnnotation = result.responses?.[0]?.fullTextAnnotation?.text;
    
    if (textAnnotation) {
      return textAnnotation;
    }
    
    // Fallback to individual text annotations
    const textAnnotations = result.responses?.[0]?.textAnnotations;
    if (textAnnotations && textAnnotations.length > 0) {
      return textAnnotations[0].description;
    }
    
    return null;
  } catch (error) {
    console.error("[process-document] Google Vision error:", error);
    throw error;
  }
}
