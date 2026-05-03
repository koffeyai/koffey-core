import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyRecoverableLoadError,
  isRecoverableLoadError,
} from '../../src/lib/recoverableLoadErrors.ts';

test('classifies stale lazy chunk failures as module load errors', () => {
  const error = new TypeError('Failed to fetch dynamically imported module: https://www.koffey.ai/assets/App-old.js');

  assert.equal(classifyRecoverableLoadError(error), 'module_load');
  assert.equal(isRecoverableLoadError(error), true);
});

test('classifies timeout and abort failures as recoverable timeouts', () => {
  assert.equal(classifyRecoverableLoadError(new Error('Request timed out while loading dashboard')), 'timeout');
  assert.equal(classifyRecoverableLoadError({ name: 'AbortError', message: 'The operation was aborted' }), 'timeout');
});

test('does not classify ordinary render bugs as recoverable load failures', () => {
  assert.equal(classifyRecoverableLoadError(new TypeError('priority_play.context.map is not a function')), 'unknown');
  assert.equal(isRecoverableLoadError(new Error('Cannot read properties of undefined')), false);
});
