import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import {
  validateInput, sanitizeInput, checkRateLimit, validateOrganizationAccess,
  createSecureErrorResponse, detectSQLInjection
} from '../_shared/security.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { authenticateRequest, AuthError, getServiceRoleClient, isInternalServiceCall } from '../_shared/auth.ts';
import { checkPersistentRateLimit, getTraceId } from '../_shared/request-controls.ts';
import { handleListRecent } from './handlers/listRecent.ts';

let corsHeaders = getCorsHeaders();

interface CRMOperationRequest {
  operation: 'create' | 'read' | 'update' | 'delete' | 'search' | 'analyze' | 'list_recent';
  entity: 'contact' | 'account' | 'deal' | 'activity' | 'task';
  data?: any;
  filters?: any;
  organizationId: string;
  limit?: number;
}

/**
 * CRM Operations Handler
 * SECURITY: Requires authentication. User ID is extracted from JWT, never trusted from request body.
 */
const handler = async (req: Request): Promise<Response> => {
  corsHeaders = getCorsHeaders(req);
  const traceId = getTraceId(req, 'crm');

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ====== SECURITY: Authenticate the request ======
    // Check for internal call from chat-coordinator (uses service role key)
    const isInternalCall = isInternalServiceCall(req);
    let userId: string;
    let requestBody: any;
    
    if (isInternalCall) {
      // For internal calls, trust userId from request body
      requestBody = await req.json();
      userId = requestBody.userId;
      if (!userId) {
        throw new Error('userId required for internal calls');
      }
      console.log('🔓 Internal call authenticated, userId:', userId);
    } else {
      // External calls require JWT authentication
      try {
        const auth = await authenticateRequest(req);
        userId = auth.userId;
      } catch (authError) {
        if (authError instanceof AuthError) {
          return new Response(
            JSON.stringify({ error: 'Authentication required', message: authError.message }),
            { status: authError.statusCode, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        throw authError;
      }
      requestBody = await req.json();
    }

    // Fast local rate limiting plus durable DB-backed rate limiting below.
    const rateLimitResult = checkRateLimit(`crm:${userId}`, {
      requests: 30,
      windowMs: 60000,
      blockDurationMs: 600000 // 10min block for CRM abuse
    });

    if (!rateLimitResult.allowed) {
      return createSecureErrorResponse(
        new Error('Rate limit exceeded'),
        `Too many CRM operations. Please wait before trying again. Trace: ${traceId}`,
        429
      );
    }

    // Comprehensive input validation (requestBody already parsed above)
    const validation = validateInput(requestBody, {
      type: 'object',
      required: ['operation', 'entity', 'organizationId']
      // Note: userId is no longer required from request body - extracted from JWT
    });

    if (!validation.isValid) {
      return createSecureErrorResponse(
        new Error('Invalid input'),
        `Invalid request: ${validation.errors.join(', ')}`,
        400
      );
    }

    const { operation, entity, data, filters, organizationId, limit }: CRMOperationRequest = validation.sanitizedData;

    // Validate operation and entity values
    const validOperations = ['create', 'read', 'update', 'delete', 'search', 'analyze', 'list_recent'];
    const validEntities = ['contact', 'account', 'deal', 'activity', 'task'];

    if (!validOperations.includes(operation)) {
      return createSecureErrorResponse(
        new Error('Invalid operation'),
        'Invalid operation specified',
        400
      );
    }

    if (!validEntities.includes(entity)) {
      return createSecureErrorResponse(
        new Error('Invalid entity'),
        'Invalid entity specified',
        400
      );
    }

    // Security checks on data
    if (data && typeof data === 'object') {
      const dataString = JSON.stringify(data);
      if (detectSQLInjection(dataString)) {
        return createSecureErrorResponse(
          new Error('Suspicious input detected'),
          'Request blocked for security reasons',
          400
        );
      }
    }

    // Use service role client for database operations
    const supabase = getServiceRoleClient();

    // Validate organization access using the authenticated userId
    const hasAccess = await validateOrganizationAccess(supabase, userId, organizationId);
    if (!hasAccess) {
      return createSecureErrorResponse(
        new Error('Access denied'),
        'Access to organization denied',
        403
      );
    }

    const durableRate = await checkPersistentRateLimit(supabase, `crm:${organizationId}:${userId}`, {
      requests: 30,
      windowMs: 60000,
      blockDurationMs: 600000,
    });
    if (!durableRate.allowed) {
      return createSecureErrorResponse(
        new Error('Rate limit exceeded'),
        `Too many CRM operations. Please wait before trying again. Trace: ${traceId}`,
        429
      );
    }

    let result: any = {};

    switch (operation) {
      case 'create':
        result = await handleCreate(supabase, entity, data, organizationId, userId);
        break;
      case 'read':
        result = await handleRead(supabase, entity, filters, organizationId);
        break;
      case 'search':
        result = await handleSearch(supabase, entity, filters, organizationId);
        break;
      case 'analyze':
        result = await handleAnalyze(supabase, entity, filters, organizationId);
        break;
      case 'list_recent':
        result = await handleListRecent(supabase, entity, limit || 20, organizationId);
        break;
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    return createSecureErrorResponse(
      error,
      'CRM operation failed. Please try again.',
      500
    );
  }
};

// ===== HANDLER FUNCTIONS (unchanged logic, just use authenticated userId) =====

function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1;
  const editDistance = Array(shorter.length + 1).fill(null).map(() => Array(longer.length + 1).fill(null));
  for (let i = 0; i <= shorter.length; i++) editDistance[i][0] = i;
  for (let j = 0; j <= longer.length; j++) editDistance[0][j] = j;
  for (let i = 1; i <= shorter.length; i++) {
    for (let j = 1; j <= longer.length; j++) {
      const cost = shorter[i - 1] === longer[j - 1] ? 0 : 1;
      editDistance[i][j] = Math.min(editDistance[i - 1][j] + 1, editDistance[i][j - 1] + 1, editDistance[i - 1][j - 1] + cost);
    }
  }
  return (longer.length - editDistance[shorter.length][longer.length]) / longer.length;
}

async function findSimilarAccounts(supabase: any, organizationId: string, companyName: string, threshold = 0.8) {
  const { data: accounts } = await supabase.from('accounts').select('id, name').eq('organization_id', organizationId);
  if (!accounts) return [];
  return accounts.filter((account: any) => calculateSimilarity(account.name, companyName) >= threshold);
}

async function handleCreate(supabase: any, entity: string, data: any, organizationId: string, userId: string) {
  const baseData = { organization_id: organizationId, user_id: userId, created_by: userId, ...data };

  switch (entity) {
    case 'contact':
      if (data.email) {
        const { data: existingByEmail } = await supabase.from('contacts').select('id, first_name, last_name, full_name, email, accounts(name)').eq('organization_id', organizationId).ilike('email', data.email.toLowerCase()).single();
        if (existingByEmail) {
          return { id: existingByEmail.id, name: existingByEmail.full_name, email: existingByEmail.email, company: existingByEmail.accounts?.name, message: `Found existing contact: ${existingByEmail.full_name}`, isExisting: true, entity: 'contact' };
        }
      }
      let accountId = null;
      if (data.company) {
        const { data: exactAccount } = await supabase.from('accounts').select('id, name').eq('organization_id', organizationId).ilike('name', data.company).single();
        if (exactAccount) { accountId = exactAccount.id; }
        else {
          const similarAccounts = await findSimilarAccounts(supabase, organizationId, data.company);
          if (similarAccounts.length > 0) { accountId = similarAccounts[0].id; }
          else {
            const { data: newAccount } = await supabase.from('accounts').insert({ organization_id: organizationId, user_id: userId, name: data.company, assigned_to: userId }).select('id').single();
            if (newAccount) accountId = newAccount.id;
          }
        }
      }
      const contactData = { ...baseData, account_id: accountId, assigned_to: userId, first_name: data.first_name, last_name: data.last_name, full_name: data.full_name || (data.first_name && data.last_name ? `${data.first_name} ${data.last_name}` : data.name), title: data.title || data.position };
      const { data: contact, error: contactError } = await supabase.from('contacts').insert(contactData).select('id, first_name, last_name, full_name, email').single();
      if (contactError) throw contactError;
      return { ...contact, entity: 'contact' };

    case 'account':
      if (data.name) {
        const { data: exactMatch } = await supabase.from('accounts').select('id, name, industry, website').eq('organization_id', organizationId).ilike('name', data.name).single();
        if (exactMatch) { return { id: exactMatch.id, name: exactMatch.name, message: `Found existing account: ${exactMatch.name}`, isExisting: true, entity: 'account' }; }
      }
      const { data: account, error: accountError } = await supabase.from('accounts').insert({ ...baseData, assigned_to: userId, name: data.name, industry: data.industry, website: data.website, phone: data.phone, description: data.description, address: data.address }).select('id, name, industry, website').single();
      if (accountError) throw accountError;
      return { ...account, entity: 'account', message: `Account "${data.name}" created successfully!` };

    case 'deal':
      // ENFORCE: Every deal MUST be linked to an account
      if (!data.account_id) {
        throw new Error('account_id is required - every deal must be associated with an account for proper tracking and analytics');
      }
      
      // Verify the account exists in the same organization
      const { data: accountExists, error: accountCheckError } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('id', data.account_id)
        .eq('organization_id', organizationId)
        .single();
        
      if (accountCheckError || !accountExists) {
        throw new Error(`Invalid account_id - account not found in organization. Please select a valid account.`);
      }
      
      const dealData = { ...baseData, assigned_to: userId, stage: data.stage || 'prospecting', name: data.name || data.title, amount: data.amount, probability: data.probability, currency: data.currency || 'USD', account_id: data.account_id };
      const { data: deal, error: dealError } = await supabase.from('deals').insert(dealData).select('id, name, amount, stage, currency, account_id').single();
      if (dealError) throw dealError;
      return { ...deal, account_name: accountExists.name, entity: 'deal' };

    case 'activity':
      const activityData = { ...baseData, assigned_to: userId, type: data.type || 'note', subject: data.subject || data.title, description: data.description };
      const { data: activity, error: activityError } = await supabase.from('activities').insert(activityData).select('id, subject, type').single();
      if (activityError) throw activityError;
      return { ...activity, entity: 'activity' };

    case 'task':
      const taskData = { ...baseData, assigned_to: userId, status: data.status || 'open', title: data.title, description: data.description, priority: data.priority || 'medium' };
      const { data: task, error: taskError } = await supabase.from('tasks').insert(taskData).select('id, title, status, priority').single();
      if (taskError) throw taskError;
      return { ...task, entity: 'task' };

    default:
      throw new Error(`Unsupported entity: ${entity}`);
  }
}

async function handleRead(supabase: any, entity: string, filters: any, organizationId: string) {
  const tableName = entity === 'contact' ? 'contacts' : entity === 'account' ? 'accounts' : entity === 'deal' ? 'deals' : entity === 'activity' ? 'activities' : 'tasks';
  let query = supabase.from(tableName).select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(50);
  if (filters?.search) { query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`); }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function handleSearch(supabase: any, entity: string, filters: any, organizationId: string) {
  const tableName = entity === 'contact' ? 'contacts' : entity === 'account' ? 'accounts' : entity === 'deal' ? 'deals' : entity === 'activity' ? 'activities' : 'tasks';
  const searchTerm = filters?.query || filters?.search || '';
  let query = supabase.from(tableName).select('*').eq('organization_id', organizationId);
  if (searchTerm) { query = query.or(`name.ilike.%${searchTerm}%`); }
  const { data, error } = await query.limit(20);
  if (error) throw error;
  return { results: data, count: data?.length || 0 };
}

async function handleAnalyze(supabase: any, entity: string, filters: any, organizationId: string) {
  if (entity === 'deal') {
    const { data: stats } = await supabase.rpc('get_pipeline_stats', { p_organization_id: organizationId });
    return stats || { message: 'No pipeline data available' };
  }
  return { message: `Analysis for ${entity} not implemented` };
}

serve(handler);
