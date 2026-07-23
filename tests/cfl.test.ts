/**
 * CFL analysis and conduit discretization tests.
 * Run with: npx tsx tests/cfl.test.ts
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createEmptyProject } from '../client/src/lib/swmm-types';
import {
  computeCflAnalysis,
  discretizeProject,
  getDefaultSettings,
  type DiscretizationSettings,
} from '../client/src/lib/cfl-analysis';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Test helpers ----
let passed = 0;
let failed = 0;

function expect(label: string, actual: unknown, expected: unknown): void {
  const ok = typeof expected === 'number' && typeof actual === 'number'
    ? Math.abs((actual as number) - (expected as number)) < 1e-6
    : JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function expectTrue(label: string, value: boolean): void {
  expect(label, value, true);
}

function expectApprox(label: string, actual: number, expected: number, tol = 0.01): void {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}  (expected ≈${expected}, got ${actual})`);
    failed++;
  }
}

// ---- Helper: build minimal SwmmProject ----
function makeProject(conduits: {
  id: string; fromNode: string; toNode: string; length: number;
  diameter?: number; shape?: string;
  fromElev?: number; toElev?: number;
  fromCoord?: [number, number]; toCoord?: [number, number];
  vertices?: [number, number][];
}[], routingStep = 60, flowUnits = 'CFS') {
  const p = createEmptyProject();
  p.options = { ...p.options, ROUTING_STEP: String(routingStep), FLOW_UNITS: flowUnits };

  for (const c of conduits) {
    p.junctions.push({ id: c.fromNode, elevation: c.fromElev ?? 0, maxDepth: 3, initDepth: 0, surDepth: 0, aponded: 0 });
    p.junctions.push({ id: c.toNode,   elevation: c.toElev   ?? 0, maxDepth: 3, initDepth: 0, surDepth: 0, aponded: 0 });
    p.conduits.push({ id: c.id, fromNode: c.fromNode, toNode: c.toNode, length: c.length, roughness: 0.013, inOffset: 0, outOffset: 0, initFlow: 0, maxFlow: 0 });
    p.xsections[c.id] = { linkId: c.id, shape: c.shape ?? 'CIRCULAR', geom1: c.diameter ?? 1.0, geom2: 0, geom3: 0, geom4: 0, barrels: 1 };
    if (c.fromCoord) p.coordinates[c.fromNode] = c.fromCoord;
    if (c.toCoord)   p.coordinates[c.toNode]   = c.toCoord;
    if (c.vertices && c.vertices.length > 0) p.vertices[c.id] = c.vertices;
  }
  return p;
}

// =====================================================================
console.log('\n=== CFL Analysis Tests ===\n');

// 1. Short conduit with large routing step should flag CFL violation
{
  console.log('1. CFL violation detection');
  const project = makeProject([{ id: 'C1', fromNode: 'J1', toNode: 'J2', length: 10, diameter: 1.0 }], 60);
  const result = computeCflAnalysis(project);
  const c = result.conduits.find(r => r.conduitId === 'C1')!;
  // celerity = sqrt(32.174 * 1.0) ≈ 5.67 ft/s
  // Courant = celerity * dt / L = 5.67 * 60 / 10 ≈ 34 >> 1
  expectTrue('violates CFL', c.violatesCfl);
  expectTrue('courant number > 1', c.courantNumber > 1);
  expect('flaggedCount', result.flaggedCount, 1);
}

// 2. Long conduit — CFL compliant
{
  console.log('\n2. CFL-compliant long conduit');
  const project = makeProject([{ id: 'C1', fromNode: 'J1', toNode: 'J2', length: 1000, diameter: 1.0 }], 60);
  const result = computeCflAnalysis(project);
  const c = result.conduits.find(r => r.conduitId === 'C1')!;
  expectTrue('compliant conduit', !c.violatesCfl);
  expect('flaggedCount', result.flaggedCount, 0);
}

// 3. SI units — gravity should be 9.81
{
  console.log('\n3. SI units gravity');
  const project = makeProject([{ id: 'C1', fromNode: 'J1', toNode: 'J2', length: 10, diameter: 1.0 }], 60, 'CMS');
  const result = computeCflAnalysis(project);
  expectApprox('gravity = 9.81', result.gravity, 9.81);
}

// =====================================================================
console.log('\n=== Discretization Tests ===\n');

// 4. Splitting a conduit produces correct number of segments
{
  console.log('4. Segment count after split');
  const project = makeProject([{
    id: 'C1', fromNode: 'J1', toNode: 'J2', length: 300, diameter: 1.0,
    fromCoord: [0, 0], toCoord: [300, 0],
  }]);
  const settings: DiscretizationSettings = { ...getDefaultSettings(), fixedMaxLength: 100, fixedMinLength: 50, lengtheningEnabled: false };
  const result = discretizeProject(project, settings);
  // 300 / 100 = 3 segments
  const segments = result.project.conduits.filter(c => c.id.startsWith('C1_'));
  expect('segment count', segments.length, 3);
  expect('intermediate junction count', result.stats.newJunctionCount, 2);
  expect('split count', result.stats.splitCount, 1);
}

// 5. Vertices along a bend are preserved on the correct segment
{
  console.log('\n5. Vertex preservation through a 90° bend');
  // Conduit goes right then down: J1=(0,0) → bend=(100,0) → J2=(100,-100)
  // Total path length ≈ 200. Split into 2 segments of 100 each.
  // Vertex at (100,0) lies at cumDist=100, which is exactly on the boundary.
  // It shouldn't appear in either segment (strictly inside test).
  //
  // With vertices at (50,0) — midpoint of first leg — it should go to segment 1.
  const project = makeProject([{
    id: 'C1', fromNode: 'J1', toNode: 'J2', length: 200, diameter: 1.0,
    fromCoord: [0, 0], toCoord: [100, -100],
    vertices: [[50, 0], [100, 0]],   // 50 and 100 along the path
  }]);
  const settings: DiscretizationSettings = {
    ...getDefaultSettings(),
    fixedMaxLength: 100, fixedMinLength: 100, lengtheningEnabled: false,
  };
  const result = discretizeProject(project, settings);
  // Segment 1 covers cumDist 0→100. Vertex at (50,0) (cumDist≈50) should be in seg 1.
  const seg1Verts = result.project.vertices['C1_1'];
  const seg2Verts = result.project.vertices['C1_2'];
  expectTrue('segment 1 has a vertex from the bend', (seg1Verts?.length ?? 0) >= 1);
  // Seg 2 covers cumDist 100→200. No original vertices fall strictly inside (100 is on boundary).
  expectTrue('segment 2 has no extra vertices', !seg2Verts || seg2Verts.length === 0);
}

// 6. Straight conduit (no vertices) should have no vertices on segments
{
  console.log('\n6. Straight conduit produces no spurious vertices');
  const project = makeProject([{
    id: 'C1', fromNode: 'J1', toNode: 'J2', length: 200, diameter: 1.0,
    fromCoord: [0, 0], toCoord: [200, 0],
  }]);
  const settings: DiscretizationSettings = { ...getDefaultSettings(), fixedMaxLength: 100, fixedMinLength: 100, lengtheningEnabled: false };
  const result = discretizeProject(project, settings);
  const seg1Verts = result.project.vertices['C1_1'];
  const seg2Verts = result.project.vertices['C1_2'];
  expectTrue('no extra vertices on seg 1', !seg1Verts || seg1Verts.length === 0);
  expectTrue('no extra vertices on seg 2', !seg2Verts || seg2Verts.length === 0);
}

// 7. Lengthening: very short conduit gets extended
{
  console.log('\n7. Lengthening short conduit');
  const project = makeProject([{
    id: 'C1', fromNode: 'J1', toNode: 'J2', length: 1, diameter: 1.0,
  }]);
  const settings: DiscretizationSettings = { ...getDefaultSettings(), lengtheningEnabled: true, lengtheningStep: 5 };
  const result = discretizeProject(project, settings);
  expectTrue('conduit was lengthened', result.stats.lengtheningCount > 0);
  expectTrue('lengthened conduit is longer than original', result.project.conduits[0].length > 1);
}

// 8. Conduit without coordinates still splits correctly (no crash)
{
  console.log('\n8. No-coordinate conduit splits without error');
  const project = makeProject([{ id: 'C1', fromNode: 'J1', toNode: 'J2', length: 200 }]);
  const settings: DiscretizationSettings = { ...getDefaultSettings(), fixedMaxLength: 100, fixedMinLength: 100, lengtheningEnabled: false };
  let threw = false;
  try { discretizeProject(project, settings); }
  catch { threw = true; }
  expectTrue('no exception thrown', !threw);
}

// ---- Summary ----
console.log(`\n${'─'.repeat(40)}`);
console.log(`CFL tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
