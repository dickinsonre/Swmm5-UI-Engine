/**
 * Licence compliance for the engines this app redistributes.
 *
 * This suite exists because every one of these conditions fails SILENTLY. A
 * missing NOTICE, a paraphrased NOTICE, a licence file that ships in the repo
 * but not in the deployed bundle, an engine artifact rebuilt without its
 * modification header, a second build quietly inheriting the first build's
 * licence — none of them break a build, show up in a screenshot or make a
 * single test go red. The first signal is someone else noticing.
 *
 * The trap that motivated most of these checks: HydroCouple/openswmm.engine is
 * not one licence. `swmm6_rel` is Apache-2.0 with a NOTICE, `develop` is MIT
 * (Copyright 2026 Caleb Buahin, no NOTICE), `main` is MIT (HydroCouple). This
 * app ships builds of the first two, so a notice that is correct for one
 * artifact is wrong for the other.
 *
 * What this cannot check: whether the recorded provenance is TRUE (nobody
 * recorded the build commits), or whether new marketing copy implies an
 * endorsement. See docs/swmm6-attribution.md.
 */
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  \u001b[32m✓\u001b[0m ${label}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  \u001b[31m✗ ${label}${detail ? ' — ' + detail : ''}\u001b[0m`); }
}

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * Hashes of the upstream files as fetched on 2026-09-03, trailing whitespace
 * normalised to one newline. A hash rather than a copy of the text: a second
 * copy of the NOTICE living inside a test is one more thing that can silently
 * disagree with the file that actually ships.
 *
 * If upstream changes these files, this suite fails. That is the intent — the
 * new text must be pulled in deliberately, not discovered later.
 */
const UPSTREAM_NOTICE_SHA256 = '83a3c0524ba9dd6929a5d5e110f959d318ce142ffbc2cce74616bf5866b1d5cb';
const UPSTREAM_APACHE_SHA256 = '94fcde3f05aad351a969a65f5c87b25ee3893ee7297549d6a3217bf29ccbc3aa';
const UPSTREAM_DEV_MIT_SHA256 = 'd31d6c5482aabe7a72cced9509b0c73b7fd96f401e7cbb86e066c631980f9b33';

/** Everything above this marker in NOTICE is upstream's and must not be edited. */
const ADDENDUM_MARK = '\n' + '='.repeat(80) + '\nATTRIBUTION ADDED BY THIS PROJECT';

console.log('\n\u001b[1mEngine licence compliance (OpenSWMM 6 / EPA SWMM)\u001b[0m');

console.log('\n1. The conditions have files behind them\n');
{
  for (const f of ['LICENSE', 'NOTICE',
                   'licenses/Apache-2.0-OpenSWMM.txt', 'licenses/MIT-OpenSWMM-develop.txt',
                   'swmm-engine/patches/MODIFICATIONS.md', 'docs/swmm6-attribution.md']) {
    check(`${f} exists`, existsSync(join(ROOT, f)));
  }
}

console.log('\n2. The NOTICE is reproduced verbatim, not paraphrased\n');
{
  const notice = read('NOTICE');
  check('NOTICE keeps the addendum marker', notice.includes(ADDENDUM_MARK));

  const upstream = notice.split(ADDENDUM_MARK)[0];
  check('the upstream portion is byte-for-byte what upstream published',
    sha256(upstream) === UPSTREAM_NOTICE_SHA256, sha256(upstream).slice(0, 12));

  // Spot-check the clauses most likely to be "tidied up" by a future edit.
  check('  including the public-domain / 17 USC 105 paragraph', upstream.includes('17 USC § 105'));
  check('  including the no-endorsement sentence', upstream.includes('The USEPA does not endorse this product'));
  check('  including the third-party components section', upstream.includes('THIRD-PARTY COMPONENTS'));

  // Section 4(d) permits ADDING attribution, never altering theirs.
  const addendum = notice.slice(notice.indexOf(ADDENDUM_MARK));
  check('this project states its own copyright separately from theirs',
    addendum.includes('Copyright (c) 2026 Robert Dickinson'));
  check('and carries the section 4(b) modification notice',
    /NOTICE OF MODIFICATION/.test(addendum) && addendum.includes('MODIFICATIONS.md'));
  check('and admits the build commits were never recorded',
    addendum.includes('UNRECORDED PROVENANCE'));

  // The whole point of the branch trap: one NOTICE, two engines, two licences.
  check('the Apache build is attributed to swmm6_rel', addendum.includes('Branch:  swmm6_rel'));
  check('the develop build is attributed to develop, under MIT',
    /Branch:  develop/.test(addendum) && /BUNDLED ENGINE 2[^\n]*MIT/.test(addendum));
  check('  and names its copyright holder, who is not the same as the release build\u2019s',
    addendum.includes('Copyright 2026 Caleb Buahin')
    && addendum.includes('Copyright 2026 HydroCouple Developers'));
  check('  and says plainly that the two branches differ',
    /DIFFERENT upstream\s+branches under DIFFERENT licenses/.test(addendum));
}

console.log('\n3. The full licence texts ship (an SPDX tag is not a copy)\n');
{
  const apache = read('licenses/Apache-2.0-OpenSWMM.txt');
  check('the Apache text is upstream\u2019s, unmodified',
    sha256(apache) === UPSTREAM_APACHE_SHA256, sha256(apache).slice(0, 12));
  check('  it is the whole licence, not an excerpt',
    apache.includes('TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION')
    && apache.includes('9. Accepting Warranty or Additional Liability'));
  check('  and carries their copyright line', apache.includes('Copyright 2026 HydroCouple Developers'));

  const devMit = read('licenses/MIT-OpenSWMM-develop.txt');
  check('the develop branch\u2019s MIT text is upstream\u2019s, unmodified',
    sha256(devMit) === UPSTREAM_DEV_MIT_SHA256, sha256(devMit).slice(0, 12));
  // MIT requires BOTH notices in every copy, which is easy to half-satisfy.
  check('  it carries the copyright notice', devMit.includes('Copyright 2026 Caleb Buahin'));
  check('  and the permission notice MIT requires in all copies',
    devMit.includes('The above copyright notice and this permission notice shall be included'));
}

console.log('\n4. The deployed app ships the same files, not just the repo\n');
{
  // The condition binds whoever RECEIVES the work. Someone who only ever loads
  // the deployed page never sees the repo, so repo-only files satisfy nothing
  // for them. These copies are what the About panel and its links resolve to.
  const pairs: Array<[string, string]> = [
    ['NOTICE', 'client/public/licenses/NOTICE.txt'],
    ['licenses/Apache-2.0-OpenSWMM.txt', 'client/public/licenses/Apache-2.0-OpenSWMM.txt'],
    ['licenses/MIT-OpenSWMM-develop.txt', 'client/public/licenses/MIT-OpenSWMM-develop.txt'],
    ['LICENSE', 'client/public/licenses/LICENSE-MIT.txt'],
  ];
  for (const [repoFile, servedFile] of pairs) {
    check(`${servedFile} is served`, existsSync(join(ROOT, servedFile)));
    if (!existsSync(join(ROOT, servedFile))) continue;
    check(`  and is byte-identical to ${repoFile}`, read(repoFile) === read(servedFile),
      `${read(servedFile).length} bytes`);
  }

  // Vite copies client/public verbatim into the build. If that ever changes,
  // the repo stays compliant while the thing users actually receive does not.
  check('vite does not redirect publicDir away from client/public',
    !/publicDir/.test(read('vite.config.ts')));

  // This suite runs BEFORE the bundler, so it can never see the shipped output
  // — and a conditional "check dist if it happens to be there" is worse than
  // nothing: it skips precisely when the build is broken or absent. The real
  // guard is a post-build step. All this suite can do is prove that step is
  // still wired into the build and cannot be quietly dropped.
  check('a post-build licence verifier exists', existsSync(join(ROOT, 'script/verify-dist-licenses.ts')));
  const buildScript = JSON.parse(read('package.json')).scripts.build as string;
  check('and `npm run build` runs it', buildScript.includes('verify-dist-licenses'));
  check('  after the bundler, so it sees the real output',
    buildScript.indexOf('verify-dist-licenses') > buildScript.indexOf('script/build.ts'));
}

console.log('\n5. Every redistributed engine artifact carries ITS OWN notice\n');
{
  // Object form is redistribution too, and the two builds are under different
  // licences — the failure mode is copying one banner onto both.
  const release = 'client/public/wasm6/openswmm6.js';
  const develop = 'client/public/wasm6dev/openswmm6dev.js';

  check(`${release} exists`, existsSync(join(ROOT, release)));
  if (existsSync(join(ROOT, release))) {
    const head = read(release).slice(0, 2000);
    check('  release build names the Apache licence', head.includes('Apache License, Version 2.0'));
    check('  names the copyright holder', head.includes('Copyright 2026 HydroCouple Developers'));
    check('  names the branch it came from', head.includes('swmm6_rel'));
    check('  points at the source', head.includes('github.com/HydroCouple/openswmm.engine'));
    check('  declares the sources were modified', /MODIFIED:/.test(head));
    check('  disclaims endorsement', /does not endorse/.test(head));
  }

  check(`${develop} exists`, existsSync(join(ROOT, develop)));
  if (existsSync(join(ROOT, develop))) {
    const head = read(develop).slice(0, 2000);
    check('  develop build is declared MIT', /Licensed under the MIT License/.test(head));
    check('  and NOT claimed as Apache-licensed',
      !/Licensed under the Apache License/.test(head));
    check('  names ITS copyright holder', head.includes('Copyright 2026 Caleb Buahin'));
    check('  names the develop branch', /branch develop/.test(head));
    check('  points at the full MIT text', head.includes('MIT-OpenSWMM-develop.txt'));
    check('  declares the sources were modified', /MODIFIED:/.test(head));
  }

  // A .wasm sibling with no .js glue would ship with no notice at all.
  for (const w of ['client/public/wasm6/openswmm6.wasm', 'client/public/wasm6dev/openswmm6dev.wasm']) {
    check(`${w} has its notice-bearing glue alongside it`,
      existsSync(join(ROOT, w.replace(/\.wasm$/, '.js'))));
  }
}

console.log('\n6. Section 4(b): the notice travels with the changed FILES\n');
{
  const mods = read('swmm-engine/patches/MODIFICATIONS.md');
  const patch = read('swmm-engine/patches/swmm6-lid-report.patch');

  check('the modification record cites section 4(b)', mods.includes('4(b)'));
  check('and names who made the changes', mods.includes('Robert Dickinson'));
  check('and records the licence of EACH build, not just one',
    mods.includes('Apache-2.0') && mods.includes('MIT') && mods.includes('develop'));

  // Split the patch per file so each one can be judged on its own.
  const sections = patch.split(/(?=^diff --git )/m).filter(s => s.startsWith('diff --git'));
  check('the patch touches files at all', sections.length > 0, `${sections.length} files`);

  const missing = sections
    .map(s => (s.match(/^diff --git a\/(\S+)/) as RegExpMatchArray)[1])
    .filter(f => !mods.includes(f.split('/').pop() as string));
  check('every file the patch changes appears in MODIFICATIONS.md', missing.length === 0,
    missing.length ? missing.join(', ') : `${sections.length} files recorded`);

  // A preamble on the patch is NOT the condition: once applied, each modified
  // file has to carry the notice itself. So hunk #1 of every modified file must
  // be the notice insertion.
  for (const sec of sections) {
    const f = (sec.match(/^diff --git a\/(\S+)/) as RegExpMatchArray)[1];
    const name = f.split('/').pop();
    const isNew = sec.includes('new file mode');
    const firstHunk = sec.split(/(?=^@@ )/m)[1] ?? '';

    if (!isNew) {
      const added = firstHunk.split('\n').filter(l => l.startsWith('+')).join('\n');
      check(`${name}: first hunk inserts a change notice`,
        /MODIFIED 2026-\d\d-\d\d by Robert Dickinson/.test(added) && /section 4\(b\)/.test(added));
      check(`  ${name}: the notice inserts at the top of the file`,
        /^@@ -1,\d+ \+1,\d+ @@/.test(firstHunk));
      check(`  ${name}: upstream's own header is kept below it (4(c))`,
        / \/\/ SPDX-License-Identifier|\/\*!|^ \/\*/m.test(firstHunk));
    } else {
      // New files authored here must not claim upstream's copyright. This is
      // exactly the misattribution that shipped once already: the header was
      // copied from a neighbouring upstream file.
      const added = sec.split('\n').filter(l => l.startsWith('+')).slice(0, 20).join('\n');
      check(`${name}: new file claims its real author`, added.includes('Copyright 2026 Robert Dickinson'));
      check(`  ${name}: and does not claim an upstream author's copyright`,
        !added.includes('Copyright 2026 Caleb Buahin'));
      check(`  ${name}: and says it is not part of upstream`, /NEW FILE, not part of upstream/.test(added));
    }
  }

  check('the patch carries a preamble as well', patch.split('diff --git')[0].includes('section 4(b)'));
  check('  and the preamble does not break the patch (it precedes the first diff)',
    patch.indexOf('diff --git') > 0 && /\ndiff --git a\//.test(patch));
  // Every line inside a hunk must start with +, -, space or backslash, or the
  // patch is malformed and silently does nothing useful.
  {
    let inHunk = false;
    const bad: string[] = [];
    for (const l of patch.split('\n')) {
      if (l.startsWith('@@')) { inHunk = true; continue; }
      if (l.startsWith('diff --git')) inHunk = false;
      if (inHunk && l !== '' && !'+- \\'.includes(l[0])) bad.push(l.slice(0, 40));
    }
    check('  and every hunk line is well-formed', bad.length === 0, bad.slice(0, 2).join(' | '));
  }
}

console.log('\n7. The About panel is the section 4(d) display, and is wired to real files\n');
{
  const about = read('client/src/components/swmm/AboutDialog.tsx');
  check('a licences view exists', about.includes('data-testid="licenses-view"'));
  check('it is reachable from About', about.includes('data-testid="btn-show-licenses"'));

  // Every licence file the panel points at must actually ship, or the panel is
  // a 404 wearing a compliance costume.
  const names = Array.from(about.matchAll(/\$\{LICENSES\}([A-Za-z0-9.\-]+)/g)).map(m => m[1]);
  check('the panel references the shipped licence files', names.length >= 4, names.join(' '));
  for (const n of names) {
    check(`  licenses/${n} resolves`, existsSync(join(ROOT, 'client/public/licenses', n)));
  }
  check('the panel builds those URLs from BASE_URL, not a hardcoded root',
    about.includes('import.meta.env.BASE_URL'));

  check('the NOTICE text is displayed, not merely linked', about.includes('data-testid="notice-text"'));
  check('  with a fallback when it cannot be loaded', about.includes('data-testid="notice-error"'));
  check('the panel states the engine was modified', /Modified:/.test(about));
  check('the panel names the Apache licence', about.includes('Apache License, Version 2.0'));
  check('the panel gives the develop build its own MIT licensing',
    about.includes('data-testid="dev-engine-licence"') && about.includes('data-testid="link-develop-mit"'));
  check('the panel disclaims endorsement', about.includes('data-testid="no-endorsement"'));
}

console.log('\n8. The MIT claim does not swallow the engines\n');
{
  // "Released under the MIT License" on a project that bundles an Apache-2.0
  // engine and public-domain EPA code is the single most misleading line this
  // project could ship, so every place that states a licence has to scope it.
  const mit = read('LICENSE');
  check('LICENSE is MIT', mit.startsWith('MIT License'));
  check('and says it does not cover the bundled engines', /does NOT cover the\s+simulation engines/.test(mit));
  check('and points at NOTICE', mit.includes('NOTICE'));

  const pkg = JSON.parse(read('package.json'));
  check('package.json does not declare the aggregate to be plain MIT', pkg.license !== 'MIT', pkg.license);
  check('  it declares the licences actually present', /MIT/.test(pkg.license) && /Apache-2\.0/.test(pkg.license));

  const readme = read('README.md');
  check('the README scopes its licence claim',
    readme.includes('MIT') && readme.includes('Apache-2.0') && readme.includes('NOTICE'));
  check('the README names both engine branches', readme.includes('swmm6_rel') && readme.includes('develop'));
  check('the README warns about the branch/licence split', /Branch trap/.test(readme));
  check('no bare MIT licence badge survives', !/badge\/License-MIT/.test(readme));
}

console.log('\n' + '═'.repeat(46));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('═'.repeat(46) + '\n');
process.exit(fail > 0 ? 1 : 0);
