/**
 * AuraReserve — Multi-Segment OLAP Pivot, Dynamic Schema Mapper,
 * Calendar/Fiscal Granularity Roll-Up, Multi-Metric (Paid/Incurred/Count/Severity/Exposure)
 * & Configurable Prior Year Development (PYD) Engine
 */

import {
  ActuarialInput,
  ActuarialEvaluationResult,
  LdfSelectionMode,
  evaluateActuarialModel,
} from './actuarial-engine';

export type TimeGranularity = 'annual' | 'annual_fy' | 'quarterly' | 'monthly';

export type AnalysisMetricType =
  | 'paid'
  | 'incurred'
  | 'claim_count'
  | 'severity';

export type ExposureBaseType = 'premium' | 'exposure';

export type ValuationMonthId = string;

export interface SegmentFilterState {
  product: string;
  channel: string;
  coverage: string;
  region: string;
  [dimensionKey: string]: string;
}

export interface MultiSegmentFactRecord {
  valuationMonth: ValuationMonthId;
  product: string;
  channel: string;
  coverage: string;
  region: string;
  /** Arbitrary N-column segment dictionary (e.g. { 保険種目: '自動車保険', 支社: '東京' }) */
  dimensions?: Record<string, string>;
  granularity: TimeGranularity;
  originCode: number;
  originLabel: string;
  isPriorYearOrigin: boolean;
  devLagPeriods: number[];
  /** Default / Paid Cumulative Loss row */
  cumulativeRow: (number | null)[];
  /** Incurred Cumulative Loss row (Paid + Case Reserve) */
  incurredCumulativeRow?: (number | null)[];
  /** Cumulative Claim Count row (Reported or Paid Counts) */
  claimCountCumulativeRow?: (number | null)[];
  priorYearEnd2025Cumulative: number | null;
  priorYearEnd2025Incurred?: number | null;
  priorYearEnd2025ClaimCount?: number | null;
  earnedPremium: number;
  /** Earned Exposure (e.g. Policy Count / Vehicle-Years / 経過契約件数) */
  earnedExposure?: number;
  aprioriElr: number;
}

export interface PivotedTriangleSlice {
  sliceKey: string;
  valuationMonth: ValuationMonthId;
  granularity: TimeGranularity;
  metric: AnalysisMetricType;
  exposureBase: ExposureBaseType;
  filters: SegmentFilterState;
  matchedSegmentCount: number;
  originCodes: number[];
  originLabels: string[];
  isPriorYearFlags: boolean[];
  devPeriods: number[];
  devUnitLabel: string;
  cumulativeTriangle: (number | null)[][];
  priorYearEnd2025Diagonal: (number | null)[];
  earnedPremium: number[];
  earnedExposure: number[];
  aprioriElr: number[];
}

export interface PydConfiguration {
  /** Origin code up to which cohorts are treated as Prior Year (null = auto-detect) */
  priorCutoffOriginCode?: number | null;
  /** How many development diagonal steps back to use as baseline (null = auto-detect) */
  baselineDiagonalStepsBack?: number | null;
  /** Optional explicit baseline valuation snapshot ID */
  baselineValuationMonth?: string | null;
}

export interface OriginPydCohortRow {
  originCode: number;
  originLabel: string;
  isPriorYear: boolean;
  earnedPremium: number;
  paid2025End: number;
  ibnr2025End: number;
  ultimate2025End: number;
  actual2026Emergence: number;
  expected2026Emergence: number;
  aveEmergenceDiff: number;
  paid2026Current: number;
  ibnr2026Current: number;
  ultimate2026Current: number;
  ibnrChange2026: number;
  priorYearDevelopment: number;
  pydPctOf2025Reserve: number | null;
  pydPctOf2025Ultimate: number | null;
}

export interface SegmentPortfolioRollupRow {
  segmentId: string;
  product: string;
  channel: string;
  coverage: string;
  region: string;
  dimensions: Record<string, string>;
  earnedPremium: number;
  latestPaid2026: number;
  ibnr2025EndPriorCohorts: number;
  ultimate2025EndPriorCohorts: number;
  actual2026EmergencePriorCohorts: number;
  expected2026EmergencePriorCohorts: number;
  ibnr2026CurrentTotal: number;
  ibnr2026PriorCohorts: number;
  ibnr2026NewCohort: number;
  ultimate2026CurrentTotal: number;
  ultimateLossRatio2026: number;
  priorYearDevelopment2026: number;
  pydPctOfPriorReserve: number;
  mackSe: number;
}

export interface PriorYearDevelopmentAnalysis {
  valuationMonth: ValuationMonthId;
  baselineValuationMonth: string;
  currentValuationLabel: string;
  baselineValuationLabel: string;
  priorCutoffOriginCode: number;
  priorCutoffLabel: string;
  baselineStepsBack: number;
  availableCutoffOrigins: { code: number; label: string }[];
  availableBaselineSteps: { stepsBack: number; label: string }[];
  granularity: TimeGranularity;
  metric: AnalysisMetricType;
  cohortRows: OriginPydCohortRow[];
  priorTotals: {
    earnedPremium: number;
    paid2025End: number;
    ibnr2025End: number;
    ultimate2025End: number;
    actual2026Emergence: number;
    expected2026Emergence: number;
    aveEmergenceDiff: number;
    paid2026Current: number;
    ibnr2026Current: number;
    ultimate2026Current: number;
    ibnrChange2026: number;
    priorYearDevelopment: number;
    pydPctOf2025Reserve: number;
    pydPctOf2025Ultimate: number;
  };
  currentYear2026Totals: {
    earnedPremium: number;
    paid2026Current: number;
    ibnr2026Current: number;
    ultimate2026Current: number;
  };
  segmentRollupRows: SegmentPortfolioRollupRow[];
}

export const VALUATION_MONTH_OPTIONS: {
  id: ValuationMonthId;
  label: string;
  elapsedMonthsIn2026: number;
}[] = [
  { id: '2025-12', label: '2025-12 (Prior Year-End Baseline)', elapsedMonthsIn2026: 0 },
  { id: '2026-01', label: '2026-01 (Jan Monthly Close)', elapsedMonthsIn2026: 1 },
  { id: '2026-02', label: '2026-02 (Feb Monthly Close)', elapsedMonthsIn2026: 2 },
  { id: '2026-03', label: '2026-03 (Q1 Close)', elapsedMonthsIn2026: 3 },
  { id: '2026-04', label: '2026-04 (Apr Monthly Close)', elapsedMonthsIn2026: 4 },
  { id: '2026-05', label: '2026-05 (May Monthly Close)', elapsedMonthsIn2026: 5 },
  { id: '2026-06', label: '2026-06 (Q2 Close)', elapsedMonthsIn2026: 6 },
  { id: '2026-07', label: '2026-07 (Jul Monthly Close)', elapsedMonthsIn2026: 7 },
  { id: '2026-08', label: '2026-08 (Aug Monthly Close)', elapsedMonthsIn2026: 8 },
  { id: '2026-09', label: '2026-09 (Q3 Close)', elapsedMonthsIn2026: 9 },
  { id: '2026-10', label: '2026-10 (Oct Latest Close)', elapsedMonthsIn2026: 10 },
];

interface SegmentCatalogSpec {
  id: string;
  product: string;
  channel: string;
  coverage: string;
  region: string;
  baseAnnualPremium: number;
  baseExposure: number;
  baseSeverity: number;
  baseElr: number;
  devPatternWeights: number[];
  cy2026PriorDevShock: number;
}

export const PORTFOLIO_SEGMENT_CATALOG: SegmentCatalogSpec[] = [
  {
    id: 'SEG-ABI-DIR-EAST',
    product: 'Auto Bodily Injury (自動車対人)',
    channel: 'Direct Online (ダイレクト)',
    coverage: 'Bodily Injury (対人賠償)',
    region: 'East / Kanto (関東)',
    baseAnnualPremium: 4200000,
    baseExposure: 52000,
    baseSeverity: 4800,
    baseElr: 0.76,
    devPatternWeights: [0.22, 0.24, 0.17, 0.12, 0.09, 0.06, 0.04, 0.03, 0.02, 0.01],
    cy2026PriorDevShock: 1.09,
  },
  {
    id: 'SEG-ABI-AGY-WEST',
    product: 'Auto Bodily Injury (自動車対人)',
    channel: 'Agency Network (代理店)',
    coverage: 'Bodily Injury (対人賠償)',
    region: 'West / Kansai (関西)',
    baseAnnualPremium: 3800000,
    baseExposure: 46500,
    baseSeverity: 5100,
    baseElr: 0.78,
    devPatternWeights: [0.23, 0.24, 0.17, 0.12, 0.08, 0.06, 0.04, 0.03, 0.02, 0.01],
    cy2026PriorDevShock: 0.96,
  },
  {
    id: 'SEG-APD-DIR-EAST',
    product: 'Auto Property Damage (自動車対物・車両)',
    channel: 'Direct Online (ダイレクト)',
    coverage: 'Property & Hull (対物・車両)',
    region: 'East / Kanto (関東)',
    baseAnnualPremium: 3100000,
    baseExposure: 61000,
    baseSeverity: 1850,
    baseElr: 0.69,
    devPatternWeights: [0.46, 0.26, 0.11, 0.06, 0.04, 0.03, 0.02, 0.01, 0.006, 0.004],
    cy2026PriorDevShock: 0.89,
  },
  {
    id: 'SEG-APD-AGY-CENT',
    product: 'Auto Property Damage (自動車対物・車両)',
    channel: 'Agency Network (代理店)',
    coverage: 'Property & Hull (対物・車両)',
    region: 'Central / Chubu (中部)',
    baseAnnualPremium: 2650000,
    baseExposure: 49000,
    baseSeverity: 1920,
    baseElr: 0.71,
    devPatternWeights: [0.45, 0.26, 0.12, 0.06, 0.04, 0.03, 0.02, 0.01, 0.006, 0.004],
    cy2026PriorDevShock: 0.94,
  },
  {
    id: 'SEG-CGL-BRK-EAST',
    product: 'Commercial Liability (企業賠償責任)',
    channel: 'Corporate Broker (企業ブローカー)',
    coverage: 'General & Product Liability (施設・PL賠償)',
    region: 'East / Kanto (関東)',
    baseAnnualPremium: 5100000,
    baseExposure: 14500,
    baseSeverity: 12500,
    baseElr: 0.82,
    devPatternWeights: [0.12, 0.18, 0.18, 0.15, 0.12, 0.09, 0.06, 0.04, 0.035, 0.025],
    cy2026PriorDevShock: 1.24,
  },
  {
    id: 'SEG-CGL-AGY-WEST',
    product: 'Commercial Liability (企業賠償責任)',
    channel: 'Agency Network (代理店)',
    coverage: 'General & Product Liability (施設・PL賠償)',
    region: 'West / Kansai (関西)',
    baseAnnualPremium: 2950000,
    baseExposure: 9800,
    baseSeverity: 10800,
    baseElr: 0.79,
    devPatternWeights: [0.13, 0.19, 0.18, 0.15, 0.11, 0.09, 0.06, 0.04, 0.03, 0.02],
    cy2026PriorDevShock: 0.93,
  },
  {
    id: 'SEG-WCP-BRK-EAST',
    product: 'Workers Comp / PA (労災・傷害)',
    channel: 'Corporate Broker (企業ブローカー)',
    coverage: 'Medical & Indemnity (医療・休業補償)',
    region: 'East / Kanto (関東)',
    baseAnnualPremium: 3400000,
    baseExposure: 32000,
    baseSeverity: 3400,
    baseElr: 0.75,
    devPatternWeights: [0.26, 0.24, 0.16, 0.11, 0.08, 0.05, 0.04, 0.03, 0.018, 0.012],
    cy2026PriorDevShock: 0.88,
  },
  {
    id: 'SEG-WCP-AGY-CENT',
    product: 'Workers Comp / PA (労災・傷害)',
    channel: 'Agency Network (代理店)',
    coverage: 'Medical & Indemnity (医療・休業補償)',
    region: 'Central / Chubu (中部)',
    baseAnnualPremium: 2350000,
    baseExposure: 24500,
    baseSeverity: 3150,
    baseElr: 0.74,
    devPatternWeights: [0.27, 0.24, 0.16, 0.11, 0.07, 0.05, 0.04, 0.03, 0.018, 0.012],
    cy2026PriorDevShock: 0.91,
  },
];

function deterministicVariation(originCode: number, devIdx: number, segId: string): number {
  let hash = originCode * 31 + devIdx * 17;
  for (let i = 0; i < segId.length; i++) {
    hash = (hash * 33 + segId.charCodeAt(i)) % 10007;
  }
  return 0.95 + (hash % 100) / 1000;
}

/**
 * Synthesize Incurred (Paid + Case Reserve) and Claim Count rows from a Paid Cumulative Row
 * when not explicitly provided, or return the explicit rows.
 */
