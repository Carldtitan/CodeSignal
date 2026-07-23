import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import TopNav from './components/TopNav.jsx';
import ProblemList from './components/ProblemList.jsx';
import Workspace from './components/Workspace.jsx';

function slugFromHash() {
  const match = window.location.hash.match(/^#\/problems\/([^/]+)$/);
  return match?.[1] || null;
}

export default function App() {
  const [problems, setProblems] = useState([]);
  const [currentSlug, setCurrentSlug] = useState(slugFromHash);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/problems')
      .then((response) => {
        if (!response.ok) throw new Error('Could not load the problem catalog.');
        return response.json();
      })
      .then(setProblems)
      .catch((reason) => setError(reason.message));
  }, []);

  useEffect(() => {
    const handleHashChange = () => setCurrentSlug(slugFromHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const currentIndex = useMemo(
    () => problems.findIndex((problem) => problem.slug === currentSlug),
    [problems, currentSlug],
  );
  const currentProblem = currentIndex >= 0 ? problems[currentIndex] : null;

  function navigate(slug) {
    window.location.hash = slug ? `/problems/${slug}` : '/problems';
  }

  if (error) {
    return <main className="load-state"><div className="error-card">{error}<small>Make sure the local server is running with npm run dev.</small></div></main>;
  }

  if (!problems.length) {
    return <main className="load-state"><LoaderCircle className="spin" size={28} /><span>Loading practice library…</span></main>;
  }

  return (
    <div className={currentProblem ? 'app app--workspace' : 'app'}>
      <TopNav
        compact={Boolean(currentProblem)}
        problem={currentProblem}
        onHome={() => navigate(null)}
        onPrevious={() => navigate(problems[(currentIndex - 1 + problems.length) % problems.length].slug)}
        onNext={() => navigate(problems[(currentIndex + 1) % problems.length].slug)}
        onRandom={() => navigate(problems[Math.floor(Math.random() * problems.length)].slug)}
      />
      {currentProblem ? (
        <Workspace key={currentProblem.slug} problem={currentProblem} />
      ) : (
        <ProblemList problems={problems} onSelect={(problem) => navigate(problem.slug)} />
      )}
    </div>
  );
}
