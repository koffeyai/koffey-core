/**
 * Skill: schedule_meeting
 *
 * High-level orchestrator that resolves a contact, checks calendar
 * availability, drafts an email, and presents a single confirmation
 * preview. On approval the email is sent and the event is synced.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const scheduleMeeting: SkillDefinition = {
  name: 'schedule_meeting',
  displayName: 'Schedule Meeting',
  domain: 'scheduling',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'schedule_meeting',
      description: `Schedule a lunch, coffee, meeting, or call with a contact — all in one step.
Use this when the user says things like:
- "send an email to Daniel Ricci to grab lunch next Thursday"
- "set up a coffee with Sarah next week"
- "schedule a meeting with John from Acme"
- "let's do lunch with the contact at Gucci"

The tool will:
1. Resolve the contact by name (scoped to account/deal context when available)
2. If the contact doesn't exist, ask for first name, last name, title, and email before creating them
3. Check the user's Google Calendar for availability on/around the requested date
4. Auto-pick the best available slot
5. Draft a professional scheduling email
6. Present a single confirmation preview (recipient, time, email draft)
7. Wait for user approval before sending

IMPORTANT:
- Always extract contact_name when a person's name is mentioned.
- If the conversation was about a specific account/deal, include account_name or deal_id so the contact lookup is scoped.
- If the user says a specific date ("next Thursday", "March 5"), extract it as proposed_date.
- If the user mentions a topic ("discuss the infrastructure project"), extract it as message_note.`,
      parameters: {
        type: 'object',
        properties: {
          contact_name: {
            type: 'string',
            description: 'Full or partial name of the person to schedule with (required)',
          },
          contact_email: {
            type: 'string',
            description: 'Email address for the contact when it is missing from CRM and the user provides it as a follow-up.',
          },
          contact_first_name: {
            type: 'string',
            description: 'First name for a new contact when the contact is not already in CRM.',
          },
          contact_last_name: {
            type: 'string',
            description: 'Last name for a new contact when the contact is not already in CRM.',
          },
          contact_title: {
            type: 'string',
            description: 'Job title for a new contact when the contact is not already in CRM.',
          },
          account_name: {
            type: 'string',
            description: 'Company/account name for scoping the contact lookup (e.g. "Gucci", "Acme")',
          },
          deal_name: {
            type: 'string',
            description: 'Deal/opportunity name when the request is about a deal and the contact should be resolved from that deal.',
          },
          meeting_type: {
            type: 'string',
            enum: ['lunch', 'coffee', 'meeting', 'call'],
            description: 'Type of meeting — determines time window: lunch (11:30am-1:30pm), coffee (9-11am), meeting/call (9am-5pm)',
          },
          proposed_date: {
            type: 'string',
            description: 'Preferred date in natural language: "next Thursday", "tomorrow", "March 5", "next week". If not specified, the system searches the next 5 business days.',
          },
          time_preference: {
            type: 'string',
            enum: ['morning', 'afternoon', 'any'],
            description: 'Preferred time of day (default: any)',
          },
          message_note: {
            type: 'string',
            description: 'Optional context or topic to include in the email body (e.g. "discuss the infrastructure project")',
          },
          deal_id: {
            type: 'string',
            description: 'Deal UUID if already known from context',
          },
          contact_id: {
            type: 'string',
            description: 'Contact UUID if already known from context',
          },
          confirmed: {
            type: 'boolean',
            description: 'Set to true after user confirms the preview. Never set on first call.',
          },
          selected_start_iso: {
            type: 'string',
            description: 'ISO timestamp for the selected meeting slot when the user chooses one from the preview.',
          },
        },
        required: ['meeting_type'],
      },
    },
  },

  instructions: `**For "send an email to [person] to grab [lunch/coffee]", "set up [meeting] with [person]", "schedule [lunch] with [person]"** → Use schedule_meeting
  - This is the preferred tool when the user wants to schedule AND send an email in one flow.
  - ALWAYS extract the person's name as contact_name, and the meeting type from context (lunch, coffee, meeting, call).
  - If the user mentions a company (e.g. "Daniel from Gucci"), extract account_name too.
  - If the user mentions a date/time preference, extract proposed_date and/or time_preference.
  - If the user mentions a topic ("to discuss the proposal"), extract it as message_note.
  - The tool handles everything: contact lookup, calendar check, email draft, and confirmation — you just need to call it once.
  - If the contact isn't in the system, the tool will ask for first name, last name, title, and email before creating the contact and continuing.
  - NEVER call check_availability + send_scheduling_email separately when schedule_meeting can handle it.
  - On first call, returns a preview. After user confirms, call again with confirmed=true plus the same parameters.`,

  execute: async (ctx: ToolExecutionContext) => {
    const { supabase, userId, organizationId, args } = ctx;
    const {
      contact_name,
      contact_email,
      contact_first_name,
      contact_last_name,
      contact_title,
      account_name,
      deal_name,
      meeting_type,
      proposed_date,
      time_preference,
      message_note,
      deal_id,
      contact_id,
      confirmed: rawConfirmed,
      selected_start_iso,
    } = args as {
      contact_name?: string;
      contact_email?: string;
      contact_first_name?: string;
      contact_last_name?: string;
      contact_title?: string;
      account_name?: string;
      deal_name?: string;
      meeting_type: string;
      proposed_date?: string;
      time_preference?: string;
      message_note?: string;
      deal_id?: string;
      contact_id?: string;
      confirmed?: boolean;
      selected_start_iso?: string;
    };
    const confirmed = rawConfirmed === true && ctx.confirmedByPendingWorkflow === true;

    // ---------------------------------------------------------------
    // Step 1: Resolve contact
    // ---------------------------------------------------------------
    let contact: { id: string; full_name: string; email: string | null; company: string | null; account_id: string | null } | null = null;
    let resolvedDeal: { id: string; name: string; account_id: string | null; contact_id?: string | null } | null = null;
    const normalizedContactEmail = String(contact_email || '').trim().toLowerCase();
    const validContactEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedContactEmail)
      ? normalizedContactEmail
      : null;
    const cleanedContactFirstName = String(contact_first_name || '').trim();
    const cleanedContactLastName = String(contact_last_name || '').trim();
    const cleanedContactTitle = String(contact_title || '').trim();

    const cleanScheduleContactName = (value?: string) => String(value || '')
      .replace(/\s+\bfor\s+(?:the\s+)?(?:[A-Za-z0-9][A-Za-z0-9&.,' -]{1,80}\s+)?(?:deal|opportunit(?:y|ies))\b.*$/i, '')
      .replace(/\s+\b(?:this|next)\s+(?:week|month)\b.*$/i, '')
      .replace(/\s+\b(?:in|during)\s+(?:the\s+)?(?:morning|afternoon|evening)\b.*$/i, '')
      .trim();

    const cleanDealName = (value?: string) => String(value || '')
      .replace(/\*\*/g, '')
      .replace(/[\u2013\u2014\u2015]/g, '-')
      .replace(/^[("'`\s]+|[)"'`.,!?;\s]+$/g, '')
      .trim();

    const stripDealSuffix = (value: string) => value
      .replace(/\s+-\s+\$[\d,.]+(?:\.\d+)?\s*[kmb]?(?:\s+(?:mrr|arr|acv|usd))?.*$/i, '')
      .replace(/\s+(?:deal|opportunity)$/i, '')
      .trim();
    const resolvedContactName = cleanScheduleContactName(contact_name);

    const inferNameParts = () => {
      const explicitFirst = cleanedContactFirstName;
      const explicitLast = cleanedContactLastName;
      if (explicitFirst && explicitLast) {
        return { firstName: explicitFirst, lastName: explicitLast };
      }

      const nameParts = String(resolvedContactName || '').trim().split(/\s+/).filter(Boolean);
      if (nameParts.length >= 2 && !String(resolvedContactName).includes('@')) {
        return {
          firstName: explicitFirst || nameParts[0],
          lastName: explicitLast || nameParts.slice(1).join(' '),
        };
      }

      return { firstName: explicitFirst, lastName: explicitLast };
    };

    const buildMissingNewContactDetails = () => {
      const { firstName, lastName } = inferNameParts();
      const missing = [
        !firstName ? 'first_name' : null,
        !lastName ? 'last_name' : null,
        !cleanedContactTitle ? 'title' : null,
        !validContactEmail ? 'email' : null,
      ].filter(Boolean);
      const context = account_name || resolvedDeal?.name || deal_name || null;
      const existing = [
        validContactEmail ? `email: ${validContactEmail}` : null,
        firstName ? `first name: ${firstName}` : null,
        lastName ? `last name: ${lastName}` : null,
        cleanedContactTitle ? `title: ${cleanedContactTitle}` : null,
      ].filter(Boolean).join(', ');
      return {
        missing,
        message: `I couldn't find this contact${context ? ` for ${context}` : ''}. If they should be added, send first name, last name, title, and email${existing ? `; I already have ${existing}` : ''}. Company/account and notes are optional but helpful.`,
      };
    };

    async function resolveDeal() {
      if (resolvedDeal) return resolvedDeal;

      if (deal_id) {
        const { data } = await supabase
          .from('deals')
          .select('id, name, account_id, contact_id')
          .eq('organization_id', organizationId)
          .eq('id', deal_id)
          .maybeSingle();
        resolvedDeal = data;
        return resolvedDeal;
      }

      const targetName = cleanDealName(deal_name || account_name || '');
      if (!targetName) return null;
      const baseName = stripDealSuffix(targetName);
      const candidates = [...new Set([targetName, baseName].filter(Boolean))];
      const orClause = candidates.map((name) => `name.ilike.%${name.replace(/,/g, '')}%`).join(',');

      const { data: deals } = await supabase
        .from('deals')
        .select('id, name, account_id, contact_id')
        .eq('organization_id', organizationId)
        .or(orClause)
        .limit(5);

      if (deals?.length === 1) {
        resolvedDeal = deals[0];
        return resolvedDeal;
      }

      if ((!deals || deals.length === 0) && baseName) {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id')
          .eq('organization_id', organizationId)
          .ilike('name', `%${baseName}%`)
          .limit(3);
        const accountIds = (accounts || []).map((account: any) => account.id).filter(Boolean);
        if (accountIds.length > 0) {
          const { data: accountDeals } = await supabase
            .from('deals')
            .select('id, name, account_id, contact_id')
            .eq('organization_id', organizationId)
            .in('account_id', accountIds)
            .limit(5);
          if (accountDeals?.length === 1) {
            resolvedDeal = accountDeals[0];
            return resolvedDeal;
          }
        }
      }

      return null;
    }

    resolvedDeal = await resolveDeal();

    if (contact_id) {
      // Direct lookup by ID
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, email, company, account_id')
        .eq('organization_id', organizationId)
        .eq('id', contact_id)
        .maybeSingle();
      contact = data;
    } else if (validContactEmail) {
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, email, company, account_id')
        .eq('organization_id', organizationId)
        .ilike('email', validContactEmail)
        .maybeSingle();
      contact = data;
    } else if (resolvedDeal?.contact_id) {
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, email, company, account_id')
        .eq('organization_id', organizationId)
        .eq('id', resolvedDeal.contact_id)
        .maybeSingle();
      contact = data;
    } else if (!resolvedContactName && resolvedDeal?.id) {
      const { data: linkedContacts } = await supabase
        .from('deal_contacts')
        .select('role_in_deal, contacts(id, full_name, email, company, account_id)')
        .eq('organization_id', organizationId)
        .eq('deal_id', resolvedDeal.id)
        .limit(5);
      const contacts = (linkedContacts || [])
        .map((row: any) => row.contacts)
        .filter(Boolean);
      if (contacts.length === 1) {
        contact = contacts[0];
      } else if (contacts.length > 1) {
        return {
          success: false,
          _needsInput: true,
          message: `I found ${contacts.length} contacts on ${resolvedDeal.name}. Which one should receive the scheduling email?`,
          matches: contacts.map((c: any) => ({
            id: c.id,
            name: c.full_name,
            email: c.email,
            company: c.company,
          })),
        };
      }
    } else if (!resolvedContactName && resolvedDeal?.account_id) {
      const { data: accountContacts } = await supabase
        .from('contacts')
        .select('id, full_name, email, company, account_id')
        .eq('organization_id', organizationId)
        .eq('account_id', resolvedDeal.account_id)
        .limit(5);
      if (accountContacts?.length === 1) {
        contact = accountContacts[0];
      } else if ((accountContacts?.length || 0) > 1) {
        return {
          success: false,
          _needsInput: true,
          message: `I found multiple contacts for ${resolvedDeal.name}. Which one should receive the scheduling email?`,
          matches: accountContacts.map((c: any) => ({
            id: c.id,
            name: c.full_name,
            email: c.email,
            company: c.company,
          })),
        };
      }
    } else if (!resolvedContactName) {
      return {
        success: false,
        _needsInput: true,
        message: `Which contact should receive the scheduling email${resolvedDeal ? ` for ${resolvedDeal.name}` : ''}?`,
        missing: ['contact_name'],
      };
    } else {
      // Fuzzy name search, optionally scoped to account
      let query = supabase
        .from('contacts')
        .select('id, full_name, email, company, account_id')
        .eq('organization_id', organizationId)
        .ilike('full_name', `%${resolvedContactName}%`);

      // Scope to account if account_name provided
      if (account_name) {
        const { data: acct } = await supabase
          .from('accounts')
          .select('id')
          .eq('organization_id', organizationId)
          .ilike('name', `%${account_name}%`)
          .limit(1)
          .maybeSingle();

        if (acct) {
          query = query.eq('account_id', acct.id);
        }
      }

      // Scope to deal's account if deal_id provided
      if (resolvedDeal?.account_id && !account_name) {
        query = query.eq('account_id', resolvedDeal.account_id);
      }

      const { data: contacts } = await query.limit(5);

      if (contacts && contacts.length === 1) {
        contact = contacts[0];
      } else if (contacts && contacts.length > 1) {
        // Multiple matches — return for disambiguation
        return {
          success: false,
          _needsInput: true,
          message: `Multiple contacts match "${resolvedContactName}". Which one did you mean?`,
          matches: contacts.map((c: any) => ({
            id: c.id,
            name: c.full_name,
            email: c.email,
            company: c.company,
          })),
        };
      }
    }

    if (!contact && (resolvedContactName || cleanedContactFirstName || cleanedContactLastName || validContactEmail)) {
      const { firstName, lastName } = inferNameParts();
      if (!firstName || !lastName || !cleanedContactTitle || !validContactEmail) {
        const missingDetails = buildMissingNewContactDetails();
        return {
          success: false,
          _needsInput: true,
          clarification_type: 'missing_contact_details',
          message: missingDetails.message,
          contact_name: resolvedContactName || [firstName, lastName].filter(Boolean).join(' ') || null,
          contact_email: validContactEmail,
          deal_name: resolvedDeal?.name || deal_name || null,
          missing: missingDetails.missing,
        };
      }

      const fullName = [firstName, lastName].filter(Boolean).join(' ');
      const { data: createdContact, error: createContactError } = await supabase
        .from('contacts')
        .insert({
          organization_id: organizationId,
          user_id: userId,
          assigned_to: userId,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          email: validContactEmail,
          title: cleanedContactTitle,
          company: account_name || null,
          account_id: resolvedDeal?.account_id || null,
          status: 'lead',
          updated_at: new Date().toISOString(),
        })
        .select('id, full_name, email, company, account_id')
        .maybeSingle();

      if (createContactError) {
        return {
          success: false,
          _needsInput: true,
          message: `I couldn't create ${fullName} with ${validContactEmail}: ${createContactError.message}`,
          missing: ['contact'],
        };
      }
      contact = createdContact;
    }

    if (!contact) {
      const missingDetails = buildMissingNewContactDetails();
      return {
        success: false,
        _needsInput: true,
        clarification_type: 'missing_contact_details',
        message: missingDetails.message,
        contact_name: resolvedContactName,
        deal_name: resolvedDeal?.name || deal_name || null,
        missing: missingDetails.missing,
      };
    }

    if (!contact.email) {
      if (validContactEmail) {
        const { error: updateEmailError } = await supabase
          .from('contacts')
          .update({ email: validContactEmail, updated_at: new Date().toISOString() })
          .eq('organization_id', organizationId)
          .eq('id', contact.id);

        if (updateEmailError) {
          return {
            success: false,
            _needsInput: true,
            clarification_type: 'missing_contact_email',
            message: `I found ${contact.full_name}, but couldn't save ${validContactEmail}: ${updateEmailError.message}`,
            contact_id: contact.id,
            contact_name: contact.full_name,
            missing: ['email'],
          };
        }

        contact = { ...contact, email: validContactEmail };
      }
    }

    if (!contact.email) {
      return {
        success: false,
        _needsInput: true,
        clarification_type: 'missing_contact_email',
        message: `Found ${contact.full_name}, but they don't have an email address on file. What's their email so I can send the invite?`,
        contact_id: contact.id,
        contact_name: contact.full_name,
        missing: ['email'],
      };
    }

    // ---------------------------------------------------------------
    // Step 2: Check availability via edge function
    // ---------------------------------------------------------------
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    const availabilityPayload = {
      userId,
      organizationId,
      slotType: meeting_type || 'meeting',
      daysAhead: 5,
      maxSlots: 5,
      timePreference: time_preference || 'any',
      ...(proposed_date ? { proposedDate: proposed_date } : {}),
    };

    let availabilityResult: any = null;
    try {
      const availResp = await fetch(`${supabaseUrl}/functions/v1/check-availability`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(availabilityPayload),
      });

      if (availResp.ok) {
        availabilityResult = await availResp.json();
      } else {
        const err = await availResp.json().catch(() => ({}));
        // Non-fatal — we can still proceed without calendar data
        console.warn('[schedule_meeting] Availability check failed:', err.error || availResp.status);
      }
    } catch (e: any) {
      console.warn('[schedule_meeting] Availability check error:', e.message);
    }

    // Pick the best slot
    const slots = availabilityResult?.slots || availabilityResult?.available_slots || [];
    const getSlotStart = (slot: any): string | null => {
      const value = slot?.start || slot?.start_time || slot?.isoStart || slot?.iso_start || null;
      return value && Number.isFinite(Date.parse(value)) ? value : null;
    };
    const selectedStart = selected_start_iso && Number.isFinite(Date.parse(selected_start_iso))
      ? selected_start_iso
      : null;
    const firstSlotWithStart = slots.find((slot: any) => getSlotStart(slot));
    const bestSlot = selectedStart
      ? { start: selectedStart }
      : (firstSlotWithStart || null);

    // ---------------------------------------------------------------
    // Step 3: Build meeting preview
    // ---------------------------------------------------------------
    const meetingTypeLabel = meeting_type === 'lunch' ? 'Lunch' :
      meeting_type === 'coffee' ? 'Coffee' :
      meeting_type === 'call' ? 'Call' : 'Meeting';

    const firstName = contact.full_name.split(' ')[0];
    const draftSubject = `${meetingTypeLabel} — ${firstName} & You`;
    const topicLine = message_note ? `\n\nI'd love to discuss ${message_note}.` : '';

    let timeDescription = 'a time that works for both of us';
    let suggestedStart: string | null = null;

    if (bestSlot) {
      suggestedStart = getSlotStart(bestSlot);
      if (suggestedStart) {
        const dt = new Date(suggestedStart);
        timeDescription = `${dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      }
    }

    const draftBody = `Hi ${firstName},

Hope you're doing well! I'd love to grab ${meeting_type === 'call' ? 'a call' : meeting_type} — would ${timeDescription} work for you?${topicLine}

Looking forward to it!`;

    const duration = meeting_type === 'lunch' ? 60 :
      meeting_type === 'coffee' ? 45 :
      meeting_type === 'call' ? 30 : 30;

    // ---------------------------------------------------------------
    // Phase 1: Return preview for confirmation
    // ---------------------------------------------------------------
    if (!confirmed) {
      return {
        _needsConfirmation: true,
        _confirmationType: 'schedule_meeting',
        success: true,
        preview: {
          contact: {
            id: contact.id,
            name: contact.full_name,
            email: contact.email,
            company: contact.company,
          },
          meeting_type: meetingTypeLabel,
          suggested_time: suggestedStart ? timeDescription : null,
          suggested_start_iso: suggestedStart,
          duration_minutes: duration,
          available_slots: slots.slice(0, 3).map((s: any) => {
            const start = getSlotStart(s);
            if (!start) {
              const label = [s.dayLabel || s.date, s.startTime && s.endTime ? `${s.startTime}-${s.endTime}` : s.startTime]
                .filter(Boolean)
                .join(' ');
              return label ? { ...s, label } : s;
            }
            const dt = new Date(start);
            return {
              start,
              label: `${dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
            };
          }),
          email_draft: {
            to: contact.email,
            subject: draftSubject,
            body: draftBody,
          },
        },
        message: `Here's the plan for your ${meeting_type} with **${contact.full_name}**:\n\n` +
          (resolvedDeal?.name ? `- **Deal:** ${resolvedDeal.name}\n` : '') +
          `- **To:** ${contact.full_name} (${contact.email})\n` +
          `- **When:** ${suggestedStart ? timeDescription : 'No calendar slots found — I\'ll propose flexible timing'}\n` +
          `- **Duration:** ${duration} minutes\n` +
          `- **Subject:** ${draftSubject}\n\n` +
          `**Email preview:**\n> ${draftBody.replace(/\n/g, '\n> ')}\n\n` +
          (slots.length > 1 ? `I also found ${slots.length - 1} other slot(s) if this doesn't work.\n\n` : '') +
          `Reply **"yes"** to send this email, or let me know what to change.`,
      };
    }

    // ---------------------------------------------------------------
    // Phase 2: Confirmed — send the email and create calendar event
    // ---------------------------------------------------------------
    try {
      // Send the scheduling email via edge function
      const emailPayload = {
        userId,
        organizationId,
        traceId: ctx.traceId,
        recipientEmail: contact.email,
        recipientName: contact.full_name,
        subject: draftSubject,
        plainBody: draftBody,
        dealId: deal_id || resolvedDeal?.id || undefined,
      };
      const forwardedAuthHeader = typeof ctx.authHeader === 'string' && /^Bearer\s+\S+/i.test(ctx.authHeader)
        ? ctx.authHeader
        : null;
      const emailHeaders: Record<string, string> = {
        'Authorization': forwardedAuthHeader || `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        ...(ctx.traceId ? { 'x-trace-id': ctx.traceId } : {}),
      };
      if (forwardedAuthHeader && anonKey) {
        emailHeaders.apikey = anonKey;
      }

      const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-scheduling-email`, {
        method: 'POST',
        headers: emailHeaders,
        body: JSON.stringify(emailPayload),
      });

      let emailSent = false;
      if (emailResp.ok) {
        emailSent = true;
      } else {
        const err = await emailResp.json().catch(() => ({}));
        console.warn('[schedule_meeting] Email send failed:', err.error || emailResp.status);
      }

      // If we have a suggested time, also create a calendar event
      let eventCreated = false;
      if (suggestedStart) {
        try {
          const startDate = new Date(suggestedStart);
          const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

          // Use the create-calendar-event pattern: get Google token and call API
          const { data: tokenRow } = await supabase
            .from('google_tokens')
            .select('refresh_token, access_token, expires_at, scopes')
            .eq('user_id', userId)
            .maybeSingle();

          if (tokenRow?.refresh_token) {
            const scopes: string[] = tokenRow.scopes || [];
            if (scopes.some((s: string) => s.includes('calendar'))) {
              const { refreshAccessToken } = await import('../../../_shared/google-auth.ts');
              const accessToken = await refreshAccessToken(tokenRow.refresh_token);
              if (!accessToken) {
                throw new Error('Google token refresh failed');
              }
              await supabase
                .from('google_tokens')
                .update({
                  access_token: accessToken,
                  expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                })
                .eq('user_id', userId);

              const event = {
                summary: `${meetingTypeLabel} with ${contact.full_name}`,
                description: message_note || '',
                start: { dateTime: startDate.toISOString(), timeZone: 'America/New_York' },
                end: { dateTime: endDate.toISOString(), timeZone: 'America/New_York' },
                attendees: [{ email: contact.email, displayName: contact.full_name }],
                reminders: { useDefault: true },
              };

              const calResp = await fetch(
                'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(event),
                },
              );

              if (calResp.ok) {
                eventCreated = true;
              } else {
                console.warn('[schedule_meeting] Calendar event creation failed:', calResp.status);
              }
            }
          }
        } catch (calErr: any) {
          console.warn('[schedule_meeting] Calendar event error:', calErr.message);
        }
      }

      // Log as CRM activity. Supabase query builders are thenable but do not
      // expose `.catch()` in all runtimes, so handle the returned error object.
      const { error: activityError } = await supabase.from('activities').insert({
        organization_id: organizationId,
        user_id: userId,
        type: meeting_type === 'call' ? 'call' : 'meeting',
        title: `${meetingTypeLabel} scheduled with ${contact.full_name}`,
        description: `Email sent to ${contact.email}${message_note ? `. Topic: ${message_note}` : ''}`,
        contact_id: contact.id,
        account_id: contact.account_id || undefined,
        deal_id: deal_id || resolvedDeal?.id || undefined,
        scheduled_at: suggestedStart || new Date().toISOString(),
      });
      if (activityError) {
        console.warn('[schedule_meeting] Activity log error:', activityError.message);
      }

      const results: string[] = [];
      if (emailSent) results.push(`Email sent to ${contact.full_name} (${contact.email})`);
      else results.push('Email could not be sent — check your Google connection in Settings');
      if (eventCreated) results.push(`Calendar event created for ${timeDescription}`);
      else if (suggestedStart) results.push('Calendar event could not be created — you may need to reconnect Google Calendar');
      results.push('Activity logged in CRM');

      return {
        success: emailSent,
        contact: { id: contact.id, name: contact.full_name, email: contact.email },
        email_sent: emailSent,
        event_created: eventCreated,
        message: `Done! Here's what happened:\n\n${results.map(r => `- ${r}`).join('\n')}`,
      };
    } catch (err: any) {
      console.error('[schedule_meeting] Execution error:', err.message);
      return { success: false, message: `Failed to complete scheduling: ${err.message}` };
    }
  },

  triggerExamples: [
    'send an email to Daniel Ricci to grab lunch next Thursday',
    'set up a coffee with Sarah from Acme',
    'schedule a meeting with John next week',
    'let\'s do lunch with the contact at Gucci',
  ],
};

export default scheduleMeeting;
