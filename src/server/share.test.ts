import { describe, expect, it } from 'vitest';
import { escapeHtml, renderSharePage } from './share';

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Exposure · every page has a tell</title>
    <meta name="description" content="Paste a URL and read what the page gives away." />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Exposure · every page has a tell" />
    <meta
      property="og:description"
      content="One fetch, one report."
    />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>`;

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('escapeHtml', () => {
  it('turns every character that could close an attribute into an entity', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('renderSharePage', () => {
  const page = renderSharePage(SHELL, {
    title: 'example.com scores 74/100 (C) · Exposure',
    description: 'Score 74/100 (C) for example.com: 3 tracker origins, 4 of 6 security headers missing.',
    url: 'https://exposure.example/r/abc123defg',
    summary: 'example.com scored 74/100 (C).',
    noindex: false,
  });

  it('uses the report as the page title', () => {
    expect(page).toContain('<title>example.com scores 74/100 (C) · Exposure</title>');
    expect(page).not.toContain('every page has a tell');
  });

  it('leaves exactly one of each social tag, and none of the generic ones', () => {
    expect(count(page, 'property="og:title"')).toBe(1);
    expect(count(page, 'property="og:description"')).toBe(1);
    expect(count(page, 'name="twitter:card"')).toBe(1);
    expect(page).toContain('property="og:title" content="example.com scores 74/100 (C) · Exposure"');
    expect(page).toContain('property="og:url" content="https://exposure.example/r/abc123defg"');
    expect(page).toContain('<link rel="canonical" href="https://exposure.example/r/abc123defg" />');
    expect(page).toContain('<meta name="robots" content="index,follow" />');
  });

  it('keeps the app shell so the page still boots', () => {
    expect(page).toContain('<div id="root"></div>');
    expect(page).toContain('<script type="module" src="/assets/index.js"></script>');
    expect(page).toContain('<meta charset="UTF-8" />');
  });

  it('puts the findings in the markup for a client that runs no JavaScript', () => {
    expect(page).toContain('<noscript><pre>example.com scored 74/100 (C).</pre></noscript>');
  });

  it('marks a missing report noindex and omits the summary', () => {
    const missing = renderSharePage(SHELL, {
      title: 'Report expired · Exposure',
      description: 'Exposure keeps reports for 30 days.',
      url: 'https://exposure.example/r/abc123defg',
      noindex: true,
    });
    expect(missing).toContain('<meta name="robots" content="noindex" />');
    expect(missing).not.toContain('<noscript>');
  });

  it('cannot be broken out of by a hostile host name', () => {
    const hostile = renderSharePage(SHELL, {
      title: '</title><script>alert(1)</script>',
      description: '" onload="alert(2)',
      url: 'https://exposure.example/r/abc123defg',
      noindex: false,
    });
    expect(hostile).not.toContain('<script>alert(1)</script>');
    expect(hostile).not.toContain('" onload="');
    expect(hostile).toContain('&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
