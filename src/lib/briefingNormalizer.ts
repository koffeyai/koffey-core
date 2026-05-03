import type {
  AvailablePlay,
  Briefing,
  BriefingResponse,
  InMotionItem,
  Meeting,
  Momentum,
  MomentumWin,
  PlayAction,
  PriorityPlay,
} from '@/hooks/useBriefing';

const ACTION_TYPES = new Set(['meeting_prep', 'send_content', 'create_task', 'call', 'email', 'schedule']);

function text(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function textArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => textArray(item))
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  if (typeof value === 'string') {
    return value
      .split(/\n|(?:^|\s)[•*-]\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  if (value && typeof value === 'object') {
    return Object.values(value)
      .flatMap((item) => textArray(item))
      .slice(0, 8);
  }

  return [];
}

function textValue(value: unknown): string {
  if (Array.isArray(value)) return textArray(value).join(' • ');
  if (value && typeof value === 'object') return textArray(value).join(' • ');
  return text(value);
}

function normalizeAction(raw: unknown, fallbackLabel = 'Open assistant'): PlayAction {
  const action = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const rawType = text(action.type, 'create_task');
  const type = ACTION_TYPES.has(rawType)
    ? rawType as PlayAction['type']
    : rawType.startsWith('schedule')
      ? 'schedule'
      : 'create_task';

  return {
    label: text(action.label, fallbackLabel),
    type,
    deal_id: text(action.deal_id) || undefined,
  };
}

function normalizeMomentum(raw: unknown): Momentum {
  const momentum = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const quota = momentum.quota_status && typeof momentum.quota_status === 'object'
    ? momentum.quota_status as Record<string, unknown>
    : {};

  return {
    summary: text(momentum.summary),
    wins: Array.isArray(momentum.wins)
      ? momentum.wins.map((win): MomentumWin => {
        const item = win && typeof win === 'object' ? win as Record<string, unknown> : {};
        return {
          deal_name: text(item.deal_name),
          deal_id: text(item.deal_id) || undefined,
          achievement: text(item.achievement),
          context: textValue(item.context),
        };
      }).filter((win) => win.deal_name || win.achievement)
      : [],
    quota_status: {
      percentage: Number(quota.percentage) || 0,
      message: text(quota.message),
    },
  };
}

function normalizePriorityPlay(raw: unknown): PriorityPlay | null {
  if (!raw || typeof raw !== 'object') return null;

  const play = raw as Record<string, unknown>;
  const headline = text(play.headline);
  if (!headline) return null;

  return {
    headline,
    deal_name: text(play.deal_name) || undefined,
    deal_id: text(play.deal_id) || undefined,
    why_this_matters: text(play.why_this_matters),
    context: textArray(play.context),
    action: normalizeAction(play.action, 'Take next step'),
  };
}

function normalizeAvailablePlay(raw: unknown): AvailablePlay | null {
  if (!raw || typeof raw !== 'object') return null;
  const play = raw as Record<string, unknown>;
  const dealName = text(play.deal_name);
  const headline = text(play.headline);
  if (!dealName && !headline) return null;

  const status = text(play.status, 'play_available');

  return {
    deal_name: dealName || headline,
    deal_id: text(play.deal_id),
    status: (['play_available', 'patience_window', 'momentum'].includes(status)
      ? status
      : 'play_available') as AvailablePlay['status'],
    headline: headline || dealName,
    context: textValue(play.context),
    suggested_action: normalizeAction(play.suggested_action, 'Create follow-up task'),
  };
}

function normalizeInMotionItem(raw: unknown): InMotionItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const dealName = text(item.deal_name);
  const what = text(item.what);
  if (!dealName && !what) return null;

  return {
    deal_name: dealName,
    deal_id: text(item.deal_id),
    what,
    context: textValue(item.context),
    your_part_done: Boolean(item.your_part_done),
  };
}

function normalizeMeeting(raw: unknown): Meeting | null {
  if (!raw || typeof raw !== 'object') return null;
  const meeting = raw as Record<string, unknown>;
  const title = text(meeting.title);
  if (!title) return null;

  return {
    time: text(meeting.time),
    title,
    deal_id: text(meeting.deal_id) || undefined,
    prep_ready: Boolean(meeting.prep_ready),
    key_insight: textValue(meeting.key_insight) || undefined,
  };
}

function arrayOf<T>(value: unknown, normalize: (item: unknown) => T | null): T[] {
  return (Array.isArray(value) ? value : [])
    .map(normalize)
    .filter(Boolean) as T[];
}

export function normalizeBriefing(raw: unknown): Briefing {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const momentum = normalizeMomentum(source.momentum);

  return {
    greeting: text(source.greeting, 'Good morning.'),
    momentum,
    priority_play: normalizePriorityPlay(source.priority_play),
    available_plays: arrayOf(source.available_plays, normalizeAvailablePlay),
    in_motion: arrayOf(source.in_motion, normalizeInMotionItem),
    todays_meetings: arrayOf(source.todays_meetings, normalizeMeeting),
  };
}

export function normalizeBriefingResponse(raw: BriefingResponse): BriefingResponse {
  return {
    ...raw,
    briefing: normalizeBriefing(raw.briefing),
  };
}
