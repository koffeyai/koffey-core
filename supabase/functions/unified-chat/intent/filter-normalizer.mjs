const OWNER_VALUES = new Set(['current_user', 'team']);
const STAGE_ALIASES = {
  open: 'open',
  active: 'open',
  prospecting: 'prospecting',
  qualification: 'qualification',
  proposal: 'proposal',
  negotiation: 'negotiation',
  won: 'closed-won',
  'closed won': 'closed-won',
  'closed-won': 'closed-won',
  lost: 'closed-lost',
  'closed lost': 'closed-lost',
  'closed-lost': 'closed-lost',
};

function normalizeOwner(value) {
  const owner = String(value || '').trim().toLowerCase();
  return OWNER_VALUES.has(owner) ? owner : undefined;
}

function normalizeStage(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  return STAGE_ALIASES[normalized] || null;
}

export function normalizeIntentFilters(rawFilters, intent) {
  const filters = rawFilters && typeof rawFilters === 'object' ? rawFilters : {};
  const normalized = {};

  const owner = normalizeOwner(filters.owner);
  if (owner) normalized.owner = owner;

  const inputStages = Array.isArray(filters.stages)
    ? filters.stages
    : (typeof filters.stages === 'string' ? [filters.stages] : []);
  const stages = Array.from(new Set(inputStages.map(normalizeStage).filter(Boolean)));
  if (stages.length > 0) normalized.stages = stages;

  if (intent === 'pipeline_window' || intent === 'pipeline_summary') {
    if (!normalized.owner) normalized.owner = 'current_user';
    if (!normalized.stages) normalized.stages = ['open'];
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}
