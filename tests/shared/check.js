// Hand-calc check cases for src/shared/. Run from the repo root:  node tests/shared/check.js
// Test building: 2 x 2 bays (30 ft in X, 25 ft in Y), 2 stories of 14 ft,
// floor 80 + 50 psf, roof 30 + 20 psf, 3 beam spaces per bay (10 ft spacing).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = vm.createContext({ console });
['model.js', 'gravity.js', 'lateral.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'shared', f), 'utf8'), ctx, { filename: f }));
const LP = ctx.LP;

let failed = 0;
const check = (name, actual, expected, tol = 0.01) => {
  const ok = Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${LP.round(actual, 3)}, expected ${expected}`);
};

const inputs = (lateral, walls) => Object.assign(LP.defaultInputs(), {
  xBays: [30, 30], yBays: [25, 25], storyHeights: [14, 14],
  floorDead: 80, floorLive: 50, roofDead: 30, roofLive: 20, beamSpaces: 3,
  walls: walls || [
    { id: 'WS', name: 'South wall', dir: 'x', at: 0, from: 0, to: 30 },
    { id: 'WN', name: 'North wall', dir: 'x', at: 50, from: 0, to: 30 },
    { id: 'WW', name: 'West wall', dir: 'y', at: 0, from: 0, to: 25 },
    { id: 'WE', name: 'East wall', dir: 'y', at: 60, from: 0, to: 25 }
  ],
  lateral: Object.assign({ type: 'wind', dir: 'x', windPressure: 20, Cs: 0.1, diaphragm: 'flexible' }, lateral)
});
const run = (lat, walls) => { const b = LP.buildModel(inputs(lat, walls)); LP.runGravity(b); LP.runLateral(b); return b; };
const g = (b, id) => b.members[id].results.gravity.value;
const l = (b, id) => b.members[id].results.lateral.value;

console.log('\nGravity');
let b = run({});
check('Filler beam reaction: 130 psf x 10 ft x 25 ft / 2', b.members['BM-L2-10-0'].results.gravity.reaction, 16.25);
check('Interior girder B, bay 1-2: total reactions', g(b, 'GD-L2-B-0'), 65);
check('Column B2 load collected at Level 2 = 130 psf x 750 sq ft', b.members['COL-B2-L2'].results.gravity.fromLevel, 97.5);
check('Center column B2 at roof = 50 psf x 750 sq ft', g(b, 'COL-B2-R'), 37.5);
check('Center footing B2 = 97.5 + 37.5', g(b, 'FTG-B2'), 135);
check('Column A1 load collected at Level 2 = 130 psf x 187.5 sq ft', b.members['COL-A1-L2'].results.gravity.fromLevel, 24.375);
const totalLoad = (130 + 50) * 60 * 50 / 1000;
check('Sum of footings = total building load', Object.values(b.members).filter(m => m.type === 'footing').reduce((s, m) => s + m.results.gravity.value, 0), totalLoad);

console.log('\nLateral: wind X, 20 psf, flexible');
check('Level 2 story force = 20 x 50 x 14 / 1000', l(b, 'LAT-L2'), 14);
check('Roof story force = 20 x 50 x 7 / 1000', l(b, 'LAT-R'), 7);
check('South wall, story 2 shear = 7 / 2', l(b, 'WS-R'), 3.5);
check('South wall, story 1 shear = 3.5 + 7', l(b, 'WS-L2'), 10.5);
check('South wall base overturning hold-down = (3.5 x 28 + 7 x 14) / 30', b.members['WS-L2'].results.lateral.holdDown, 6.533);
check('Level 2 chord = (0.28 klf x 50^2 / 8) / 60', l(b, 'CHORD-L2-W'), 1.458);
check('Level 2 collector on y = 0 = 7 k x 30 / 60', l(b, 'COLL-L2-x0'), 3.5);
check('East-west walls carry no X load (flexible)', l(b, 'WW-L2'), 0);

console.log('\nLateral: seismic X, Cs = 0.1');
b = run({ type: 'seismic' });
check('Base shear = 0.1 x (240 + 90)', l(b, 'LAT-L2') + l(b, 'LAT-R'), 33);
check('Level 2 force = 33 x 3360 / 5880', l(b, 'LAT-L2'), 18.857);

console.log('\nLateral: rigid diaphragm with an eccentric wall layout');
const ecc = [
  { id: 'WS', name: 'South wall', dir: 'x', at: 0, from: 0, to: 60 },
  { id: 'WN', name: 'North wall', dir: 'x', at: 50, from: 0, to: 20 },
  { id: 'WW', name: 'West wall', dir: 'y', at: 0, from: 0, to: 25 },
  { id: 'WE', name: 'East wall', dir: 'y', at: 60, from: 0, to: 25 }
];
b = run({ diaphragm: 'rigid' }, ecc);
check('Center of rigidity y = 20 x 50 / 80', b.rigid.cr, 12.5);
check('Parallel walls carry the story force', l(b, 'WS-R') + l(b, 'WN-R'), 7);
check('Perpendicular wall torsion forces balance', b.members['WW-R'].results.lateral.shear + b.members['WE-R'].results.lateral.shear, 0);
const bf = run({ diaphragm: 'flexible' }, ecc);
console.log(`      North wall, story 1 shear: flexible ${LP.round(l(bf, 'WN-L2'))} k vs rigid ${LP.round(l(b, 'WN-L2'))} k`);

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
