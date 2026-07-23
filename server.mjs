import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog, repositoryRoot, toPublicProblem } from './server/catalog.mjs';
import { detectPythonRuntime, runCode, runCodeStreaming, valuesEqual } from './server/runner.mjs';
import { StateStore } from './server/state-store.mjs';
import { FireworksClient } from './server/ai/fireworks.mjs';
import { AiGenerator } from './server/ai/generator.mjs';
import { AiChatAssistant } from './server/ai/chat.mjs';

const app = express();
const port = Number(process.env.PORT || 3000);
const catalog = buildCatalog();
const bySlug = new Map(catalog.map((problem) => [problem.slug, problem]));
const stateStore = new StateStore();
await stateStore.init();
const fireworks = new FireworksClient();
const aiGenerator = new AiGenerator({ client: fireworks, stateStore });
const aiChat = new AiChatAssistant({ client: fireworks, stateStore, catalog });
const activeAiJobs = new Set();
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
app.get('/api/ai/status', (_request, response) => response.json({
  ...fireworks.status(),
  safeguards: ['independent GLM review', 'local reference execution', 'deduplication', 'persisted verification metadata'],
}));

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

async function runAiJob(request, response, type) {
  const problem = bySlug.get(request.params.slug);
  if (!problem) return response.status(404).json({ error: 'Problem not found.' });
  if (!fireworks.status().configured) {
    return response.status(503).json({ error: 'Set FIREWORKS_API_KEY in .env and restart the server to enable AI generation.' });
  }
  const key = problem.slug;
  if (activeAiJobs.has(key)) return response.status(409).json({ error: `A ${type} generation job is already running for this problem.` });
  activeAiJobs.add(key);
  try {
    const result = type === 'tests'
      ? await aiGenerator.generateTests(problem)
      : await aiGenerator.generateSolution(problem);
    return response.json(result);
  } catch (error) {
    return response.status(error.status || 500).json({ error: error.message || 'AI generation failed.' });
  } finally {
    activeAiJobs.delete(key);
  }
}

app.post('/api/ai/problems/:slug/generate-tests', (request, response) => runAiJob(request, response, 'tests'));
app.post('/api/ai/problems/:slug/generate-solution', (request, response) => runAiJob(request, response, 'solution'));
app.post('/api/ai/chat', async (request, response) => {
  if (!fireworks.status().configured) return response.status(503).json({ error: 'Set FIREWORKS_API_KEY in .env and restart the server.' });
  try { return response.json(await aiChat.chat(request.body || {})); }
  catch (error) { return response.status(error.status || 500).json({ error: error.message || 'AI chat failed.' }); }
});

app.delete('/api/ai/chat/:slug', async (request, response) => {
  if (!bySlug.has(request.params.slug)) return response.status(404).json({ error: 'Problem not found.' });
  return response.json(await stateStore.updateProblem(request.params.slug, { aiChat: { messages: [], updatedAt: new Date().toISOString() } }));
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
  execution.results = (execution.results || []).map((result, index) => {
    if (!Object.hasOwn(cases[index] || {}, 'expected')) return result;
    return { ...result, expected: cases[index].expected, passed: result.ok && valuesEqual(result.value, cases[index].expected) };
  });
  return response.json(execution);
});

app.post('/api/run/stream', async (request, response) => {
  const { slug, code, cases } = request.body || {};
  const problem = bySlug.get(slug);
  if (!problem) return response.status(404).json({ error: 'Problem not found.' });
  if (!problem.runnable) return response.status(400).json({ error: `${problem.language} requires fixtures that are not bundled with the source repository.` });
  if (typeof code !== 'string' || !Array.isArray(cases) || cases.length > 20) {
    return response.status(400).json({ error: 'Provide code and up to 20 test cases.' });
  }
  response.status(200).set({ 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  response.flushHeaders();
  const controller = new AbortController();
  request.on('aborted', () => controller.abort());
  const write = (event) => {
    if (response.writableEnded) return;
    let enriched = event;
    if (event.type === 'case-result' && Object.hasOwn(cases[event.index] || {}, 'expected')) {
      enriched = { ...event, result: { ...event.result, expected: cases[event.index].expected, passed: event.result.ok && valuesEqual(event.result.value, cases[event.index].expected) } };
    }
    response.write(`${JSON.stringify(enriched)}\n`);
  };
  await runCodeStreaming(problem.editorLanguage, code, cases, write, { timeout: 60000, signal: controller.signal });
  if (!response.writableEnded) response.end();
});

app.post('/api/submit', async (request, response) => {
  const { slug, code } = request.body || {};
  const problem = bySlug.get(slug);
  if (!problem) return response.status(404).json({ error: 'Problem not found.' });
  if (!problem.runnable) return response.status(400).json({ error: `${problem.language} cannot be judged without its original fixtures.` });
  const generatedTests = stateStore.snapshot().problems[slug]?.generatedTests?.tests || [];
  const seen = new Set();
  const judgeTests = [...problem.tests, ...generatedTests].filter((test) => {
    const key = JSON.stringify(test.args);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);
  if (!judgeTests.length) {
    return response.status(422).json({ error: 'This imported exercise has no bundled judge cases yet. You can still run custom cases.' });
  }
  const execution = await runCode(problem.editorLanguage, code, judgeTests);
  const results = execution.results.map((result, index) => ({
    ...result,
    passed: result.ok && valuesEqual(result.value, judgeTests[index].expected),
  }));
  const accepted = execution.ok && results.every((result) => result.passed);
  return response.json({
    ...execution,
    accepted,
    passed: results.filter((result) => result.passed).length,
    total: judgeTests.length,
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
