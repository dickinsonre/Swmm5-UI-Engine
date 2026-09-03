/**
 * Post-build licence check. Runs AFTER the bundler, as the last step of
 * `npm run build`.
 *
 * tests/attribution.test.ts can only inspect the repo, and it runs before the
 * bundler, so it can never see the thing that is actually shipped. Everything
 * it proves is undone if the build stops copying client/public — the repo
 * stays perfectly compliant while users receive an app with no licence files
 * and dead links in the About panel. That failure is silent: no error, no
 * missing import, just a 404 nobody clicks.
 *
 * So this runs on the real output, unconditionally, and fails the build.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'client/public/licenses');
const OUT = join(ROOT, 'dist/public/licenses');

const REQUIRED = [
  'NOTICE.txt',
  'Apache-2.0-OpenSWMM.txt',
  'MIT-OpenSWMM-develop.txt',
  'LICENSE-MIT.txt',
];

/** Engine glue that must reach the build with its licence banner intact. */
const BANNERS: Array<[string, RegExp]> = [
  ['wasm6/openswmm6.js', /Apache License, Version 2\.0/],
  ['wasm6dev/openswmm6dev.js', /Licensed under the MIT License/],
];

const problems: string[] = [];

if (!existsSync(join(ROOT, 'dist/public'))) {
  problems.push('dist/public does not exist — the client build did not run');
} else {
  for (const f of REQUIRED) {
    const out = join(OUT, f);
    if (!existsSync(out)) { problems.push(`missing from the build: dist/public/licenses/${f}`); continue; }
    if (readFileSync(out, 'utf8') !== readFileSync(join(SRC, f), 'utf8')) {
      problems.push(`altered by the build: dist/public/licenses/${f}`);
    }
  }

  for (const [rel, banner] of BANNERS) {
    const out = join(ROOT, 'dist/public', rel);
    if (!existsSync(out)) { problems.push(`missing from the build: dist/public/${rel}`); continue; }
    // Read only the head: these files are megabytes of Emscripten glue.
    if (!banner.test(readFileSync(out, 'utf8').slice(0, 4000))) {
      problems.push(`licence banner stripped from dist/public/${rel}`);
    }
  }

  const html = join(ROOT, 'dist/public/index.html');
  if (!existsSync(html)) problems.push('missing from the build: dist/public/index.html');
  else if (!/OpenSWMM/.test(readFileSync(html, 'utf8'))) {
    problems.push('the attribution comment was stripped from dist/public/index.html');
  }
}

if (problems.length) {
  console.error('\n\u001b[31mBUILD FAILED — the shipped output is not licence-compliant\u001b[0m');
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('\nThe repo may still be compliant; what users receive is not.');
  console.error('See docs/swmm6-attribution.md.\n');
  process.exit(1);
}

console.log(`✓ licences verified in the build (${REQUIRED.length} files, ${BANNERS.length} engine banners, index.html)`);
