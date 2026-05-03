const POSTGRES_CODE_MESSAGES: Record<string, string> = {
  '23505': 'That record already exists. Try updating the existing record instead.',
  '23503': 'That action references a related record that does not exist or is not accessible.',
  '23514': 'That value does not pass validation rules. Please review the input values and try again.',
  '42501': 'You do not have permission to perform this action.',
};

function extractCode(error: any): string | null {
  return String(error?.code || error?.details?.code || '').trim() || null;
}

export function mapToolErrorToUserMessage(toolName: string, error: any): string {
  const code = extractCode(error);
  if (code && POSTGRES_CODE_MESSAGES[code]) return POSTGRES_CODE_MESSAGES[code];

  const raw = String(error?.message || error || '').trim();
  if (!raw) return `I couldn't complete ${toolName.replace(/_/g, ' ')} due to an unexpected error.`;

  if (raw.startsWith('INVALID_TOOL_ARGS:')) {
    return raw.replace(/^INVALID_TOOL_ARGS:\s*/, '');
  }
  if (/LEGACY_FALLTHROUGH/i.test(raw)) {
    return `${toolName.replace(/_/g, ' ')} is not yet enabled in stable mode.`;
  }
  if (/unsupported tool/i.test(raw)) {
    return 'That action is currently not supported.';
  }
  if (/temporarily disabled in stable mode/i.test(raw)) {
    return 'That action is temporarily disabled in stable mode.';
  }
  if (/row-level security|permission denied|not authorized|unauthorized/i.test(raw)) {
    return 'You do not have permission to perform this action.';
  }
  if (/invalid input|validation/i.test(raw)) {
    return `The ${toolName.replace(/_/g, ' ')} request had invalid inputs. Please provide the required fields and try again.`;
  }

  // Avoid exposing internal SQL/details directly to end users.
  if (/duplicate key|violates|constraint|syntax error|column|relation/i.test(raw)) {
    return `I couldn't complete ${toolName.replace(/_/g, ' ')} because the data failed validation checks.`;
  }

  return `I couldn't complete ${toolName.replace(/_/g, ' ')} right now.`;
}
