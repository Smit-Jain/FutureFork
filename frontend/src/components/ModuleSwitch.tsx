import React from 'react';
import { NavLink } from 'react-router-dom';

/** Switch between the two FutureFork tools. */
export const ModuleSwitch: React.FC = () => (
  <nav aria-label="Tools" className="flex items-stretch h-8 border border-ink-line">
    {[
      { to: '/app', label: 'Money forks', short: 'Forks' },
      { to: '/app/tax', label: 'ITR helper', short: 'ITR' },
    ].map((m) => (
      <NavLink
        key={m.to}
        to={m.to}
        end
        className={({ isActive }) =>
          `px-3 flex items-center font-mono text-[11px] uppercase tracking-[0.06em] transition-colors ${
            isActive ? 'bg-ink text-paper' : 'text-ink-dim hover:text-ink'
          }`
        }
      >
        <span className="hidden sm:inline">{m.label}</span>
        <span className="sm:hidden">{m.short}</span>
      </NavLink>
    ))}
  </nav>
);
