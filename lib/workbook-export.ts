import * as XLSX from 'xlsx';
import {
  ActuarialEvaluationResult,
  BootstrapSimulationResult,
} from './actuarial-engine';
import {
  MultiSegmentFactRecord,
  PriorYearDevelopmentAnalysis,
  TimeGranularity,
  getAvailableSegmentDimensions,
} from './segment-pyd-engine';
import { AuditLogEntry } from './formatters';

export interface ActuarialWorkbookExportParams {
  datasetName: string;
  currencySymbol: string;
  unitLabel?: string;
  originLabels: string[];
  evaluation: ActuarialEvaluationResult;
  pydAnalysis: PriorYearDevelopmentAnalysis;
  bootstrap: BootstrapSimulationResult;
  auditLogs: AuditLogEntry[];
}

/**
 * Build a multi-sheet SheetJS Workbook for the active Actuarial & PYD Valuation
 * (Can also be tested in Node.js unit tests before browser download)
 */
export function buildActuarialValuationWorkbook(
  params: ActuarialWorkbookExportParams
): XLSX.WorkBook {
  const {
    datasetName,
    currencySymbol,
    unitLabel = currencySymbol || 'Unit',
    originLabels,
    evaluation,
    pydAnalysis,
    bootstrap,
    auditLogs,
  } = params;

  const wb = XLSX.utils.book_new();
  const devHeaders = evaluation.devPeriods.map((d) => `${d}m`);
  const linkHeaders = evaluation.devPeriods
    .slice(0, -1)
    .map((d, j) => `${d}-${evaluation.devPeriods[j + 1]}m`);

  // ==========================================================================
  // Sheet 1: 01_Triangle_And_LDFs
  // ==========================================================================
  const sheet1AoA: (string | number | null)[][] = [
    [`AuraReserve Actuarial Reserve & LDF Workbook — ${datasetName}`],
    [
      `Valuation: ${pydAnalysis.currentValuationLabel}`,
      `Baseline: ${pydAnalysis.baselineValuationLabel}`,
      `Granularity: ${pydAnalysis.granularity.toUpperCase()}`,
      `Display Unit: ${unitLabel}`,
    ],
    [],
    ['[1A] Cumulative Triangle (C_i,j)'],
    ['Origin Period', ...devHeaders, 'Latest Cumulative'],
    ...evaluation.cumulativeTriangle.map((row, i) => [
      originLabels[i] ?? `${evaluation.originYears[i]}`,
      ...row.map((v) => (v === null ? null : Number(v.toFixed(2)))),
      Number((evaluation.rows[i]?.latestCumulative ?? 0).toFixed(2)),
    ]),
    [],
    ['[1B] Incremental Triangle (I_i,j)'],
    ['Origin Period', ...devHeaders],
    ...evaluation.incrementalTriangle.map((row, i) => [
      originLabels[i] ?? `${evaluation.originYears[i]}`,
      ...row.map((v) => (v === null ? null : Number(v.toFixed(2)))),
    ]),
    [],
    ['[1C] Full Chain-Ladder Projected Triangle'],
    ['Origin Period', ...devHeaders, 'Selected Ultimate'],
    ...evaluation.fullProjectedTriangle.map((row, i) => [
      originLabels[i] ?? `${evaluation.originYears[i]}`,
      ...row.map((v) => (v === null ? null : Number(v.toFixed(2)))),
      Number((evaluation.rows[i]?.selectedUltimate ?? 0).toFixed(2)),
    ]),
    [],
    ['[1D] Age-to-Age Link Ratios (f_i,j) & Selected LDF Schedule'],
    ['Origin / Average Basis', ...linkHeaders, 'Tail Factor'],
    ...evaluation.linkRatios.map((row, i) => [
      originLabels[i] ?? `${evaluation.originYears[i]}`,
      ...row.map((v, j) =>
        v === null
          ? null
          : evaluation.exclusions[i]?.[j]
          ? `${v.toFixed(4)} (Excluded)`
          : Number(v.toFixed(4))
      ),
      null,
    ]),
    [],
    [
      'Volume-Weighted Avg (All)',
      ...evaluation.ldfAverages.vw_all.map((v) => Number(v.toFixed(4))),
      null,
    ],
    [
      'Volume-Weighted Avg (Latest 5)',
      ...evaluation.ldfAverages.vw_5.map((v) => Number(v.toFixed(4))),
      null,
    ],
    [
      'Volume-Weighted Avg (Latest 3)',
      ...evaluation.ldfAverages.vw_3.map((v) => Number(v.toFixed(4))),
      null,
    ],
    [
      'Simple Avg (All)',
      ...evaluation.ldfAverages.simple_all.map((v) => Number(v.toFixed(4))),
      null,
    ],
    [
      'Medial Avg (Excl. High/Low)',
      ...evaluation.ldfAverages.medial.map((v) => Number(v.toFixed(4))),
      null,
    ],
    [
      'Selected LDF (採用進展係数)',
      ...evaluation.selectedLdfs.map((v) => Number(v.toFixed(4))),
      Number(evaluation.tailFactor.toFixed(4)),
    ],
    [
      'Cumulative CDF to Ultimate',
      ...evaluation.cdfs.map((v) => Number(v.toFixed(4))),
    ],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1AoA);
  XLSX.utils.book_append_sheet(wb, ws1, '01_Triangle_And_LDFs');

  // ==========================================================================
  // Sheet 2: 02_Method_Comparison (CL / BF / CC)
  // ==========================================================================
  const sheet2AoA: (string | number | null)[][] = [
    [`Actuarial Method Comparison (CL / BF / CC) — ${datasetName}`],
    [],
    [
      'Origin Period',
      'Latest Cumulative',
      'Earned Premium / Exposure',
      'A Priori ELR',
      'CDF to Ultimate',
      'Implied Maturity %',
      'CL IBNR',
      'CL Ultimate',
      'BF IBNR',
      'BF Ultimate',
      'Cape Cod ELR',
      'CC IBNR',
      'CC Ultimate',
      'Selected Method',
      'Selected IBNR',
      'Selected Ultimate',
      'Ultimate Loss Ratio',
      'Mack SE',
      'Mack CV',
    ],
    ...evaluation.rows.map((r, i) => [
      originLabels[i] ?? `${r.originYear}`,
      Number(r.latestCumulative.toFixed(2)),
      Number(r.earnedPremium.toFixed(2)),
      Number(r.aprioriElr.toFixed(4)),
      Number(r.cdfToUltimate.toFixed(4)),
      Number(r.percentDeveloped.toFixed(4)),
      Number(r.clIbnr.toFixed(2)),
      Number(r.clUltimate.toFixed(2)),
      Number(r.bfIbnr.toFixed(2)),
      Number(r.bfUltimate.toFixed(2)),
      Number(evaluation.capeCodElr.toFixed(4)),
      Number(r.ccIbnr.toFixed(2)),
      Number(r.ccUltimate.toFixed(2)),
      r.selectedMethod,
      Number(r.selectedIbnr.toFixed(2)),
      Number(r.selectedUltimate.toFixed(2)),
      Number(r.ultimateLossRatio.toFixed(4)),
      Number(r.mackSe.toFixed(2)),
      r.mackCv !== null ? Number(r.mackCv.toFixed(4)) : null,
    ]),
    [
      'TOTAL PORTFOLIO',
      Number(evaluation.totals.latestCumulative.toFixed(2)),
      Number(evaluation.totals.earnedPremium.toFixed(2)),
      null,
      null,
      null,
      Number(evaluation.totals.clIbnr.toFixed(2)),
      Number(evaluation.totals.clUltimate.toFixed(2)),
      Number(evaluation.totals.bfIbnr.toFixed(2)),
      Number(evaluation.totals.bfUltimate.toFixed(2)),
      Number(evaluation.capeCodElr.toFixed(4)),
      Number(evaluation.totals.ccIbnr.toFixed(2)),
      Number(evaluation.totals.ccUltimate.toFixed(2)),
      'PORTFOLIO',
      Number(evaluation.totals.selectedIbnr.toFixed(2)),
      Number(evaluation.totals.selectedUltimate.toFixed(2)),
      Number(evaluation.totals.ultimateLossRatio.toFixed(4)),
      Number(evaluation.totals.mackTotalSe.toFixed(2)),
      evaluation.totals.mackTotalCv !== null
        ? Number(evaluation.totals.mackTotalCv.toFixed(4))
        : null,
    ],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2AoA);
  XLSX.utils.book_append_sheet(wb, ws2, '02_Method_Comparison');

  // ==========================================================================
  // Sheet 3: 03_PYD_Cohort_Runoff
  // ==========================================================================
  const sheet3AoA: (string | number | null)[][] = [
    [
      `Prior Year Development (PYD: ${pydAnalysis.priorCutoffLabel}) & AvE Runoff — ${datasetName}`,
    ],
    [
      `Baseline: ${pydAnalysis.baselineValuationLabel}`,
      `Current Valuation: ${pydAnalysis.currentValuationLabel}`,
      `Prior Cutoff: ${pydAnalysis.priorCutoffLabel}`,
    ],
    [],
    [
      'Origin Period',
      'Cohort Classification',
      'Earned Premium',
      `Baseline Paid (${pydAnalysis.baselineValuationLabel})`,
      `Baseline IBNR (${pydAnalysis.baselineValuationLabel})`,
      `Baseline Ultimate (${pydAnalysis.baselineValuationLabel})`,
      'Actual Emergence Δ',
      'Expected Emergence Δ',
      'AvE Variance (Actual - Expected)',
      `Current Paid (${pydAnalysis.currentValuationLabel})`,
      `Current IBNR (${pydAnalysis.currentValuationLabel})`,
      `Current Ultimate (${pydAnalysis.currentValuationLabel})`,
      'IBNR Change Δ',
      'Prior Year Development (PYD)',
      'PYD % of Baseline IBNR',
      'PYD % of Baseline Ultimate',
    ],
    ...pydAnalysis.cohortRows.map((r) => [
      r.originLabel,
      r.isPriorYear ? `Prior (${pydAnalysis.priorCutoffLabel})` : 'New Cohort',
      Number(r.earnedPremium.toFixed(2)),
      Number(r.paid2025End.toFixed(2)),
      Number(r.ibnr2025End.toFixed(2)),
      Number(r.ultimate2025End.toFixed(2)),
      Number(r.actual2026Emergence.toFixed(2)),
      Number(r.expected2026Emergence.toFixed(2)),
      Number(r.aveEmergenceDiff.toFixed(2)),
      Number(r.paid2026Current.toFixed(2)),
      Number(r.ibnr2026Current.toFixed(2)),
      Number(r.ultimate2026Current.toFixed(2)),
      Number(r.ibnrChange2026.toFixed(2)),
      Number(r.priorYearDevelopment.toFixed(2)),
      r.pydPctOf2025Reserve !== null
        ? Number(r.pydPctOf2025Reserve.toFixed(4))
        : null,
      r.pydPctOf2025Ultimate !== null
        ? Number(r.pydPctOf2025Ultimate.toFixed(4))
        : null,
    ]),
    [
      `PRIOR COHORTS TOTAL (${pydAnalysis.priorCutoffLabel})`,
      'Prior Subtotal',
      Number(pydAnalysis.priorTotals.earnedPremium.toFixed(2)),
      Number(pydAnalysis.priorTotals.paid2025End.toFixed(2)),
      Number(pydAnalysis.priorTotals.ibnr2025End.toFixed(2)),
      Number(pydAnalysis.priorTotals.ultimate2025End.toFixed(2)),
      Number(pydAnalysis.priorTotals.actual2026Emergence.toFixed(2)),
      Number(pydAnalysis.priorTotals.expected2026Emergence.toFixed(2)),
      Number(pydAnalysis.priorTotals.aveEmergenceDiff.toFixed(2)),
      Number(pydAnalysis.priorTotals.paid2026Current.toFixed(2)),
      Number(pydAnalysis.priorTotals.ibnr2026Current.toFixed(2)),
      Number(pydAnalysis.priorTotals.ultimate2026Current.toFixed(2)),
      Number(pydAnalysis.priorTotals.ibnrChange2026.toFixed(2)),
      Number(pydAnalysis.priorTotals.priorYearDevelopment.toFixed(2)),
      Number(pydAnalysis.priorTotals.pydPctOf2025Reserve.toFixed(4)),
      Number(pydAnalysis.priorTotals.pydPctOf2025Ultimate.toFixed(4)),
    ],
  ];

  const ws3 = XLSX.utils.aoa_to_sheet(sheet3AoA);
  XLSX.utils.book_append_sheet(wb, ws3, '03_PYD_Cohort_Runoff');

  // ==========================================================================
  // Sheet 4: 04_Segment_Attribution
  // ==========================================================================
  const segDimKeys =
    pydAnalysis.segmentRollupRows.length > 0
      ? Object.keys(pydAnalysis.segmentRollupRows[0].dimensions)
      : ['Product', 'Channel', 'Coverage', 'Region'];

  const sheet4AoA: (string | number | null)[][] = [
    [`Multi-Dimensional Segment Roll-Up & PYD Attribution — ${datasetName}`],
    [],
    [
      'Segment ID',
      ...segDimKeys,
      'Earned Premium',
      `Current Paid (${pydAnalysis.currentValuationLabel})`,
      `Baseline Prior IBNR (${pydAnalysis.baselineValuationLabel})`,
      'Actual Emergence Δ (Prior)',
      'Expected Emergence Δ (Prior)',
      'Current Prior IBNR',
      'New Cohort IBNR',
      'Current Total IBNR',
      'Current Total Ultimate',
      'Ultimate Loss Ratio',
      'Prior Year Development (PYD)',
      'PYD % of Baseline IBNR',
      'Mack SE',
    ],
    ...pydAnalysis.segmentRollupRows.map((s) => [
      s.segmentId,
      ...segDimKeys.map((k) => s.dimensions[k] ?? ''),
      Number(s.earnedPremium.toFixed(2)),
      Number(s.latestPaid2026.toFixed(2)),
      Number(s.ibnr2025EndPriorCohorts.toFixed(2)),
      Number(s.actual2026EmergencePriorCohorts.toFixed(2)),
      Number(s.expected2026EmergencePriorCohorts.toFixed(2)),
      Number(s.ibnr2026PriorCohorts.toFixed(2)),
      Number(s.ibnr2026NewCohort.toFixed(2)),
      Number(s.ibnr2026CurrentTotal.toFixed(2)),
      Number(s.ultimate2026CurrentTotal.toFixed(2)),
      Number(s.ultimateLossRatio2026.toFixed(4)),
      Number(s.priorYearDevelopment2026.toFixed(2)),
      Number(s.pydPctOfPriorReserve.toFixed(4)),
      Number(s.mackSe.toFixed(2)),
    ]),
  ];

  const ws4 = XLSX.utils.aoa_to_sheet(sheet4AoA);
  XLSX.utils.book_append_sheet(wb, ws4, '04_Segment_Attribution');

  // ==========================================================================
  // Sheet 5: 05_Stochastic_And_Audit
  // ==========================================================================
  const sheet5AoA: (string | number | null)[][] = [
    [`Stochastic ODP Bootstrap & Governance Audit Log — ${datasetName}`],
    [
      `Simulations: ${bootstrap.iterations}`,
      `Bootstrap Mean IBNR: ${bootstrap.meanIbnr.toFixed(2)}`,
      `Bootstrap StdDev: ${bootstrap.stdDevIbnr.toFixed(2)}`,
      `Over-Dispersion Phi: ${bootstrap.scaleParameterPhi.toFixed(4)}`,
    ],
    [],
    ['[5A] ODP Bootstrap Reserve Distribution & IFRS 17 / Solvency II Percentiles'],
    [
      'Confidence Percentile',
      'Simulated IBNR Reserve',
      'Simulated Ultimate Loss',
      'Risk Adjustment / Capital Buffer over Mean',
    ],
    ...bootstrap.percentiles.map((p) => [
      `${p.percentile}%`,
      Number(p.ibnrValue.toFixed(2)),
      Number(p.ultimateValue.toFixed(2)),
      Number(p.riskCapitalOverMean.toFixed(2)),
    ]),
    [],
    ['[5B] Chronological Actuarial Governance & Audit Trail'],
    [
      'Timestamp',
      'Action Type',
      'Event Title',
      'Actuarial Rationale / Detail',
      'Previous IBNR',
      'New IBNR',
      'Delta IBNR',
    ],
    ...auditLogs.map((l) => [
      l.timestamp,
      l.actionType,
      l.title,
      l.detail,
      Number(l.previousIbnr.toFixed(2)),
      Number(l.newIbnr.toFixed(2)),
      Number(l.deltaIbnr.toFixed(2)),
    ]),
  ];

  const ws5 = XLSX.utils.aoa_to_sheet(sheet5AoA);
  XLSX.utils.book_append_sheet(wb, ws5, '05_Stochastic_And_Audit');

  return wb;
}

