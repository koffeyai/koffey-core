import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { callWithFallback, hasAnyProvider } from '../_shared/ai-provider.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

interface GenerateRequest {
  organizationId: string;
  userId: string;
  presentationType: 'discovery' | 'proposal' | 'qbr' | 'executive_summary' | 'custom';
  slideCount?: number;
  customInstructions?: string;
  personalizationLevel: 'account' | 'deal' | 'contact';
  accountId: string;
  dealId?: string;
  contactId?: string;
  brandColors?: { primary: string; secondary: string; accent: string };
  fontPreferences?: { heading: string; body: string };
  logoUrl?: string;
  styleKeywords?: string[];
}

// Company Profile types
interface CompanyProfile {
  company_name: string;
  tagline?: string;
  value_proposition?: string;
  elevator_pitch?: string;
  products_services?: ProductServiceItem[];
  differentiators?: string[];
  proof_points?: ProofPointItem[];
  boilerplate_about?: string;
}

interface ProductServiceItem {
  name: string;
  description: string;
  features?: string[];
}

interface ProofPointItem {
  type: 'stat' | 'quote' | 'logo';
  value: string;
  source?: string;
}

// User Preferences types
interface UserContentPreferences {
  communication_style?: string;
  tone?: string;
  energy_level?: string;
  verbosity?: string;
  signature_phrases?: string[];
  avoid_phrases?: string[];
  rep_title?: string;
  rep_bio?: string;
  custom_instructions?: string;
}

// Deal Note type
interface DealNote {
  content: string;
  note_type?: string;
  created_at: string;
}

interface SlideElement {
  type: 'text' | 'image' | 'shape';
  role: string;
  content?: string;
  style?: string;
  source?: string;
}

interface SlideData {
  index: number;
  type: string;
  layout: string;
  elements: SlideElement[];
}

interface AISlideResponse {
  slides: SlideData[];
  speakerNotes: Record<number, string>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
const startTime = Date.now();
  let presentationId: string | null = null;

