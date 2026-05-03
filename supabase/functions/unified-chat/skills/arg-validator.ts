import type { SkillDefinition } from './types.ts';

type JsonSchema = Record<string, any>;

export interface ToolArgValidationResult {
  ok: boolean;
  args: Record<string, any>;
  errors: string[];
  message?: string;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function pruneNil(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => pruneNil(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const next: Record<string, any> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val === undefined || val === null) continue;
    next[key] = pruneNil(val);
  }
  return next;
}

function matchesType(expected: string, value: any): boolean {
  switch (expected) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isPlainObject(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function normalizeTypes(schema: JsonSchema): string[] {
  const raw = schema?.type;
  if (!raw) {
    if (schema?.properties || schema?.required) return ['object'];
    return [];
  }
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return [raw];
  return [];
}

function validateSchemaValue(schema: JsonSchema, value: any, path: string, errors: string[]) {
  if (!schema) return;

  if (schema.enum && Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of: ${schema.enum.join(', ')}`);
    return;
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    const branchValid = schema.oneOf.some((branch: JsonSchema) => {
      const branchErrors: string[] = [];
      validateSchemaValue(branch, value, path, branchErrors);
      return branchErrors.length === 0;
    });
    if (!branchValid) errors.push(`${path} does not match any allowed format`);
    return;
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const branchValid = schema.anyOf.some((branch: JsonSchema) => {
      const branchErrors: string[] = [];
      validateSchemaValue(branch, value, path, branchErrors);
      return branchErrors.length === 0;
    });
    if (!branchValid) errors.push(`${path} does not match any allowed format`);
    return;
  }

  const types = normalizeTypes(schema);
  if (types.length > 0 && !types.some((t) => matchesType(t, value))) {
    errors.push(`${path} has invalid type`);
    return;
  }

  if (types.includes('object') && isPlainObject(value)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (value[key] === undefined) {
        errors.push(`${path}.${key} is required`);
      }
    }

    if (isPlainObject(schema.properties)) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (value[key] === undefined) continue;
        validateSchemaValue(propSchema as JsonSchema, value[key], `${path}.${key}`, errors);
      }
    }
    return;
  }

  if (types.includes('array') && Array.isArray(value) && schema.items) {
    value.forEach((item, idx) => validateSchemaValue(schema.items, item, `${path}[${idx}]`, errors));
  }
}

function buildValidationMessage(toolName: string, errors: string[]): string {
  const top = errors.slice(0, 3).join('; ');
  return `I couldn't run ${toolName.replace(/_/g, ' ')} because the request arguments were invalid: ${top}.`;
}

export function validateToolArgs(skill: SkillDefinition, rawArgs: unknown): ToolArgValidationResult {
  const args = pruneNil(rawArgs ?? {});
  if (!isPlainObject(args)) {
    const errors = ['args must be an object'];
    return { ok: false, args: {}, errors, message: buildValidationMessage(skill.name, errors) };
  }

  const schema = skill.schema?.function?.parameters;
  if (!schema) {
    return { ok: true, args, errors: [] };
  }

  const errors: string[] = [];
  validateSchemaValue(schema, args, 'args', errors);
  if (errors.length > 0) {
    return { ok: false, args, errors, message: buildValidationMessage(skill.name, errors) };
  }

  return { ok: true, args, errors: [] };
}
