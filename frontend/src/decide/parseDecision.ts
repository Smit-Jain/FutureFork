/**
 * Client-side preview parser for the decision workbench.
 *
 * It only powers live chips and the pre-flight bar while typing. The server's parser
 * (ai/agents/parser.py) is authoritative: edits made through chips are written back into the
 * prompt text, so the engine always receives exactly what the user sees.
 */

export type Cadence = 'one_time' | 'monthly' | 'yearly';
export type DecisionTag = 'CAPEX' | 'HIRING' | 'RECURRING' | 'STRESS';

export interface Span {
  start: number;
  end: number;
}

export interface AmountToken extends Span {
  value: number;
  raw: string;
  unit: string;
}

export interface Detected {
  spend: AmountToken | null;
  floor: (AmountToken & { clauseStart: number }) | null;
  cadence: Cadence;
  cadenceSpan: Span | null; // phrase like "per month"; null when implied (e.g. LPA) or absent
  percent: { value: number; span: Span } | null;
  quantity: number | null;
  kind: 'one_time' | 'recurring' | 'income';
  tag: DecisionTag;
}

const UNIT: Record<string, number> = {
  cr: 1e7, crore: 1e7, crores: 1e7,
  l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, lpa: 1e5,
  million: 1e6, mn: 1e6,
  k: 1e3, thousand: 1e3, hazar: 1e3, hazaar: 1e3, hajar: 1e3,
};

const AMOUNT_RE =
  /(₹\s?|rs\.?\s?|inr\s?)?(\d[\d,]*(?:\.\d+)?)\s?(crores?|cr|lakhs?|lacs?|lpa|l|k|thousand|hazaa?r|hajar|million|mn)?(?![\w%])/gi;