  // Initialize clients
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const authHeader = req.headers.get('Authorization');
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader || '' } }
  });
  
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Validate auth
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const body: GenerateRequest = await req.json();
    const {
      organizationId,
      userId,
      presentationType,
      slideCount,
      customInstructions,
      personalizationLevel,
      accountId,
      dealId,
      contactId,
      brandColors,
      fontPreferences,
      logoUrl,
      styleKeywords
    } = body;

    // Validate required fields
    if (!organizationId || !userId || !presentationType || !accountId) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: organizationId, userId, presentationType, accountId' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[generate-ai-slides] Starting generation for org ${organizationId}, type: ${presentationType}`);

    // STEP 1: Create presentation record with 'generating' status FIRST
    const { data: presentation, error: createError } = await supabase
      .from('generated_presentations')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        account_id: accountId,
        deal_id: dealId || null,
        contact_id: contactId || null,
        status: 'generating',
        storage_path: '',
        file_name: `presentation-${Date.now()}`,
        generation_mode: 'ai_creative',
        personalization_level: personalizationLevel,
        generation_config: {
          presentationType,
          customInstructions: customInstructions || null,
          slideCount: slideCount || 'auto',
          brandColors,
          fontPreferences,
          logoUrl,
          styleKeywords
        }
      })
      .select('id')
      .single();

    if (createError) {
      console.error('[generate-ai-slides] Failed to create presentation record:', createError);
      return new Response(JSON.stringify({ error: `Failed to create presentation: ${createError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    presentationId = presentation.id;
    console.log(`[generate-ai-slides] Created presentation record: ${presentationId}`);

    // STEP 2: Fetch CRM context + Company Profile + User Prefs + Deal Notes in parallel
    const [
      accountResult, 
      dealResult, 
      contactResult, 
      activitiesResult, 
      accountDealsResult,
      companyProfileResult,
      userPreferencesResult,
      dealNotesResult,
      userProfileResult
    ] = await Promise.all([
      // Existing CRM fetches
      supabase.from('accounts').select('*').eq('id', accountId).single(),
      dealId ? supabase.from('deals').select('*').eq('id', dealId).single() : Promise.resolve({ data: null, error: null }),
      contactId ? supabase.from('contacts').select('*').eq('id', contactId).single() : Promise.resolve({ data: null, error: null }),
      supabase.from('activities').select('title, type, activity_date').eq('account_id', accountId).order('activity_date', { ascending: false }).limit(5),
      supabase.from('deals').select('id, name, amount, stage').eq('account_id', accountId),
      
      // NEW: Fetch company profile for seller context
      supabase.from('company_profiles')
        .select('company_name, tagline, value_proposition, elevator_pitch, products_services, differentiators, proof_points, boilerplate_about')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      
      // NEW: Fetch user content preferences for rep voice
      supabase.from('user_prompt_preferences')
        .select('communication_style, tone, energy_level, verbosity, signature_phrases, avoid_phrases, rep_title, rep_bio, custom_instructions')
        .eq('user_id', userId)
        .maybeSingle(),
      
      // NEW: Fetch deal notes for contextual intelligence (if deal selected)
      dealId 
        ? supabase.from('deal_notes')
            .select('content, note_type, created_at')
            .eq('deal_id', dealId)
            .order('created_at', { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [], error: null }),
      
      // NEW: Fetch user profile for rep name
      supabase.from('profiles')
        .select('full_name, email')
        .eq('id', userId)
        .maybeSingle()
    ]);

    const account = accountResult.data;
    const deal = dealResult.data;
    const contact = contactResult.data;
    const activities = activitiesResult.data || [];
    const accountDeals = accountDealsResult.data || [];
    const companyProfile = companyProfileResult.data as CompanyProfile | null;
    const userPreferences = userPreferencesResult.data as UserContentPreferences | null;
    const dealNotes = (dealNotesResult.data || []) as DealNote[];
    const repName = userProfileResult.data?.full_name || userProfileResult.data?.email?.split('@')[0] || 'Account Executive';

    if (!account) {
      await updatePresentationStatus(supabase, presentationId, 'failed', 'Account not found');
      return new Response(JSON.stringify({ error: 'Account not found', presentationId }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const wonDeals = accountDeals.filter(d => d.stage === 'closed-won') || [];
    const wonValue = wonDeals.reduce((sum, d) => sum + (d.amount || 0), 0);

    console.log(`[generate-ai-slides] Context loaded:`, {
      account: account.name,
      deal: deal?.name,
      contact: contact?.full_name,
      hasCompanyProfile: !!companyProfile,
      companyName: companyProfile?.company_name,
      hasUserPreferences: !!userPreferences,
      communicationStyle: userPreferences?.communication_style,
      dealNotesCount: dealNotes.length,
      repName
    });

    // STEP 3: Validate AI provider availability
    if (!hasAnyProvider()) {
      console.error('[generate-ai-slides] No AI provider configured');
      await updatePresentationStatus(supabase, presentationId, 'failed', 'AI service not configured');
      return new Response(JSON.stringify({ error: 'AI service not configured', presentationId }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // STEP 4: Build and execute AI prompt
    const prompt = buildSlidePrompt({
      account,
      deal,
      contact,
      activities,
      accountHistory: { wonDeals: wonDeals.length, wonValue },
      presentationType,
      slideCount,
      customInstructions,
      styleKeywords,
      // NEW parameters
      companyProfile,
      userPreferences,
      dealNotes,
      repName
    });

    let aiContent: string;
    let aiProvider: string;
    let aiModel: string;
    
    try {
      const aiResult = await callWithFallback({
        messages: [
          {
            role: 'system',
            content: `You are an expert sales presentation designer. Generate structured JSON for professional sales presentations. Always respond with valid JSON matching the specified schema. No markdown, no explanations.`
          },
          { role: 'user', content: prompt }
        ],
        tier: 'pro',
        temperature: 0.7,
        maxTokens: 4000,
        jsonMode: true
      });
      
      aiContent = aiResult.content;
      aiProvider = aiResult.provider;
      aiModel = aiResult.model;
      console.log(`[generate-ai-slides] AI response received from ${aiProvider} (${aiModel})`);
    } catch (aiError: unknown) {
      const errorMessage = aiError instanceof Error ? aiError.message : 'AI generation failed';
      console.error('[generate-ai-slides] AI API error:', errorMessage);
      
      await updatePresentationStatus(supabase, presentationId, 'failed', errorMessage);
      
      const statusCode = (aiError as { statusCode?: number })?.statusCode;
      if (statusCode === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.', presentationId }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ error: 'AI generation failed', presentationId }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!aiContent) {
      await updatePresentationStatus(supabase, presentationId, 'failed', 'No content generated');
      return new Response(JSON.stringify({ error: 'No content generated', presentationId }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // STEP 5: Parse AI response
    let slideStructure: AISlideResponse;
    try {
      let jsonString = aiContent;
      const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonString = jsonMatch[1].trim();
      }
      slideStructure = JSON.parse(jsonString);
      
      if (!slideStructure.slides || !Array.isArray(slideStructure.slides)) {
        throw new Error('Invalid slide structure');
      }
    } catch (parseError) {
      console.error('[generate-ai-slides] Failed to parse AI response:', parseError);
      console.log('[generate-ai-slides] Raw response:', aiContent.substring(0, 500));
      await updatePresentationStatus(supabase, presentationId, 'failed', 'Failed to parse slide structure');
      return new Response(JSON.stringify({ error: 'Failed to parse slide structure', presentationId }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // STEP 6: Build full slide data with metadata
    const slideData = {
      metadata: {
        presentationType,
        accountName: account.name,
        dealName: deal?.name,
        contactName: contact?.full_name,
        generatedAt: new Date().toISOString(),
        brandColors: brandColors || { primary: '#1a1a2e', secondary: '#16213e', accent: '#0f3460' },
        fontPreferences: fontPreferences || { heading: 'Arial', body: 'Arial' },
        logoUrl
      },
      ...slideStructure
    };

    // STEP 7: Upload to storage
    const contentPath = `${organizationId}/${presentationId}/content.json`;
    
    console.log(`[generate-ai-slides] Uploading to storage: ${contentPath}`);
    
    const { error: uploadError } = await supabaseAdmin.storage
      .from('generated-slides')
      .upload(contentPath, JSON.stringify(slideData, null, 2), {
        contentType: 'application/json',
        upsert: true
      });

    if (uploadError) {
      console.error('[generate-ai-slides] Storage upload error:', uploadError);
      await updatePresentationStatus(supabase, presentationId, 'failed', `Storage upload failed: ${uploadError.message}`);
      return new Response(JSON.stringify({ error: 'Failed to store presentation', presentationId }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[generate-ai-slides] Storage upload successful');

    // STEP 8: Update presentation record with success status
    const presentationTitle = `${presentationType.charAt(0).toUpperCase() + presentationType.slice(1)} for ${account.name}`;
    const generationTimeMs = Date.now() - startTime;

    const { error: updateError } = await supabase
      .from('generated_presentations')
      .update({
        status: 'draft',
        title: presentationTitle,
        content_path: contentPath,
        storage_path: contentPath,
        file_name: `${account.name.replace(/[^a-zA-Z0-9]/g, '_')}_${presentationType}_${Date.now()}.json`,
        slot_values_used: {
          account: { id: account.id, name: account.name },
          deal: deal ? { id: deal.id, name: deal.name } : null,
          contact: contact ? { id: contact.id, name: contact.full_name } : null
        },
        ai_calls_made: [{
          provider: aiProvider,
          model: aiModel,
          timestamp: new Date().toISOString(),
          promptTokens: prompt.length,
          slideCount: slideStructure.slides?.length || 0
        }],
        generation_time_ms: generationTimeMs
      })
      .eq('id', presentationId);

    if (updateError) {
      console.error('[generate-ai-slides] Failed to update presentation:', updateError);
    }

    // STEP 9: Log activity
    await supabase.from('activities').insert({
      organization_id: organizationId,
      user_id: userId,
      account_id: accountId,
      deal_id: dealId || null,
      contact_id: contactId || null,
      type: 'presentation',
      title: `Generated ${presentationType} presentation with AI`,
      description: `Created AI-generated ${presentationType} deck for ${account.name}${contact ? ` (for ${contact.full_name})` : ''}`,
    });

    console.log(`[generate-ai-slides] Successfully generated ${slideStructure.slides?.length || 0} slides in ${generationTimeMs}ms`);

    // STEP 10: Return success response
    return new Response(JSON.stringify({
      success: true,
      presentationId,
      title: presentationTitle,
      slideCount: slideStructure.slides?.length || 0,
      generationTimeMs,
      aiModel,
      slides: slideStructure.slides,
      speakerNotes: slideStructure.speakerNotes,
      metadata: slideData.metadata
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[generate-ai-slides] Unexpected error:', error);
    
    if (presentationId) {
      await updatePresentationStatus(
        supabase, 
        presentationId, 
        'failed', 
        error instanceof Error ? error.message : 'Generation failed'
      );
    }

    return new Response(JSON.stringify({ 
      success: false,
      error: 'Generation failed',
      presentationId 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Helper function to update presentation status
async function updatePresentationStatus(
  supabase: ReturnType<typeof createClient>,
  presentationId: string,
  status: 'generating' | 'draft' | 'ready' | 'failed' | 'archived',
  errorMessage?: string
) {
  try {
    await supabase
      .from('generated_presentations')
      .update({
        status,
        error_message: errorMessage || null
      })
      .eq('id', presentationId);
  } catch (err) {
    console.error('[generate-ai-slides] Failed to update status:', err);
  }
}

// Helper function for style descriptions
function getStyleDescription(style?: string): string {
  const descriptions: Record<string, string> = {
    consultative: 'question-led, discovery-focused',
    direct: 'straightforward, gets to the point quickly',
    storyteller: 'narrative-driven, uses examples and analogies',
    technical: 'data-focused, precise terminology',
    professional: 'balanced business tone'
  };
  return descriptions[style || 'professional'] || 'balanced business tone';
}

function buildSlidePrompt(context: {
  account: Record<string, unknown>;
  deal: Record<string, unknown> | null;
  contact: Record<string, unknown> | null;
  activities: Array<{ title: string; type: string; activity_date: string }>;
  accountHistory: { wonDeals: number; wonValue: number };
  presentationType: string;
  slideCount?: number;
  customInstructions?: string;
  styleKeywords?: string[];
  companyProfile?: CompanyProfile | null;
  userPreferences?: UserContentPreferences | null;
  dealNotes?: DealNote[];
  repName?: string;
}): string {
  const { 
    account, deal, contact, activities, accountHistory, 
    presentationType, slideCount, customInstructions, styleKeywords,
    companyProfile, userPreferences, dealNotes, repName
  } = context;

  const presentationGuides: Record<string, string> = {
    discovery: 'Focus on understanding their challenges, asking insightful questions, and establishing rapport. Include agenda, company intro, industry insights, and discovery questions.',
    proposal: 'Present the solution, pricing, implementation timeline, and ROI. Include executive summary, solution overview, pricing breakdown, and next steps.',
    qbr: 'Review quarterly performance, metrics achieved, challenges faced, and plans for next quarter. Include KPI dashboard, wins/challenges, roadmap, and success stories.',
    executive_summary: 'High-level overview for C-suite. Focus on strategic value, ROI, and business impact. Keep it concise with maximum impact.',
    custom: 'Create a flexible presentation based on the provided instructions.'
  };

  // Build seller context section
  const sellerSection = companyProfile ? `
ABOUT YOUR COMPANY (THE SELLER):
- Company: ${companyProfile.company_name}
${companyProfile.tagline ? `- Tagline: "${companyProfile.tagline}"` : ''}
${companyProfile.value_proposition ? `- Value Proposition: ${companyProfile.value_proposition}` : ''}
${companyProfile.differentiators?.length ? `- Key Differentiators: ${companyProfile.differentiators.join(', ')}` : ''}
${companyProfile.products_services?.length ? `- Products/Services: 
${companyProfile.products_services.map(p => `  • ${p.name}: ${p.description}`).join('\n')}` : ''}

${companyProfile.proof_points?.length ? `PROOF POINTS TO WEAVE IN:
${companyProfile.proof_points.map(p => 
  p.type === 'quote' 
    ? `- "${p.value}" — ${p.source || 'Customer'}`
    : `- ${p.value}${p.source ? ` (${p.source})` : ''}`
).join('\n')}` : ''}
` : '';

  // Build presenter voice section
  const presenterSection = userPreferences ? `
PRESENTER'S VOICE & STYLE:
- Communication Style: ${userPreferences.communication_style || 'professional'} (${getStyleDescription(userPreferences.communication_style)})
- Tone: ${userPreferences.tone || 'professional'}, Energy: ${userPreferences.energy_level || 'balanced'}
- Detail Level: ${userPreferences.verbosity || 'balanced'}
${userPreferences.signature_phrases?.length ? `- Natural phrases to incorporate: "${userPreferences.signature_phrases.slice(0, 3).join('", "')}"` : ''}
${userPreferences.avoid_phrases?.length ? `- Phrases to avoid: "${userPreferences.avoid_phrases.slice(0, 3).join('", "')}"` : ''}
${userPreferences.custom_instructions ? `- Style notes: ${userPreferences.custom_instructions}` : ''}

PRESENTER INFO (use on intro/closing slides):
- Name: ${repName || 'Account Executive'}
- Title: ${userPreferences.rep_title || 'Account Executive'}
${userPreferences.rep_bio ? `- Bio: ${userPreferences.rep_bio}` : ''}
` : '';

  // Build deal intelligence section
  const dealNotesSection = dealNotes?.length ? `
DEAL INTELLIGENCE (insights from sales conversations):
${dealNotes.slice(0, 8).map(note => {
  const date = new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const typeLabel = note.note_type ? `[${note.note_type.toUpperCase()}]` : '';
  const truncatedContent = note.content.length > 180 ? note.content.substring(0, 180) + '...' : note.content;
  return `- ${date} ${typeLabel}: ${truncatedContent}`;
}).join('\n')}

ACTION: Use these insights to personalize the presentation:
- Address objections proactively in relevant slides
- Align solution messaging to stated requirements
- Reference specific pain points or goals mentioned
` : '';

  return `Create a ${presentationType} presentation for the following opportunity:

${sellerSection}
PROSPECT INFORMATION:
- Company Name: ${account.name}
- Industry: ${account.industry || 'Not specified'}
- Website: ${account.website || 'Not specified'}
- Description: ${account.description || 'Not specified'}

${deal ? `DEAL CONTEXT:
- Deal Name: ${deal.name}
- Amount: $${((deal.amount as number) || 0).toLocaleString()}
- Stage: ${deal.stage}
- Probability: ${deal.probability || 0}%
- Expected Close: ${deal.expected_close_date || 'Not set'}
- Key Use Case: ${deal.key_use_case || 'Not specified'}
- Products: ${(deal.products_positioned as string[])?.join(', ') || 'Not specified'}
` : ''}

${contact ? `PRIMARY CONTACT:
- Name: ${contact.full_name}
- Title: ${contact.title || contact.position || 'Not specified'}
- Email: ${contact.email || 'Not specified'}
` : ''}

ACCOUNT HISTORY:
- Won Deals: ${accountHistory.wonDeals}
- Total Won Value: $${accountHistory.wonValue.toLocaleString()}

RECENT ACTIVITIES:
${activities.length > 0 ? activities.map(a => `- ${a.title} (${a.type})`).join('\n') : 'No recent activities'}

${dealNotesSection}
${presenterSection}
PRESENTATION REQUIREMENTS:
- Type: ${presentationType}
- Purpose: ${presentationGuides[presentationType] || presentationGuides.custom}
- Slide count: ${slideCount || 'Choose appropriately (usually 6-12)'}
- Visual style: ${styleKeywords?.join(', ') || 'professional, modern, clean'}
${customInstructions ? `- Special instructions: ${customInstructions}` : ''}

CONTENT RULES:
${companyProfile ? `- Always use "${companyProfile.company_name}" as the seller (never "Your Company" or placeholders)` : ''}
- Personalize all content specifically for ${account.name}
- Write in ${userPreferences?.communication_style || 'professional'} style
${companyProfile?.proof_points?.length ? `- Include 1-2 proof points where they strengthen credibility` : ''}
${dealNotes?.length ? `- Address concerns from deal notes where relevant` : ''}

Generate a JSON response with this exact structure:
{
  "slides": [
    {
      "index": 0,
      "type": "title",
      "layout": "centered",
      "elements": [
        { "type": "text", "role": "title", "content": "Main title text", "style": "heading1" },
        { "type": "text", "role": "subtitle", "content": "Subtitle or tagline", "style": "subtitle" }
      ]
    },
    {
      "index": 1,
      "type": "content",
      "layout": "title_and_bullets",
      "elements": [
        { "type": "text", "role": "title", "content": "Slide title", "style": "heading2" },
        { "type": "text", "role": "bullet", "content": "• First bullet point", "style": "body" },
        { "type": "text", "role": "bullet", "content": "• Second bullet point", "style": "body" }
      ]
    }
  ],
  "speakerNotes": {
    "0": "Opening notes for the presenter...",
    "1": "Key talking points for this slide..."
  }
}

Layout options: "centered", "title_and_bullets", "two_column", "title_only", "image_left", "image_right", "comparison", "quote"
Element roles: "title", "subtitle", "bullet", "body", "quote", "statistic", "caption"
Element styles: "heading1", "heading2", "heading3", "subtitle", "body", "caption", "quote"

Make every slide specific, compelling, and personalized to this opportunity.`;
}
