import { TaxInputs, TaxpayerType, TaxYearInfo } from '../contracts/types';
import { parseAmountInput } from '../decide/parseDecision';

/** ₹1,52,980 — full Indian grouping, the way the e-filing portal shows amounts. */
export const inr = (v: number) => `${v < 0 ? '−' : ''}₹${Math.round(Math.abs(v)).toLocaleString('en-IN')}`;

/** Accepts "12L", "1.2 lakh", "75k", "1,20,000". Empty → 0. */
export const parseMoney = (s: string): number | null => {
  const t = s.trim();
  if (!t) return 0;
  const plain = t.replace(/[,₹\s]/g, '');
  if (/^\d+(\.\d+)?$/.test(plain)) return Number(plain);
  return parseAmountInput(t);
};

export type MoneyKey = {
  [K in keyof TaxInputs]: TaxInputs[K] extends number ? K : never;
}[keyof TaxInputs];

export interface MoneyFieldDef {
  key: MoneyKey;
  label: string;
  hint: string;
  /** Where to find the number (Form 16, AIS, broker statement…) */
  where?: string;
  cap?: (r: TaxYearInfo, i: TaxInputs) => number | null;
  show?: (i: TaxInputs) => boolean;
}

export interface FieldGroup {
  title: string;
  blurb?: string;
  show?: (i: TaxInputs) => boolean;
  fields: MoneyFieldDef[];
}

export const EMPTY_INPUTS: TaxInputs = {
  fy: '2025-26',
  taxpayer_type: 'salaried',
  age_band: 'below_60',
  resident: true,
  basic_da: 0,
  hra_received: 0,
  other_salary: 0,
  employer_nps: 0,
  professional_tax: 0,
  rent_paid: 0,
  metro_city: false,
  gross_receipts: 0,
  digital_receipts: 0,
  declared_profit: 0,
  home_loan_interest: 0,
  let_out_rent: 0,
  let_out_municipal_tax: 0,
  let_out_loan_interest: 0,
  savings_interest: 0,
  deposit_interest: 0,
  dividends: 0,
  other_income: 0,
  stcg_111a: 0,
  ltcg_112a: 0,
  d_80c: 0,
  d_80ccd1b: 0,
  d_80d_self: 0,
  d_80d_parents: 0,
  parents_senior: false,
  d_80e: 0,
  tds: 0,
  tcs: 0,
  advance_tax: 0,
};

export const TYPE_INFO: Record<TaxpayerType, { title: string; blurb: string; form: string }> = {
  salaried: { title: 'Salaried', blurb: 'You get a Form 16 from an employer. Pension counts too.', form: 'Usually ITR-1 or ITR-2' },
  freelancer: {
    title: 'Freelancer / professional',
    blurb: 'Consultants, designers, developers, doctors… paid on invoices. Taxed on 50% of receipts (44ADA).',
    form: 'Usually ITR-4',
  },
  business: {
    title: 'Small business',
    blurb: 'A shop or trading business. Taxed on 6% of digital and 8% of cash turnover (44AD).',
    form: 'Usually ITR-4',
  },
};

const isSalaried = (i: TaxInputs) => i.taxpayer_type === 'salaried' || i.basic_da + i.other_salary > 0;

