import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import JSZip from "npm:jszip@3.10.1";
import { XMLParser, XMLBuilder } from "npm:fast-xml-parser@4.5.1";
import { callWithFallback, hasAnyProvider } from '../_shared/ai-provider.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

interface GenerateRequest {
  templateId: string;
  organizationId: string;
  userId: string;
  personalizationLevel: 'account' | 'deal' | 'contact';
  accountId: string;
  dealId?: string;
  contactId?: string;
}

interface SlotMapping {
  id: string;
  slide_index: number;
  element_id: string;
  element_type: string;
  slot_name: string;
  mapping_type: 'direct' | 'ai_generated' | 'static' | 'conditional';
  data_source?: string;
  ai_prompt?: string;
  ai_model: string;
  ai_max_tokens: number;
  ai_temperature: number;
  max_characters?: number;
  format_as?: string;
  fallback_value?: string;
}

interface ContextData {
  [key: string]: any;
}

interface AiCallRecord {
  slot_name: string;
  prompt: string;
  response: string;
  model: string;
  tokens_used: number;
  latency_ms: number;
  timestamp: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
const startTime = Date.now();
  const aiCallsMade: AiCallRecord[] = [];

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const body: GenerateRequest = await req.json();
    const {
      templateId,
      organizationId,
      userId,
      personalizationLevel,
      accountId,
      dealId,
      contactId
    } = body;

    console.log(`[generate-from-template] Starting generation for template ${templateId}`);

