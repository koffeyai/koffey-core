// Re-export from secureLogger to get production-safe logging with sanitization
export { 
  logger, 
  logAuth, 
  logApi, 
  logError, 
  logDebug, 
  logSecurity, 
  logPerformance 
} from './secureLogger';

// For backward compatibility
export { logger as default } from './secureLogger';

// Additional convenience export
import { logger as secureLogger } from './secureLogger';
export const logInfo = (message: string, data?: unknown) => {
  secureLogger.info(message, data);
};
