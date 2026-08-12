// Parity gate: rows in the consolidated .lid file must match the stock
// engine's per-unit report files value-for-value.
// Usage: node scripts/parity-lid.cjs <model.lid> <goldenDir>
const fs = require('fs');
const path = require('path');

const lidFile = process.argv[2] || 'model.lid';
const goldenDir = process.argv[3] || 'tests/fixtures/golden-lid';

// unit key -> golden per-unit file (from the fixture's [LID_USAGE])
const GOLDEN = {
  'S1\tBC\t1': 'bc_s1.txt',
  'S2\tPP\t1': 'pp_s2.txt',
  'S3\tGR\t1': 'gr_s3.txt',
  'S4\tRB\t1': 'rb_s4.txt',
};

const lidText = fs.readFileSync(lidFile, 'utf8');
const resultsPart = lidText.split(/\[RESULTS\]/)[1] || '';
const byUnit = {};
for (const line of resultsPart.split('\n')) {
  if (!line.trim() || line.startsWith(';')) continue;
  const cols = line.split('\t');
  if (cols.length < 4) continue;
  const key = cols.slice(0, 3).join('\t');
  (byUnit[key] ||= []).push(cols.slice(3).join('\t').trim());
}

const norm = (s) => s.trim().split(/\s+/).join(' ');
let pass = true;
for (const [key, goldenName] of Object.entries(GOLDEN)) {
  const goldenLines = fs.readFileSync(path.join(goldenDir, goldenName), 'utf8')
    .split('\n')
    .filter((l) => /^\s*\d{2}\/\d{2}\/\d{4}/.test(l))
    .map(norm);
  const gotLines = (byUnit[key] || []).map(norm);
  const label = key.replace(/\t/g, '/');
  if (goldenLines.length !== gotLines.length) {
    console.log(`FAIL ${label}: row count ${gotLines.length} vs golden ${goldenLines.length}`);
    pass = false;
    continue;
  }
  let diffs = 0;
  for (let i = 0; i < goldenLines.length; i++) {
    if (goldenLines[i] !== gotLines[i]) {
      if (diffs < 3) {
        console.log(`DIFF ${label} row ${i}:\n  golden: ${goldenLines[i]}\n  lid:    ${gotLines[i]}`);
      }
      diffs++;
    }
  }
  if (diffs) { console.log(`FAIL ${label}: ${diffs}/${goldenLines.length} rows differ`); pass = false; }
  else console.log(`OK   ${label}: ${goldenLines.length} rows identical`);
}
// unexpected units?
for (const key of Object.keys(byUnit)) {
  if (!GOLDEN[key]) { console.log(`FAIL unexpected unit in .lid: ${key.replace(/\t/g, '/')}`); pass = false; }
}
console.log(pass ? 'PARITY: PASS' : 'PARITY: FAIL');
process.exit(pass ? 0 : 1);