    // 1. Fetch Template
    const { data: template, error: templateError } = await supabase
      .from('slide_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      console.error('[generate-from-template] Template not found:', templateError);
      return new Response(JSON.stringify({ error: 'Template not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Fetch Slot Mappings
    const { data: mappings, error: mappingsError } = await supabase
      .from('template_slot_mappings')
      .select('*')
      .eq('template_id', templateId)
      .order('slide_index', { ascending: true })
      .order('display_order', { ascending: true });

    if (mappingsError) {
      console.error('[generate-from-template] Failed to fetch mappings:', mappingsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch mappings' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[generate-from-template] Found ${mappings?.length || 0} slot mappings`);

    // 3. Fetch CRM Data
    const contextData = await buildContextData(
      supabase,
      personalizationLevel,
      accountId,
      dealId,
      contactId
    );

    console.log('[generate-from-template] Context data built:', Object.keys(contextData));

    // 4. Generate AI Content for AI slots
    const aiSlots = (mappings || []).filter((m: SlotMapping) => m.mapping_type === 'ai_generated' && m.ai_prompt);
    const aiContent: Record<string, string> = {};

    // Check if AI is available (using Groq)
    const aiAvailable = hasAnyProvider();
    
    for (const slot of aiSlots) {
      if (!aiAvailable) {
        console.warn('[generate-from-template] No AI provider configured, using fallback');
        aiContent[slot.slot_name] = slot.fallback_value || '[AI content unavailable]';
        continue;
      }

      const aiStartTime = Date.now();
      const interpolatedPrompt = interpolatePrompt(slot.ai_prompt, contextData);
      
      try {
        const aiResult = await callWithFallback({
          messages: [
            { role: 'system', content: 'You are a professional copywriter for sales presentations. Keep responses concise and impactful.' },
            { role: 'user', content: interpolatedPrompt }
          ],
          tier: 'standard',
          temperature: slot.ai_temperature || 0.7,
          maxTokens: slot.ai_max_tokens || 150
        });

        const content = aiResult.content.trim() || slot.fallback_value || '';
        aiContent[slot.slot_name] = formatValue(content, slot.format_as, slot.max_characters);
        
        aiCallsMade.push({
          slot_name: slot.slot_name,
          prompt: interpolatedPrompt,
          response: content,
          model: aiResult.model,
          tokens_used: 0, // Groq doesn't return usage in the same format
          latency_ms: Date.now() - aiStartTime,
          timestamp: new Date().toISOString()
        });
        
        console.log(`[generate-from-template] AI content generated for ${slot.slot_name} via ${aiResult.provider}`);
      } catch (aiError) {
        console.error(`[generate-from-template] AI error for slot ${slot.slot_name}:`, aiError);
        aiContent[slot.slot_name] = slot.fallback_value || '';
      }
    }

    console.log(`[generate-from-template] Generated AI content for ${Object.keys(aiContent).length} slots`);

    // 5. Download template file from storage
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (!template.storage_path) {
      return new Response(JSON.stringify({ error: 'Template file not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: fileData, error: downloadError } = await serviceClient.storage
      .from('slide-templates')
      .download(template.storage_path);

    if (downloadError || !fileData) {
      console.error('[generate-from-template] Failed to download template:', downloadError);
      return new Response(JSON.stringify({ error: 'Failed to download template file' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 6. Process PPTX and inject content
    const templateBuffer = await fileData.arrayBuffer();
    const zip = await JSZip.loadAsync(templateBuffer);
    
    const parser = new XMLParser({
      ignoreAttributes: false,
      preserveOrder: true,
      attributeNamePrefix: '@_'
    });
    
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      preserveOrder: true,
      attributeNamePrefix: '@_'
    });

    // Group mappings by slide
    const mappingsBySlide: Record<number, SlotMapping[]> = {};
    for (const mapping of (mappings || [])) {
      if (!mappingsBySlide[mapping.slide_index]) {
        mappingsBySlide[mapping.slide_index] = [];
      }
      mappingsBySlide[mapping.slide_index].push(mapping);
    }

    // Process each slide
    for (const [slideIndex, slideMappings] of Object.entries(mappingsBySlide)) {
      const slideFile = `ppt/slides/slide${parseInt(slideIndex) + 1}.xml`;
      const slideEntry = zip.file(slideFile);
      
      if (!slideEntry) {
        console.warn(`[generate-from-template] Slide file not found: ${slideFile}`);
        continue;
      }

      let slideXml = await slideEntry.async('string');
      
      // For each mapping, find and replace content
      for (const mapping of slideMappings) {
        let value: string;
        
        if (mapping.mapping_type === 'ai_generated') {
          value = aiContent[mapping.slot_name] || mapping.fallback_value || '';
        } else if (mapping.mapping_type === 'static') {
          value = mapping.fallback_value || '';
        } else if (mapping.mapping_type === 'direct') {
          value = resolveDataSource(mapping.data_source, contextData) || mapping.fallback_value || '';
        } else {
          value = mapping.fallback_value || '';
        }

        // Apply formatting
        value = formatValue(value, mapping.format_as, mapping.max_characters);

        // Simple text replacement based on placeholder
        // In a real implementation, you'd parse the XML and find the specific element
        // For now, we do text-based replacement if there's placeholder text
        if (mapping.element_id && value) {
          // Try to find and replace placeholder text patterns
          const placeholderPatterns = [
            `{${mapping.slot_name}}`,
            `[${mapping.slot_name}]`,
            `{{${mapping.slot_name}}}`,
          ];
          
          for (const pattern of placeholderPatterns) {
            slideXml = slideXml.replace(new RegExp(escapeRegExp(pattern), 'gi'), escapeXml(value));
          }
        }
      }

      zip.file(slideFile, slideXml);
    }

    // 7. Generate output file
    const outputBuffer = await zip.generateAsync({ type: 'uint8array' });
    
    // Create filename
    const accountName = contextData['account.name'] || 'Unknown';
    const sanitizedAccountName = accountName.replace(/[^a-zA-Z0-9]/g, '_');
    const sanitizedTemplateName = template.name.replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = Date.now();
    const fileName = `${sanitizedAccountName}_${sanitizedTemplateName}_${timestamp}.pptx`;
    const storagePath = `${organizationId}/generated/${fileName}`;

    // 8. Upload to storage
    const { error: uploadError } = await serviceClient.storage
      .from('generated-slides')
      .upload(storagePath, outputBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        upsert: true
      });

    if (uploadError) {
      console.error('[generate-from-template] Upload failed:', uploadError);
      return new Response(JSON.stringify({ error: 'Failed to upload generated presentation' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get public URL
    const { data: urlData } = serviceClient.storage
      .from('generated-slides')
      .getPublicUrl(storagePath);

    // 9. Create generated_presentations record
    const { data: presentation, error: insertError } = await supabase
      .from('generated_presentations')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        template_id: templateId,
        generation_mode: 'template_based',
        personalization_level: personalizationLevel,
        account_id: accountId,
        deal_id: dealId || null,
        contact_id: contactId || null,
        storage_path: storagePath,
        file_name: fileName,
        slot_values_used: contextData,
        ai_calls_made: aiCallsMade,
        generation_time_ms: Date.now() - startTime
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[generate-from-template] Failed to create presentation record:', insertError);
    }

    // Log activity for presentation generation
    const accountName = contextData['account.name'] || 'Unknown';
    const contactName = contextData['contact.full_name'];
    await supabase.from('activities').insert({
      organization_id: organizationId,
      user_id: userId,
      account_id: accountId,
      deal_id: dealId || null,
      contact_id: contactId || null,
      type: 'presentation',
      title: `Generated presentation from template`,
      description: `Created ${template.name} deck for ${accountName}${contactName ? ` (for ${contactName})` : ''}`,
    });

    const generationTime = Date.now() - startTime;
    console.log(`[generate-from-template] Successfully generated in ${generationTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      presentationId: presentation?.id || null,
      downloadUrl: urlData.publicUrl,
      fileName,
      slideCount: template.slide_count || 0,
      generationTimeMs: generationTime,
      aiSlotsProcessed: aiCallsMade.length
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[generate-from-template] Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Generation failed' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function buildContextData(
  supabase: any,
  personalizationLevel: string,
  accountId: string,
  dealId?: string,
  contactId?: string
): Promise<ContextData> {
  const data: ContextData = {};

  // Always fetch account
  const { data: account } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (account) {
    data['account.id'] = account.id;
    data['account.name'] = account.name;
    data['account.industry'] = account.industry || '';
    data['account.website'] = account.website || '';
    data['account.domain'] = account.domain || '';
    data['account.phone'] = account.phone || '';
    data['account.address'] = account.address || '';
    data['account.description'] = account.description || '';
  }

  // Fetch deal if provided
  if (dealId) {
    const { data: deal } = await supabase
      .from('deals')
      .select('*')
      .eq('id', dealId)
      .single();

    if (deal) {
      data['deal.id'] = deal.id;
      data['deal.name'] = deal.name;
      data['deal.amount'] = deal.amount || 0;
      data['deal.stage'] = deal.stage || '';
      data['deal.probability'] = deal.probability || 0;
      data['deal.expected_close_date'] = deal.expected_close_date || '';
      data['deal.description'] = deal.description || '';
      data['deal.key_use_case'] = deal.key_use_case || '';
      data['deal.products_positioned'] = deal.products_positioned?.join(', ') || '';
    }
  }

  // Fetch contact if provided
  if (contactId) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (contact) {
      data['contact.id'] = contact.id;
      data['contact.full_name'] = contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
      data['contact.first_name'] = contact.first_name || '';
      data['contact.last_name'] = contact.last_name || '';
      data['contact.email'] = contact.email || '';
      data['contact.phone'] = contact.phone || '';
      data['contact.title'] = contact.title || contact.position || '';
      data['contact.company'] = contact.company || account?.name || '';
    }
  }

  // Add computed values
  data['computed.today'] = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  data['computed.quarter'] = `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`;
  data['computed.year'] = new Date().getFullYear().toString();

  return data;
}

function resolveDataSource(dataSource: string | undefined, contextData: ContextData): string {
  if (!dataSource) return '';
  return String(contextData[dataSource] || '');
}

function interpolatePrompt(prompt: string | undefined, contextData: ContextData): string {
  if (!prompt) return '';
  
  return prompt.replace(/\{([^}]+)\}/g, (match, key) => {
    return String(contextData[key] || match);
  });
}

function formatValue(value: string, formatAs?: string, maxChars?: number): string {
  if (!value) return '';
  
  let formatted = value;

  // Apply format
  switch (formatAs) {
    case 'currency':
      const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
      if (!isNaN(num)) {
        formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
      }
      break;
    case 'percentage':
      const pct = parseFloat(value);
      if (!isNaN(pct)) {
        formatted = `${pct}%`;
      }
      break;
    case 'date':
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        formatted = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      }
      break;
    case 'title_case':
      formatted = value.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
      break;
    case 'uppercase':
      formatted = value.toUpperCase();
      break;
  }

  // Apply max characters
  if (maxChars && formatted.length > maxChars) {
    formatted = formatted.substring(0, maxChars - 3) + '...';
  }

  return formatted;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
