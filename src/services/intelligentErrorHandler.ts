/**
 * Intelligent Error Handler
 * Routes errors to the LLM for natural language coaching instead of showing error messages
 */

interface ErrorContext {
  operation: string; // 'create_deal', 'update_contact', etc.
  entity: string;
  data: any;
  error: any;
  userId?: string;
}

class IntelligentErrorHandler {
  /**
   * Intercepts errors and converts them to coaching opportunities
   * This maintains the form but adds intelligent chat guidance when errors occur
   */
  async handleError(context: ErrorContext): Promise<void> {
    // Store context for the LLM to reference and later completion
    window.localStorage.setItem('pending_operation', JSON.stringify(context));
    
    // Send intelligent coaching message to chat (opens chat sidebar)
    this.sendToChat(this.buildCoachingPrompt(context));
  }

  /**
   * Builds an intelligent prompt based on the error context
   */
  private buildCoachingPrompt(context: ErrorContext): string {
    const { operation, entity, data, error } = context;
    
    // Detect common patterns and create natural guidance
    if (error.code === '23503' || error.message?.includes('foreign key')) {
      // Missing dependency
      if (error.message?.includes('account')) {
        return `I see you're trying to create a deal but the account "${data.account || data.name || 'this company'}" doesn't exist yet. I can quickly create it for you. Tell me: what industry is this company in?`;
      }
      if (error.message?.includes('contact')) {
        return `To complete this deal, we need to add the contact first. What's their email address and name?`;
      }
    }
    
    if (error.code === '23502' || error.message?.includes('null')) {
      // Missing required field
      const field = this.extractMissingField(error);
      return `I need the ${field} to complete this ${entity}. Can you provide that?`;
    }
    
    if (error.code === '23505' || error.message?.includes('duplicate')) {
      // Duplicate entry
      return `This ${entity} appears to already exist. Would you like me to show you the existing one or help you create a different one?`;
    }
    
    // Generic intelligent response
    return `I see you're trying to ${operation.replace('_', ' ')}. Let me help you complete this properly. What's the main purpose of this ${entity}?`;
  }

  /**
   * Sends the coaching message to the chat interface
   */
  private sendToChat(message: string) {
    // Trigger chat to open if not already
    window.dispatchEvent(new CustomEvent('open-chat-with-message', {
      detail: { 
        message,
        isCoaching: true,
        autoFocus: true
      }
    }));
  }

  /**
   * Extracts the missing field name from error
   */
  private extractMissingField(error: any): string {
    const match = error.message?.match(/column "(\w+)"/);
    const field = match ? match[1] : 'information';
    
    // Human-readable field names
    const fieldMap: Record<string, string> = {
      'name': 'name',
      'email': 'email address',
      'amount': 'deal amount',
      'close_date': 'expected close date'
    };
    
    return fieldMap[field] || field.replace(/_/g, ' ');
  }

  /**
   * Resumes a pending operation after gathering missing info
   */
  async resumeOperation(additionalData: any): Promise<any> {
    const pendingOp = window.localStorage.getItem('pending_operation');
    if (!pendingOp) return null;
    
    const context = JSON.parse(pendingOp);
    const enhancedData = { ...context.data, ...additionalData };
    
    // Clear pending operation
    window.localStorage.removeItem('pending_operation');
    
    // Signal the form to retry with enhanced data
    window.dispatchEvent(new CustomEvent('retry-operation', {
      detail: {
        operation: context.operation,
        entity: context.entity,
        data: enhancedData
      }
    }));
    
    return {
      operation: context.operation,
      entity: context.entity,
      data: enhancedData
    };
  }

  /**
   * Gets the current pending operation context
   */
  getPendingOperation(): any {
    const pendingOp = window.localStorage.getItem('pending_operation');
    return pendingOp ? JSON.parse(pendingOp) : null;
  }
}

export const errorHandler = new IntelligentErrorHandler();