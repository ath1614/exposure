import { Hono } from 'hono';
import { analyze } from '../core/analyze';
import { ScanError, normalizeTarget } from '../core/guard';
import { renderSharePage } from './share';
import type { Env } from './env';
import {
  bumpRate,
  countScans,
  ensureSchema,
  hashIp,
  loadScan,
  prune,
  recentScans,
  saveScan,
  scanId,
} from './schema';

const app = new Hono<{ Bindings: Env }>();

const UA = 'Exposure/1.0 (URL exposure report; +https://github.com/ath1614/exposure)';
const MAX_BYTES = 500_000;
const MAX_REDIRECTS = 3;
const RATE_LIMIT = 20;

app.use('*', async (c, next) => {
  await next();
  c.header('x-content-type-options', 'nosniff');
  c.header('referrer-policy', 'strict-origin-when-cross-origin');
  if (c.req.path.startsWith('/api/')) c.header('cache-control', 'no-store');
});

function fail(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** A redirect is a new URL, so it gets the whole guard again. */
async function follow(url: URL): Promise<{ response: Response; finalUrl: URL }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'accept-language': 'en',
      },
      signal: AbortSignal.timeout(9000),
    });

    if (!REDIRECTS.has(response.status)) return { response, finalUrl: current };

    const location = response.headers.get('location');
    if (!location) throw new ScanError('redirect', 'The server redirected without a location.');
    current = normalizeTarget(new URL(location, current).toString());
  }
  throw new ScanError('redirect', 'More than three redirects; refusing to keep chasing.');
}

async function readCapped(response: Response): Promise<{ html: string; bytes: number }> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return { html: text.slice(0, MAX_BYTES), bytes: text.length };
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  let html = '';
  let bytes = 0;
  while (bytes < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    html += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  html += decoder.decode();
  return { html: html.slice(0, MAX_BYTES), bytes };
}

app.get('/api/health', async (c) => {
  await ensureSchema(c.env.DB);
  return c.json({ ok: true, scans: await countScans(c.env.DB) });
});

app.post('/api/scan', async (c) => {
  await ensureSchema(c.env.DB);

  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
  const used = await bumpRate(c.env.DB, await hashIp(ip));
  if (used > RATE_LIMIT) {
    c.header('retry-after', '600');
    return fail(429, 'rate', 'That is 20 scans in ten minutes. Give it a minute.');
  }

  let body: { url?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return fail(400, 'json', 'Send a JSON body with a url.');
  }
  if (typeof body.url !== 'string') {
    return fail(400, 'url', 'Send a JSON body with a url.');
  }

  let target: URL;
  try {
    target = normalizeTarget(body.url);
  } catch (error) {
    if (error instanceof ScanError) return fail(400, error.code, error.message);
    throw error;
  }

  try {
    const { response, finalUrl } = await follow(target);

    const type = response.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
      return fail(
        415,
        'content-type',
        `That URL answered with ${type.split(';')[0] || 'no content type'}, not an HTML page.`,
      );
    }

    const { html, bytes } = await readCapped(response);

    const headers: Record<string, string> = {};
    for (const name of [
      'content-security-policy',
      'strict-transport-security',
      'x-frame-options',
      'referrer-policy',
      'permissions-policy',
      'x-content-type-options',
    ]) {
      const value = response.headers.get(name);
      if (value) headers[name] = value;
    }

    const getSetCookie = (
      response.headers as unknown as { getSetCookie?: () => string[] }
    ).getSetCookie?.();
    const setCookies = getSetCookie ?? [];

    const report = analyze({
      requestedUrl: target.toString(),
      finalUrl: finalUrl.toString(),
      status: response.status,
      html,
      bytes,
      headers,
      setCookies,
    });

    const id = scanId();
    await saveScan(c.env.DB, id, report);

    if (Math.random() < 0.05) {
      await prune(c.env.DB).catch(() => undefined);
    }

    return c.json({ id, report });
  } catch (error) {
    if (error instanceof ScanError) return fail(400, error.code, error.message);
    const message = error instanceof Error ? error.message : 'The page could not be fetched.';
    return fail(
      502,
      'fetch',
      `${message}. Some sites block automated fetches; theirs may be one.`,
    );
  }
});

app.get('/api/report/:id', async (c) => {
  await ensureSchema(c.env.DB);
  const id = c.req.param('id');
  if (!/^[0-9a-z]{6,16}$/.test(id)) return fail(400, 'id', 'That is not a report id.');
  const report = await loadScan(c.env.DB, id);
  if (!report) return fail(404, 'missing', 'No report with that id. It may have expired.');
  return c.json({ id, report });
});

app.get('/api/recent', async (c) => {
  await ensureSchema(c.env.DB);
  return c.json({ scans: await recentScans(c.env.DB) });
});

app.get('/report/:id', (c) => c.redirect(`/r/${c.req.param('id')}`, 301));

app.get('/r/:id', async (c) => {
  const id = c.req.param('id');
  const origin = new URL(c.req.url).origin;
  const shell = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  const html = await shell.text();

  if (!/^[0-9a-z]{6,16}$/.test(id)) {
    return c.html(renderSharePage(html, { title: 'Not a report id · Exposure', description: 'Exposure reads one public URL and reports what it gives away.', url: origin, noindex: true }), 404);
  }

  await ensureSchema(c.env.DB);
  const report = await loadScan(c.env.DB, id);
  if (!report) {
    return c.html(
      renderSharePage(html, {
        title: 'Report expired · Exposure',
        description: 'Exposure keeps reports for 30 days. Scan the URL again to get a fresh one.',
        url: `${origin}/r/${id}`,
        noindex: true,
      }),
      404,
    );
  }

  const parts = [
    `${report.counts.trackers} tracker origin${report.counts.trackers === 1 ? '' : 's'}`,
    `${report.counts.missingHeaders} of 6 security headers missing`,
    report.counts.secrets > 0
      ? `${report.counts.secrets} credential-shaped string${report.counts.secrets === 1 ? '' : 's'} in the markup`
      : 'no credential-shaped strings in the markup',
  ];
  const summary = [
    `${report.host} scored ${report.score}/100 (${report.grade}).`,
    `Read on ${new Date(report.fetchedAt).toISOString().slice(0, 10)}.`,
    '',
    ...parts.map((part) => `- ${part}`),
    '',
    'Why this grade:',
    ...(report.deductions.length === 0
      ? ['- nothing came off']
      : report.deductions.map((item) => `- ${item.label}: -${item.points} (${item.detail})`)),
  ].join('\n');

  const description = `Score ${report.score}/100 (${report.grade}) for ${report.host}: ${parts.join(', ')}.`;

  return c.html(
    renderSharePage(html, {
      title: `${report.host} scores ${report.score}/100 (${report.grade}) · Exposure`,
      description,
      url: `${origin}/r/${id}`,
      summary,
      noindex: false,
    }),
    200,
    { 'cache-control': 'public, max-age=600' },
  );
});

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
