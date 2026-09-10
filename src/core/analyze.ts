/**
 * What a page hands over.
 *
 * The parser here is deliberately small and read-only: it collects tags and
 * attributes, never renders or evaluates anything. Secrets are classified and
 * counted, never stored or returned — only the pattern name and its location.
 */

export interface Tag {
  name: string;
  attrs: Record<string, string>;
}

export type AssetKind = 'script' | 'style' | 'image' | 'frame' | 'form';

export interface Origin {
  origin: string;
  host: string;
  kind: AssetKind;
  vendor: string | null;
}

export interface CookieFinding {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
}

export interface HeaderCheck {
  id: string;
  header: string;
  present: boolean;
  value: string | null;
  note: string;
}

export interface SecretFinding {
  kind: string;
  where: string;
  length: number;
}

export interface FormFinding {
  action: string;
  origin: string;
  secure: boolean;
}

export interface Deduction {
  id: string;
  label: string;
  detail: string;
  points: number;
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface Report {
  requestedUrl: string;
  finalUrl: string;
  host: string;
  fetchedAt: string;
  status: number;
  bytes: number;
  title: string | null;
  score: number;
  grade: Grade;
  counts: {
    thirdParty: number;
    trackers: number;
    cookies: number;
    insecureCookies: number;
    secrets: number;
    forms: number;
    missingHeaders: number;
  };
  origins: Origin[];
  cookies: CookieFinding[];
  headers: HeaderCheck[];
  secrets: SecretFinding[];
  forms: FormFinding[];
  deductions: Deduction[];
  notes: string[];
}

const TAG_RE =
  /<([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** Collect tags and attributes. Comments and inline script bodies are skipped. */
export function parseTags(html: string): Tag[] {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, '<script$1></script>')
    .replace(/<style\b([^>]*)>[\s\S]*?<\/style>/gi, '<style$1></style>');

  const tags: Tag[] = [];
  for (const match of clean.matchAll(TAG_RE)) {
    const attrs: Record<string, string> = {};
    for (const attr of match[2].matchAll(ATTR_RE)) {
      attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? '';
    }
    tags.push({ name: match[1].toLowerCase(), attrs });
  }
  return tags;
}

export function pageTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
  if (!match) return null;
  const title = match[1].replace(/\s+/g, ' ').trim();
  return title || null;
}

const TRACKERS: { domain: string; vendor: string }[] = [
  { domain: 'google-analytics.com', vendor: 'Google Analytics' },
  { domain: 'analytics.google.com', vendor: 'Google Analytics' },
  { domain: 'googletagmanager.com', vendor: 'Google Tag Manager' },
  { domain: 'doubleclick.net', vendor: 'Google Ads' },
  { domain: 'googleadservices.com', vendor: 'Google Ads' },
  { domain: 'googlesyndication.com', vendor: 'Google Ads' },
  { domain: 'connect.facebook.net', vendor: 'Meta Pixel' },
  { domain: 'facebook.com', vendor: 'Meta' },
  { domain: 'hotjar.com', vendor: 'Hotjar' },
  { domain: 'hotjar.io', vendor: 'Hotjar' },
  { domain: 'clarity.ms', vendor: 'Microsoft Clarity' },
  { domain: 'segment.com', vendor: 'Segment' },
  { domain: 'segment.io', vendor: 'Segment' },
  { domain: 'mixpanel.com', vendor: 'Mixpanel' },
  { domain: 'amplitude.com', vendor: 'Amplitude' },
  { domain: 'heap.io', vendor: 'Heap' },
  { domain: 'fullstory.com', vendor: 'FullStory' },
  { domain: 'intercom.io', vendor: 'Intercom' },
  { domain: 'intercomcdn.com', vendor: 'Intercom' },
  { domain: 'hs-scripts.com', vendor: 'HubSpot' },
  { domain: 'hubspot.com', vendor: 'HubSpot' },
  { domain: 'analytics.tiktok.com', vendor: 'TikTok' },
  { domain: 'criteo.com', vendor: 'Criteo' },
  { domain: 'criteo.net', vendor: 'Criteo' },
  { domain: 'taboola.com', vendor: 'Taboola' },
  { domain: 'outbrain.com', vendor: 'Outbrain' },
  { domain: 'snap.licdn.com', vendor: 'LinkedIn Ads' },
  { domain: 'bat.bing.com', vendor: 'Microsoft Ads' },
  { domain: 'sc-static.net', vendor: 'Snap' },
  { domain: 'ct.pinterest.com', vendor: 'Pinterest' },
  { domain: 'adroll.com', vendor: 'AdRoll' },
  { domain: 'quantserve.com', vendor: 'Quantcast' },
  { domain: 'scorecardresearch.com', vendor: 'Comscore' },
  { domain: 'yandex.ru', vendor: 'Yandex' },
  { domain: 'vk.com', vendor: 'VK' },
];

export function trackerVendor(host: string): string | null {
  const lower = host.toLowerCase();
  for (const tracker of TRACKERS) {
    if (lower === tracker.domain || lower.endsWith(`.${tracker.domain}`)) {
      return tracker.vendor;
    }
  }
  return null;
}

const SECRETS: { kind: string; pattern: RegExp }[] = [
  { kind: 'Stripe live key', pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{12,}/ },
  { kind: 'Stripe test key', pattern: /\b(?:sk|rk)_test_[A-Za-z0-9]{12,}/ },
  { kind: 'AWS access key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { kind: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { kind: 'Private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  {
    kind: 'JSON web token',
    pattern: /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/,
  },
  { kind: 'Webhook signing secret', pattern: /\bwhsec_[A-Za-z0-9]{20,}\b/ },
];

export function findSecrets(html: string): SecretFinding[] {
  const found: SecretFinding[] = [];
  for (const secret of SECRETS) {
    const match = html.match(secret.pattern);
    if (!match) continue;
    const index = match.index ?? 0;
    const window = html.slice(Math.max(0, index - 120), index);
    const inScript = /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*$/i.test(window);
    found.push({
      kind: secret.kind,
      where: inScript ? 'inside an inline script' : 'in the markup',
      length: match[0].length,
    });
  }
  return found;
}

export function parseSetCookie(header: string): CookieFinding | null {
  const [pair, ...rest] = header.split(';');
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  const flags = rest.map((flag) => flag.trim().toLowerCase());
  const sameSite = flags.find((flag) => flag.startsWith('samesite='));
  return {
    name: pair.slice(0, eq).trim(),
    secure: flags.includes('secure'),
    httpOnly: flags.includes('httponly'),
    sameSite: sameSite ? sameSite.split('=')[1] : 'unset',
  };
}

const HEADER_CHECKS: { id: string; header: string; note: string }[] = [
  {
    id: 'csp',
    header: 'content-security-policy',
    note: 'Without it, one injected string can load a script from anywhere.',
  },
  {
    id: 'hsts',
    header: 'strict-transport-security',
    note: 'Tells the browser never to try http again for this host.',
  },
  {
    id: 'frame',
    header: 'x-frame-options',
    note: 'Stops another site framing yours and overlaying a button on it.',
  },
  {
    id: 'referrer',
    header: 'referrer-policy',
    note: 'Decides how much of your URL leaks to the next site.',
  },
  {
    id: 'permissions',
    header: 'permissions-policy',
    note: 'Names the browser features embedded content may use.',
  },
  {
    id: 'nosniff',
    header: 'x-content-type-options',
    note: 'Stops a browser guessing a file is a script when it is not.',
  },
];

const HEADER_POINTS: Record<string, number> = {
  csp: 8,
  hsts: 5,
  frame: 5,
  referrer: 3,
  permissions: 3,
  nosniff: 2,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function gradeFor(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  if (score >= 45) return 'E';
  return 'F';
}

export interface AnalyzeInput {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  html: string;
  bytes: number;
  headers: Record<string, string>;
  setCookies: string[];
}

export function analyze(input: AnalyzeInput): Report {
  const base = new URL(input.finalUrl);
  const tags = parseTags(input.html);
  const origins: Origin[] = [];
  const forms: FormFinding[] = [];
  const seen = new Set<string>();

  const pushOrigin = (raw: string, kind: AssetKind) => {
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (seen.has(url.origin)) return;
    seen.add(url.origin);
    origins.push({
      origin: url.origin,
      host: url.hostname,
      kind,
      vendor: trackerVendor(url.hostname),
    });
  };

  for (const tag of tags) {
    if (tag.name === 'script' && tag.attrs.src) pushOrigin(tag.attrs.src, 'script');

    if (tag.name === 'link' && tag.attrs.href) {
      const rel = (tag.attrs.rel ?? '').toLowerCase();
      if (rel.includes('stylesheet') || rel.includes('preload')) {
        pushOrigin(tag.attrs.href, 'style');
      }
    }

    if (tag.name === 'img' && tag.attrs.src) pushOrigin(tag.attrs.src, 'image');
    if (tag.name === 'iframe' && tag.attrs.src) pushOrigin(tag.attrs.src, 'frame');

    if (tag.name === 'form' && tag.attrs.action) {
      try {
        const action = new URL(tag.attrs.action, base);
        if (action.protocol === 'http:' || action.protocol === 'https:') {
          forms.push({
            action: action.toString(),
            origin: action.origin,
            secure: action.protocol === 'https:',
          });
        }
      } catch {
        // A relative action with no base is not a finding.
      }
    }
  }

  const thirdParty = origins.filter((origin) => origin.origin !== base.origin);
  const trackers = thirdParty.filter((origin) => origin.vendor !== null);

  const cookies = input.setCookies
    .map(parseSetCookie)
    .filter((cookie): cookie is CookieFinding => cookie !== null);

  const headers: HeaderCheck[] = HEADER_CHECKS.map((check) => {
    const value = input.headers[check.header] ?? null;
    const frameAllowedByCsp =
      check.id === 'frame' &&
      (input.headers['content-security-policy'] ?? '').includes('frame-ancestors');
    return {
      id: check.id,
      header: check.header,
      present: Boolean(value) || frameAllowedByCsp,
      value: value ?? (frameAllowedByCsp ? 'declared by content-security-policy' : null),
      note: check.note,
    };
  });

  const secrets = findSecrets(input.html);
  const deductions: Deduction[] = [];

  if (secrets.length > 0) {
    const points = clamp(45 + (secrets.length - 1) * 5, 45, 55);
    deductions.push({
      id: 'secrets',
      label: `${secrets.length} credential${secrets.length > 1 ? 's' : ''} in the page source`,
      detail: secrets.map((secret) => secret.kind).join(', '),
      points,
    });
  }

  const trackerPoints = clamp(trackers.length * 4, 0, 20);
  if (trackerPoints > 0) {
    deductions.push({
      id: 'trackers',
      label: `${trackers.length} tracker${trackers.length > 1 ? 's' : ''} on first load`,
      detail: [...new Set(trackers.map((origin) => origin.vendor))].join(', '),
      points: trackerPoints,
    });
  }

  const scriptHosts = new Set(
    thirdParty.filter((o) => o.kind === 'script' && o.vendor === null).map((o) => o.origin),
  );
  const scriptPoints = clamp(scriptHosts.size * 2, 0, 16);
  if (scriptPoints > 0) {
    deductions.push({
      id: 'scripts',
      label: `${scriptHosts.size} third-party script origin${scriptHosts.size > 1 ? 's' : ''}`,
      detail: 'Every origin is another company that can change what runs on your page.',
      points: scriptPoints,
    });
  }

  const insecure = cookies.filter((cookie) => !cookie.secure);
  if (insecure.length > 0) {
    deductions.push({
      id: 'cookie-secure',
      label: `${insecure.length} cookie${insecure.length > 1 ? 's' : ''} without Secure`,
      detail: insecure.map((cookie) => cookie.name).join(', '),
      points: clamp(insecure.length * 3, 0, 12),
    });
  }

  const noSameSite = cookies.filter((cookie) => cookie.sameSite === 'unset');
  if (noSameSite.length > 0) {
    deductions.push({
      id: 'cookie-samesite',
      label: `${noSameSite.length} cookie${noSameSite.length > 1 ? 's' : ''} without SameSite`,
      detail: 'They travel with cross-site requests, which is how CSRF starts.',
      points: clamp(noSameSite.length * 2, 0, 8),
    });
  }

  const notHttpOnly = cookies.filter((cookie) => !cookie.httpOnly);
  if (notHttpOnly.length > 0) {
    deductions.push({
      id: 'cookie-httponly',
      label: `${notHttpOnly.length} cookie${notHttpOnly.length > 1 ? 's' : ''} readable by JavaScript`,
      detail: 'One XSS and the session token is gone.',
      points: clamp(notHttpOnly.length, 0, 4),
    });
  }

  const insecureForms = forms.filter((form) => !form.secure);
  if (insecureForms.length > 0) {
    deductions.push({
      id: 'forms',
      label: `${insecureForms.length} form${insecureForms.length > 1 ? 's' : ''} posting over http`,
      detail: 'Anything typed there travels in clear text.',
      points: clamp(insecureForms.length * 10, 0, 20),
    });
  }

  for (const check of headers) {
    if (check.present) continue;
    deductions.push({
      id: `header-${check.id}`,
      label: `No ${check.header}`,
      detail: check.note,
      points: HEADER_POINTS[check.id] ?? 0,
    });
  }

  const total = deductions.reduce((sum, item) => sum + item.points, 0);
  const score = clamp(100 - total, 0, 100);

  const notes: string[] = [];
  if (input.status >= 400) {
    notes.push(`The server answered ${input.status}; the page below may be an error document.`);
  }
  if (base.protocol === 'http:') {
    notes.push('This page was served over http, so no header it sends can be trusted in transit.');
  }
  if (trackers.length === 0 && cookies.length === 0 && secrets.length === 0) {
    notes.push('No trackers, cookies or credentials were visible in the first response.');
  }

  return {
    requestedUrl: input.requestedUrl,
    finalUrl: input.finalUrl,
    host: base.hostname,
    fetchedAt: new Date().toISOString(),
    status: input.status,
    bytes: input.bytes,
    title: pageTitle(input.html),
    score,
    grade: gradeFor(score),
    counts: {
      thirdParty: thirdParty.length,
      trackers: trackers.length,
      cookies: cookies.length,
      insecureCookies: insecure.length,
      secrets: secrets.length,
      forms: forms.length,
      missingHeaders: headers.filter((check) => !check.present).length,
    },
    origins: thirdParty.sort((a, b) => a.origin.localeCompare(b.origin)),
    cookies,
    headers,
    secrets,
    forms,
    deductions: deductions.sort((a, b) => b.points - a.points),
    notes,
  };
}
