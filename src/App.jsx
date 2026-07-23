import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import TopNav from './components/TopNav.jsx';
import ProblemList from './components/ProblemList.jsx';
import Workspace from './components/Workspace.jsx';
import {
  loadState, migrateBrowserState, updateSession, updateSettings,
} from './state-client.js';

function slugFromHash() {
  const match = window.location.hash.match(/^#\/problems\/([^/]+)$/);
  return match?.[1] || null;
}

function calculateStreak(dates = []) {
  const completed = new Set(dates);
  const cursor = new Date();
  const today = cursor.toISOString().slice(0, 10);
  if (!completed.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (completed.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export default function App() {
  const [problems, setProblems] = useState([]);
  const [backendState, setBackendState] = useState(null);
  const [runtimes, setRuntimes] = useState(null);
  const [currentSlug, setCurrentSlug] = useState(slugFromHash);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [catalog, savedState, runtimeState] = await Promise.all([
          fetch('/api/problems').then((response) => response.json()),
          loadState(),
          fetch('/api/runtime').then((response) => response.json()),
        ]);
        const migratedState = await migrateBrowserState(catalog, savedState);
        if (!active) return;
        setProblems(catalog);
        setBackendState(migratedState);
        setRuntimes(runtimeState);
        const explicitList = window.location.hash === '#/problems';
        const restoredSlug = slugFromHash() || (!explicitList && migratedState.session.activeProblemSlug);
        if (restoredSlug && catalog.some((problem) => problem.slug === restoredSlug)) {
          setCurrentSlug(restoredSlug);
          if (!slugFromHash()) window.history.replaceState(null, '', `#/problems/${restoredSlug}`);
        }
      } catch (reason) {
        if (active) setError(reason.message || 'Could not load the local workspace.');
      }
    })();
    return () => { active = false; };
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
  const statuses = useMemo(() => Object.fromEntries(
    Object.entries(backendState?.problems || {}).map(([slug, state]) => [slug, state.status]).filter(([, status]) => status),
  ), [backendState]);

  function navigate(slug) {
    setCurrentSlug(slug);
    window.location.hash = slug ? `/problems/${slug}` : '/problems';
    setBackendState((state) => ({ ...state, session: { ...state.session, activeProblemSlug: slug } }));
    updateSession({ activeProblemSlug: slug }).catch((reason) => setError(reason.message));
  }

  function updateProblemMemory(slug, problemState) {
    setBackendState((state) => ({ ...state, problems: { ...state.problems, [slug]: problemState } }));
  }

  function updateSessionMemory(patch) {
    setBackendState((state) => ({ ...state, session: { ...state.session, ...patch } }));
    return updateSession(patch);
  }

  function changeSettings(patch) {
    setBackendState((state) => ({ ...state, settings: { ...state.settings, ...patch } }));
    return updateSettings(patch);
  }

  function recordActivity() {
    const today = new Date().toISOString().slice(0, 10);
    const dates = [...new Set([...(backendState.session.activityDates || []), today])].sort().slice(-365);
    updateSessionMemory({ activityDates: dates }).catch(() => undefined);
  }

  function openDaily() {
    const day = Math.floor(Date.now() / 86_400_000);
    navigate(problems[day % problems.length].slug);
  }

  if (error) {
    return <main className="load-state"><div className="error-card">{error}<small>Make sure the local server is running with npm run dev.</small><button onClick={() => window.location.reload()}>Retry</button></div></main>;
  }

  if (!problems.length || !backendState || !runtimes) {
    return <main className="load-state"><LoaderCircle className="spin" size={28} /><span>Restoring your workspace…</span></main>;
  }

  return (
    <div className={currentProblem ? 'app app--workspace' : 'app'}>
      <TopNav
        compact={Boolean(currentProblem)}
        problem={currentProblem}
        streak={calculateStreak(backendState.session.activityDates)}
        onHome={() => navigate(null)}
        onDaily={openDaily}
        onPrevious={() => navigate(problems[(currentIndex - 1 + problems.length) % problems.length].slug)}
        onNext={() => navigate(problems[(currentIndex + 1) % problems.length].slug)}
        onRandom={() => navigate(problems[Math.floor(Math.random() * problems.length)].slug)}
      />
      {currentProblem ? (
        <Workspace
          key={currentProblem.slug}
          problem={currentProblem}
          problemState={backendState.problems[currentProblem.slug] || {}}
          settings={backendState.settings}
          runtimes={runtimes}
          onProblemState={updateProblemMemory}
          onSettings={changeSettings}
          onActivity={recordActivity}
        />
      ) : (
        <ProblemList
          problems={problems}
          statuses={statuses}
          initialFilters={backendState.session.problemList}
          onFilters={(problemList) => updateSessionMemory({ problemList }).catch(() => undefined)}
          onSelect={(problem) => navigate(problem.slug)}
          onDaily={openDaily}
        />
      )}
    </div>
  );
}
