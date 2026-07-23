import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
        signatureOnly: false,
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

const retryableRenameErrors = new Set(['EPERM', 'EACCES', 'EBUSY']);

async function replaceWithRetry(temporaryPath, destinationPath) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.rename(temporaryPath, destinationPath);
      return;
    } catch (error) {
      if (!retryableRenameErrors.has(error.code) || attempt === 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
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
      const saved = await this.readNewestValidState();
      this.state = mergeObject(createDefaultState(), saved);
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      await this.persist();
    }
    return this.snapshot();
  }

  async readNewestValidState() {
    const directory = path.dirname(this.filePath);
    const baseName = path.basename(this.filePath);
    const candidates = (await fs.readdir(directory))
      .filter((name) => name === baseName || (name.startsWith(`${baseName}.`) && name.endsWith('.tmp')))
      .map((name) => path.join(directory, name));
    const valid = [];
    for (const candidate of candidates) {
      try {
        const value = JSON.parse(await fs.readFile(candidate, 'utf8'));
        valid.push({ value, time: Date.parse(value.updatedAt || '') || (await fs.stat(candidate)).mtimeMs });
      } catch { /* Ignore incomplete files left by an interrupted write. */ }
    }
    if (!valid.length) throw Object.assign(new Error('No saved state exists.'), { code: 'ENOENT' });
    return valid.sort((left, right) => right.time - left.time)[0].value;
  }

  snapshot() {
    return safeClone(this.state);
  }

  async persist() {
    this.state.updatedAt = new Date().toISOString();
    const snapshot = JSON.stringify(this.state, null, 2);
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await fs.writeFile(temporaryPath, snapshot, 'utf8');
      await replaceWithRetry(temporaryPath, this.filePath);
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
