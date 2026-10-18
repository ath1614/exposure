# Exposure

**Every page has a tell.**

Paste a URL. Exposure fetches it the way a stranger would, then itemises what the response
hands over: third-party scripts, tracker pixels, cookies, missing headers, form destinations,
and key-shaped strings left in the markup.

[Run a report](https://site-a2ea171641a94e8aad3645271be64d6c.freebuff.page) · MIT

---

## Why

A page is a public statement about its own security posture. Most teams have never read theirs
from the outside: they know what is in the repo, not what the CDN, the tag manager, the marketing
snippet and the framework's default headers actually send.

Exposure reads one response, shows its work, and publishes the weights — so "C" is an argument
you can have, not a mood.

## The five questions

| | What is read | How |
|---|---|---|
| 1 | **Scripts** | Every `<script src>`, stylesheet and preload, reduced to an origin. Trackers are matched against a vendor list (`google-analytics.com`, `connect.facebook.net`, `hotjar.com`, …). |
| 2 | **Cookies** | `Set-Cookie` on the first response: `Secure`, `HttpOnly`, `SameSite`, or the absence of each. |
| 3 | **Headers** | CSP, HSTS, frame protection (`X-Frame-Options` or CSP `frame-ancestors`), `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`. |
| 4 | **Secrets** | Stripe live and test keys, `whsec_`, AWS key ids, Google API keys, GitHub tokens, private-key blocks, JWTs. Kinds and lengths are reported; the value is never stored or returned. |
| 5 | **Forms** | Every `<form action>`, with its destination origin and whether it is still `http`. |

The parser is deliberately small and read-only. It collects tags and attributes; it never
renders, evaluates or executes anything from the page.

## The ledger

Every finding takes a fixed number of points off 100, with a cap per family so one noisy signal
cannot swamp the rest. The site publishes the same table the code uses.

| Finding | Points |
|---|---|
| Credentials in the source | 45 for the first, +5 each, capped at 55 |
| Trackers on first load | 4 each, capped at 20 |
| Third-party script origins | 2 each, capped at 16 |
| Forms posting over http | 10 each, capped at 20 |
| Cookies without `Secure` | 3 each, capped at 12 |
| Cookies without `SameSite` | 2 each, capped at 8 |
| Cookies readable by JS | 1 each, capped at 4 |
| Missing CSP / HSTS / frame protection | 8 / 5 / 5 |
| Missing `Referrer-Policy` / `Permissions-Policy` / `nosniff` | 3 / 3 / 2 |

Grades: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, E ≥ 45, F below.

## API

```
POST /api/scan            { "url": "https://example.com" } -> { id, report }
GET  /api/report/:id      -> { id, report }
GET  /api/recent          -> { scans: [{ id, host, score, grade, at }] }
GET  /api/health          -> { ok, scans }
```

A scan is capped at 500 kB of HTML, 9 seconds and 3 redirects. Reports live in D1 for 30 days
and are addressable at `/?r=<id>`.

Rate limit: 20 scans per IP per 10 minutes, counted against a SHA-256 prefix of the address,
never the address itself.

## Fetching safely

A service that fetches URLs a user supplies is an SSRF machine unless it refuses to look inward.
The guard (`src/core/guard.ts`) runs on the first URL **and again on every redirect target**:

- `http`/`https` only, standard ports 80 and 443 only, no credentials in the URL.
- Refuses `localhost`, `*.local`, `*.internal`, `metadata.google.internal`.
- Refuses private and reserved IPv4 ranges (10/8, 127/8, 172.16/12, 192.168/16, 169.254/16,
  100.64/10, 0/8, 224/4, 240/4), IPv6 loopback, unique-local, link-local and IPv4-mapped forms.
- Refuses decimal-integer hostnames, which some resolvers treat as an IPv4 alias.
- Redirects are followed with `redirect: 'manual'`, so the `Location` header is re-validated
  before it is fetched.

**Known limitation:** the Worker's `fetch` resolves DNS itself, so DNS rebinding (a public name
that resolves to a private address) is not fully mitigated here. A production version would pin
the resolved IP and connect to it directly. This is stated in the UI too.

## Stack

- **Worker**: Hono, TypeScript, deployed as an ES module Worker.
- **D1**: `scans` and `scan_rate`; the schema is created by `ensureSchema()` on first request.
- **Frontend**: Vite + React 19, no router — the report id lives in `?r=`.
- **Tests**: Vitest, 32 tests over the parser, the score, the cookie flags and the SSRF guard.

## Development

```bash
npm install
npx wrangler dev --port 8791 --local   # the API and a local D1
npm run dev                            # the site on :5182, proxying /api
npm test
npm run build && npm run build:deploy
```

## Limits, in the same words as the site

- **No JavaScript runs.** Anything injected after load is invisible to this pass.
- **No session.** Pages behind a login simply refuse the request.
- **One response.** A clean grade is not a pentest and not a promise about the code.
- **Bot walls.** Some sites block automated fetches; those scans fail with the upstream status.

## Licence

MIT © Atharv Soni
