/**
 * Regression: a .out arriving as a Uint8Array view with a NON-ZERO byteOffset
 * (as happens across worker message boundaries) must still parse as
 * native-binary via toExactArrayBuffer for both worker engine branches.
 * Run: npx tsx tests/out-offset.test.ts
 */
import { readFileSync } from 'node:fs';
import { toExactArrayBuffer } from '../client/src/lib/swmm-engine';
import { parseSwmmOut } from '../client/src/lib/swmm-out-parser';
import { parseInpFile } from '../client/src/lib/inp-parser';

const outBytes = readFileSync('swmm-engine/Stormwater-Management-Model-5.2.4/tests/outfile/data/Example1.out');
const inpText = readFileSync('client/public/samples/User1.inp', 'utf8');
const project = parseInpFile(inpText);

// Build a Uint8Array view at a non-zero offset into a larger buffer
const PAD = 13;
const big = new Uint8Array(PAD + outBytes.length + 7);
big.set(outBytes, PAD);
const view = new Uint8Array(big.buffer, PAD, outBytes.length);
if (view.byteOffset === 0) throw new Error('test setup broken: offset is 0');

// Direct .buffer would mis-read (magic not at offset 0) — normalized must work
const buf = toExactArrayBuffer(view);
if (buf.byteLength !== outBytes.length) throw new Error('normalized buffer wrong length');
const parsed = parseSwmmOut(buf, project);
if (!parsed.timeSteps.length) throw new Error('no time steps parsed');
console.log(`PASS: parsed ${parsed.timeSteps.length} time steps from offset-${PAD} view`);

// Zero-offset full-buffer views pass through without copying
const exact = new Uint8Array(outBytes.length);
exact.set(outBytes);
if (toExactArrayBuffer(exact) !== exact.buffer) throw new Error('expected pass-through for exact view');
console.log('PASS: exact view passes through unchanged');
