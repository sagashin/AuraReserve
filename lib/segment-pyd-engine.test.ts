import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDefaultMultiSegmentFactStore,
  getAvailableSegmentDimensions,
  pivotSegmentTriangle,
  computePriorYearDevelopmentAndRollup,
  parseMultiSegmentLongCsv,
  generateCustomJapaneseFiscalSampleCsv,
  inspectCsvHeadersAndPreview,
  ingestMappedCsvWithAutoRollup,
  parseFlexiblePeriodString,
} from './segment-pyd-engine';
import {
  evaluateActuarialModel,
  ActuarialInput,
  runOdpBootstrapSimulation,
} from './actuarial-engine';
import {
  parseTextToRawGrid,
  inspectUniversalLossGrid,
  ingestUniversalLossGrid,
  inspectSeparatePremiumGrid,
  joinSeparatePremiumExposureDataset,
  generateWidePivotLossAndSeparatePremiumSample,
  generateWarekiMultiMetricAndEdgeCaseSample,
} from './universal-data-parser';
import {
  buildActuarialValuationWorkbook,
  buildNormalizedFactDatasetWorkbook,
} from './workbook-export';

test('Multi-segment OLAP pivot aggregates across Product, Channel, Coverage, Region and preserves null cells', () => {
  const store = buildDefaultMultiSegmentFactStore();
  const dims = getAvailableSegmentDimensions(store);

  assert.equal(dims.products.length, 4, 'Should have 4 distinct product lines');
  assert.equal(dims.channels.length, 3, 'Should have 3 distinct channels');

  const allSlice = pivotSegmentTriangle(store, '2026-10', 'annual', {
    product: 'ALL',
    channel: 'ALL',
    coverage: 'ALL',
    region: 'ALL',
  });
  assert.equal(allSlice.matchedSegmentCount, 8, 'All filter should aggregate all 8 segments');
  assert.equal(allSlice.originCodes.length, 10, 'Should have 10 origin years (2017..2026)');
  assert.equal(
    allSlice.cumulativeTriangle[9][1],
    null,
    'Lower-right unobserved cells must remain strictly null'
  );

  const singleProdSlice = pivotSegmentTriangle(store, '2026-10', 'annual', {
    product: dims.products[0],
    channel: 'ALL',
    coverage: 'ALL',
    region: 'ALL',
  });
  assert.ok(
    singleProdSlice.earnedPremium[0] < allSlice.earnedPremium[0],
    'Single product slice must have smaller earned premium than total portfolio'
  );
});

