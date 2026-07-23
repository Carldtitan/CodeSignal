import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, extractDescription, extractParameters, toPublicProblem } from '../server/catalog.mjs';

test('catalog imports every exercise in the source repository', () => {
  const catalog = buildCatalog();
  assert.equal(catalog.length, 526);
  assert.equal(new Set(catalog.map((problem) => problem.slug)).size, 526);
  assert.ok(catalog.some((problem) => problem.category === 'Databases'));
  assert.ok(catalog.some((problem) => problem.language === 'Python 3'));
});

test('public catalog does not expose imported reference solutions or judge cases', () => {
  const [problem] = buildCatalog();
  const publicProblem = toPublicProblem(problem);
  assert.equal(publicProblem.source, undefined);
  assert.equal(publicProblem.tests, undefined);
  assert.ok(publicProblem.starterCode);
});

test('metadata parser extracts Python statements and solution parameters', () => {
  const source = '# Add two numbers.\n# Return the total.\n\ndef solution(left, right):\n    return left + right\n';
  assert.equal(extractDescription(source, '.py', 'Add'), 'Add two numbers.\nReturn the total.');
  assert.deepEqual(extractParameters(source, '.py'), ['left', 'right']);
});
