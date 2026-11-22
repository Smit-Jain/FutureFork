import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, FileText, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { api, isMockMode } from '../api/client';
import { AgeBand, TaxInputs, TaxProfile, TaxReport, TaxYearInfo, TaxpayerType } from '../contracts/types';
import { useAuth } from '../auth/AuthProvider';
import { LogoMark } from '../landing/Chrome';
import { ModuleSwitch } from '../components/ModuleSwitch';
import { MoneyField } from '../components/tax/MoneyField';
import { TaxVerdict } from '../components/tax/TaxVerdict';
import { RegimeSideBySide } from '../components/tax/RegimeSideBySide';
import { SavingMoves } from '../components/tax/SavingMoves';
import { FilingGuide } from '../components/tax/FilingGuide';
import { SavedReturnsDrawer } from '../components/tax/SavedReturnsDrawer';
import {
  DEDUCTION_GROUPS,
  EMPTY_INPUTS,
  FieldGroup,
  INCOME_GROUPS,
  TYPE_INFO,
  hasAnyIncome,
  visibleFields,
} from '../tax/fields';

const STEPS = ['About you', 'Income', 'Deductions & tax paid'] as const;

const AGE: { v: AgeBand; label: string }[] = [
  { v: 'below_60', label: 'Under 60' },
  { v: '60_to_80', label: '60 to 79' },
  { v: 'above_80', label: '80 or older' },
];

const Toggle: React.FC<{ label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }> = ({
  label,
  hint,
  checked,
  onChange,
}) => (
  <label className="flex items-start gap-3 cursor-pointer select-none">
    <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span
      aria-hidden="true"
      className={`mt-0.5 w-9 h-5 shrink-0 border border-ink relative transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 ${checked ? 'bg-ink' : 'bg-paper-2'}`}
    >
      <span className={`absolute top-[2px] w-3.5 h-3.5 transition-all ${checked ? 'left-[18px] bg-paper' : 'left-[2px] bg-ink'}`} />
    </span>
    <span>
      <span className="text-[14px]">{label}</span>
      {hint && <span className="block text-[12px] text-ink-dim">{hint}</span>}
    </span>
  </label>
);

const Section: React.FC<{ n: string; title: string; hint?: string; children: React.ReactNode; id?: string }> = ({ n, title, hint, children, id }) => (
  <section id={id} className="space-y-5 animate-in scroll-mt-20">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink pb-3">
      <div className="flex items-baseline gap-4">
        <span className="font-mono text-xs text-ink-dim">{n}</span>
        <h2 className="text-3xl sm:text-4xl tracking-tight leading-none">{title}</h2>
      </div>
      {hint && <span className="label hidden md:inline">{hint}</span>}
    </div>
    {children}
  </section>
);