test('4-Mode Granularity pivot supports Annual CY, Annual FY (Apr-Mar), Quarterly (3m), and Monthly (1m) triangles', () => {
  const store = buildDefaultMultiSegmentFactStore();
  const baseFilters = {
    product: 'ALL',
    channel: 'ALL',
    coverage: 'ALL',
    region: 'ALL',
  };

  const fySlice = pivotSegmentTriangle(store, '2026-10', 'annual_fy', baseFilters);
  assert.equal(fySlice.originLabels[0], 'FY2017');
  assert.equal(fySlice.originLabels[9], 'FY2026');

  const qSlice = pivotSegmentTriangle(store, '2026-10', 'quarterly', baseFilters);
  assert.deepEqual(qSlice.devPeriods, [3, 6, 9, 12, 15, 18, 21, 24, 27, 30]);
  assert.equal(qSlice.originLabels[0], '2024-Q2');
  assert.equal(qSlice.originLabels[9], '2026-Q3');

  const mSlice = pivotSegmentTriangle(store, '2026-10', 'monthly', baseFilters);
  assert.deepEqual(mSlice.devPeriods, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(mSlice.originLabels[0], '2025-10');
  assert.equal(mSlice.originLabels[9], '2026-07');
});

test('Prior Year Development (PYD) satisfies fundamental reserve runoff identity and supports custom PYD cutoff & baseline steps', () => {
  const store = buildDefaultMultiSegmentFactStore();
  const slice = pivotSegmentTriangle(store, '2026-10', 'annual', {
    product: 'ALL',
    channel: 'ALL',
    coverage: 'ALL',
    region: 'ALL',
  });

  const n = slice.originCodes.length;
  const m = slice.devPeriods.length;
  const input: ActuarialInput = {
    originYears: slice.originCodes,
    devPeriods: slice.devPeriods,
    cumulativeTriangle: slice.cumulativeTriangle,
    earnedPremium: slice.earnedPremium,
    aprioriElr: slice.aprioriElr,
    exclusions: Array.from({ length: n }, () => new Array(m - 1).fill(false)),
    selectedLdfMode: 'vw_all',
    manualLdfs: new Array(m - 1).fill(null),
    tailFactor: 1.01,
    selectedMethods: new Array(n).fill('CL'),
    methodWeights: Array.from({ length: n }, () => ({ cl: 1, bf: 0, cc: 0 })),
  };

  const evalRes = evaluateActuarialModel(input);
  const pydAnalysis = computePriorYearDevelopmentAndRollup(store, slice, evalRes);

  const priorRows = pydAnalysis.cohortRows.filter((r) => r.isPriorYear);
  assert.equal(priorRows.length, 9, '2017..2025 should be 9 prior-year cohorts');

  for (const row of priorRows) {
    const lhs = row.priorYearDevelopment;
    const rhs = row.actual2026Emergence + row.ibnrChange2026;
    assert.ok(
      Math.abs(lhs - rhs) < 1e-4,
      `Cohort ${row.originLabel} PYD identity mismatch: ${lhs} vs ${rhs}`
    );
  }

  // Test user-configurable PYD cutoff (e.g., <= 2023) and custom diagonal step back (2 steps)
  const customPyd = computePriorYearDevelopmentAndRollup(store, slice, evalRes, {
    priorCutoffOriginCode: 2023,
    baselineDiagonalStepsBack: 2,
  });
  assert.equal(customPyd.priorCutoffLabel, '≤ 2023');
  assert.equal(
    customPyd.cohortRows.filter((r) => r.isPriorYear).length,
    7,
    '2017..2023 should be 7 prior-year cohorts when cutoff is 2023'
  );
});

test('Multi-segment long CSV parser detects segment columns and builds fact records', () => {
  const csv = [
    'Product,Channel,Coverage,Region,OriginPeriod,DevLag,CumulativePaid,EarnedPremium,ELR',
    'Cyber Risk,Broker,Third-Party,Tokyo,2024,12,450000,1200000,0.75',
    'Cyber Risk,Broker,Third-Party,Tokyo,2024,24,780000,1200000,0.75',
    'Cyber Risk,Broker,Third-Party,Tokyo,2025,12,510000,1350000,0.76',
    'Marine Cargo,Direct,Hull,Osaka,2024,12,320000,900000,0.70',
    'Marine Cargo,Direct,Hull,Osaka,2024,24,590000,900000,0.70',
    'Marine Cargo,Direct,Hull,Osaka,2025,12,340000,950000,0.72',
  ].join('\n');

  const parsed = parseMultiSegmentLongCsv(csv, '2026-10', 'annual');
  assert.equal(parsed.detectedSegmentsCount, 2, 'Should detect 2 distinct segments');
  assert.equal(parsed.originsCount, 2, 'Should detect 2 origin periods');
});

test('Interactive CSV Schema Mapper handles non-2025/2026 dates (2018-2023), custom Japanese segment columns, and FY Apr-Mar roll-up', () => {
  const sampleCsv = generateCustomJapaneseFiscalSampleCsv();
  const preview = inspectCsvHeadersAndPreview(sampleCsv);

  assert.deepEqual(preview.suggestedMapping.segmentCols, [
    '保険種目',
    '販売チャネル',
    '地域ブロック',
    'フリート区分',
  ]);
  assert.equal(preview.suggestedMapping.originCol, '事故年月');

  const mapped = ingestMappedCsvWithAutoRollup(sampleCsv, {
    ...preview.suggestedMapping,
    valuationLabel: '2023-12',
  });

  assert.equal(mapped.detectedSegmentsCount, 4, 'Should detect 4 custom Japanese segments');
  assert.ok(
    mapped.availableGranularities.includes('annual_fy'),
    'Should auto-generate Fiscal Year (annual_fy) roll-up from monthly origin dates'
  );

  const dims = getAvailableSegmentDimensions(mapped.records);
  assert.deepEqual(dims.dimensionKeys, [
    '保険種目',
    '販売チャネル',
    '地域ブロック',
    'フリート区分',
  ]);

  const fySlice = pivotSegmentTriangle(mapped.records, '2023-12', 'annual_fy', {
    product: 'ALL',
    channel: 'ALL',
    coverage: 'ALL',
    region: 'ALL',
    フリート区分: '法人包括契約',
  });

  assert.equal(fySlice.originLabels[0], 'FY2018');
  assert.equal(fySlice.originLabels[fySlice.originLabels.length - 1], 'FY2023');
  assert.equal(fySlice.matchedSegmentCount, 2, 'Should filter to 2 法人包括契約 segments');
});

test('Universal Data Parser unpivots Wide Matrix Loss table and joins Separate Coarser-Segment Premium/Exposure table proportionally', () => {
  const { lossWideCsv, separatePremiumWideCsv } =
    generateWidePivotLossAndSeparatePremiumSample();

  // 1. Parse and inspect Wide Pivot Loss table (has no premium column)
  const lossParsed = parseTextToRawGrid(lossWideCsv);
  const lossPreview = inspectUniversalLossGrid(
    lossParsed.grid,
    lossParsed.suggestedHeaderRowIndex
  );

  assert.equal(lossPreview.detectedShape, 'wide_pivot');
  assert.deepEqual(lossPreview.segmentCols, [
    '保険種目',
    '販売チャネル',
    '地域ブロック',
  ]);
  assert.deepEqual(lossPreview.wideValueCols, [
    '12m',
    '24m',
    '36m',
    '48m',
    '60m',
    '72m',
  ]);

  const ingestedLoss = ingestUniversalLossGrid(
    lossParsed.grid,
    lossParsed.suggestedHeaderRowIndex,
    lossPreview,
    '2023-12'
  );
  assert.equal(
    ingestedLoss.detectedSegmentsCount,
    3,
    'Should detect 3 sub-segments in Wide Loss table'
  );

  // 2. Parse and inspect Separate Premium/Exposure table (only has 保険種目 × 販売チャネル, and FY2018..FY2023 columns)
  const premParsed = parseTextToRawGrid(separatePremiumWideCsv);
  const premPreview = inspectSeparatePremiumGrid(
    premParsed.grid,
    premParsed.suggestedHeaderRowIndex
  );

  assert.equal(premPreview.detectedShape, 'wide_origin_cols');
  assert.deepEqual(premPreview.segmentCols, ['保険種目', '販売チャネル']);
  assert.deepEqual(premPreview.wideOriginCols, [
    'FY2018',
    'FY2019',
    'FY2020',
    'FY2021',
    'FY2022',
    'FY2023',
  ]);

  const joined = joinSeparatePremiumExposureDataset(
    ingestedLoss.records,
    premParsed.grid,
    premParsed.suggestedHeaderRowIndex,
    premPreview
  );

  assert.ok(
    joined.matchedRecordCount > 0,
    'Should match and join separate premium records'
  );
  assert.deepEqual(joined.sharedSegmentCols, ['保険種目', '販売チャネル']);

  // Verify that the 2 sub-segments under 自動車保険(対人・対物)×専業代理店 (首都圏 & 近畿圏) received proportional shares of FY2018 premium (1,820,000)
  const fySliceAll = pivotSegmentTriangle(
    joined.updatedRecords,
    '2023-12',
    'annual_fy',
    {
      product: 'ALL',
      channel: 'ALL',
      coverage: 'ALL',
      region: 'ALL',
      保険種目: '自動車保険(対人・対物)',
      販売チャネル: '専業代理店',
    },
    'paid',
    'premium'
  );
  assert.equal(
    Math.round(fySliceAll.earnedPremium[0]),
    1820000,
    'Combined sub-segments should sum back to exact separate premium total (1,820,000 for FY2018)'
  );

  // Verify Exposure Base switching populates active denominator from separate 経過契約件数 row (22,400 for FY2018)
  const exposureSlice = pivotSegmentTriangle(
    joined.updatedRecords,
    '2023-12',
    'annual_fy',
    {
      product: 'ALL',
      channel: 'ALL',
      coverage: 'ALL',
      region: 'ALL',
      保険種目: '自動車保険(対人・対物)',
      販売チャネル: '専業代理店',
    },
    'paid',
    'exposure'
  );
  assert.equal(
    Math.round(exposureSlice.earnedPremium[0]),
    22400,
    'Exposure base should populate active denominator with 22,400 policies for FY2018'
  );
});

test('Universal Date Parser handles Wareki (令和/平成/R5), Kanji dates, 8-digit YYYYMMDD, slash dates, and Excel serial dates', () => {
  const r5Fy = parseFlexiblePeriodString('令和5年度');
  assert.equal(r5Fy?.year, 2023);
  assert.equal(r5Fy?.kind, 'annual');

  const r1Fy = parseFlexiblePeriodString('令和元年度');
  assert.equal(r1Fy?.year, 2019);
  assert.equal(r1Fy?.kind, 'annual');

  const h30Fy = parseFlexiblePeriodString('平成30年度');
  assert.equal(h30Fy?.year, 2018);

  const r5Month = parseFlexiblePeriodString('R5.4');
  assert.equal(r5Month?.year, 2023);
  assert.equal(r5Month?.month, 4);
  assert.equal(r5Month?.kind, 'monthly');

  const kanjiMonth = parseFlexiblePeriodString('2023年4月15日');
  assert.equal(kanjiMonth?.year, 2023);
  assert.equal(kanjiMonth?.month, 4);

  const kanjiQuarter = parseFlexiblePeriodString('2023年第2四半期');
  assert.equal(kanjiQuarter?.year, 2023);
  assert.equal(kanjiQuarter?.quarter, 2);
  assert.equal(kanjiQuarter?.kind, 'quarterly');

  const compact8 = parseFlexiblePeriodString('20230415');
  assert.equal(compact8?.year, 2023);
  assert.equal(compact8?.month, 4);

  const excelSerial = parseFlexiblePeriodString('44927'); // 2023-01-01
  assert.equal(excelSerial?.year, 2023);
  assert.equal(excelSerial?.month, 1);
});

test('Wareki Multi-Metric Wide Pivot sample preserves negative development (LDF < 1.0), fills interior gaps, aligns asymmetric segments, and scales 1,000-Yen separate premium', () => {
  const { warekiWideLossCsv, thousandYenSeparatePremCsv } =
    generateWarekiMultiMetricAndEdgeCaseSample();

  const lossParsed = parseTextToRawGrid(warekiWideLossCsv);
  const lossConfig = inspectUniversalLossGrid(
    lossParsed.grid,
    lossParsed.suggestedHeaderRowIndex
  );

  assert.equal(lossConfig.detectedShape, 'wide_pivot');
  assert.equal(lossConfig.metricTypeCol, '指標区分');

  const ingested = ingestUniversalLossGrid(
    lossParsed.grid,
    lossParsed.suggestedHeaderRowIndex,
    lossConfig,
    '令和5年度末'
  );

  // Verify pre-flight diagnostics
  assert.ok(
    ingested.diagnostics.negativeDevCellsCount > 0,
    'Should detect and preserve negative development (LDF < 1.0) from subrogation/salvage or case takedown'
  );
  assert.ok(
    ingested.diagnostics.interiorGapsFilledCount > 0,
    'Should detect and carry-forward interior gap cell (令和元年度 36ヶ月 blank)'
  );
  assert.ok(
    ingested.diagnostics.asymmetricSegmentsCount > 0,
    'Should detect asymmetric newly launched segment (サイバー情報漏洩保険 starting in 令和3年度)'
  );

  // Join separate 1,000-Yen premium table with unitMultiplier = 1000
  const premParsed = parseTextToRawGrid(thousandYenSeparatePremCsv);
  const premConfig = inspectSeparatePremiumGrid(
    premParsed.grid,
    premParsed.suggestedHeaderRowIndex
  );
  premConfig.unitMultiplier = 1000;

  const joined = joinSeparatePremiumExposureDataset(
    ingested.records,
    premParsed.grid,
    premParsed.suggestedHeaderRowIndex,
    premConfig
  );

  // Pivot Incurred Loss triangle for 企業賠償責任保険
  const incSlice = pivotSegmentTriangle(
    joined.updatedRecords,
    '令和5年度末',
    'annual_fy',
    {
      product: 'ALL',
      channel: 'ALL',
      coverage: 'ALL',
      region: 'ALL',
      保険種目: '企業賠償責任保険',
    },
    'incurred',
    'premium'
  );

  assert.equal(incSlice.originLabels[0], 'FY2018');
  assert.equal(incSlice.originLabels[5], 'FY2023');
  // Check negative development preserved in FY2018 Incurred between 48m (660,000) and 60m (642,000)
  assert.equal(incSlice.cumulativeTriangle[0][3], 660000);
  assert.equal(incSlice.cumulativeTriangle[0][4], 642000);
  // Check interior gap filled in FY2019 Paid at 36m (carried forward from 24m = 418,000)
  const paidSlice = pivotSegmentTriangle(
    joined.updatedRecords,
    '令和5年度末',
    'annual_fy',
    {
      product: 'ALL',
      channel: 'ALL',
      coverage: 'ALL',
      region: 'ALL',
      保険種目: '企業賠償責任保険',
    },
    'paid',
    'premium'
  );
  assert.equal(paidSlice.cumulativeTriangle[1][1], 418000);
  assert.equal(paidSlice.cumulativeTriangle[1][2], 418000);

  // Check 1,000-Yen Separate Premium scaled by x1,000 -> 820 * 1,000 = 820,000
  assert.equal(Math.round(paidSlice.earnedPremium[0]), 820000);

  // Check asymmetric newly launched segment (サイバー情報漏洩保険 launched in 令和3年度 = FY2021) aligns onto master devPeriods [12, 24, 36, 48, 60, 72]
  const cyberSlice = pivotSegmentTriangle(
    joined.updatedRecords,
    '令和5年度末',
    'annual_fy',
    {
      product: 'ALL',
      channel: 'ALL',
      coverage: 'ALL',
      region: 'ALL',
      保険種目: 'サイバー情報漏洩保険',
    },
    'paid',
    'premium'
  );
  assert.deepEqual(cyberSlice.originLabels, ['FY2021', 'FY2022', 'FY2023']);
  assert.deepEqual(cyberSlice.devPeriods, [12, 24, 36, 48, 60, 72]);
  assert.equal(cyberSlice.cumulativeTriangle[0][0], 125000);
  assert.equal(cyberSlice.cumulativeTriangle[0][2], 335000);
  assert.equal(cyberSlice.cumulativeTriangle[0][3], null);
});

test('Display Unit Divisor (1,000 / 1,000,000) scales Segment Attribution Roll-Up in lockstep and preserves PYD % invariance, and Multi-Sheet Excel Workbooks build cleanly', () => {
  const store = buildDefaultMultiSegmentFactStore();
  const baseSlice = pivotSegmentTriangle(store, '2026-10', 'annual', {
    product: 'ALL',
    channel: 'ALL',
    coverage: 'ALL',
    region: 'ALL',
  });

  const n = baseSlice.originCodes.length;
  const m = baseSlice.devPeriods.length;

  const makeScaledSlice = (divisor: number) => ({
    ...baseSlice,
    cumulativeTriangle: baseSlice.cumulativeTriangle.map((row) =>
      row.map((cell) => (cell !== null ? cell / divisor : null))
    ),
    priorYearEnd2025Diagonal: baseSlice.priorYearEnd2025Diagonal.map((v) =>
      v !== null ? v / divisor : null
    ),
    earnedPremium: baseSlice.earnedPremium.map((ep) => ep / divisor),
  });

  const makeInput = (s: typeof baseSlice): ActuarialInput => ({
    originYears: s.originCodes,
    devPeriods: s.devPeriods,
    cumulativeTriangle: s.cumulativeTriangle,
    earnedPremium: s.earnedPremium,
    aprioriElr: s.aprioriElr,
    exclusions: Array.from({ length: n }, () => new Array(m - 1).fill(false)),
    selectedLdfMode: 'vw_all',
    manualLdfs: new Array(m - 1).fill(null),
    tailFactor: 1.01,
    selectedMethods: new Array(n).fill('CL'),
    methodWeights: Array.from({ length: n }, () => ({ cl: 1, bf: 0, cc: 0 })),
  });

  const eval1 = evaluateActuarialModel(makeInput(baseSlice));
  const pyd1 = computePriorYearDevelopmentAndRollup(
    store,
    baseSlice,
    eval1,
    undefined,
    1
  );

  const slice1M = makeScaledSlice(1_000_000);
  const eval1M = evaluateActuarialModel(makeInput(slice1M));
  const pyd1M = computePriorYearDevelopmentAndRollup(
    store,
    slice1M,
    eval1M,
    undefined,
    1_000_000
  );

  // Verify segmentRollupRows scaled by 1,000,000 in lockstep
  assert.equal(pyd1.segmentRollupRows.length, pyd1M.segmentRollupRows.length);
  const firstSeg1 = pyd1.segmentRollupRows[0];
  const firstSeg1M = pyd1M.segmentRollupRows.find(
    (s) => s.segmentId === firstSeg1.segmentId
  )!;
  assert.ok(
    Math.abs(
      firstSeg1.ibnr2026CurrentTotal / 1_000_000 - firstSeg1M.ibnr2026CurrentTotal
    ) < 1e-4,
    'Segment Selected IBNR should scale by 1,000,000'
  );
  assert.ok(
    Math.abs(
      firstSeg1.priorYearDevelopment2026 / 1_000_000 -
        firstSeg1M.priorYearDevelopment2026
    ) < 1e-4,
    'Segment PYD should scale by 1,000,000'
  );
  assert.ok(
    Math.abs(firstSeg1.pydPctOfPriorReserve - firstSeg1M.pydPctOfPriorReserve) < 1e-6,
    'Segment PYD % of Prior Reserve must remain strictly invariant under 1,000,000 scaling'
  );
  assert.ok(
    Math.abs(
      pyd1.priorTotals.pydPctOf2025Reserve - pyd1M.priorTotals.pydPctOf2025Reserve
    ) < 1e-6,
    'Portfolio PYD % of Baseline Reserve must remain strictly invariant under 1,000,000 scaling'
  );

  // Verify Multi-Sheet Actuarial Workbook and Normalized Dataset Workbook
  const bootstrap = runOdpBootstrapSimulation(makeInput(baseSlice), 200, 42);
  const valWb = buildActuarialValuationWorkbook({
    datasetName: 'Test Portfolio',
    unitLabel: '¥ (百万円)',
    currencySymbol: '¥',
    originLabels: baseSlice.originLabels,
    evaluation: eval1,
    pydAnalysis: pyd1,
    bootstrap,
    auditLogs: [],
  });
  assert.deepEqual(valWb.SheetNames, [
    '01_Triangle_And_LDFs',
    '02_Method_Comparison',
    '03_PYD_Cohort_Runoff',
    '04_Segment_Attribution',
    '05_Stochastic_And_Audit',
  ]);

  const normRes = buildNormalizedFactDatasetWorkbook(store, 'annual');
  assert.deepEqual(normRes.wb.SheetNames, [
    'Normalized_Long_Tidy',
    'Normalized_Wide_Matrix',
  ]);
  assert.ok(normRes.longRows.length > 1, 'Should populate Normalized_Long_Tidy rows');
  assert.ok(normRes.wideRows.length > 1, 'Should populate Normalized_Wide_Matrix rows');
});



