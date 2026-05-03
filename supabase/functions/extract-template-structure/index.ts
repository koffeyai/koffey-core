/**
 * Edge Function: extract-template-structure
 * 
 * Extracts structure from uploaded .pptx templates for the visual slot mapper.
 * Parses Office Open XML format to identify text, images, shapes, and charts.
 */

import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import JSZip from "npm:jszip@3.10.1";
import { XMLParser } from "npm:fast-xml-parser@4.3.2";
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

interface ExtractedElement {
  id: string;
  type: 'text' | 'image' | 'shape' | 'chart';
  boundingBox: { x: number; y: number; width: number; height: number };
  content?: string;
  placeholderType?: string;
}

interface ExtractedSlide {
  index: number;
  elements: ExtractedElement[];
  layoutType?: string;
}

interface ExtractionResult {
  slides: ExtractedSlide[];
  metadata: {
    width: number;
    height: number;
    slide_count: number;
  };
}

// EMUs to pixels conversion (Office uses English Metric Units)
const EMU_PER_PIXEL = 9525;
function emuToPixels(emu: number): number {
  return Math.round(emu / EMU_PER_PIXEL);
}

// Parse position/size from Office XML attributes
function parseBoundingBox(spPr: any): { x: number; y: number; width: number; height: number } {
  const off = spPr?.['a:xfrm']?.['a:off'];
  const ext = spPr?.['a:xfrm']?.['a:ext'];
  
  return {
    x: off?.['@_x'] ? emuToPixels(parseInt(off['@_x'])) : 0,
    y: off?.['@_y'] ? emuToPixels(parseInt(off['@_y'])) : 0,
    width: ext?.['@_cx'] ? emuToPixels(parseInt(ext['@_cx'])) : 0,
    height: ext?.['@_cy'] ? emuToPixels(parseInt(ext['@_cy'])) : 0,
  };
}

// Extract text content from text body
function extractTextContent(txBody: any): string {
  if (!txBody) return '';
  
  const paragraphs = txBody['a:p'];
  if (!paragraphs) return '';
  
  const pArray = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
  
  return pArray.map(p => {
    const runs = p['a:r'];
    if (!runs) return '';
    const runArray = Array.isArray(runs) ? runs : [runs];
    return runArray.map(r => r['a:t'] || '').join('');
  }).join('\n').trim();
}

// Parse a single shape element
function parseShape(sp: any, elementIndex: number): ExtractedElement | null {
  const nvSpPr = sp['p:nvSpPr'];
  const spPr = sp['p:spPr'];
  const txBody = sp['p:txBody'];
  
  const id = nvSpPr?.['p:cNvPr']?.['@_id'] || `shape_${elementIndex}`;
  const name = nvSpPr?.['p:cNvPr']?.['@_name'] || '';
  
  const boundingBox = parseBoundingBox(spPr);
  const content = extractTextContent(txBody);
  
  // Determine if this is a text placeholder or shape
  const phType = nvSpPr?.['p:nvPr']?.['p:ph']?.['@_type'];
  
  return {
    id: `${id}`,
    type: content || phType ? 'text' : 'shape',
    boundingBox,
    content: content || undefined,
    placeholderType: phType || (name.toLowerCase().includes('title') ? 'title' : undefined),
  };
}

// Parse a picture element
function parsePicture(pic: any, elementIndex: number): ExtractedElement | null {
  const nvPicPr = pic['p:nvPicPr'];
  const spPr = pic['p:spPr'];
  
  const id = nvPicPr?.['p:cNvPr']?.['@_id'] || `pic_${elementIndex}`;
  const name = nvPicPr?.['p:cNvPr']?.['@_name'] || '';
  
  const boundingBox = parseBoundingBox(spPr);
  
  // Determine placeholder type from name
  let placeholderType = 'photo';
  const lowerName = name.toLowerCase();
  if (lowerName.includes('logo')) placeholderType = 'logo';
  else if (lowerName.includes('chart')) placeholderType = 'chart';
  else if (lowerName.includes('diagram')) placeholderType = 'diagram';
  
  return {
    id: `${id}`,
    type: 'image',
    boundingBox,
    placeholderType,
  };
}

// Parse chart element
function parseChart(graphicFrame: any, elementIndex: number): ExtractedElement | null {
  const nvGraphicFramePr = graphicFrame['p:nvGraphicFramePr'];
  const xfrm = graphicFrame['p:xfrm'];
  
  const id = nvGraphicFramePr?.['p:cNvPr']?.['@_id'] || `chart_${elementIndex}`;
  
  const off = xfrm?.['a:off'];
  const ext = xfrm?.['a:ext'];
  
  const boundingBox = {
    x: off?.['@_x'] ? emuToPixels(parseInt(off['@_x'])) : 0,
    y: off?.['@_y'] ? emuToPixels(parseInt(off['@_y'])) : 0,
    width: ext?.['@_cx'] ? emuToPixels(parseInt(ext['@_cx'])) : 0,
    height: ext?.['@_cy'] ? emuToPixels(parseInt(ext['@_cy'])) : 0,
  };
  
  return {
    id: `${id}`,
    type: 'chart',
    boundingBox,
  };
}

