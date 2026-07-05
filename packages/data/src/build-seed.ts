/**
 * CLI wrapper for the seed build. Run: pnpm --filter @footy/data build:seed
 * The build itself lives in build/buildSeed.ts (also used by the integration
 * test suite).
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeed } from './build/buildSeed';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const outPath = join(pkgRoot, 'out', 'seed.db');
const mobileAssetPath = join(pkgRoot, '..', '..', 'apps', 'mobile', 'assets', 'db', 'seed.db');

try {
  const result = buildSeed({ outPath, copyToPath: mobileAssetPath, log: console.log });
  console.log('seed.db built successfully');
  console.log(`  file: ${result.outPath} (${(result.fileBytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`  sha256: ${result.sha256}`);
  console.log(`  counts: ${JSON.stringify(result.counts)}`);
  console.log('  league avg OVR (top/bottom 5):');
  for (const row of [...result.leagueStats.slice(0, 5), ...result.leagueStats.slice(-5)]) {
    console.log(`    ${row.key.padEnd(6)} avg ${row.avg_ovr} (${row.players} players)`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
