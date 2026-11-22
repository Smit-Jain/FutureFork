import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from '../components/fx/useReducedMotion';
import { Nav, Rail, TopBar, useScrolledPast } from '../landing/Chrome';
import { CasesSection, ForksSection, HowItWorksSection, IntroSection } from '../landing/Sections';
import { appLink } from '../landing/content';
import { RobotCanvas } from '../landing/robot/RobotCanvas';
import { useSectionObserver } from '../landing/useSectionObserver';
import '../landing/landing.css';

const Landing: React.FC = () => {
  const reduced = useReducedMotion();
  const scrolled = useScrolledPast(40);
  const [barClosed, setBarClosed] = useState(false);
  const barHidden = scrolled || barClosed;

  const intro = useRef<HTMLElement>(null);
  const how = useRef<HTMLElement>(null);
  const forks = useRef<HTMLElement>(null);
  const cases = useRef<HTMLElement>(null);
  const sections = [intro, how, forks, cases];
  const { entered, active } = useSectionObserver(sections);

  useEffect(() => {
    document.title = 'FutureFork · Fork Your Future';
  }, []);

  const jump = (i: number) =>
    sections[i].current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });

  return (
    <div className="ff-landing">
      <div className="ff-guides" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <RobotCanvas reduced={reduced} />

      <TopBar hidden={barHidden} onClose={() => setBarClosed(true)} />
      <Nav atTop={barHidden} />
      <Rail active={active} onJump={jump} />

      <main className="ff-content">
        <IntroSection ref={intro} entered={entered[0]} reduced={reduced} />
        <HowItWorksSection ref={how} entered={entered[1]} reduced={reduced} />
        <ForksSection ref={forks} entered={entered[2]} reduced={reduced} />
        <CasesSection ref={cases} entered={entered[3]} reduced={reduced} />
        <footer className="ff-footer">
          <span>FutureFork · 2026</span>
          <nav aria-label="Footer">
            <Link to="/app">Workspace</Link>
            <Link to={appLink('sample_personal')}>Try a sample</Link>
            <a href="https://github.com/Smit-Jain/FutureFork" target="_blank" rel="noreferrer">GitHub</a>
            <a href="https://github.com/Smit-Jain/FutureFork/issues" target="_blank" rel="noreferrer">Contact</a>
            <a href="#intro">Back to top ↑</a>
          </nav>
        </footer>
      </main>
    </div>
  );
};

export default Landing;
