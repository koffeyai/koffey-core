/**
 * Client-side PPTX generation using pptxgenjs
 * Converts JSON slide content to PowerPoint format
 */
import pptxgen from 'pptxgenjs';

export interface SlideElement {
  id: string;
  type: 'text' | 'image' | 'shape' | 'chart' | 'table';
  x: number;      // Position as percentage (0-100)
  y: number;
  width: number;  // Size as percentage (0-100)
  height: number;
  content?: string;
  fontSize?: number;
  fontFace?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  backgroundColor?: string;
  imageUrl?: string;
  shapeType?: string;
}

export interface SlideContent {
  id: string;
  order: number;
  layout?: string;
  backgroundColor?: string;
  elements: SlideElement[];
  notes?: string;
}

export interface PresentationContent {
  id: string;
  title: string;
  aspectRatio?: '16:9' | '4:3' | '16:10';
  theme?: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
    headingFont: string;
    bodyFont: string;
    logoUrl?: string;
  };
  slides: SlideContent[];
}

export interface GenerationProgress {
  stage: 'init' | 'slides' | 'images' | 'finalizing';
  stageLabel: string;
  progress: number;
  currentSlide?: number;
  totalSlides?: number;
}

export type ProgressCallback = (progress: GenerationProgress) => void;

// Slide dimensions per aspect ratio (inches)
const SLIDE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '16:9': { width: 10, height: 5.625 },
  '4:3': { width: 10, height: 7.5 },
  '16:10': { width: 10, height: 6.25 },
};

function getSlideHeight(aspectRatio: string): number {
  return (SLIDE_DIMENSIONS[aspectRatio] || SLIDE_DIMENSIONS['16:9']).height;
}

// Convert percentage position to pptxgenjs inches
function pctToInches(pct: number, dimension: 'width' | 'height', aspectRatio: string = '16:9'): number {
  const dim = SLIDE_DIMENSIONS[aspectRatio] || SLIDE_DIMENSIONS['16:9'];
  return (pct / 100) * dim[dimension];
}

// Convert hex color to pptxgenjs format (remove # if present)
function formatColor(color?: string): string | undefined {
  if (!color) return undefined;
  return color.replace('#', '');
}

// ── Master Slide Definitions ────────────────────────────────────────────────

/**
 * Define master slide layouts with branding.
 * Creates 4 masters: MASTER_TITLE, MASTER_SECTION, MASTER_CONTENT, MASTER_CLOSING.
 */
function defineMasterSlides(
  pptx: pptxgen,
  theme?: PresentationContent['theme'],
  logoBase64?: string | null,
  aspectRatio: string = '16:9'
): void {
  const primaryColor = formatColor(theme?.primaryColor) || '1a1a2e';
  const secondaryColor = formatColor(theme?.secondaryColor) || '16213e';
  const accentColor = formatColor(theme?.accentColor) || '4472C4';
  const slideH = getSlideHeight(aspectRatio);

  // ── MASTER_TITLE — Title slide ──
  // Dark primary background with secondary-color lower band, accent line, logo
  const titleObjects: Record<string, unknown>[] = [
    { rect: { x: 0, y: slideH * 0.65, w: '100%', h: slideH * 0.35, fill: { color: secondaryColor } } },
    { rect: { x: 1.5, y: 2.9, w: 7, h: 0.03, fill: { color: accentColor } } },
  ];
  if (logoBase64) {
    titleObjects.push({ image: { x: 8.3, y: slideH - 1, w: 0.8, h: 0.4, data: logoBase64 } });
  }
  pptx.defineSlideMaster({
    title: 'MASTER_TITLE',
    background: { color: primaryColor },
    objects: titleObjects as any,
  });

  // ── MASTER_SECTION — Section divider ──
  // Primary background, accent bar on left edge
  pptx.defineSlideMaster({
    title: 'MASTER_SECTION',
    background: { color: primaryColor },
    objects: [
      { rect: { x: 0, y: 0, w: 0.15, h: '100%', fill: { color: accentColor } } },
    ] as any,
  });

  // ── MASTER_CONTENT — Standard content slide ──
  // White background, thin accent bar across top, logo footer, slide number
  const contentObjects: Record<string, unknown>[] = [
    { rect: { x: 0, y: 0, w: '100%', h: 0.05, fill: { color: accentColor } } },
  ];
  if (logoBase64) {
    contentObjects.push({ image: { x: 9, y: slideH - 0.55, w: 0.5, h: 0.25, data: logoBase64 } });
  }
  pptx.defineSlideMaster({
    title: 'MASTER_CONTENT',
    background: { color: 'FFFFFF' },
    objects: contentObjects as any,
    slideNumber: { x: 0.3, y: slideH - 0.4, fontFace: theme?.bodyFont || 'Arial', fontSize: 9, color: '888888' },
  });

  // ── MASTER_CLOSING — Final slide (same visual as title) ──
  const closingObjects: Record<string, unknown>[] = [
    { rect: { x: 0, y: slideH * 0.65, w: '100%', h: slideH * 0.35, fill: { color: secondaryColor } } },
    { rect: { x: 1.5, y: 2.9, w: 7, h: 0.03, fill: { color: accentColor } } },
  ];
  if (logoBase64) {
    closingObjects.push({ image: { x: 8.3, y: slideH - 1, w: 0.8, h: 0.4, data: logoBase64 } });
  }
  pptx.defineSlideMaster({
    title: 'MASTER_CLOSING',
    background: { color: primaryColor },
    objects: closingObjects as any,
  });
}

