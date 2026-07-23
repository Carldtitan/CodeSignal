import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StateStore } from '../server/state-store.mjs';

test('local backend persists and restores a complete practice session', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codelab-state-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'state.json');
  const first = new StateStore(file);
  await first.init();
  await first.updateSession({ activeProblemSlug: 'intro-add', activityDates: ['2026-07-22'] });
  await first.updateSettings({ fontSize: 17, wordWrap: false });
  await first.updateProblem('intro-add', {
    code: 'def solution(a, b):\n    return a + b',
    status: 'solved',
    testCases: [['2', '3']],
    notes: 'Remember the return value.',
    ui: { leftTab: 'notes', elapsedSeconds: 42 },
    lastRun: { kind: 'run', data: { ok: true } },
  });
  await first.addSubmission('intro-add', { id: 'one', accepted: true, passed: 3, total: 3 });

  const restored = new StateStore(file);
  const state = await restored.init();
  assert.equal(state.session.activeProblemSlug, 'intro-add');
  assert.equal(state.settings.fontSize, 17);
  assert.equal(state.settings.wordWrap, false);
  assert.equal(state.problems['intro-add'].status, 'solved');
  assert.deepEqual(state.problems['intro-add'].testCases, [['2', '3']]);
  assert.equal(state.problems['intro-add'].notes, 'Remember the return value.');
  assert.equal(state.problems['intro-add'].ui.elapsedSeconds, 42);
  assert.equal(state.problems['intro-add'].submissions[0].id, 'one');
});

test('legacy browser data only fills missing backend fields', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codelab-migration-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new StateStore(path.join(directory, 'state.json'));
  await store.init();
  await store.updateProblem('intro-add', { code: 'new backend code' });
  const imported = await store.importLegacy({
    'intro-add': { code: 'old browser code', status: 'attempted' },
  });
  const state = store.snapshot();
  assert.equal(imported, 1);
  assert.equal(state.problems['intro-add'].code, 'new backend code');
  assert.equal(state.problems['intro-add'].status, 'attempted');
});
