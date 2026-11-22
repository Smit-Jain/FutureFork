import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { appLink } from './content';
import { useAuth } from '../auth/AuthProvider';

/** The C-mark: a rounded square open on the right, stroked with the brand gradient, with two eyes. */
export const LogoMark: React.FC<{ size?: number }> = ({ size = 27 }) => (
  <svg width={size} height={size} viewBox="0 0 27 27" aria-hidden="true">
    <defs>
      <linearGradient id="ff-logo-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ff8a3d" />
        <stop offset=".55" stopColor="#ff5a5f" />
        <stop offset="1" stopColor="#ff3d8b" />
      </linearGradient>
    </defs>
    <path d="M22 2.5H8A5.5 5.5 0 0 0 2.5 8v11A5.5 5.5 0 0 0 8 24.5h14" fill="none" stroke="url(#ff-logo-g)" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="10.5" cy="13.5" r="1.9" fill="#141414" />
    <circle cx="17" cy="13.5" r="1.9" fill="#141414" />
  </svg>
);

export const TopBar: React.FC<{ hidden: boolean; onClose: () => void }> = ({ hidden, onClose }) => (
  <div className={`ff-topbar ${hidden ? 'is-hidden' : ''}`} role="region" aria-label="Announcement">
    <Link to={appLink('sample_personal')}>
      <b>New</b> · Crisis Playground<span className="long">: stress-test every plan in real time</span> ↗
    </Link>
    <button className="ff-topbar-x" onClick={onClose} aria-label="Dismiss announcement">
      ×
    </button>
  </div>
);

const MENU: { label: string; href: string; external?: boolean }[] = [
  { label: 'How it works', href: '#how' },
  { label: 'Use cases', href: '#cases' },
  { label: 'Docs', href: 'https://github.com/Smit-Jain/FutureFork#readme', external: true },
];

export const Nav: React.FC<{ atTop: boolean }> = ({ atTop }) => {
  const { user } = useAuth();
  return (
  <nav className={`ff-nav ${atTop ? 'is-top' : ''}`} aria-label="Main">
    <Link to="/" className="ff-logo" aria-label="FutureFork home">
      <LogoMark />
      <span>FUTUREFORK</span>
    </Link>
    <div className="ff-menu">
      {MENU.map((m) => (
        <a key={m.label} href={m.href} {...(m.external ? { target: '_blank', rel: 'noreferrer' } : {})}>
          {m.label}
          {m.external && <span className="ext" aria-hidden="true"> ↗</span>}
        </a>
      ))}
    </div>
    <div className="ff-launch-cell">
      {user ? (
        <Link to="/app" className="ff-account" title={user.email} aria-label="Open your workspace">
          {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : (user.name || user.email).slice(0, 1)}
        </Link>
      ) : (
        user === null && (
          <Link to="/signin?next=%2Fapp" className="ff-signin">
            Sign in
          </Link>
        )
      )}
      <Link to="/app" className="ff-launch">
        <span className="ff-dots">••</span> Launch FutureFork
      </Link>
    </div>
  </nav>
  );
};

export const RAIL_LABELS = ['Intro', 'How it works', 'Forks', 'Cases'];

/** Subtle section indicator: one tick per section; only the active one shows its label. */
export const Rail: React.FC<{ active: number; onJump: (i: number) => void }> = ({ active, onJump }) => (
  <nav className="ff-rail" aria-label="Sections">
    {RAIL_LABELS.map((label, i) => (
      <button
        key={label}
        className={`ff-rail-item ${i === active ? 'is-active' : ''}`}
        onClick={() => onJump(i)}
        aria-label={`Go to ${label}`}
        aria-current={i === active ? 'true' : undefined}
      >
        <span className="ff-rail-label">{label}</span>
        <span className="ff-rail-tick" />
      </button>
    ))}
  </nav>
);

/** Scroll state for the chrome: hide the top bar once the page passes 40px. */
export function useScrolledPast(px: number) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const on = () => setPast(window.scrollY > px);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [px]);
  return past;
}
