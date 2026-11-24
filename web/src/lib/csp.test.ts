import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CSP } from '../../csp';

describe('Content-Security-Policy', () => {
  it('vercel.json sends exactly the policy tested locally (web/csp.ts)', () => {
    const vercel = JSON.parse(readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8'));
    const all = vercel.headers.flatMap((h: { headers: Array<{ key: string; value: string }> }) => h.headers);
    expect(all.find((h: { key: string }) => h.key === 'Content-Security-Policy')?.value).toBe(CSP);
  });
  it('allows no inline or third-party scripts', () => {
    const script = CSP.split('; ').find(d => d.startsWith('script-src'));
    expect(script).toBe("script-src 'self'");
  });
});
