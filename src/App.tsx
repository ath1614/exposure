import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Grade, Report } from './core/analyze';
import { useBurnProgress, useReducedMotion, useReveal } from './lib/motion';

const REPO = 'https://github.com/ath1614/exposure';
const STAGES = [
  'reading the response headers',
  'counting the origins',
  'checking the cookies',
  'weighing the ledger',
];

const SUGGESTIONS = ['stripe.com', 'github.com', 'news.ycombinator.com'];

interface RecentScan {
  id: string;
  host: string;
  score: number;
  grade: Grade;
  at: number;
}

interface ApiError {
  error?: { code?: string; message?: string };
}

function gradeClass(grade: Grade): string {
  if (grade === 'A' || grade === 'B') return 'good';
  if (grade === 'C' || grade === 'D') return 'warn';
  return 'bad';
}

function relative(timestamp: number): string {
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Gauge({ score, grade }: { score: number; grade: Grade }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? score : 0);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    if (reduced) {
      setShown(score);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1100);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(score * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score, reduced]);

  return (
    <div className={`gauge grade-${gradeClass(grade)}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} className="gauge-track" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          className="gauge-fill"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: circumference - (shown / 100) * circumference,
          }}
        />
      </svg>
      <div className="gauge-centre">
        <span className="gauge-score">{shown}</span>
        <span className="gauge-of">of 100</span>
      </div>
    </div>
  );
}

function Chip({ grade }: { grade: Grade }) {
  return <span className={`chip grade-${gradeClass(grade)}`}>{grade}</span>;
}

function ReportView({ report, id }: { report: Report; id: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/r/${id}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const origins = report.origins.slice(0, 14);

  return (
    <div className="report">
      <div className="report-head">
        <div className="report-id">
          <p className="mono-label">Report / {id}</p>
          <h3 className="report-host">{report.host}</h3>
          <p className="report-url">
            <span>{report.finalUrl}</span>
            <span className="report-status">HTTP {report.status}</span>
          </p>
          <p className="report-when">
            read {new Date(report.fetchedAt).toLocaleString()} · {(report.bytes / 1024).toFixed(1)} kB
            {report.title ? ` · “${report.title}”` : ''}
          </p>
        </div>
        <div className="report-score">
          <Gauge score={report.score} grade={report.grade} />
          <div className="report-grade">
            <span className={`grade-letter grade-${gradeClass(report.grade)}`}>{report.grade}</span>
            <span className="mono-label">weighted exposure</span>
          </div>
        </div>
      </div>

      {report.notes.length > 0 && (
        <ul className="report-notes">
          {report.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <dl className="report-counts">
        <div><dt>third-party origins</dt><dd>{report.counts.thirdParty}</dd></div>
        <div><dt>trackers</dt><dd>{report.counts.trackers}</dd></div>
        <div><dt>cookies</dt><dd>{report.counts.cookies}</dd></div>
        <div><dt>cookies without Secure</dt><dd>{report.counts.insecureCookies}</dd></div>
        <div><dt>credentials</dt><dd>{report.counts.secrets}</dd></div>
        <div><dt>headers missing</dt><dd>{report.counts.missingHeaders}</dd></div>
      </dl>

      <div className="report-grid">
        <section className="report-block ledger-block">
          <h4>Why this grade</h4>
          {report.deductions.length === 0 ? (
            <p className="report-empty">Nothing came off. The response is clean by this ledger.</p>
          ) : (
            <ul className="deductions">
              {report.deductions.map((item) => (
                <li key={item.id}>
                  <span className="deduct-points">−{item.points}</span>
                  <span>
                    <b>{item.label}</b>
                    <em>{item.detail}</em>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="report-total">
            <span>100 − {100 - report.score}</span>
            <strong>{report.score}</strong>
          </p>
        </section>

        <section className="report-block">
          <h4>Origins on first load</h4>
          {origins.length === 0 ? (
            <p className="report-empty">Every asset came from the page's own origin.</p>
          ) : (
            <ul className="origins">
              {origins.map((origin) => (
                <li key={origin.origin}>
                  <span className="origin-kind">{origin.kind}</span>
                  <span className="origin-host">{origin.host}</span>
                  {origin.vendor && <span className="origin-vendor">{origin.vendor}</span>}
                </li>
              ))}
            </ul>
          )}
          {report.origins.length > origins.length && (
            <p className="report-more">+{report.origins.length - origins.length} more</p>
          )}
        </section>

        <section className="report-block">
          <h4>Headers</h4>
          <ul className="headers">
            {report.headers.map((header) => (
              <li key={header.id} className={header.present ? 'is-present' : 'is-missing'}>
                <span className="header-mark" aria-hidden="true">
                  {header.present ? '✓' : '✕'}
                </span>
                <span className="header-name">{header.header}</span>
                <span className="header-value">{header.value ?? header.note}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="report-block">
          <h4>Cookies set on first response</h4>
          {report.cookies.length === 0 ? (
            <p className="report-empty">No Set-Cookie header on the first response.</p>
          ) : (
            <table className="cookies">
              <thead>
                <tr>
                  <th scope="col">name</th>
                  <th scope="col">secure</th>
                  <th scope="col">samesite</th>
                  <th scope="col">httponly</th>
                </tr>
              </thead>
              <tbody>
                {report.cookies.map((cookie) => (
                  <tr key={cookie.name}>
                    <td>{cookie.name}</td>
                    <td>{cookie.secure ? 'yes' : 'no'}</td>
                    <td>{cookie.sameSite}</td>
                    <td>{cookie.httpOnly ? 'yes' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="report-block">
          <h4>Credentials in the source</h4>
          {report.secrets.length === 0 ? (
            <p className="report-empty">No key-shaped string matched. That is not proof there is none.</p>
          ) : (
            <ul className="secrets">
              {report.secrets.map((secret) => (
                <li key={secret.kind}>
                  <b>{secret.kind}</b>
                  <span>
                    {secret.where} · {secret.length} characters. The value is never stored.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="report-block">
          <h4>Where forms post</h4>
          {report.forms.length === 0 ? (
            <p className="report-empty">No form with an action in the markup.</p>
          ) : (
            <ul className="forms">
              {report.forms.map((form) => (
                <li key={form.action}>
                  <span className={form.secure ? 'form-secure' : 'form-insecure'}>
                    {form.secure ? 'https' : 'http'}
                  </span>
                  <span>{form.origin}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="report-share">
        <code>{link}</code>
        <button type="button" className="btn btn-ink btn-small" onClick={copy}>
          {copied ? 'Copied' : 'Copy report link'}
        </button>
      </div>
    </div>
  );
}

function App() {
  useReveal();
  const burnRef = useBurnProgress<HTMLElement>();
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [stage, setStage] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const shouldScroll = useRef(false);

  useEffect(() => {
    if (status !== 'loading') return;
    setStage(0);
    const id = setInterval(() => setStage((current) => Math.min(STAGES.length - 1, current + 1)), 900);
    return () => clearInterval(id);
  }, [status]);

  const loadRecent = useCallback(async () => {
    try {
      const response = await fetch('/api/recent');
      if (!response.ok) return;
      const data = (await response.json()) as { scans?: RecentScan[] };
      setRecent(data.scans ?? []);
    } catch {
      /* the report is the point; the sidebar can stay empty */
    }
  }, []);

  useEffect(() => {
    void loadRecent();
    const shared =
      new URLSearchParams(location.search).get('r') ??
      location.pathname.match(/^\/r\/([0-9a-z]{6,16})$/)?.[1];
    if (!shared) return;
    setStatus('loading');
    fetch(`/api/report/${shared}`)
      .then(async (response) => {
        const data = (await response.json()) as { id?: string; report?: Report } & ApiError;
        if (!response.ok || !data.report) {
          throw new Error(data.error?.message ?? 'That report could not be loaded.');
        }
        setReport(data.report);
        setReportId(data.id ?? shared);
        setUrl(data.report.requestedUrl);
        shouldScroll.current = true;
        setStatus('ready');
      })
      .catch((cause: Error) => {
        setStatus('error');
        setError({ code: 'report', message: cause.message });
      });
  }, [loadRecent]);

  useEffect(() => {
    if (status !== 'ready' || !shouldScroll.current) return;
    shouldScroll.current = false;
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [status]);

  const run = async (value: string) => {
    const query = value.trim();
    if (!query) {
      inputRef.current?.focus();
      return;
    }
    setStatus('loading');
    setError(null);
    setReport(null);
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: query }),
      });
      const data = (await response.json()) as { id?: string; report?: Report } & ApiError;
      if (!response.ok || !data.report || !data.id) {
        throw Object.assign(new Error(data.error?.message ?? 'The scan failed.'), {
          code: data.error?.code ?? 'scan',
        });
      }
      setReport(data.report);
      setReportId(data.id);
      setStatus('ready');
      shouldScroll.current = true;
      history.replaceState(null, '', `/r/${data.id}`);
      void loadRecent();
    } catch (cause) {
      const err = cause as Error & { code?: string };
      setError({ code: err.code ?? 'network', message: err.message });
      setStatus('error');
    }
  };

  const ledger = useMemo(
    () => [
      { label: 'Credentials in the source', points: 45, note: 'one key is enough' },
      { label: 'Trackers on first load', points: 20, note: '4 each, capped' },
      { label: 'Third-party scripts', points: 16, note: '2 each, capped' },
      { label: 'Forms posting over http', points: 20, note: '10 each, capped' },
      { label: 'Cookies missing Secure', points: 12, note: '3 each, capped' },
      { label: 'Cookies missing SameSite', points: 8, note: '2 each, capped' },
      { label: 'Content-Security-Policy', points: 8, note: 'missing' },
      { label: 'Strict-Transport-Security', points: 5, note: 'missing' },
      { label: 'Frame protection', points: 5, note: 'missing' },
      { label: 'Referrer-Policy', points: 3, note: 'missing' },
      { label: 'Permissions-Policy', points: 3, note: 'missing' },
      { label: 'X-Content-Type-Options', points: 2, note: 'missing' },
    ],
    [],
  );

  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>

      <section className="hero" ref={burnRef}>
        <div className="hero-grain" aria-hidden="true" />
        <header className="top">
          <a className="brand" href="/" aria-label="Exposure, home">
            <span className="brand-eye" aria-hidden="true" />
            <span className="brand-word">exposure</span>
          </a>
          <nav className="nav" aria-label="Sections">
            <a href="#read">What it reads</a>
            <a href="#ledger">Ledger</a>
            <a href="#limits">Limits</a>
            <a href={REPO} target="_blank" rel="noreferrer">Source</a>
          </nav>
          <span className="top-meta">one fetch / one report</span>
        </header>

        <div className="hero-body">
          <p className="kicker">URL audit · no account · public pages only</p>
          <h1 className="hero-title">
            <span className="line"><span>Every page</span></span>
            <span className="line"><span>has a tell.</span></span>
          </h1>
          <p className="hero-sub">
            Exposure fetches a URL the way a stranger would, then reads what it hands over:
            third-party scripts, tracker pixels, cookies, missing headers, and keys left in the
            markup. One request. One report.
          </p>

          <form
            className="scan-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(url);
            }}
          >
            <label className="sr-only" htmlFor="scan-url">
              URL to read
            </label>
            <span className="scan-prefix" aria-hidden="true">https://</span>
            <input
              id="scan-url"
              ref={inputRef}
              name="url"
              type="text"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              placeholder="your-store.com"
              value={url.replace(/^https?:\/\//, '')}
              onChange={(event) => setUrl(event.target.value)}
            />
            <button type="submit" className="btn btn-ink" disabled={status === 'loading'}>
              {status === 'loading' ? 'Reading…' : 'Read the page'}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <div className="hero-foot">
            <ul className="suggest">
              {SUGGESTIONS.map((host) => (
                <li key={host}>
                  <button
                    type="button"
                    onClick={() => {
                      setUrl(host);
                      void run(host);
                    }}
                  >
                    {host}
                  </button>
                </li>
              ))}
            </ul>
            <p className="hero-meta">500 kB cap · reports are addressable by link</p>
          </div>
        </div>

        <div className="hero-facts" aria-hidden="true">
          <span>csp</span>
          <span>samesite</span>
          <span>frame-ancestors</span>
          <span>hsts</span>
          <span>nosniff</span>
        </div>
      </section>

      <main id="main">
        <section className="section scanner" id="scan" aria-labelledby="scan-title">
          <div className="section-head">
            <p className="index">01 / The report</p>
            <h2 id="scan-title">
              One URL in.
              <br />
              The response, itemised.
            </h2>
            <p className="section-lede">
              The scanner reads the HTML the server actually sends. It does not run JavaScript,
              does not sign in, and never stores the value of a key it finds.
            </p>
          </div>

          <div className="scan-output" aria-live="polite" ref={resultRef}>
            {status === 'idle' && (
              <div className="scan-idle">
                <p className="scan-idle-title">Nothing read yet.</p>
                <p>
                  Paste a URL above, or start from one of these. Reports stay at their link for 30
                  days.
                </p>
                <ol className="recent" aria-label="Recent scans">
                  {recent.length === 0 && <li className="recent-empty">No reports yet.</li>}
                  {recent.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setStatus('loading');
                          fetch(`/api/report/${item.id}`)
                            .then(async (response) => {
                              const data = (await response.json()) as {
                                id?: string;
                                report?: Report;
                              } & ApiError;
                              if (!response.ok || !data.report) throw new Error('Gone.');
                              setReport(data.report);
                              setReportId(data.id ?? item.id);
                              setUrl(data.report.requestedUrl);
                              setStatus('ready');
                              shouldScroll.current = true;
                              history.replaceState(null, '', `/r/${data.id ?? item.id}`);
                            })
                            .catch(() => {
                              setStatus('error');
                              setError({ code: 'report', message: 'That report is gone.' });
                            });
                        }}
                      >
                        <Chip grade={item.grade} />
                        <span className="recent-host">{item.host}</span>
                        <span className="recent-score">{item.score}</span>
                        <span className="recent-when">{relative(item.at)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {status === 'loading' && (
              <div className="scan-loading">
                <p className="scan-loading-title">Reading the response…</p>
                <ol>
                  {STAGES.map((label, index) => (
                    <li
                      key={label}
                      className={index < stage ? 'is-done' : index === stage ? 'is-now' : ''}
                    >
                      <span aria-hidden="true">{index < stage ? '✓' : index === stage ? '→' : '·'}</span>
                      {label}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {status === 'error' && error && (
              <div className="scan-error">
                <p className="scan-error-code">{error.code}</p>
                <p className="scan-error-message">{error.message}</p>
                <button
                  type="button"
                  className="btn btn-ink btn-small"
                  onClick={() => {
                    setStatus('idle');
                    setError(null);
                    inputRef.current?.focus();
                  }}
                >
                  Try another URL
                </button>
              </div>
            )}

            {status === 'ready' && report && reportId && (
              <ReportView report={report} id={reportId} />
            )}
          </div>
        </section>

        <section className="section reads" id="read" aria-labelledby="reads-title">
          <div className="section-head section-head--wide">
            <p className="index">02 / What it reads</p>
            <h2 id="reads-title">
              Five questions,
              <br />
              answered from one response.
            </h2>
          </div>
          <ol className="reads-grid">
            <li data-reveal>
              <span className="read-num">01</span>
              <h3>Scripts</h3>
              <p>Every external script and stylesheet, split by origin. Trackers are named.</p>
            </li>
            <li data-reveal>
              <span className="read-num">02</span>
              <h3>Cookies</h3>
              <p>What the first response sets, and whether each one is Secure, HttpOnly, SameSite.</p>
            </li>
            <li data-reveal>
              <span className="read-num">03</span>
              <h3>Headers</h3>
              <p>Six headers that decide how much a browser is allowed to trust the page.</p>
            </li>
            <li data-reveal>
              <span className="read-num">04</span>
              <h3>Secrets</h3>
              <p>
                Key-shaped strings in the markup. Kinds and lengths are reported; values never are.
              </p>
            </li>
            <li data-reveal>
              <span className="read-num">05</span>
              <h3>Forms</h3>
              <p>Where each form posts, and whether that destination is still http.</p>
            </li>
          </ol>
        </section>

        <section className="section ledger" id="ledger" aria-labelledby="ledger-title">
          <div className="ledger-copy">
            <p className="index">03 / The ledger</p>
            <h2 id="ledger-title">
              The score is
              <br />
              not a mood.
            </h2>
            <p>
              Start at 100. Every finding takes a fixed number of points, published here so the
              grade can be argued with. The caps matter: ten trackers cannot sink a page that has
              no other problem.
            </p>
            <p className="ledger-small">
              A is 90 and up. B 80. C 70. D 60. E 45. F below that.
            </p>
          </div>

          <div className="ledger-table" data-reveal>
            <div className="ledger-head">
              <span>finding</span>
              <span>points</span>
            </div>
            {ledger.map((row) => (
              <div className="ledger-row" key={row.label}>
                <span className="ledger-label">
                  {row.label}
                  <em>{row.note}</em>
                </span>
                <span className="ledger-bar" aria-hidden="true">
                  <i style={{ width: `${(row.points / 45) * 100}%` }} />
                </span>
                <span className="ledger-points">−{row.points}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section limits" id="limits" aria-labelledby="limits-title">
          <div className="section-head section-head--wide">
            <p className="index">04 / What it cannot see</p>
            <h2 id="limits-title">
              One response
              <br />
              is not the whole site.
            </h2>
          </div>
          <div className="limit-row">
            <article data-reveal>
              <h3>Anything after load</h3>
              <p>
                No JavaScript runs. A tracker injected by client-side code, or a cookie set by a
                fetch, is invisible to this pass.
              </p>
            </article>
            <article data-reveal>
              <h3>Anything behind a login</h3>
              <p>
                No session, no cookies sent. Dashboards, admin panels and staging sites with basic
                auth simply refuse the request.
              </p>
            </article>
            <article data-reveal>
              <h3>Whether the code is safe</h3>
              <p>
                A clean grade means the response is tidy by this ledger. It is not a pentest, and
                it is not a promise.
              </p>
            </article>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="foot-top">
          <p className="foot-line">
            Read your own page before someone else does.
          </p>
          <a className="btn btn-ember" href="#scan">
            Run a report
            <span aria-hidden="true">→</span>
          </a>
        </div>
        <div className="foot-word" aria-hidden="true">
          exposure
        </div>
        <div className="foot-meta">
          <p>Built on Workers and D1. One request per scan, 30-day reports, no accounts.</p>
          <nav aria-label="Footer">
            <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
            <a href="#scan">New report</a>
            <a href="#main">Top</a>
          </nav>
          <p className="foot-fine">© 2026 Atharv Soni · MIT</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
