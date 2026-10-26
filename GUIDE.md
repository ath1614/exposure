# Exposure, explained from first principles

This walks through what the project is, how one scan travels from a URL to a report, and the
parts worth defending in an interview. It assumes you know JavaScript and HTTP basics, but not
Cloudflare Workers or D1.

## The one idea

A web page is a public answer to a private question: what does this site give away before anyone
asks? You can read that answer yourself with `curl` and patience. Exposure does the reading,
counts the things that matter, and subtracts points using a table it publishes.

The score is not a security audit. It is a consistent, arguable opinion about one response.

## The path of a scan

1. **The form** in the hero posts `{ url }` to `/api/scan`.
2. **`normalizeTarget()`** turns `stripe.com` into `https://stripe.com/`, then refuses anything
   private, non-http, credentialed or on an unusual port.
3. **`follow()`** fetches with `redirect: 'manual'` and a 9-second timeout. A redirect is a new
   URL, so it goes back through the guard. Three hops maximum.
4. **`readCapped()`** streams the body and stops at 500 kB. The content type has to be HTML.
5. **`analyze()`** parses tags, classifies origins, parses cookies, checks six headers, scans
   for key shapes, and builds the deduction list.
6. **`saveScan()`** writes one row to D1 with the JSON report and a short id.
7. **The browser** swaps the empty state for the report and puts `?r=<id>` in the address bar,
   so the report can be shared or reloaded.

## Why there is a guard, not just a fetch

Any endpoint that fetches a URL a stranger supplies can be turned into a weapon: point it at
`http://169.254.169.254/` (cloud metadata) or `http://10.0.0.5/admin` and the server will happily
fetch something the attacker cannot reach. That class of bug is called SSRF.

The defence is a list, applied twice — once to the input, once to every redirect:

- only `http`/`https`, only ports 80 and 443;
- no `localhost`, `*.local`, `*.internal`, metadata hostnames;
- no private or reserved IP ranges, in IPv4, IPv6, or IPv4-mapped IPv6 form;
- no decimal-integer hostnames such as `2130706433`, which some resolvers read as `127.0.0.1`.

It is not perfect. DNS rebinding — a public hostname that resolves to a private address — is
still possible, because the Worker resolves DNS itself. A hardened version would resolve the
address, check it, and connect to the checked IP. The site says so plainly instead of claiming
otherwise.

## Why the score is a table

`deductions` is not a number computed in ten places; it is a list of `{ label, detail, points }`.
The score is `100 - sum(points)`, clamped. The UI renders the same list, so the report can always
explain itself, and the public ledger is generated from the same constants.

Caps matter. Ten trackers should not be able to push a page to zero on their own, because a page
with ten trackers and no other problem is a normal marketing site, not a catastrophe.

## Reading the files in order

1. `src/core/guard.ts` — what the scanner may touch, and the error codes.
2. `src/core/guard.test.ts` — the addresses it must refuse.
3. `src/core/analyze.ts` — the parser, the vendor list, the checks, the ledger.
4. `src/core/analyze.test.ts` — including "the report never contains the key it found".
5. `src/server/index.ts` — the routes, the redirect loop, the size cap.
6. `src/server/schema.ts` — D1 tables, scan ids, rate limit, pruning.
7. `src/App.tsx` — the form, the report, the permalink.
8. `src/styles.css` — the flame field, the ledger, the gauge.

## Glossary

- **SSRF**: server-side request forgery; making a server fetch something you cannot.
- **D1**: Cloudflare's SQLite, bound into a Worker as `env.DB`.
- **Worker**: a fetch handler running on Cloudflare's edge, not a long-lived Node process.
- **`redirect: 'manual'`**: fetch a redirect response without following it, so the target can be
  checked first.
- **CSP**: `Content-Security-Policy`, the header that says which sources a page may load.
- **HSTS**: `Strict-Transport-Security`, which tells the browser to refuse plain http.
- **SameSite**: a cookie flag that decides whether the cookie travels on cross-site requests.
- **Luhn / MOD-97**: checksums used elsewhere in the portfolio (Redact) to avoid false positives.

## Try these

- Add a check for `Cross-Origin-Opener-Policy`. What weight would you give it, and why is "every
  missing header costs the same" a bad rubric?
- Change the tracker list to read from a table in D1 instead of a constant. What has to happen
  when a vendor's CDN changes domain?
- Add a second fetch with a mobile user agent and diff the two reports. What would you show when
  they disagree?
- Cap the report JSON at 48 kB. Which fields would you drop first, and what does the report lose?
- Add an integration test that runs the Worker under `wrangler dev` with a local D1.

## Limits to say out loud

- It reads one response, with no JavaScript and no session.
- Client-side trackers and cookies set by `fetch` are invisible.
- Some sites block automated fetches; the scan fails rather than pretending.
- DNS rebinding is not fully defended; the guard is a strong filter, not a sandbox.
- A grade is not a pentest. It is a reproducible reading of what the page said about itself.