export const INCOME_GROUPS: FieldGroup[] = [
  {
    title: 'Salary',
    blurb: 'Copy these from Form 16 Part B (or add up your payslips for the year).',
    show: (i) => i.taxpayer_type === 'salaried',
    fields: [
      { key: 'basic_da', label: 'Basic pay + DA', hint: 'For the whole year', where: 'Form 16 Part B · salary breakup' },
      { key: 'hra_received', label: 'HRA received', hint: 'House rent allowance paid by your employer', where: 'Form 16 Part B' },
      { key: 'other_salary', label: 'Everything else in salary', hint: 'Special allowance, bonus, LTA, perquisites', where: 'Gross salary − basic − HRA' },
      { key: 'employer_nps', label: "Employer's NPS contribution", hint: 'Leave 0 if your employer doesn’t put money into NPS for you', where: 'Form 16 · 80CCD(2)' },
      { key: 'professional_tax', label: 'Professional tax', hint: 'Usually ₹2,500 or less, deducted from salary', where: 'Form 16 Part B · 16(iii)' },
      { key: 'rent_paid', label: 'Rent you paid', hint: 'Total for the year, for the HRA exemption (old regime)' },
    ],
  },
  {
    title: 'Your practice or business',
    blurb: 'Total money received for your work during the year, before expenses.',
    show: (i) => i.taxpayer_type !== 'salaried',
    fields: [
      { key: 'gross_receipts', label: 'Total receipts', hint: 'All invoices paid in the year', where: 'Your bank statements · Form 26AS' },
      {
        key: 'digital_receipts',
        label: 'Of which received by bank / UPI',
        hint: 'If at least 95% came digitally, higher presumptive limits apply',
      },
      {
        key: 'declared_profit',
        label: 'Profit you want to declare (optional)',
        hint: 'Leave 0 to use the presumptive rate. You can declare more, never less.',
      },
    ],
  },
  {
    title: 'Interest, dividends and other income',
    blurb: 'Your AIS lists all of these. Open it on the e-filing portal if unsure.',
    fields: [
      { key: 'savings_interest', label: 'Savings account interest', hint: 'All bank accounts together', where: 'AIS · SFT-005' },
      { key: 'deposit_interest', label: 'FD / RD / post-office interest', hint: 'Interest earned, even if not withdrawn', where: 'AIS · interest from deposits' },
      { key: 'dividends', label: 'Dividends', hint: 'From shares and mutual funds', where: 'AIS · dividend' },
      { key: 'other_income', label: 'Any other income', hint: 'Gifts above ₹50,000, family pension, etc.' },
    ],
  },
  {
    title: 'House property',
    blurb: 'Skip this if you don’t own a home or rent one out.',
    fields: [
      { key: 'home_loan_interest', label: 'Home-loan interest (home you live in)', hint: 'Old regime only, up to ₹2 lakh', where: 'Bank interest certificate', cap: (r) => r.cap_24b },
      { key: 'let_out_rent', label: 'Rent received (home you rent out)', hint: 'For the whole year' },
      { key: 'let_out_municipal_tax', label: 'Property tax paid on it', hint: 'Municipal tax you paid this year', show: (i) => i.let_out_rent > 0 },
      { key: 'let_out_loan_interest', label: 'Loan interest on the rented home', hint: 'Interest certificate from the bank', show: (i) => i.let_out_rent > 0 },
    ],
  },
  {
    title: 'Shares and equity mutual funds',
    blurb: 'Gains when you sold. Your broker’s capital-gains report has both numbers.',
    fields: [
      { key: 'stcg_111a', label: 'Short-term gains (held ≤ 1 year)', hint: 'Taxed at 20%', where: 'Broker P&L · STCG 111A' },
      { key: 'ltcg_112a', label: 'Long-term gains (held > 1 year)', hint: 'First ₹1.25 lakh is tax-free; rest at 12.5%', where: 'Broker P&L · LTCG 112A' },
    ],
  },
];

export const DEDUCTION_GROUPS: FieldGroup[] = [
  {
    title: 'Investments and insurance',
    blurb: 'These only count in the old regime. We compare both regimes for you anyway.',
    fields: [
      {
        key: 'd_80c',
        label: '80C: EPF, PPF, ELSS, LIC, home-loan principal, tuition fees',
        hint: 'Add them all up; your EPF share is on your payslip',
        where: 'Form 16 · Chapter VI-A',
        cap: (r) => r.cap_80c,
      },
      { key: 'd_80ccd1b', label: 'Your own NPS (extra, 80CCD(1B))', hint: 'Beyond the 80C limit', cap: (r) => r.cap_80ccd1b },
      {
        key: 'd_80d_self',
        label: 'Health insurance: you, spouse, children (80D)',
        hint: 'Premiums paid this year',
        cap: (r, i) => (i.age_band === 'below_60' ? r.cap_80d_self : r.cap_80d_self_senior),
      },
      {
        key: 'd_80d_parents',
        label: "Health insurance: parents (80D)",
        hint: 'Premiums you paid for your parents',
        cap: (r, i) => (i.parents_senior ? r.cap_80d_parents_senior : r.cap_80d_parents),
      },
      { key: 'd_80e', label: 'Education-loan interest (80E)', hint: 'No upper limit' },
    ],
  },
  {
    title: 'Tax already paid',
    blurb: 'Form 26AS shows every rupee of TDS deducted on your PAN. Match it exactly.',
    fields: [
      { key: 'tds', label: 'TDS (tax deducted at source)', hint: 'Salary TDS + bank TDS + client TDS', where: 'Form 26AS · Part I' },
      { key: 'advance_tax', label: 'Advance / self-assessment tax paid', hint: 'Challans you paid yourself', where: 'Form 26AS · Part III' },
      { key: 'tcs', label: 'TCS (tax collected at source)', hint: 'E.g. on foreign remittances or a car purchase', where: 'Form 26AS · Part VI' },
    ],
  },
];

export const visibleFields = (group: FieldGroup, i: TaxInputs) =>
  group.show && !group.show(i) ? [] : group.fields.filter((f) => !f.show || f.show(i));

export const hasAnyIncome = (i: TaxInputs) =>
  i.basic_da + i.hra_received + i.other_salary + i.gross_receipts + i.savings_interest + i.deposit_interest + i.dividends +
    i.other_income + i.let_out_rent + i.stcg_111a + i.ltcg_112a >
  0;

export { isSalaried };
