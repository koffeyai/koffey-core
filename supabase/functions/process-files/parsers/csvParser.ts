/**
 * CSV Parser - Intelligently parses CSV files and extracts CRM entities
 */

interface ParseResult {
  entities: any[];
  rawData: any[];
  summary: string;
  searchableText: string;
  confidence: number;
}

export async function parseCSV(content: string, filename: string): Promise<ParseResult> {
  console.log(`Parsing CSV file: ${filename}`);

  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return {
      entities: [],
      rawData: [],
      summary: 'Empty CSV file',
      searchableText: '',
      confidence: 0
    };
  }

  // Parse CSV (simple parser - handles quoted fields)
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // Get headers
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  console.log('CSV Headers:', headers);

  // Parse data rows
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row: any = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx]?.trim() || '';
      });
      rows.push(row);
    }
  }

  console.log(`Parsed ${rows.length} rows from CSV`);

  // Detect entity type based on headers
  const entityType = detectEntityType(headers);
  console.log(`Detected entity type: ${entityType}`);

  // Extract entities based on detected type
  const entities = rows.map((row, index) => {
    switch (entityType) {
      case 'contact':
        return extractContact(row, headers, index);
      case 'account':
        return extractAccount(row, headers, index);
      case 'deal':
        return extractDeal(row, headers, index);
      default:
        // Try to detect from row content
        return detectAndExtractEntity(row, headers, index);
    }
  }).filter(e => e !== null);

  // Create searchable text
  const searchableText = rows.map(row => Object.values(row).join(' ')).join('\n');

  const summary = `CSV with ${rows.length} ${entityType}(s). Found ${headers.length} columns: ${headers.slice(0, 5).join(', ')}${headers.length > 5 ? '...' : ''}`;

  return {
    entities,
    rawData: rows,
    summary,
    searchableText,
    confidence: 0.9
  };
}

function detectEntityType(headers: string[]): string {
  const headerStr = headers.join(' ').toLowerCase();

  // Contact patterns
  if (
    headers.some(h => /^(first.?name|last.?name|email|contact|person|full.?name)$/i.test(h)) ||
    (headerStr.includes('email') && headerStr.includes('name'))
  ) {
    return 'contact';
  }

  // Account/Company patterns
  if (
    headers.some(h => /^(company|account|organization|business|firm)$/i.test(h)) ||
    headers.some(h => /^(industry|website|domain|revenue)$/i.test(h))
  ) {
    return 'account';
  }

  // Deal patterns
  if (
    headers.some(h => /^(deal|opportunity|amount|value|stage|close.?date)$/i.test(h))
  ) {
    return 'deal';
  }

  return 'unknown';
}

function extractContact(row: any, headers: string[], rowIndex: number): any | null {
  // Map common header variations
  const firstName = findValue(row, ['first name', 'firstname', 'first_name', 'fname', 'given name']);
  const lastName = findValue(row, ['last name', 'lastname', 'last_name', 'lname', 'surname', 'family name']);
  const fullName = findValue(row, ['name', 'full name', 'fullname', 'full_name', 'contact name']);
  const email = findValue(row, ['email', 'e-mail', 'email address', 'mail']);
  const phone = findValue(row, ['phone', 'telephone', 'phone number', 'mobile', 'cell']);
  const company = findValue(row, ['company', 'organization', 'employer', 'account']);
  const title = findValue(row, ['title', 'job title', 'position', 'role']);

  // Parse full name if provided
  let first = firstName;
  let last = lastName;
  if (fullName && !firstName && !lastName) {
    const parts = fullName.trim().split(/\s+/);
    first = parts[0];
    last = parts.slice(1).join(' ');
  }

  // Validate required fields
  if (!email && !first && !fullName) {
    return null; // Need at least a name or email
  }

  return {
    type: 'contact',
    sourceRow: rowIndex + 2, // +2 because 0-indexed + header row
    confidence: email && first && last ? 0.95 : 0.7,
    data: {
      firstName: first || '',
      lastName: last || '',
      full_name: fullName || `${first} ${last}`.trim(),
      email: email || '',
      phone: phone || '',
      company: company || '',
      title: title || ''
    }
  };
}

