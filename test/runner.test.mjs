import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../server/catalog.mjs';
import { runCode, valuesEqual } from '../server/runner.mjs';

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
