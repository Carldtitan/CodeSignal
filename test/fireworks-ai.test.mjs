import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FireworksClient } from '../server/ai/fireworks.mjs';
import { AiGenerator } from '../server/ai/generator.mjs';
import { StateStore } from '../server/state-store.mjs';

const problem = {
  slug: 'test-double',
  title: 'Double',
  category: 'Test',
  parameters: ['value'],
  description: 'Return twice the integer value.',
  source: 'def solution(value):\n    return value * 2\n',
  editorLanguage: 'python',
  tests: [],
};

test('Fireworks client keeps the key server-side and requests JSON mode', async () => {
  let request;
  const client = new FireworksClient({
    apiKey: 'secret-key',
    model: 'accounts/fireworks/models/glm-test',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"answer":42}' } }],
        usage: { total_tokens: 12 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  const result = await client.completeJson({ system: 'Return JSON.', user: 'Answer.' });
  assert.deepEqual(result.data, { answer: 42 });
  assert.equal(client.status().apiKey, undefined);
  assert.equal(request.options.headers.Authorization, 'Bearer secret-key');
  const body = JSON.parse(request.options.body);
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(body.reasoning_effort, 'high');
});

test('test generation survives review, local oracle checks, and restart persistence', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codelab-ai-tests-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new StateStore(path.join(directory, 'state.json'));
  await store.init();
  const draftCases = [-5, -1, 0, 1, 2, 10, 99, 1000].map((value) => ({ label: `Value ${value}`, args: [value] }));
  const reviewedCases = [-10, -1, 0, 1, 7, 100].map((value) => ({ label: `Reviewed ${value}`, category: 'edge', args: [value] }));
  const responses = [
    { data: { cases: draftCases }, usage: { total_tokens: 100 } },
    { data: { audit: 'Covers signs and scale.', cases: reviewedCases }, usage: { total_tokens: 80 } },
  ];
  const client = { model: 'glm-test', completeJson: async () => responses.shift() };
  const generator = new AiGenerator({ client, stateStore: store });
  const generated = await generator.generateTests(problem);
  assert.equal(generated.tests.length, 6);
  assert.deepEqual(generated.tests.map((item) => item.expected), [-20, -2, 0, 2, 14, 200]);
  assert.ok(generated.tests.every((item) => item.verified));
  const restored = new StateStore(path.join(directory, 'state.json'));
  const state = await restored.init();
  assert.equal(state.problems['test-double'].generatedTests.tests.length, 6);
});

test('optimal solution is independently reviewed and executed against persisted tests', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codelab-ai-solution-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new StateStore(path.join(directory, 'state.json'));
  await store.init();
  const tests = [-4, -1, 0, 1, 8, 50].map((value) => ({ args: [value], expected: value * 2, verified: true }));
  await store.updateProblem(problem.slug, { generatedTests: { tests } });
  const candidate = {
    code: 'def solution(value):\n    return value * 2',
    explanation: 'Multiplication directly produces twice the input.',
    timeComplexity: 'O(1)',
    spaceComplexity: 'O(1)',
  };
  const responses = [
    { data: candidate, usage: { total_tokens: 100 } },
    { data: { approved: true, issues: [], ...candidate }, usage: { total_tokens: 80 } },
  ];
  const client = { model: 'glm-test', completeJson: async () => responses.shift() };
  const generator = new AiGenerator({ client, stateStore: store });
  const result = await generator.generateSolution(problem);
  assert.equal(result.solution.verified, true);
  assert.equal(result.solution.reviewerApproved, true);
  assert.equal(result.solution.verifiedCaseCount, 6);
  assert.equal(result.state.aiSolution.code, candidate.code);
});
