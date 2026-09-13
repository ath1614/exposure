import { describe, expect, it } from 'vitest';
import {
  analyze,
  findSecrets,
  gradeFor,
  pageTitle,
  parseSetCookie,
  parseTags,
  trackerVendor,
  type AnalyzeInput,
} from './analyze';

const SECURE_HEADERS: Record<string, string> = {
  'content-security-policy': "default-src 'self'",
  'strict-transport-security': 'max-age=63072000',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=()',
  'x-content-type-options': 'nosniff',
};

const input = (html: string, overrides: Partial<AnalyzeInput> = {}): AnalyzeInput => ({
  requestedUrl: 'https://shop.example/',
  finalUrl: 'https://shop.example/',
  status: 200,
  bytes: html.length,
  html,
  headers: SECURE_HEADERS,
  setCookies: [],
  ...overrides,
});

describe('parseTags', () => {
  it('reads attributes, including a > inside a quoted value', () => {
    const tags = parseTags('<a href="/cart" title="a > b">cart</a>');
    expect(tags[0]).toEqual({ name: 'a', attrs: { href: '/cart', title: 'a > b' } });
  });

  it('ignores comments and the insides of scripts and styles', () => {
    const tags = parseTags(
      '<!-- <img src="https://ghost.example/x.png"> -->' +
        '<script>const s = "<img src=\\"https://ghost.example/y.png\\">";</script>' +
        '<style>.a{background:url(https://ghost.example/z.png)}</style>' +
        '<p>hello</p>',
    );
    expect(tags.map((tag) => tag.name)).toEqual(['script', 'style', 'p']);
  });
});

describe('trackers', () => {
  it('matches a vendor on an exact domain and any subdomain', () => {
    expect(trackerVendor('www.google-analytics.com')).toBe('Google Analytics');
    expect(trackerVendor('connect.facebook.net')).toBe('Meta Pixel');
    expect(trackerVendor('shop.example')).toBeNull();
    expect(trackerVendor('notfacebook.com')).toBeNull();
  });
});

describe('cookies', () => {
  it('parses flags and defaults SameSite to unset', () => {
    expect(parseSetCookie('sid=abc; Secure; HttpOnly; SameSite=Lax')).toEqual({
      name: 'sid',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
    });
    expect(parseSetCookie('tracker=1; Path=/')).toEqual({
      name: 'tracker',
      secure: false,
      httpOnly: false,
      sameSite: 'unset',
    });
    expect(parseSetCookie('novalue')).toBeNull();
  });
});

describe('secrets', () => {
  it('classifies a live key and never echoes the value', () => {
    const key = 'sk_live_51NxQ8K2eZvKYlo2C';
    const report = analyze(input(`<script>const k = "${key}";</script>`));
    expect(report.secrets).toHaveLength(1);
    expect(report.secrets[0].kind).toBe('Stripe live key');
    expect(report.secrets[0].where).toContain('inline script');
    expect(JSON.stringify(report)).not.toContain(key);
  });

  it('finds a webhook secret and an AWS key in the markup', () => {
    const found = findSecrets(
      '<div data-key="whsec_9f3c2b7a41d8e6f0aaaaaaaa"></div><p>AKIAIOSFODNN7EXAMPLE</p>',
    );
    expect(found.map((secret) => secret.kind)).toEqual([
      'AWS access key',
      'Webhook signing secret',
    ]);
    expect(found.every((secret) => secret.where === 'in the markup')).toBe(true);
  });
});

describe('analyze', () => {
  it('scores a clean page with every header at 100 and grade A', () => {
    const report = analyze(input('<title>Shop</title><form action="/pay"><input></form>'));
    expect(report.score).toBe(100);
    expect(report.grade).toBe('A');
    expect(report.deductions).toEqual([]);
    expect(report.title).toBe('Shop');
  });

  it('counts third-party origins and tracker vendors separately', () => {
    const report = analyze(
      input(
        '<script src="https://cdn.example.net/app.js"></script>' +
          '<script src="https://www.googletagmanager.com/gtag/js"></script>' +
          '<img src="https://www.googletagmanager.com/pixel.png">' +
          '<script src="https://shop.example/app.js"></script>',
      ),
    );
    expect(report.counts.thirdParty).toBe(2);
    expect(report.counts.trackers).toBe(1);
    const tracker = report.origins.find((origin) => origin.vendor !== null);
    expect(tracker?.vendor).toBe('Google Tag Manager');
    expect(report.deductions.map((d) => d.id)).toEqual(
      expect.arrayContaining(['trackers', 'scripts']),
    );
  });

  it('flags http form actions and insecure cookies', () => {
    const report = analyze(
      input('<form action="http://checkout.example/pay"></form>', {
        setCookies: ['sid=1; Secure; HttpOnly; SameSite=Strict', 'utm=1; Path=/'],
      }),
    );
    expect(report.forms[0].secure).toBe(false);
    expect(report.counts.insecureCookies).toBe(1);
    expect(report.deductions.map((d) => d.id)).toEqual(
      expect.arrayContaining(['forms', 'cookie-secure']),
    );
  });

  it('deducts for each missing header and lets the ledger add up', () => {
    const report = analyze(input('<p>hi</p>', { headers: {} }));
    expect(report.counts.missingHeaders).toBe(6);
    const total = report.deductions.reduce((sum, item) => sum + item.points, 0);
    expect(report.score).toBe(100 - total);
    expect(report.grade).toBe('C');
  });

  it('treats frame-ancestors as framing protection', () => {
    const report = analyze(
      input('<p>hi</p>', {
        headers: {
          ...SECURE_HEADERS,
          'x-frame-options': '',
          'content-security-policy': "frame-ancestors 'none'",
        },
      }),
    );
    expect(report.headers.find((header) => header.id === 'frame')?.present).toBe(true);
    expect(report.deductions).toEqual([]);
  });

  it('grades on the documented boundaries', () => {
    expect(gradeFor(100)).toBe('A');
    expect(gradeFor(90)).toBe('A');
    expect(gradeFor(89)).toBe('B');
    expect(gradeFor(80)).toBe('B');
    expect(gradeFor(70)).toBe('C');
    expect(gradeFor(60)).toBe('D');
    expect(gradeFor(45)).toBe('E');
    expect(gradeFor(44)).toBe('F');
  });

  it('notes an error status instead of pretending it is a page', () => {
    const report = analyze(input('<p>gone</p>', { status: 404 }));
    expect(report.notes[0]).toContain('404');
  });
});

describe('pageTitle', () => {
  it('collapses whitespace and returns null when absent', () => {
    expect(pageTitle('<title>  Shop \n  front </title>')).toBe('Shop front');
    expect(pageTitle('<p>no title</p>')).toBeNull();
  });
});
