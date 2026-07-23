import fs from 'node:fs/promises';
import path from 'node:path';
import { repositoryRoot } from './catalog.mjs';

export const defaultStatePath = path.join(repositoryRoot, 'data', 'codelab-state.json');

export function createDefaultState() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    session: {
      activeProblemSlug: null,
      activityDates: [],
      problemList: {
        query: '',
        difficulty: 'All difficulties',
        category: 'All topics',
        view: 'all',
      },
    },
    settings: {
      fontSize: 14,
      wordWrap: true,
    },
    problems: {},
    migrations: {},
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeObject(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    result[key] = isObject(value) && isObject(base?.[key]) ? mergeObject(base[key], value) : value;
  }
  return result;
}

function safeClone(value) {
  return structuredClone(value);
}

export class StateStore {
  constructor(filePath = process.env.CODELAB_STATE_FILE || defaultStatePath) {
    this.filePath = filePath;
    this.state = createDefaultState();
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const saved = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      this.state = mergeObject(createDefaultState(), saved);
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      await this.persist();
    }
    return this.snapshot();
  }

  snapshot() {
    return safeClone(this.state);
  }

  async persist() {
    this.state.updatedAt = new Date().toISOString();
    const snapshot = JSON.stringify(this.state, null, 2);
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.writeFile(temporaryPath, snapshot, 'utf8');
      await fs.rename(temporaryPath, this.filePath);
    });
    await this.writeQueue;
  }

  async updateSession(patch) {
    this.state.session = mergeObject(this.state.session, patch);
    await this.persist();
    return safeClone(this.state.session);
  }

  async updateSettings(patch) {
    this.state.settings = mergeObject(this.state.settings, patch);
    await this.persist();
    return safeClone(this.state.settings);
  }

  async updateProblem(slug, patch) {
    const current = this.state.problems[slug] || {};
    const next = mergeObject(current, patch);
    for (const [key, value] of Object.entries(next)) if (value === null) delete next[key];
    next.updatedAt = new Date().toISOString();
    this.state.problems[slug] = next;
    await this.persist();
    return safeClone(next);
  }

  async addSubmission(slug, submission) {
    const current = this.state.problems[slug] || {};
    const submissions = [submission, ...(current.submissions || [])].slice(0, 100);
    return this.updateProblem(slug, { submissions });
  }

  async importLegacy(problems) {
    let imported = 0;
    for (const [slug, legacy] of Object.entries(problems || {})) {
      if (!isObject(legacy)) continue;
      const current = this.state.problems[slug] || {};
      const missingOnly = {};
      for (const key of ['code', 'status', 'submissions']) {
        if (current[key] === undefined && legacy[key] !== undefined) missingOnly[key] = legacy[key];
      }
      if (Object.keys(missingOnly).length) {
        this.state.problems[slug] = mergeObject(current, missingOnly);
        imported += 1;
      }
    }
    this.state.migrations.browserStorage = new Date().toISOString();
    await this.persist();
    return imported;
  }
}
