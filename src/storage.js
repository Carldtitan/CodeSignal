const STATUS_KEY = 'codelab:status';

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function getStatuses() {
  return readJson(STATUS_KEY, {});
}

export function setProblemStatus(slug, status) {
  const statuses = getStatuses();
  statuses[slug] = status;
  localStorage.setItem(STATUS_KEY, JSON.stringify(statuses));
}

export function getSavedCode(problem) {
  return localStorage.getItem(`codelab:code:${problem.slug}`) || problem.starterCode;
}

export function saveCode(slug, code) {
  localStorage.setItem(`codelab:code:${slug}`, code);
}

export function resetCode(slug) {
  localStorage.removeItem(`codelab:code:${slug}`);
}

export function getSubmissions(slug) {
  return readJson(`codelab:submissions:${slug}`, []);
}

export function addSubmission(slug, submission) {
  const submissions = getSubmissions(slug);
  localStorage.setItem(`codelab:submissions:${slug}`, JSON.stringify([submission, ...submissions].slice(0, 30)));
}