const FLOOR_BEFORE =
  /(without\s+(?:going|dropping|falling|dipping|getting)\s+(?:below|under|beneath)|(?:not|never|don'?t)\s+(?:go|drop|fall|dip)\s+(?:below|under)|stay(?:ing)?\s+above|keep(?:ing)?(?:\s+at\s+least|\s+a\s+minimum\s+of|\s+minimum)?|maintain(?:ing)?|leav(?:e|ing)|protect(?:ing)?|at\s+least|min(?:imum)?(?:\s+balance)?(?:\s+of)?|(?:reserve|buffer|floor|cushion)\s+of|kam\s+se\s+kam)\s*(?:a\s+|an\s+|my\s+|our\s+|the\s+)?$/i;
const FLOOR_AFTER = /^\s*(?:in\s+)?(?:the\s+)?(?:treasury\s+)?(?:reserve|buffer|cushion|floor|minimum|emergency|savings|in\s+the\s+bank|in\s+bank|bank\s+mein|rehna|rakhna)/i;

const MONTHLY_AFTER = /^\s*(?:\/\s*(?:month|mo)\b|per\s+month|a\s+month|every\s+month|monthly|p\.?m\.?(?=\W|$))/i;
const YEARLY_AFTER = /^\s*(?:\/\s*(?:year|yr)\b|per\s+(?:year|annum)|a\s+year|every\s+year|yearly|annually|p\.?a\.?(?=\W|$))/i;
const MONTHLY_ANY = /(?:\/\s*(?:month|mo)\b|\bper\s+month\b|\bevery\s+month\b|\bmonthly\b|\bsubscription\b)/i;
const YEARLY_ANY = /(?:\/\s*(?:year|yr)\b|\bper\s+(?:year|annum)\b|\byearly\b|\bannually\b)/i;

const QTY_RE =
  /\b(\d+)\s+(?:[a-z-]+\s+){0,2}?(engineers?|developers?|designers?|people|employees?|staff|faculty|teachers?|interns?|hires?|pcs?|laptops?|computers?|servers?|units?|machines?|seats?|licen[cs]es?|gpus?)\b/i;
const INCOME_WORDS = /\b(salary|income|revenue|sales|fees?|collections?|earnings|pay|mrr|inflows?)\b/i;
const DROP_WORDS = /\b(drops?|falls?|fall|cut|cuts|decline|declines|loss|lose|loses|down|reduce|reduces|dip|dips)\b/i;
const HIRING_WORDS = /\b(hire|hiring|recruit|engineers?|developers?|faculty|teachers?|staff|employees?|interns?)\b/i;

function amountTokens(text: string): AmountToken[] {
  const out: AmountToken[] = [];
  AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const [raw, cur, num, unitRaw] = m;
    const unit = (unitRaw || '').toLowerCase();
    if (!cur && !unit) continue; // a bare number ("12-month", "40 PCs") isn't money
    const base = parseFloat(num.replace(/,/g, ''));
    if (!isFinite(base)) continue;
    out.push({ start: m.index, end: m.index + raw.length, value: base * (UNIT[unit] ?? 1), raw, unit });
  }
  return out;
}

function tagFor(kind: Detected['kind'], text: string, cadence: Cadence): DecisionTag {
  if (kind === 'income') return 'STRESS';
  if (HIRING_WORDS.test(text)) return 'HIRING';
  if (cadence !== 'one_time') return 'RECURRING';
  return 'CAPEX';
}

export function detect(text: string): Detected {
  const amounts = amountTokens(text);
  let floor: Detected['floor'] = null;
  let spend: AmountToken | null = null;

  for (const a of amounts) {
    const before = text.slice(Math.max(0, a.start - 48), a.start);
    const after = text.slice(a.end, a.end + 32);
    const fb = before.match(FLOOR_BEFORE);
    if (!floor && (fb || FLOOR_AFTER.test(after))) {
      floor = { ...a, clauseStart: fb ? a.start - fb[0].length : a.start };
    } else if (!spend) {
      spend = a;
    }
  }

  // Cadence: a phrase right after the spend wins, then LPA, then anywhere in the text
  let cadence: Cadence = 'one_time';
  let cadenceSpan: Span | null = null;
  if (spend) {
    const after = text.slice(spend.end);
    const mm = after.match(MONTHLY_AFTER);
    const ym = after.match(YEARLY_AFTER);
    if (mm) {
      cadence = 'monthly';
      cadenceSpan = { start: spend.end, end: spend.end + mm[0].length };
    } else if (ym) {
      cadence = 'yearly';
      cadenceSpan = { start: spend.end, end: spend.end + ym[0].length };
    } else if (spend.unit === 'lpa') {
      cadence = 'yearly';
    }
  }
  if (cadence === 'one_time') {
    const m = MONTHLY_ANY.exec(text);
    const y = YEARLY_ANY.exec(text);
    if (m) {
      cadence = 'monthly';
      cadenceSpan = /subscription/i.test(m[0]) ? null : { start: m.index, end: m.index + m[0].length };
    } else if (y) {
      cadence = 'yearly';
      cadenceSpan = { start: y.index, end: y.index + y[0].length };
    }
  }

  const pm = /(\d+(?:\.\d+)?)\s?%/.exec(text);
  const percent = pm ? { value: parseFloat(pm[1]), span: { start: pm.index, end: pm.index + pm[0].length } } : null;
  const isIncome = !!percent && INCOME_WORDS.test(text) && DROP_WORDS.test(text);

  const qm = QTY_RE.exec(text);
  const quantity = qm && /\beach\b/i.test(text) ? parseInt(qm[1], 10) : null;

  const kind: Detected['kind'] = isIncome ? 'income' : cadence !== 'one_time' ? 'recurring' : 'one_time';
  return { spend, floor, cadence, cadenceSpan, percent, quantity, kind, tag: tagFor(kind, text, cadence) };
}

/** Compact Indian amount that the server parser understands: ₹1.5Cr, ₹60L, ₹1.2L, ₹30k, ₹900. */
export function formatAmount(v: number): string {
  const a = Math.abs(v);
  const trim = (x: number) => (Math.round(x * 100) / 100).toString();
  if (a >= 1e7) return `₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `₹${trim(a / 1e5)}L`;
  if (a >= 1e3) return `₹${trim(a / 1e3)}k`;
  return `₹${Math.round(a)}`;
}

/** Parses what a user types into a chip: "60L", "₹1.2 lakh", "30k", "250000". */
export function parseAmountInput(s: string): number | null {
  const t = amountTokens(/^\s*[₹]|rs/i.test(s) ? s : `₹${s.trim()}`);
  return t.length ? t[0].value : null;
}

/** Total cash the decision needs over the 12-month horizon, from the preview parse. */
export function decisionImpact(d: Detected): number {
  if (!d.spend) return 0;
  const qty = d.quantity && d.quantity > 1 ? d.quantity : 1;
  const per = d.spend.value * qty;
  if (d.cadence === 'monthly') return per * 12;
  return per; // one-time, or a yearly amount over a 12-month horizon
}

// ─── Text edits (chips → prompt) ──────────────────────────────────────────────

const splice = (text: string, span: Span, insert: string) => text.slice(0, span.start) + insert + text.slice(span.end);

export function withSpend(text: string, d: Detected, value: number): string {
  if (!d.spend) return `${text.trim()} ${formatAmount(value)}`.trim();
  const keepYearly = d.spend.unit === 'lpa' && !d.cadenceSpan ? '/year' : '';
  return splice(text, d.spend, formatAmount(value) + keepYearly);
}

export function withFloor(text: string, d: Detected, value: number): string {
  if (d.floor) {
    if (value <= 0) {
      // drop the whole clause, plus a leading comma / "and"
      let start = d.floor.clauseStart;
      const lead = text.slice(0, start).match(/(?:\s*,\s*|\s+and\s+|\s+)$/i);
      if (lead) start -= lead[0].length;
      const tail = text.slice(d.floor.end).match(FLOOR_AFTER);
      return (text.slice(0, start) + text.slice(d.floor.end + (tail ? tail[0].length : 0))).replace(/\s{2,}/g, ' ').trim();
    }
    return splice(text, d.floor, formatAmount(value));
  }
  if (value <= 0) return text;
  return `${text.trim().replace(/[.\s]+$/, '')}, keep at least ${formatAmount(value)}`;
}

export function withCadence(text: string, d: Detected, cadence: Cadence): string {
  if (!d.spend || cadence === d.cadence) return text;
  let t = text;
  let spendEnd = d.spend.end;
  if (d.cadenceSpan) {
    t = splice(t, d.cadenceSpan, '');
    if (d.cadenceSpan.start < spendEnd) spendEnd -= d.cadenceSpan.end - d.cadenceSpan.start;
  }
  if (d.spend.unit === 'lpa' && cadence !== 'yearly') {
    // "20LPA" → "20L" so the yearly meaning goes away
    const lp = t.slice(d.spend.start, spendEnd).replace(/lpa$/i, 'L');
    t = t.slice(0, d.spend.start) + lp + t.slice(spendEnd);
    spendEnd = d.spend.start + lp.length;
  }
  const suffix = cadence === 'monthly' ? '/month' : cadence === 'yearly' ? '/year' : '';
  return (t.slice(0, spendEnd) + suffix + t.slice(spendEnd)).replace(/\s{2,}/g, ' ');
}

export const CADENCE_LABEL: Record<Cadence, string> = { one_time: 'One-time', monthly: 'Monthly', yearly: 'Yearly' };