export function buildMultiMetricRowsFromPaid(
  paidRow: (number | null)[],
  avgSeverity = 4200
): {
  incurredRow: (number | null)[];
  claimCountRow: (number | null)[];
} {
  const m = paidRow.length;
  const incurredRow = paidRow.map((val, j) => {
    if (val === null) return null;
    // Case reserve ratio starts higher at early lags and tapers to ~1.5% at maturity
    const caseFactor = 1 + 0.34 * Math.exp(-j * 0.42);
    return Math.round(val * caseFactor);
  });
  const claimCountRow = paidRow.map((val, j) => {
    if (val === null) return null;
    // Early lags have slightly smaller average paid per claim, growing with lag
    const sevAtLag = avgSeverity * (0.72 + 0.28 * Math.min(1, j / Math.max(1, m - 1)));
    return Math.max(1, Math.round(val / sevAtLag));
  });
  return { incurredRow, claimCountRow };
}

/**
 * Normalize dimensions dictionary for any MultiSegmentFactRecord
 */
export function getRecordDimensions(rec: MultiSegmentFactRecord): Record<string, string> {
  if (rec.dimensions && Object.keys(rec.dimensions).length > 0) {
    return rec.dimensions;
  }
  return {
    Product: rec.product,
    Channel: rec.channel,
    Coverage: rec.coverage,
    Region: rec.region,
  };
}

/**
 * Build the default multi-segment longitudinal fact store across
 * Annual (CY), Annual (FY Apr-Mar), Quarterly (3m), and Monthly (1m),
 * with Paid, Incurred (Paid + Case Reserve), Claim Counts, and Earned Exposure.
 */
export function buildDefaultMultiSegmentFactStore(): MultiSegmentFactRecord[] {
  const records: MultiSegmentFactRecord[] = [];
  const annualDevPeriods = [12, 24, 36, 48, 60, 72, 84, 96, 108, 120];

  for (const valOpt of VALUATION_MONTH_OPTIONS) {
    const valMonth = valOpt.id;
    const elapsed2026 = valOpt.elapsedMonthsIn2026;
    const progress2026 = elapsed2026 / 12;

    for (const seg of PORTFOLIO_SEGMENT_CATALOG) {
      const dims: Record<string, string> = {
        Product: seg.product,
        Channel: seg.channel,
        Coverage: seg.coverage,
        Region: seg.region,
      };

      const annualOriginYears =
        valMonth === '2025-12'
          ? [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]
          : [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

      for (const granMode of ['annual', 'annual_fy'] as const) {
        const fyFactor = granMode === 'annual_fy' ? 0.985 : 1.0;

        annualOriginYears.forEach((originYr, i) => {
          const yearGrowth = 1 + (originYr - 2017) * 0.025;
          const isCurrent2026 = originYr === 2026;
          const scale = isCurrent2026 ? Math.max(0.15, progress2026) : 1.0;
          const earnedPrem = Math.round(
            seg.baseAnnualPremium * yearGrowth * fyFactor * scale
          );
          const earnedExp = Math.round(
            seg.baseExposure * yearGrowth * fyFactor * scale
          );
          const expectedUlt = earnedPrem * seg.baseElr;

          const maxObsIdx = annualOriginYears.length - 1 - i;
          const cumulativeRow: (number | null)[] = [];
          let runningCum = 0;
          let prior2025EndCum: number | null = null;

          for (let j = 0; j < annualDevPeriods.length; j++) {
            if (j > maxObsIdx) {
              cumulativeRow.push(null);
              continue;
            }
            const w = seg.devPatternWeights[j];
            const noise = deterministicVariation(
              originYr + (granMode === 'annual_fy' ? 100 : 0),
              j,
              seg.id
            );

            const is2026CalendarDiagonal =
              valMonth !== '2025-12' && originYr <= 2025 && j === maxObsIdx;

            let inc = expectedUlt * w * noise;
            if (is2026CalendarDiagonal) {
              inc = inc * seg.cy2026PriorDevShock * Math.max(0.2, progress2026);
            }

            runningCum += Math.round(inc);
            cumulativeRow.push(runningCum);

            if (originYr <= 2025) {
              if (valMonth === '2025-12' && j === maxObsIdx) {
                prior2025EndCum = runningCum;
              } else if (valMonth !== '2025-12' && j === maxObsIdx - 1) {
                prior2025EndCum = runningCum;
              }
            }
          }

          const { incurredRow, claimCountRow } = buildMultiMetricRowsFromPaid(
            cumulativeRow,
            seg.baseSeverity
          );
          const priorIdx =
            valMonth === '2025-12' ? maxObsIdx : Math.max(0, maxObsIdx - 1);

          records.push({
            valuationMonth: valMonth,
            product: seg.product,
            channel: seg.channel,
            coverage: seg.coverage,
            region: seg.region,
            dimensions: dims,
            granularity: granMode,
            originCode: originYr,
            originLabel: granMode === 'annual_fy' ? `FY${originYr}` : `${originYr}`,
            isPriorYearOrigin: originYr <= 2025,
            devLagPeriods: annualDevPeriods,
            cumulativeRow,
            incurredCumulativeRow: incurredRow,
            claimCountCumulativeRow: claimCountRow,
            priorYearEnd2025Cumulative: prior2025EndCum,
            priorYearEnd2025Incurred: originYr <= 2025 ? incurredRow[priorIdx] ?? null : null,
            priorYearEnd2025ClaimCount:
              originYr <= 2025 ? claimCountRow[priorIdx] ?? null : null,
            earnedPremium: earnedPrem,
            earnedExposure: earnedExp,
            aprioriElr: seg.baseElr,
          });
        });
      }

      // 2. QUARTERLY GRANULARITY
      const quarterLabels = [
        { code: 20242, label: '2024-Q2', isPrior: true },
        { code: 20243, label: '2024-Q3', isPrior: true },
        { code: 20244, label: '2024-Q4', isPrior: true },
        { code: 20251, label: '2025-Q1', isPrior: true },
        { code: 20252, label: '2025-Q2', isPrior: true },
        { code: 20253, label: '2025-Q3', isPrior: true },
        { code: 20254, label: '2025-Q4', isPrior: true },
        { code: 20261, label: '2026-Q1', isPrior: false },
        { code: 20262, label: '2026-Q2', isPrior: false },
        { code: 20263, label: '2026-Q3', isPrior: false },
      ];
      const quarterDevs = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30];

      quarterLabels.forEach((qSpec, i) => {
        const qPrem = Math.round((seg.baseAnnualPremium / 4) * (1 + i * 0.01));
        const qExp = Math.round((seg.baseExposure / 4) * (1 + i * 0.01));
        const qExpectedUlt = qPrem * seg.baseElr;
        const maxObsIdx = quarterLabels.length - 1 - i;
        const cumulativeRow: (number | null)[] = [];
        let runCum = 0;
        let prior2025Cum: number | null = null;

        for (let j = 0; j < quarterDevs.length; j++) {
          if (j > maxObsIdx) {
            cumulativeRow.push(null);
            continue;
          }
          const noise = deterministicVariation(qSpec.code, j, seg.id);
          const is2026CalendarDiag =
            valMonth !== '2025-12' && qSpec.isPrior && i + j >= 7;
          const shock = is2026CalendarDiag
            ? 1 + (seg.cy2026PriorDevShock - 1) * progress2026
            : 1.0;
          const inc = qExpectedUlt * seg.devPatternWeights[j] * noise * shock;
          runCum += Math.round(inc);
          cumulativeRow.push(runCum);

          if (qSpec.isPrior && i + j === 6) {
            prior2025Cum = runCum;
          }
        }

        const { incurredRow, claimCountRow } = buildMultiMetricRowsFromPaid(
          cumulativeRow,
          seg.baseSeverity
        );

        records.push({
          valuationMonth: valMonth,
          product: seg.product,
          channel: seg.channel,
          coverage: seg.coverage,
          region: seg.region,
          dimensions: dims,
          granularity: 'quarterly',
          originCode: qSpec.code,
          originLabel: qSpec.label,
          isPriorYearOrigin: qSpec.isPrior,
          devLagPeriods: quarterDevs,
          cumulativeRow,
          incurredCumulativeRow: incurredRow,
          claimCountCumulativeRow: claimCountRow,
          priorYearEnd2025Cumulative: prior2025Cum,
          priorYearEnd2025Incurred:
            qSpec.isPrior && 6 - i >= 0 ? incurredRow[6 - i] ?? null : null,
          priorYearEnd2025ClaimCount:
            qSpec.isPrior && 6 - i >= 0 ? claimCountRow[6 - i] ?? null : null,
          earnedPremium: qPrem,
          earnedExposure: qExp,
          aprioriElr: seg.baseElr,
        });
      });

      // 3. MONTHLY GRANULARITY
      const monthSpecs = [
        { code: 202510, label: '2025-10', isPrior: true },
        { code: 202511, label: '2025-11', isPrior: true },
        { code: 202512, label: '2025-12', isPrior: true },
        { code: 202601, label: '2026-01', isPrior: false },
        { code: 202602, label: '2026-02', isPrior: false },
        { code: 202603, label: '2026-03', isPrior: false },
        { code: 202604, label: '2026-04', isPrior: false },
        { code: 202605, label: '2026-05', isPrior: false },
        { code: 202606, label: '2026-06', isPrior: false },
        { code: 202607, label: '2026-07', isPrior: false },
      ];
      const monthDevs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      monthSpecs.forEach((mSpec, i) => {
        const mPrem = Math.round((seg.baseAnnualPremium / 12) * (1 + i * 0.004));
        const mExp = Math.round((seg.baseExposure / 12) * (1 + i * 0.004));
        const mExpectedUlt = mPrem * seg.baseElr;
        const maxObsIdx = monthSpecs.length - 1 - i;
        const cumulativeRow: (number | null)[] = [];
        let runCum = 0;
        let prior2025Cum: number | null = null;

        for (let j = 0; j < monthDevs.length; j++) {
          if (j > maxObsIdx) {
            cumulativeRow.push(null);
            continue;
          }
          const noise = deterministicVariation(mSpec.code, j, seg.id);
          const is2026Diag =
            valMonth !== '2025-12' && mSpec.isPrior && i + j >= 3;
          const shock = is2026Diag
            ? 1 + (seg.cy2026PriorDevShock - 1) * progress2026
            : 1.0;
          const inc = mExpectedUlt * seg.devPatternWeights[j] * noise * shock;
          runCum += Math.round(inc);
          cumulativeRow.push(runCum);

          if (mSpec.isPrior && i + j === 2) {
            prior2025Cum = runCum;
          }
        }

        const { incurredRow, claimCountRow } = buildMultiMetricRowsFromPaid(
          cumulativeRow,
          seg.baseSeverity
        );

        records.push({
          valuationMonth: valMonth,
          product: seg.product,
          channel: seg.channel,
          coverage: seg.coverage,
          region: seg.region,
          dimensions: dims,
          granularity: 'monthly',
          originCode: mSpec.code,
          originLabel: mSpec.label,
          isPriorYearOrigin: mSpec.isPrior,
          devLagPeriods: monthDevs,
          cumulativeRow,
          incurredCumulativeRow: incurredRow,
          claimCountCumulativeRow: claimCountRow,
          priorYearEnd2025Cumulative: prior2025Cum,
          priorYearEnd2025Incurred:
            mSpec.isPrior && 2 - i >= 0 ? incurredRow[2 - i] ?? null : null,
          priorYearEnd2025ClaimCount:
            mSpec.isPrior && 2 - i >= 0 ? claimCountRow[2 - i] ?? null : null,
          earnedPremium: mPrem,
          earnedExposure: mExp,
          aprioriElr: seg.baseElr,
        });
      });
    }
  }

  return records;
}

/**
 * Extract unique available segment dimensions & values dynamically from the fact store.
 */
export function getAvailableSegmentDimensions(records: MultiSegmentFactRecord[]): {
  products: string[];
  channels: string[];
  coverages: string[];
  regions: string[];
  dimensionKeys: string[];
  dimensionValues: Record<string, string[]>;
  valuationMonths: string[];
  granularities: TimeGranularity[];
} {
  const products = Array.from(new Set(records.map((r) => r.product)));
  const channels = Array.from(new Set(records.map((r) => r.channel)));
  const coverages = Array.from(new Set(records.map((r) => r.coverage)));
  const regions = Array.from(new Set(records.map((r) => r.region)));

  const dimSetMap = new Map<string, Set<string>>();
  const valMonthSet = new Set<string>();
  const granSet = new Set<TimeGranularity>();

  for (const r of records) {
    valMonthSet.add(r.valuationMonth);
    granSet.add(r.granularity);
    const dims = getRecordDimensions(r);
    for (const [k, v] of Object.entries(dims)) {
      if (!dimSetMap.has(k)) {
        dimSetMap.set(k, new Set<string>());
      }
      dimSetMap.get(k)!.add(v);
    }
  }

  const dimensionKeys = Array.from(dimSetMap.keys());
  const dimensionValues: Record<string, string[]> = {};
  for (const k of dimensionKeys) {
    dimensionValues[k] = Array.from(dimSetMap.get(k) ?? []);
  }

  return {
    products,
    channels,
    coverages,
    regions,
    dimensionKeys,
    dimensionValues,
    valuationMonths: Array.from(valMonthSet),
    granularities: Array.from(granSet),
  };
}

