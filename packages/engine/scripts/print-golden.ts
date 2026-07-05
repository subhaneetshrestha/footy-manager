/**
 * Regenerates test/golden.json — the committed cross-host determinism baseline.
 * Only run this deliberately when the engine's sampling logic changes; CI
 * recomputes the battery on ubuntu/windows/macos and compares to this file.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeGolden } from '../test/battery';

const golden = computeGolden();
const outPath = fileURLToPath(new URL('../test/golden.json', import.meta.url));
writeFileSync(outPath, `${JSON.stringify(golden, null, 2)}\n`);
console.log(`wrote ${outPath}`);
console.log(golden);
