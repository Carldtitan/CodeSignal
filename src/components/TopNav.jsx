import {
  Bell, ChevronLeft, ChevronRight, Flame, FlaskConical, List, Play, Shuffle,
} from 'lucide-react';

export default function TopNav({ compact, problem, onHome, onPrevious, onNext, onRandom }) {
  return (
    <header className="topnav">
      <div className="topnav__left">
        <button className="brand" onClick={onHome} aria-label="Open problem list">
          <span className="brand__mark"><span>〈</span><i>●</i><span>〉</span></span>
          {!compact && <span className="brand__name">Code<span>Lab</span></span>}
        </button>
        {!compact && (
          <nav className="main-links" aria-label="Main navigation">
            <button className="main-links__active">Explore</button>
            <button onClick={onHome}>Problems</button>
            <button>Interview</button>
            <button>Discuss</button>
          </nav>
        )}
        {compact && problem && (
          <div className="problem-nav">
            <button onClick={onHome} title="All problems"><List size={17} /> Problem List</button>
            <span className="nav-divider" />
            <button className="icon-button" onClick={onPrevious} title="Previous problem"><ChevronLeft size={19} /></button>
            <button className="icon-button" onClick={onNext} title="Next problem"><ChevronRight size={19} /></button>
            <button className="problem-title-button" onClick={onHome}>{problem.id}. {problem.title}</button>
          </div>
        )}
      </div>
      <div className="topnav__right">
        {compact && <button className="icon-button" onClick={onRandom} title="Random problem"><Shuffle size={17} /></button>}
        {!compact && <button className="daily-button"><FlaskConical size={16} /> Daily Challenge</button>}
        <button className="streak"><Flame size={18} /><span>0</span></button>
        <button className="icon-button"><Bell size={17} /></button>
        <span className="avatar">C</span>
        <button className="premium">Premium</button>
      </div>
    </header>
  );
}
