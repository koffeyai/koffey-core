/**
 * JSON Parser - Extracts CRM entities from JSON files
 */

interface ParseResult {
  entities: any[];
  rawData: any;
  summary: string;
  searchableText: string;
  confidence: number;
}

export async function parseJSON(content: string, filename: string): Promise<ParseResult> {
  console.log(`Parsing JSON file: ${filename}`);

  try {
    const data = JSON.parse(content);
    const entities: any[] = [];

    // Handle different JSON structures
    let items: any[] = [];

    if (Array.isArray(data)) {
      items = data;
    } else if (data.contacts) {
      items = Array.isArray(data.contacts) ? data.contacts : [data.contacts];
    } else if (data.accounts) {
      items = Array.isArray(data.accounts) ? data.accounts : [data.accounts];
    } else if (data.deals || data.opportunities) {
      items = Array.isArray(data.deals || data.opportunities) ? (data.deals || data.opportunities) : [data.deals || data.opportunities];
    } else if (data.data) {
      items = Array.isArray(data.data) ? data.data : [data.data];
    } else {
      // Treat as single object
      items = [data];
    }

    console.log(`Processing ${items.length} items from JSON`);

    // Process each item
    items.forEach((item, index) => {
      const entity = detectEntityFromJSON(item, index);
      if (entity) {
        entities.push(entity);
      }
    });

    // Create searchable text
    const searchableText = JSON.stringify(data, null, 2);

    const summary = `JSON file with ${entities.length} entities (${items.length} records processed)`;

    return {
      entities,
      rawData: data,
      summary,
      searchableText,
      confidence: 0.9
    };

  } catch (error) {
    console.error('JSON parse error:', error);
    return {
      entities: [],
      rawData: null,
      summary: 'Invalid JSON format',
      searchableText: content,
      confidence: 0
    };
  }
}

function detectEntityFromJSON(item: any, index: number): any | null {
  if (!item || typeof item !== 'object') return null;

  // Detect entity type based on fields
  const hasContactFields = item.email || item.firstName || item.first_name || item.lastname || item.last_name;
  const hasAccountFields = item.company || item.companyName || item.company_name || item.organization || item.website || item.domain;
  const hasDealFields = item.amount || item.dealAmount || item.deal_amount || item.value || item.stage || item.opportunity;

  if (hasContactFields && !hasDealFields) {
    return extractContactFromJSON(item, index);
  } else if (hasAccountFields && !hasContactFields && !hasDealFields) {
    return extractAccountFromJSON(item, index);
  } else if (hasDealFields) {
    return extractDealFromJSON(item, index);
  }

  // Default to contact if has name or email
  if (item.name || item.email) {
    return extractContactFromJSON(item, index);
  }

  return null;
}

function extractContactFromJSON(item: any, index: number): any {
  // Try various field name variations
  const firstName = item.firstName || item.first_name || item.fname || item.givenName || item.given_name || '';
  const lastName = item.lastName || item.last_name || item.lname || item.surname || item.familyName || item.family_name || '';
  const fullName = item.name || item.full_name || item.fullName || item.displayName || item.display_name || '';
  const email = item.email || item.emailAddress || item.email_address || item.mail || '';
  const phone = item.phone || item.phoneNumber || item.phone_number || item.mobile || item.telephone || '';
  const company = item.company || item.companyName || item.company_name || item.organization || item.employer || '';
  const title = item.title || item.jobTitle || item.job_title || item.position || item.role || '';

  // Parse full name if needed
  let first = firstName;
  let last = lastName;
  if (fullName && !firstName && !lastName) {
    const parts = fullName.trim().split(/\s+/);
    first = parts[0];
    last = parts.slice(1).join(' ');
  }

  return {
    type: 'contact',
    sourceRow: index + 1,
    confidence: email && first && last ? 0.95 : 0.75,
    data: {
      firstName: first,
      lastName: last,
      full_name: fullName || `${first} ${last}`.trim(),
      email: email,
      phone: phone,
      company: company,
      title: title
    }
  };
}

function extractAccountFromJSON(item: any, index: number): any {
  const name = item.name || item.company || item.companyName || item.company_name || item.organization || item.account || item.accountName || '';
  const website = item.website || item.url || item.domain || item.web || '';
  const industry = item.industry || item.sector || item.vertical || '';
  const phone = item.phone || item.phoneNumber || item.phone_number || item.telephone || '';
  const address = item.address || item.street || item.location || '';
  const city = item.city || '';
  const state = item.state || item.province || item.region || '';
  const country = item.country || '';

  const fullAddress = [address, city, state, country].filter(Boolean).join(', ') || address;

  return {
    type: 'account',
    sourceRow: index + 1,
    confidence: name && website ? 0.9 : 0.75,
    data: {
      name: name,
      website: website,
      industry: industry,
      phone: phone,
      address: fullAddress
    }
  };
}

function extractDealFromJSON(item: any, index: number): any {
  const name = item.name || item.dealName || item.deal_name || item.title || item.opportunity || '';
  const amount = item.amount || item.value || item.dealValue || item.deal_value || item.revenue || null;
  const stage = item.stage || item.status || item.dealStage || item.deal_stage || 'qualification';
  const closeDate = item.closeDate || item.close_date || item.expectedClose || item.expected_close || item.targetDate || '';
  const company = item.company || item.account || item.customer || item.accountName || '';

  return {
    type: 'deal',
    sourceRow: index + 1,
    confidence: name && amount ? 0.85 : 0.65,
    data: {
      name: name || `Deal with ${company}` || `Deal #${index + 1}`,
      amount: amount ? parseFloat(amount.toString()) : null,
      stage: stage,
      expectedCloseDate: closeDate,
      account: company
    }
  };
}