/**
 * Determine which master slide to use based on layout and slide position.
 */
function getMasterName(layout: string | undefined, slideIndex: number, totalSlides: number): string {
  if (layout) {
    switch (layout) {
      case 'centered':
        if (slideIndex === 0) return 'MASTER_TITLE';
        if (slideIndex === totalSlides - 1) return 'MASTER_CLOSING';
        return 'MASTER_TITLE';
      case 'title_only':
        return 'MASTER_SECTION';
      default:
        return 'MASTER_CONTENT';
    }
  }
  // Fallback: first slide = title, last = closing, rest = content
  if (slideIndex === 0) return 'MASTER_TITLE';
  if (slideIndex === totalSlides - 1) return 'MASTER_CLOSING';
  return 'MASTER_CONTENT';
}

// ── Main Generation ─────────────────────────────────────────────────────────

/**
 * Generate PPTX blob from presentation content
 */
export async function generatePptxBlob(
  content: PresentationContent,
  onProgress?: ProgressCallback
): Promise<Blob> {
  onProgress?.({ stage: 'init', stageLabel: 'Initializing...', progress: 0 });

  const pptx = new pptxgen();

  // Set presentation properties
  pptx.title = content.title || 'Untitled Presentation';
  pptx.author = 'Koffey AI';
  pptx.company = 'Koffey';

  // Set layout based on aspect ratio
  const aspectRatio = content.aspectRatio || '16:9';
  if (aspectRatio === '16:9') {
    pptx.layout = 'LAYOUT_16x9';
  } else if (aspectRatio === '4:3') {
    pptx.layout = 'LAYOUT_4x3';
  } else {
    pptx.layout = 'LAYOUT_16x10';
  }

  // Fetch logo and define master slides
  let logoBase64: string | null = null;
  if (content.theme?.logoUrl) {
    logoBase64 = await fetchImageAsBase64(content.theme.logoUrl);
  }
  defineMasterSlides(pptx, content.theme, logoBase64, aspectRatio);

  // Sort slides by order
  const sortedSlides = [...content.slides].sort((a, b) => a.order - b.order);
  const totalSlides = sortedSlides.length;

  onProgress?.({
    stage: 'slides',
    stageLabel: 'Creating slides...',
    progress: 10,
    currentSlide: 0,
    totalSlides,
  });

  // Process each slide
  for (let i = 0; i < sortedSlides.length; i++) {
    const slideContent = sortedSlides[i];

    // Check if elements have meaningful position data (not just zeroes or undefined)
    const hasPositionData = slideContent.elements.some(
      (e) => e.x !== undefined && e.width !== undefined && (e.x > 0 || e.y > 0) && e.width > 0
    );

    if (hasPositionData) {
      // Process elements with their explicit positions on a content master
      const slide = pptx.addSlide({ masterName: 'MASTER_CONTENT' });
      if (slideContent.backgroundColor) {
        slide.background = { color: formatColor(slideContent.backgroundColor) };
      }
      if (slideContent.notes) slide.addNotes(slideContent.notes);
      for (const element of slideContent.elements) {
        await addElementToSlide(slide, element, aspectRatio, content.theme);
      }
    } else {
      // Auto-layout: dispatch based on layout type
      const masterName = getMasterName(slideContent.layout, i, totalSlides);
      const slide = pptx.addSlide({ masterName });
      if (slideContent.backgroundColor) {
        slide.background = { color: formatColor(slideContent.backgroundColor) };
      }
      if (slideContent.notes) slide.addNotes(slideContent.notes);
      addLayoutSlide(slide, slideContent, i, totalSlides, content.theme);
    }

    const progress = 10 + ((i + 1) / totalSlides) * 70;
    onProgress?.({
      stage: 'slides',
      stageLabel: `Creating slide ${i + 1} of ${totalSlides}...`,
      progress,
      currentSlide: i + 1,
      totalSlides,
    });
  }

  onProgress?.({ stage: 'finalizing', stageLabel: 'Generating file...', progress: 90 });

  // Generate blob
  const blob = await pptx.write({ outputType: 'blob' }) as Blob;

  onProgress?.({ stage: 'finalizing', stageLabel: 'Complete!', progress: 100 });

  return blob;
}