function extractAccount(row: any, headers: string[], rowIndex: number): any | null {
  const name = findValue(row, ['company', 'company name', 'account', 'account name', 'organization', 'business name', 'name']);
  const website = findValue(row, ['website', 'url', 'web', 'domain', 'site']);
  const industry = findValue(row, ['industry', 'sector', 'vertical', 'market']);
  const phone = findValue(row, ['phone', 'telephone', 'phone number', 'company phone']);
  const address = findValue(row, ['address', 'street', 'location', 'office']);
  const city = findValue(row, ['city', 'town']);
  const state = findValue(row, ['state', 'province', 'region']);
  const country = findValue(row, ['country', 'nation']);

  if (!name) {
    return null; // Company name is required
  }

  const fullAddress = [address, city, state, country].filter(Boolean).join(', ');

  return {
    type: 'account',
    sourceRow: rowIndex + 2,
    confidence: name && website ? 0.9 : 0.75,
    data: {
      name: name,
      website: website || '',
      industry: industry || '',
      phone: phone || '',
      address: fullAddress || address || ''
    }
  };
}

function extractDeal(row: any, headers: string[], rowIndex: number): any | null {
  const name = findValue(row, ['deal name', 'opportunity name', 'name', 'title', 'deal']);
  const amount = findValue(row, ['amount', 'value', 'deal value', 'opportunity value', 'revenue']);
  const stage = findValue(row, ['stage', 'status', 'pipeline stage', 'deal stage']);
  const closeDate = findValue(row, ['close date', 'expected close', 'closing date', 'target date']);
  const company = findValue(row, ['company', 'account', 'customer']);

  if (!name && !company) {
    return null; // Need at least a deal name or company
  }

  // Parse amount (remove currency symbols and commas)
  const parsedAmount = amount ? parseFloat(amount.replace(/[^0-9.]/g, '')) : null;

  return {
    type: 'deal',
    sourceRow: rowIndex + 2,
    confidence: name && parsedAmount ? 0.85 : 0.65,
    data: {
      name: name || `Deal with ${company}`,
      amount: parsedAmount,
      stage: normalizeStage(stage),
      expectedCloseDate: closeDate || '',
      account: company || ''
    }
  };
}

function detectAndExtractEntity(row: any, headers: string[], rowIndex: number): any | null {
  // Try each entity type and return the one with highest confidence
  const contact = extractContact(row, headers, rowIndex);
  const account = extractAccount(row, headers, rowIndex);
  const deal = extractDeal(row, headers, rowIndex);

  const candidates = [contact, account, deal].filter(e => e !== null);
  if (candidates.length === 0) return null;

  // Return highest confidence
  return candidates.reduce((best, current) =>
    (current?.confidence || 0) > (best?.confidence || 0) ? current : best
  );
}

function findValue(row: any, possibleKeys: string[]): string {
  for (const key of possibleKeys) {
    const value = row[key] || row[key.toLowerCase()] || row[key.replace(/\s+/g, '_')];
    if (value) return value.toString().trim();
  }
  return '';
}

function normalizeStage(stage: string): string {
  if (!stage) return 'qualification';

  const normalized = stage.toLowerCase().trim();
  const stageMap: { [key: string]: string } = {
    'new': 'qualification',
    'prospect': 'qualification',
    'qualified': 'qualification',
    'demo': 'proposal',
    'proposal': 'proposal',
    'negotiation': 'negotiation',
    'negotiate': 'negotiation',
    'closing': 'negotiation',
    'closed': 'won',
    'won': 'won',
    'lost': 'lost',
    'dead': 'lost'
  };

  return stageMap[normalized] || normalized;
}
