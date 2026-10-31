import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cumulativeToIncremental,
  incrementalToCumulative,
  computeLinkRatios,
  evaluateActuarialModel,
  runAutoOptimizeReserve,
  runOdpBootstrapSimulation,
  parseTriangleCsv,
  ActuarialInput,
} from './actuarial-engine';
import { TAYLOR_ASHE_1983, COMMERCIAL_AUTO_BI } from './presets';

function makeDefaultInput(preset = TAYLOR_ASHE_1983): ActuarialInput {
  const n = preset.originYears.length;
  const m = preset.devPeriods.length;
  return {
    originYears: [...preset.originYears],
    devPeriods: [...preset.devPeriods],
    cumulativeTriangle: preset.cumulativeTriangle.map((r) => [...r]),
    earnedPremium: [...preset.earnedPremium],
    aprioriElr: [...preset.aprioriElr],
    exclusions: Array.from({ length: n }, () => new Array(m - 1).fill(false)),
    selectedLdfMode: 'vw_all',
    manualLdfs: new Array(m - 1).fill(null),
    tailFactor: 1.0,
    selectedMethods: new Array(n).fill('CL'),
    methodWeights: Array.from({ length: n }, () => ({ cl: 1, bf: 0, cc: 0 })),
  };
}

test('Cumulative <-> Incremental transformation preserves lower-right null values and exact math', () => {
  const cum = TAYLOR_ASHE_1983.cumulativeTriangle;
  const inc = cumulativeToIncremental(cum);
  const roundTrip = incrementalToCumulative(inc);

  for (let i = 0; i < cum.length; i++) {
    for (let j = 0; j < cum[i].length; j++) {
      if (cum[i][j] === null) {
        assert.equal(inc[i][j], null, `Cell (${i},${j}) incremental must be null`);
        assert.equal(roundTrip[i][j], null, `Cell (${i},${j}) round-trip must be null`);
      } else {
        assert.ok(
          Math.abs((roundTrip[i][j] ?? 0) - (cum[i][j] ?? 0)) < 1e-6,
          `Cell (${i},${j}) round-trip mismatch`
        );
      }
    }
  }
});

test('Zero-division protection returns null Link Ratio when C_{i,j} is 0', () => {
  const triangleWithZero: (number | null)[][] = [
    [0, 500, 1000],
    [250, 500, null],
    [300, null, null],
  ];
  const ratios = computeLinkRatios(triangleWithZero);
  assert.equal(ratios[0][0], null, '0 -> 500 link ratio must be null (no division by zero)');
  assert.equal(ratios[0][1], 2.0, '500 -> 1000 link ratio must be 2.0');
  assert.equal(ratios[1][0], 2.0, '250 -> 500 link ratio must be 2.0');
});

test('Taylor & Ashe (1983) Chain Ladder Total IBNR and Mack (1993) Standard Error match benchmark values', () => {
  const input = makeDefaultInput(TAYLOR_ASHE_1983);
  const res = evaluateActuarialModel(input);

  // First Volume-Weighted LDF (12->24): 11590493 / 3327371 = 3.490607...
  assert.ok(
    Math.abs(res.selectedLdfs[0] - 3.490607) < 0.001,
    `Expected first VW LDF ~3.4906, got ${res.selectedLdfs[0]}`
  );

  // Classic Taylor & Ashe (1983) Volume-Weighted Chain Ladder Total Reserve is ~18,680,856
  assert.ok(
    Math.abs(res.totals.clIbnr - 18680856) < 50,
    `Expected Taylor & Ashe CL Total IBNR ~18,680,856, got ${res.totals.clIbnr}`
  );

  // Classic Mack (1993) Total Standard Error for Taylor & Ashe is ~2,447,095 (CV ~13.1%)
  assert.ok(
    Math.abs(res.totals.mackTotalSe - 2447095) < 500,
    `Expected Mack Total SE ~2,447,095, got ${res.totals.mackTotalSe}`
  );
});