// ── Layout Dispatcher ───────────────────────────────────────────────────────

/**
 * Layout-aware slide dispatcher. Reads slideContent.layout and calls the
 * appropriate rendering function. Falls back to centered for first/last slide
 * and title_and_bullets for everything else when layout is unset.
 */
function addLayoutSlide(
  slide: pptxgen.Slide,
  slideContent: SlideContent,
  slideIndex: number,
  totalSlides: number,
  theme?: PresentationContent['theme']
): void {
  const elements = slideContent.elements;
  if (!elements || elements.length === 0) return;

  // Determine effective layout
  let effectiveLayout = slideContent.layout;
  if (!effectiveLayout) {
    if (slideIndex === 0 || slideIndex === totalSlides - 1) effectiveLayout = 'centered';
    else effectiveLayout = 'title_and_bullets';
  }

  const isDarkMaster = effectiveLayout === 'centered' || effectiveLayout === 'title_only';

  switch (effectiveLayout) {
    case 'centered':
      addCenteredLayout(slide, elements, isDarkMaster, theme);
      break;
    case 'title_and_bullets':
      addTitleAndBulletsLayout(slide, elements, theme);
      break;
    case 'two_column':
      addTwoColumnLayout(slide, elements, theme);
      break;
    case 'comparison':
      addComparisonLayout(slide, elements, theme);
      break;
    case 'quote':
      addQuoteLayout(slide, elements, theme);
      break;
    case 'image_left':
      addImageSideLayout(slide, elements, theme, true);
      break;
    case 'image_right':
      addImageSideLayout(slide, elements, theme, false);
      break;
    case 'title_only':
      addTitleOnlyLayout(slide, elements, theme);
      break;
    default:
      addTitleAndBulletsLayout(slide, elements, theme);
      break;
  }
}

// ── Per-Layout Rendering Functions ──────────────────────────────────────────

/**
 * Centered layout — Title / closing slide.
 * White text centered on dark master background.
 */
function addCenteredLayout(
  slide: pptxgen.Slide,
  elements: SlideElement[],
  isDarkBackground: boolean,
  theme?: PresentationContent['theme']
): void {
  const textColor = isDarkBackground ? 'FFFFFF' : (formatColor(theme?.textColor) || '333333');
  const subtitleColor = isDarkBackground ? 'CCCCCC' : '666666';

  const title = elements[0];
  slide.addText(title.content || '', {
    x: 0.5,
    y: 1.2,
    w: 9,
    h: 1.5,
    fontSize: title.fontSize || 36,
    fontFace: title.fontFace || theme?.headingFont || 'Arial',
    color: textColor,
    bold: title.bold !== false,
    align: 'center',
    valign: 'middle',
    lineSpacingMultiple: 1.0,
  });

  if (elements.length > 1) {
    const subtitle = elements[1];
    slide.addText(subtitle.content || '', {
      x: 1.5,
      y: 3.1,
      w: 7,
      h: 0.8,
      fontSize: subtitle.fontSize || 18,
      fontFace: subtitle.fontFace || theme?.bodyFont || 'Arial',
      color: subtitleColor,
      align: 'center',
      valign: 'middle',
      lineSpacingMultiple: 1.2,
    });
  }

  // Any remaining elements as smaller text below
  for (let i = 2; i < elements.length; i++) {
    slide.addText(elements[i].content || '', {
      x: 1.5,
      y: 3.9 + (i - 2) * 0.5,
      w: 7,
      h: 0.5,
      fontSize: elements[i].fontSize || 11,
      fontFace: elements[i].fontFace || theme?.bodyFont || 'Arial',
      color: subtitleColor,
      align: 'center',
      valign: 'middle',
    });
  }
}

