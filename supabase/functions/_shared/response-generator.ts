/**
 * Production Response Generator - Zero formatting bugs
 */

import { md, money, displayName, formatDate } from './production-helpers.ts';

export interface ResponseData {
  contacts?: any[];
  accounts?: any[];
  deals?: any[];
  total?: number;
  next_cursor?: string;
}

/**
 * Generate list responses with proper pagination
 */
export function generateListResponse(entityType: string, data: ResponseData): string {
  const { contacts = [], accounts = [], deals = [], total = 0, next_cursor } = data;
  
  let items: any[] = [];
  let entityName = '';
  
  switch (entityType) {
    case 'contacts':
      items = contacts;
      entityName = 'contact';
      break;
    case 'accounts':
      items = accounts;
      entityName = 'account';
      break;
    case 'deals':
      items = deals;
      entityName = 'deal';
      break;
  }
  
  if (items.length === 0) {
    return `I searched your ${entityType} and found **no results**. Would you like to create a new ${entityName}?`;
  }
  
  const limit = 5; // Show first 5
  let response = `📋 Found **${total}** ${entityType}`;
  
  if (total > limit) {
    response += ` (showing ${Math.min(limit, items.length)} of ${total})`;
  }
  response += `:\n\n`;
  
  // Format each item with zero-safe, markdown-escaped output
  items.slice(0, limit).forEach((item: any, index: number) => {
    response += `${index + 1}. `;
    
    if (entityType === 'contacts') {
      response += `**${displayName(item)}**\n`;
      if (item.email) response += `   📧 ${md(item.email)}\n`;
      if (item.phone) response += `   📱 ${md(item.phone)}\n`;
      if (item.company) response += `   🏢 ${md(item.company)}\n`;
      if (item.title) response += `   👔 ${md(item.title)}\n`;
    } else if (entityType === 'accounts') {
      const name = md(item.name || 'Unnamed Account');
      response += `**${name}**\n`;
      if (item.industry) response += `   🏭 ${md(item.industry)}\n`;
      if (item.website) {
        const url = item.website.length > 50 ? item.website.substring(0, 47) + '...' : item.website;
        response += `   🌐 ${md(url)}\n`;
      }
      if (item.phone) response += `   📱 ${md(item.phone)}\n`;
    } else if (entityType === 'deals') {
      const name = md(item.name || 'Untitled Deal');
      response += `**${name}**\n`;
      
      // Zero-safe amount formatting
      if (item.amount !== undefined && item.amount !== null) {
        response += `   💰 ${money(item.amount, item.currency ?? "USD")}\n`;
      }
      if (item.stage) response += `   📊 Stage: ${md(item.stage)}\n`;
      // Zero-safe probability formatting  
      if (item.probability !== undefined && item.probability !== null) {
        response += `   📈 Probability: ${item.probability}%\n`;
      }
      if (item.close_date) response += `   📅 Close: ${formatDate(item.close_date)}\n`;
    }
    
    response += `\n`;
  });
  
  // Pagination affordance
  if (total > limit) {
    if (next_cursor) {
      response += `💡 Say "show more ${entityType} ${next_cursor}" to see additional results.`;
    } else {
      response += `💡 Say "show more ${entityType}" to see additional results.`;
    }
  }
  
  return response;
}

/**
 * Generate creation success responses
 */
export function generateCreateResponse(entityType: string, data: any): string {
  switch (entityType) {
    case 'contact':
      const name = displayName(data);
      let response = `✅ Successfully created contact: **${name}**\n`;
      if (data.email) response += `📧 ${md(data.email)}\n`;
      if (data.phone) response += `📱 ${md(data.phone)}\n`;
      if (data.company) response += `🏢 ${md(data.company)}\n`;
      return response.trim();
      
    case 'account':
      return `✅ Successfully created account: **${md(data.name)}**\n` +
             `🏭 Industry: ${md(data.industry || 'Not specified')}`;
             
    case 'opportunity':
      return `✅ Successfully created opportunity: **${md(data.name)}**\n` +
             `💰 Amount: ${money(data.amount, data.currency)}\n` +
             `📊 Stage: ${md(data.stage)}\n` +
             `📅 Close Date: ${formatDate(data.close_date)}`;
             
    default:
      return `✅ Successfully created ${entityType}.`;
  }
}

/**
 * Generate validation error responses with actionable feedback
 */
export function generateValidationError(entityType: string, errors: string[]): string {
  let response = `❌ Cannot create ${entityType}. Please fix these issues:\n\n`;
  
  errors.forEach((error, index) => {
    response += `${index + 1}. ${error}\n`;
  });
  
  // Add helpful examples based on entity type
  if (entityType === 'contact') {
    response += `\n💡 **Example**: create contact John Smith john@company.com at Acme Corp`;
  } else if (entityType === 'opportunity') {
    response += `\n💡 **Valid stages**: 0-Prospect, 1-Qualification, 2-Discovery, 3-Evaluation, 4-Commitment, 5-Negotiation, 6-ClosedWon, 6-ClosedLost, 7-Nurture`;
    response += `\n💡 **Example**: create opportunity "Q4 Deal" stage "1-Qualification" amount 50000 close date 2025-03-15`;
  }
  
  return response;
}

/**
 * Generate search responses with highlighting
 */
export function generateSearchResponse(data: ResponseData, query: string): string {
  const { contacts = [], accounts = [], deals = [] } = data;
  const totalResults = contacts.length + accounts.length + deals.length;
  
  if (totalResults === 0) {
    return `🔍 I searched for "${md(query)}" and found **no results**. Would you like to create a new record?`;
  }
  
  let response = `🔍 Search results for "${md(query)}" (${totalResults} total):\n\n`;
  
  if (contacts.length > 0) {
    response += `**👥 Contacts (${contacts.length}):**\n`;
    contacts.slice(0, 3).forEach((contact: any) => {
      response += `• ${displayName(contact)}`;
      if (contact.email) response += ` (${md(contact.email)})`;
      if (contact.company) response += ` at ${md(contact.company)}`;
      response += `\n`;
    });
    response += `\n`;
  }
  
  if (accounts.length > 0) {
    response += `**🏢 Accounts (${accounts.length}):**\n`;
    accounts.slice(0, 3).forEach((account: any) => {
      response += `• ${md(account.name || 'Unnamed')}`;
      if (account.industry) response += ` - ${md(account.industry)}`;
      response += `\n`;
    });
    response += `\n`;
  }
  
  if (deals.length > 0) {
    response += `**💼 Deals (${deals.length}):**\n`;
    deals.slice(0, 3).forEach((deal: any) => {
      response += `• ${md(deal.name || 'Untitled')}`;
      if (deal.amount !== undefined && deal.amount !== null) {
        response += ` - ${money(deal.amount, deal.currency || 'USD')}`;
      }
      response += `\n`;
    });
  }
  
  return response + `\nWould you like more details about any of these records?`;
}