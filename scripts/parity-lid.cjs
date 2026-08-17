// Parity gate: rows in the consolidated .lid file must match the stock
// engine's per-unit report files value-for-value.
// Usage: node scripts/parity-lid.cjs <model.lid> <goldenDir>
//
// The comparison logic lives in checkLidParity() so it can be reused by the
// automated suite (tests/lid-parity.test.ts) without forking a second copy.
const fs = require('fs');
const path = require('path');

// unit key -> golden per-unit file (from the fixture's [LID_USAGE])
const GOLDEN = {
  'S1\tBC\t1': 'bc_s1.txt',
  'S2\tPP\t1': 'pp_s2.txt',
  'S3\tGR\t1': 'gr_s3.txt',
  'S4\tRB\t1': 'rb_s4.txt',
};

const norm = (s) => s.trim().split(/\s+/).join(' ');

/**
 * Compare the [RESULTS] rows of a consolidated .lid report against the stock
 * engine's golden per-unit report files, value-for-value.
 *
 * @param {object} opts
 * @param {string} opts.lidText   full text of the consolidated .lid file
 * @param {function(string):string} opts.readGolden  goldenName -> golden text
 * @param {object} [opts.golden]  unit-key -> golden filename map (defaults to GOLDEN)
 * @param {function(string):void} [opts.log]  message sink (defaults to console.log)
 * @returns {{ pass: boolean, messages: string[] }}
 */
function checkLidParity({ lidText, readGolden, golden = GOLDEN, log }) {
  const messages = [];
  const emit = (m) => { messages.push(m); if (log) log(m); };

  const resultsPart = lidText.split(/\[RESULTS\]/)[1] || '';
  const byUnit = {};
  for (const line of resultsPart.split('\n')) {
    if (!line.trim() || line.startsWith(';')) continue;
    const cols = line.split('\t');
    if (cols.length < 4) continue;
    const key = cols.slice(0, 3).join('\t');
    (byUnit[key] ||= []).push(cols.slice(3).join('\t').trim());
  }

  let pass = true;
  for (const [key, goldenName] of Object.entries(golden)) {
    const goldenLines = readGolden(goldenName)
      .split('\n')
      .filter((l) => /^\s*\d{2}\/\d{2}\/\d{4}/.test(l))
      .map(norm);
    const gotLines = (byUnit[key] || []).map(norm);
    const label = key.replace(/\t/g, '/');
    if (goldenLines.length !== gotLines.length) {
      emit(`FAIL ${label}: row count ${gotLines.length} vs golden ${goldenLines.length}`);
      pass = false;
      continue;
    }
    let diffs = 0;
    for (let i = 0; i < goldenLines.length; i++) {
      if (goldenLines[i] !== gotLines[i]) {
        if (diffs < 3) {
          emit(`DIFF ${label} row ${i}:\n  golden: ${goldenLines[i]}\n  lid:    ${gotLines[i]}`);
        }
        diffs++;
      }
    }
    if (diffs) { emit(`FAIL ${label}: ${diffs}/${goldenLines.length} rows differ`); pass = false; }
    else emit(`OK   ${label}: ${goldenLines.length} rows identical`);
  }
  // unexpected units?
  for (const key of Object.keys(byUnit)) {
    if (!golden[key]) { emit(`FAIL unexpected unit in .lid: ${key.replace(/\t/g, '/')}`); pass = false; }
  }
  emit(pass ? 'PARITY: PASS' : 'PARITY: FAIL');
  return { pass, messages };
}

module.exports = { checkLidParity, GOLDEN, norm };

// CLI entry point — behaves exactly as before.
if (require.main === module) {
  const lidFile = process.argv[2] || 'model.lid';
  const goldenDir = process.argv[3] || 'tests/fixtures/golden-lid';
  const { pass } = checkLidParity({
    lidText: fs.readFileSync(lidFile, 'utf8'),
    readGolden: (name) => fs.readFileSync(path.join(goldenDir, name), 'utf8'),
    log: (m) => console.log(m),
  });
  process.exit(pass ? 0 : 1);
}
