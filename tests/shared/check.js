// Hand-calc check cases for src/shared/. Run from the repo root:  node tests/shared/check.js
// Test building: 2 x 2 bays (30 ft in X, 25 ft in Y), 2 stories of 14 ft,
// floor 80 + 50 psf, roof 30 + 20 psf, 3 beam spaces per bay (10 ft spacing).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = vm.createContext({ console });
['model.js', 'gravity.js', 'lateral.js', 'diagrams.js'].forEach(f =>
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

// Gravity-only runs for other buildings; walls fall back to the preset since lateral isn't checked here.
const runG = over => { const m = LP.buildModel(Object.assign(inputs({}), { walls: null }, over)); LP.runGravity(m); return m; };
const fromLevel = (m, id) => m.members[id].results.gravity.fromLevel;
const footingSum = m => Object.values(m.members).filter(x => x.type === 'footing').reduce((s, x) => s + x.results.gravity.value, 0);

console.log('\nGravity: edge and corner columns (same 2 x 2 building)');
check('Edge column A2 at Level 2 = 130 psf x (30 x 12.5 = 375 sq ft)', fromLevel(b, 'COL-A2-L2'), 48.75);
check('Edge column B1 at Level 2 = 130 psf x (15 x 25 = 375 sq ft)', fromLevel(b, 'COL-B1-L2'), 48.75);
check('Corner column C3 = corner A1 by symmetry', fromLevel(b, 'COL-C3-L2'), 24.375);
check('Corner column A1 at roof = 50 psf x 187.5 sq ft', g(b, 'COL-A1-R'), 9.375);
check('Edge column A2, story 1 = 48.75 from Level 2 + 18.75 from roof', g(b, 'COL-A2-L2'), 67.5);
check('Corner footing A1 = (130 + 50) psf x 187.5 sq ft', g(b, 'FTG-A1'), 33.75);

console.log('\nGravity: unequal bays (X 20 + 40 ft, Y 24 + 30 ft)');
const u = runG({ xBays: [20, 40], yBays: [24, 30] });
check('Filler beam x = 33.33, bay B-C = 130 psf x 13.33 ft x 30 ft / 2', u.members['BM-L2-33.333-1'].results.gravity.reaction, 26);
check('Girder B, bay 2-3 = 2 beams x 130 psf x 13.33 ft x (12 + 15) ft', g(u, 'GD-L2-B-1'), 93.6);
check('Interior column B2 at Level 2 = 130 psf x (10 + 20) x (12 + 15) = 810 sq ft', fromLevel(u, 'COL-B2-L2'), 105.3);
check('Corner column A1 at Level 2 = 130 psf x (10 x 12 = 120 sq ft)', fromLevel(u, 'COL-A1-L2'), 15.6);
check('Corner column C3 at Level 2 = 130 psf x (20 x 15 = 300 sq ft)', fromLevel(u, 'COL-C3-L2'), 39);
check('Sum of footings = (130 + 50) psf x 60 x 54', footingSum(u), 583.2);

console.log('\nGravity: one-bay building (30 x 25 ft, 2 stories)');
const one = runG({ xBays: [30], yBays: [25] });
check('Every column is a corner: B2 at Level 2 = 130 psf x 187.5 sq ft', fromLevel(one, 'COL-B2-L2'), 24.375);
check('Girder A carries beams from one side only = 2 x 16.25', g(one, 'GD-L2-A-0'), 32.5);
check('Sum of footings = (130 + 50) psf x 30 x 25', footingSum(one), 135);

console.log('\nGravity: one bay, one story, no filler beams (deck spans 30 ft to the grid beams)');
const bare = runG({ xBays: [30], yBays: [25], storyHeights: [14], beamSpaces: 1 });
check('Grid beam on line 1 = 50 psf x 15 ft x 25 ft / 2', bare.members['BM-R-0-0'].results.gravity.reaction, 9.375);
check('Girders carry nothing with no filler beams', g(bare, 'GD-R-A-0'), 0);
check('Footing A1 = 50 psf x 187.5 sq ft', g(bare, 'FTG-A1'), 9.375);
check('Sum of footings = 50 psf x 30 x 25', footingSum(bare), 37.5);

console.log('\nGravity: tributary areas (what the 3D view shades for a selected member)');
const ta = (m, id) => m.members[id].results.gravity.tribArea;
check('Filler beam BM-L2-10-0 = 10 ft x 25 ft', ta(b, 'BM-L2-10-0').area, 250);
check('Girder B, bay 1-2 = 2 beams x 10 ft x (12.5 + 12.5) ft', ta(b, 'GD-L2-B-0').area, 500);
check('Unequal bays: column B2 at Level 2 = 30 ft x 27 ft', ta(u, 'COL-B2-L2').rects[0].area, 810);
check('Unequal bays: column B2, story 1 = Level 2 + roof = 2 x 810', ta(u, 'COL-B2-L2').area, 1620);
check('Footing A1 = 2 levels x 15 ft x 12.5 ft', ta(b, 'FTG-A1').area, 375);
console.log('\nGravity: member self-weight on (beams 30, girders 60, columns 50 plf), 2 x 2 building');
const swOn = { selfWeight: { on: true } };
const s = runG(swOn);
check('Filler beam reaction = (1.30 + 0.03 klf) x 25 ft / 2', s.members['BM-L2-10-0'].results.gravity.reaction, 16.625);
check('Filler beam self-weight = 0.03 klf x 25 ft', s.members['BM-L2-10-0'].results.gravity.selfWeight, 0.75);
check('Girder B, bay 1-2 = 4 beam ends x 16.625 + 0.06 klf x 30 ft', g(s, 'GD-L2-B-0'), 68.3);
check('Column B2 below roof = 37.5 + 4.05 roof framing self-weight + 0.05 klf x 14 ft', g(s, 'COL-B2-R'), 42.25);
check('Column B2 below Level 2 = 101.55 framing + 42.25 above + 0.7 own', g(s, 'COL-B2-L2'), 144.5);
check('Corner footing A1 = 26.025 + 11.725 + 0.7', g(s, 'FTG-A1'), 38.45);
check('Sum of footings = 540 + 2 x (beams 10.5 + girders 10.8 + columns 6.3)', footingSum(s), 595.2);
const su = runG(Object.assign({ xBays: [20, 40], yBays: [24, 30] }, swOn));
check('Unequal bays: sum of footings = 583.2 + 2 x (11.34 + 10.8 + 6.3)', footingSum(su), 640.08);
const heavyCols = runG({ selfWeight: { on: true, beam: 0, girder: 0, column: 100 } });
check('Custom weights: footing B2 = 135 + 2 stories x 0.1 klf x 14 ft', g(heavyCols, 'FTG-B2'), 137.8);

console.log('\nGravity: live load reduction, ASCE 7 4.7 (floor Lo = 50 psf; roof live not reduced)');
const llr = runG({ liveLoadReduction: true });
const red = (m, id) => m.members[id].results.gravity.liveReduction;
check('Filler beam: K_LL AT = 2 x 250 = 500, L/Lo = 0.25 + 15/sqrt(500)', red(llr, 'BM-L2-10-0').factor, 0.92082, 1e-4);
check('Filler beam = 32.5 - 12.5 k live x (1 - 0.92082)', g(llr, 'BM-L2-10-0'), 31.51025, 1e-4);
check('Girder B, bay 1-2 = 65 - 25 k x (1 - (0.25 + 15/sqrt(2 x 500)))', g(llr, 'GD-L2-B-0'), 58.10855, 1e-4);
check('Column B2 below Level 2 = 135 - 37.5 k x (1 - (0.25 + 15/sqrt(4 x 750)))', g(llr, 'COL-B2-L2'), 117.14479, 1e-4);
check('Corner column A1 below Level 2 = 33.75 - 9.375 k x (1 - (0.25 + 15/sqrt(4 x 187.5)))', g(llr, 'COL-A1-L2'), 31.85365, 1e-4);
check('Grid beam on line 1: K_LL AT = 2 x 125 = 250 < 400, no reduction', red(llr, 'BM-L2-0-0').factor, 1, 1e-4);
check('Column B2 below roof supports no floor: not reduced', g(llr, 'COL-B2-R'), 37.5, 1e-4);
const llr3 = runG({ storyHeights: [14, 13, 13], liveLoadReduction: true });
check('3 stories: column B2 below Level 2, 2 floors, AT = 1500: L/Lo = 0.25 + 15/sqrt(6000)', red(llr3, 'COL-B2-L2').factor, 0.44365, 1e-4);
check('3 stories: column B2 below Level 2 = 232.5 - 75 k x (1 - 0.44365)', g(llr3, 'COL-B2-L2'), 190.77367, 1e-4);
check('3 stories: column B2 below Level 3, 1 floor = 135 - 37.5 k x (1 - 0.52386)', g(llr3, 'COL-B2-L3'), 117.14479, 1e-4);
const llrBig = runG({ xBays: [60, 60], yBays: [60, 60], liveLoadReduction: true });
check('60 ft bays: column B2, one floor: 0.25 + 15/sqrt(14400) = 0.375, limited to 0.50', red(llrBig, 'COL-B2-L2').factor, 0.5, 1e-4);
check('60 ft bays: column B2 removes half of 180 k floor live', red(llrBig, 'COL-B2-L2').removed, 90, 1e-4);
const llrHeavy = runG({ storyHeights: [14, 13, 13], floorLive: 125, liveLoadReduction: true });
check('Lo = 125 psf > 100: column supporting 2 floors reduced 20% only', red(llrHeavy, 'COL-B2-L2').factor, 0.8, 1e-4);
check('Lo = 125 psf > 100: beam supporting 1 floor not reduced', red(llrHeavy, 'BM-L2-10-0').factor, 1, 1e-4);

// Every member in every test building: load = sum of (D + L at that level) x its tributary rectangles,
// plus the self-weight it picks up, minus any live load reduction. Columns and footings are checked
// on their total, so this also covers the column-above chain.
const wAt = (m, z) => { const lv = m.levels.find(v => Math.abs(v.elev - z) < 1e-6); return lv.dead + lv.live; };
[['2 x 2', b], ['unequal bays', u], ['one bay', one], ['no filler beams', bare],
 ['2 x 2 with self-weight', s], ['unequal bays with self-weight', su],
 ['2 x 2 with live load reduction', llr], ['3 stories with live load reduction', llr3]].forEach(([name, m]) => {
  const bad = Object.values(m.members).filter(x => x.results.gravity).filter(x => {
    const gr = x.results.gravity, fromArea = gr.tribArea.rects.reduce((s, q) => s + wAt(m, q.z) * q.area / 1000, 0);
    const removed = gr.liveReduction ? gr.liveReduction.removed : 0;
    return Math.abs(fromArea + gr.selfWeight - removed - gr.value) > 0.001 * Math.max(1, gr.value);
  });
  if (bad.length) console.log(`      mismatched: ${bad.map(x => x.id).join(', ')}`);
  check(`${name}: members whose load != pressure x tributary area + self-weight - reduction`, bad.length, 0);
});

console.log('\nLateral: wind X, 20 psf, flexible');
check('Level 2 story force = 20 x 50 x 14 / 1000', l(b, 'LAT-L2'), 14);
check('Roof story force = 20 x 50 x 7 / 1000', l(b, 'LAT-R'), 7);
check('South wall, story 2 shear = 7 / 2', l(b, 'WS-R'), 3.5);
check('South wall, story 1 shear = 3.5 + 7', l(b, 'WS-L2'), 10.5);
check('South wall base overturning hold-down = (3.5 x 28 + 7 x 14) / 30', b.members['WS-L2'].results.lateral.holdDown, 6.533);
check('Level 2 chord = (0.28 klf x 50^2 / 8) / 60', l(b, 'CHORD-L2-W'), 1.458);
check('Level 2 collector on y = 0 = 7 k x 30 / 60', l(b, 'COLL-L2-x0'), 3.5);
check('East-west walls carry no X load (flexible)', l(b, 'WW-L2'), 0);

console.log('\nLateral: custom wall layout with five walls on one gridline');
const customWalls = Array.from({ length: 5 }, (_, i) => ({
  id: `CW${i + 1}`, name: `Shear wall ${i + 1}`, dir: 'x', at: 0, from: i * 12, to: (i + 1) * 12
})).concat([{ id: 'CW6', name: 'Shear wall 6', dir: 'x', at: 50, from: 15, to: 30 }]);
const custom = run({}, customWalls);
check('Custom wall count includes five walls on one line and one on another', custom.walls.length, 6);
check('Fifth wall endpoint is at 60 ft', custom.members['CW5-L2'].b.x, 60);
check('Fifth custom wall length is 12 ft', custom.walls[4].length, 12);
check('Five walls share their gridline reaction by length', l(custom, 'CW1-R'), 0.7);
check('Custom wall on a second gridline receives its tributary reaction', l(custom, 'CW6-R'), 3.5);

console.log('\nLateral: seismic X, Cs = 0.1');
b = run({ type: 'seismic' });
check('Base shear = 0.1 x (240 + 90)', l(b, 'LAT-L2') + l(b, 'LAT-R'), 33);
check('Level 2 force = 33 x 3360 / 5880', l(b, 'LAT-L2'), 18.857);

console.log('\nLateral systems: ASCE 7 R factors and schematic geometry');
[
  ['specialSteelBracedFrame', 6, 'bracedFrame', 'frameBrace'],
  ['specialSteelMomentFrame', 8, 'momentFrame', 'momentJoint'],
  ['bucklingRestrainedBracedFrame', 8, 'brbf', 'brbfCore']
].forEach(([system, R, graphic, visualType]) => {
  const model = LP.buildModel(inputs({ type: 'seismic', mode: 'asce7', SDS: 1, SD1: 100, system }));
  check(`${LP.SYSTEMS[system].name} uses R = ${R} in Cs`, LP.seismicCs(model).Cs, 1 / R);
  check(`${LP.SYSTEMS[system].name} builds its matching 3D graphic`, model.systemKind === graphic ? 1 : 0, 1);
  check(`${LP.SYSTEMS[system].name} includes ${visualType} geometry`,
    model.systemGraphics.some(part => part.type === visualType) ? 1 : 0, 1);
});
const momentFrame = LP.buildModel(inputs({ system: 'specialSteelMomentFrame' }));
check('Moment-frame geometry has no diagonal braces',
  momentFrame.systemGraphics.some(part => part.type === 'frameBrace' || part.type === 'brbfBrace') ? 1 : 0, 0);
const momentPeriod = LP.seismicCs(LP.buildModel(inputs({
  type: 'seismic', mode: 'asce7', SDS: 1, SD1: 100, system: 'specialSteelMomentFrame'
}))).calc[1];
check('Special steel moment frame uses Table 12.8-2 period coefficients',
  momentPeriod.includes('0.028') && momentPeriod.includes('^0.8') ? 1 : 0, 1);

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

console.log('\nDiagrams: wind X, flexible, Level 2 (w = 0.28 klf over 50 ft, walls at y = 0 and 50)');
b = run({});
let d = LP.diaphragmDiagram(b, 0);
check('Diaphragm max shear = wL/2 = 0.28 x 50 / 2', d.Vmax, 7);
check('Diaphragm max moment = wL^2/8 = 0.28 x 50^2 / 8', d.Mext, 87.5);
check('Max moment at midspan', d.sAtM, 25);
check('Shear closes to zero at the far edge', d.pts.at(-1).V, 0);
check('Moment closes to zero at the far edge', d.pts.at(-1).M, 0);
check('Chord force from the diagram = M / d = 87.5 / 60 (matches the analysis)', d.Mext / d.len, l(b, 'CHORD-L2-W'));
check('Collector diagram max on y = 0 = 7 k x 30 / 60', LP.collectorDiagram(b, 0, b.wallLines.find(x => x.id === 'x0')).Fmax, 3.5);
d = LP.diaphragmDiagram(run({ diaphragm: 'rigid' }, ecc), 0);
check('Rigid, eccentric: shear still closes (wall lines carry the full story force)', d.pts.at(-1).V, 0);
check('Rigid, eccentric: moment closes once the perpendicular walls\' couple is included', d.pts.at(-1).M / Math.abs(d.Mext), 0);
const ecY = [
  { id: 'WW', name: 'West wall', dir: 'y', at: 0, from: 0, to: 50 },
  { id: 'WE', name: 'East wall', dir: 'y', at: 60, from: 0, to: 20 },
  { id: 'WS', name: 'South wall', dir: 'x', at: 0, from: 0, to: 30 },
  { id: 'WN', name: 'North wall', dir: 'x', at: 50, from: 0, to: 30 }
];
d = LP.diaphragmDiagram(run({ diaphragm: 'rigid', dir: 'y' }, ecY), 0);
check('Rigid, eccentric, Y direction: moment closes too', d.pts.at(-1).M / Math.abs(d.Mext), 0);

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
