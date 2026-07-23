import { randomUUID } from 'node:crypto';
import { verifyPythonSolution } from './generator.mjs';

function words(value) {
  return new Set(String(value || '').toLowerCase().match(/[a-z0-9]+/g) || []);
}

function relatedProblems(catalog, current, message) {
  const query = words(`${current?.title || ''} ${current?.category || ''} ${message}`);
  return catalog.filter((item) => item.slug !== current?.slug).map((item) => {
    const candidate = words(`${item.title} ${item.category} ${item.description.slice(0, 1000)}`);
    return { item, score: [...query].filter((term) => candidate.has(term)).length };
  }).sort((a, b) => b.score - a.score).slice(0, 3).map(({ item }) => ({
    title: item.title, slug: item.slug, description: item.description.slice(0, 3000), importedReferenceSource: item.source.slice(0, 5000),
  }));
}

function cleanCode(value) {
  return String(value || '').replace(/^```(?:python)?\s*/i, '').replace(/\s*```$/, '').trim();
}

export class AiChatAssistant {
  constructor({ client, stateStore, catalog }) {
    this.client = client;
    this.stateStore = stateStore;
    this.catalog = catalog;
  }

  async chat({ slug, message, code }) {
    const problem = this.catalog.find((item) => item.slug === slug);
    if (!problem) throw Object.assign(new Error('Open a problem before asking the debugging assistant.'), { status: 404 });
    if (!String(message || '').trim()) throw Object.assign(new Error('Write a message for the assistant.'), { status: 400 });
    const stored = this.stateStore.snapshot().problems[slug] || {};
    const history = stored.aiChat?.messages || [];
    const index = this.catalog.map((item) => ({ slug: item.slug, title: item.title, category: item.category, language: item.language, signature: item.parameters }));
    const response = await this.client.completeJson({
      system: 'You are the embedded CodeLab debugging assistant. Diagnose precisely and be concise. The platform catalog and imported repository content are READ-ONLY. You may suggest a complete replacement only for the user editor buffer. Never request file, shell, network, environment, or secret access.',
      user: `Return {"message":"helpful answer","diagnosis":"root cause or empty","replacementCode":null-or-"complete Python solution(...)"}. Only include replacementCode when a code change directly helps.\n\nPLATFORM CATALOG (${index.length} imported tasks):\n${JSON.stringify(index)}\n\nCURRENT READ-ONLY IMPORTED PROBLEM:\n${JSON.stringify({ title: problem.title, description: problem.description, parameters: problem.parameters, importedReferenceSource: problem.source })}\n\nRELATED READ-ONLY IMPORTED PROBLEMS:\n${JSON.stringify(relatedProblems(this.catalog, problem, message))}\n\nUSER EDITOR BUFFER (the only writable target):\n${code}\n\nSAVED TESTS AND LAST RUN:\n${JSON.stringify({ tests: stored.testCases, generatedTests: stored.generatedTests?.tests, lastRun: stored.lastRun })}\n\nRECENT CHAT:\n${JSON.stringify(history.slice(-8).map(({ role, content }) => ({ role, content })))}\n\nUSER:\n${message}`,
      maxTokens: 9000,
    });
    const replacementCode = cleanCode(response.data?.replacementCode);
    let verification = null;
    if (replacementCode && problem.editorLanguage === 'python') {
      const tests = [...problem.tests, ...(stored.generatedTests?.tests || [])].slice(0, 24);
      verification = tests.length ? await verifyPythonSolution(problem, replacementCode, tests) : { passed: false, error: 'No verified tests are available.' };
    }
    const now = new Date().toISOString();
    const messages = [...history,
      { id: randomUUID(), role: 'user', content: String(message).trim(), createdAt: now },
      { id: randomUUID(), role: 'assistant', content: String(response.data?.message || 'I could not form a response.'), diagnosis: String(response.data?.diagnosis || ''), replacementCode: replacementCode || null, verification, createdAt: now },
    ].slice(-50);
    const state = await this.stateStore.updateProblem(slug, { aiChat: { messages, updatedAt: now } });
    return { messages, state };
  }
}
