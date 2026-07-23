import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  Check, CheckCircle2, ChevronDown, CircleAlert, Clock3, Cloud, CloudAlert,
  Code2, FileText, Focus, Lightbulb, ListChecks, LoaderCircle, Maximize2,
  Minus, NotebookPen, PanelBottom, Play, Plus, RotateCcw, Send, Settings,
  ShieldCheck, Sparkles, TerminalSquare, WandSparkles, WrapText, X, XCircle,
} from 'lucide-react';
import {
  generateAiSolution, generateAiTests, saveProblemOnExit, saveSubmission, streamRun, updateProblem,
} from '../state-client.js';

function parseArgument(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try { return JSON.parse(trimmed); } catch { return trimmed; }
}

function stringifyArgument(value) {
  return typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value, null, 2);
}

function normalizeStoredTestCases(savedCases, defaultArgs) {
  const cases = savedCases?.length ? savedCases : [defaultArgs];
  return cases.map((testCase, index) => Array.isArray(testCase)
    ? { args: testCase, label: `Case ${index + 1}`, source: 'custom' }
    : {
        args: Array.isArray(testCase.args) ? testCase.args : defaultArgs,
        label: testCase.label || `Case ${index + 1}`,
        source: testCase.source || 'custom',
        ...(Object.hasOwn(testCase, 'expected') ? { expected: testCase.expected } : {}),
      });
}

function elapsedLabel(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return hours ? `${hours}:${minutes}:${remainder}` : `${minutes}:${remainder}`;
}

