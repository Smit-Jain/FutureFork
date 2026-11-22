import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CAPABILITIES, CASES, FORK_TABS, HOW_STEPS, INTRO_DATASETS, INTRO_PROMPTS, appLink } from './content';
import { PersonaAvatar } from './Personas';
import { usePromptTyper } from './usePromptTyper';

const Brackets = () => (
  <>
    <i className="b tl" />
    <i className="b tr" />
    <i className="b bl" />
    <i className="b br" />
  </>
);

interface SectionProps {
  entered: boolean;
  reduced: boolean;
}

// ─── Intro ───────────────────────────────────────────────────────────────────
// One focal point (the robot) and one stack on the bottom-left: prompt pill → headline → subtitle → CTA.

export const IntroSection = forwardRef<HTMLElement, SectionProps>(({ entered, reduced }, ref) => {
  const { text, index } = usePromptTyper(INTRO_PROMPTS, reduced);
  const dataset = INTRO_DATASETS[index] ?? 'sample_personal';

  return (
    <section ref={ref} id="intro" className={`ff-section ff-intro ${entered ? 'is-in' : ''}`} aria-label="Intro">
      <div className="ff-hero">
        <div className="ff-pill rv d1" aria-live="polite">
          <span className="ff-pill-q" aria-hidden="true">“</span>
          <span className="ff-pill-text">{text}</span>
          <span className="ff-caret" aria-hidden="true" />
        </div>

        <h1 className="ff-hero-title">
          <span className="ff-hbox cut rv d2">Fork Your</span>
          <span className="ff-hbox amber rv d3">Future</span>
        </h1>

        <p className="ff-hero-sub rv d3">Your personal strategist for every big money decision, tested against your own numbers.</p>

        <Link className="ff-cta rv d4" to={appLink(dataset, INTRO_PROMPTS[index])}>
          <span className="ff-dots">••</span> Try it on sample data
        </Link>
      </div>

      <a className="ff-scroll ff-brk rv d4" href="#how">
        <Brackets />
        Scroll <span className="arrow">↓</span>
      </a>
    </section>
  );
});
IntroSection.displayName = 'IntroSection';

// ─── How it works ────────────────────────────────────────────────────────────

export const HowItWorksSection = forwardRef<HTMLElement, SectionProps>(({ entered }, ref) => (
  <section ref={ref} id="how" className={`ff-section ff-how ${entered ? 'is-in' : ''}`} aria-label="How it works">
    <div className="ff-how-inner">
      <div className="ff-how-head rv d1">
        <span className="ff-mono ff-eyebrow">How it works</span>
        <h2>
          Three steps, <span className="ff-hbox-inline">engine-checked</span>
        </h2>
      </div>

      <ol className="ff-steps rv d2">
        {HOW_STEPS.map((st) => (
          <li key={st.n}>
            <span className="ff-step-n">{st.n}</span>
            <div>
              <h3>{st.title}</h3>
              <p>{st.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <ul className="ff-caps rv d3" aria-label="Under the hood">
        {CAPABILITIES.map((c) => (
          <li key={c.name}>
            <span className="ff-mono">{c.name}</span>
            <span>{c.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  </section>
));
HowItWorksSection.displayName = 'HowItWorksSection';

// ─── Forks (product) ─────────────────────────────────────────────────────────

const STEP_MS = 2400;
const SLIDE_MS = 900;

export const ForksSection = forwardRef<HTMLElement, SectionProps>(({ entered, reduced }, ref) => {
  const [active, setActive] = useState(0);
  const [animate, setAnimate] = useState(true);
  const last = FORK_TABS.length - 1;

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      setAnimate(true);
      setActive((a) => Math.min(a + 1, last));
    }, STEP_MS);
    return () => clearInterval(t);
  }, [reduced, last]);

  // The last tab repeats the first: once we slide onto it, snap back to 0 without a transition.
  useEffect(() => {
    if (active !== last) return;
    const t = setTimeout(() => {
      setAnimate(false);
      setActive(0);
    }, SLIDE_MS + 40);
    return () => clearTimeout(t);
  }, [active, last]);

  const current = FORK_TABS[active];

  return (
    <section ref={ref} id="forks" className={`ff-section ${entered ? 'is-in' : ''}`} aria-label="Forks">
      <div className="ff-tabs rv d1">
        <div
          className={`ff-tabs-track ${animate ? 'anim' : ''}`}
          style={{ transform: `translateX(calc(${-active} * 33vw))` }}
        >
          {FORK_TABS.map((tab, i) => (
            <div
              key={`${tab.label}-${i}`}
              className={`ff-tab ${i === active ? 'is-active' : ''} ${i < active ? 'is-past' : ''}`}
              aria-hidden={i !== active}
            >
              <div className="ff-tab-inner ff-brk">
                <Brackets />
                <span className="ff-tab-num">{String((i % last) + 1).padStart(2, '0')}</span>
                <span className="ff-tab-label">{tab.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="ff-tab-desc rv d2" aria-live="polite">
        <b>{current.kind}</b> · {current.desc}
      </p>

      <div className="ff-gateway">
        <span className="dots rv d2">··</span>
        <span className="line rv d3" style={{ display: 'block' }}>
          <span className="boxed">Every Decision</span>
        </span>
        <span className="line rv d3" style={{ display: 'block' }}>Has Forks</span>
        <Link to="/app" className="open rv d4">
          Open the workspace ↗
        </Link>
      </div>
    </section>
  );
});
ForksSection.displayName = 'ForksSection';

// ─── Cases (reviews layout) ──────────────────────────────────────────────────

export const CasesSection = forwardRef<HTMLElement, SectionProps>(({ entered, reduced }, ref) => {
  const [i, setI] = useState(0);
  const [out, setOut] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const go = (dir: 1 | -1) => {
    if (out) return;
    const nextI = (i + dir + CASES.length) % CASES.length;
    if (reduced) {
      setI(nextI);
      return;
    }
    setOut(true);
    timer.current = setTimeout(() => {
      setI(nextI);
      setOut(false);
    }, 450);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const c = CASES[i];
  const ghost = CASES[(i + 1) % CASES.length];

  return (
    <section ref={ref} id="cases" className={`ff-section ${entered ? 'is-in' : ''}`} aria-label="Use cases">
      <div className="ff-case-head rv d1">
        <div className="ff-case-tag">
          Case
          <span className="num ff-brk">
            <Brackets />
            {String(i + 1).padStart(2, '0')}
          </span>
        </div>
        <div className="ff-avatar">
          <PersonaAvatar persona={c.persona} />
        </div>
        <div className={`ff-case-who ${out ? 'ff-swap-out' : ''}`}>
          <span className="ff-case-name">{c.name}</span>
          <span className="ff-case-role">{c.role}</span>
        </div>
      </div>

      <div className={`ff-quote rv d2 ${out ? 'ff-swap-out' : ''}`} aria-live="polite">
        <p>“{c.question}</p>
        <Link className="ff-try" to={appLink(c.dataset, c.prompt)}>
          Try for yourself
          <br />
          (Run this case)
        </Link>
      </div>

      <div className="ff-ghost" aria-hidden="true">
        “{ghost.question}
      </div>

      <div className="ff-arrows rv d3">
        <button onClick={() => go(-1)} aria-label="Previous case">←</button>
        <button onClick={() => go(1)} aria-label="Next case">→</button>
        <span className="ff-case-count">
          {String(i + 1).padStart(2, '0')} / {String(CASES.length).padStart(2, '0')}
        </span>
      </div>
    </section>
  );
});
CasesSection.displayName = 'CasesSection';
