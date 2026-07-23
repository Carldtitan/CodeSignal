export function filterProblems(problems, filters, statuses = {}) {
  const {
    query = '', difficulty = 'All difficulties', category = 'All topics',
    view = 'all', signatureOnly = false,
  } = filters;
  return problems.filter((problem) => {
    const matchesQuery = `${problem.title} ${problem.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase());
    const matchesDifficulty = difficulty === 'All difficulties' || problem.difficulty === difficulty;
    const matchesCategory = category === 'All topics' || problem.category === category;
    const matchesView = view === 'all' || Boolean(statuses[problem.slug]);
    const matchesSignature = !signatureOnly || problem.parameters.length > 0;
    return matchesQuery && matchesDifficulty && matchesCategory && matchesView && matchesSignature;
  });
}
