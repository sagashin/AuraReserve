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
  computeSolvencyIfrsCompliance,
  computeResQAdvancedMethods,
  applyReinsuranceTreatyToDataset,
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
  // Check strict monotonicity of percentiles (50% < 75% < 85% < 90% < 95% < 99.5%) and TVaR >= VaR
  for (let k = 1; k < sim.percentiles.length; k++) {
    assert.ok(
      sim.percentiles[k].ibnrValue >= sim.percentiles[k - 1].ibnrValue,
      'Bootstrap percentiles must be non-decreasing'
    );
    assert.ok(
      sim.percentiles[k].tvarIbnrValue >= sim.percentiles[k].ibnrValue,
      'Tail Value at Risk (TVaR / Expected Shortfall) must be >= VaR at every quantile'
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

test('WTW ResQ Full Method Suite (Benktander, ELR, Freq×Sev, Manual Override), Weibull Tail, Cashflow Discounting, and Merz-Wuthrich 1-Year CDR SE', () => {
  const input = makeDefaultInput(TAYLOR_ASHE_1983);
  input.discountRate = 0.03;
  input.manualUltimates = input.originYears.map((_, i) => (i === 9 ? 5500000 : null));
  input.selectedMethods = input.originYears.map((_, i) => {
    if (i === 5) return 'BENKTANDER';
    if (i === 6) return 'ELR';
    if (i === 7) return 'FREQ_SEV';
    if (i === 9) return 'MANUAL';
    return 'CL';
  });

  const res = evaluateActuarialModel(input);

  // Verify Benktander lies strictly between CL and BF when 0 < %Unreported < 1
  const row5 = res.rows[5];
  const minClBf = Math.min(row5.clUltimate, row5.bfUltimate);
  const maxClBf = Math.max(row5.clUltimate, row5.bfUltimate);
  assert.ok(
    row5.bkUltimate >= minClBf - 1e-4 && row5.bkUltimate <= maxClBf + 1e-4,
    'Benktander ultimate must be a credibility-weighted interpolation between CL and BF'
  );
  assert.equal(row5.selectedUltimate, row5.bkUltimate);

  // Verify Manual Override on origin index 9
  assert.equal(res.rows[9].selectedUltimate, 5500000, 'Manual ultimate override must take precedence when MANUAL method is selected');

  // Verify 9 LDF modes including vw_7 and geometric
  assert.equal(res.ldfAverages.vw_7.length, input.devPeriods.length - 1);
  assert.equal(res.ldfAverages.geometric.length, input.devPeriods.length - 1);
  assert.ok(res.ldfAverages.geometric[0] > 1.0, 'Geometric LDF average must be > 1.0');

  // Verify 3-Model Tail Fitting (Exponential, Inverse Power, Weibull)
  assert.ok(res.tailFitting.exponential.tailFactor >= 1.0);
  assert.ok(res.tailFitting.inversePower.tailFactor >= 1.0);
  assert.ok(res.tailFitting.weibull.tailFactor >= 1.0);

  // Verify Cashflow Projection & IFRS 17 / J-GAAP Present Value Discounting
  assert.ok(res.cashflowProjection.calendarRows.length > 0, 'Should generate future calendar-year cashflow rows');
  assert.ok(
    Math.abs(res.cashflowProjection.totalUndiscountedIbnr - res.totals.selectedIbnr) < 1e-2,
    'Total undiscounted future cashflow must reconcile to total Selected IBNR'
  );
  assert.ok(
    res.cashflowProjection.totalDiscountedIbnr < res.cashflowProjection.totalUndiscountedIbnr,
    'At 3.0% discount rate, Present Value must be strictly less than undiscounted reserve'
  );
  assert.ok(res.cashflowProjection.macaulayDurationYears > 0, 'Macaulay duration must be positive');

  // Verify Merz-Wüthrich (2008) 1-Year CDR SE vs Mack Ultimate SE
  assert.ok(res.totals.merzWuthrichTotal1YrSe > 0, 'Merz-Wuthrich 1-Year CDR SE must be positive');
  assert.ok(
    res.totals.merzWuthrichTotal1YrSe <= res.totals.mackTotalSe,
    '1-Year CDR Standard Error must be <= Ultimate Horizon Mack Standard Error'
  );
});

test('Solvency II / IFRS 17 ERM Compliance computes Required Capital (SCR), CoC Risk Margin, and IFRS 17 Fulfilment Cash Flows from ODP Bootstrap', () => {
  const input = makeDefaultInput(TAYLOR_ASHE_1983);
  input.discountRate = 0.025;
  const evaluation = evaluateActuarialModel(input);
  const bootstrap = runOdpBootstrapSimulation(evaluation, 800, 202610);

  const compUlt = computeSolvencyIfrsCompliance({
    evaluation,
    bootstrap,
    regime: 'ultimate_995_var',
    cocRate: 0.06,
    ifrs17ConfidenceLevel: 0.85,
  });

  const comp1Yr = computeSolvencyIfrsCompliance({
    evaluation,
    bootstrap,
    regime: 'one_year_995_var',
    cocRate: 0.06,
    ifrs17ConfidenceLevel: 0.75,
  });

  // 1. Required Capital (SCR) must be positive and 1-Year Horizon SCR <= Ultimate Horizon SCR
  assert.ok(compUlt.selectedScr > 0, 'Ultimate 99.5% VaR SCR must be strictly positive');
  assert.ok(comp1Yr.selectedScr > 0, '1-Year 99.5% VaR SCR must be strictly positive');
  assert.ok(
    comp1Yr.selectedScr <= compUlt.selectedScr,
    '1-Year Horizon Reserve Risk SCR must be <= Ultimate Horizon SCR'
  );

  // 2. Solvency II Cost-of-Capital Risk Margin and Technical Provisions identity
  assert.ok(compUlt.solvencyIIRiskMarginCoC > 0, 'Cost-of-Capital (6%) Risk Margin must be positive');
  assert.ok(
    Math.abs(
      compUlt.solvencyIITechnicalProvisions -
        (compUlt.discountedBelPv + compUlt.solvencyIIRiskMarginCoC)
    ) < 1e-4,
    'Solvency II Technical Provisions must equal Discounted BEL PV + Risk Margin (CoC)'
  );

  // 3. IFRS 17 Risk Adjustment and Fulfilment Cash Flows monotonicity across confidence levels
  assert.ok(
    compUlt.ifrs17RiskAdjustment >= comp1Yr.ifrs17RiskAdjustment,
    'IFRS 17 Risk Adjustment at 85% confidence must be >= Risk Adjustment at 75% confidence'
  );
  assert.ok(
    Math.abs(
      compUlt.ifrs17FulfilmentCashFlows -
        (compUlt.discountedBelPv + compUlt.ifrs17RiskAdjustment)
    ) < 1e-4,
    'IFRS 17 Fulfilment Cash Flows must equal Discounted BEL PV + Risk Adjustment'
  );

  // 4. Cohort Capital Allocation must reconcile to 100% of portfolio SCR
  const sumCohortScr = compUlt.cohortRows.reduce((s, r) => s + r.allocatedScr, 0);
  assert.ok(
    Math.abs(sumCohortScr - compUlt.selectedScr) < 1e-2,
    'Allocated SCR across origin cohorts must sum exactly to portfolio Required Capital (SCR)'
  );
});

test('WTW ResQ Berquist-Sherman (Case Reserve Adequacy & Settlement Speed), PPCI, and PPCF (Fisher-Lange) compute valid adjusted reserves', () => {
  const input = makeDefaultInput(TAYLOR_ASHE_1983);
  const evaluation = evaluateActuarialModel(input);

  const bsBase = computeResQAdvancedMethods({
    evaluation,
    caseSeverityTrendRate: 0.05,
    settlementSpeedShift: 0.0,
  });
  const bsHighTrend = computeResQAdvancedMethods({
    evaluation,
    caseSeverityTrendRate: 0.12,
    settlementSpeedShift: 0.05,
  });

  assert.ok(bsBase.totals.berquistShermanIbnr > 0, 'Berquist-Sherman IBNR must be positive');
  assert.ok(bsBase.totals.ppciIbnr > 0, 'PPCI IBNR must be positive');
  assert.ok(bsBase.totals.ppcfFisherLangeIbnr > 0, 'PPCF (Fisher-Lange) IBNR must be positive');
  assert.notEqual(
    bsBase.totals.berquistShermanIbnr,
    bsHighTrend.totals.berquistShermanIbnr,
    'Changing Berquist-Sherman severity trend and settlement speed shift must restate adjusted IBNR'
  );
  assert.ok(
    bsHighTrend.totals.ppcfFisherLangeIbnr > bsBase.totals.ppcfFisherLangeIbnr,
    'Higher future severity inflation trend must increase Fisher-Lange PPCF IBNR'
  );
  // Munich Chain Ladder (Quarg & Mack 2004) assertions
  assert.ok(
    bsBase.munichChainLadder.lambdaPaid > 0,
    'Munich Chain Ladder lambda_Paid slope must be strictly positive'
  );
  assert.ok(
    bsBase.munichChainLadder.lambdaIncurred < 0,
    'Munich Chain Ladder lambda_Incurred slope must be strictly negative'
  );
  assert.ok(
    bsBase.totals.munichConvergedIbnr > 0,
    'Munich Chain Ladder converged IBNR must be strictly positive'
  );
  assert.ok(
    bsBase.munichChainLadder.munichPaidIncurredGap <=
      bsBase.munichChainLadder.unadjustedPaidIncurredGap + 1e-4,
    'Munich Chain Ladder must reduce or bound the gap between Paid CL and Incurred CL Ultimates'
  );
});

test('WTW ResQ Non-Proportional Excess of Loss (XoL) and Quota Share Treaty Layering computes Gross, Ceded, and Net triangles', () => {
  const grossTri = TAYLOR_ASHE_1983.cumulativeTriangle;
  const grossPrem = TAYLOR_ASHE_1983.earnedPremium;

  const cededRes = applyReinsuranceTreatyToDataset({
    grossTriangle: grossTri,
    grossEarnedPremium: grossPrem,
    config: {
      layerMode: 'CEDED',
      quotaSharePct: 0.2,
      xolEnabled: true,
      xolRetention: 1500000,
      xolLimit: 2000000,
      reinstatementRatePct: 1.0,
    },
  });

  const netRes = applyReinsuranceTreatyToDataset({
    grossTriangle: grossTri,
    grossEarnedPremium: grossPrem,
    config: {
      layerMode: 'NET',
      quotaSharePct: 0.2,
      xolEnabled: true,
      xolRetention: 1500000,
      xolLimit: 2000000,
      reinstatementRatePct: 1.0,
    },
  });

  assert.ok(
    cededRes.diagnostics.cededQuotaSharePaid > 0,
    'Ceded Quota Share paid loss must be positive'
  );
  assert.ok(
    cededRes.diagnostics.cededXolPaid > 0,
    'Ceded Excess of Loss (XoL) recovery must be positive when claims exceed retention'
  );
  // Check Gross = Ceded + Net on cell [0][9]
  const gCell = grossTri[0][9] ?? 0;
  const cCell = cededRes.triangle[0][9] ?? 0;
  const nCell = netRes.triangle[0][9] ?? 0;
  assert.ok(
    Math.abs(gCell - (cCell + nCell)) <= 2,
    'Gross cell must equal Ceded + Net cell within integer rounding'
  );
});