function Description({ problem, generatedTestCount }) {
  const paragraphs = problem.description.split(/\n\s*\n/).filter(Boolean);
  return (
    <div className="description-content">
      <h1>{problem.id}. {problem.title}</h1>
      <div className="problem-meta">
        <span className={`difficulty difficulty--${problem.difficulty.toLowerCase()}`}>{problem.difficulty}</span>
        <span className="meta-pill">{problem.category}</span>
        {(problem.hasJudge || generatedTestCount > 0) && <span className="judge-ready"><Check size={13} /> {generatedTestCount > 0 ? `${generatedTestCount} verified AI tests` : 'Local judge'}</span>}
      </div>
      <div className="statement">
        {paragraphs.map((paragraph, index) => {
          const isHeading = /^(example|note|input|output|constraints|test cases?)\b/i.test(paragraph.trim());
          return isHeading
            ? <div className="statement-block" key={index}><strong>{paragraph}</strong></div>
            : <p key={index}>{paragraph}</p>;
        })}
      </div>
      <div className="tag-row"><strong>Topics</strong>{problem.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    </div>
  );
}

function SolutionPanel({ problem, aiStatus, aiSolution, aiBusy, aiError, onGenerate, onUseCode }) {
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  async function reveal() {
    setLoading(true);
    try {
      const response = await fetch(`/api/problems/${problem.slug}/solution`);
      const data = await response.json();
      setSource(data.source || 'Solution unavailable.');
    } finally { setLoading(false); }
  }
  return <div className="solutions-panel">
    <section className="ai-solution-card">
      <div className="ai-card-heading"><span><WandSparkles size={20} /></span><div><h2>GLM optimal solution</h2><p>Generated, independently reviewed, and executed locally before it is saved.</p></div></div>
      {!aiStatus.configured ? <AiSetupNote /> : aiSolution ? <>
        <div className="verification-badges"><span><ShieldCheck size={14} /> Verified on {aiSolution.verifiedCaseCount} cases</span><span>{aiSolution.timeComplexity}</span><span>{aiSolution.spaceComplexity}</span></div>
        <p className="ai-explanation">{aiSolution.explanation}</p>
        {aiSolution.reviewIssues?.length > 0 && <div className="review-notes"><strong>Reviewer notes</strong>{aiSolution.reviewIssues.map((issue, index) => <span key={index}>{issue}</span>)}</div>}
        <pre className="reference-code ai-code"><code>{aiSolution.code}</code></pre>
        <div className="ai-actions"><button onClick={() => onUseCode(aiSolution.code)}>Use in editor</button><button onClick={onGenerate} disabled={aiBusy}>{aiBusy ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />} Regenerate and verify</button></div>
      </> : <button className="ai-generate-button" onClick={onGenerate} disabled={aiBusy}>{aiBusy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{aiBusy ? 'Generating and checking…' : 'Generate optimal Python solution'}</button>}
      {aiError && <div className="ai-error"><CircleAlert size={15} />{aiError}</div>}
    </section>
    <section className="reference-section">
      <div><h2>Imported reference solution</h2><p>Reveal the solution that shipped in the source repository.</p></div>
      {!source ? <button onClick={reveal} disabled={loading}>{loading ? <LoaderCircle className="spin" size={15} /> : <Lightbulb size={15} />} Reveal reference</button> : null}
    </section>
    {source && <pre className="reference-code"><code>{source}</code></pre>}
  </div>;
}

function AiSetupNote() {
  return <div className="ai-setup-note"><CircleAlert size={17} /><span><strong>Fireworks is not configured</strong><small>Copy <code>.env.example</code> to <code>.env</code>, set <code>FIREWORKS_API_KEY</code>, and restart the server.</small></span></div>;
}

function SubmissionsPanel({ submissions }) {
  if (!submissions.length) return <div className="reveal-panel"><ListChecks size={32} /><h2>No submissions yet</h2><p>Your accepted and attempted submissions for this problem will appear here.</p></div>;
  return <div className="submission-list">{submissions.map((submission) => (
    <article key={submission.id}>
      {submission.accepted ? <CheckCircle2 className="accepted-icon" /> : <XCircle className="failed-icon" />}
      <div><strong>{submission.accepted ? 'Accepted' : 'Wrong Answer'}</strong><span>{new Date(submission.time).toLocaleString()}</span></div>
      <span>{submission.passed}/{submission.total} cases</span>
      <small>{submission.language}</small>
    </article>
  ))}</div>;
}

function NotesPanel({ notes, onChange }) {
  return (
    <div className="notes-panel">
      <div><NotebookPen size={18} /><span><strong>Private notes</strong><small>Saved to your local backend with this problem.</small></span></div>
      <textarea value={notes} onChange={(event) => onChange(event.target.value)} placeholder="Write down your approach, edge cases, or what you learned…" />
    </div>
  );
}

export default function Workspace({
  problem, problemState, settings, runtimes, aiStatus, onProblemState, onSettings, onActivity,
}) {
  const savedUi = problemState.ui || {};
  const defaultTestCase = problem.defaultArgs.map(stringifyArgument);
  const [leftTab, setLeftTab] = useState(savedUi.leftTab || 'description');
  const [bottomTab, setBottomTab] = useState(savedUi.bottomTab || 'testcase');
  const [code, setCode] = useState(problemState.code ?? problem.starterCode);
  const [testCases, setTestCases] = useState(() => normalizeStoredTestCases(problemState.testCases, defaultTestCase));
  const [activeCase, setActiveCase] = useState(Math.min(savedUi.activeCase || 0, Math.max(0, (problemState.testCases?.length || 1) - 1)));
  const [notes, setNotes] = useState(problemState.notes || '');
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState(problemState.lastRun || null);
  const [submissions, setSubmissions] = useState(problemState.submissions || []);
  const [status, setStatus] = useState(problemState.status);
  const [generatedTests, setGeneratedTests] = useState(problemState.generatedTests?.tests || []);
  const [aiSolution, setAiSolution] = useState(problemState.aiSolution || null);
  const [aiBusy, setAiBusy] = useState('');
  const [aiError, setAiError] = useState('');
  const [seconds, setSeconds] = useState(savedUi.elapsedSeconds || 0);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [leftWidth, setLeftWidth] = useState(savedUi.leftWidth || 43);
  const [editorHeight, setEditorHeight] = useState(savedUi.editorHeight || 61);
  const workspaceRef = useRef(null);
  const rightRef = useRef(null);
  const pendingPatch = useRef({});
  const saveTimer = useRef(null);
  const layoutRef = useRef({ leftWidth, editorHeight });
  const latestState = useRef({});
  const runtime = runtimes[problem.editorLanguage];
  const canRun = problem.runnable && runtime?.available;
  const canSubmit = canRun && (problem.hasJudge || generatedTests.length > 0);
  latestState.current = { code, testCases, notes, leftTab, bottomTab, activeCase, seconds };

  async function flushPending() {
    clearTimeout(saveTimer.current);
    const patch = pendingPatch.current;
    if (!Object.keys(patch).length) return null;
    pendingPatch.current = {};
    setSaveStatus('saving');
    try {
      const saved = await updateProblem(problem.slug, patch);
      onProblemState(problem.slug, saved);
      setSaveStatus('saved');
      return saved;
    } catch (error) {
      pendingPatch.current = { ...patch, ...pendingPatch.current };
      setSaveStatus('error');
      return null;
    }
  }

  function queueSave(patch, delay = 300) {
    pendingPatch.current = {
      ...pendingPatch.current,
      ...patch,
      ...(patch.ui ? { ui: { ...(pendingPatch.current.ui || problemState.ui || {}), ...patch.ui } } : {}),
    };
    setSaveStatus('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushPending, delay);
  }

  function saveUi(patch) {
    queueSave({ ui: { ...savedUi, ...patch } });
  }

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (seconds > 0 && seconds % 15 === 0) saveUi({ elapsedSeconds: seconds });
  }, [seconds]);

  useEffect(() => {
    const beforeUnload = () => {
      const latest = latestState.current;
      saveProblemOnExit(problem.slug, {
        code: latest.code, testCases: latest.testCases, notes: latest.notes,
        ui: { ...savedUi, leftTab: latest.leftTab, bottomTab: latest.bottomTab, activeCase: latest.activeCase, elapsedSeconds: latest.seconds, ...layoutRef.current },
      });
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      const latest = latestState.current;
      pendingPatch.current = {
        ...pendingPatch.current,
        code: latest.code, testCases: latest.testCases, notes: latest.notes,
        ui: { ...savedUi, leftTab: latest.leftTab, bottomTab: latest.bottomTab, activeCase: latest.activeCase, elapsedSeconds: latest.seconds, ...layoutRef.current },
      };
      void flushPending();
    };
  }, []);

  useEffect(() => {
    const shortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return;
      event.preventDefault();
      if (event.shiftKey && canSubmit) void submit(); else void run();
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  });

  function changeCode(value = '') {
    setCode(value);
    queueSave({ code: value });
  }

  function changeNotes(value) {
    setNotes(value);
    queueSave({ notes: value }, 500);
  }

  function selectLeftTab(tab) {
    setLeftTab(tab);
    saveUi({ leftTab: tab });
  }

  function selectBottomTab(tab) {
    setBottomTab(tab);
    saveUi({ bottomTab: tab });
  }

  function updateTestCase(parameterIndex, value) {
    const next = testCases.map((testCase, caseIndex) => {
      if (caseIndex !== activeCase) return testCase;
      const { expected: _expected, ...editable } = testCase;
      return { ...editable, args: testCase.args.map((item, index) => index === parameterIndex ? value : item), source: 'custom' };
    });
    setTestCases(next);
    queueSave({ testCases: next });
  }

  function addTestCase() {
    const next = [...testCases, { args: [...defaultTestCase], label: `Case ${testCases.length + 1}`, source: 'custom' }];
    setTestCases(next);
    setActiveCase(next.length - 1);
    queueSave({ testCases: next, ui: { activeCase: next.length - 1 } });
  }

  function removeTestCase(index) {
    if (testCases.length === 1) return;
    const next = testCases.filter((_, caseIndex) => caseIndex !== index);
    const nextActive = Math.min(activeCase, next.length - 1);
    setTestCases(next);
    setActiveCase(nextActive);
    queueSave({ testCases: next, ui: { activeCase: nextActive } });
  }

  function chooseCase(index) {
    setActiveCase(index);
    saveUi({ activeCase: index });
  }

  function configureEditor(monaco) {
    monaco.editor.defineTheme('codelab-dark', {
      base: 'vs-dark', inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955' }, { token: 'keyword', foreground: 'C586C0' },
        { token: 'number', foreground: 'B5CEA8' },
      ],
      colors: {
        'editor.background': '#1f1f1f', 'editorLineNumber.foreground': '#656565',
        'editorLineNumber.activeForeground': '#bdbdbd', 'editor.selectionBackground': '#3f506e80',
        'editor.lineHighlightBackground': '#252525',
      },
    });
  }

  async function run() {
    if (!canRun || running) return;
    await flushPending();
    setRunning(true); setBottomTab('result'); saveUi({ bottomTab: 'result' });
    const cases = testCases.map((testCase) => ({
      args: testCase.args.map(parseArgument),
      ...(Object.hasOwn(testCase, 'expected') && testCase.expected !== undefined ? { expected: testCase.expected } : {}),
    }));
    const data = { ok: true, streaming: true, results: cases.map(() => ({ status: 'queued' })) };
    setLastRun({ kind: 'run', data: { ...data, results: [...data.results] }, time: Date.now() });
    try {
      await streamRun({ slug: problem.slug, code, cases }, (event) => {
        if (event.type === 'case-start') data.results[event.index] = { status: 'running' };
        if (event.type === 'case-result') data.results[event.index] = { ...event.result, status: event.result.passed === false || !event.result.ok ? 'failed' : 'passed' };
        if (event.type === 'complete') Object.assign(data, { ok: event.ok, error: event.error, logs: event.logs, streaming: false });
        setLastRun({ kind: 'run', data: { ...data, results: [...data.results] }, time: Date.now() });
      });
      const storedRun = { kind: 'run', data, time: Date.now() };
      setLastRun(storedRun);
      const nextStatus = status === 'solved' ? 'solved' : 'attempted';
      setStatus(nextStatus);
      queueSave({ lastRun: storedRun, status: nextStatus }, 0);
      onActivity();
    } catch (error) {
      data.streaming = false;
      const storedRun = { kind: 'run', data: { ...data, ok: false, error: error.message }, time: Date.now() };
      setLastRun(storedRun); queueSave({ lastRun: storedRun }, 0);
    } finally { setRunning(false); }
  }

  async function submit() {
    if (!canSubmit || running) return;
    await flushPending();
    setRunning(true); setBottomTab('result'); saveUi({ bottomTab: 'result' });
    try {
      const response = await fetch('/api/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: problem.slug, code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Submission failed.');
      const storedRun = { kind: 'submit', data, time: Date.now() };
      setLastRun(storedRun);
      const nextStatus = data.accepted ? 'solved' : 'attempted';
      setStatus(nextStatus);
      await updateProblem(problem.slug, { lastRun: storedRun, status: nextStatus });
      const entry = { id: crypto.randomUUID(), time: Date.now(), accepted: data.accepted, passed: data.passed, total: data.total, language: problem.language };
      const saved = await saveSubmission(problem.slug, entry);
      setSubmissions(saved.submissions || []);
      onProblemState(problem.slug, saved);
      setSaveStatus('saved');
      onActivity();
    } catch (error) {
      const storedRun = { kind: 'submit', data: { accepted: false, error: error.message }, time: Date.now() };
      setLastRun(storedRun); queueSave({ lastRun: storedRun }, 0);
    } finally { setRunning(false); }
  }

  async function generateTests() {
    if (!aiStatus.configured || aiBusy) return;
    await flushPending();
    setAiBusy('tests'); setAiError('');
    try {
      const generated = await generateAiTests(problem.slug);
      setGeneratedTests(generated.tests);
      const customCases = testCases.filter((testCase) => testCase.source !== 'ai');
      const aiCases = generated.tests.map((test) => ({
        args: test.args.map(stringifyArgument),
        expected: test.expected,
        label: test.label,
        source: 'ai',
      }));
      const nextCases = [...customCases, ...aiCases].slice(0, 20);
      const firstGenerated = Math.min(customCases.length, nextCases.length - 1);
      setTestCases(nextCases);
      setActiveCase(firstGenerated);
      const saved = await updateProblem(problem.slug, {
        testCases: nextCases,
        ui: { ...savedUi, activeCase: firstGenerated, bottomTab: 'testcase' },
      });
      onProblemState(problem.slug, saved);
      setBottomTab('testcase');
      setSaveStatus('saved');
    } catch (error) {
      setAiError(error.message);
    } finally { setAiBusy(''); }
  }

  async function generateSolution() {
    if (!aiStatus.configured || aiBusy) return;
    await flushPending();
    setAiBusy('solution'); setAiError('');
    try {
      const generated = await generateAiSolution(problem.slug);
      setAiSolution(generated.solution);
      const tests = generated.state.generatedTests?.tests || generatedTests;
      setGeneratedTests(tests);
      let savedState = generated.state;
      if (tests.length && !testCases.some((testCase) => testCase.source === 'ai')) {
        const aiCases = tests.map((test) => ({
          args: test.args.map(stringifyArgument), expected: test.expected, label: test.label, source: 'ai',
        }));
        const nextCases = [...testCases, ...aiCases].slice(0, 20);
        setTestCases(nextCases);
        savedState = await updateProblem(problem.slug, { testCases: nextCases });
      }
      onProblemState(problem.slug, savedState);
      setSaveStatus('saved');
    } catch (error) {
      setAiError(error.message);
    } finally { setAiBusy(''); }
  }

  function useAiSolution(generatedCode) {
    setCode(generatedCode);
    queueSave({ code: generatedCode }, 0);
  }

  function reset() {
    setCode(problem.starterCode);
    setLastRun(null);
    queueSave({ code: null, lastRun: null }, 0);
  }

  function startResize(axis, event) {
    event.preventDefault();
    const onMove = (moveEvent) => {
      if (axis === 'vertical') {
        const bounds = workspaceRef.current.getBoundingClientRect();
        const value = Math.min(70, Math.max(28, ((moveEvent.clientX - bounds.left) / bounds.width) * 100));
        layoutRef.current.leftWidth = value; setLeftWidth(value);
      } else {
        const bounds = rightRef.current.getBoundingClientRect();
        const value = Math.min(78, Math.max(38, ((moveEvent.clientY - bounds.top) / bounds.height) * 100));
        layoutRef.current.editorHeight = value; setEditorHeight(value);
      }
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      saveUi(layoutRef.current);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function resizeByKeyboard(axis, delta) {
    if (axis === 'vertical') {
      const value = Math.min(70, Math.max(28, leftWidth + delta));
      setLeftWidth(value); layoutRef.current.leftWidth = value;
    } else {
      const value = Math.min(78, Math.max(38, editorHeight + delta));
      setEditorHeight(value); layoutRef.current.editorHeight = value;
    }
    saveUi(layoutRef.current);
  }

  const tabs = [
    ['description', FileText, 'Description'], ['solution', Lightbulb, 'Solution'],
    ['submissions', Clock3, 'Submissions'], ['notes', NotebookPen, 'Notes'],
  ];

  return (
    <main
      className={`workspace${focused ? ' workspace--focused' : ''}`}
      ref={workspaceRef}
      style={{ gridTemplateColumns: focused ? '1fr' : `${leftWidth}% 6px minmax(0, 1fr)` }}
    >
      {!focused && <section className="panel problem-panel">
        <div className="panel-tabs">
          {tabs.map(([key, Icon, label]) => <button key={key} className={leftTab === key ? 'active' : ''} onClick={() => selectLeftTab(key)}><Icon size={15} />{label}</button>)}
        </div>
        <div className="panel-scroll">
          {leftTab === 'description' && <Description problem={problem} generatedTestCount={generatedTests.length} />}
          {leftTab === 'solution' && <SolutionPanel
            problem={problem}
            aiStatus={aiStatus}
            aiSolution={aiSolution}
            aiBusy={Boolean(aiBusy)}
            aiError={aiError}
            onGenerate={generateSolution}
            onUseCode={useAiSolution}
          />}
          {leftTab === 'submissions' && <SubmissionsPanel submissions={submissions} />}
          {leftTab === 'notes' && <NotesPanel notes={notes} onChange={changeNotes} />}
        </div>
      </section>}

      {!focused && <div className="resize-handle resize-handle--vertical" role="separator" aria-label="Resize problem and editor panes" tabIndex="0" onPointerDown={(event) => startResize('vertical', event)} onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') resizeByKeyboard('vertical', -2);
        if (event.key === 'ArrowRight') resizeByKeyboard('vertical', 2);
      }} />}

      <section
        className="right-workspace"
        ref={rightRef}
        style={{ gridTemplateRows: focused ? '1fr' : `${editorHeight}% 6px minmax(0, 1fr)` }}
      >
        <section className="panel editor-panel">
          <div className="editor-toolbar">
            <span><Code2 size={15} /> Code</span>
            <span className="language-label">{problem.language}</span>
            <span className={`save-state save-state--${saveStatus}`} title="Persisted by the local backend">
              {saveStatus === 'error' ? <CloudAlert size={14} /> : saveStatus === 'saving' ? <LoaderCircle className="spin" size={14} /> : <Cloud size={14} />}
              {saveStatus === 'error' ? 'Save failed' : saveStatus === 'saving' ? 'Saving' : 'Saved'}
            </span>
            <div className="toolbar-spacer" />
            <span className="timer"><Clock3 size={14} />{elapsedLabel(seconds)}</span>
            <button className="icon-button" onClick={reset} title="Reset to starter code"><RotateCcw size={15} /></button>
            <div className="settings-anchor">
              <button className={`icon-button${settingsOpen ? ' active' : ''}`} onClick={() => setSettingsOpen((open) => !open)} title="Editor settings"><Settings size={15} /></button>
              {settingsOpen && <div className="settings-popover">
                <strong>Editor settings</strong>
                <div><span>Font size</span><button onClick={() => onSettings({ fontSize: Math.max(11, settings.fontSize - 1) })}><Minus size={14} /></button><b>{settings.fontSize}px</b><button onClick={() => onSettings({ fontSize: Math.min(22, settings.fontSize + 1) })}><Plus size={14} /></button></div>
                <label><WrapText size={15} /><span>Word wrap</span><input type="checkbox" checked={settings.wordWrap} onChange={(event) => onSettings({ wordWrap: event.target.checked })} /></label>
              </div>}
            </div>
            <button className="icon-button" onClick={() => setFocused((value) => !value)} title={focused ? 'Exit focus mode' : 'Focus editor'}>{focused ? <Focus size={15} /> : <Maximize2 size={15} />}</button>
          </div>
          <Editor
            height="100%" language={problem.editorLanguage} value={code} beforeMount={configureEditor}
            theme="codelab-dark" onChange={changeCode}
            options={{
              fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
              fontSize: settings.fontSize, lineHeight: Math.round(settings.fontSize * 1.58), minimap: { enabled: false },
              padding: { top: 14 }, scrollBeyondLastLine: false, smoothScrolling: true, automaticLayout: true,
              renderLineHighlight: 'line', bracketPairColorization: { enabled: true }, tabSize: 4,
              wordWrap: settings.wordWrap ? 'on' : 'off',
            }}
          />
        </section>

        {!focused && <div className="resize-handle resize-handle--horizontal" role="separator" aria-label="Resize editor and testcase panes" tabIndex="0" onPointerDown={(event) => startResize('horizontal', event)} onKeyDown={(event) => {
          if (event.key === 'ArrowUp') resizeByKeyboard('horizontal', -2);
          if (event.key === 'ArrowDown') resizeByKeyboard('horizontal', 2);
        }} />}

        {!focused && <section className="panel console-panel">
          <div className="console-tabs">
            <button className={bottomTab === 'testcase' ? 'active' : ''} onClick={() => selectBottomTab('testcase')}><PanelBottom size={15} /> Testcase</button>
            <button className={bottomTab === 'result' ? 'active' : ''} onClick={() => selectBottomTab('result')}><TerminalSquare size={15} /> Test Result</button>
          </div>
          <div className="console-content">
            {bottomTab === 'testcase' ? (
              <div className="testcase-editor">
                {problem.editorLanguage === 'python' && problem.parameters.length > 0 && <div className="ai-test-toolbar">
                  {aiStatus.configured ? <>
                    <button className="ai-generate-button" onClick={generateTests} disabled={Boolean(aiBusy)}>
                      {aiBusy === 'tests' ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
                      {aiBusy === 'tests' ? 'Generating, reviewing, and verifying…' : generatedTests.length ? 'Regenerate verified tests' : 'Generate verified test cases'}
                    </button>
                    {generatedTests.length > 0 && <span><ShieldCheck size={14} /> {generatedTests.length} AI cases verified and saved</span>}
                  </> : <AiSetupNote />}
                  {aiError && <div className="ai-error"><CircleAlert size={15} />{aiError}</div>}
                </div>}
                <div className="case-tabs">
                  {testCases.map((testCase, index) => <span className={activeCase === index ? 'active' : ''} key={index}>
                    <button onClick={() => chooseCase(index)}>{testCase.source === 'ai' && <Sparkles size={11} />} {testCase.label || `Case ${index + 1}`}</button>
                    {testCases.length > 1 && <button className="remove-case" onClick={() => removeTestCase(index)} aria-label={`Remove case ${index + 1}`}><X size={12} /></button>}
                  </span>)}
                  <button className="add-case" onClick={addTestCase} title="Add testcase"><Plus size={14} /></button>
                  <small>JSON values</small>
                </div>
                {problem.parameters.length ? problem.parameters.map((parameter, index) => (
                  <label key={parameter}><span>{parameter} =</span><textarea value={testCases[activeCase]?.args?.[index] ?? ''} onChange={(event) => updateTestCase(index, event.target.value)} /></label>
                )) : <div className="fixture-note"><CircleAlert size={17} />This imported task does not expose a standard <code>solution(...)</code> signature.</div>}
                {Object.hasOwn(testCases[activeCase] || {}, 'expected') && <div className="expected-output"><span><ShieldCheck size={14} /> Verified expected output</span><pre>{JSON.stringify(testCases[activeCase].expected, null, 2)}</pre></div>}
              </div>
            ) : <ResultView lastRun={lastRun} />}
          </div>
          <div className="action-bar">
            <span>{canRun ? `${runtime.version || problem.language} · Ctrl+Enter to run${canSubmit ? ' · Ctrl+Shift+Enter to submit' : ''}` : (runtime?.reason || `${problem.language} runtime is unavailable`)}</span>
            {canRun && <button className="run-button" onClick={run} disabled={running}><Play size={15} fill="currentColor" /> Run</button>}
            {canSubmit && <button className="submit-button" onClick={submit} disabled={running}>{running ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />} Submit</button>}
          </div>
        </section>}
      </section>
    </main>
  );
}

function ResultView({ lastRun }) {
  if (!lastRun) return <div className="result-placeholder"><TerminalSquare size={28} /><p>Run your code to see the result here.</p></div>;
  const { kind, data } = lastRun;
  if (kind === 'submit') {
    return <div className={`submission-result ${data.accepted ? 'submission-result--accepted' : 'submission-result--failed'}`}>
      {data.accepted ? <CheckCircle2 size={26} /> : <XCircle size={26} />}
      <div><h3>{data.accepted ? 'Accepted' : 'Not accepted'}</h3><p>{data.error || `${data.passed} / ${data.total} judge cases passed.`}</p></div>
    </div>;
  }
  if (!data.ok && data.error) return <div className="runtime-error"><h3><XCircle size={18} /> Runtime Error</h3><pre>{data.error}</pre></div>;
  return <div className="result-cases">{data.results?.map((result, index) => {
    if (result.status === 'queued' || result.status === 'running') return <article key={index} className={result.status}>
      <h3>{result.status === 'running' ? <LoaderCircle className="spin" size={16} /> : <Clock3 size={16} />} Case {index + 1} · {result.status === 'running' ? 'Running' : 'Queued'}</h3>
    </article>;
    const evaluated = Object.hasOwn(result, 'passed');
    const successful = result.ok && (!evaluated || result.passed);
    return <article key={index} className={successful ? 'passed' : 'failed'}>
      <h3>{successful ? <CheckCircle2 size={16} /> : <XCircle size={16} />} Case {index + 1}{evaluated ? (result.passed ? ' · Passed' : ' · Output mismatch') : ''}</h3>
      {result.ok ? <><label>Actual output</label><pre>{JSON.stringify(result.value, null, 2) ?? 'null'}</pre></> : <pre>{result.error}</pre>}
      {evaluated && <><label>Expected output</label><pre>{JSON.stringify(result.expected, null, 2) ?? 'null'}</pre></>}
      {result.logs && <><label>Console</label><pre>{result.logs}</pre></>}
    </article>;
  })}</div>;
}