/**
 * Title-and-bullets layout — heading top-left, bullet list below.
 * Uses MASTER_CONTENT (white background, accent bar, footer logo).
 */
function addTitleAndBulletsLayout(
  slide: pptxgen.Slide,
  elements: SlideElement[],
  theme?: PresentationContent['theme']
): void {
  const heading = elements[0];
  slide.addText(heading.content || '', {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.8,
    fontSize: heading.fontSize || 28,
    fontFace: heading.fontFace || theme?.headingFont || 'Arial',
    color: formatColor(heading.color || theme?.primaryColor || theme?.textColor) || '000000',
    bold: heading.bold !== false,
    align: 'left',
    valign: 'bottom',
    lineSpacingMultiple: 1.0,
  });

  // Subtle divider line
  slide.addShape('line' as pptxgen.ShapeType, {
    x: 0.5,
    y: 1.15,
    w: 9,
    h: 0,
    line: { color: formatColor(theme?.accentColor) || '4472C4', width: 1.5 },
  });

  // Body elements as bullet-style items
  const bodyElements = elements.slice(1);
  const availableHeight = 3.8; // inches for body content
  const itemHeight = Math.min(0.7, availableHeight / Math.max(bodyElements.length, 1));

  for (let i = 0; i < bodyElements.length; i++) {
    const el = bodyElements[i];
    const content = el.content || '';

    // Statistics: large bold numbers in primary color
    if (el.fontSize && el.fontSize >= 30 && el.bold) {
      slide.addText(content, {
        x: 0.7,
        y: 1.4 + i * itemHeight,
        w: 8.5,
        h: itemHeight,
        fontSize: el.fontSize || 32,
        fontFace: el.fontFace || theme?.headingFont || 'Arial',
        color: formatColor(el.color || theme?.primaryColor) || '1a1a2e',
        bold: true,
        align: 'left',
        valign: 'top',
        lineSpacingMultiple: 1.0,
      });
    } else {
      // Standard bullet item
      const bulletContent = content.match(/^[•\-\d]/) ? content : `\u2022 ${content}`;
      slide.addText(bulletContent, {
        x: 0.7,
        y: 1.4 + i * itemHeight,
        w: 8.5,
        h: itemHeight,
        fontSize: el.fontSize || 15,
        fontFace: el.fontFace || theme?.bodyFont || 'Arial',
        color: formatColor(el.color || theme?.textColor) || '333333',
        bold: el.bold,
        italic: el.italic,
        align: 'left',
        valign: 'top',
        lineSpacingMultiple: 1.2,
      });
    }
  }
}

/**
 * Two-column layout — elements split 50/50 left/right.
 */
function addTwoColumnLayout(
  slide: pptxgen.Slide,
  elements: SlideElement[],
  theme?: PresentationContent['theme']
): void {
  const heading = elements[0];
  slide.addText(heading.content || '', {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.8,
    fontSize: heading.fontSize || 28,
    fontFace: heading.fontFace || theme?.headingFont || 'Arial',
    color: formatColor(heading.color || theme?.primaryColor || theme?.textColor) || '000000',
    bold: heading.bold !== false,
    align: 'left',
    valign: 'bottom',
    lineSpacingMultiple: 1.0,
  });

  const bodyElements = elements.slice(1);
  const midpoint = Math.ceil(bodyElements.length / 2);
  const leftCol = bodyElements.slice(0, midpoint);
  const rightCol = bodyElements.slice(midpoint);

  const colHeight = 3.6;

  // Left column
  const leftItemH = Math.min(0.65, colHeight / Math.max(leftCol.length, 1));
  for (let i = 0; i < leftCol.length; i++) {
    const el = leftCol[i];
    const content = el.content || '';
    const bulletContent = content.match(/^[•\-\d]/) ? content : `\u2022 ${content}`;
    slide.addText(bulletContent, {
      x: 0.5,
      y: 1.3 + i * leftItemH,
      w: 4.2,
      h: leftItemH,
      fontSize: el.fontSize || 15,
      fontFace: el.fontFace || theme?.bodyFont || 'Arial',
      color: formatColor(el.color || theme?.textColor) || '333333',
      bold: el.bold,
      italic: el.italic,
      align: 'left',
      valign: 'top',
      lineSpacingMultiple: 1.2,
    });
  }

  // Right column
  const rightItemH = Math.min(0.65, colHeight / Math.max(rightCol.length, 1));
  for (let i = 0; i < rightCol.length; i++) {
    const el = rightCol[i];
    const content = el.content || '';
    const bulletContent = content.match(/^[•\-\d]/) ? content : `\u2022 ${content}`;
    slide.addText(bulletContent, {
      x: 5.3,
      y: 1.3 + i * rightItemH,
      w: 4.2,
      h: rightItemH,
      fontSize: el.fontSize || 15,
      fontFace: el.fontFace || theme?.bodyFont || 'Arial',
      color: formatColor(el.color || theme?.textColor) || '333333',
      bold: el.bold,
      italic: el.italic,
      align: 'left',
      valign: 'top',
      lineSpacingMultiple: 1.2,
    });
  }
}

