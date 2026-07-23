import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../server/catalog.mjs';
import { runCode, runCodeStreaming, valuesEqual } from '../server/runner.mjs';

test('Python runner executes solution arguments and captures values', async () => {
  const result = await runCode('python', 'def solution(a, b):\n    return a + b\n', [
    { args: [2, 3] },
    { args: [-5, 4] },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.results.map((item) => item.value), [5, -1]);
});

test('JavaScript runner executes solution arguments and reports errors', async () => {
  const result = await runCode('javascript', 'function solution(values) { return values.reverse(); }', [
    { args: [[1, 2, 3]] },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.results[0].value, [3, 2, 1]);
});

test('streaming runner reports each case start and result in order', async () => {
  const events = [];
  const result = await runCodeStreaming('python', 'def solution(value):\n    return value * 2\n', [
    { args: [2] }, { args: [5] },
  ], (event) => events.push(event));
  assert.equal(result.ok, true);
  assert.deepEqual(events.map(({ type, index }) => [type, index]), [
    ['case-start', 0], ['case-result', 0], ['case-start', 1], ['case-result', 1], ['complete', undefined],
  ]);
  assert.deepEqual(events.filter(({ type }) => type === 'case-result').map(({ result: item }) => item.value), [4, 10]);
});

test('streaming runner enforces its execution ceiling', async () => {
  const events = [];
  const result = await runCodeStreaming('python', 'def solution(value):\n    while True: pass\n', [{ args: [1] }], (event) => events.push(event), { timeout: 100 });
  assert.equal(result.ok, false);
  assert.match(result.error, /timed out after 0.1 seconds/);
  assert.equal(events.at(-1).type, 'complete');
});

test('judge tolerates floating-point representation noise in nested outputs', () => {
  assert.equal(valuesEqual([13.700000000000001, 28.099999999999998], [13.7, 28.1]), true);
  assert.equal(valuesEqual([7.658999999999999], [7.66]), false);
  assert.equal(valuesEqual({ fare: [23.1] }, { fare: [23.100000000000001] }), true);
});

test('all curated judge fixtures accept their imported reference solution', async () => {
  const judgedProblems = buildCatalog().filter((problem) => problem.tests.length);
  assert.ok(judgedProblems.length >= 15);
  for (const problem of judgedProblems) {
    const result = await runCode(problem.editorLanguage, problem.source, problem.tests);
    assert.equal(result.ok, true, `${problem.slug} should execute`);
    assert.equal(
      result.results.every((item, index) => valuesEqual(item.value, problem.tests[index].expected)),
      true,
      `${problem.slug} should match every fixture`,
    );
  }
});
