import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

test('chat slide panel supports expanded and minimized modes', () => {
  const panel = readFileSync(path.join(repoRoot, 'src/components/chat/ChatSlidePanel.tsx'), 'utf8');

  assert.match(panel, /Maximize2/);
  assert.match(panel, /Minimize2/);
  assert.match(panel, /const \[isExpanded, setIsExpanded\] = useState\(false\)/);
  assert.match(panel, /aria-label=\{isExpanded \? 'Minimize chat panel' : 'Expand chat panel'\}/);
  assert.match(panel, /aria-pressed=\{isExpanded\}/);
  assert.match(panel, /left-0 right-0 w-full border-l-0/);
  assert.match(panel, /setIsExpanded\(false\)/);
});

test('email draft card frames send as an explicit review action', () => {
  const card = readFileSync(path.join(repoRoot, 'src/components/chat/EmailDraftCard.tsx'), 'utf8');

  assert.match(card, /Review email before sending/);
  assert.match(card, /Nothing sends until you press Send/);
  assert.match(card, /Writing style/);
  assert.match(card, /From your saved settings/);
  assert.doesNotMatch(card, /onApplyVoiceNotes/);
});
