import { useEffect, useMemo, useState } from 'react';
import {
  Check, ChevronDown, Circle, Code2, Filter, Search, Shuffle, Sparkles,
} from 'lucide-react';
import { filterProblems } from '../problem-filters.js';

const difficulties = ['All difficulties', 'Easy', 'Medium', 'Hard'];

export default function ProblemList({ problems, statuses, initialFilters, onFilters, onSelect }) {
  const [query, setQuery] = useState(initialFilters?.query || '');
  const [difficulty, setDifficulty] = useState(initialFilters?.difficulty || 'All difficulties');
  const [category, setCategory] = useState(initialFilters?.category || 'All topics');
  const [view, setView] = useState(initialFilters?.view || 'all');
  const [signatureOnly, setSignatureOnly] = useState(Boolean(initialFilters?.signatureOnly));
  const categories = useMemo(() => ['All topics', ...new Set(problems.map((problem) => problem.category))], [problems]);

  useEffect(() => {
    const timer = setTimeout(() => onFilters({ query, difficulty, category, view, signatureOnly }), 250);
    return () => clearTimeout(timer);
  }, [query, difficulty, category, view, signatureOnly]);

  const filtered = useMemo(() => filterProblems(
    problems, { query, difficulty, category, view, signatureOnly }, statuses,
  ), [problems, query, difficulty, category, view, signatureOnly, statuses]);

  const solved = Object.values(statuses).filter((status) => status === 'solved').length;
  const attempted = Object.values(statuses).filter((status) => status === 'attempted').length;

  function choose(problem) {
    onSelect(problem);
  }

  return (
    <main className="problem-page">
      <section className="hero-grid">
        <article className="hero-card hero-card--featured">
          <div>
            <span className="eyebrow"><Sparkles size={14} /> YOUR PRACTICE SPACE</span>
            <h1>Build consistency.<br />Solve one more.</h1>
            <p>Work through the complete CodeSignal library in a focused interview-style workspace.</p>
          </div>
          <button onClick={() => choose(problems[Math.floor(Math.random() * problems.length)])}>
            <Shuffle size={17} /> Pick a problem
          </button>
          <div className="hero-orbit hero-orbit--one" /><div className="hero-orbit hero-orbit--two" />
        </article>
        <article className="progress-card">
          <div className="progress-ring" style={{ '--progress': `${Math.max(2, (solved / problems.length) * 100)}%` }}>
            <span>{solved}</span><small>Solved</small>
          </div>
          <div className="progress-stats">
            <h2>Your progress</h2>
            <p><span className="dot dot--easy" />Easy <strong>{problems.filter((p) => p.difficulty === 'Easy' && statuses[p.slug] === 'solved').length}</strong></p>
            <p><span className="dot dot--medium" />Medium <strong>{problems.filter((p) => p.difficulty === 'Medium' && statuses[p.slug] === 'solved').length}</strong></p>
            <p><span className="dot dot--hard" />Hard <strong>{problems.filter((p) => p.difficulty === 'Hard' && statuses[p.slug] === 'solved').length}</strong></p>
          </div>
          <div className="attempted-stat"><strong>{attempted}</strong><span>Attempting</span></div>
        </article>
      </section>

      <section className="problem-browser">
        <div className="browser-heading">
          <div><h2>Problemset</h2><p>{problems.length} imported exercises · {problems.filter((p) => p.hasJudge).length} with local judge cases</p></div>
          <div className="view-tabs">
            <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>All Problems</button>
            <button className={view === 'mine' ? 'active' : ''} onClick={() => setView('mine')}>My Progress</button>
          </div>
        </div>
        <div className="filter-bar">
          <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions" /></label>
          <label className="select-box"><Filter size={15} /><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label>
          <label className="select-box"><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>{difficulties.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label>
          <label className="signature-filter" title="Hide exercises that do not expose solution(...) parameters">
            <input type="checkbox" checked={signatureOnly} onChange={(event) => setSignatureOnly(event.target.checked)} />
            <Code2 size={15} /><span>Has solution signature</span>
          </label>
          <span className="filter-count">{filtered.length} questions</span>
        </div>

        <div className="problem-table" role="table">
          <div className="problem-row problem-row--header" role="row">
            <span>Status</span><span>Title</span><span>Category</span><span>Acceptance</span><span>Difficulty</span>
          </div>
          {filtered.map((problem) => (
            <button className="problem-row" role="row" key={problem.slug} onClick={() => choose(problem)}>
              <span className={`status-icon status-icon--${statuses[problem.slug] || 'none'}`}>
                {statuses[problem.slug] === 'solved' ? <Check size={17} /> : <Circle size={15} />}
              </span>
              <span className="problem-name"><strong>{problem.id}. {problem.title}</strong><small>{problem.tags.slice(0, 2).join(' · ')}</small></span>
              <span>{problem.category}</span>
              <span>{problem.acceptance}%</span>
              <span className={`difficulty difficulty--${problem.difficulty.toLowerCase()}`}>{problem.difficulty}</span>
            </button>
          ))}
          {!filtered.length && <div className="empty-list">No problems match those filters.</div>}
        </div>
      </section>
    </main>
  );
}
