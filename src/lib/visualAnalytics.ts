import type { ArtifactPayload } from '../types/analytics';

const VISUAL_RE = /\b(chart|charts|graph|graphs|plot|plots|visual|visuali[sz]e|dashboard|dashboards)\b/i;
const BUSINESS_RE = /\b(pipeline|deal|deals|revenue|sales|forecast|activity|activities|task|tasks|contact|contacts|account|accounts|trend|trends|pattern|patterns|kpi|metric|metrics|indicator|indicators|report|reports|business|performance|conversion|win rate)\b/i;
const DASHBOARD_CREATE_RE = /\b(create|generate|build|make|show)\b.*\bdashboards?\b|\bdashboards?\b.*\b(create|generate|build|make|show)\b/i;

export function isVisualAnalyticsRequest(message: string): boolean {
  const text = message.trim();
  return DASHBOARD_CREATE_RE.test(text) || (VISUAL_RE.test(text) && BUSINESS_RE.test(text));
}

export function buildVisualArtifactPrompts(message: string, now = new Date()): string[] {
  const request = message.trim();
  const asOf = now.toISOString().slice(0, 10);

  if (!/\bdashboards?\b/i.test(request)) {
    return [`As of ${asOf}, ${request}`];
  }

  return [
    'create a bar chart of pipeline value by stage',
    'create a line chart of deal amount by close month for the next 12 months',
    'create a line chart of activity count by week for the last 90 days',
  ].map((prompt) => `As of ${asOf}, ${prompt}. Original user request: ${request}`);
}

function formatNumber(value: number): string {
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function artifactSignal(artifact: ArtifactPayload): string {
  const data = (artifact.data || [])
    .map((point) => ({ label: String(point.label || 'Unknown'), value: Number(point.value) || 0 }))
    .filter((point) => Number.isFinite(point.value));

  if (data.length === 0) return `${artifact.title}: no rows returned.`;

  const isTimeSeries = ['day', 'week', 'month', 'quarter', 'year'].includes(String(artifact.config?.groupBy || ''));
  if (isTimeSeries && data.length > 1) {
    const first = data[0];
    const last = data[data.length - 1];
    const delta = last.value - first.value;
    const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    const percent = first.value !== 0 ? ` (${Math.abs((delta / first.value) * 100).toFixed(1)}%)` : '';
    return `${artifact.title}: ${direction} from ${first.label} to ${last.label} by ${formatNumber(Math.abs(delta))}${percent}.`;
  }

  const top = [...data].sort((a, b) => b.value - a.value)[0];
  return `${artifact.title}: largest segment is ${top.label} at ${formatNumber(top.value)}.`;
}

export function summarizeVisualArtifacts(artifacts: ArtifactPayload[]): string {
  if (artifacts.length === 0) return 'I could not generate a visualization from the available CRM data.';

  const heading = artifacts.length === 1
    ? `Generated ${artifacts[0].title}.`
    : `Generated a ${artifacts.length}-card visual dashboard.`;
  const signals = artifacts.map(artifactSignal).join('\n');
  const footer = artifacts.length > 1
    ? '\n\nLeading indicators covered: pipeline mix, close timing, and activity momentum.'
    : '';

  return `${heading}\n\n${signals}${footer}`;
}

export function buildDashboardManagerFollowUp(message: string, artifacts: ArtifactPayload[]): string {
  const lower = message.toLowerCase();
  const wantsManagerReview = /\b(manager|pipeline review|next best|risk|stale|ask me|questions?)\b/.test(lower);
  if (!wantsManagerReview || artifacts.length === 0) return '';

  const nonEmptyArtifacts = artifacts.filter((artifact) => (artifact.rowCount || 0) > 0);
  const emptyArtifacts = artifacts.filter((artifact) => (artifact.rowCount || 0) === 0);

  const largestSegment = nonEmptyArtifacts
    .flatMap((artifact) => (artifact.data || []).map((point) => ({
      label: String(point.label || 'Unknown'),
      value: Number(point.value) || 0,
      title: artifact.title,
    })))
    .filter((point) => Number.isFinite(point.value))
    .sort((a, b) => b.value - a.value)[0];

  const nextBestAction = largestSegment
    ? `focus the next review on ${largestSegment.label} from ${largestSegment.title}, because it is currently the largest visible signal.`
    : 'capture missing deal activity and close-date data before making a forecast call.';

  const dataGap = emptyArtifacts.length > 0
    ? `Data gap: ${emptyArtifacts.map((artifact) => artifact.title).join(', ')} returned no rows, so I would verify whether the underlying records exist or need recent activity.`
    : 'Data gap: no obvious visualization gaps from the generated cards.';

  return [
    '',
    'Manager review:',
    `- Top risk to inspect: ${dataGap}`,
    `- Next best action: ${nextBestAction}`,
    '- Question I would ask next: Which open deal has the weakest next step or no committed customer action, and should I draft the follow-up now?',
  ].join('\n');
}
