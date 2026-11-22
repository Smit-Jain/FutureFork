import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { AuthConfig } from '../contracts/types';
import { useAuth } from '../auth/AuthProvider';
import { LogoMark } from '../landing/Chrome';

/* Minimal typing for Google Identity Services (https://accounts.google.com/gsi/client) */
interface GsiCredentialResponse {
  credential: string;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: { client_id: string; callback: (r: GsiCredentialResponse) => void; ux_mode?: 'popup' | 'redirect'; auto_select?: boolean }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
  if (existing) return new Promise((res, rej) => {
    existing.addEventListener('load', () => res());
    existing.addEventListener('error', () => rej(new Error('Could not load Google Sign-In')));
  });
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error('Could not load Google Sign-In. Check your connection or ad blocker.'));
    document.head.appendChild(s);
  });
}

/** Only same-site paths are allowed as a post-login destination. */
const safeNext = (raw: string | null) => (raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/app');

const SignIn: React.FC = () => {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Sign in · FutureFork';
  }, []);

  // Already signed in: continue
  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  useEffect(() => {
    api.authConfig().then(setConfig).catch(() => setError('Could not reach the FutureFork server. Is the backend running?'));
  }, []);

  // Render the Google button once the client ID is known
  useEffect(() => {
    if (!config?.google_client_id || !buttonRef.current) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !window.google || !buttonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: config.google_client_id!,
          ux_mode: 'popup',
          callback: async ({ credential }) => {
            setBusy(true);
            setError(null);
            try {
              setUser(await api.signInWithGoogle(credential));
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Sign-in failed');
            } finally {
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text: 'continue_with',
          logo_alignment: 'left',
          width: 320,
        });
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [config?.google_client_id, setUser]);

  const devLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      setUser(await api.devLogin());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dev login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <header className="h-[52px] border-b border-ink-line flex items-center px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5" aria-label="FutureFork home">
          <LogoMark />
          <span className="text-[18px] font-medium tracking-[0.01em]">FUTUREFORK</span>
        </Link>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2">
        <section className="hidden lg:flex flex-col justify-end p-12 border-r border-ink-line bg-grid-paper">
          <span className="label">Your decisions, saved</span>
          <h1 className="mt-4 text-6xl tracking-[-0.03em] leading-[0.95]">
            Sign in to
            <br />
            <span className="relative inline-block grad-border px-3 -ml-3">keep your forks.</span>
          </h1>
          <p className="mt-6 max-w-md text-ink-2 leading-relaxed">
            Every decision you run is saved to your account, so you can reopen the comparison, re-test it in the Crisis
            Playground, or pick up where you left off.
          </p>
        </section>

        <section className="flex items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-6">
            <div>
              <span className="label">Step 00 · Account</span>
              <h2 className="mt-2 text-3xl tracking-tight">Welcome to FutureFork</h2>
              <p className="mt-2 text-sm text-ink-dim">Use your Google account. We only read your name, email and photo.</p>
            </div>

            <div className="relative brackets border border-ink bg-paper-2 p-5 space-y-4">
              {!config && !error && (
                <div className="flex items-center gap-2 label">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading sign-in…
                </div>
              )}
              {config?.google_client_id ? (
                <div className="min-h-[44px] flex justify-center" aria-busy={busy}>
                  <div ref={buttonRef} />
                </div>
              ) : (
                config && (
                  <p className="text-sm border-l-2 border-warn bg-warn/5 px-3 py-2">
                    Google Sign-In isn't configured on this server yet. Set <code className="font-mono text-[12px]">GOOGLE_CLIENT_ID</code> in
                    the backend <code className="font-mono text-[12px]">.env</code>.
                  </p>
                )
              )}

              {config?.dev_login && (
                <div className="space-y-2 border-t border-ink-line pt-4">
                  <span className="label text-[10px] block">Development only</span>
                  <button
                    type="button"
                    onClick={devLogin}
                    disabled={busy}
                    className="w-full h-10 border border-ink font-mono text-[11px] uppercase tracking-[0.06em] hover:bg-ink hover:text-paper transition-colors disabled:opacity-40"
                  >
                    {busy ? 'Signing in…' : 'Continue as local developer'}
                  </button>
                </div>
              )}

              {error && (
                <p role="alert" className="flex items-start gap-2 text-sm text-bad">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                </p>
              )}
            </div>

            <p className="label text-[10px] leading-relaxed">
              By continuing you agree that your decisions and uploaded data are stored in your FutureFork account.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};

export default SignIn;
