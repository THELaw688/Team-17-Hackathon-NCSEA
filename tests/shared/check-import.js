// Checks for the neutral element layer and grid inference. Run from the repo root:
//   node tests/shared/check-import.js
//
// The strongest case here is the round trip: take a building LP.buildModel generated on a known
// grid, throw away everything except raw element geometry, and confirm LP.inferGrid recovers the
// same grid. If that holds, an imported model of a regular building will analyse like a native one.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = vm.createContext({ console });
['model.js', 'elements.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'shared', f), 'utf8'), ctx, { filename: f }));
const LP = ctx.LP;

let failed = 0;
const check = (name, actual, expected, tol = 0.01) => {
  const ok = Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${LP.round(actual, 3)}, expected ${expected}`);
};
const checkEq = (name, actual, expected) => {
  const ok = String(actual) === String(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${actual}, expected ${expected}`);
};

// --- Clustering -----------------------------------------------------------------------------
console.log('\nClustering');
const c1 = LP.cluster1d([0, 0.2, 30, 30.1, 60]);
checkEq('three columns of coordinates make three grid lines', c1.length, 3);
check('first grid line is the mean of its members', c1[0].value, 0.1);
check('second grid line', c1[1].value, 30.05);

// A chain of small steps must not merge into one wide cluster: 0, 0.9, 1.8 ... would do that if we
// compared against the previous value instead of the running mean.
const drift = LP.cluster1d([0, 0.9, 1.8, 2.7]);
checkEq('small steps do not drift into one cluster', drift.length > 1, true);

checkEq('empty input gives no clusters', LP.cluster1d([]).length, 0);

// --- Round trip: generated building -> elements -> inferred grid ----------------------------
console.log('\nRound trip from a generated building');
const built = LP.buildModel(Object.assign(LP.defaultInputs(), {
  xBays: [30, 30], yBays: [25, 25], storyHeights: [14, 14], beamSpaces: 3
}));

// Strip to raw geometry, exactly what an importer would hand us.
const elements = Object.values(built.members)
  .filter(m => ['column', 'beam', 'girder', 'deck'].includes(m.type))
  .map(m => LP.element({
    kind: m.type === 'deck' ? 'slab' : m.type,
    a: m.a, b: m.b,
    zTop: m.type === 'deck' ? m.a.z : null,
    material: 'steel', source: 'ifc', name: m.label
  }));

const grid = LP.inferGrid(elements);
checkEq('recovers 3 X grid lines', grid.xs.length, 3);
checkEq('recovers 3 Y grid lines', grid.ys.length, 3);
check('X grid spacing', grid.xs[1] - grid.xs[0], 30);
check('Y grid spacing', grid.ys[1] - grid.ys[0], 25);
checkEq('recovers 2 levels above grade', grid.elevs.length, 2);
check('first level elevation', grid.elevs[0], 14);
check('a regular building scores regularity 1.0', grid.regularity, 1);
checkEq('regular building is analysable', grid.analysisReady, true);
checkEq('grid labels follow the house convention', grid.xLabels.join('') + grid.yLabels.join(''), '123ABC');

// --- Irregularity -----------------------------------------------------------------------------
console.log('\nIrregular geometry');
const scattered = [];
for (let i = 0; i < 10; i++) {
  scattered.push(LP.element({ kind: 'column', a: { x: i * 7.3, y: i * 4.1, z: 0 }, b: { x: i * 7.3, y: i * 4.1, z: 12 } }));
}
const bad = LP.inferGrid(scattered);
checkEq('scattered columns are not analysable', bad.analysisReady, false);
checkEq('and say why', bad.warnings.length > 0, true);

// One stray column among regular ones should not disqualify the building.
const mostly = elements.concat([LP.element({ kind: 'column', a: { x: 7.3, y: 11.9, z: 0 }, b: { x: 7.3, y: 11.9, z: 14 } })]);
checkEq('one off-grid column still leaves the model analysable', LP.inferGrid(mostly).analysisReady, true);

// --- Snapping and span classification ---------------------------------------------------------
console.log('\nSnapping and classification');
const onGrid = LP.element({ kind: 'column', a: { x: 30.2, y: 25.1, z: 0 }, b: { x: 30.2, y: 25.1, z: 14 } });
const snapped = LP.snap(onGrid, grid);
checkEq('a column within tolerance snaps to its grid point', `${snapped.xi},${snapped.yi}`, '1,1');
checkEq('and is not flagged off-grid', snapped.offGrid, false);