function matchesSegmentFilter(
  rec: MultiSegmentFactRecord,
  filters: SegmentFilterState
): boolean {
  if (filters.product && filters.product !== 'ALL' && rec.product !== filters.product) {
    return false;
  }
  if (filters.channel && filters.channel !== 'ALL' && rec.channel !== filters.channel) {
    return false;
  }
  if (filters.coverage && filters.coverage !== 'ALL' && rec.coverage !== filters.coverage) {
    return false;
  }
  if (filters.region && filters.region !== 'ALL' && rec.region !== filters.region) {
    return false;
  }

  const dims = getRecordDimensions(rec);
  for (const [k, filterVal] of Object.entries(filters)) {
    if (
      k === 'product' ||
      k === 'channel' ||
      k === 'coverage' ||
      k === 'region' ||
      !filterVal ||
      filterVal === 'ALL'
    ) {
      continue;
    }
    if (dims[k] !== undefined && dims[k] !== filterVal) {
      return false;
    }
  }
  return true;
}

/**
 * Dynamically filter & aggregate fact records into a single Cumulative Triangle Slice
 * for any combination of (valuationMonth, granularity, segment filters, metric, and exposureBase).
 */
export function pivotSegmentTriangle(
  records: MultiSegmentFactRecord[],
  valuationMonth: ValuationMonthId,
  granularity: TimeGranularity,
  filters: SegmentFilterState,
  metric: AnalysisMetricType = 'paid',
  exposureBase: ExposureBaseType = 'premium'
): PivotedTriangleSlice {
  const filterKeyParts = Object.entries(filters)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v || 'ALL'}`)
    .join('&');
  const sliceKey = `${valuationMonth}|${granularity}|${metric}|${exposureBase}|${filterKeyParts}`;

  const hasValMonth = records.some((r) => r.valuationMonth === valuationMonth);
  const effectiveValMonth = hasValMonth
    ? valuationMonth
    : records[records.length - 1]?.valuationMonth ?? valuationMonth;

  const hasGranularity = records.some(
    (r) => r.valuationMonth === effectiveValMonth && r.granularity === granularity
  );
  const effectiveGranularity = hasGranularity
    ? granularity
    : records.find((r) => r.valuationMonth === effectiveValMonth)?.granularity ??
      granularity;

  let matching = records.filter(
    (r) =>
      r.valuationMonth === effectiveValMonth &&
      r.granularity === effectiveGranularity &&
      matchesSegmentFilter(r, filters)
  );

  if (matching.length === 0) {
    matching = records.filter(
      (r) =>
        r.valuationMonth === effectiveValMonth &&
        r.granularity === effectiveGranularity &&
        (filters.product === 'ALL' || !filters.product || r.product === filters.product)
    );
  }
  if (matching.length === 0) {
    matching = records.filter(
      (r) =>
        r.valuationMonth === effectiveValMonth &&
        r.granularity === effectiveGranularity
    );
  }

  const originMap = new Map<
    number,
    {
      originCode: number;
      originLabel: string;
      isPriorYearOrigin: boolean;
      devLagPeriods: number[];
      paidSums: (number | null)[];
      incurredSums: (number | null)[];
      countSums: (number | null)[];
      priorPaidSum: number | null;
      priorIncurredSum: number | null;
      priorCountSum: number | null;
      earnedPremiumSum: number;
      earnedExposureSum: number;
      weightedElrNumerator: number;
      segmentCount: number;
    }
  >();

  // Build master development lag axis across all matched segments (handles asymmetric / new-launch segments)
  const masterDevPeriods = Array.from(
    new Set(matching.flatMap((r) => r.devLagPeriods))
  ).sort((a, b) => a - b);
  const devPeriods =
    masterDevPeriods.length > 0
      ? masterDevPeriods
      : [12, 24, 36, 48, 60, 72, 84, 96, 108, 120];

  const alignToMasterDevs = (
    recDevs: number[],
    row: (number | null)[]
  ): (number | null)[] => {
    if (
      recDevs.length === devPeriods.length &&
      recDevs.every((d, idx) => d === devPeriods[idx])
    ) {
      return row;
    }
    return devPeriods.map((d) => {
      const idx = recDevs.indexOf(d);
      return idx !== -1 ? row[idx] ?? null : null;
    });
  };

  for (const rec of matching) {
    const fallbackDerived =
      !rec.incurredCumulativeRow || !rec.claimCountCumulativeRow
        ? buildMultiMetricRowsFromPaid(rec.cumulativeRow)
        : null;
    const rawPaidRow = alignToMasterDevs(rec.devLagPeriods, rec.cumulativeRow);
    const rawIncRow = alignToMasterDevs(
      rec.devLagPeriods,
      rec.incurredCumulativeRow ?? fallbackDerived!.incurredRow
    );
    const rawCntRow = alignToMasterDevs(
      rec.devLagPeriods,
      rec.claimCountCumulativeRow ?? fallbackDerived!.claimCountRow
    );
    const expVal =
      rec.earnedExposure ?? Math.max(100, Math.round(rec.earnedPremium / 80));

    const existing = originMap.get(rec.originCode);
    if (!existing) {
      originMap.set(rec.originCode, {
        originCode: rec.originCode,
        originLabel: rec.originLabel,
        isPriorYearOrigin: rec.isPriorYearOrigin,
        devLagPeriods: [...devPeriods],
        paidSums: rawPaidRow.map((v) => (v === null ? null : v)),
        incurredSums: rawIncRow.map((v) => (v === null ? null : v)),
        countSums: rawCntRow.map((v) => (v === null ? null : v)),
        priorPaidSum: rec.priorYearEnd2025Cumulative,
        priorIncurredSum:
          rec.priorYearEnd2025Incurred ??
          (rec.priorYearEnd2025Cumulative !== null
            ? Math.round(rec.priorYearEnd2025Cumulative * 1.12)
            : null),
        priorCountSum:
          rec.priorYearEnd2025ClaimCount ??
          (rec.priorYearEnd2025Cumulative !== null
            ? Math.max(1, Math.round(rec.priorYearEnd2025Cumulative / 4200))
            : null),
        earnedPremiumSum: rec.earnedPremium,
        earnedExposureSum: expVal,
        weightedElrNumerator: rec.earnedPremium * rec.aprioriElr,
        segmentCount: 1,
      });
    } else {
      for (let j = 0; j < devPeriods.length; j++) {
        const vp = rawPaidRow[j];
        if (vp !== null) existing.paidSums[j] = (existing.paidSums[j] ?? 0) + vp;
        const vi = rawIncRow[j];
        if (vi !== null)
          existing.incurredSums[j] = (existing.incurredSums[j] ?? 0) + vi;
        const vc = rawCntRow[j];
        if (vc !== null) existing.countSums[j] = (existing.countSums[j] ?? 0) + vc;
      }
      if (rec.priorYearEnd2025Cumulative !== null) {
        existing.priorPaidSum =
          (existing.priorPaidSum ?? 0) + rec.priorYearEnd2025Cumulative;
        const pInc =
          rec.priorYearEnd2025Incurred ??
          Math.round(rec.priorYearEnd2025Cumulative * 1.12);
        existing.priorIncurredSum = (existing.priorIncurredSum ?? 0) + pInc;
        const pCnt =
          rec.priorYearEnd2025ClaimCount ??
          Math.max(1, Math.round(rec.priorYearEnd2025Cumulative / 4200));
        existing.priorCountSum = (existing.priorCountSum ?? 0) + pCnt;
      }
      existing.earnedPremiumSum += rec.earnedPremium;
      existing.earnedExposureSum += expVal;
      existing.weightedElrNumerator += rec.earnedPremium * rec.aprioriElr;
      existing.segmentCount += 1;
    }
  }

  const sortedOrigins = Array.from(originMap.values()).sort(
    (a, b) => a.originCode - b.originCode
  );

  const matchedSegmentCount = Math.max(
    0,
    ...sortedOrigins.map((o) => o.segmentCount)
  );

  const cumulativeTriangle: (number | null)[][] = sortedOrigins.map((o) => {
    if (metric === 'incurred') return o.incurredSums;
    if (metric === 'claim_count') return o.countSums;
    if (metric === 'severity') {
      return o.paidSums.map((p, j) => {
        const c = o.countSums[j];
        if (p === null || c === null || c <= 0) return null;
        return Math.round(p / c);
      });
    }
    return o.paidSums;
  });

  const priorYearEnd2025Diagonal: (number | null)[] = sortedOrigins.map((o) => {
    if (metric === 'incurred') return o.priorIncurredSum;
    if (metric === 'claim_count') return o.priorCountSum;
    if (metric === 'severity') {
      if (
        o.priorPaidSum === null ||
        o.priorCountSum === null ||
        o.priorCountSum <= 0
      ) {
        return null;
      }
      return Math.round(o.priorPaidSum / o.priorCountSum);
    }
    return o.priorPaidSum;
  });

  const activeDenominator = sortedOrigins.map((o) =>
    exposureBase === 'exposure' ? o.earnedExposureSum : o.earnedPremiumSum
  );

  return {
    sliceKey,
    valuationMonth: effectiveValMonth,
    granularity: effectiveGranularity,
    metric,
    exposureBase,
    filters,
    matchedSegmentCount,
    originCodes: sortedOrigins.map((o) => o.originCode),
    originLabels: sortedOrigins.map((o) => o.originLabel),
    isPriorYearFlags: sortedOrigins.map((o) => o.isPriorYearOrigin),
    devPeriods,
    devUnitLabel: 'm',
    cumulativeTriangle,
    priorYearEnd2025Diagonal,
    earnedPremium: activeDenominator,
    earnedExposure: sortedOrigins.map((o) => o.earnedExposureSum),
    aprioriElr: sortedOrigins.map((o) =>
      o.earnedPremiumSum > 0
        ? Number((o.weightedElrNumerator / o.earnedPremiumSum).toFixed(4))
        : 0.78
    ),
  };
}

/**
 * Compute comprehensive Prior Year Development (PYD) & Multi-Segment Portfolio Roll-Up
 */
export function computePriorYearDevelopmentAndRollup(
  records: MultiSegmentFactRecord[],
  activeSlice: PivotedTriangleSlice,
  activeEvaluation: ActuarialEvaluationResult,
  pydConfig?: PydConfiguration,
  displayDivisor = 1
): PriorYearDevelopmentAnalysis {
  const effDiv =
    activeSlice.metric === 'claim_count'
      ? 1
      : displayDivisor && displayDivisor > 0
      ? displayDivisor
      : 1;

  const scaleSlice = (s: PivotedTriangleSlice): PivotedTriangleSlice => {
    if (effDiv === 1) return s;
    return {
      ...s,
      cumulativeTriangle: s.cumulativeTriangle.map((row) =>
        row.map((v) => (v === null ? null : v / effDiv))
      ),
      priorYearEnd2025Diagonal: s.priorYearEnd2025Diagonal.map((v) =>
        v === null ? null : v / effDiv
      ),
      earnedPremium:
        s.exposureBase === 'premium'
          ? s.earnedPremium.map((p) => p / effDiv)
          : s.earnedPremium,
    };
  };
  const availableCutoffOrigins = activeSlice.originCodes.map((code, idx) => ({
    code,
    label: activeSlice.originLabels[idx] ?? `${code}`,
  }));

  const defaultPriorIdx = (() => {
    let lastTrueIdx = -1;
    activeSlice.isPriorYearFlags.forEach((flag, idx) => {
      if (flag) lastTrueIdx = idx;
    });
    if (lastTrueIdx >= 0 && lastTrueIdx < activeSlice.originCodes.length) {
      return lastTrueIdx;
    }
    return Math.max(0, activeSlice.originCodes.length - 2);
  })();

  const effectiveCutoffCode =
    pydConfig?.priorCutoffOriginCode != null &&
    activeSlice.originCodes.includes(pydConfig.priorCutoffOriginCode)
      ? pydConfig.priorCutoffOriginCode
      : activeSlice.originCodes[defaultPriorIdx] ??
        activeSlice.originCodes[Math.max(0, activeSlice.originCodes.length - 2)] ??
        2025;

  const cutoffLabelObj = availableCutoffOrigins.find(
    (o) => o.code === effectiveCutoffCode
  );
  const priorCutoffLabel = `≤ ${cutoffLabelObj?.label ?? effectiveCutoffCode}`;

  const defaultStepsBack =
    activeSlice.granularity === 'quarterly'
      ? 3
      : activeSlice.granularity === 'monthly'
      ? 7
      : 1;
  const effectiveStepsBack =
    pydConfig?.baselineDiagonalStepsBack != null &&
    pydConfig.baselineDiagonalStepsBack >= 1
      ? pydConfig.baselineDiagonalStepsBack
      : defaultStepsBack;

  const availableBaselineSteps = [
    {
      stepsBack: defaultStepsBack,
      label: `Auto Prior Year-End (-${defaultStepsBack} Step${defaultStepsBack > 1 ? 's' : ''})`,
    },
    { stepsBack: 1, label: '-1 Diagonal Step (1期前対角線)' },
    { stepsBack: 2, label: '-2 Diagonal Steps (2期前対角線)' },
    { stepsBack: 3, label: '-3 Diagonal Steps (3期前対角線)' },
    { stepsBack: 4, label: '-4 Diagonal Steps (4期前対角線)' },
  ].filter(
    (item, idx, self) =>
      self.findIndex((x) => x.stepsBack === item.stepsBack) === idx
  );

  const distinctValMonths = Array.from(
    new Set(records.map((r) => r.valuationMonth))
  ).sort();
  const hasExplicit2025Snapshot =
    distinctValMonths.includes('2025-12') &&
    pydConfig?.baselineDiagonalStepsBack == null;

  const baselineValMonthId =
    pydConfig?.baselineValuationMonth ??
    (hasExplicit2025Snapshot ? '2025-12' : distinctValMonths[0] ?? activeSlice.valuationMonth);

  const baselineSlice2025 = scaleSlice(
    pivotSegmentTriangle(
      records,
      baselineValMonthId,
      activeSlice.granularity,
      activeSlice.filters,
      activeSlice.metric,
      activeSlice.exposureBase
    )
  );

  const n2025 = baselineSlice2025.originCodes.length;
  const m2025 = baselineSlice2025.devPeriods.length;
  const baselineInput2025: ActuarialInput = {
    originYears: baselineSlice2025.originCodes,
    devPeriods: baselineSlice2025.devPeriods,
    cumulativeTriangle: baselineSlice2025.cumulativeTriangle,
    earnedPremium: baselineSlice2025.earnedPremium,
    aprioriElr: baselineSlice2025.aprioriElr,
    exclusions: Array.from({ length: n2025 }, () =>
      new Array(Math.max(0, m2025 - 1)).fill(false)
    ),
    selectedLdfMode: 'vw_all',
    manualLdfs: new Array(Math.max(0, m2025 - 1)).fill(null),
    tailFactor: activeEvaluation.tailFactor,
    selectedMethods: new Array(n2025).fill('CL'),
    methodWeights: Array.from({ length: n2025 }, () => ({ cl: 1, bf: 0, cc: 0 })),
  };
  const baselineEval2025 = evaluateActuarialModel(baselineInput2025);

  const elapsed2026Months =
    VALUATION_MONTH_OPTIONS.find((v) => v.id === activeSlice.valuationMonth)
      ?.elapsedMonthsIn2026 ?? 12;
  const yearFraction2026 = elapsed2026Months / 12;

  const cohortRows: OriginPydCohortRow[] = [];

  let sumPremPrior = 0;
  let sumPaid2025 = 0;
  let sumIbnr2025 = 0;
  let sumUlt2025 = 0;
  let sumActEmergence2026 = 0;
  let sumExpEmergence2026 = 0;
  let sumPaid2026Prior = 0;
  let sumIbnr2026Prior = 0;
  let sumUlt2026Prior = 0;

  let sumPremNew2026 = 0;
  let sumPaidNew2026 = 0;
  let sumIbnrNew2026 = 0;
  let sumUltNew2026 = 0;

  const useCustomStepBack = pydConfig?.baselineDiagonalStepsBack != null;

  activeEvaluation.rows.forEach((currRow, idx) => {
    const originCode = activeSlice.originCodes[idx];
    const originLabel = activeSlice.originLabels[idx] ?? `${originCode}`;
    const isPriorYear = originCode <= effectiveCutoffCode;

    if (!isPriorYear) {
      sumPremNew2026 += currRow.earnedPremium;
      sumPaidNew2026 += currRow.latestCumulative;
      sumIbnrNew2026 += currRow.selectedIbnr;
      sumUltNew2026 += currRow.selectedUltimate;

      cohortRows.push({
        originCode,
        originLabel,
        isPriorYear: false,
        earnedPremium: currRow.earnedPremium,
        paid2025End: 0,
        ibnr2025End: 0,
        ultimate2025End: 0,
        actual2026Emergence: currRow.latestCumulative,
        expected2026Emergence: currRow.latestCumulative,
        aveEmergenceDiff: 0,
        paid2026Current: currRow.latestCumulative,
        ibnr2026Current: currRow.selectedIbnr,
        ultimate2026Current: currRow.selectedUltimate,
        ibnrChange2026: currRow.selectedIbnr,
        priorYearDevelopment: 0,
        pydPctOf2025Reserve: null,
        pydPctOf2025Ultimate: null,
      });
      return;
    }

    const baseRow2025 = baselineEval2025.rows.find(
      (r) => r.originYear === originCode
    );

    const prevDevIndex =
      activeSlice.valuationMonth === '2025-12' && !useCustomStepBack
        ? currRow.latestDevIndex
        : useCustomStepBack
        ? Math.max(0, currRow.latestDevIndex - effectiveStepsBack)
        : activeSlice.granularity === 'quarterly' && hasExplicit2025Snapshot
        ? Math.max(0, 6 - idx)
        : activeSlice.granularity === 'monthly' && hasExplicit2025Snapshot
        ? Math.max(0, 2 - idx)
        : Math.max(0, currRow.latestDevIndex - effectiveStepsBack);

    const cellAtPrevDev = activeSlice.cumulativeTriangle[idx]?.[prevDevIndex];
    const paid2025End = useCustomStepBack
      ? cellAtPrevDev ?? currRow.latestCumulative
      : activeSlice.priorYearEnd2025Diagonal[idx] ??
        cellAtPrevDev ??
        baseRow2025?.latestCumulative ??
        currRow.latestCumulative;

    const cdfAt2025End =
      baselineEval2025.cdfs[prevDevIndex] ??
      activeEvaluation.cdfs[prevDevIndex] ??
      currRow.cdfToUltimate;

    const ultimate2025End =
      activeSlice.valuationMonth === '2025-12' && !useCustomStepBack
        ? currRow.selectedUltimate
        : !useCustomStepBack &&
          (activeSlice.granularity === 'annual' ||
            activeSlice.granularity === 'annual_fy') &&
          hasExplicit2025Snapshot &&
          baseRow2025
        ? baseRow2025.selectedUltimate
        : paid2025End * cdfAt2025End;
    const ibnr2025End = ultimate2025End - paid2025End;

    const paid2026Current = currRow.latestCumulative;
    const ibnr2026Current = currRow.selectedIbnr;
    const ultimate2026Current = currRow.selectedUltimate;

    const actual2026Emergence = paid2026Current - paid2025End;

    const ldfStep =
      baselineEval2025.selectedLdfs[prevDevIndex] ??
      activeEvaluation.selectedLdfs[prevDevIndex] ??
      1.0;
    const fullStepExpected = paid2025End * Math.max(0, ldfStep - 1.0);
    const expected2026Emergence =
      activeSlice.valuationMonth === '2025-12' && !useCustomStepBack
        ? 0
        : activeSlice.granularity === 'annual' ||
          activeSlice.granularity === 'annual_fy'
        ? fullStepExpected * Math.max(0.2, yearFraction2026)
        : fullStepExpected;

    const aveEmergenceDiff = actual2026Emergence - expected2026Emergence;
    const ibnrChange2026 = ibnr2026Current - ibnr2025End;
    const priorYearDevelopment = ultimate2026Current - ultimate2025End;

    const pydPctOf2025Reserve =
      Math.abs(ibnr2025End) > 1e-6 ? priorYearDevelopment / ibnr2025End : null;
    const pydPctOf2025Ultimate =
      Math.abs(ultimate2025End) > 1e-6
        ? priorYearDevelopment / ultimate2025End
        : null;

    sumPremPrior += currRow.earnedPremium;
    sumPaid2025 += paid2025End;
    sumIbnr2025 += ibnr2025End;
    sumUlt2025 += ultimate2025End;
    sumActEmergence2026 += actual2026Emergence;
    sumExpEmergence2026 += expected2026Emergence;
    sumPaid2026Prior += paid2026Current;
    sumIbnr2026Prior += ibnr2026Current;
    sumUlt2026Prior += ultimate2026Current;

    cohortRows.push({
      originCode,
      originLabel,
      isPriorYear: true,
      earnedPremium: currRow.earnedPremium,
      paid2025End,
      ibnr2025End,
      ultimate2025End,
      actual2026Emergence,
      expected2026Emergence,
      aveEmergenceDiff,
      paid2026Current,
      ibnr2026Current,
      ultimate2026Current,
      ibnrChange2026,
      priorYearDevelopment,
      pydPctOf2025Reserve,
      pydPctOf2025Ultimate,
    });
  });

  const totalPyd = sumUlt2026Prior - sumUlt2025;

  const uniqueSegmentsMap = new Map<
    string,
    {
      id: string;
      product: string;
      channel: string;
      coverage: string;
      region: string;
      dimensions: Record<string, string>;
    }
  >();

  for (const r of records) {
    if (
      r.valuationMonth === activeSlice.valuationMonth &&
      r.granularity === activeSlice.granularity
    ) {
      const dims = getRecordDimensions(r);
      const segKey = Object.entries(dims)
        .map(([k, v]) => `${k}:${v}`)
        .join('|');
      if (!uniqueSegmentsMap.has(segKey)) {
        uniqueSegmentsMap.set(segKey, {
          id: segKey,
          product: r.product,
          channel: r.channel,
          coverage: r.coverage,
          region: r.region,
          dimensions: dims,
        });
      }
    }
  }

  const segmentRollupRows: SegmentPortfolioRollupRow[] = Array.from(
    uniqueSegmentsMap.values()
  ).map((seg, sIdx) => {
    const segFilters: SegmentFilterState = {
      product: seg.product,
      channel: seg.channel,
      coverage: seg.coverage,
      region: seg.region,
      ...seg.dimensions,
    };

    const sliceCurr = scaleSlice(
      pivotSegmentTriangle(
        records,
        activeSlice.valuationMonth,
        activeSlice.granularity,
        segFilters,
        activeSlice.metric,
        activeSlice.exposureBase
      )
    );
    const sliceBase = scaleSlice(
      pivotSegmentTriangle(
        records,
        baselineValMonthId,
        activeSlice.granularity,
        segFilters,
        activeSlice.metric,
        activeSlice.exposureBase
      )
    );

    const nC = sliceCurr.originCodes.length;
    const mC = sliceCurr.devPeriods.length;
    const eval2026 = evaluateActuarialModel({
      originYears: sliceCurr.originCodes,
      devPeriods: sliceCurr.devPeriods,
      cumulativeTriangle: sliceCurr.cumulativeTriangle,
      earnedPremium: sliceCurr.earnedPremium,
      aprioriElr: sliceCurr.aprioriElr,
      exclusions: Array.from({ length: nC }, () =>
        new Array(Math.max(0, mC - 1)).fill(false)
      ),
      selectedLdfMode: 'vw_all',
      manualLdfs: new Array(Math.max(0, mC - 1)).fill(null),
      tailFactor: activeEvaluation.tailFactor,
      selectedMethods: new Array(nC).fill('CL'),
      methodWeights: Array.from({ length: nC }, () => ({ cl: 1, bf: 0, cc: 0 })),
    });

    const nB = sliceBase.originCodes.length;
    const mB = sliceBase.devPeriods.length;
    const eval2025 = evaluateActuarialModel({
      originYears: sliceBase.originCodes,
      devPeriods: sliceBase.devPeriods,
      cumulativeTriangle: sliceBase.cumulativeTriangle,
      earnedPremium: sliceBase.earnedPremium,
      aprioriElr: sliceBase.aprioriElr,
      exclusions: Array.from({ length: nB }, () =>
        new Array(Math.max(0, mB - 1)).fill(false)
      ),
      selectedLdfMode: 'vw_all',
      manualLdfs: new Array(Math.max(0, mB - 1)).fill(null),
      tailFactor: activeEvaluation.tailFactor,
      selectedMethods: new Array(nB).fill('CL'),
      methodWeights: Array.from({ length: nB }, () => ({ cl: 1, bf: 0, cc: 0 })),
    });

    let segPaid2025Prior = 0;
    let segIbnr2025Prior = 0;
    let segUlt2025Prior = 0;
    let segPaid2026Prior = 0;
    let segIbnr2026Prior = 0;
    let segUlt2026Prior = 0;
    let segExpEmerg2026 = 0;
    let segIbnr2026New = 0;

    eval2026.rows.forEach((r26, i) => {
      const code = sliceCurr.originCodes[i];
      const isPrior = code <= effectiveCutoffCode;
      if (isPrior) {
        const r25 = eval2025.rows.find((row) => row.originYear === code);
        const prevIdx =
          activeSlice.valuationMonth === '2025-12' && !useCustomStepBack
            ? r26.latestDevIndex
            : useCustomStepBack
            ? Math.max(0, r26.latestDevIndex - effectiveStepsBack)
            : activeSlice.granularity === 'quarterly' && hasExplicit2025Snapshot
            ? Math.max(0, 6 - i)
            : activeSlice.granularity === 'monthly' && hasExplicit2025Snapshot
            ? Math.max(0, 2 - i)
            : Math.max(0, r26.latestDevIndex - effectiveStepsBack);

        const cellPrev = sliceCurr.cumulativeTriangle[i]?.[prevIdx];
        const p25 = useCustomStepBack
          ? cellPrev ?? r26.latestCumulative
          : sliceCurr.priorYearEnd2025Diagonal[i] ??
            cellPrev ??
            r25?.latestCumulative ??
            r26.latestCumulative;

        const cdf25 =
          eval2025.cdfs[prevIdx] ?? eval2026.cdfs[prevIdx] ?? r26.cdfToUltimate;
        const u25 =
          activeSlice.valuationMonth === '2025-12' && !useCustomStepBack
            ? r26.selectedUltimate
            : !useCustomStepBack &&
              (activeSlice.granularity === 'annual' ||
                activeSlice.granularity === 'annual_fy') &&
              hasExplicit2025Snapshot &&
              r25
            ? r25.selectedUltimate
            : p25 * cdf25;
        const ib25 = u25 - p25;
        const ldf =
          eval2025.selectedLdfs[prevIdx] ?? eval2026.selectedLdfs[prevIdx] ?? 1.0;

        segPaid2025Prior += p25;
        segIbnr2025Prior += ib25;
        segUlt2025Prior += u25;
        segPaid2026Prior += r26.latestCumulative;
        segIbnr2026Prior += r26.selectedIbnr;
        segUlt2026Prior += r26.selectedUltimate;
        segExpEmerg2026 +=
          activeSlice.valuationMonth === '2025-12' && !useCustomStepBack
            ? 0
            : p25 * Math.max(0, ldf - 1.0) * Math.max(0.2, yearFraction2026);
      } else {
        segIbnr2026New += r26.selectedIbnr;
      }
    });

    const segPyd = segUlt2026Prior - segUlt2025Prior;

    return {
      segmentId: `SEG-${sIdx + 1}`,
      product: seg.product,
      channel: seg.channel,
      coverage: seg.coverage,
      region: seg.region,
      dimensions: seg.dimensions,
      earnedPremium: eval2026.totals.earnedPremium,
      latestPaid2026: eval2026.totals.latestCumulative,
      ibnr2025EndPriorCohorts: segIbnr2025Prior,
      ultimate2025EndPriorCohorts: segUlt2025Prior,
      actual2026EmergencePriorCohorts: segPaid2026Prior - segPaid2025Prior,
      expected2026EmergencePriorCohorts: segExpEmerg2026,
      ibnr2026CurrentTotal: eval2026.totals.selectedIbnr,
      ibnr2026PriorCohorts: segIbnr2026Prior,
      ibnr2026NewCohort: segIbnr2026New,
      ultimate2026CurrentTotal: eval2026.totals.selectedUltimate,
      ultimateLossRatio2026: eval2026.totals.ultimateLossRatio,
      priorYearDevelopment2026: segPyd,
      pydPctOfPriorReserve:
        Math.abs(segIbnr2025Prior) > 1e-6 ? segPyd / segIbnr2025Prior : 0,
      mackSe: eval2026.totals.mackTotalSe,
    };
  });

  const baselineValuationLabel = useCustomStepBack
    ? `Prior Diag (-${effectiveStepsBack} Step${effectiveStepsBack > 1 ? 's' : ''})`
    : hasExplicit2025Snapshot
    ? '2025-12'
    : `Prior Diag (-${effectiveStepsBack} Step)`;

  return {
    valuationMonth: activeSlice.valuationMonth,
    baselineValuationMonth: baselineValMonthId,
    currentValuationLabel: activeSlice.valuationMonth,
    baselineValuationLabel,
    priorCutoffOriginCode: effectiveCutoffCode,
    priorCutoffLabel,
    baselineStepsBack: effectiveStepsBack,
    availableCutoffOrigins,
    availableBaselineSteps,
    granularity: activeSlice.granularity,
    metric: activeSlice.metric,
    cohortRows,
    priorTotals: {
      earnedPremium: sumPremPrior,
      paid2025End: sumPaid2025,
      ibnr2025End: sumIbnr2025,
      ultimate2025End: sumUlt2025,
      actual2026Emergence: sumActEmergence2026,
      expected2026Emergence: sumExpEmergence2026,
      aveEmergenceDiff: sumActEmergence2026 - sumExpEmergence2026,
      paid2026Current: sumPaid2026Prior,
      ibnr2026Current: sumIbnr2026Prior,
      ultimate2026Current: sumUlt2026Prior,
      ibnrChange2026: sumIbnr2026Prior - sumIbnr2025,
      priorYearDevelopment: totalPyd,
      pydPctOf2025Reserve:
        Math.abs(sumIbnr2025) > 1e-6 ? totalPyd / sumIbnr2025 : 0,
      pydPctOf2025Ultimate:
        Math.abs(sumUlt2025) > 1e-6 ? totalPyd / sumUlt2025 : 0,
    },
    currentYear2026Totals: {
      earnedPremium: sumPremNew2026,
      paid2026Current: sumPaidNew2026,
      ibnr2026Current: sumIbnrNew2026,
      ultimate2026Current: sumUltNew2026,
    },
    segmentRollupRows,
  };
}

// ============================================================================
// FLEXIBLE ORIGIN DATE PARSER, SCHEMA MAPPER & MULTI-GRANULARITY ROLL-UP ENGINE
// ============================================================================

export interface CsvColumnMappingConfig {
  originCol: string;
  devMode: 'lag' | 'valuation_period';
  devOrValCol: string;
  lossCol: string;
  lossType: 'cumulative' | 'incremental';
  incurredCol?: string;
  caseReserveCol?: string;
  claimCountCol?: string;
  premiumCol?: string;
  exposureCol?: string;
  elrCol?: string;
  segmentCols: string[];
  valuationLabel?: string;
  fillInteriorGaps?: boolean;
  unitMultiplier?: number;
}

export interface DataHealthDiagnostics {
  totalDataRows: number;
  validCellsCount: number;
  skippedRowsCount: number;
  detectedDateFormats: string[];
  detectedOriginRangeLabel: string;
  detectedSegmentsCount: number;
  originsCount: number;
  interiorGapsFilledCount: number;
  negativeDevCellsCount: number;
  asymmetricSegmentsCount: number;
}

export interface CsvHeaderPreviewResult {
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRowCount: number;
  suggestedMapping: CsvColumnMappingConfig;
}

export interface ParsedPeriodInfo {
  kind: 'monthly' | 'quarterly' | 'annual';
  year: number;
  month: number; // 1..12
  quarter: number; // 1..4
  fiscalYearApr: number; // Japanese FY starting April
  serialMonths: number; // year * 12 + (month - 1)
  rawLabel: string;
  detectedFormatLabel?: string;
}

/**
 * Normalize full-width digits/letters, strip SQL/Excel timestamps, and convert Japanese Wareki (令和/平成/昭和, R/H/S) to Western year
 */
function normalizeJapaneseDateToken(raw: string): {
  normalized: string;
  hadWareki: boolean;
} {
  let s = raw
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .replace(/　/g, ' ')
    // Strip trailing timestamps like " 00:00:00", " 12:34:56.000", "T00:00:00Z"
    .replace(/(?:[T\s]+\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)$/i, '')
    .trim();

  let hadWareki = false;
  // Convert 令和 / 平成 / 昭和 or R / H / S prefixes (including bare "R5", "H30", "令和5") to 4-digit Western year
  s = s.replace(
    /^(?:(令和|平成|昭和)|([RrHhSs]))\s*(元|\d{1,2})(?:\s*(?:年度|年|期|[-/.])\s*(.*))?$/,
    (_, kanjiEra, alphaEra, yrToken, rest) => {
      hadWareki = true;
      const eraNum = yrToken === '元' ? 1 : Number(yrToken);
      const eraKey = (kanjiEra || alphaEra || 'R').toUpperCase();
      let base = 2018;
      if (eraKey === '平成' || eraKey === 'H') base = 1988;
      else if (eraKey === '昭和' || eraKey === 'S') base = 1925;
      const westYear = base + eraNum;
      const trimmedRest = (rest ?? '').trim();
      if (!trimmedRest) return `${westYear}`;
      if (/^\d/.test(trimmedRest)) return `${westYear}-${trimmedRest}`;
      return `${westYear}年${trimmedRest}`;
    }
  );

  return { normalized: s, hadWareki };
}

/**
 * Parse any origin or valuation period string:
 * Supports:
 * - Japanese Wareki: '令和5年4月', '令和5年度', '令和5', 'R5', 'R05', 'R5.4', 'R05/04', 'H30年度', 'H30'
 * - Japanese Kanji: '2023年4月', '2023年04月15日', '2023年度', '2023年3月期', '2023年第2四半期', '2023年上期', '2023年下期'
 * - 8-digit compact numeric dates: '20230415' (YYYYMMDD)
 * - Slash, ISO & Timestamp dates: '2023/4/15', '2023-04-15 00:00:00', '04/15/2023', '2019-04', '201904', '2020-Q2', 'FY2021', 'AY2021', 'UY2021', '2018'
 * - English Month names: 'Apr-2023', '15-Apr-2023', '2023-Apr'
 * - Excel serial dates: '44927' (30000..60000)
 * - Sequential cohort numbers: '1'..'50', '第1期', 'Cohort 1'
 */
export function parseFlexiblePeriodString(raw: string): ParsedPeriodInfo | null {
  if (!raw) return null;
  const { normalized: s, hadWareki } = normalizeJapaneseDateToken(raw);
  if (!s) return null;

  const fmtTag = (base: string) => (hadWareki ? `和暦 (${base})` : base);

  // 0. Corporate Fiscal Year ending month: '2023年3月期', '2023年12月期' -> Annual Fiscal Year
  const kessanMatch = s.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*期$/);
  if (kessanMatch) {
    const endYear = Number(kessanMatch[1]);
    const endMonth = Number(kessanMatch[2]);
    const fyYear = endMonth <= 3 ? endYear - 1 : endYear;
    return {
      kind: 'annual',
      year: fyYear,
      month: 12,
      quarter: 4,
      fiscalYearApr: fyYear,
      serialMonths: fyYear * 12 + 11,
      rawLabel: `${fyYear}`,
      detectedFormatLabel: fmtTag('決算期 (YYYY年M月期)'),
    };
  }

  // 1. Quarter & Half-Year patterns: '2023-Q2', '2023Q2', '2023年第2四半期', '2023年2Q', '2023年度1Q', '2023年上期', '2023年下期'
  const qKanjiMatch = s.match(
    /^(?:FY|CY|AY|UY|PY)?\s*(\d{4})\s*(?:年度|年)?[-/\s]*(?:第\s*([1-4])\s*四半期|[Qq]([1-4])|([1-4])[Qq])/i
  );
  if (qKanjiMatch) {
    const year = Number(qKanjiMatch[1]);
    const quarter = Number(qKanjiMatch[2] || qKanjiMatch[3] || qKanjiMatch[4]);
    const month = quarter * 3;
    const fiscalYearApr = month >= 4 ? year : year - 1;
    return {
      kind: 'quarterly',
      year,
      month,
      quarter,
      fiscalYearApr,
      serialMonths: year * 12 + (month - 1),
      rawLabel: `${year}-Q${quarter}`,
      detectedFormatLabel: fmtTag('四半期 (YYYY-Q)'),
    };
  }

  const halfMatch = s.match(
    /^(?:FY|CY|AY|UY|PY)?\s*(\d{4})\s*(?:年度|年)?[-/\s]*(上期|上半期|1H|H1|下期|下半期|2H|H2)$/i
  );
  if (halfMatch) {
    const year = Number(halfMatch[1]);
    const isFirstHalf = /上|1/.test(halfMatch[2]);
    const quarter = isFirstHalf ? 2 : 4;
    const month = quarter * 3;
    const fiscalYearApr = month >= 4 ? year : year - 1;
    return {
      kind: 'quarterly',
      year,
      month,
      quarter,
      fiscalYearApr,
      serialMonths: year * 12 + (month - 1),
      rawLabel: `${year}-Q${quarter}`,
      detectedFormatLabel: fmtTag('半期 (上期/下期)'),
    };
  }

  // 2. Japanese Kanji Year-Month(-Day): '2023年4月', '2023年04月15日'
  const kanjiYmMatch = s.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*\d{1,2}\s*日)?$/);
  if (kanjiYmMatch) {
    const year = Number(kanjiYmMatch[1]);
    const month = Math.min(12, Math.max(1, Number(kanjiYmMatch[2])));
    const quarter = Math.ceil(month / 3);
    const fiscalYearApr = month >= 4 ? year : year - 1;
    return {
      kind: 'monthly',
      year,
      month,
      quarter,
      fiscalYearApr,
      serialMonths: year * 12 + (month - 1),
      rawLabel: `${year}-${String(month).padStart(2, '0')}`,
      detectedFormatLabel: fmtTag('日本語年月 (YYYY年M月)'),
    };
  }

  // 3. 8-digit compact YYYYMMDD: '20230415'
  const yyyymmddMatch = s.match(/^(19\d{2}|20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/);
  if (yyyymmddMatch) {
    const year = Number(yyyymmddMatch[1]);
    const month = Number(yyyymmddMatch[2]);
    const quarter = Math.ceil(month / 3);
    const fiscalYearApr = month >= 4 ? year : year - 1;
    return {
      kind: 'monthly',
      year,
      month,
      quarter,
      fiscalYearApr,
      serialMonths: year * 12 + (month - 1),
      rawLabel: `${year}-${String(month).padStart(2, '0')}`,
      detectedFormatLabel: '8桁日付 (YYYYMMDD)',
    };
  }

  // 4. Standard YYYY-MM, YYYY/MM, YYYY.MM, YYYY/M/D
  const ymMatch = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/);
  if (ymMatch) {
    const year = Number(ymMatch[1]);
    const month = Math.min(12, Math.max(1, Number(ymMatch[2])));
    const quarter = Math.ceil(month / 3);
    const fiscalYearApr = month >= 4 ? year : year - 1;
    return {
      kind: 'monthly',
      year,
      month,
      quarter,
      fiscalYearApr,
      serialMonths: year * 12 + (month - 1),
      rawLabel: `${year}-${String(month).padStart(2, '0')}`,
      detectedFormatLabel: fmtTag('年月/日付 (YYYY-MM / YYYY/M/D)'),
    };
  }

  // 5. US/EU slash or dash date: MM/DD/YYYY or DD/MM/YYYY or M/D/YYYY
  const mdyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](19\d{2}|20\d{2})$/);
  if (mdyMatch) {
    const p1 = Number(mdyMatch[1]);
    const p2 = Number(mdyMatch[2]);
    const year = Number(mdyMatch[3]);
    const month = p1 <= 12 ? p1 : Math.min(12, p2);
    const quarter = Math.ceil(month / 3);
    const fiscalYearApr = month >= 4 ? year : year - 1;
    return {
      kind: 'monthly',
      year,
      month,
      quarter,
      fiscalYearApr,
      serialMonths: year * 12 + (month - 1),
      rawLabel: `${year}-${String(month).padStart(2, '0')}`,
      detectedFormatLabel: 'スラッシュ日付 (M/D/YYYY)',
    };
  }

  // 5b. English Month names: 'Apr-2023', '15-Apr-2023', '2023-Apr', 'Apr 2023'
  const engMonths: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const engMatch1 = s.match(/^(?:\d{1,2}[-\s/])?([A-Za-z]{3})[a-z]*[-\s/,]+(19\d{2}|20\d{2})$/);
  const engMatch2 = s.match(/^(19\d{2}|20\d{2})[-\s/]([A-Za-z]{3})[a-z]*(?:[-\s/]\d{1,2})?$/);
  if (engMatch1 || engMatch2) {
    const mKey = (engMatch1 ? engMatch1[1] : engMatch2![2]).toLowerCase();
    const yr = Number(engMatch1 ? engMatch1[2] : engMatch2![1]);
    const month = engMonths[mKey];
    if (month) {
      const quarter = Math.ceil(month / 3);
      const fiscalYearApr = month >= 4 ? yr : yr - 1;
      return {
        kind: 'monthly',
        year: yr,
        month,
        quarter,
        fiscalYearApr,
        serialMonths: yr * 12 + (month - 1),
        rawLabel: `${yr}-${String(month).padStart(2, '0')}`,
        detectedFormatLabel: '英語年月 (MMM-YYYY)',
      };
    }
  }

  // 6. 6-digit YYYYMM: '202304'
  const yyyymmMatch = s.match(/^(19\d{2}|20\d{2})(0[1-9]|1[0-2])$/);
  if (yyyymmMatch) {
    const year = Number(yyyymmMatch[1]);
    const month = Number(yyyymmMatch[2]);
    const quarter = Math.ceil(month / 3);
    const fiscalYearApr = month >= 4 ? year : year - 1;
    return {
      kind: 'monthly',
      year,
      month,
      quarter,
      fiscalYearApr,
      serialMonths: year * 12 + (month - 1),
      rawLabel: `${year}-${String(month).padStart(2, '0')}`,
      detectedFormatLabel: '6桁年月 (YYYYMM)',
    };
  }

  // 7. Excel Serial Date (30000..60000 -> approx 1982..2064)
  if (/^\d{5}$/.test(s)) {
    const serial = Number(s);
    if (serial >= 30000 && serial <= 60000) {
      const utcMs = (serial - 25569) * 86400 * 1000;
      const dt = new Date(utcMs);
      const year = dt.getUTCFullYear();
      const month = dt.getUTCMonth() + 1;
      const quarter = Math.ceil(month / 3);
      const fiscalYearApr = month >= 4 ? year : year - 1;
      return {
        kind: 'monthly',
        year,
        month,
        quarter,
        fiscalYearApr,
        serialMonths: year * 12 + (month - 1),
        rawLabel: `${year}-${String(month).padStart(2, '0')}`,
        detectedFormatLabel: 'Excelシリアル日付',
      };
    }
  }

  // 8. Annual: '2023年度', '2023年', 'FY2023', 'CY2023', 'AY2023', 'UY2023', 'PY2023', '2023'
  const yrMatch =
    s.match(/^(?:FY|CY|AY|UY|PY)?\s*(19\d{2}|20\d{2})\s*(?:FY|CY|AY|UY|PY|年度|年|期)?$/i) ||
    s.match(/(?:FY|CY|AY|UY|PY)?\s*(19\d{2}|20\d{2})/i);
  if (yrMatch) {
    const year = Number(yrMatch[1]);
    const isFy = /FY|年度/i.test(raw) || hadWareki;
    return {
      kind: 'annual',
      year,
      month: 12,
      quarter: 4,
      fiscalYearApr: year,
      serialMonths: year * 12 + 11,
      rawLabel: `${year}`,
      detectedFormatLabel: fmtTag(isFy ? '会計年度 (FY / 年度)' : '暦年 (YYYY)'),
    };
  }

  // 9. Sequential Cohort Index: '第1期', '1期', 'AY1', 'Year 1', or small cohort index '1'..'30'
  const seqMatch = s.match(/^(?:第\s*)?(\d{1,2})\s*(?:期|年度|年目)$/) || s.match(/^(?:AY|UY|PY|Year|Cohort)\s*(\d{1,2})$/i);
  if (seqMatch) {
    const idx = Number(seqMatch[1]);
    if (idx >= 1 && idx <= 50) {
      const year = 2000 + idx;
      return {
        kind: 'annual',
        year,
        month: 12,
        quarter: 4,
        fiscalYearApr: year,
        serialMonths: year * 12 + 11,
        rawLabel: `${year}`,
        detectedFormatLabel: '期別インデックス (第N期)',
      };
    }
  }

  return null;
}

/**
 * RFC-4180 quote-aware and delimiter-aware (`,`, `\t`, `;`) row splitter
 */
function splitCsvOrTsvRow(line: string, delimiter: ',' | '\t' | ';' = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function detectDelimiterFromLines(lines: string[]): ',' | '\t' | ';' {
  const sample = lines[Math.min(1, lines.length - 1)] ?? '';
  const tabs = (sample.match(/\t/g) ?? []).length;
  const semis = (sample.match(/;/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  if (tabs > commas && tabs >= semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

export function inspectCsvHeadersAndPreview(csvText: string): CsvHeaderPreviewResult {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row.');
  }

  const delimiter = detectDelimiterFromLines(lines);
  const headers = splitCsvOrTsvRow(lines[0], delimiter).map((h, i) => h || `Column_${i + 1}`);
  const sampleRows: Record<string, string>[] = [];

  for (let i = 1; i < Math.min(lines.length, 6); i++) {
    const parts = splitCsvOrTsvRow(lines[i], delimiter);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = parts[idx] ?? '';
    });
    sampleRows.push(rowObj);
  }

  const findHeader = (patterns: RegExp[]): string | undefined =>
    headers.find((h) => patterns.some((p) => p.test(h.toLowerCase())));

  const originCol =
    findHeader([/origin|accident|incurral|underwriting|policy_year|\bay\b|\buy\b|\bpy\b|事故|発生年月|発生年度|契約年度|対象年度|年度/]) ??
    headers[0];

  const lagCol = findHeader([/dev|lag|elapsed|進展|経過|月数|年数/]);
  const valPeriodCol = findHeader([
    /valuation|calendar|accounting|eval|paid_period|評価年月|支払年月|会計年月|決済年月|集計年月/,
  ]);

  const devMode: 'lag' | 'valuation_period' =
    !lagCol && valPeriodCol ? 'valuation_period' : 'lag';
  const devOrValCol =
    (devMode === 'valuation_period' ? valPeriodCol : lagCol) ??
    headers[Math.min(1, headers.length - 1)];

  const incLossCol = findHeader([/incremental|期間損害|当期支払|単月支払/]);
  const cumLossCol = findHeader([
    /cum|paid|loss|claim|amount|累積|支払損害|損害|支払|ロス|金額/,
  ]);
  const incurredCol = findHeader([/incurred|発生損害|発生ロス|既発生/]);
  const caseReserveCol = findHeader([/case|os_reserve|outstanding|個別備金|支払備金残高|未払備金/]);
  const claimCountCol = findHeader([/count|claims|件数|クレーム件数|事故件数/]);

  const lossType: 'cumulative' | 'incremental' =
    incLossCol && !/cum|累積/.test(incLossCol.toLowerCase())
      ? 'incremental'
      : 'cumulative';
  const lossCol =
    (lossType === 'incremental' ? incLossCol : cumLossCol) ??
    headers[Math.min(2, headers.length - 1)];

  const premiumCol = findHeader([/prem|earned|\bep\b|\bgwp\b|\bnwp\b|保険料|既経過|収入保険料/]) ?? '';
  const exposureCol = findHeader([/exposure|policy_count|契約件数|経過契約|台数|エクスポージャー/]) ?? '';
  const elrCol = findHeader([/elr|loss_ratio|apriori|損害率|予定損害率/]) ?? '';

  const reservedCols = new Set(
    [
      originCol,
      devOrValCol,
      lossCol,
      incurredCol,
      caseReserveCol,
      claimCountCol,
      premiumCol,
      exposureCol,
      elrCol,
      valPeriodCol,
    ].filter(Boolean)
  );

  const segmentCols = headers.filter((h) => !reservedCols.has(h));

  return {
    headers,
    sampleRows,
    totalRowCount: lines.length - 1,
    suggestedMapping: {
      originCol,
      devMode,
      devOrValCol,
      lossCol,
      lossType,
      incurredCol: incurredCol || undefined,
      caseReserveCol: caseReserveCol || undefined,
      claimCountCol: claimCountCol || undefined,
      premiumCol: premiumCol || undefined,
      exposureCol: exposureCol || undefined,
      elrCol: elrCol || undefined,
      segmentCols,
      valuationLabel: 'Custom-CSV',
    },
  };
}

export function ingestMappedCsvWithAutoRollup(
  csvText: string,
  mapping: CsvColumnMappingConfig
): {
  records: MultiSegmentFactRecord[];
  detectedSegmentsCount: number;
  originsCount: number;
  detectedOriginRangeLabel: string;
  availableGranularities: TimeGranularity[];
  diagnostics: DataHealthDiagnostics;
} {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length < 2) {
    throw new Error('CSV must include a header row and data rows.');
  }

  const delimiter = detectDelimiterFromLines(lines);
  const headers = splitCsvOrTsvRow(lines[0], delimiter).map((h, i) => h || `Column_${i + 1}`);
  const idxOf = (colName?: string) =>
    colName ? headers.findIndex((h) => h === colName) : -1;

  const iOrigin = idxOf(mapping.originCol);
  const iDevOrVal = idxOf(mapping.devOrValCol);
  const iLoss = idxOf(mapping.lossCol);
  const iIncurred = idxOf(mapping.incurredCol);
  const iCase = idxOf(mapping.caseReserveCol);
  const iCount = idxOf(mapping.claimCountCol);
  const iPrem = idxOf(mapping.premiumCol);
  const iExp = idxOf(mapping.exposureCol);
  const iElr = idxOf(mapping.elrCol);
  const segIndices = mapping.segmentCols
    .map((col) => ({ col, idx: idxOf(col) }))
    .filter((x) => x.idx !== -1);

  if (iOrigin === -1 || iDevOrVal === -1 || iLoss === -1) {
    throw new Error(
      'Origin Period, Development Lag/Valuation Period, and Loss Amount columns must be mapped.'
    );
  }

  const mult =
    mapping.unitMultiplier && mapping.unitMultiplier > 0
      ? mapping.unitMultiplier
      : 1;
  const fillGaps = mapping.fillInteriorGaps !== false;

  const parseNumField = (raw?: string): number => {
    if (!raw) return NaN;
    let s = raw.trim().replace(/^["']+|["']+$/g, '');
    if (!s || s === '-' || s === '—' || s === '―' || /^n\/?a$/i.test(s)) return NaN;
    let neg = false;
    if ((s.startsWith('(') && s.endsWith(')')) || s.startsWith('△') || s.startsWith('▲')) {
      neg = true;
      s = s.replace(/^[(\s△▲]+|[)\s]+$/g, '');
    }
    const isPct = s.endsWith('%') || s.endsWith('％');
    const clean = s.replace(/[¥￥$€£,\s%％]/g, '');
    if (!clean) return NaN;
    const n = Number(clean);
    if (Number.isNaN(n)) return NaN;
    const signed = neg ? -Math.abs(n) : n;
    return isPct && Math.abs(signed) > 1.5 ? signed / 100 : signed;
  };

  interface NormalizedFactPoint {
    dims: Record<string, string>;
    segKey: string;
    product: string;
    channel: string;
    coverage: string;
    region: string;
    originInfo: ParsedPeriodInfo;
    devLagRaw: number;
    lossVal: number | null;
    incurredVal: number | null;
    countVal: number | null;
    premium: number | null;
    exposure: number | null;
    elr: number;
  }

  const rawPoints: NormalizedFactPoint[] = [];
  let skippedRowsCount = 0;
  const dateFormatsSet = new Set<string>();

  for (let r = 1; r < lines.length; r++) {
    const parts = splitCsvOrTsvRow(lines[r], delimiter);
    const originRaw = parts[iOrigin] ?? '';
    const originInfo = parseFlexiblePeriodString(originRaw);
    if (!originInfo) {
      skippedRowsCount++;
      continue;
    }
    if (originInfo.detectedFormatLabel) {
      dateFormatsSet.add(originInfo.detectedFormatLabel);
    }

    const rawLossNum = parseNumField(parts[iLoss]);
    const rawInc = iIncurred !== -1 ? parseNumField(parts[iIncurred]) : NaN;
    const rawCase = iCase !== -1 ? parseNumField(parts[iCase]) : NaN;
    const rawCnt = iCount !== -1 ? parseNumField(parts[iCount]) : NaN;

    if (
      Number.isNaN(rawLossNum) &&
      Number.isNaN(rawInc) &&
      Number.isNaN(rawCnt)
    ) {
      skippedRowsCount++;
      continue;
    }

    const lossVal: number | null = !Number.isNaN(rawLossNum)
      ? rawLossNum * mult
      : null;

    let devLagRaw = 1;
    if (mapping.devMode === 'valuation_period') {
      const valInfo = parseFlexiblePeriodString(parts[iDevOrVal] ?? '');
      if (!valInfo) {
        skippedRowsCount++;
        continue;
      }
      if (originInfo.kind === 'monthly') {
        devLagRaw = Math.max(1, valInfo.serialMonths - originInfo.serialMonths + 1);
      } else if (originInfo.kind === 'quarterly') {
        devLagRaw = Math.max(
          3,
          Math.round((valInfo.serialMonths - originInfo.serialMonths + 3) / 3) * 3
        );
      } else {
        devLagRaw = Math.max(12, (valInfo.year - originInfo.year + 1) * 12);
      }
    } else {
      const devTokenRaw = (parts[iDevOrVal] ?? '').trim();
      const parsedLag = Number(devTokenRaw.replace(/[^0-9.]/g, ''));
      if (devTokenRaw === '' || Number.isNaN(parsedLag) || parsedLag < 0) {
        skippedRowsCount++;
        continue;
      }
      devLagRaw = parsedLag;
    }

    const dims: Record<string, string> = {};
    segIndices.forEach(({ col, idx }) => {
      dims[col] = parts[idx] || 'All';
    });
    if (Object.keys(dims).length === 0) {
      dims['Segment'] = 'Total Portfolio';
    }

    const dimValues = Object.values(dims);
    const product = dimValues[0] ?? 'Total Portfolio';
    const channel = dimValues[1] ?? 'All Channels';
    const coverage = dimValues[2] ?? 'All Coverages';
    const region = dimValues[3] ?? 'All Regions';
    const segKey = Object.entries(dims)
      .map(([k, v]) => `${k}=${v}`)
      .join('|');

    const incurredVal = !Number.isNaN(rawInc)
      ? rawInc * mult
      : !Number.isNaN(rawCase)
      ? (lossVal ?? 0) + rawCase * mult
      : null;

    const countVal = !Number.isNaN(rawCnt) ? rawCnt : null;

    const parsedPrem = iPrem !== -1 ? parseNumField(parts[iPrem]) : NaN;
    const premium: number | null =
      !Number.isNaN(parsedPrem) && parsedPrem > 0 ? parsedPrem * mult : null;

    const parsedExp = iExp !== -1 ? parseNumField(parts[iExp]) : NaN;
    const exposure: number | null =
      !Number.isNaN(parsedExp) && parsedExp > 0 ? parsedExp : null;

    const parsedElr = iElr !== -1 ? parseNumField(parts[iElr]) : NaN;
    const elr =
      !Number.isNaN(parsedElr) && parsedElr > 0 ? parsedElr : 0.72;

    rawPoints.push({
      dims,
      segKey,
      product,
      channel,
      coverage,
      region,
      originInfo,
      devLagRaw,
      lossVal,
      incurredVal,
      countVal,
      premium,
      exposure,
      elr,
    });
  }

  if (rawPoints.length === 0) {
    throw new Error('No valid numeric triangle cells were found with the selected column mapping.');
  }

  // Normalize development lags if lag 0 is present (e.g. 0, 1, 2... -> 1, 2, 3...) so annual roll-up works cleanly
  const minRawLag = Math.min(...rawPoints.map((p) => p.devLagRaw));
  if (minRawLag === 0) {
    const uniqueLags = Array.from(new Set(rawPoints.map((p) => p.devLagRaw))).sort((a, b) => a - b);
    const step = uniqueLags.length >= 2 ? uniqueLags[1] - uniqueLags[0] : 12;
    const shift = step >= 12 ? 12 : step === 3 ? 3 : 1;
    for (const pt of rawPoints) {
      pt.devLagRaw = pt.devLagRaw + shift;
    }
  }

  let primaryInteriorGapsFilled = 0;
  let primaryNegativeDevCells = 0;
  let primaryAsymmetricSegs = 0;

  const buildRecordsForGranularity = (
    gran: TimeGranularity,
    recordStats: boolean
  ): MultiSegmentFactRecord[] => {
    interface BucketedCell {
      segKey: string;
      dims: Record<string, string>;
      product: string;
      channel: string;
      coverage: string;
      region: string;
      originCode: number;
      originLabel: string;
      subOriginKey: string;
      devBucket: number;
      lossVal: number | null;
      incurredVal: number | null;
      countVal: number | null;
      premium: number | null;
      exposure: number | null;
      elr: number;
    }

    const bucketed: BucketedCell[] = [];
    for (const pt of rawPoints) {
      const oi = pt.originInfo;
      let originCode: number;
      let originLabel: string;
      let devBucket: number;

      if (gran === 'monthly') {
        originCode = oi.year * 100 + oi.month;
        originLabel = oi.rawLabel;
        devBucket = pt.devLagRaw;
      } else if (gran === 'quarterly') {
        originCode = oi.year * 10 + oi.quarter;
        originLabel = `${oi.year}-Q${oi.quarter}`;
        devBucket =
          oi.kind === 'monthly'
            ? Math.ceil(pt.devLagRaw / 3) * 3
            : pt.devLagRaw;
      } else if (gran === 'annual_fy') {
        originCode = oi.fiscalYearApr;
        originLabel = `FY${oi.fiscalYearApr}`;
        devBucket =
          oi.kind === 'monthly'
            ? Math.ceil(pt.devLagRaw / 12) * 12
            : oi.kind === 'quarterly'
            ? Math.ceil(pt.devLagRaw / 12) * 12
            : pt.devLagRaw <= 15 && pt.devLagRaw % 12 !== 0
            ? pt.devLagRaw * 12
            : pt.devLagRaw;
      } else {
        originCode = oi.year;
        originLabel = `${oi.year}`;
        devBucket =
          oi.kind === 'monthly'
            ? Math.ceil(pt.devLagRaw / 12) * 12
            : oi.kind === 'quarterly'
            ? Math.ceil(pt.devLagRaw / 12) * 12
            : pt.devLagRaw <= 15 && pt.devLagRaw % 12 !== 0
            ? pt.devLagRaw * 12
            : pt.devLagRaw;
      }

      bucketed.push({
        segKey: pt.segKey,
        dims: pt.dims,
        product: pt.product,
        channel: pt.channel,
        coverage: pt.coverage,
        region: pt.region,
        originCode,
        originLabel,
        subOriginKey: oi.rawLabel,
        devBucket,
        lossVal: pt.lossVal,
        incurredVal: pt.incurredVal,
        countVal: pt.countVal,
        premium: pt.premium,
        exposure: pt.exposure,
        elr: pt.elr,
      });
    }

    const allOrigins = Array.from(
      new Set(bucketed.map((b) => b.originCode))
    ).sort((a, b) => a - b);
    const allDevs = Array.from(new Set(bucketed.map((b) => b.devBucket))).sort(
      (a, b) => a - b
    );
    const maxOriginCode = allOrigins[allOrigins.length - 1] ?? 999999;

    const groupMap = new Map<string, BucketedCell[]>();
    const segOriginsCountMap = new Map<string, Set<number>>();
    for (const b of bucketed) {
      const k = `${b.segKey}__${b.originCode}`;
      const arr = groupMap.get(k) ?? [];
      arr.push(b);
      groupMap.set(k, arr);

      const oSet = segOriginsCountMap.get(b.segKey) ?? new Set<number>();
      oSet.add(b.originCode);
      segOriginsCountMap.set(b.segKey, oSet);
    }

    if (recordStats) {
      for (const oSet of segOriginsCountMap.values()) {
        if (oSet.size < allOrigins.length) {
          primaryAsymmetricSegs++;
        }
      }
    }

    const valLabel = mapping.valuationLabel || 'Latest-Close';
    const out: MultiSegmentFactRecord[] = [];

    for (const cells of groupMap.values()) {
      const sample = cells[0];
      const subOrigins = Array.from(new Set(cells.map((c) => c.subOriginKey)));
      let totalPrem = 0;
      let totalExp = 0;
      let weightedElr = 0;
      let hasExplicitPrem = false;
      let hasExplicitExp = false;

      for (const so of subOrigins) {
        const subCell = cells.find((c) => c.subOriginKey === so)!;
        if (subCell.premium !== null && subCell.premium > 0) {
          totalPrem += subCell.premium;
          weightedElr += subCell.premium * subCell.elr;
          hasExplicitPrem = true;
        }
        if (subCell.exposure !== null && subCell.exposure > 0) {
          totalExp += subCell.exposure;
          hasExplicitExp = true;
        }
      }
      const avgElr = hasExplicitPrem && totalPrem > 0 ? weightedElr / totalPrem : sample.elr;

      const maxDevObserved = Math.max(...cells.map((c) => c.devBucket));
      const buildSeries = (
        getter: (c: BucketedCell) => number | null,
        countStats: boolean
      ): (number | null)[] | null => {
        const hasAny = cells.some((c) => getter(c) !== null);
        if (!hasAny) return null;

        const rawVals: (number | null)[] = allDevs.map((d) => {
          if (d > maxDevObserved) return null;
          const matchingDev = cells.filter(
            (c) => c.devBucket === d && getter(c) !== null
          );
          if (matchingDev.length === 0) return null;
          if (mapping.lossType === 'incremental') {
            return matchingDev.reduce((acc, item) => acc + (getter(item) ?? 0), 0);
          }
          let sumCum = 0;
          let foundSub = false;
          for (const so of subOrigins) {
            const soCells = matchingDev.filter((c) => c.subOriginKey === so);
            if (soCells.length > 0) {
              sumCum += soCells[soCells.length - 1]
                ? getter(soCells[soCells.length - 1]) ?? 0
                : 0;
              foundSub = true;
            }
          }
          return foundSub ? sumCum : null;
        });

        const cumRow: (number | null)[] = [];
        let run: number | null = null;
        for (let j = 0; j < allDevs.length; j++) {
          const d = allDevs[j];
          const v = rawVals[j];
          if (d > maxDevObserved) {
            cumRow.push(null);
          } else if (v === null) {
            if (fillGaps && run !== null) {
              cumRow.push(run);
              if (countStats) primaryInteriorGapsFilled++;
            } else {
              cumRow.push(null);
            }
          } else if (mapping.lossType === 'incremental') {
            const prevRun: number = run ?? 0;
            const nextRun: number = prevRun + v;
            if (countStats && run !== null && nextRun < run) {
              primaryNegativeDevCells++;
            }
            run = nextRun;
            cumRow.push(run);
          } else {
            if (countStats && run !== null && v < run) {
              primaryNegativeDevCells++;
            }
            run = v;
            cumRow.push(run);
          }
        }
        return cumRow;
      };

      const cumulativeRow =
        buildSeries((c) => c.lossVal, recordStats) ?? allDevs.map(() => null);
      const explicitIncurred = buildSeries((c) => c.incurredVal, recordStats);
      const explicitCount = buildSeries((c) => c.countVal, false);
      const synth = buildMultiMetricRowsFromPaid(cumulativeRow);

      const incurredRow = explicitIncurred ?? synth.incurredRow;
      const claimCountRow = explicitCount ?? synth.claimCountRow;

      const nonNulls = cumulativeRow.filter((v): v is number => v !== null);
      const latestObsLoss =
        nonNulls.length > 0 ? Math.abs(nonNulls[nonNulls.length - 1]) : 0;

      // Auto-scale fallback Earned Premium & Exposure proportionally to cohort's observed loss when not explicitly provided!
      if (!hasExplicitPrem || totalPrem <= 0) {
        const maturityFraction = Math.max(0.35, nonNulls.length / Math.max(1, allDevs.length));
        const impliedUltimate = latestObsLoss / maturityFraction;
        totalPrem = Math.max(100, Math.round(impliedUltimate / Math.max(0.4, avgElr)));
      }
      if (!hasExplicitExp || totalExp <= 0) {
        totalExp = Math.max(10, Math.round(totalPrem / Math.max(1, 80 * mult)));
      }

      const priorDiagVal =
        nonNulls.length >= 2
          ? nonNulls[nonNulls.length - 2]
          : nonNulls[0] ?? null;

      const incNonNulls = incurredRow.filter((v): v is number => v !== null);
      const priorIncVal =
        incNonNulls.length >= 2
          ? incNonNulls[incNonNulls.length - 2]
          : incNonNulls[0] ?? null;

      const cntNonNulls = claimCountRow.filter((v): v is number => v !== null);
      const priorCntVal =
        cntNonNulls.length >= 2
          ? cntNonNulls[cntNonNulls.length - 2]
          : cntNonNulls[0] ?? null;

      out.push({
        valuationMonth: valLabel,
        product: sample.product,
        channel: sample.channel,
        coverage: sample.coverage,
        region: sample.region,
        dimensions: sample.dims,
        granularity: gran,
        originCode: sample.originCode,
        originLabel: sample.originLabel,
        isPriorYearOrigin: sample.originCode < maxOriginCode,
        devLagPeriods: allDevs,
        cumulativeRow,
        incurredCumulativeRow: incurredRow,
        claimCountCumulativeRow: claimCountRow,
        priorYearEnd2025Cumulative: priorDiagVal,
        priorYearEnd2025Incurred: priorIncVal,
        priorYearEnd2025ClaimCount: priorCntVal,
        earnedPremium: totalPrem,
        earnedExposure: totalExp,
        aprioriElr: Number(avgElr.toFixed(4)),
      });
    }

    return out;
  };

  const kinds = new Set(rawPoints.map((p) => p.originInfo.kind));
  const availableGranularities: TimeGranularity[] = [];
  const allGeneratedRecords: MultiSegmentFactRecord[] = [];

  if (kinds.has('monthly')) {
    const grans = ['annual', 'annual_fy', 'quarterly', 'monthly'] as const;
    grans.forEach((g, idx) => {
      const recs = buildRecordsForGranularity(g, idx === 0);
      if (recs.length > 0) {
        availableGranularities.push(g);
        allGeneratedRecords.push(...recs);
      }
    });
  } else if (kinds.has('quarterly')) {
    const grans = ['quarterly', 'annual', 'annual_fy'] as const;
    grans.forEach((g, idx) => {
      const recs = buildRecordsForGranularity(g, idx === 0);
      if (recs.length > 0) {
        availableGranularities.push(g);
        allGeneratedRecords.push(...recs);
      }
    });
  } else {
    const grans = ['annual', 'annual_fy'] as const;
    grans.forEach((g, idx) => {
      const recs = buildRecordsForGranularity(g, idx === 0);
      if (recs.length > 0) {
        availableGranularities.push(g);
        allGeneratedRecords.push(...recs);
      }
    });
  }

  const uniqueSegs = new Set(rawPoints.map((p) => p.segKey));
  const sortedLabels = Array.from(
    new Set(rawPoints.map((p) => p.originInfo.rawLabel))
  ).sort();
  const detectedOriginRangeLabel =
    sortedLabels.length > 0
      ? `${sortedLabels[0]} – ${sortedLabels[sortedLabels.length - 1]}`
      : 'Custom Range';

  const diagnostics: DataHealthDiagnostics = {
    totalDataRows: lines.length - 1,
    validCellsCount: rawPoints.length,
    skippedRowsCount,
    detectedDateFormats:
      dateFormatsSet.size > 0 ? Array.from(dateFormatsSet) : ['Standard'],
    detectedOriginRangeLabel,
    detectedSegmentsCount: uniqueSegs.size,
    originsCount: sortedLabels.length,
    interiorGapsFilledCount: primaryInteriorGapsFilled,
    negativeDevCellsCount: primaryNegativeDevCells,
    asymmetricSegmentsCount: primaryAsymmetricSegs,
  };

  return {
    records: allGeneratedRecords,
    detectedSegmentsCount: uniqueSegs.size,
    originsCount: sortedLabels.length,
    detectedOriginRangeLabel,
    availableGranularities,
    diagnostics,
  };
}

export function parseMultiSegmentLongCsv(
  csvText: string,
  targetValuationMonth: ValuationMonthId = '2026-10',
  targetGranularity: TimeGranularity = 'annual'
): {
  records: MultiSegmentFactRecord[];
  detectedSegmentsCount: number;
  originsCount: number;
} {
  const preview = inspectCsvHeadersAndPreview(csvText);
  const res = ingestMappedCsvWithAutoRollup(csvText, {
    ...preview.suggestedMapping,
    valuationLabel: targetValuationMonth,
  });

  const matchingGran = res.records.filter(
    (r) => r.granularity === targetGranularity
  );
  const finalRecords =
    matchingGran.length > 0
      ? res.records
      : res.records.map((r) => ({ ...r, granularity: targetGranularity }));

  return {
    records: finalRecords,
    detectedSegmentsCount: res.detectedSegmentsCount,
    originsCount: res.originsCount,
  };
}

export function generateCustomJapaneseFiscalSampleCsv(): string {
  const rows: string[] = [
    '保険種目,販売チャネル,地域ブロック,フリート区分,事故年月,進展月数,累積支払損害額,発生損害額,クレーム件数,既経過保険料,経過契約件数,予定損害率',
  ];

  const customSegments = [
    {
      line: '自動車保険(対人・対物)',
      channel: '専業代理店',
      block: '首都圏',
      fleet: 'フリート契約',
      prem: 950000,
      exp: 12000,
      sev: 3800,
      elr: 0.74,
      shockLastDiag: 1.15,
    },
    {
      line: '自動車保険(対人・対物)',
      channel: 'ダイレクト通販',
      block: '近畿圏',
      fleet: 'ノンフリート契約',
      prem: 720000,
      exp: 9800,
      sev: 3400,
      elr: 0.71,
      shockLastDiag: 0.92,
    },
    {
      line: '火災・新種賠償保険',
      channel: '企業ブローカー',
      block: '首都圏',
      fleet: '法人包括契約',
      prem: 1150000,
      exp: 4200,
      sev: 9200,
      elr: 0.81,
      shockLastDiag: 1.22,
    },
    {
      line: '傷害・労災上乗せ保険',
      channel: '専業代理店',
      block: '中京圏',
      fleet: '法人包括契約',
      prem: 640000,
      exp: 7500,
      sev: 2900,
      elr: 0.68,
      shockLastDiag: 0.89,
    },
  ];

  const originMonths = [
    { ym: '2018-06', yrIdx: 0 },
    { ym: '2018-12', yrIdx: 0 },
    { ym: '2019-06', yrIdx: 1 },
    { ym: '2019-12', yrIdx: 1 },
    { ym: '2020-06', yrIdx: 2 },
    { ym: '2020-12', yrIdx: 2 },
    { ym: '2021-06', yrIdx: 3 },
    { ym: '2021-12', yrIdx: 3 },
    { ym: '2022-06', yrIdx: 4 },
    { ym: '2022-12', yrIdx: 4 },
    { ym: '2023-06', yrIdx: 5 },
    { ym: '2023-12', yrIdx: 5 },
  ];

  const devWeights = [0.34, 0.25, 0.16, 0.11, 0.08, 0.06];
  const devMonths = [12, 24, 36, 48, 60, 72];

  for (const seg of customSegments) {
    for (const om of originMonths) {
      const maxDevIdx = 5 - om.yrIdx;
      let cum = 0;
      for (let j = 0; j <= maxDevIdx; j++) {
        const isLatestDiagForPrior = om.yrIdx < 5 && j === maxDevIdx;
        const shock = isLatestDiagForPrior ? seg.shockLastDiag : 1.0;
        const inc = Math.round(
          seg.prem * seg.elr * devWeights[j] * (1 + om.yrIdx * 0.02) * shock
        );
        cum += inc;
        const caseFactor = 1 + 0.28 * Math.exp(-j * 0.45);
        const incurredVal = Math.round(cum * caseFactor);
        const claimCnt = Math.max(1, Math.round(cum / seg.sev));
        rows.push(
          `${seg.line},${seg.channel},${seg.block},${seg.fleet},${om.ym},${devMonths[j]},${cum},${incurredVal},${claimCnt},${seg.prem},${seg.exp},${seg.elr}`
        );
      }
    }
  }

  return rows.join('\n');
}

export function getDefaultMultiSegmentFactStore(): MultiSegmentFactRecord[] {
  return buildDefaultMultiSegmentFactStore();
}

export function evaluatePortfolioPriorYearDevelopment(
  records: MultiSegmentFactRecord[],
  valuationMonth: string,
  granularity: TimeGranularity,
  filters: Partial<SegmentFilterState> = {},
  selectedLdfMode: LdfSelectionMode = 'vw_all',
  tailFactor = 1.01,
  _baselineValuationLabel?: string,
  pydConfig?: PydConfiguration,
  displayUnitDivisor = 1
): PriorYearDevelopmentAnalysis {
  const fullFilters: SegmentFilterState = {
    product: filters.product ?? 'ALL',
    channel: filters.channel ?? 'ALL',
    coverage: filters.coverage ?? 'ALL',
    region: filters.region ?? 'ALL',
    ...filters,
  };
  const slice = pivotSegmentTriangle(
    records,
    valuationMonth,
    granularity,
    fullFilters
  );
  const n = slice.originCodes.length;
  const m = slice.devPeriods.length;
  const evalRes = evaluateActuarialModel({
    originYears: slice.originCodes,
    devPeriods: slice.devPeriods,
    cumulativeTriangle: slice.cumulativeTriangle,
    earnedPremium: slice.earnedPremium,
    aprioriElr: slice.aprioriElr,
    exclusions: Array.from({ length: n }, () =>
      new Array(Math.max(0, m - 1)).fill(false)
    ),
    selectedLdfMode,
    manualLdfs: new Array(Math.max(0, m - 1)).fill(null),
    tailFactor,
    selectedMethods: new Array(n).fill('CL'),
    methodWeights: Array.from({ length: n }, () => ({ cl: 1, bf: 0, cc: 0 })),
  });
  return computePriorYearDevelopmentAndRollup(
    records,
    slice,
    evalRes,
    pydConfig,
    displayUnitDivisor
  );
}

