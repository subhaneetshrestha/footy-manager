/**
 * Contract §3.9: no Math.random, no Date, no libm transcendentals in engine or
 * shared source. (Math.floor/round/trunc/min/max/imul are exact and allowed.)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FORBIDDEN = [
  /Math\.random/,
  /Date\.now/,
  /new Date\(/,
  /performance\.now/,
  /Math\.exp/,
  /Math\.log/,
  /Math\.pow/,
  /Math\.sqrt/,
  /Math\.sin/,
  /Math\.cos/,
  /Math\.tan/,
];

/** The gate targets real API usage; doc comments may name the forbidden APIs. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFilesUnder(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('forbidden non-deterministic APIs', () => {
  const roots = [
    fileURLToPath(new URL('../src', import.meta.url)),
    fileURLToPath(new URL('../../shared/src', import.meta.url)),
  ];

  for (const root of roots) {
    it(`${root} is clean`, () => {
      for (const file of tsFilesUnder(root)) {
        const content = stripComments(readFileSync(file, 'utf8'));
        for (const pattern of FORBIDDEN) {
          expect(pattern.test(content), `${file} contains ${pattern}`).toBe(false);
        }
      }
    });
  }
});
