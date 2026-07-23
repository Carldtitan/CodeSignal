import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  Check, CheckCircle2, ChevronDown, CircleAlert, Clock3, Code2, Copy,
  FileText, Lightbulb, ListChecks, LoaderCircle, Maximize2, MessageSquare,
  PanelBottom, Play, RotateCcw, Send, Settings, TerminalSquare, ThumbsDown,
  ThumbsUp, XCircle,
} from 'lucide-react';
import {
  addSubmission, getSavedCode, getSubmissions, resetCode, saveCode, setProblemStatus,
} from '../storage.js';

function parseArgument(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try { return JSON.parse(trimmed); } catch { return trimmed; }
}

function stringifyArgument(value) {
  return typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value, null, 2);
}

function elapsedLabel(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function Description({ problem }) {
  const paragraphs = problem.description.split(/\n\s*\n/).filter(Boolean);
  return (
    <div className="description-content">
      <h1>{problem.id}. {problem.title}</h1>
      <div className="problem-meta">
        <span className={`difficulty difficulty--${problem.difficulty.toLowerCase()}`}>{problem.difficulty}</span>
        <span className="meta-pill">{problem.category}</span>
        {problem.hasJudge && <span className="judge-ready"><Check size={13} /> Local judge</span>}
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
      <div className="feedback-row"><span>Was this description useful?</span><button><ThumbsUp size={15} /></button><button><ThumbsDown size={15} /></button></div>
    </div>
  );
}

function SolutionPanel({ problem }) {
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  async function reveal() {
    setLoading(true);
    const response = await fetch(`/api/problems/${problem.slug}/solution`);
    const data = await response.json();
    setSource(data.source || 'Solution unavailable.');
    setLoading(false);
  }
  if (!source) return (
    <div className="reveal-panel"><Lightbulb size={32} /><h2>Reference solution</h2><p>Try the problem yourself first. Reveal the imported solution when you want to compare approaches.</p><button onClick={reveal} disabled={loading}>{loading ? <LoaderCircle className="spin" size={16} /> : null} Reveal solution</button></div>
  );
  return <pre className="reference-code"><code>{source}</code></pre>;
}

function SubmissionsPanel({ submissions }) {
  if (!submissions.length) return <div className="reveal-panel"><ListChecks size={32} /><h2>No submissions yet</h2><p>Your accepted and attempted runs for this problem will appear here.</p></div>;
  return <div className="submission-list">{submissions.map((submission) => (
    <article key={submission.id}>
      {submission.accepted ? <CheckCircle2 className="accepted-icon" /> : <XCircle className="failed-icon" />}
      <div><strong>{submission.accepted ? 'Accepted' : 'Wrong Answer'}</strong><span>{new Date(submission.time).toLocaleString()}</span></div>
      <span>{submission.passed}/{submission.total} cases</span>
      <small>{submission.language}</small>
    </article>
  ))}</div>;
}

export default function Workspace({ problem }) {
  const [leftTab, setLeftTab] = useState('description');
  const [bottomTab, setBottomTab] = useState('testcase');
  const [code, setCode] = useState(() => getSavedCode(problem));
  const [argumentValues, setArgumentValues] = useState(() => problem.defaultArgs.map(stringifyArgument));
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);
  const [submissions, setSubmissions] = useState(() => getSubmissions(problem.slug));
  const [seconds, setSeconds] = useState(0);
  const saveTimer = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  function changeCode(value = '') {
    setCode(value);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveCode(problem.slug, value), 300);
  }

  function configureEditor(monaco) {
    monaco.editor.defineTheme('codelab-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955' },
        { token: 'keyword', foreground: 'C586C0' },
        { token: 'number', foreground: 'B5CEA8' },
      ],
      colors: {
        'editor.background': '#1f1f1f',
        'editorLineNumber.foreground': '#656565',
        'editorLineNumber.activeForeground': '#bdbdbd',
        'editor.selectionBackground': '#3f506e80',
        'editor.lineHighlightBackground': '#252525',
      },
    });
  }

  async function run() {
    if (!problem.runnable) {
      setRunResult({ ok: false, error: `${problem.language} needs external fixtures that were not included in the original repository.` });
      setBottomTab('result');
      return;
    }
    setRunning(true); setSubmitResult(null); setBottomTab('result');
    try {
      const response = await fetch('/api/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: problem.slug, code, cases: [{ args: argumentValues.map(parseArgument) }] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Run failed.');
      setRunResult(data);
      setProblemStatus(problem.slug, 'attempted');
    } catch (error) {
      setRunResult({ ok: false, error: error.message });
    } finally { setRunning(false); }
  }

  async function submit() {
    if (!problem.hasJudge) {
      setSubmitResult({ accepted: false, informational: true, error: 'No judge cases were included for this imported task. Use Run with your own test inputs.' });
      setBottomTab('result');
      return;
    }
    setRunning(true); setRunResult(null); setBottomTab('result');
    try {
      const response = await fetch('/api/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: problem.slug, code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Submission failed.');
      setSubmitResult(data);
      const entry = { id: crypto.randomUUID(), time: Date.now(), accepted: data.accepted, passed: data.passed, total: data.total, language: problem.language };
      addSubmission(problem.slug, entry);
      setSubmissions(getSubmissions(problem.slug));
      setProblemStatus(problem.slug, data.accepted ? 'solved' : 'attempted');
    } catch (error) {
      setSubmitResult({ accepted: false, error: error.message });
    } finally { setRunning(false); }
  }

  function reset() {
    resetCode(problem.slug);
    setCode(problem.starterCode);
  }

  const tabs = [
    ['description', FileText, 'Description'], ['solution', Lightbulb, 'Solution'],
    ['submissions', Clock3, 'Submissions'],
  ];

  return (
    <main className="workspace">
      <section className="panel problem-panel">
        <div className="panel-tabs">
          {tabs.map(([key, Icon, label]) => <button key={key} className={leftTab === key ? 'active' : ''} onClick={() => setLeftTab(key)}><Icon size={15} />{label}</button>)}
          <button className="tab-icon"><MessageSquare size={15} /></button>
        </div>
        <div className="panel-scroll">
          {leftTab === 'description' && <Description problem={problem} />}
          {leftTab === 'solution' && <SolutionPanel problem={problem} />}
          {leftTab === 'submissions' && <SubmissionsPanel submissions={submissions} />}
        </div>
      </section>

      <section className="right-workspace">
        <section className="panel editor-panel">
          <div className="editor-toolbar">
            <span><Code2 size={15} /> Code</span>
            <button className="language-button">{problem.language}<ChevronDown size={13} /></button>
            <div className="toolbar-spacer" />
            <span className="timer"><Clock3 size={14} />{elapsedLabel(seconds)}</span>
            <button className="icon-button" onClick={reset} title="Reset code"><RotateCcw size={15} /></button>
            <button className="icon-button"><Settings size={15} /></button>
            <button className="icon-button"><Maximize2 size={15} /></button>
          </div>
          <Editor
            height="100%"
            language={problem.editorLanguage}
            value={code}
            beforeMount={configureEditor}
            theme="codelab-dark"
            onChange={changeCode}
            options={{
              fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
              fontSize: 14, lineHeight: 22, minimap: { enabled: false }, padding: { top: 14 },
              scrollBeyondLastLine: false, smoothScrolling: true, automaticLayout: true,
              renderLineHighlight: 'line', bracketPairColorization: { enabled: true },
              tabSize: 4, wordWrap: 'on',
            }}
          />
        </section>

        <section className="panel console-panel">
          <div className="console-tabs">
            <button className={bottomTab === 'testcase' ? 'active' : ''} onClick={() => setBottomTab('testcase')}><PanelBottom size={15} /> Testcase</button>
            <button className={bottomTab === 'result' ? 'active' : ''} onClick={() => setBottomTab('result')}><TerminalSquare size={15} /> Test Result</button>
          </div>
          <div className="console-content">
            {bottomTab === 'testcase' ? (
              <div className="testcase-editor">
                <div className="case-tabs"><button>Case 1</button><span>JSON values</span></div>
                {problem.parameters.length ? problem.parameters.map((parameter, index) => (
                  <label key={parameter}><span>{parameter} =</span><textarea value={argumentValues[index] ?? ''} onChange={(event) => setArgumentValues((values) => values.map((value, position) => position === index ? event.target.value : value))} /></label>
                )) : <div className="fixture-note"><CircleAlert size={17} />This task does not expose a standard <code>solution(...)</code> signature. You can still edit and review it.</div>}
              </div>
            ) : (
              <ResultView runResult={runResult} submitResult={submitResult} />
            )}
          </div>
          <div className="action-bar">
            <span>{problem.runnable ? 'Runs locally on your machine' : 'Editor & reference mode'}</span>
            <button className="run-button" onClick={run} disabled={running}><Play size={15} fill="currentColor" /> Run</button>
            <button className="submit-button" onClick={submit} disabled={running}>{running ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />} Submit</button>
          </div>
        </section>
      </section>
    </main>
  );
}

function ResultView({ runResult, submitResult }) {
  if (!runResult && !submitResult) return <div className="result-placeholder"><TerminalSquare size={28} /><p>Run your code to see the result here.</p></div>;
  if (submitResult) {
    return <div className={`submission-result ${submitResult.accepted ? 'submission-result--accepted' : 'submission-result--failed'}`}>
      {submitResult.accepted ? <CheckCircle2 size={26} /> : <XCircle size={26} />}
      <div><h3>{submitResult.accepted ? 'Accepted' : submitResult.informational ? 'Custom tests only' : 'Not accepted'}</h3><p>{submitResult.error || `${submitResult.passed} / ${submitResult.total} test cases passed.`}</p></div>
    </div>;
  }
  if (!runResult.ok) return <div className="runtime-error"><h3><XCircle size={18} /> Runtime Error</h3><pre>{runResult.error || runResult.results?.find((result) => !result.ok)?.error}</pre></div>;
  const result = runResult.results?.[0];
  return <div className="run-success"><h3><CheckCircle2 size={18} /> Finished</h3><label>Output</label><pre>{JSON.stringify(result?.value, null, 2) ?? 'null'}</pre>{result?.logs && <><label>Console</label><pre>{result.logs}</pre></>}</div>;
}