const stray = LP.element({ kind: 'column', a: { x: 12, y: 9, z: 0 }, b: { x: 12, y: 9, z: 14 } });
checkEq('a column between grid lines is flagged off-grid', LP.snap(stray, grid).offGrid, true);

const onLine = LP.element({ kind: 'beam', a: { x: 0, y: 25, z: 14 }, b: { x: 30, y: 25, z: 14 } });
checkEq('a beam on a grid line is a girder', LP.classifySpan(onLine, grid), 'girder');
const filler = LP.element({ kind: 'beam', a: { x: 10, y: 0, z: 14 }, b: { x: 10, y: 25, z: 14 } });
checkEq('a beam between grid lines is a filler beam', LP.classifySpan(filler, grid), 'beam');

// --- modelFromElements -------------------------------------------------------------------------
console.log('\nBuilding from elements');
const b = LP.modelFromElements(elements);
checkEq('levels are created', b.levels.length, 2);
checkEq('top level is the roof', b.levels[1].isRoof, true);
check('story height', b.levels[0].height, 14);
checkEq('members are created', Object.keys(b.members).length > 0, true);
checkEq('marked as an import', b.fromImport, true);
checkEq('summary reports overall size for a unit sanity check', b.importSummary.size, '60 x 50 ft, 28 ft tall');
checkEq('summary reports the grid', b.importSummary.grids, '3 x 3');

// Walls become lateral elements with a direction and a length.
const withWall = elements.concat([LP.element({
  kind: 'wall', a: { x: 0, y: 0, z: 0 }, b: { x: 30, y: 0, z: 14 }, name: 'South wall', material: 'concrete'
})]);
const bw = LP.modelFromElements(withWall);
checkEq('a wall is picked up', bw.walls.length, 1);
checkEq('with a direction', bw.walls[0].dir, 'x');
check('and a length', bw.walls[0].length, 30);
checkEq('and creates a wall line for the collectors', bw.wallLines.length, 1);

// --- Unit detection -----------------------------------------------------------------------------
// The dangerous failure: a building 3.28x too big draws and analyses perfectly, it is just wrong.
console.log('\nUnit detection');
checkEq('feet are recognised', LP.detectLengthScale([0, 14, 27, 40]).unit, 'ft');
checkEq('metres are recognised', LP.detectLengthScale([0, 4, 8, 12]).unit, 'm');
checkEq('millimetres are recognised', LP.detectLengthScale([0, 4000, 8000, 12000]).unit, 'mm');
checkEq('inches are recognised', LP.detectLengthScale([0, 168, 336]).unit, 'in');
check('the scale converts to feet', LP.detectLengthScale([0, 4000, 8000]).scale * 4000, 13.123);
checkEq('a confident read says so', LP.detectLengthScale([0, 4000, 8000]).confident, true);

// One tall lobby storey must not drag the median off.
checkEq('a tall ground storey does not confuse it', LP.detectLengthScale([0, 24, 37, 50, 63]).unit, 'ft');

// Too little information to tell, so it must say it is unsure rather than guess silently.
checkEq('a single level is not confident', LP.detectLengthScale([0]).confident, false);
// 500 is deliberately NOT the case to use here: 500 cm is 16.4 ft, a believable storey, so a
// confident 'cm' read is right. Use a spacing no length unit can turn into a storey.
checkEq('centimetres are recognised', LP.detectLengthScale([0, 500, 1000]).unit, 'cm');
checkEq('an impossible spacing is not confident', LP.detectLengthScale([0, 100000, 200000]).confident, false);
checkEq('and falls back to metres', LP.detectLengthScale([0, 100000, 200000]).unit, 'm');

// --- Degenerate input ---------------------------------------------------------------------------
console.log('\nDegenerate input');
const empty = LP.modelFromElements([]);
checkEq('an empty model does not throw', empty.levels.length, 0);
checkEq('and is not analysable', empty.analysisReady, false);
checkEq('and says there are no columns', /No columns/.test(empty.warnings[0] || ''), true);

console.log(`\n${failed === 0 ? 'All checks passed.' : failed + ' CHECK(S) FAILED.'}`);
process.exit(failed === 0 ? 0 : 1);
