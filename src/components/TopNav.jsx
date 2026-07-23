import {
  ChevronLeft, ChevronRight, Flame, FlaskConical, List, Shuffle,
} from 'lucide-react';

export default function TopNav({ compact, problem, streak, onHome, onDaily, onPrevious, onNext, onRandom }) {
  return (
    <header className="topnav">
      <div className="topnav__left">
        <button className="brand" onClick={onHome} aria-label="Open problem list">
          <span className="brand__mark"><span>〈</span><i>●</i><span>〉</span></span>
          {!compact && <span className="brand__name">Code<span>Lab</span></span>}
        </button>
        {!compact && (
          <nav className="main-links" aria-label="Main navigation">
            <button className="main-links__active" onClick={onHome}>Problems</button>
          </nav>
        )}
        {compact && problem && (
          <div className="problem-nav">
            <button onClick={onHome} title="All problems"><List size={17} /> Problem List</button>
            <span className="nav-divider" />
            <button className="icon-button" onClick={onPrevious} title="Previous problem"><ChevronLeft size={19} /></button>
            <button className="icon-button" onClick={onNext} title="Next problem"><ChevronRight size={19} /></button>
            <button className="problem-title-button" onClick={onHome} title="Return to the problem list">{problem.id}. {problem.title}</button>
          </div>
        )}
      </div>
      <div className="topnav__right">
        {compact && <button className="icon-button" onClick={onRandom} title="Open a random problem"><Shuffle size={17} /></button>}
        <button className="daily-button" onClick={onDaily} title="Open today's deterministic daily problem"><FlaskConical size={16} /> Daily Challenge</button>
        <span className="streak" title={`${streak}-day practice streak`}><Flame size={18} /><span>{streak}</span></span>
        <span className="avatar" title="Local profile">C</span>
      </div>
    </header>
  );
}
