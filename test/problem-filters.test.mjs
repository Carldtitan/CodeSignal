import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProblems } from '../src/problem-filters.js';

const problems = [
  { slug: 'signed', title: 'Signed', tags: ['Array'], difficulty: 'Easy', category: 'Intro', parameters: ['values'] },
  { slug: 'unsigned', title: 'Unsigned', tags: ['Database'], difficulty: 'Medium', category: 'Databases', parameters: [] },
];

test('solution signature filter removes exercises without parameters', () => {
  const filtered = filterProblems(problems, { signatureOnly: true });
  assert.deepEqual(filtered.map((problem) => problem.slug), ['signed']);
});

test('solution signature filter combines with existing filters', () => {
  assert.deepEqual(filterProblems(problems, {
    signatureOnly: true,
    difficulty: 'Medium',
  }), []);
  assert.deepEqual(filterProblems(problems, {
    signatureOnly: false,
    category: 'Databases',
  }).map((problem) => problem.slug), ['unsigned']);
});