// Parse a slide XML to extract elements
function parseSlideXml(slideXml: string, slideIndex: number, parser: XMLParser): ExtractedSlide {
  const elements: ExtractedElement[] = [];
  
  try {
    const parsed = parser.parse(slideXml);
    const spTree = parsed['p:sld']?.['p:cSld']?.['p:spTree'];
    
    if (!spTree) {
      console.log(`No spTree found in slide ${slideIndex}`);
      return { index: slideIndex, elements: [] };
    }
    
    let elementIndex = 0;
    
    // Parse shapes (text boxes, titles, etc.)
    const shapes = spTree['p:sp'];
    if (shapes) {
      const shapeArray = Array.isArray(shapes) ? shapes : [shapes];
      for (const sp of shapeArray) {
        const element = parseShape(sp, elementIndex++);
        if (element && (element.content || element.boundingBox.width > 0)) {
          elements.push(element);
        }
      }
    }
    
    // Parse pictures
    const pictures = spTree['p:pic'];
    if (pictures) {
      const picArray = Array.isArray(pictures) ? pictures : [pictures];
      for (const pic of picArray) {
        const element = parsePicture(pic, elementIndex++);
        if (element) {
          elements.push(element);
        }
      }
    }
    
    // Parse graphic frames (charts, tables, etc.)
    const graphicFrames = spTree['p:graphicFrame'];
    if (graphicFrames) {
      const gfArray = Array.isArray(graphicFrames) ? graphicFrames : [graphicFrames];
      for (const gf of gfArray) {
        // Check if it's a chart
        const graphic = gf['a:graphic'];
        const graphicData = graphic?.['a:graphicData'];
        if (graphicData?.['@_uri']?.includes('chart') || graphicData?.['c:chart']) {
          const element = parseChart(gf, elementIndex++);
          if (element) {
            elements.push(element);
          }
        }
      }
    }
    
  } catch (err) {
    console.error(`Error parsing slide ${slideIndex}:`, err);
  }
  
  return { index: slideIndex, elements };
}

// Get slide dimensions from presentation.xml
function getPresentationMetadata(presentationXml: string, parser: XMLParser): { width: number; height: number } {
  try {
    const parsed = parser.parse(presentationXml);
    const sldSz = parsed['p:presentation']?.['p:sldSz'];
    
    if (sldSz) {
      return {
        width: sldSz['@_cx'] ? emuToPixels(parseInt(sldSz['@_cx'])) : 960,
        height: sldSz['@_cy'] ? emuToPixels(parseInt(sldSz['@_cy'])) : 540,
      };
    }
  } catch (err) {
    console.error('Error parsing presentation.xml:', err);
  }
  
  // Default to 16:9 HD dimensions
  return { width: 960, height: 540 };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    // Authenticate request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Validate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { templateId, storagePath, organizationId } = await req.json();
    
    if (!templateId || !storagePath || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: templateId, storagePath, organizationId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Extracting template structure for: ${templateId}`);
    console.log(`   Storage path: ${storagePath}`);

    // Download the .pptx file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('slide-templates')
      .download(storagePath);

    if (downloadError || !fileData) {
      console.error('Download error:', downloadError);
      return new Response(
        JSON.stringify({ error: 'Failed to download template file', details: downloadError?.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`   Downloaded file: ${fileData.size} bytes`);

    // Unzip the pptx file
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(await fileData.arrayBuffer());
    
    // Verify it's a valid pptx
    const contentTypes = zipContent.file('[Content_Types].xml');
    if (!contentTypes) {
      return new Response(
        JSON.stringify({ error: 'Invalid PowerPoint file format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize XML parser with attribute parsing
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });

    // Get presentation metadata
    const presentationFile = zipContent.file('ppt/presentation.xml');
    let metadata = { width: 960, height: 540, slide_count: 0 };
    
    if (presentationFile) {
      const presentationXml = await presentationFile.async('string');
      const dims = getPresentationMetadata(presentationXml, parser);
      metadata.width = dims.width;
      metadata.height = dims.height;
    }

    // Find all slide files
    const slideFiles: string[] = [];
    zipContent.forEach((relativePath) => {
      if (relativePath.match(/^ppt\/slides\/slide\d+\.xml$/)) {
        slideFiles.push(relativePath);
      }
    });

    // Sort slides by number
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
      return numA - numB;
    });

    metadata.slide_count = slideFiles.length;
    console.log(`   Found ${slideFiles.length} slides`);

    // Parse each slide
    const slides: ExtractedSlide[] = [];
    
    for (let i = 0; i < slideFiles.length; i++) {
      const slideFile = zipContent.file(slideFiles[i]);
      if (slideFile) {
        const slideXml = await slideFile.async('string');
        const slide = parseSlideXml(slideXml, i, parser);
        slides.push(slide);
        console.log(`   Slide ${i + 1}: ${slide.elements.length} elements`);
      }
    }

    const extractedStructure: ExtractionResult = { slides, metadata };

    // Update the template record with extracted structure
    const { error: updateError } = await supabase
      .from('slide_templates')
      .update({
        slide_count: metadata.slide_count,
        extracted_structure: extractedStructure,
        updated_at: new Date().toISOString(),
      })
      .eq('id', templateId)
      .eq('organization_id', organizationId);

    if (updateError) {
      console.error('Database update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update template record', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Template extraction complete`);

    return new Response(
      JSON.stringify({
        success: true,
        slideCount: metadata.slide_count,
        extractedStructure,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Extraction error:', err);
    return new Response(
      JSON.stringify({ 
        error: 'Template extraction failed', 
        details: err instanceof Error ? err.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
