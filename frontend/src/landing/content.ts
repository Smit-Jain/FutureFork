// Landing page copy. Prompts and descriptions only: every result number comes from running them in /app.

export const INTRO_PROMPTS = [
  'Buy a car for ₹8L without dropping below ₹1L.',
  'Hire 2 engineers at 20L/yr each from June.',
  'What if my salary drops 20% for 6 months?',
  'Mujhe agle mahine 80 hazar ka phone lena hai.',
];

/** Which sample dataset each intro prompt runs against. */
export const INTRO_DATASETS = ['sample_personal', 'sample_startup', 'sample_personal', 'sample_personal'];

export interface Step {
  n: string;
  title: string;
  body: string;
}

/** How It Works: the three steps of the workflow. */
export const HOW_STEPS: Step[] = [
  { n: '01', title: 'Upload a statement', body: 'Bank or UPI export, ERP ledger or P&L, as CSV or Excel. FutureFork maps the columns and builds a 12-month baseline.' },
  { n: '02', title: 'Ask a question', body: 'Describe a purchase, a hire, a subscription or an income change in plain English or Hinglish.' },
  { n: '03', title: 'Compare the forks', body: 'Each strategy is solved, stress-tested and explained, so you can pick the one that keeps you safe.' },
];

/** The engine behind it (moved out of the hero). */
export const CAPABILITIES: { name: string; detail: string }[] = [
  { name: 'CP-SAT optimisation', detail: 'Google OR-Tools picks the safest month, split or trim for every fork.' },
  { name: 'Monte Carlo stress tests', detail: '300 simulated futures per fork: late income, surprise bills, rising costs.' },
  { name: 'AI explanations', detail: 'Plain-language verdicts, with every number checked by the Numeric Guard.' },
];

export interface ForkTab {
  label: string;
  kind: string;
  desc: string;
}

/** The carousel. The last tab repeats the first so the loop can snap back invisibly. */
export const FORK_TABS: ForkTab[] = [
  { label: 'Upfront Purchase', kind: 'One-time cost', desc: 'Pay in full, zero interest, in the safest month the solver can find.' },
  { label: 'EMI Financing', kind: 'One-time cost', desc: 'Spread the cost into instalments; long loans use a reducing-balance EMI.' },
  { label: 'Phased Purchase', kind: 'One-time cost', desc: 'Split into two tranches to smooth the hit to your balance.' },
  { label: 'Trim & Buy', kind: 'One-time cost', desc: 'Buy on time and cut only flexible spending, just enough to protect your floor.' },
  { label: 'Commit As Planned', kind: 'Recurring cost', desc: 'Take on the monthly cost from the planned month, no other changes.' },
  { label: 'Delay the Start', kind: 'Recurring cost', desc: 'Start at the earliest month that keeps you above the emergency floor.' },
  { label: 'Phase It In', kind: 'Recurring cost', desc: 'Start at half the amount for three months, then the full cost.' },
  { label: 'Ride It Out', kind: 'Income change', desc: 'Keep spending as it is and let your balance absorb the change.' },
  { label: 'Crisis Playground', kind: 'Every fork', desc: 'Late income, a surprise bill, rising costs: re-test every plan live.' },
  { label: 'Upfront Purchase', kind: 'One-time cost', desc: 'Pay in full, zero interest, in the safest month the solver can find.' },
];

export type Persona = 'person' | 'institute' | 'startup';

export interface UseCase {
  dataset: string;
  persona: Persona;
  name: string;
  role: string;
  question: string;
  /** Prompt sent to the engine when the visitor runs the case. */
  prompt: string;
  /** Opens a different tool instead of the fork workspace. */
  href?: string;
  cta?: string;
}

export const CASES: UseCase[] = [
  {
    dataset: '',
    persona: 'person',
    name: 'ITR helper',
    role: 'Salaried or freelancer · FY 2025-26',
    question: 'Old regime or new, which ITR form, and what exactly do I type on the e-filing portal?',
    prompt: '',
    href: '/app/tax',
    cta: 'Open the ITR helper',
  },
  {
    dataset: 'sample_personal',
    persona: 'person',
    name: 'Personal UPI statement',
    role: 'Individual · 12 months of UPI',
    question: 'Can I buy a ₹1.2L laptop next month and still keep ₹50k in the bank?',
    prompt: 'Buy a laptop for 1.2 lakh next month, keep at least 50k',
  },
  {
    dataset: 'sample_institute',
    persona: 'institute',
    name: 'Institute ERP ledger',
    role: 'College · operating ledger',
    question: 'Should we buy 40 GPU lab PCs for ₹60L, and how, without touching the ₹25L reserve?',
    prompt: 'Buy 40 GPU lab PCs for ₹60L without dropping below ₹25L treasury reserve',
  },
  {
    dataset: 'sample_startup',
    persona: 'startup',
    name: 'Startup P&L',
    role: 'Seed-stage startup · burn',
    question: 'What happens to our runway if revenue falls 30% for three months?',
    prompt: 'What if revenue falls 30% for 3 months?',
  },
];

export const appLink = (dataset: string, prompt?: string) => {
  const q = new URLSearchParams({ demo: dataset });
  if (prompt) q.set('prompt', prompt);
  return `/app?${q.toString()}`;
};
