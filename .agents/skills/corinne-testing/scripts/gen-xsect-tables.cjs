/**
 * Regenerate xsect-tables.js from the EPA SWMM source in this repo.
 *
 * The tables are NOT transcribed by hand — they are lifted from
 * src/solver/xsect.dat so the numbers in a verification report trace back to
 * the engine's own constants. Re-run after changing the vendored engine:
 *
 *   node .agents/skills/corinne-testing/scripts/gen-xsect-tables.cjs
 */
const fs = require('fs');
const path = require('path');

const DAT = process.argv[2] ||
  'swmm-engine/Stormwater-Management-Model-5.2.4/src/solver/xsect.dat';
const OUT = path.join(__dirname, 'xsect-tables.json');

// aFull and wMax as multiples of yFull, read from xsect_setParams() in xsect.c.
// k = aFull / (wMax * yFull) is the factor that turns a normalised area slope
// into a normalised width, so the two tables become directly comparable.
const SHAPES = {
  CIRCULAR:       { area: 'A_Circ',          width: 'W_Circ',          aFull: Math.PI / 4, wMax: 1.0 },
  EGGSHAPED:      { area: 'A_Egg',           width: 'W_Egg',           aFull: 0.5105,  wMax: 2 / 3 },
  HORSESHOE:      { area: 'A_Horseshoe',     width: 'W_Horseshoe',     aFull: 0.8293,  wMax: 1.0 },
  BASKETHANDLE:   { area: 'A_Baskethandle',  width: 'W_BasketHandle',  aFull: 0.7862,  wMax: 0.944 },
  // No area table: area is recovered by inverting the depth-of-area table.
  GOTHIC:         { invert: 'Y_Gothic',      width: 'W_Gothic',        aFull: 0.6554,  wMax: 0.84 },
  CATENARY:       { invert: 'Y_Catenary',    width: 'W_Catenary',      aFull: 0.70277, wMax: 0.9 },
  SEMIELLIPTICAL: { invert: 'Y_SemiEllip',   width: 'W_SemiEllip',     aFull: 0.785,   wMax: 1.0 },
  SEMICIRCULAR:   { invert: 'Y_SemiCirc',    width: 'W_SemiCirc',      aFull: 1.2697,  wMax: 1.64 },
};

function parseTables(src) {
  const clean = src.replace(/\/\/[^\n]*/g, '');
  const re = /double\s+([A-Za-z_0-9]+)\s*\[\s*(\d+)\s*\]\s*=\s*\{([^}]*)\}/g;
  const out = {};
  let m;
  while ((m = re.exec(clean))) {
    const name = m[1];
    const n = parseInt(m[2], 10);
    const nums = m[3].split(',').map(s => s.trim()).filter(Boolean).map(Number);
    if (nums.length === n && nums.every(Number.isFinite)) out[name] = nums;
  }
  return out;
}

/** The tables each supported shape needs, so a missing one is a hard error. */
function neededTables() {
  const need = new Set();
  for (const s of Object.values(SHAPES)) {
    if (s.area) need.add(s.area);
    if (s.invert) need.add(s.invert);
    need.add(s.width);
  }
  return [...need];
}

function main() {
  if (!fs.existsSync(DAT)) {
    console.error(`xsect.dat not found at ${DAT}`);
    console.error('Pass the path as the first argument.');
    process.exit(1);
  }
  const all = parseTables(fs.readFileSync(DAT, 'utf8'));
  const tables = {};
  for (const name of neededTables()) {
    if (!all[name]) {
      console.error(`Table ${name} missing from ${DAT} — engine source changed?`);
      process.exit(1);
    }
    tables[name] = all[name];
  }
  // JSON, not JS: the scripts read it with readFileSync so they stay plain
  // node with no loader flags and no import assertions.
  const doc = {
    GENERATED: 'do not edit by hand; run gen-xsect-tables.cjs',
    SOURCE: 'SWMM 5.2.4 src/solver/xsect.dat',
    SOURCE_PATH: DAT,
    SHAPES,
    TABLES: tables,
  };
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1));
  console.log(`wrote ${OUT}: ${Object.keys(tables).length} tables, ${Object.keys(SHAPES).length} shapes`);
}

main();