/**
 * Comparison layout — two columns with accent-colored headers.
 * elements[0] = heading, elements[1] = left column header,
 * elements[2] = right column header, rest = body items split between columns.
 */
function addComparisonLayout(
  slide: pptxgen.Slide,
  elements: SlideElement[],
  theme?: PresentationContent['theme']
): void {
  const accentColor = formatColor(theme?.accentColor) || '4472C4';

  // Main heading
  const heading = elements[0];
  slide.addText(heading.content || '', {
    x: 0.5,
    y: 0.2,
    w: 9,
    h: 0.7,
    fontSize: heading.fontSize || 28,
    fontFace: heading.fontFace || theme?.headingFont || 'Arial',
    color: formatColor(heading.color || theme?.primaryColor || theme?.textColor) || '000000',
    bold: heading.bold !== false,
    align: 'left',
    valign: 'bottom',
    lineSpacingMultiple: 1.0,
  });

  const bodyElements = elements.slice(1);

  // Need at least 2 body elements for column headers
  if (bodyElements.length < 2) {
    addTitleAndBulletsLayout(slide, elements, theme);
    return;
  }

  // Left column header (accent background, white text)
  slide.addShape('rect' as pptxgen.ShapeType, {
    x: 0.5,
    y: 1.1,
    w: 4.2,
    h: 0.45,
    fill: { color: accentColor },
  });
  slide.addText(bodyElements[0].content || '', {
    x: 0.5,
    y: 1.1,
    w: 4.2,
    h: 0.45,
    fontSize: 16,
    fontFace: theme?.headingFont || 'Arial',
    color: 'FFFFFF',
    bold: true,
    align: 'center',
    valign: 'middle',
  });

  // Right column header
  slide.addShape('rect' as pptxgen.ShapeType, {
    x: 5.3,
    y: 1.1,
    w: 4.2,
    h: 0.45,
    fill: { color: accentColor },
  });
  slide.addText(bodyElements[1].content || '', {
    x: 5.3,
    y: 1.1,
    w: 4.2,
    h: 0.45,
    fontSize: 16,
    fontFace: theme?.headingFont || 'Arial',
    color: 'FFFFFF',
    bold: true,
    align: 'center',
    valign: 'middle',
  });

  // Remaining items split between columns
  const remaining = bodyElements.slice(2);
  const midpoint = Math.ceil(remaining.length / 2);
  const leftItems = remaining.slice(0, midpoint);
  const rightItems = remaining.slice(midpoint);
  const itemH = 0.55;

  for (let i = 0; i < leftItems.length; i++) {
    const el = leftItems[i];
    slide.addText(`\u2022 ${el.content || ''}`, {
      x: 0.6,
      y: 1.7 + i * itemH,
      w: 4.0,
      h: itemH,
      fontSize: el.fontSize || 15,
      fontFace: el.fontFace || theme?.bodyFont || 'Arial',
      color: formatColor(el.color || theme?.textColor) || '333333',
      align: 'left',
      valign: 'top',
      lineSpacingMultiple: 1.2,
    });
  }

  for (let i = 0; i < rightItems.length; i++) {
    const el = rightItems[i];
    slide.addText(`\u2022 ${el.content || ''}`, {
      x: 5.4,
      y: 1.7 + i * itemH,
      w: 4.0,
      h: itemH,
      fontSize: el.fontSize || 15,
      fontFace: el.fontFace || theme?.bodyFont || 'Arial',
      color: formatColor(el.color || theme?.textColor) || '333333',
      align: 'left',
      valign: 'top',
      lineSpacingMultiple: 1.2,
    });
  }
}

