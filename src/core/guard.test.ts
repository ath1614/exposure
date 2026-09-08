import { describe, expect, it } from 'vitest';
import { ScanError, isPrivateHost, normalizeTarget } from './guard';

describe('normalizeTarget', () => {
  it('assumes https and strips the hash', () => {
    expect(normalizeTarget('example.com/pricing#top').toString()).toBe(
      'https://example.com/pricing',
    );
  });

  it('keeps an explicit http URL', () => {
    expect(normalizeTarget('http://example.com/').protocol).toBe('http:');
  });

  it.each([
    'localhost',
    'localhost:3000',
    '127.0.0.1',
    '10.1.2.3',
    '192.168.4.5',
    '169.254.169.254',
    '[::1]',
    'metadata.google.internal',
    'printer.local',
    '0.0.0.0',
    '172.20.0.1',
  ])('refuses %s', (host) => {
    expect(() => normalizeTarget(host)).toThrow(ScanError);
  });

  it('refuses credentials in the URL', () => {
    expect(() => normalizeTarget('https://user:pass@example.com/')).toThrow(/username/);
  });

  it('refuses non-http schemes and odd ports', () => {
    expect(() => normalizeTarget('file:///etc/passwd')).toThrow(ScanError);
    expect(() => normalizeTarget('ftp://example.com/')).toThrow(ScanError);
    expect(() => normalizeTarget('https://example.com:8443/')).toThrow(/ports/);
  });

  it('accepts ordinary public hosts', () => {
    expect(() => normalizeTarget('https://stripe.com/docs')).not.toThrow();
    expect(() => normalizeTarget('sub.example.co.uk')).not.toThrow();
  });
});

describe('isPrivateHost', () => {
  it('catches IPv6 loopback, unique-local and link-local', () => {
    expect(isPrivateHost('::1')).toBe(true);
    expect(isPrivateHost('fd00::1')).toBe(true);
    expect(isPrivateHost('fe80::1')).toBe(true);
    expect(isPrivateHost('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateHost('2606:4700::1111')).toBe(false);
  });

  it('catches a bare integer host and a trailing dot', () => {
    expect(isPrivateHost('2130706433')).toBe(true);
    expect(isPrivateHost('example.com.')).toBe(false);
    expect(isPrivateHost('LOCALHOST.')).toBe(true);
  });
});
