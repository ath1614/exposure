/**
 * The share page is the shell with a different head. A crawler never runs the app, so the
 * score has to be in the markup it downloads; nothing else about the page changes.
 */

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ENTITIES[character]);
}

export interface ShareMeta {
  title: string;
  description: string;
  url: string;
  summary?: string;
  noindex: boolean;
}

export function renderSharePage(shell: string, meta: ShareMeta): string {
  const cleaned = shell
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*")[\s\S]*?>/gi, '')
    .replace(/<meta\s+name="description"[\s\S]*?>/i, '');

  const head = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    meta.noindex
      ? '<meta name="robots" content="noindex" />'
      : '<meta name="robots" content="index,follow" />',
    '<meta property="og:type" content="article" />',
    '<meta property="og:site_name" content="Exposure" />',
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    '<meta property="og:image" content="/og.svg" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<link rel="canonical" href="${escapeHtml(meta.url)}" />`,
  ].join('\n    ');

  const withHead = cleaned.replace(/<\/head>/i, `  ${head}\n  </head>`);
  if (!meta.summary) return withHead;
  return withHead.replace(
    /<body>/i,
    `<body>\n    <noscript><pre>${escapeHtml(meta.summary)}</pre></noscript>`,
  );
}