const TaxWorkspace: React.FC = () => {
  const { user, signOut } = useAuth();
  const [params, setParams] = useSearchParams();
  const [inputs, setInputs] = useState<TaxInputs>(EMPTY_INPUTS);
  const [years, setYears] = useState<TaxYearInfo[]>([]);
  const [step, setStep] = useState(0);
  const [live, setLive] = useState<TaxReport | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const [saved, setSaved] = useState<TaxProfile | null>(null);
  const [savedInputs, setSavedInputs] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'ITR helper · FutureFork';
    api.taxRules().then((r) => setYears(r.years)).catch(() => undefined);
  }, []);

  const rules = useMemo(() => years.find((y) => y.fy === inputs.fy) ?? null, [years, inputs.fy]);
  const set = useCallback(<K extends keyof TaxInputs>(k: K, v: TaxInputs[K]) => setInputs((p) => ({ ...p, [k]: v })), []);

  // Live estimate: engine numbers, debounced, no AI and nothing saved
  useEffect(() => {
    if (!hasAnyIncome(inputs)) {
      setLive(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setComputing(true);
      api
        .taxCompute(inputs, ctl.signal)
        .then((r) => {
          setLive(r);
          setLiveError(null);
        })
        .catch((e: Error) => e.name !== 'AbortError' && setLiveError(e.message))
        .finally(() => setComputing(false));
    }, 350);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [inputs]);

  const openProfile = useCallback(
    async (id: string) => {
      setDrawer(false);
      try {
        const p = await api.taxProfile(id);
        setInputs({ ...EMPTY_INPUTS, ...p.inputs });
        setSaved(p);
        setSavedInputs(JSON.stringify({ ...EMPTY_INPUTS, ...p.inputs }));
        setStep(2);
        setParams({ profile: id }, { replace: true });
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Could not open that return');
      }
    },
    [setParams],
  );

  useEffect(() => {
    const id = params.get('profile');
    if (id && !saved) openProfile(id);
    // only on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stale = saved !== null && savedInputs !== JSON.stringify(inputs);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const p = await api.saveTaxProfile(inputs, saved?.id, saved?.label);
      setSaved(p);
      setSavedInputs(JSON.stringify(inputs));
      setParams({ profile: p.id }, { replace: true });
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not prepare the guide');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setInputs(EMPTY_INPUTS);
    setSaved(null);
    setSavedInputs(null);
    setStep(0);
    setParams({}, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exportJson = async () => {
    if (!saved) return;
    const blob = await api.exportTaxProfile(saved.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `futurefork-itr-${saved.report?.ay ?? 'summary'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderGroups = (groups: FieldGroup[]) =>
    groups.map((g) => {
      const fields = visibleFields(g, inputs);
      if (!fields.length) return null;
      return (
        <fieldset key={g.title} className="space-y-4 border-t border-ink-line pt-5 first:border-t-0 first:pt-0">
          <legend className="sr-only">{g.title}</legend>
          <div>
            <h3 className="text-xl tracking-tight">{g.title}</h3>
            {g.blurb && <p className="text-[13px] text-ink-dim mt-1">{g.blurb}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
            {fields.map((f) => (
              <MoneyField
                key={f.key}
                label={f.label}
                hint={f.hint}
                where={f.where}
                value={inputs[f.key]}
                cap={rules && f.cap ? f.cap(rules, inputs) : null}
                onChange={(v) => set(f.key, v)}
              />
            ))}
          </div>
          {g.title === 'Salary' && (
            <Toggle
              label="I live in Delhi, Mumbai, Kolkata or Chennai"
              hint="Raises the HRA exemption from 40% to 50% of basic pay"
              checked={inputs.metro_city}
              onChange={(v) => set('metro_city', v)}
            />
          )}
          {g.title === 'Investments and insurance' && (
            <Toggle
              label="My parents are 60 or older"
              hint="Their health-insurance limit goes up to ₹50,000"
              checked={inputs.parents_senior}
              onChange={(v) => set('parents_senior', v)}
            />
          )}
        </fieldset>
      );
    });

  const report = saved?.report ?? null;

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur-md border-b border-ink-line print:hidden">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 h-[52px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="FutureFork home">
              <LogoMark />
              <span className="hidden md:inline text-[18px] font-medium tracking-[0.01em]">FUTUREFORK</span>
            </Link>
            <ModuleSwitch />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {isMockMode && <span className="label text-warn border border-warn px-1.5 py-0.5">Mock mode</span>}
            <button
              onClick={() => setDrawer(true)}
              className="h-8 px-3 border border-ink-faint hover:border-ink font-mono text-[11px] uppercase tracking-[0.06em] flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Saved returns</span>
            </button>
            <button onClick={reset} className="h-8 px-3 border border-ink font-mono text-[11px] uppercase tracking-[0.06em] hover:bg-ink hover:text-paper transition-colors">
              New
            </button>
            {user && (
              <button onClick={signOut} title={`Sign out ${user.email}`} aria-label="Sign out" className="h-8 w-8 border border-ink-faint hover:border-ink flex items-center justify-center">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1320px] mx-auto px-4 sm:px-6 py-10 space-y-16">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] items-end gap-6 animate-in print:hidden">
          <div>
            <span className="label">ITR helper · FY {inputs.fy} (AY {rules?.ay ?? '…'})</span>
            <h1 className="mt-3 text-5xl sm:text-7xl tracking-[-0.03em] leading-[0.95]">
              Your tax return,
              <br />
              <span className="relative inline-block grad-border px-3 -ml-3">in plain words.</span>
            </h1>
          </div>
          <p className="max-w-sm text-ink-2 leading-relaxed">
            Answer a few questions. FutureFork compares the old and new regimes, picks your ITR form and tells you exactly what to
            type on the e-filing portal. Every rupee comes from the tax engine, never from the AI.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-8 items-start print:hidden">
          {/* ── Wizard ── */}
          <div className="border border-ink bg-paper-2/40">
            <ol className="grid grid-cols-3 border-b border-ink" aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s} className="border-r border-ink-line last:border-r-0">
                  <button
                    onClick={() => setStep(i)}
                    aria-current={step === i ? 'step' : undefined}
                    className={`w-full h-12 px-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.05em] text-left ${step === i ? 'bg-ink text-paper' : 'text-ink-dim hover:text-ink'}`}
                  >
                    <span className={`w-4 h-4 shrink-0 flex items-center justify-center text-[9px] border ${step === i ? 'border-paper' : 'border-current'}`}>{i + 1}</span>
                    <span className="truncate">{s}</span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="p-5 sm:p-7 space-y-7">
              {step === 0 && (
                <>
                  <div className="space-y-3">
                    <span className="label">How do you earn?</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="How do you earn">
                      {(Object.keys(TYPE_INFO) as TaxpayerType[]).map((t) => (
                        <button
                          key={t}
                          role="radio"
                          aria-checked={inputs.taxpayer_type === t}
                          onClick={() => set('taxpayer_type', t)}
                          className={`text-left border p-4 space-y-1.5 transition-colors ${inputs.taxpayer_type === t ? 'border-ink bg-paper-2 shadow-[3px_3px_0_0_#141414]' : 'border-ink-line hover:border-ink'}`}
                        >
                          <span className="block text-[16px]">{TYPE_INFO[t].title}</span>
                          <span className="block text-[12.5px] text-ink-dim leading-snug">{TYPE_INFO[t].blurb}</span>
                          <span className="block label text-[9.5px]">{TYPE_INFO[t].form}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <span className="label">Your age on 31 March</span>
                      <div className="flex border border-ink-line" role="radiogroup" aria-label="Age">
                        {AGE.map((a) => (
                          <button
                            key={a.v}
                            role="radio"
                            aria-checked={inputs.age_band === a.v}
                            onClick={() => set('age_band', a.v)}
                            className={`flex-1 h-10 text-[13px] border-r border-ink-line last:border-r-0 ${inputs.age_band === a.v ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="label" htmlFor="fy">
                        Financial year
                      </label>
                      <select id="fy" value={inputs.fy} onChange={(e) => set('fy', e.target.value)} className="field w-full h-10">
                        {(years.length ? years : [{ fy: '2025-26', ay: '2026-27', status: 'filing' } as TaxYearInfo]).map((y) => (
                          <option key={y.fy} value={y.fy}>
                            FY {y.fy} (AY {y.ay}) · {y.status === 'filing' ? 'file now' : 'plan ahead'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <Toggle
                    label="I lived in India for 182 days or more"
                    hint="Turn off if you're a non-resident (NRI): you'll need ITR-2 and the 87A rebate doesn't apply"
                    checked={inputs.resident}
                    onChange={(v) => set('resident', v)}
                  />
                </>
              )}

              {step === 1 && renderGroups(INCOME_GROUPS)}
              {step === 2 && renderGroups(DEDUCTION_GROUPS)}

              <div className="flex items-center justify-between gap-3 border-t border-ink-line pt-5">
                <button
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                  className="h-10 px-4 border border-ink-faint hover:border-ink disabled:opacity-30 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                {step < 2 ? (
                  <button
                    onClick={() => setStep((s) => s + 1)}
                    className="h-10 px-5 border border-ink bg-ink text-paper flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em]"
                  >
                    Next <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={save}
                    disabled={saving || !hasAnyIncome(inputs)}
                    className="ff-cta h-11 px-5 border border-ink bg-ink text-paper flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] disabled:opacity-40"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : stale ? <RefreshCw className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                    {saving ? 'Preparing…' : stale ? 'Update my guide' : saved ? 'Saved · view guide' : 'Get my filing guide'}
                  </button>
                )}
              </div>
              {saveError && (
                <p role="alert" className="text-sm text-bad">
                  {saveError}
                </p>
              )}
            </div>
          </div>

          {/* ── Live estimate ── */}
          <aside className="lg:sticky lg:top-20 space-y-3">
            {live ? (
              <TaxVerdict report={live} live />
            ) : (
              <div className="border border-dashed border-ink-faint p-6 space-y-2">
                <span className="label">Live estimate</span>
                <p className="text-ink-2 leading-relaxed">
                  {liveError ?? 'Start typing your income and your tax under both regimes appears here, recalculated as you go.'}
                </p>
              </div>
            )}
            <span className="label text-[10px] flex items-center gap-1.5">
              {computing && <Loader2 className="w-3 h-3 animate-spin" />}
              {computing ? 'Recalculating…' : live ? 'Up to date' : ''}
            </span>
          </aside>
        </div>

        {report && (
          <div ref={resultsRef} className="space-y-16 scroll-mt-20">
            {stale && (
              <p className="border-l-2 border-warn bg-warn/5 px-3 py-2 text-sm print:hidden">
                You changed some answers. The guide below is for your last saved version; press <strong>Update my guide</strong> to refresh it.
              </p>
            )}
            <Section n="01" title="Your answer" hint="Explained, then checked">
              <TaxVerdict report={report} />
            </Section>
            <Section n="02" title="Old vs new regime" hint="Same income, both rulebooks">
              <RegimeSideBySide report={report} />
            </Section>
            <Section n="03" title="Pay less next year" hint="Each move recomputed by the engine">
              <SavingMoves savings={report.savings} />
            </Section>
            <Section n="04" title="File it, step by step" hint={`${report.form.name} · e-filing portal`}>
              <FilingGuide checklist={report.checklist} onExport={exportJson} />
            </Section>
          </div>
        )}
      </main>

      <SavedReturnsDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        onOpen={openProfile}
        currentId={saved?.id}
        onDeleted={(id) => id === saved?.id && reset()}
      />

      <footer className="border-t border-ink-line mt-8 print:hidden">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 label">
          <span>FutureFork · ITR helper · guidance, not a filed return</span>
          <span>Tax engine · Numeric Guard</span>
        </div>
      </footer>
    </div>
  );
};

export default TaxWorkspace;