/**
 * Trigger browser download of the 5-sheet Actuarial & PYD Excel Workbook (.xlsx)
 */
export function exportActuarialValuationWorkbookXlsx(
  params: ActuarialWorkbookExportParams
): void {
  const wb = buildActuarialValuationWorkbook(params);
  const outBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([outBuf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AuraReserve_Valuation_Workbook_${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Build a normalized, cleaned, and separate-premium-joined dataset workbook (.xlsx)
 * with 2 sheets:
 * 1. `Normalized_Long_Tidy`: Long tidy format ready for database/BI/R/Python ingestion
 * 2. `Normalized_Wide_Matrix`: Wide pivot format with Paid, Incurred, Claim Count, and joined Earned Premium & Exposure
 */
export function buildNormalizedFactDatasetWorkbook(
  records: MultiSegmentFactRecord[],
  targetGranularity?: TimeGranularity
): {
  wb: XLSX.WorkBook;
  longRows: (string | number | null)[][];
  wideRows: (string | number | null)[][];
} {
  const dimsInfo = getAvailableSegmentDimensions(records);
  const dimKeys =
    dimsInfo.dimensionKeys.length > 0
      ? dimsInfo.dimensionKeys
      : ['Product', 'Channel', 'Coverage', 'Region'];

  const latestValMonth =
    dimsInfo.valuationMonths[dimsInfo.valuationMonths.length - 1] ?? 'Latest';
  const effectiveGran =
    targetGranularity && dimsInfo.granularities.includes(targetGranularity)
      ? targetGranularity
      : dimsInfo.granularities.includes('annual_fy')
      ? 'annual_fy'
      : dimsInfo.granularities[0] ?? 'annual';

  const filtered = records.filter(
    (r) =>
      r.valuationMonth === latestValMonth && r.granularity === effectiveGran
  );
  const activeRecs = filtered.length > 0 ? filtered : records;

  // 1. Long Tidy Rows
  const longHeader = [
    ...dimKeys,
    'ValuationSnapshot',
    'Granularity',
    'OriginPeriod',
    'DevLagMonths',
    'CumulativePaidLoss',
    'CumulativeIncurredLoss',
    'CumulativeClaimCount',
    'ImpliedPaidSeverity',
    'EarnedPremium',
    'EarnedExposure',
    'APrioriELR',
  ];
  const longRows: (string | number | null)[][] = [longHeader];

  for (const r of activeRecs) {
    const segVals = dimKeys.map(
      (k) => r.dimensions?.[k] ?? r.product ?? 'All'
    );
    r.devLagPeriods.forEach((devLag, j) => {
      const paid = r.cumulativeRow[j] ?? null;
      const inc = r.incurredCumulativeRow?.[j] ?? null;
      const cnt = r.claimCountCumulativeRow?.[j] ?? null;
      if (paid === null && inc === null && cnt === null) return;

      const sev =
        paid !== null && cnt !== null && cnt > 0
          ? Number((paid / cnt).toFixed(2))
          : null;

      longRows.push([
        ...segVals,
        r.valuationMonth,
        r.granularity,
        r.originLabel,
        devLag,
        paid !== null ? Number(paid.toFixed(2)) : null,
        inc !== null ? Number(inc.toFixed(2)) : null,
        cnt !== null ? Number(cnt.toFixed(2)) : null,
        sev,
        Number(r.earnedPremium.toFixed(2)),
        Number((r.earnedExposure ?? 0).toFixed(2)),
        Number(r.aprioriElr.toFixed(4)),
      ]);
    });
  }

  // 2. Wide Matrix Rows
  const masterDevs = Array.from(
    new Set(activeRecs.flatMap((r) => r.devLagPeriods))
  ).sort((a, b) => a - b);

  const wideHeader = [
    ...dimKeys,
    'MetricType (指標区分)',
    'OriginPeriod (事故期間)',
    ...masterDevs.map((d) => `${d}m`),
    'EarnedPremium (既経過保険料)',
    'EarnedExposure (経過契約件数)',
    'APrioriELR (予定損害率)',
  ];
  const wideRows: (string | number | null)[][] = [wideHeader];

  const pushWideMetricRow = (
    r: MultiSegmentFactRecord,
    metricLabel: string,
    series: (number | null)[] | undefined
  ) => {
    if (!series || series.every((v) => v === null)) return;
    const segVals = dimKeys.map(
      (k) => r.dimensions?.[k] ?? r.product ?? 'All'
    );
    const devCells = masterDevs.map((d) => {
      const idx = r.devLagPeriods.indexOf(d);
      const val = idx !== -1 ? series[idx] : null;
      return val !== null && val !== undefined ? Number(val.toFixed(2)) : null;
    });

    wideRows.push([
      ...segVals,
      metricLabel,
      r.originLabel,
      ...devCells,
      Number(r.earnedPremium.toFixed(2)),
      Number((r.earnedExposure ?? 0).toFixed(2)),
      Number(r.aprioriElr.toFixed(4)),
    ]);
  };

  for (const r of activeRecs) {
    pushWideMetricRow(r, 'PaidLoss (累積支払損害額)', r.cumulativeRow);
    pushWideMetricRow(
      r,
      'IncurredLoss (累積発生損害額)',
      r.incurredCumulativeRow
    );
    pushWideMetricRow(
      r,
      'ClaimCount (累積クレーム件数)',
      r.claimCountCumulativeRow
    );
  }

  const wb = XLSX.utils.book_new();
  const wsLong = XLSX.utils.aoa_to_sheet(longRows);
  const wsWide = XLSX.utils.aoa_to_sheet(wideRows);
  XLSX.utils.book_append_sheet(wb, wsLong, 'Normalized_Long_Tidy');
  XLSX.utils.book_append_sheet(wb, wsWide, 'Normalized_Wide_Matrix');

  return { wb, longRows, wideRows };
}

/**
 * Download Cleaned & Joined Normalized Dataset as 2-Sheet Excel Workbook (.xlsx)
 */
export function exportNormalizedFactDatasetXlsx(
  records: MultiSegmentFactRecord[],
  targetGranularity?: TimeGranularity,
  filenamePrefix = 'AuraReserve_Normalized_Joined_Dataset'
): void {
  const { wb } = buildNormalizedFactDatasetWorkbook(records, targetGranularity);
  const outBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([outBuf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download Cleaned & Joined Normalized Dataset as UTF-8 BOM CSV (.csv)
 */
export function exportNormalizedFactDatasetCsv(
  records: MultiSegmentFactRecord[],
  targetGranularity?: TimeGranularity,
  filenamePrefix = 'AuraReserve_Normalized_Joined_Dataset'
): void {
  const { longRows } = buildNormalizedFactDatasetWorkbook(
    records,
    targetGranularity
  );
  const csvLines = longRows.map((row) =>
    row
      .map((cell) => {
        if (cell === null || cell === undefined) return '';
        const str = String(cell);
        return str.includes(',') || str.includes('"')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(',')
  );
  // Prepend UTF-8 BOM (\uFEFF) so Japanese Excel opens it cleanly without garbling
  const blob = new Blob(['\uFEFF' + csvLines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
