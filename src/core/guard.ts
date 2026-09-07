/**
 * Where the scanner is allowed to point.
 *
 * A URL-fetching service is an SSRF machine unless it refuses to look inward.
 * These checks run on the first URL and again on every redirect target.
 */

export class ScanError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ScanError';
  }
}

const BLOCKED_NAMES = [
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  'instance-data',
  'kubernetes.default',
];

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

function ipv4ToInt(host: string): number | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

const inRange = (value: number, base: string, bits: number): boolean => {
  const start = ipv4ToInt(base);
  if (start === null) return false;
  const size = 2 ** (32 - bits);
  return value >= start && value < start + size;
};

const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

/** Is this hostname one a public scanner has no business touching? */
export function isPrivateHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return true;
  if (BLOCKED_NAMES.includes(host)) return true;
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;

  const v4 = ipv4ToInt(host);
  if (v4 !== null) {
    return BLOCKED_V4.some(([base, bits]) => inRange(v4, base, bits));
  }

  if (host.includes(':')) {
    if (host === '::' || host === '::1') return true;
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
    const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateHost(mapped[1]);
    const mappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      const dotted = [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
      return isPrivateHost(dotted);
    }
  }

  // A bare integer host is an alias for an IPv4 address.
  if (/^\d+$/.test(host)) return true;

  return false;
}

const ALLOWED_PORTS = new Set(['', '80', '443']);

/** Turn whatever someone typed into a URL the scanner may fetch. */
export function normalizeTarget(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new ScanError('empty', 'Paste a URL first.');

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new ScanError('invalid', 'That does not parse as a URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ScanError('scheme', 'Only http and https URLs can be read.');
  }
  if (url.username || url.password) {
    throw new ScanError('credentials', 'Remove the username and password from the URL.');
  }
  if (isPrivateHost(url.hostname)) {
    throw new ScanError('private', 'That host is private. Exposure only reads public pages.');
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new ScanError('port', 'Only the standard ports, 80 and 443, are allowed.');
  }

  url.hash = '';
  return url;
}
