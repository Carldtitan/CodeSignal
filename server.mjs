import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog, repositoryRoot, toPublicProblem } from './server/catalog.mjs';
import { detectPythonRuntime, runCode, valuesEqual } from './server/runner.mjs';
import { StateStore } from './server/state-store.mjs';

const app = express();
const port = Number(process.env.PORT || 3000);
const catalog = buildCatalog();
const bySlug = new Map(catalog.map((problem) => [problem.slug, problem]));
const stateStore = new StateStore();
await stateStore.init();
const pythonRuntime = detectPythonRuntime();
const runtimes = {
  python: { available: pythonRuntime.available, version: pythonRuntime.version, reason: pythonRuntime.reason },
  javascript: { available: true, version: process.version },
  sql: { available: false, reason: 'The source collection does not include database schemas or fixtures.' },
  html: { available: false, reason: 'The imported HTML exercise does not include an automated browser fixture.' },
};

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, problems: catalog.length, stateFile: stateStore.filePath, runtimes });
});

app.get('/api/runtime', (_request, response) => response.json(runtimes));

app.get('/api/state', (_request, response) => response.json(stateStore.snapshot()));

app.patch('/api/state/session', async (request, response, next) => {
  try { response.json(await stateStore.updateSession(request.body || {})); } catch (error) { next(error); }
});

app.patch('/api/state/settings', async (request, response, next) => {
  try { response.json(await stateStore.updateSettings(request.body || {})); } catch (error) { next(error); }
});

app.patch('/api/state/problems/:slug', async (request, response, next) => {
  if (!bySlug.has(request.params.slug)) return response.status(404).json({ error: 'Problem not found.' });
  const allowed = ['code', 'status', 'testCases', 'notes', 'ui', 'lastRun'];
  const patch = Object.fromEntries(Object.entries(request.body || {}).filter(([key]) => allowed.includes(key)));
  try { return response.json(await stateStore.updateProblem(request.params.slug, patch)); } catch (error) { return next(error); }
});

app.post('/api/state/problems/:slug/snapshot', async (request, response, next) => {
  if (!bySlug.has(request.params.slug)) return response.status(404).json({ error: 'Problem not found.' });
  const allowed = ['code', 'status', 'testCases', 'notes', 'ui', 'lastRun'];
  const patch = Object.fromEntries(Object.entries(request.body || {}).filter(([key]) => allowed.includes(key)));
  try { return response.json(await stateStore.updateProblem(request.params.slug, patch)); } catch (error) { return next(error); }
});

app.post('/api/state/problems/:slug/submissions', async (request, response, next) => {
  if (!bySlug.has(request.params.slug)) return response.status(404).json({ error: 'Problem not found.' });
  try { return response.json(await stateStore.addSubmission(request.params.slug, request.body || {})); } catch (error) { return next(error); }
});

app.post('/api/state/import', async (request, response, next) => {
  try { response.json({ imported: await stateStore.importLegacy(request.body?.problems) }); } catch (error) { next(error); }
});

app.get('/api/problems', (_request, response) => {
  response.json(catalog.map(toPublicProblem));
});

app.get('/api/problems/:slug/solution', (request, response) => {
  const problem = bySlug.get(request.params.slug);
  if (!problem) return response.status(404).json({ error: 'Problem not found.' });
  return response.json({ source: problem.source, language: problem.editorLanguage });
});

app.post('/api/run', async (request, response) => {
  const { slug, code, cases } = request.body || {};
  const problem = bySlug.get(slug);
  if (!problem) return response.status(404).json({ error: 'Problem not found.' });
  if (!problem.runnable) return response.status(400).json({ error: `${problem.language} requires database or browser fixtures that are not bundled with the source repository.` });
  if (typeof code !== 'string' || !Array.isArray(cases) || cases.length > 20) {
    return response.status(400).json({ error: 'Provide code and up to 20 test cases.' });
  }
  const execution = await runCode(problem.editorLanguage, code, cases);
  return response.json(execution);
});

app.post('/api/submit', async (request, response) => {
  const { slug, code } = request.body || {};
  const problem = bySlug.get(slug);
  if (!problem) return response.status(404).json({ error: 'Problem not found.' });
  if (!problem.runnable) return response.status(400).json({ error: `${problem.language} cannot be judged without its original fixtures.` });
  if (!problem.tests.length) {
    return response.status(422).json({ error: 'This imported exercise has no bundled judge cases yet. You can still run custom cases.' });
  }
  const execution = await runCode(problem.editorLanguage, code, problem.tests);
  const results = execution.results.map((result, index) => ({
    ...result,
    passed: result.ok && valuesEqual(result.value, problem.tests[index].expected),
  }));
  const accepted = execution.ok && results.every((result) => result.passed);
  return response.json({
    ...execution,
    accepted,
    passed: results.filter((result) => result.passed).length,
    total: problem.tests.length,
    results: results.map((result) => ({ ok: result.ok, passed: result.passed, error: result.error })),
  });
});

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(repositoryRoot, 'dist');
  app.use(express.static(dist));
  app.use((request, response, next) => {
    if (request.method !== 'GET') return next();
    return response.sendFile(path.join(dist, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`CodeLab is ready at http://localhost:${port} with ${catalog.length} problems.`);
});
