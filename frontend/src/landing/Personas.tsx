import React from 'react';
import { Persona } from './content';

/** Small inline-SVG avatars for the use cases: drawn shapes, not photos of real people. */
export const PersonaAvatar: React.FC<{ persona: Persona }> = ({ persona }) => (
  <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
    {/* brick wall backdrop */}
    <rect width="56" height="56" fill="#e3ddd3" />
    {Array.from({ length: 7 }, (_, r) =>
      Array.from({ length: 4 }, (_, c) => (
        <rect
          key={`${r}-${c}`}
          x={c * 16 - (r % 2 ? 8 : 0)}
          y={r * 8}
          width="15"
          height="7"
          fill={(r + c) % 3 === 0 ? '#d9cfc2' : '#ddd5ca'}
        />
      )),
    )}
    {persona === 'person' && (
      <g>
        <circle cx="28" cy="22" r="8" fill="#141414" />
        <path d="M12 56c1-11 8-17 16-17s15 6 16 17z" fill="#141414" />
        <rect x="18" y="42" width="20" height="12" rx="1.5" fill="#efece6" stroke="#141414" />
      </g>
    )}
    {persona === 'institute' && (
      <g fill="#141414">
        <path d="M8 24 28 12l20 12z" />
        <rect x="11" y="26" width="34" height="3" />
        {[13, 21, 29, 37].map((x) => (
          <rect key={x} x={x} y="30" width="5" height="16" />
        ))}
        <rect x="9" y="47" width="38" height="4" />
      </g>
    )}
    {persona === 'startup' && (
      <g>
        <rect x="9" y="12" width="38" height="32" rx="2" fill="#141414" />
        <path d="M14 36l8-8 6 5 13-13" fill="none" stroke="#ff8a3d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="22" y="45" width="12" height="5" fill="#141414" />
        <rect x="16" y="50" width="24" height="3" fill="#141414" />
      </g>
    )}
  </svg>
);

/** Flat robot used when WebGL is unavailable or the scene fails to start. */
export const RobotFallback: React.FC = () => (
  <svg className="ff-robot-fallback" viewBox="0 0 240 300" aria-hidden="true">
    <defs>
      <linearGradient id="ff-fb-ring" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffb347" />
        <stop offset=".5" stopColor="#ff5a5f" />
        <stop offset="1" stopColor="#ff3d8b" />
      </linearGradient>
    </defs>
    <rect x="70" y="250" width="100" height="50" fill="#2a2928" />
    <rect x="88" y="200" width="26" height="50" rx="8" fill="#eeebe6" stroke="#cfc9bf" />
    <rect x="126" y="200" width="26" height="50" rx="8" fill="#eeebe6" stroke="#cfc9bf" />
    <rect x="72" y="130" width="96" height="80" rx="20" fill="#eeebe6" stroke="#cfc9bf" />
    <circle cx="104" cy="160" r="4" fill="#ff8a3d" />
    <circle cx="120" cy="160" r="4" fill="#ff5a5f" />
    <circle cx="136" cy="160" r="4" fill="#ff3d8b" />
    <rect x="50" y="138" width="20" height="58" rx="9" fill="#eeebe6" stroke="#cfc9bf" />
    <rect x="170" y="138" width="20" height="58" rx="9" fill="#eeebe6" stroke="#cfc9bf" />
    <rect x="110" y="116" width="20" height="16" fill="#1b1b1f" />
    <g transform="rotate(-8 120 70)">
      <rect x="56" y="10" width="128" height="112" rx="20" fill="#eeebe6" stroke="#cfc9bf" />
      <rect x="66" y="20" width="108" height="92" rx="22" fill="url(#ff-fb-ring)" />
      <rect x="78" y="31" width="84" height="70" rx="14" fill="#0f0f12" />
      <ellipse cx="104" cy="67" rx="7" ry="9" fill="#fff" />
      <ellipse cx="134" cy="64" rx="7" ry="9" fill="#fff" />
    </g>
  </svg>
);
