import { useToast } from '@/hooks/use-toast';
import { useCallback } from 'react';

interface ErrorContext {
  operation: string;
  entityType: string;
  error: any;
  formData?: any;
}

export const useIntelligentErrorGuidance = () => {
  const { toast } = useToast();

  const showGuidance = useCallback((context: ErrorContext) => {
    const { operation, entityType, error, formData } = context;
    
    // Chat-style guidance messages
    let guidance = {
      title: `I couldn't ${operation} that ${entityType}. Let me help! 🤔`,
      message: "I'm not sure what went wrong. Try again in a moment.",
      suggestions: [] as string[]
    };

    // Analyze the error and provide specific guidance
    if (error.message?.includes('duplicate') || error.code === '23505') {
      guidance = {
        title: `This ${entityType} already exists! 📋`,
        message: `I found another ${entityType} with similar information.`,
        suggestions: [
          `Try searching for it above to see if it's already there`,
          `Use a slightly different name if you need a new entry`,
          `I can help you merge duplicate entries if needed`
        ]
      };
    } 
    else if (error.message?.includes('permission') || error.code === '42501') {
      guidance = {
        title: `Permission issue detected! 🔐`,
        message: `You don't have permission to ${operation} ${entityType}s.`,
        suggestions: [
          `Contact your organization admin for the right permissions`,
          `Ask a team member with admin access to help`,
          `I can guide you through requesting access`
        ]
      };
    }
    else if (error.message?.includes('violates foreign key') || error.code === '23503') {
      guidance = {
        title: `This ${entityType} has linked records! 🔗`,
        message: `Can't delete because other records depend on it.`,
        suggestions: [
          `Remove or reassign linked deals, contacts, and tasks first`,
          `Check the ${entityType} detail page for related records`,
          `You can also archive instead of deleting`
        ]
      };
    }
    else if (error.message?.includes('organization_id') || (error.message?.includes('organization') && !error.message?.includes('foreign key'))) {
      guidance = {
        title: `Organization setup issue! 🏢`,
        message: `There's a problem with your organization connection.`,
        suggestions: [
          `Try refreshing the page`,
          `Check if you're logged into the right organization`,
          `Contact support if this keeps happening`
        ]
      };
    }
    else if (error.message?.includes('network') || error.message?.includes('fetch')) {
      guidance = {
        title: `Connection problem! 📶`,
        message: `I'm having trouble reaching our servers.`,
        suggestions: [
          `Check your internet connection`,
          `Try again in a moment`,
          `The issue might resolve itself`
        ]
      };
    }
    else if (error.message?.includes('required') || error.message?.includes('null')) {
      guidance = {
        title: `Missing required information! ✏️`,
        message: `Some important fields are missing or incomplete.`,
        suggestions: [
          `Fill in all fields marked with * (required)`,
          `Double-check the ${entityType} name is entered`,
          `Make sure all important details are complete`
        ]
      };
    }
    else if (error.message?.includes('invalid') || error.message?.includes('format')) {
      guidance = {
        title: `Data format issue! 📝`,
        message: `Some information isn't in the right format.`,
        suggestions: [
          `Check email format (example@company.com)`,
          `Verify phone numbers are entered correctly`,
          `Make sure website URLs include http:// or https://`
        ]
      };
    }

    // Add context-specific suggestions
    if (entityType === 'account' && formData) {
      if (!formData.name || formData.name.trim() === '') {
        guidance.suggestions.unshift(`Account name is required - try a descriptive company name`);
      }
      if (formData.website && !formData.website.includes('.')) {
        guidance.suggestions.push(`Website should include domain extension like .com`);
      }
    }

    // Show the intelligent guidance
    const suggestionText = guidance.suggestions.length > 0 
      ? `\n\nHere's what you can try:\n${guidance.suggestions.map(s => `• ${s}`).join('\n')}\n\n💬 Need more help? Ask me in the chat!`
      : '\n\n💬 Need more help? Ask me in the chat!';

    toast({
      title: guidance.title,
      description: guidance.message + suggestionText,
      variant: "destructive",
      duration: 12000 // Longer duration for detailed guidance
    });
  }, [toast]);

  const showSuccess = useCallback((operation: string, entityType: string) => {
    const successMessages = [
      `Perfect! Your ${entityType} has been ${operation}d successfully! 🎉`,
      `Great job! The ${entityType} is now ${operation}d and ready to use! ✅`,
      `Success! I've ${operation}d that ${entityType} for you! 👍`
    ];
    
    const message = successMessages[Math.floor(Math.random() * successMessages.length)];
    
    toast({
      title: message,
      description: `You can now search for it, edit details, or add more ${entityType}s.`,
      variant: "default",
      duration: 5000
    });
  }, [toast]);

  return {
    showGuidance,
    showSuccess
  };
};