test('Outlier cell exclusion dynamically updates LDF averages and Total IBNR', () => {
  const input = makeDefaultInput(TAYLOR_ASHE_1983);
  const baseline = evaluateActuarialModel(input);

  // Exclude cell (3, 0): 2018 origin 12->24 link ratio (1418858 / 310608 = 4.5680, highest in col 0)
  input.exclusions[3][0] = true;
  const afterExclusion = evaluateActuarialModel(input);

  assert.ok(
    afterExclusion.ldfAverages.vw_all[0] < baseline.ldfAverages.vw_all[0],
    'Excluding high link ratio at (3,0) must lower column 0 Volume-Weighted LDF'
  );
  assert.notEqual(
    afterExclusion.totals.selectedIbnr,
    baseline.totals.selectedIbnr,
    'Total IBNR must change when outlier cell is excluded'
  );
});

test('Bornhuetter-Ferguson (BF) and Cape Cod (CC) methods compute valid reserves', () => {
  const input = makeDefaultInput(TAYLOR_ASHE_1983);
  input.selectedMethods = input.originYears.map((_, i) => (i < 5 ? 'CL' : i < 8 ? 'CC' : 'BF'));
  const res = evaluateActuarialModel(input);

  assert.ok(res.totals.bfIbnr > 0, 'Total BF IBNR must be positive');
  assert.ok(res.totals.ccIbnr > 0, 'Total CC IBNR must be positive');
  assert.ok(res.capeCodElr > 0.5 && res.capeCodElr < 1.2, 'Cape Cod ELR must be in realistic range');
  assert.equal(res.rows[0].clIbnr, 0, 'Oldest fully developed year (tail=1.0) must have 0 CL IBNR');
});

test('Tail Curve Fitting & Auto-Optimize Reserve detect statistical outliers and fit tail', () => {
  const input = makeDefaultInput(COMMERCIAL_AUTO_BI);
  const opt = runAutoOptimizeReserve(input);

  assert.ok(opt.detectedOutliers.length >= 1, 'Auto-Optimize should detect shock outliers in Commercial Auto BI');
  assert.ok(opt.recommendedTailFactor >= 1.0, 'Recommended tail factor must be >= 1.0');
  assert.equal(opt.recommendedMethods[0], 'CL', 'Most mature year should be assigned CL');
  assert.equal(opt.recommendedMethods[9], 'BF', 'Greenfield year should be assigned BF');
});

test('ODP Bootstrap Simulation computes monotonic percentiles and Pearson residuals', () => {
  const input = makeDefaultInput(TAYLOR_ASHE_1983);
  const sim = runOdpBootstrapSimulation(input, 500, 42);

  assert.equal(sim.iterations, 500);
  assert.ok(sim.meanIbnr > 10000000, 'Bootstrap mean IBNR should be realistic');
  assert.ok(sim.stdDevIbnr > 0, 'Bootstrap standard deviation must be positive');
  assert.equal(sim.percentiles.length, 6);
  // Check strict monotonicity of percentiles (50% < 75% < 85% < 90% < 95% < 99.5%)
  for (let k = 1; k < sim.percentiles.length; k++) {
    assert.ok(
      sim.percentiles[k].ibnrValue >= sim.percentiles[k - 1].ibnrValue,
      'Bootstrap percentiles must be non-decreasing'
    );
  }
  assert.ok(sim.residuals.length > 30, 'Pearson residuals should be populated for upper triangle');
});

test('CSV Parser parses wide triangle format accurately', () => {
  const csv = [
    'OriginYear,12,24,36,EarnedPremium,ELR',
    '2022,1000,2500,3200,5000,0.75',
    '2023,1200,2800,,5500,0.78',
    '2024,1400,,,6000,0.80',
  ].join('\n');

  const parsed = parseTriangleCsv(csv);
  assert.deepEqual(parsed.originYears, [2022, 2023, 2024]);
  assert.deepEqual(parsed.devPeriods, [12, 24, 36]);
  assert.equal(parsed.cumulativeTriangle[1][2], null);
  assert.equal(parsed.cumulativeTriangle[2][1], null);
  assert.equal(parsed.earnedPremium[0], 5000);
});
