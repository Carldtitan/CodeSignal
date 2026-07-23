import { useState } from 'react';
import { Bot, CheckCircle2, LoaderCircle, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import { chatWithAi, clearAiChat } from '../state-client.js';

export default function AiChatDrawer({ open, problem, problemState, aiStatus, onClose, onProblemState, onApplyCode }) {
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const messages = problemState?.aiChat?.messages || [];
  async function send(text = message) {
    if (!problem || !text.trim() || busy) return;
    setBusy(true); setError(''); setMessage('');
    try { const result = await chatWithAi({ slug: problem.slug, message: text, code: problemState.code ?? problem.starterCode }); onProblemState(problem.slug, result.state); }
    catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }
  async function clear() { if (problem && !busy) onProblemState(problem.slug, await clearAiChat(problem.slug)); }
  if (!open) return null;
  return <aside className="ai-chat" aria-label="Chat with AI">
    <header><span><Bot size={19} /><b>Chat with AI</b></span><div><button onClick={clear} title="Clear saved chat" disabled={!messages.length}><Trash2 size={16} /></button><button onClick={onClose} title="Close AI chat"><X size={18} /></button></div></header>
    <div className="ai-chat__context"><ShieldCheck size={14} /><span><b>{problem?.title || 'Open a problem'}</b><small>GLM can read imported tasks and saved run context. It can only suggest editor changes.</small></span></div>
    <div className="ai-chat__messages">
      {!messages.length && <div className="ai-chat__empty"><Bot size={28} /><p>Ask about an error, an algorithm, or your last failed testcase.</p>{problemState?.lastRun && <button onClick={() => send('Debug my last run. Explain the root cause and propose a verified fix if appropriate.')}>Debug last run</button>}</div>}
      {messages.map((item) => <article key={item.id} className={`ai-message ai-message--${item.role}`}><span>{item.role === 'user' ? 'You' : 'GLM'}</span><p>{item.content}</p>{item.diagnosis && <small><b>Diagnosis:</b> {item.diagnosis}</small>}{item.replacementCode && <div className="ai-fix"><pre>{item.replacementCode}</pre>{item.verification?.passed ? <button onClick={() => onApplyCode(item.replacementCode)}><CheckCircle2 size={15} /> Apply verified fix</button> : <em>{item.verification?.error || 'Not auto-applicable because it did not pass all verified tests.'}</em>}</div>}</article>)}
      {busy && <div className="ai-chat__thinking"><LoaderCircle className="spin" size={16} /> GLM is inspecting the problem, code, and tests…</div>}{error && <div className="ai-error">{error}</div>}
    </div>
    <form onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={aiStatus?.configured ? 'Ask GLM to debug your code…' : 'Configure FIREWORKS_API_KEY first'} disabled={!problem || !aiStatus?.configured || busy} /><button type="submit" onClick={() => undefined} disabled={!message.trim() || busy} aria-label="Send message"><Send size={16} /></button></form>
  </aside>;
}
