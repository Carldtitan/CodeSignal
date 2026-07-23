import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { curatedTests } from './curated-tests.mjs';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(serverDirectory, '..');
export const challengeRoot = path.join(repositoryRoot, 'CodeSignal');
const supportedExtensions = new Set(['.py', '.sql', '.js', '.html']);

const categoryLabels = {
  Assessments: 'Assessments',
  Challenges: 'Challenges',
  Company_Challenges: 'Company Challenges',
  Core: 'The Core',
  Databases: 'Databases',
  Graphs: 'Graphs',
  InterviewPractices: 'Interview Practice',
  Intro: 'Intro',
  Python: 'Python',
};

const languageByExtension = {
  '.py': { label: 'Python 3', editor: 'python', runnable: true },
  '.js': { label: 'JavaScript', editor: 'javascript', runnable: true },
  '.sql': { label: 'MySQL', editor: 'sql', runnable: false },
  '.html': { label: 'HTML', editor: 'html', runnable: false },
};

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

export function makeSlug(category, name) {
  return `${category}-${name}`
    .toLowerCase()
    .replace(/_/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function titleFromName(name) {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function stripCommentMarker(line, extension) {
  if (extension === '.py') return line.replace(/^\s*#\s?/, '');
  if (extension === '.sql') return line.replace(/^\s*--\s?/, '');
  if (extension === '.js') return line.replace(/^\s*(?:\/\/|\/\*|\*)\s?/, '').replace(/\*\/\s*$/, '');
  if (extension === '.html') return line.replace(/^\s*<!--\s?/, '').replace(/\s?-->\s*$/, '');
  return line;
}

export function extractDescription(source, extension, title) {
  const lines = source.replace(/\r/g, '').split('\n');
  const commentPattern = extension === '.py'
    ? /^\s*#/
    : extension === '.sql'
      ? /^\s*--/
      : extension === '.js'
        ? /^\s*(?:\/\/|\/\*|\*)/
        : /^\s*<!--/;
  const collected = [];
  let began = false;

  for (const line of lines) {
    if (commentPattern.test(line)) {
      began = true;
      collected.push(stripCommentMarker(line, extension).trimEnd());
      continue;
    }
    if (!line.trim() && (began || collected.length === 0)) {
      if (began) collected.push('');
      continue;
    }
    break;
  }

  const description = collected.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return description || `Solve ${title} and return the expected result. Use the function signature in the code editor to get started.`;
}

export function extractParameters(source, extension) {
  let match;
  if (extension === '.py') match = source.match(/^\s*def\s+solution\s*\(([^)]*)\)/m);
  if (extension === '.js') match = source.match(/function\s+solution\s*\(([^)]*)\)/m);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((parameter) => parameter.trim().split('=')[0].trim())
    .filter(Boolean);
}

function starterCode(source, extension, title, parameters) {
  if (extension === '.py') {
    const signature = parameters.length ? parameters.join(', ') : '';
    return `def solution(${signature}):\n    # Write your solution here\n    pass\n`;
  }
  if (extension === '.js') {
    return `function solution(${parameters.join(', ')}) {\n  // Write your solution here\n}\n`;
  }
  if (extension === '.sql') return `-- ${title}\n-- Write your MySQL query here.\n\n`;
  return `<!-- ${title} -->\n<!-- Write your solution here. -->\n`;
}

function defaultValueFor(parameter) {
  const name = parameter.toLowerCase();
  if (/(array|arr|sequence|numbers|nums|heights|matrix|items|strings|list|a$)/.test(name)) return [];
  if (/(string|str|text|word|name|message|address|input)/.test(name)) return '';
  if (/^(is|has|can)/.test(name)) return false;
  return 0;
}

function difficultyFor(category, title) {
  if (category === 'Intro' || category === 'Python') return 'Easy';
  if (category === 'Graphs' || category === 'Challenges') return 'Hard';
  const score = [...title].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return score % 5 === 0 ? 'Hard' : score % 2 === 0 ? 'Easy' : 'Medium';
}

function tagsFor(category, description, title) {
  const haystack = `${description} ${title}`.toLowerCase();
  const tags = [];
  const hints = [
    ['array', 'Array'], ['string', 'String'], ['matrix', 'Matrix'], ['tree', 'Tree'],
    ['graph', 'Graph'], ['sort', 'Sorting'], ['database', 'Database'], ['query', 'Database'],
    ['dynamic', 'Dynamic Programming'], ['binary', 'Binary Search'], ['linked list', 'Linked List'],
    ['bit', 'Bit Manipulation'], ['regex', 'Regular Expression'], ['math', 'Math'],
  ];
  for (const [needle, tag] of hints) if (haystack.includes(needle) && !tags.includes(tag)) tags.push(tag);
  if (!tags.length) tags.push(categoryLabels[category] || category);
  return tags.slice(0, 3);
}

function problemFromFile(file, index) {
  const relative = path.relative(challengeRoot, file);
  const [category] = relative.split(path.sep);
  const extension = path.extname(file).toLowerCase();
  const name = path.basename(file, extension);
  const title = titleFromName(name);
  const source = fs.readFileSync(file, 'utf8');
  const description = extractDescription(source, extension, title);
  const parameters = extractParameters(source, extension);
  const slug = makeSlug(category, name);
  const language = languageByExtension[extension];
  const tests = curatedTests[slug] || [];

  return {
    id: index + 1,
    slug,
    title,
    category: categoryLabels[category] || category,
    categoryKey: category,
    difficulty: difficultyFor(category, title),
    acceptance: 38 + ((index * 17 + title.length * 3) % 59),
    tags: tagsFor(category, description, title),
    description,
    parameters,
    defaultArgs: (tests[0]?.args || parameters.map(defaultValueFor)),
    language: language.label,
    editorLanguage: language.editor,
    runnable: language.runnable,
    hasJudge: tests.length > 0,
    starterCode: starterCode(source, extension, title, parameters),
    source,
    extension,
    relativePath: relative.split(path.sep).join('/'),
    tests,
  };
}

export function buildCatalog() {
  return walk(challengeRoot)
    .filter((file) => supportedExtensions.has(path.extname(file).toLowerCase()))
    .sort((left, right) => left.localeCompare(right))
    .map(problemFromFile);
}

export function toPublicProblem(problem) {
  const { source, tests, extension, ...publicProblem } = problem;
  return publicProblem;
}
