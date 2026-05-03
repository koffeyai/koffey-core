/**
 * TXT Parser - Extracts structured data from plain text using NLP patterns
 */

interface ParseResult {
  entities: any[];
  rawData: any;
  summary: string;
  searchableText: string;
  confidence: number;
}

export async function parseTXT(content: string, filename: string): Promise<ParseResult> {
  console.log(`Parsing TXT file: ${filename}`);

  const lines = content.split('\n').filter(line => line.trim());
  const entities: any[] = [];

  // Pattern matching for common formats
  const contactPatterns = {
    email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    phone: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    name: /^([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gm, // Proper names
    company: /(?:at|@|with|from)\s+([A-Z][a-zA-Z\s&.,'-]{2,}(?:Inc|LLC|Corp|Company|Co)\.?)/gi
  };

  // Extract emails and attempt to match with names
  const emails = [...content.matchAll(contactPatterns.email)].map(m => m[1]);
  const phones = [...content.matchAll(contactPatterns.phone)].map(m => m[0]);
  const names = [...content.matchAll(contactPatterns.name)].map(m => m[1]);
  const companies = [...content.matchAll(contactPatterns.company)].map(m => m[1].trim());

  console.log(`Found ${emails.length} emails, ${phones.length} phones, ${names.length} names, ${companies.length} companies`);

  // Smart entity extraction based on context
  const seenEmails = new Set<string>();
  const seenCompanies = new Set<string>();

  // Extract contacts
  for (let i = 0; i < Math.max(emails.length, names.length); i++) {
    const email = emails[i];
    const name = names[i];
    const phone = phones[i];

    if (email && !seenEmails.has(email)) {
      seenEmails.add(email);

      const nameParts = name ? name.split(/\s+/) : [];
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Try to find associated company in nearby text
      const emailLineIndex = lines.findIndex(l => l.includes(email));
      let company = '';
      if (emailLineIndex >= 0) {
        // Check surrounding lines for company mentions
        const contextLines = lines.slice(Math.max(0, emailLineIndex - 2), emailLineIndex + 3).join(' ');
        const companyMatch = contextLines.match(contactPatterns.company);
        if (companyMatch) {
          company = companyMatch[1].trim();
        }
      }

      entities.push({
        type: 'contact',
        confidence: name ? 0.85 : 0.65,
        data: {
          firstName,
          lastName,
          full_name: name || email.split('@')[0],
          email,
          phone: phone || '',
          company: company || ''
        }
      });
    }
  }

  // Extract companies
  for (const company of companies) {
    const cleanCompany = company.trim();
    if (cleanCompany && !seenCompanies.has(cleanCompany.toLowerCase())) {
      seenCompanies.add(cleanCompany.toLowerCase());

      // Try to extract website/domain
      const companyLineIndex = lines.findIndex(l => l.includes(cleanCompany));
      let website = '';
      if (companyLineIndex >= 0) {
        const contextLines = lines.slice(Math.max(0, companyLineIndex - 1), companyLineIndex + 2).join(' ');
        const urlMatch = contextLines.match(/https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
        if (urlMatch) {
          website = urlMatch[0];
        }
      }

      entities.push({
        type: 'account',
        confidence: 0.75,
        data: {
          name: cleanCompany,
          website: website || '',
          industry: '',
          phone: '',
          address: ''
        }
      });
    }
  }

  // Look for deal/opportunity mentions
  const dealPatterns = {
    amount: /\$\s*([\d,]+(?:\.\d{2})?)|(\d+)\s*(?:dollars?|USD)/gi,
    dealMention: /\b(deal|opportunity|proposal|quote)\b/gi
  };

  const amounts = [...content.matchAll(dealPatterns.amount)];
  const dealMentions = [...content.matchAll(dealPatterns.dealMention)];

  if (amounts.length > 0 && dealMentions.length > 0) {
    // Extract potential deals
    amounts.forEach((match, index) => {
      const amountStr = match[1] || match[2];
      const amount = parseFloat(amountStr.replace(/,/g, ''));

      // Find associated company if any
      const company = companies[0] || '';

      entities.push({
        type: 'deal',
        confidence: 0.6,
        data: {
          name: company ? `Deal with ${company}` : `Deal #${index + 1}`,
          amount,
          stage: 'qualification',
          expectedCloseDate: '',
          account: company
        }
      });
    });
  }

  const summary = `Plain text document with ${entities.length} entities extracted (${emails.length} contacts, ${companies.length} companies)`;

  return {
    entities,
    rawData: { lines: lines.length, content: content.substring(0, 500) },
    summary,
    searchableText: content,
    confidence: entities.length > 0 ? 0.7 : 0.3
  };
}