/**
 * Quote layout — large italic text with accent-colored left bar, attribution below.
 */
function addQuoteLayout(
  slide: pptxgen.Slide,
  elements: SlideElement[],
  theme?: PresentationContent['theme']
): void {
  const accentColor = formatColor(theme?.accentColor) || '4472C4';

  // Accent bar on left side of quote
  slide.addShape('rect' as pptxgen.ShapeType, {
    x: 1.0,
    y: 1.2,
    w: 0.08,
    h: 2.5,
    fill: { color: accentColor },
  });

  // Quote text (large, italic)
  const quoteEl = elements[0];
  const quoteText = quoteEl.content || '';
  const displayQuote = quoteText.startsWith('"') || quoteText.startsWith('\u201C') ? quoteText : `\u201C${quoteText}\u201D`;
  slide.addText(displayQuote, {
    x: 1.4,
    y: 1.2,
    w: 7.5,
    h: 2.2,
    fontSize: quoteEl.fontSize || 22,
    fontFace: quoteEl.fontFace || theme?.bodyFont || 'Georgia',
    color: formatColor(quoteEl.color || theme?.textColor) || '333333',
    italic: true,
    align: 'left',
    valign: 'middle',
    lineSpacingMultiple: 1.2,
  });

  // Attribution (second element if present)
  if (elements.length > 1) {
    const attrEl = elements[1];
    const attrText = attrEl.content || '';
    const displayAttr = attrText.startsWith('\u2014') || attrText.startsWith('-') ? attrText : `\u2014 ${attrText}`;
    slide.addText(displayAttr, {
      x: 1.4,
      y: 3.5,
      w: 7.5,
      h: 0.5,
      fontSize: attrEl.fontSize || 15,
      fontFace: attrEl.fontFace || theme?.bodyFont || 'Arial',
      color: formatColor(attrEl.color) || '888888',
      align: 'left',
      valign: 'top',
    });
  }

  // Additional elements below
  for (let i = 2; i < elements.length; i++) {
    slide.addText(elements[i].content || '', {
      x: 1.4,
      y: 4.0 + (i - 2) * 0.4,
      w: 7.5,
      h: 0.4,
      fontSize: elements[i].fontSize || 11,
      fontFace: elements[i].fontFace || theme?.bodyFont || 'Arial',
      color: formatColor(elements[i].color || theme?.textColor) || '888888',
      align: 'left',
      valign: 'top',
    });
  }
}

/**
 * Image side layout — image placeholder on one side, text on other.
 */
function addImageSideLayout(
  slide: pptxgen.Slide,
  elements: SlideElement[],
  theme?: PresentationContent['theme'],
  imageOnLeft: boolean = true
): void {
  const imgX = imageOnLeft ? 0.3 : 5.3;
  const textX = imageOnLeft ? 5.3 : 0.5;

  // Find image element (if any)
  const imageEl = elements.find((e) => e.type === 'image' && e.imageUrl);
  const textElements = elements.filter((e) => e !== imageEl);

  // Image placeholder
  slide.addShape('rect' as pptxgen.ShapeType, {
    x: imgX,
    y: 0.5,
    w: 4.4,
    h: 4.2,
    fill: { color: 'F0F0F0' },
  });
  if (!imageEl?.imageUrl) {
    slide.addText('[Image]', {
      x: imgX,
      y: 0.5,
      w: 4.4,
      h: 4.2,
      fontSize: 14,
      color: 'AAAAAA',
      align: 'center',
      valign: 'middle',
    });
  }

  // Text content on the other side
  if (textElements.length > 0) {
    const heading = textElements[0];
    slide.addText(heading.content || '', {
      x: textX,
      y: 0.5,
      w: 4.2,
      h: 0.8,
      fontSize: heading.fontSize || 28,
      fontFace: heading.fontFace || theme?.headingFont || 'Arial',
      color: formatColor(heading.color || theme?.primaryColor || theme?.textColor) || '000000',
      bold: heading.bold !== false,
      align: 'left',
      valign: 'bottom',
      lineSpacingMultiple: 1.0,
    });

    const bodyElements = textElements.slice(1);
    const bodyStart = 1.5;
    const bodyHeight = 3.2;
    const itemH = Math.min(0.6, bodyHeight / Math.max(bodyElements.length, 1));

    for (let i = 0; i < bodyElements.length; i++) {
      const el = bodyElements[i];
      const content = el.content || '';
      const bulletContent = content.match(/^[•\-\d]/) ? content : `\u2022 ${content}`;
      slide.addText(bulletContent, {
        x: textX,
        y: bodyStart + i * itemH,
        w: 4.2,
        h: itemH,
        fontSize: el.fontSize || 15,
        fontFace: el.fontFace || theme?.bodyFont || 'Arial',
        color: formatColor(el.color || theme?.textColor) || '333333',
        bold: el.bold,
        italic: el.italic,
        align: 'left',
        valign: 'top',
        lineSpacingMultiple: 1.2,
      });
    }
  }
}

