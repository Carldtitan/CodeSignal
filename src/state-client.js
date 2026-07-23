let mutationQueue = Promise.resolve();

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed with status ${response.status}.`);
  return data;
}

function mutate(path, method, body) {
  const operation = () => request(path, { method, body: JSON.stringify(body) });
  mutationQueue = mutationQueue.catch(() => undefined).then(operation);
  return mutationQueue;
}

export function loadState() {
  return request('/api/state');
}

export function updateSession(patch) {
  return mutate('/api/state/session', 'PATCH', patch);
}

export function updateSettings(patch) {
  return mutate('/api/state/settings', 'PATCH', patch);
}

export function updateProblem(slug, patch) {
  return mutate(`/api/state/problems/${slug}`, 'PATCH', patch);
}

export function saveSubmission(slug, submission) {
  return mutate(`/api/state/problems/${slug}/submissions`, 'POST', submission);
}

export function saveProblemOnExit(slug, snapshot) {
  const body = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
  return navigator.sendBeacon(`/api/state/problems/${slug}/snapshot`, body);
}

export async function migrateBrowserState(problems, backendState) {
  if (backendState.migrations?.browserStorage) return backendState;
  const statuses = readLocalJson('codelab:status', {});
  const legacyProblems = {};
  for (const problem of problems) {
    const code = localStorage.getItem(`codelab:code:${problem.slug}`);
    const submissions = readLocalJson(`codelab:submissions:${problem.slug}`, null);
    if (code !== null || statuses[problem.slug] || submissions?.length) {
      legacyProblems[problem.slug] = {
        ...(code !== null ? { code } : {}),
        ...(statuses[problem.slug] ? { status: statuses[problem.slug] } : {}),
        ...(submissions?.length ? { submissions } : {}),
      };
    }
  }
  await request('/api/state/import', { method: 'POST', body: JSON.stringify({ problems: legacyProblems }) });
  return loadState();
}

function readLocalJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