/**
 * Title-only layout — section divider with just the heading.
 * Renders on MASTER_SECTION (primary bg + accent bar on left).
 */
function addTitleOnlyLayout(
  slide: pptxgen.Slide,
  elements: SlideElement[],
  theme?: PresentationContent['theme']
): void {
  const heading = elements[0];
  slide.addText(heading.content || '', {
    x: 0.8,
    y: 1.5,
    w: 8.5,
    h: 2.0,
    fontSize: heading.fontSize || 36,
    fontFace: heading.fontFace || theme?.headingFont || 'Arial',
    color: 'FFFFFF',
    bold: heading.bold !== false,
    align: 'left',
    valign: 'middle',
    lineSpacingMultiple: 1.0,
  });

  // Optional subtitle below heading
  if (elements.length > 1) {
    slide.addText(elements[1].content || '', {
      x: 0.8,
      y: 3.5,
      w: 8.5,
      h: 0.8,
      fontSize: elements[1].fontSize || 18,
      fontFace: elements[1].fontFace || theme?.bodyFont || 'Arial',
      color: 'CCCCCC',
      align: 'left',
      valign: 'top',
      lineSpacingMultiple: 1.2,
    });
  }
}

// ── Positioned Element Rendering ────────────────────────────────────────────

async function addElementToSlide(
  slide: pptxgen.Slide,
  element: SlideElement,
  aspectRatio: string,
  theme?: PresentationContent['theme']
): Promise<void> {
  const x = pctToInches(element.x, 'width', aspectRatio);
  const y = pctToInches(element.y, 'height', aspectRatio);
  const w = pctToInches(element.width, 'width', aspectRatio);
  const h = pctToInches(element.height, 'height', aspectRatio);

  switch (element.type) {
    case 'text':
      slide.addText(element.content || '', {
        x,
        y,
        w,
        h,
        fontSize: element.fontSize || 14,
        fontFace: element.fontFace || theme?.bodyFont || 'Arial',
        color: formatColor(element.color || theme?.textColor) || '000000',
        bold: element.bold,
        italic: element.italic,
        align: element.align || 'left',
        valign: element.valign || 'top',
        fill: element.backgroundColor ? { color: formatColor(element.backgroundColor) } : undefined,
      });
      break;

    case 'image':
      if (element.imageUrl) {
        try {
          // Fetch image and convert to base64
          const imageData = await fetchImageAsBase64(element.imageUrl);
          if (imageData) {
            slide.addImage({
              data: imageData,
              x,
              y,
              w,
              h,
            });
          }
        } catch (err) {
          console.warn('Failed to add image:', err);
          // Add placeholder rectangle instead
          slide.addShape('rect' as pptxgen.ShapeType, {
            x,
            y,
            w,
            h,
            fill: { color: 'CCCCCC' },
          });
        }
      }
      break;

    case 'shape':
      const shapeType = (element.shapeType || 'rect') as pptxgen.ShapeType;
      slide.addShape(shapeType, {
        x,
        y,
        w,
        h,
        fill: element.backgroundColor ? { color: formatColor(element.backgroundColor) } : { color: formatColor(theme?.primaryColor) || '4472C4' },
      });
      break;

    default:
      // Unsupported element type - skip
      break;
  }
}

// ── Utilities ───────────────────────────────────────────────────────────────

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Download presentation as PPTX file
 */
export async function downloadPptx(
  content: PresentationContent,
  fileName?: string,
  onProgress?: ProgressCallback
): Promise<void> {
  const blob = await generatePptxBlob(content, onProgress);

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName || content.title || 'presentation'}.pptx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
