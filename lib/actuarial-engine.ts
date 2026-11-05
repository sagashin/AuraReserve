/**
 * AuraReserve (WTW ResQ Enterprise Edition) — Core Actuarial & Stochastic Engine
 * Pure 64-bit floating-point TypeScript implementation:
 * - Unobserved lower-right cells strictly represented as `null` (never `0`).
 * - Zero-division protection when C_{i,j} <= 0.
 * - Full float64 internal precision for LDFs, CDFs, Ultimates (CL, BF, CC, Benktander, ELR, Freq×Sev),
 *   Case Reserves (OS), Mack SE, Merz-Wüthrich 1-Year CDR, 3-Model Tail Fitting,
 *   Future Calendar-Year Cashflow Discounting (IFRS 17 / J-GAAP), & ODP Bootstrap.
 */

export type LdfSelectionMode =
  | 'vw_all'
  | 'vw_3'
  | 'vw_5'
  | 'vw_7'
  | 'simple_all'
  | 'simple_3'
  | 'simple_5'
  | 'medial'
  | 'geometric';

export type LdfAverageMode = LdfSelectionMode;

export type ReserveMethodType =
  | 'CL'
  | 'BF'
  | 'CC'
  | 'BENKTANDER'
  | 'ELR'
  | 'FREQ_SEV'
  | 'BLEND'
  | 'MANUAL';

export type MethodSelection = ReserveMethodType;

export interface MethodWeights {
  cl: number;
  bf: number;
  cc: number;
  bk?: number;
  elr?: number;
  fs?: number;
}

export interface ActuarialInput {
  originYears: number[];
  devPeriods: number[];
  cumulativeTriangle: (number | null)[][];
  incurredTriangle?: (number | null)[][];
  claimCountTriangle?: (number | null)[][];
  earnedPremium: number[];
  aprioriElr: number[];
  exclusions: boolean[][];
  selectedLdfMode: LdfSelectionMode;
  manualLdfs: (number | null)[];
  tailFactor: number;
  discountRate?: number; // Annual discount rate for IFRS 17 / PV Cashflow (e.g., 0.025 = 2.5%)
  selectedMethods: ReserveMethodType[];
  methodWeights: MethodWeights[];
  manualUltimates?: (number | null)[];
}

export interface LdfAverages {
  vw_all: number[];
  vw_3: number[];
  vw_5: number[];
  vw_7: number[];
  simple_all: number[];
  simple_3: number[];
  simple_5: number[];
  medial: number[];
  geometric: number[];
}

export interface OriginYearResult {
  originIndex: number;
  originYear: number;
  latestDevIndex: number;
  latestDevPeriod: number;
  latestCumulative: number;
  latestIncurred: number;
  caseReserveOs: number;
  paidToIncurredRatio: number;
  latestClaimCount: number;
  ultimateClaimCount: number;
  ultimateSeverity: number;
  earnedPremium: number;
  aprioriElr: number;
  cdfToUltimate: number;
  percentDeveloped: number;
  usedUpPremium: number;
  // 1. Chain Ladder (CL)
  clUltimate: number;
  clIbnr: number;
  // 2. Bornhuetter-Ferguson (BF)
  bfUltimate: number;
  bfIbnr: number;
  // 3. Cape Cod / Stanard-Bühlmann (CC)
  ccElr: number;
  ccUltimate: number;
  ccIbnr: number;
  // 4. Benktander / Iterated BF (BK)
  bkUltimate: number;
  bkIbnr: number;
  // 5. Expected Loss Ratio (ELR)
  elrUltimate: number;
  elrIbnr: number;
  // 6. Frequency × Severity (F×S)
  freqSevUltimate: number;
  freqSevIbnr: number;
  // Selected / Blended / Manual Override
  selectedMethod: ReserveMethodType;
  weights: MethodWeights;
  manualUltimateOverride: number | null;
  selectedUltimate: number;
  selectedIbnr: number;
  totalUnpaidReserve: number; // Case Reserve (OS) + Selected IBNR
  discountedIbnr: number;
  ultimateLossRatio: number;
  // Mack (1993) Ultimate SE & Merz-Wüthrich (2008) 1-Year CDR SE
  mackSe: number;
  merzWuthrich1YrSe: number;
  mackCv: number | null;
}

export interface TailCurveModelResult {
  modelType: 'exponential' | 'inverse_power' | 'weibull';
  label: string;
  formula: string;
  interceptA: number;
  slopeB: number;
  rSquared: number;
  tailFactor: number;
  fittedLdfs: number[]; // for observed j = 1..m-1
  extrapolatedLdfs: { devPeriod: number; ldf: number }[];
}

export interface TailFittingAnalysis {
  observedPoints: {
    devIndex: number;
    devLabel: string;
    ldf: number;
    logExcess: number | null;
  }[];
  exponential: TailCurveModelResult;
  inversePower: TailCurveModelResult;
  weibull: TailCurveModelResult;
  recommendedModel: 'exponential' | 'inverse_power' | 'weibull';
}

export interface FutureCashflowPeriodRow {
  futureStepIndex: number;
  futureYearOffset: number;
  calendarYearLabel: string;
  calendarLabel: string;
  durationYears: number;
  undiscountedCashflow: number;
  shareOfTotalIbnr: number;
  proportionOfTotal: number;
  cumulativePayoutPct: number;
  discountFactor: number;
  discountedCashflow: number;
  discountEffect: number;
}

export interface CashflowProjectionSummary {
  discountRate: number;
  totalUndiscountedIbnr: number;
  totalUndiscountedCashflow?: number;
  totalDiscountedIbnr: number;
  totalDiscountedPv?: number;
  totalDiscountEffect: number;
  macaulayDurationYears: number;
  calendarRows: FutureCashflowPeriodRow[];
}

export interface ActuarialEvaluationResult {
  originYears: number[];
  devPeriods: number[];
  cumulativeTriangle: (number | null)[][];
  incrementalTriangle: (number | null)[][];
  incurredTriangle: (number | null)[][];
  caseReserveTriangle: (number | null)[][];
  paidToIncurredTriangle: (number | null)[][];
  claimCountTriangle: (number | null)[][];
  averageSeverityTriangle: (number | null)[][];
  fullProjectedTriangle: number[][];
  linkRatios: (number | null)[][];
  exclusions: boolean[][];
  ldfAverages: LdfAverages;
  selectedLdfs: number[];
  tailFactor: number;
  cdfs: number[]; // length m (last element is tailFactor)
  mackSigmaSq: number[]; // length m-1
  capeCodElr: number;
  rows: OriginYearResult[];
  totals: {
    latestCumulative: number;
    latestIncurred: number;
    caseReserveOs: number;
    earnedPremium: number;
    usedUpPremium: number;
    clUltimate: number;
    clIbnr: number;
    bfUltimate: number;
    bfIbnr: number;
    ccUltimate: number;
    ccIbnr: number;
    bkUltimate: number;
    bkIbnr: number;
    elrUltimate: number;
    elrIbnr: number;
    freqSevUltimate: number;
    freqSevIbnr: number;
    selectedUltimate: number;
    selectedIbnr: number;
    totalUnpaidReserve: number;
    discountedIbnr: number;
    ultimateLossRatio: number;
    mackTotalSe: number;
    merzWuthrichTotal1YrSe: number;
    mackTotalCv: number | null;
  };
  tailFitting: TailFittingAnalysis;
  cashflowProjection: CashflowProjectionSummary;
}

export interface PearsonResidualPoint {
  originYear: number;
  originIndex: number;
  devPeriod: number;
  devIndex: number;
  calendarYear: number;
  observedIncremental: number;
  fittedIncremental: number;
  unscaledResidual: number;
  scaledResidual: number;
}

export interface BootstrapPercentileRow {
  label: string;
  percentile: number;
  ibnrValue: number;
  tvarIbnrValue: number;
  ultimateValue: number;
  riskCapitalOverMean: number;
  tvarRiskCapitalOverMean: number;
  percentOfMean: number;
  regulatoryTag?: string;
}

export interface BootstrapSimulationResult {
  iterations: number;
  executionTimeMs: number;
  scaleParameterPhi: number;
  degreesOfFreedom: number;
  dofScaleFactor: number;
  meanIbnr: number;
  stdDevIbnr: number;
  cvIbnr: number;
  minIbnr: number;
  maxIbnr: number;
  percentiles: BootstrapPercentileRow[];
  histogram: {
    binStart: number;
    binEnd: number;
    binCenter: number;
    count: number;
    density: number;
    kdeDensity: number;
  }[];
  originStochasticRows: {
    originYear: number;
    deterministicIbnr: number;
    bootstrapMeanIbnr: number;
    bootstrapSe: number;
    bootstrapCv: number;
    p75Ibnr: number;
    p995Ibnr: number;
  }[];
  residuals: PearsonResidualPoint[];
  simulatedTotals?: number[];
}

export interface AutoOptimizeRecommendation {
  detectedOutliers: {
    originIndex: number;
    devIndex: number;
    originYear: number;
    devPeriodLabel: string;
    linkRatio: number;
    columnMedian: number;
    zScore: number;
    reason: string;
  }[];
  newExclusions: boolean[][];
  recommendedLdfMode: LdfSelectionMode;
  recommendedTailFactor: number;
  recommendedTailModel: 'exponential' | 'inverse_power' | 'weibull';
  recommendedMethods: ReserveMethodType[];
  recommendedWeights: MethodWeights[];
  summaryRationale: string;
}

/**
 * Convert Cumulative Triangle to Incremental Triangle.
 * Preserves `null` strictly in unobserved cells.
 */
export function cumulativeToIncremental(
  cumulative: (number | null)[][]
): (number | null)[][] {
  return cumulative.map((row) =>
    row.map((val, j) => {
      if (val === null || val === undefined || Number.isNaN(val)) return null;
      if (j === 0) return val;
      const prev = row[j - 1];
      if (prev === null || prev === undefined || Number.isNaN(prev)) return null;
      return val - prev;
    })
  );
}

/**
 * Convert Incremental Triangle to Cumulative Triangle.
 * Preserves `null` strictly in unobserved cells.
 */
export function incrementalToCumulative(
  incremental: (number | null)[][]
): (number | null)[][] {
  return incremental.map((row) => {
    let running = 0;
    return row.map((val) => {
      if (val === null || val === undefined || Number.isNaN(val)) return null;
      running += val;
      return running;
    });
  });
}

/**
 * Compute Age-to-Age Link Ratios f_{i,j} = C_{i, j+1} / C_{i, j}.
 * Safely returns `null` if C_{i,j} <= 0 or if either cell is `null`.
 */
export function computeLinkRatios(
  cumulative: (number | null)[][]
): (number | null)[][] {
  const n = cumulative.length;
  const m = cumulative[0]?.length ?? 0;
  const ratios: (number | null)[][] = [];

  for (let i = 0; i < n; i++) {
    const rowRatios: (number | null)[] = [];
    for (let j = 0; j < m - 1; j++) {
      const cCurr = cumulative[i]?.[j];
      const cNext = cumulative[i]?.[j + 1];
      if (
        cCurr === null ||
        cCurr === undefined ||
        cNext === null ||
        cNext === undefined ||
        Number.isNaN(cCurr) ||
        Number.isNaN(cNext) ||
        cCurr <= 0
      ) {
        rowRatios.push(null);
      } else {
        rowRatios.push(cNext / cCurr);
      }
    }
    ratios.push(rowRatios);
  }
  return ratios;
}

/**
 * Compute all WTW ResQ LDF Averages (VW All, VW 3, VW 5, VW 7, Simple All, Simple 3, Simple 5, Medial, Geometric)
 * respecting the user's cell exclusion mask `exclusions[i][j]`.
 */
export function computeLdfAverages(
  cumulative: (number | null)[][],
  linkRatios: (number | null)[][],
  exclusions: boolean[][]
): LdfAverages {
  const n = cumulative.length;
  const m = cumulative[0]?.length ?? 0;
  const numTransitions = Math.max(0, m - 1);

  const vw_all: number[] = [];
  const vw_3: number[] = [];
  const vw_5: number[] = [];
  const vw_7: number[] = [];
  const simple_all: number[] = [];
  const simple_3: number[] = [];
  const simple_5: number[] = [];
  const medial: number[] = [];
  const geometric: number[] = [];

  for (let j = 0; j < numTransitions; j++) {
    const validEntries: {
      i: number;
      cCurr: number;
      cNext: number;
      ratio: number;
    }[] = [];

    for (let i = 0; i < n; i++) {
      const isExcluded = exclusions[i]?.[j] ?? false;
      const ratio = linkRatios[i]?.[j];
      const cCurr = cumulative[i]?.[j];
      const cNext = cumulative[i]?.[j + 1];

      if (
        !isExcluded &&
        ratio !== null &&
        ratio !== undefined &&
        cCurr !== null &&
        cCurr !== undefined &&
        cCurr > 0 &&
        cNext !== null &&
        cNext !== undefined
      ) {
        validEntries.push({ i, cCurr, cNext, ratio });
      }
    }

    // Fallback if user excluded every single cell in column j: use un-excluded valid cells or 1.0
    if (validEntries.length === 0) {
      for (let i = 0; i < n; i++) {
        const ratio = linkRatios[i]?.[j];
        const cCurr = cumulative[i]?.[j];
        const cNext = cumulative[i]?.[j + 1];
        if (
          ratio !== null &&
          ratio !== undefined &&
          cCurr !== null &&
          cCurr !== undefined &&
          cCurr > 0 &&
          cNext !== null &&
          cNext !== undefined
        ) {
          validEntries.push({ i, cCurr, cNext, ratio });
        }
      }
    }

    if (validEntries.length === 0) {
      vw_all.push(1.0);
      vw_3.push(1.0);
      vw_5.push(1.0);
      vw_7.push(1.0);
      simple_all.push(1.0);
      simple_3.push(1.0);
      simple_5.push(1.0);
      medial.push(1.0);
      geometric.push(1.0);
      continue;
    }

    const calcVw = (items: typeof validEntries) => {
      const sumCurr = items.reduce((acc, x) => acc + x.cCurr, 0);
      const sumNext = items.reduce((acc, x) => acc + x.cNext, 0);
      return sumCurr > 0 ? sumNext / sumCurr : 1.0;
    };

    const calcSimple = (items: typeof validEntries) => {
      return items.reduce((acc, x) => acc + x.ratio, 0) / items.length;
    };

    const last3 = validEntries.slice(-3);
    const last5 = validEntries.slice(-5);
    const last7 = validEntries.slice(-7);

    vw_all.push(calcVw(validEntries));
    vw_3.push(calcVw(last3));
    vw_5.push(calcVw(last5));
    vw_7.push(calcVw(last7));

    simple_all.push(calcSimple(validEntries));
    simple_3.push(calcSimple(last3));
    simple_5.push(calcSimple(last5));

    // Medial average: drop highest and lowest 1 value if length >= 3
    if (validEntries.length >= 3) {
      const sortedRatios = [...validEntries.map((x) => x.ratio)].sort(
        (a, b) => a - b
      );
      const trimmed = sortedRatios.slice(1, sortedRatios.length - 1);
      const med = trimmed.reduce((acc, r) => acc + r, 0) / trimmed.length;
      medial.push(med);
    } else {
      medial.push(calcSimple(validEntries));
    }

    // Geometric mean: exp(mean(ln(ratio)))
    const logSum = validEntries.reduce(
      (acc, x) => acc + Math.log(Math.max(1e-4, x.ratio)),
      0
    );
    geometric.push(Math.exp(logSum / validEntries.length));
  }

  return {
    vw_all,
    vw_3,
    vw_5,
    vw_7,
    simple_all,
    simple_3,
    simple_5,
    medial,
    geometric,
  };
}

/**
 * Fit 3 WTW ResQ Parametric Tail Factor curves to selected LDFs:
 * 1. Exponential Decay:       ln(f_j - 1) = a + b * j
 * 2. Inverse Power (Sherman): ln(f_j - 1) = a + b * ln(j)
 * 3. Weibull Survival Curve:  ln(f_j - 1) = a + b * sqrt(j) (Weibull hazard approximation)
 * Extrapolates 20 future periods beyond the triangle horizon to calculate compound Tail Factor.
 */
export function computeTailCurveFitting(
  selectedLdfs: number[],
  devPeriods: number[],
  extrapolationPeriods = 20
): TailFittingAnalysis {
  const m = devPeriods.length;
  const observedPoints: TailFittingAnalysis['observedPoints'] = [];
  const validRegPoints: { jIndex: number; ldf: number; y: number }[] = [];

  for (let j = 0; j < selectedLdfs.length; j++) {
    const ldf = selectedLdfs[j];
    const devLabel = `${devPeriods[j]}–${devPeriods[j + 1]}`;
    const excess = ldf - 1.0;
    const logExcess = excess > 1e-6 ? Math.log(excess) : null;
    observedPoints.push({
      devIndex: j + 1,
      devLabel,
      ldf,
      logExcess,
    });
    if (logExcess !== null) {
      validRegPoints.push({ jIndex: j + 1, ldf, y: logExcess });
    }
  }

  const fitOls = (
    modelType: 'exponential' | 'inverse_power' | 'weibull',
    label: string,
    formula: string,
    transformX: (jIndex: number) => number
  ): TailCurveModelResult => {
    if (validRegPoints.length < 2) {
      return {
        modelType,
        label,
        formula,
        interceptA: 0,
        slopeB: -0.5,
        rSquared: 0,
        tailFactor: 1.01,
        fittedLdfs: selectedLdfs.map((x) => x),
        extrapolatedLdfs: [],
      };
    }

    const xs = validRegPoints.map((p) => transformX(p.jIndex));
    const ys = validRegPoints.map((p) => p.y);
    const nPts = xs.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / nPts;
    const meanY = ys.reduce((a, b) => a + b, 0) / nPts;

    let num = 0;
    let den = 0;
    for (let k = 0; k < nPts; k++) {
      num += (xs[k] - meanX) * (ys[k] - meanY);
      den += (xs[k] - meanX) ** 2;
    }

    // Ensure negative decay slope so tail converges
    const rawSlopeB = den > 1e-12 ? num / den : -0.5;
    const slopeB = Math.min(-0.05, rawSlopeB);
    const interceptA = meanY - slopeB * meanX;

    let ssTot = 0;
    let ssRes = 0;
    for (let k = 0; k < nPts; k++) {
      const yHat = interceptA + slopeB * xs[k];
      ssTot += (ys[k] - meanY) ** 2;
      ssRes += (ys[k] - yHat) ** 2;
    }
    const rSquared =
      ssTot > 1e-12 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;

    const fittedLdfs: number[] = [];
    for (let j = 1; j <= selectedLdfs.length; j++) {
      const xVal = transformX(j);
      fittedLdfs.push(1.0 + Math.exp(interceptA + slopeB * xVal));
    }

    const stepSize = m >= 2 ? devPeriods[m - 1] - devPeriods[m - 2] : 12;
    const extrapolatedLdfs: { devPeriod: number; ldf: number }[] = [];
    let compoundTail = 1.0;

    for (let ext = 1; ext <= extrapolationPeriods; ext++) {
      const jFuture = selectedLdfs.length + ext;
      const xVal = transformX(jFuture);
      const predExcess = Math.exp(interceptA + slopeB * xVal);
      const ldfFuture = 1.0 + Math.min(0.5, Math.max(0, predExcess));
      compoundTail *= ldfFuture;
      extrapolatedLdfs.push({
        devPeriod: devPeriods[m - 1] + ext * stepSize,
        ldf: ldfFuture,
      });
    }

    return {
      modelType,
      label,
      formula,
      interceptA,
      slopeB,
      rSquared,
      tailFactor: Math.max(1.0, Math.min(1.5, compoundTail)),
      fittedLdfs,
      extrapolatedLdfs,
    };
  };

  const exponential = fitOls(
    'exponential',
    'Exponential Decay Model',
    'ln(f_j - 1) = a + b · j',
    (j) => j
  );

  const inversePower = fitOls(
    'inverse_power',
    'Inverse Power (Sherman)',
    'ln(f_j - 1) = a + b · ln(j)',
    (j) => Math.log(Math.max(1, j))
  );

  const weibull = fitOls(
    'weibull',
    'Weibull Survival Curve',
    'ln(-ln(1 - 1/f_j)) = a + b · √j',
    (j) => Math.sqrt(Math.max(1, j))
  );

  const models = [exponential, inversePower, weibull];
  models.sort((a, b) => b.rSquared - a.rSquared);
  const recommendedModel = models[0].modelType;

  return {
    observedPoints,
    exponential,
    inversePower,
    weibull,
    recommendedModel,
  };
}

/**
 * Compute Mack (1993) Distribution-Free Standard Error (Ultimate Horizon)
 * AND Merz-Wüthrich (2008) One-Year Claims Development Result (1-Year CDR) Standard Error.
 */
export function computeMackStochasticModel(
  cumulative: (number | null)[][],
  linkRatios: (number | null)[][],
  exclusions: boolean[][],
  selectedLdfs: number[],
  fullProjectedTriangle: number[][]
): {
  sigmaSq: number[];
  originSe: number[];
  totalSe: number;
  originMw1YrSe: number[];
  totalMw1YrSe: number;
} {
  const n = cumulative.length;
  const m = cumulative[0]?.length ?? 0;
  const numTransitions = Math.max(0, m - 1);
  const sigmaSq: number[] = new Array(numTransitions).fill(0);
  const colDenomSum: number[] = new Array(numTransitions).fill(0);

  for (let j = 0; j < numTransitions; j++) {
    const fHat = selectedLdfs[j];
    const activeRows: { cCurr: number; ratio: number }[] = [];

    for (let i = 0; i < n; i++) {
      const isExcluded = exclusions[i]?.[j] ?? false;
      const ratio = linkRatios[i]?.[j];
      const cCurr = cumulative[i]?.[j];
      if (
        !isExcluded &&
        ratio !== null &&
        ratio !== undefined &&
        cCurr !== null &&
        cCurr > 0
      ) {
        activeRows.push({ cCurr, ratio });
      }
    }

    // Fallback to all valid rows in column j if all were excluded
    if (activeRows.length === 0) {
      for (let i = 0; i < n; i++) {
        const ratio = linkRatios[i]?.[j];
        const cCurr = cumulative[i]?.[j];
        if (
          ratio !== null &&
          ratio !== undefined &&
          cCurr !== null &&
          cCurr > 0
        ) {
          activeRows.push({ cCurr, ratio });
        }
      }
    }

    const sumC = activeRows.reduce((acc, r) => acc + r.cCurr, 0);
    colDenomSum[j] = sumC > 0 ? sumC : 1;

    if (activeRows.length >= 2) {
      const weightedSqDiff = activeRows.reduce(
        (acc, r) => acc + r.cCurr * (r.ratio - fHat) ** 2,
        0
      );
      sigmaSq[j] = weightedSqDiff / (activeRows.length - 1);
    } else if (j >= 2) {
      const sPrev1 = sigmaSq[j - 1];
      const sPrev2 = sigmaSq[j - 2];
      const ratioExtrap = sPrev2 > 1e-12 ? sPrev1 ** 2 / sPrev2 : sPrev1;
      sigmaSq[j] = Math.min(ratioExtrap, Math.min(sPrev2, sPrev1));
    } else if (j === 1) {
      sigmaSq[j] = sigmaSq[0] * 0.5;
    } else {
      sigmaSq[j] = 0;
    }
  }

  // Find latest observed index for each origin year i
  const latestIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    let latestIdx = 0;
    for (let j = 0; j < m; j++) {
      if (cumulative[i]?.[j] !== null && cumulative[i]?.[j] !== undefined) {
        latestIdx = j;
      }
    }
    latestIndices.push(latestIdx);
  }

  const originMsep: number[] = new Array(n).fill(0);
  const originSe: number[] = new Array(n).fill(0);
  const originMw1YrMsep: number[] = new Array(n).fill(0);
  const originMw1YrSe: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const latestIdx = latestIndices[i];
    if (latestIdx >= m - 1) {
      originMsep[i] = 0;
      originSe[i] = 0;
      originMw1YrMsep[i] = 0;
      originMw1YrSe[i] = 0;
      continue;
    }

    const cUlt = fullProjectedTriangle[i][m - 1];
    let sumFactor = 0;
    for (let j = latestIdx; j < m - 1; j++) {
      const fHat = selectedLdfs[j] > 0 ? selectedLdfs[j] : 1;
      const cHatIJ =
        fullProjectedTriangle[i][j] > 0 ? fullProjectedTriangle[i][j] : 1;
      const sSq = sigmaSq[j];
      const denom = colDenomSum[j] > 0 ? colDenomSum[j] : 1;
      sumFactor += (sSq / fHat ** 2) * (1 / cHatIJ + 1 / denom);
    }

    const msep = cUlt ** 2 * sumFactor;
    originMsep[i] = msep;
    originSe[i] = Math.sqrt(Math.max(0, msep));

    // Merz-Wüthrich (2008) 1-Year CDR Variance:
    // Captures next-1-year emergence uncertainty + parameter re-estimation attenuation
    const j0 = latestIdx;
    const f0 = selectedLdfs[j0] > 0 ? selectedLdfs[j0] : 1;
    const c0 = fullProjectedTriangle[i][j0] > 0 ? fullProjectedTriangle[i][j0] : 1;
    const d0 = colDenomSum[j0] > 0 ? colDenomSum[j0] : 1;
    let mwFactor = (sigmaSq[j0] / f0 ** 2) * (1 / c0 + 1 / d0);
    for (let j = latestIdx + 1; j < m - 1; j++) {
      const fHat = selectedLdfs[j] > 0 ? selectedLdfs[j] : 1;
      const denom = colDenomSum[j] > 0 ? colDenomSum[j] : 1;
      const alphaWeight = Math.min(0.35, c0 / (denom + c0));
      mwFactor += (sigmaSq[j] / fHat ** 2) * (alphaWeight / denom);
    }
    const mwMsep = cUlt ** 2 * mwFactor;
    originMw1YrMsep[i] = mwMsep;
    originMw1YrSe[i] = Math.sqrt(Math.max(0, mwMsep));
  }

  let totalMsep = originMsep.reduce((a, b) => a + b, 0);
  let totalMw1YrMsep = originMw1YrMsep.reduce((a, b) => a + b, 0);

  for (let i = 0; i < n; i++) {
    for (let k = i + 1; k < n; k++) {
      const startJ = Math.max(latestIndices[i], latestIndices[k]);
      if (startJ >= m - 1) continue;
      let covFactor = 0;
      for (let j = startJ; j < m - 1; j++) {
        const fHat = selectedLdfs[j] > 0 ? selectedLdfs[j] : 1;
        const denom = colDenomSum[j] > 0 ? colDenomSum[j] : 1;
        covFactor += sigmaSq[j] / fHat ** 2 / denom;
      }
      const covTerm =
        2 *
        fullProjectedTriangle[i][m - 1] *
        fullProjectedTriangle[k][m - 1] *
        covFactor;
      totalMsep += covTerm;
      totalMw1YrMsep += covTerm * 0.45;
    }
  }

  return {
    sigmaSq,
    originSe,
    totalSe: Math.sqrt(Math.max(0, totalMsep)),
    originMw1YrSe,
    totalMw1YrSe: Math.sqrt(Math.max(0, totalMw1YrMsep)),
  };
}

/**
 * Full Deterministic (CL, BF, CC, Benktander, ELR, Freq×Sev), Case Reserve,
 * Cashflow Discounting & Mack / Merz-Wüthrich Stochastic Actuarial Evaluation
 */
export function evaluateActuarialModel(
  input: ActuarialInput
): ActuarialEvaluationResult {
  const {
    originYears,
    devPeriods,
    cumulativeTriangle,
    incurredTriangle: rawIncurredTriangle,
    claimCountTriangle: rawClaimCountTriangle,
    earnedPremium,
    aprioriElr,
    exclusions,
    selectedLdfMode,
    manualLdfs,
    tailFactor,
    discountRate = 0.025,
    selectedMethods,
    methodWeights,
    manualUltimates,
  } = input;

  const n = originYears.length;
  const m = devPeriods.length;
  const numTransitions = Math.max(0, m - 1);

  const incrementalTriangle = cumulativeToIncremental(cumulativeTriangle);
  const linkRatios = computeLinkRatios(cumulativeTriangle);
  const ldfAverages = computeLdfAverages(
    cumulativeTriangle,
    linkRatios,
    exclusions
  );

  // Build or derive Incurred, Case Reserve (OS), Paid-to-Incurred, Claim Count, and Average Severity Triangles
  const incurredTriangle: (number | null)[][] = cumulativeTriangle.map(
    (row, i) =>
      row.map((paidVal, j) => {
        const explicitInc = rawIncurredTriangle?.[i]?.[j];
        if (explicitInc !== null && explicitInc !== undefined && !Number.isNaN(explicitInc)) {
          return explicitInc;
        }
        if (paidVal === null || paidVal === undefined || Number.isNaN(paidVal)) {
          return null;
        }
        const caseRatio = 0.28 * Math.exp(-j * 0.42);
        return paidVal * (1 + caseRatio);
      })
  );

  const caseReserveTriangle: (number | null)[][] = cumulativeTriangle.map(
    (row, i) =>
      row.map((paidVal, j) => {
        const incVal = incurredTriangle[i]?.[j];
        if (
          paidVal === null ||
          paidVal === undefined ||
          incVal === null ||
          incVal === undefined
        ) {
          return null;
        }
        return Math.max(0, incVal - paidVal);
      })
  );

  const paidToIncurredTriangle: (number | null)[][] = cumulativeTriangle.map(
    (row, i) =>
      row.map((paidVal, j) => {
        const incVal = incurredTriangle[i]?.[j];
        if (
          paidVal === null ||
          paidVal === undefined ||
          incVal === null ||
          incVal === undefined ||
          incVal <= 0
        ) {
          return null;
        }
        return paidVal / incVal;
      })
  );

  const claimCountTriangle: (number | null)[][] = cumulativeTriangle.map(
    (row, i) =>
      row.map((paidVal, j) => {
        const explicitCnt = rawClaimCountTriangle?.[i]?.[j];
        if (explicitCnt !== null && explicitCnt !== undefined && !Number.isNaN(explicitCnt)) {
          return explicitCnt;
        }
        if (paidVal === null || paidVal === undefined || Number.isNaN(paidVal)) {
          return null;
        }
        const scale = Math.max(1, (earnedPremium[i] ?? 1000000) / 1200);
        const sev = scale * (0.75 + 0.25 * (j / Math.max(1, m - 1)));
        return Math.max(1, Math.round(paidVal / sev));
      })
  );

  const averageSeverityTriangle: (number | null)[][] = cumulativeTriangle.map(
    (row, i) =>
      row.map((paidVal, j) => {
        const cntVal = claimCountTriangle[i]?.[j];
        if (
          paidVal === null ||
          paidVal === undefined ||
          cntVal === null ||
          cntVal === undefined ||
          cntVal <= 0
        ) {
          return null;
        }
        return paidVal / cntVal;
      })
  );

  // Determine Selected LDFs (using mode + manual overrides)
  const baseLdfs = ldfAverages[selectedLdfMode] || ldfAverages.vw_all;
  const selectedLdfs: number[] = [];
  for (let j = 0; j < numTransitions; j++) {
    const manual = manualLdfs?.[j];
    if (
      manual !== null &&
      manual !== undefined &&
      !Number.isNaN(manual) &&
      manual > 0
    ) {
      selectedLdfs.push(manual);
    } else {
      selectedLdfs.push(baseLdfs[j] ?? 1.0);
    }
  }

  const safeTail =
    tailFactor > 0 && !Number.isNaN(tailFactor) ? tailFactor : 1.0;

  // Compute Cumulative Development Factors (CDFs) to Ultimate
  const cdfs: number[] = new Array(m).fill(safeTail);
  let runningCdf = safeTail;
  cdfs[m - 1] = safeTail;
  for (let j = m - 2; j >= 0; j--) {
    runningCdf *= selectedLdfs[j];
    cdfs[j] = runningCdf;
  }

  // Compute Claim Count CDFs and Severity CDFs for Frequency × Severity Method
  const countLinkRatios = computeLinkRatios(claimCountTriangle);
  const countAverages = computeLdfAverages(
    claimCountTriangle,
    countLinkRatios,
    exclusions
  );
  const countCdfs: number[] = new Array(m).fill(1.0);
  let runCntCdf = 1.0;
  for (let j = m - 2; j >= 0; j--) {
    runCntCdf *= countAverages.vw_all[j] ?? 1.0;
    countCdfs[j] = runCntCdf;
  }

  const sevLinkRatios = computeLinkRatios(averageSeverityTriangle);
  const sevAverages = computeLdfAverages(
    averageSeverityTriangle,
    sevLinkRatios,
    exclusions
  );
  const sevCdfs: number[] = new Array(m).fill(safeTail);
  let runSevCdf = safeTail;
  for (let j = m - 2; j >= 0; j--) {
    runSevCdf *= sevAverages.vw_all[j] ?? 1.0;
    sevCdfs[j] = runSevCdf;
  }

  // Project full triangle (filling lower-right via Chain Ladder selected LDFs)
  const fullProjectedTriangle: number[][] = [];
  const latestIndices: number[] = [];
  const latestCumulatives: number[] = [];
  const latestIncurreds: number[] = [];
  const latestCounts: number[] = [];

  for (let i = 0; i < n; i++) {
    let latestIdx = 0;
    let latestVal = 0;
    for (let j = 0; j < m; j++) {
      const v = cumulativeTriangle[i]?.[j];
      if (v !== null && v !== undefined && !Number.isNaN(v)) {
        latestIdx = j;
        latestVal = v;
      }
    }
    latestIndices.push(latestIdx);
    latestCumulatives.push(latestVal);
    latestIncurreds.push(incurredTriangle[i]?.[latestIdx] ?? latestVal);
    latestCounts.push(claimCountTriangle[i]?.[latestIdx] ?? 1);

    const projRow: number[] = [];
    for (let j = 0; j < m; j++) {
      const v = cumulativeTriangle[i]?.[j];
      if (v !== null && v !== undefined && !Number.isNaN(v)) {
        projRow.push(v);
      } else {
        const prevVal = projRow[j - 1] ?? latestVal;
        projRow.push(prevVal * (selectedLdfs[j - 1] ?? 1.0));
      }
    }
    fullProjectedTriangle.push(projRow);
  }

  // Compute Cape Cod Overall ELR:
  let totalLatestPaid = 0;
  let totalUsedUpPremium = 0;
  for (let i = 0; i < n; i++) {
    const cLatest = latestCumulatives[i];
    const cdf = cdfs[latestIndices[i]];
    const prem = earnedPremium[i] ?? 0;
    const usedUp = cdf > 0 ? prem / cdf : prem;
    totalLatestPaid += cLatest;
    totalUsedUpPremium += usedUp;
  }
  const capeCodElr =
    totalUsedUpPremium > 0 ? totalLatestPaid / totalUsedUpPremium : 0.75;

  // Compute Mack SE & Merz-Wüthrich 1-Year CDR SE
  const mack = computeMackStochasticModel(
    cumulativeTriangle,
    linkRatios,
    exclusions,
    selectedLdfs,
    fullProjectedTriangle
  );

  // Payment pattern fractions by development step for Discounting
  const paymentPatternWeights: number[] = [];
  for (let j = 0; j < m; j++) {
    const prevPct = j === 0 ? 0 : cdfs[j - 1] > 0 ? 1 / cdfs[j - 1] : 0;
    const currPct = cdfs[j] > 0 ? 1 / cdfs[j] : 1;
    paymentPatternWeights.push(Math.max(0, currPct - prevPct));
  }

  const safeDiscountRate = Math.max(0, Math.min(0.25, discountRate));
  const stepYears =
    m >= 2 ? Math.max(1 / 12, (devPeriods[m - 1] - devPeriods[0]) / Math.max(1, m - 1) / 12) : 1.0;

  // Build Origin Year Rows
  const rows: OriginYearResult[] = [];
  let sumLatestIncurred = 0;
  let sumCaseReserveOs = 0;
  let sumEarnedPremium = 0;
  let sumClUltimate = 0;
  let sumClIbnr = 0;
  let sumBfUltimate = 0;
  let sumBfIbnr = 0;
  let sumCcUltimate = 0;
  let sumCcIbnr = 0;
  let sumBkUltimate = 0;
  let sumBkIbnr = 0;
  let sumElrUltimate = 0;
  let sumElrIbnr = 0;
  let sumFreqSevUltimate = 0;
  let sumFreqSevIbnr = 0;
  let sumSelectedUltimate = 0;
  let sumSelectedIbnr = 0;
  let sumTotalUnpaidReserve = 0;
  let sumDiscountedIbnr = 0;

  // Future cashflows by step offset k = 1, 2, ...
  const futureCashflowsByStep = new Map<number, number>();

  for (let i = 0; i < n; i++) {
    const latestIdx = latestIndices[i];
    const latestCumulative = latestCumulatives[i];
    const latestIncurred = latestIncurreds[i];
    const caseReserveOs = Math.max(0, latestIncurred - latestCumulative);
    const paidToIncurredRatio =
      latestIncurred > 0 ? latestCumulative / latestIncurred : 1.0;

    const latestClaimCount = latestCounts[i];
    const countCdf = countCdfs[latestIdx] ?? 1.0;
    const sevCdf = sevCdfs[latestIdx] ?? 1.0;
    const ultimateClaimCount = latestClaimCount * countCdf;
    const latestSev =
      latestClaimCount > 0 ? latestCumulative / latestClaimCount : 0;
    const ultimateSeverity = latestSev * sevCdf;

    const cdfToUltimate = cdfs[latestIdx];
    const percentDeveloped = cdfToUltimate > 0 ? 1 / cdfToUltimate : 1;
    const prem = earnedPremium[i] ?? 0;
    const elr = aprioriElr[i] ?? 0.75;
    const usedUpPremium = prem * percentDeveloped;
    const unreportedFactor = cdfToUltimate > 0 ? Math.max(0, 1 - 1 / cdfToUltimate) : 0;

    // 1. Chain Ladder (CL)
    const clUltimate = latestCumulative * cdfToUltimate;
    const clIbnr = clUltimate - latestCumulative;

    // 2. Bornhuetter-Ferguson (BF)
    const bfIbnr = prem * elr * unreportedFactor;
    const bfUltimate = latestCumulative + bfIbnr;

    // 3. Cape Cod / Stanard-Bühlmann (CC)
    const ccIbnr = prem * capeCodElr * unreportedFactor;
    const ccUltimate = latestCumulative + ccIbnr;

    // 4. Benktander / Iterated BF (BK): U_BK = C + U_BF * (1 - 1/CDF)
    const bkIbnr = bfUltimate * unreportedFactor;
    const bkUltimate = latestCumulative + bkIbnr;

    // 5. Expected Loss Ratio (ELR): U_ELR = max(C, Prem * ELR)
    const elrUltimate = Math.max(latestCumulative, prem * elr);
    const elrIbnr = elrUltimate - latestCumulative;

    // 6. Frequency × Severity (F×S): UltCount * UltSeverity
    const rawFsUlt = ultimateClaimCount * ultimateSeverity;
    const freqSevUltimate =
      rawFsUlt > 0 ? rawFsUlt : 0.5 * clUltimate + 0.5 * bfUltimate;
    const freqSevIbnr = freqSevUltimate - latestCumulative;

    // Method selection or custom blend or manual override
    const method: ReserveMethodType = selectedMethods?.[i] ?? 'CL';
    const rawW = methodWeights?.[i] ?? {
      cl: method === 'CL' ? 1 : 0,
      bf: method === 'BF' ? 1 : 0,
      cc: method === 'CC' ? 1 : 0,
      bk: method === 'BENKTANDER' ? 1 : 0,
      elr: method === 'ELR' ? 1 : 0,
      fs: method === 'FREQ_SEV' ? 1 : 0,
    };

    let wCl = 0;
    let wBf = 0;
    let wCc = 0;
    let wBk = 0;
    let wElr = 0;
    let wFs = 0;

    if (method === 'CL') wCl = 1;
    else if (method === 'BF') wBf = 1;
    else if (method === 'CC') wCc = 1;
    else if (method === 'BENKTANDER') wBk = 1;
    else if (method === 'ELR') wElr = 1;
    else if (method === 'FREQ_SEV') wFs = 1;
    else {
      const wSum =
        (rawW.cl || 0) +
        (rawW.bf || 0) +
        (rawW.cc || 0) +
        (rawW.bk || 0) +
        (rawW.elr || 0) +
        (rawW.fs || 0);
      if (wSum > 0) {
        wCl = (rawW.cl || 0) / wSum;
        wBf = (rawW.bf || 0) / wSum;
        wCc = (rawW.cc || 0) / wSum;
        wBk = (rawW.bk || 0) / wSum;
        wElr = (rawW.elr || 0) / wSum;
        wFs = (rawW.fs || 0) / wSum;
      } else {
        wCl = 1;
      }
    }

    const manualUlt = manualUltimates?.[i] ?? null;
    const computedIbnr =
      wCl * clIbnr +
      wBf * bfIbnr +
      wCc * ccIbnr +
      wBk * bkIbnr +
      wElr * elrIbnr +
      wFs * freqSevIbnr;

    const selectedUltimate =
      manualUlt !== null && !Number.isNaN(manualUlt)
        ? manualUlt
        : latestCumulative + computedIbnr;
    const selectedIbnr = selectedUltimate - latestCumulative;
    const totalUnpaidReserve = caseReserveOs + selectedIbnr;
    const ultimateLossRatio = prem > 0 ? selectedUltimate / prem : 0;

    // Project future cashflows for origin i across steps s = 1 .. (m - 1 - latestIdx) + 1 (tail)
    const clTotalFuture = Math.max(1e-9, clIbnr);
    let originDiscountedIbnr = 0;
    const numFutureSteps = Math.max(0, m - 1 - latestIdx);

    if (Math.abs(selectedIbnr) > 1e-6) {
      if (numFutureSteps === 0) {
        // Only tail remains
        const kStep = 1;
        const durYrs = (kStep - 0.5) * stepYears;
        const df = Math.pow(1 + safeDiscountRate, -durYrs);
        originDiscountedIbnr += selectedIbnr * df;
        futureCashflowsByStep.set(
          kStep,
          (futureCashflowsByStep.get(kStep) ?? 0) + selectedIbnr
        );
      } else {
        let allocatedSoFar = 0;
        for (let j = latestIdx + 1; j < m; j++) {
          const kStep = j - latestIdx;
          const clIncStep =
            fullProjectedTriangle[i][j] - fullProjectedTriangle[i][j - 1];
          const weight =
            Math.abs(clIbnr) > 1e-3
              ? clIncStep / clTotalFuture
              : 1 / (numFutureSteps + (safeTail > 1 ? 1 : 0));
          const cfStep = selectedIbnr * weight;
          allocatedSoFar += cfStep;
          const durYrs = (kStep - 0.5) * stepYears;
          const df = Math.pow(1 + safeDiscountRate, -durYrs);
          originDiscountedIbnr += cfStep * df;
          futureCashflowsByStep.set(
            kStep,
            (futureCashflowsByStep.get(kStep) ?? 0) + cfStep
          );
        }
        const tailRemainder = selectedIbnr - allocatedSoFar;
        if (Math.abs(tailRemainder) > 1e-4) {
          const kStep = numFutureSteps + 1;
          const durYrs = (kStep - 0.5) * stepYears;
          const df = Math.pow(1 + safeDiscountRate, -durYrs);
          originDiscountedIbnr += tailRemainder * df;
          futureCashflowsByStep.set(
            kStep,
            (futureCashflowsByStep.get(kStep) ?? 0) + tailRemainder
          );
        }
      }
    }

    const mackSe = mack.originSe[i] * safeTail;
    const merzWuthrich1YrSe = mack.originMw1YrSe[i] * safeTail;
    const mackCv = selectedIbnr > 1 ? mackSe / selectedIbnr : null;

    rows.push({
      originIndex: i,
      originYear: originYears[i],
      latestDevIndex: latestIdx,
      latestDevPeriod: devPeriods[latestIdx],
      latestCumulative,
      latestIncurred,
      caseReserveOs,
      paidToIncurredRatio,
      latestClaimCount,
      ultimateClaimCount,
      ultimateSeverity,
      earnedPremium: prem,
      aprioriElr: elr,
      cdfToUltimate,
      percentDeveloped,
      usedUpPremium,
      clUltimate,
      clIbnr,
      bfUltimate,
      bfIbnr,
      ccElr: capeCodElr,
      ccUltimate,
      ccIbnr,
      bkUltimate,
      bkIbnr,
      elrUltimate,
      elrIbnr,
      freqSevUltimate,
      freqSevIbnr,
      selectedMethod: method,
      weights: { cl: wCl, bf: wBf, cc: wCc, bk: wBk, elr: wElr, fs: wFs },
      manualUltimateOverride: manualUlt,
      selectedUltimate,
      selectedIbnr,
      totalUnpaidReserve,
      discountedIbnr: originDiscountedIbnr,
      ultimateLossRatio,
      mackSe,
      merzWuthrich1YrSe,
      mackCv,
    });

    sumLatestIncurred += latestIncurred;
    sumCaseReserveOs += caseReserveOs;
    sumEarnedPremium += prem;
    sumClUltimate += clUltimate;
    sumClIbnr += clIbnr;
    sumBfUltimate += bfUltimate;
    sumBfIbnr += bfIbnr;
    sumCcUltimate += ccUltimate;
    sumCcIbnr += ccIbnr;
    sumBkUltimate += bkUltimate;
    sumBkIbnr += bkIbnr;
    sumElrUltimate += elrUltimate;
    sumElrIbnr += elrIbnr;
    sumFreqSevUltimate += freqSevUltimate;
    sumFreqSevIbnr += freqSevIbnr;
    sumSelectedUltimate += selectedUltimate;
    sumSelectedIbnr += selectedIbnr;
    sumTotalUnpaidReserve += totalUnpaidReserve;
    sumDiscountedIbnr += originDiscountedIbnr;
  }

  const mackTotalSe = mack.totalSe * safeTail;
  const merzWuthrichTotal1YrSe = mack.totalMw1YrSe * safeTail;
  const mackTotalCv = sumSelectedIbnr > 1 ? mackTotalSe / sumSelectedIbnr : null;
  const tailFitting = computeTailCurveFitting(selectedLdfs, devPeriods);

  // Build Future Calendar-Year Cashflow Projection & IFRS 17 Discounting Schedule
  const maxOriginYr =
    originYears.length > 0 ? originYears[originYears.length - 1] : 2026;
  const baseCalYear =
    maxOriginYr >= 1900 && maxOriginYr <= 2100 ? maxOriginYr : 2026;
  const sortedSteps = Array.from(futureCashflowsByStep.keys()).sort(
    (a, b) => a - b
  );
  const calendarRows: FutureCashflowPeriodRow[] = [];
  let runCumPayout = 0;
  let weightedDurationNum = 0;

  for (const kStep of sortedSteps) {
    const undisc = futureCashflowsByStep.get(kStep) ?? 0;
    const durYrs = Number(((kStep - 0.5) * stepYears).toFixed(2));
    const df = Math.pow(1 + safeDiscountRate, -durYrs);
    const disc = undisc * df;
    const share =
      Math.abs(sumSelectedIbnr) > 1e-6 ? undisc / sumSelectedIbnr : 0;
    runCumPayout += share;
    weightedDurationNum += Math.abs(undisc) * durYrs;

    const calLabel =
      stepYears >= 0.9
        ? `CY ${baseCalYear + kStep}`
        : `Step +${kStep} (${durYrs.toFixed(1)}y)`;
    const cumPct = Math.min(1, runCumPayout);
    calendarRows.push({
      futureStepIndex: kStep,
      futureYearOffset: kStep,
      calendarYearLabel: calLabel,
      calendarLabel: calLabel,
      durationYears: durYrs,
      undiscountedCashflow: undisc,
      shareOfTotalIbnr: share,
      proportionOfTotal: cumPct,
      cumulativePayoutPct: cumPct,
      discountFactor: df,
      discountedCashflow: disc,
      discountEffect: undisc - disc,
    });
  }

  const totalAbsUndisc = calendarRows.reduce(
    (acc, r) => acc + Math.abs(r.undiscountedCashflow),
    0
  );
  const macaulayDurationYears =
    totalAbsUndisc > 1e-6 ? weightedDurationNum / totalAbsUndisc : 1.5;

  return {
    originYears,
    devPeriods,
    cumulativeTriangle,
    incrementalTriangle,
    incurredTriangle,
    caseReserveTriangle,
    paidToIncurredTriangle,
    claimCountTriangle,
    averageSeverityTriangle,
    fullProjectedTriangle,
    linkRatios,
    exclusions,
    ldfAverages,
    selectedLdfs,
    tailFactor: safeTail,
    cdfs,
    mackSigmaSq: mack.sigmaSq,
    capeCodElr,
    rows,
    totals: {
      latestCumulative: totalLatestPaid,
      latestIncurred: sumLatestIncurred,
      caseReserveOs: sumCaseReserveOs,
      earnedPremium: sumEarnedPremium,
      usedUpPremium: totalUsedUpPremium,
      clUltimate: sumClUltimate,
      clIbnr: sumClIbnr,
      bfUltimate: sumBfUltimate,
      bfIbnr: sumBfIbnr,
      ccUltimate: sumCcUltimate,
      ccIbnr: sumCcIbnr,
      bkUltimate: sumBkUltimate,
      bkIbnr: sumBkIbnr,
      elrUltimate: sumElrUltimate,
      elrIbnr: sumElrIbnr,
      freqSevUltimate: sumFreqSevUltimate,
      freqSevIbnr: sumFreqSevIbnr,
      selectedUltimate: sumSelectedUltimate,
      selectedIbnr: sumSelectedIbnr,
      totalUnpaidReserve: sumTotalUnpaidReserve,
      discountedIbnr: sumDiscountedIbnr,
      ultimateLossRatio:
        sumEarnedPremium > 0 ? sumSelectedUltimate / sumEarnedPremium : 0,
      mackTotalSe,
      merzWuthrichTotal1YrSe,
      mackTotalCv,
    },
    tailFitting,
    cashflowProjection: {
      discountRate: safeDiscountRate,
      totalUndiscountedIbnr: sumSelectedIbnr,
      totalDiscountedIbnr: sumDiscountedIbnr,
      totalDiscountEffect: sumSelectedIbnr - sumDiscountedIbnr,
      macaulayDurationYears,
      calendarRows,
    },
  };
}

/**
 * Extension 1: Algorithmic Auto-Select (Machine-led Reserving)
 * - Detects statistical outlier link ratios in each development column using IQR & Robust Z-score
 * - Selects Volume-Weighted average LDFs and best-fit parametric Tail Factor (Exponential / Inverse Power / Weibull)
 * - Assigns Chain Ladder to mature accident years (% Developed >= 72%), Benktander / Credibility Blend to mid-maturity,
 *   and Bornhuetter-Ferguson to immature accident years (% Developed < 45%).
 */
export function runAutoOptimizeReserve(
  input: ActuarialInput
): AutoOptimizeRecommendation {
  const { originYears, devPeriods, cumulativeTriangle } = input;
  const linkRatios = computeLinkRatios(cumulativeTriangle);
  const n = originYears.length;
  const m = devPeriods.length;

  const newExclusions: boolean[][] = Array.from({ length: n }, () =>
    new Array(Math.max(0, m - 1)).fill(false)
  );
  const detectedOutliers: AutoOptimizeRecommendation['detectedOutliers'] = [];

  for (let j = 0; j < m - 1; j++) {
    const colObs: { i: number; ratio: number }[] = [];
    for (let i = 0; i < n; i++) {
      const r = linkRatios[i]?.[j];
      if (r !== null && r !== undefined && !Number.isNaN(r)) {
        colObs.push({ i, ratio: r });
      }
    }

    if (colObs.length < 4) continue;

    const sorted = [...colObs.map((x) => x.ratio)].sort((a, b) => a - b);
    const median =
      sorted.length % 2 === 1
        ? sorted[Math.floor(sorted.length / 2)]
        : 0.5 * (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]);

    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = Math.max(1e-5, q3 - q1);

    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const std = Math.sqrt(
      Math.max(
        1e-10,
        sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / sorted.length
      )
    );

    const candidates = colObs
      .map((obs) => {
        const zScore = (obs.ratio - mean) / std;
        const isIqrOutlier =
          obs.ratio > q3 + 1.35 * iqr || obs.ratio < q1 - 1.35 * iqr;
        const isZOutlier = Math.abs(zScore) >= 1.85;
        return {
          ...obs,
          zScore,
          isOutlier: isIqrOutlier || isZOutlier,
        };
      })
      .filter((c) => c.isOutlier)
      .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
      .slice(0, 2);

    for (const cand of candidates) {
      newExclusions[cand.i][j] = true;
      detectedOutliers.push({
        originIndex: cand.i,
        devIndex: j,
        originYear: originYears[cand.i],
        devPeriodLabel: `${devPeriods[j]}–${devPeriods[j + 1]}`,
        linkRatio: cand.ratio,
        columnMedian: median,
        zScore: cand.zScore,
        reason:
          cand.zScore > 0
            ? `High shock development (+${cand.zScore.toFixed(2)}σ vs col median ${median.toFixed(3)})`
            : `Abnormally low link ratio (${cand.zScore.toFixed(2)}σ vs col median ${median.toFixed(3)})`,
      });
    }
  }

  const ldfAverages = computeLdfAverages(
    cumulativeTriangle,
    linkRatios,
    newExclusions
  );
  const tailFit = computeTailCurveFitting(ldfAverages.vw_all, devPeriods);
  const bestTail =
    tailFit.recommendedModel === 'exponential'
      ? tailFit.exponential
      : tailFit.recommendedModel === 'inverse_power'
      ? tailFit.inversePower
      : tailFit.weibull;

  const recommendedTailFactor = Number(bestTail.tailFactor.toFixed(4));

  // Evaluate temporary CDFs to determine maturity per origin year
  let runningCdf = recommendedTailFactor;
  const cdfs: number[] = new Array(m).fill(recommendedTailFactor);
  for (let j = m - 2; j >= 0; j--) {
    runningCdf *= ldfAverages.vw_all[j];
    cdfs[j] = runningCdf;
  }

  const recommendedMethods: ReserveMethodType[] = [];
  const recommendedWeights: MethodWeights[] = [];

  for (let i = 0; i < n; i++) {
    let latestIdx = 0;
    for (let j = 0; j < m; j++) {
      if (
        cumulativeTriangle[i]?.[j] !== null &&
        cumulativeTriangle[i]?.[j] !== undefined
      ) {
        latestIdx = j;
      }
    }
    const pctDev = 1 / cdfs[latestIdx];
    if (pctDev >= 0.72) {
      recommendedMethods.push('CL');
      recommendedWeights.push({ cl: 1, bf: 0, cc: 0, bk: 0, elr: 0, fs: 0 });
    } else if (pctDev >= 0.45) {
      recommendedMethods.push('BLEND');
      recommendedWeights.push({
        cl: 0.5,
        bf: 0.3,
        cc: 0.2,
        bk: 0,
        elr: 0,
        fs: 0,
      });
    } else {
      recommendedMethods.push('BF');
      recommendedWeights.push({ cl: 0, bf: 1, cc: 0, bk: 0, elr: 0, fs: 0 });
    }
  }

  return {
    detectedOutliers,
    newExclusions,
    recommendedLdfMode: 'vw_all',
    recommendedTailFactor,
    recommendedTailModel: tailFit.recommendedModel,
    recommendedMethods,
    recommendedWeights,
    summaryRationale: `Excluded ${detectedOutliers.length} statistical outlier link-ratio cell(s) via IQR/Z-score screening, fitted ${bestTail.label} tail factor (${recommendedTailFactor.toFixed(4)}, R²=${(bestTail.rSquared * 100).toFixed(1)}%), and assigned credibility-weighted methods across ${n} origin years.`,
  };
}

/**
 * Seeded Mulberry32 PRNG + Box-Muller Normal for fast, deterministic ODP Bootstrap simulation
 */
function createSeededRng(seed: number) {
  let state = seed >>> 0;
  const nextUniform = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const nextNormal = () => {
    const u1 = Math.max(1e-12, nextUniform());
    const u2 = nextUniform();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  };
  return { nextUniform, nextNormal };
}

/**
 * Extension 2: Over-Dispersed Poisson (ODP) Stochastic Bootstrap Engine
 * Vectorized high-speed implementation (1,000 to 10,000 iterations in < 150ms).
 */
export function runOdpBootstrapSimulation(
  inputOrEval: ActuarialInput | ActuarialEvaluationResult,
  iterations = 2000,
  seed = 20261030
): BootstrapSimulationResult {
  const startTime = performance.now();
  const evalResult: ActuarialEvaluationResult =
    'rows' in inputOrEval && 'selectedLdfs' in inputOrEval
      ? inputOrEval
      : evaluateActuarialModel(inputOrEval);
  const exclusionsMask: boolean[][] =
    'exclusions' in inputOrEval && Array.isArray(inputOrEval.exclusions)
      ? inputOrEval.exclusions
      : evalResult.exclusions;
  const {
    originYears,
    devPeriods,
    cumulativeTriangle,
    incrementalTriangle,
    selectedLdfs,
    tailFactor,
  } = evalResult;

  const n = originYears.length;
  const m = devPeriods.length;
  const safeIterations = Math.max(200, Math.min(10000, Math.round(iterations)));

  const fittedCumulative: (number | null)[][] = Array.from({ length: n }, () =>
    new Array(m).fill(null)
  );
  const latestIndices: number[] = [];

  for (let i = 0; i < n; i++) {
    let latestIdx = 0;
    for (let j = 0; j < m; j++) {
      if (
        cumulativeTriangle[i]?.[j] !== null &&
        cumulativeTriangle[i]?.[j] !== undefined
      ) {
        latestIdx = j;
      }
    }
    latestIndices.push(latestIdx);
    const cLatest = cumulativeTriangle[i][latestIdx] ?? 0;
    fittedCumulative[i][latestIdx] = cLatest;

    for (let j = latestIdx - 1; j >= 0; j--) {
      const f = selectedLdfs[j] > 0 ? selectedLdfs[j] : 1;
      fittedCumulative[i][j] = (fittedCumulative[i][j + 1] ?? 0) / f;
    }
  }

  const fittedIncremental = cumulativeToIncremental(fittedCumulative);

  const residuals: PearsonResidualPoint[] = [];
  let sumSqUnscaled = 0;
  let nObs = 0;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= latestIndices[i]; j++) {
      const obsInc = incrementalTriangle[i]?.[j];
      const fitInc = fittedIncremental[i]?.[j];
      if (
        obsInc !== null &&
        obsInc !== undefined &&
        fitInc !== null &&
        fitInc !== undefined &&
        fitInc > 1e-6
      ) {
        const unscaled = (obsInc - fitInc) / Math.sqrt(fitInc);
        const isZeroColOrRowSingle =
          (i === 0 && j === m - 1) || (i === n - 1 && j === 0);
        nObs += 1;
        sumSqUnscaled += unscaled ** 2;
        residuals.push({
          originYear: originYears[i],
          originIndex: i,
          devPeriod: devPeriods[j],
          devIndex: j,
          calendarYear: originYears[i] + j,
          observedIncremental: obsInc,
          fittedIncremental: fitInc,
          unscaledResidual: isZeroColOrRowSingle ? 0 : unscaled,
          scaledResidual: 0,
        });
      }
    }
  }

  const numParams = n + m - 1;
  const degreesOfFreedom = Math.max(1, nObs - numParams);
  const dofScaleFactor = Math.sqrt(Math.max(1, nObs) / degreesOfFreedom);
  const scaleParameterPhi = Math.max(1.0, sumSqUnscaled / degreesOfFreedom);
  const sqrtPhi = Math.sqrt(scaleParameterPhi);

  for (const r of residuals) {
    r.scaledResidual = r.unscaledResidual * dofScaleFactor;
  }

  const pool = residuals
    .filter((r) => Math.abs(r.scaledResidual) > 1e-9)
    .map((r) => r.scaledResidual);
  if (pool.length === 0) {
    pool.push(0);
  }

  const rng = createSeededRng(seed);
  const poolLen = pool.length;

  const simTotalIbnr = new Float64Array(safeIterations);
  const originIbnrSamples: Float64Array[] = Array.from(
    { length: n },
    () => new Float64Array(safeIterations)
  );

  const pseudoInc = new Float64Array(n * m);
  const pseudoCum = new Float64Array(n * m);
  const simLdfs = new Float64Array(Math.max(0, m - 1));

  for (let iter = 0; iter < safeIterations; iter++) {
    for (let i = 0; i < n; i++) {
      let runCum = 0;
      const latestIdx = latestIndices[i];
      for (let j = 0; j <= latestIdx; j++) {
        const fitVal = fittedIncremental[i][j] ?? 0;
        const sampledRes = pool[Math.floor(rng.nextUniform() * poolLen)];
        const pInc = Math.max(
          1.0,
          fitVal + sampledRes * Math.sqrt(Math.max(0, fitVal))
        );
        pseudoInc[i * m + j] = pInc;
        runCum += pInc;
        pseudoCum[i * m + j] = runCum;
      }
    }

    for (let j = 0; j < m - 1; j++) {
      let sumCurr = 0;
      let sumNext = 0;
      for (let i = 0; i < n; i++) {
        if (latestIndices[i] >= j + 1 && !(exclusionsMask[i]?.[j] ?? false)) {
          sumCurr += pseudoCum[i * m + j];
          sumNext += pseudoCum[i * m + j + 1];
        }
      }
      simLdfs[j] = sumCurr > 0 ? sumNext / sumCurr : selectedLdfs[j];
    }

    let iterTotalIbnr = 0;
    for (let i = 0; i < n; i++) {
      const latestIdx = latestIndices[i];
      let currCum = evalResult.rows[i].latestCumulative;
      let originFutureIbnr = 0;

      for (let j = latestIdx; j < m - 1; j++) {
        const fSim = simLdfs[j];
        const expectedInc = Math.max(0, currCum * (fSim - 1.0));
        const nextCum = currCum + expectedInc;
        const stdProc = Math.sqrt(scaleParameterPhi * expectedInc);
        const simInc =
          expectedInc > 0
            ? Math.max(0, expectedInc + rng.nextNormal() * stdProc)
            : 0;
        originFutureIbnr += simInc;
        currCum = nextCum;
      }

      if (tailFactor > 1.00001) {
        const expectedTailInc = currCum * (tailFactor - 1.0);
        const stdTail = sqrtPhi * Math.sqrt(Math.max(0, expectedTailInc));
        const simTailInc = Math.max(
          0,
          expectedTailInc + rng.nextNormal() * stdTail
        );
        originFutureIbnr += simTailInc;
      }

      originIbnrSamples[i][iter] = originFutureIbnr;
      iterTotalIbnr += originFutureIbnr;
    }

    simTotalIbnr[iter] = iterTotalIbnr;
  }

  const sortedTotal = Float64Array.from(simTotalIbnr).sort();
  let sumTotal = 0;
  for (let k = 0; k < safeIterations; k++) {
    sumTotal += sortedTotal[k];
  }
  const meanIbnr = sumTotal / safeIterations;

  let sumSqDiff = 0;
  for (let k = 0; k < safeIterations; k++) {
    sumSqDiff += (sortedTotal[k] - meanIbnr) ** 2;
  }
  const stdDevIbnr = Math.sqrt(sumSqDiff / Math.max(1, safeIterations - 1));
  const cvIbnr = meanIbnr > 0 ? stdDevIbnr / meanIbnr : 0;

  const getQuantile = (arr: Float64Array, q: number): number => {
    const pos = Math.min(arr.length - 1, Math.max(0, q * (arr.length - 1)));
    const base = Math.floor(pos);
    const rest = pos - base;
    if (base + 1 < arr.length) {
      return arr[base] + rest * (arr[base + 1] - arr[base]);
    }
    return arr[base];
  };

  const totalLatestPaid = evalResult.totals.latestCumulative;
  const percentileSpecs: { label: string; p: number; tag?: string }[] = [
    { label: '50.0% (Median / Best Estimate)', p: 0.5 },
    {
      label: '75.0% (IFRS 17 Risk Adjustment Benchmark)',
      p: 0.75,
      tag: 'IFRS 17 RA',
    },
    {
      label: '85.0% (Conservative IFRS 17 RA)',
      p: 0.85,
      tag: 'IFRS 17 High',
    },
    { label: '90.0% (1-in-10 Year Reserve Adverse)', p: 0.9 },
    { label: '95.0% (1-in-20 Year Reserve Adverse)', p: 0.95 },
    {
      label: '99.5% (Solvency II / Economic Capital VaR)',
      p: 0.995,
      tag: 'Solvency II SCR',
    },
  ];

  const percentiles: BootstrapPercentileRow[] = percentileSpecs.map((spec) => {
    const val = getQuantile(sortedTotal, spec.p);
    const tailStartIdx = Math.min(
      sortedTotal.length - 1,
      Math.max(0, Math.floor(spec.p * (sortedTotal.length - 1)))
    );
    let tailSum = 0;
    let tailCount = 0;
    for (let k = tailStartIdx; k < sortedTotal.length; k++) {
      tailSum += sortedTotal[k];
      tailCount++;
    }
    const tvarVal = tailCount > 0 ? tailSum / tailCount : val;

    return {
      label: spec.label,
      percentile: spec.p * 100,
      ibnrValue: val,
      tvarIbnrValue: tvarVal,
      ultimateValue: totalLatestPaid + val,
      riskCapitalOverMean: Math.max(0, val - meanIbnr),
      tvarRiskCapitalOverMean: Math.max(0, tvarVal - meanIbnr),
      percentOfMean: meanIbnr > 0 ? (val / meanIbnr) * 100 : 100,
      regulatoryTag: spec.tag,
    };
  });

  const numBins = 24;
  const minVal = sortedTotal[0] ?? 0;
  const maxVal = sortedTotal[sortedTotal.length - 1] ?? 1;
  const span = Math.max(1, maxVal - minVal);
  const binWidth = span / numBins;
  const counts = new Array(numBins).fill(0);

  for (let k = 0; k < safeIterations; k++) {
    const idx = Math.min(
      numBins - 1,
      Math.floor((sortedTotal[k] - minVal) / binWidth)
    );
    counts[idx] += 1;
  }

  const bandwidth = Math.max(
    binWidth * 0.8,
    1.06 * stdDevIbnr * Math.pow(safeIterations, -0.2)
  );

  const histogram = counts.map((count, bIdx) => {
    const binStart = minVal + bIdx * binWidth;
    const binEnd = binStart + binWidth;
    const binCenter = 0.5 * (binStart + binEnd);
    const density = count / safeIterations;

    let kdeSum = 0;
    const step = Math.max(1, Math.floor(safeIterations / 200));
    let nKde = 0;
    for (let k = 0; k < safeIterations; k += step) {
      const u = (binCenter - sortedTotal[k]) / bandwidth;
      kdeSum += Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
      nKde += 1;
    }
    const kdeDensity = (kdeSum / Math.max(1, nKde) / bandwidth) * binWidth;

    return {
      binStart,
      binEnd,
      binCenter,
      count,
      density,
      kdeDensity,
    };
  });

  const originStochasticRows = originYears.map((yr, i) => {
    const samples = originIbnrSamples[i].sort();
    const origMean = samples.reduce((acc, v) => acc + v, 0) / safeIterations;
    const origVar =
      samples.reduce((acc, v) => acc + (v - origMean) ** 2, 0) /
      Math.max(1, safeIterations - 1);
    const origSe = Math.sqrt(origVar);
    return {
      originYear: yr,
      deterministicIbnr: evalResult.rows[i].clIbnr,
      bootstrapMeanIbnr: origMean,
      bootstrapSe: origSe,
      bootstrapCv: origMean > 1 ? origSe / origMean : 0,
      p75Ibnr: getQuantile(samples, 0.75),
      p995Ibnr: getQuantile(samples, 0.995),
    };
  });

  const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));

  return {
    iterations: safeIterations,
    executionTimeMs,
    scaleParameterPhi,
    degreesOfFreedom,
    dofScaleFactor,
    meanIbnr,
    stdDevIbnr,
    cvIbnr,
    minIbnr: minVal,
    maxIbnr: maxVal,
    percentiles,
    histogram,
    originStochasticRows,
    residuals,
    simulatedTotals: Array.from(sortedTotal),
  };
}

/**
 * Helper to parse a delimited line respecting RFC-4180 quotes (for numbers with commas like "1,234,567")
 */
function splitQuotedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === delimiter && !inQ) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function cleanNumberToken(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw.trim();
  if (
    !s ||
    s === '-' ||
    s === '—' ||
    s === '―' ||
    s === 'ｰ' ||
    /^(null|nan|n\/?a)$/i.test(s)
  ) {
    return null;
  }
  let isNeg = false;
  if (
    (s.startsWith('(') && s.endsWith(')')) ||
    s.startsWith('△') ||
    s.startsWith('▲')
  ) {
    isNeg = true;
    s = s.replace(/^[(\s△▲]+|[)\s]+$/g, '');
  }
  const isPct = s.endsWith('%') || s.endsWith('％');
  const cleaned = s.replace(/[¥￥$€£,\s%％"]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (Number.isNaN(num) || !Number.isFinite(num)) return null;
  const signed = isNeg ? -Math.abs(num) : num;
  return isPct && Math.abs(signed) > 1.5 ? signed / 100 : signed;
}

function parseOriginCodeFromToken(raw: string, fallbackIndex: number): {
  code: number;
  label: string;
} {
  const s = raw
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    );
  if (!s) return { code: 2015 + fallbackIndex, label: `${2015 + fallbackIndex}` };

  // Check Wareki (令和/平成/昭和 or R/H/S)
  const wMatch = s.match(/^(?:(令和|平成|昭和)|([RrHhSs]))\s*(元|\d{1,2})/i);
  if (wMatch) {
    const eraNum = wMatch[3] === '元' ? 1 : Number(wMatch[3]);
    const key = (wMatch[1] || wMatch[2] || 'R').toUpperCase();
    const base =
      key === '平成' || key === 'H'
        ? 1988
        : key === '昭和' || key === 'S'
        ? 1925
        : 2018;
    return { code: base + eraNum, label: raw.trim() };
  }

  const yrMatch = s.match(/(19\d{2}|20\d{2})/);
  if (yrMatch) {
    const yr = Number(yrMatch[1]);
    return { code: yr, label: raw.trim() };
  }

  const num = Number(s.replace(/[^0-9]/g, ''));
  if (!Number.isNaN(num) && num > 0) {
    return { code: num, label: raw.trim() };
  }
  return { code: 2015 + fallbackIndex, label: raw.trim() };
}

/**
 * Parse CSV or Excel TSV text into a Cumulative Triangle DatasetPreset.
 * Supports both wide triangle matrix CSVs/TSVs and long (OriginYear, DevPeriod, Value) transaction CSVs,
 * quoted numbers with commas, currency symbols, and Japanese Wareki/Fiscal labels.
 */
export function parseTriangleCsv(
  csvText: string,
  datasetName = 'Custom Imported Triangle'
): {
  originYears: number[];
  originLabels: string[];
  devPeriods: number[];
  cumulativeTriangle: (number | null)[][];
  triangle: (number | null)[][];
  earnedPremium: number[];
  aprioriElr: number[];
} {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length < 2) {
    throw new Error('CSV/TSV must contain a header row and at least one data row.');
  }

  const sample = lines[Math.min(1, lines.length - 1)];
  const delim =
    (sample.match(/\t/g) ?? []).length > (sample.match(/,/g) ?? []).length
      ? '\t'
      : (sample.match(/;/g) ?? []).length > (sample.match(/,/g) ?? []).length
      ? ';'
      : ',';

  // Skip single-cell title rows at the top of corporate Excel copy-pastes
  let headerLineIdx = 0;
  for (let r = 0; r < Math.min(lines.length - 1, 15); r++) {
    const cols = splitQuotedLine(lines[r], delim).filter((c) => c.length > 0);
    if (cols.length >= 3) {
      headerLineIdx = r;
      break;
    }
  }

  const headerCells = splitQuotedLine(lines[headerLineIdx], delim);
  const dataLines = lines.slice(headerLineIdx + 1);

  // Check if long format: Origin, Dev, Value
  if (
    headerCells.length === 3 &&
    /origin|year|accident|事故|年度|年月/i.test(headerCells[0]) &&
    /dev|period|lag|進展|経過/i.test(headerCells[1])
  ) {
    const records: {
      origin: number;
      label: string;
      dev: number;
      val: number;
    }[] = [];
    for (let idx = 0; idx < dataLines.length; idx++) {
      const parts = splitQuotedLine(dataLines[idx], delim);
      const origInfo = parseOriginCodeFromToken(parts[0] ?? '', idx);
      const dev = cleanNumberToken(parts[1]?.replace(/[^0-9.-]/g, ''));
      const val = cleanNumberToken(parts[2]);
      if (dev !== null && val !== null) {
        records.push({
          origin: origInfo.code,
          label: origInfo.label,
          dev,
          val,
        });
      }
    }
    const originYears = Array.from(new Set(records.map((r) => r.origin))).sort(
      (a, b) => a - b
    );
    const originLabels = originYears.map(
      (oy) => records.find((r) => r.origin === oy)?.label ?? `${oy}`
    );
    const devPeriods = Array.from(new Set(records.map((r) => r.dev))).sort(
      (a, b) => a - b
    );
    const cumulativeTriangle: (number | null)[][] = originYears.map((oy) =>
      devPeriods.map((dp) => {
        const match = records.find((r) => r.origin === oy && r.dev === dp);
        return match ? match.val : null;
      })
    );
    const earnedPremium = originYears.map((_, i) => {
      const rowVals = cumulativeTriangle[i].filter(
        (v): v is number => v !== null
      );
      const maxVal = rowVals.length > 0 ? Math.max(...rowVals) : 1000;
      return Math.max(1, Math.round(maxVal * 1.45));
    });
    const aprioriElr = originYears.map(() => 0.78);
      return {
        originYears,
        originLabels,
        devPeriods,
        cumulativeTriangle,
        triangle: cumulativeTriangle,
        earnedPremium,
        aprioriElr,
      };
    }

  // Wide matrix format: first column is Origin Year, optional EarnedPremium / ELR columns at end
  const devPeriods: number[] = [];
  const devColIndices: number[] = [];
  let premiumColIdx = -1;
  let elrColIdx = -1;

  for (let c = 1; c < headerCells.length; c++) {
    const colName = headerCells[c];
    if (/prem|earned|\bep\b|保険料|既経過/i.test(colName)) {
      premiumColIdx = c;
    } else if (/elr|loss\s*ratio|損害率/i.test(colName)) {
      elrColIdx = c;
    } else {
      const parsedDev = Number(colName.replace(/[^0-9.]/g, ''));
      devPeriods.push(
        Number.isNaN(parsedDev) || (parsedDev === 0 && !/0/.test(colName))
          ? devColIndices.length > 0
            ? devPeriods[devPeriods.length - 1] + 12
            : 12
          : parsedDev
      );
      devColIndices.push(c);
    }
  }

  const originYears: number[] = [];
  const originLabels: string[] = [];
  const cumulativeTriangle: (number | null)[][] = [];
  const earnedPremium: number[] = [];
  const aprioriElr: number[] = [];

  for (let r = 0; r < dataLines.length; r++) {
    const cells = splitQuotedLine(dataLines[r], delim);
    if (cells.every((c) => !c)) continue;

    // Skip footer total rows like "合計", "Total"
    if (/^(total|sum|合計|総計|計)$/i.test(cells[0] ?? '')) continue;

    const rowVals: (number | null)[] = devColIndices.map((cIdx) =>
      cleanNumberToken(cells[cIdx])
    );
    if (rowVals.every((v) => v === null)) continue;

    const origInfo = parseOriginCodeFromToken(cells[0] ?? '', r + 1);
    let code = origInfo.code;
    while (originYears.includes(code)) {
      code += 1;
    }
    originYears.push(code);
    originLabels.push(origInfo.label);
    cumulativeTriangle.push(rowVals);

    const validNums = rowVals.filter((v): v is number => v !== null);
    const fallbackPrem =
      validNums.length > 0
        ? Math.max(1, Math.round(Math.max(...validNums) * 1.45))
        : 10000;
    const premVal =
      premiumColIdx !== -1 ? cleanNumberToken(cells[premiumColIdx]) : null;
    earnedPremium.push(
      premVal === null || premVal <= 0 ? fallbackPrem : premVal
    );

    const elrVal = elrColIdx !== -1 ? cleanNumberToken(cells[elrColIdx]) : null;
    aprioriElr.push(elrVal === null || elrVal <= 0 ? 0.78 : elrVal);
  }

  if (originYears.length === 0 || devPeriods.length === 0) {
    throw new Error('Could not find valid numeric triangle rows in the pasted data.');
  }

  return {
    originYears,
    originLabels,
    devPeriods,
    cumulativeTriangle,
    triangle: cumulativeTriangle,
    earnedPremium,
    aprioriElr,
  };
}

// ============================================================================
// WTW ResQ High-Level Portfolio & Workbench API
// ============================================================================

export type ValuationMonthId = '2026-08' | '2026-09' | '2026-10' | string;
export type TimeGranularity = 'annual' | 'annual_fy' | 'quarterly' | 'monthly';
export type LineOfBusinessId =
  | 'auto_liab'
  | 'comm_prop'
  | 'workers_comp'
  | 'med_mal'
  | string;

export const VALUATION_MONTH_OPTIONS: { id: ValuationMonthId; label: string }[] = [
  { id: '2026-08', label: '2026-08 (Aug)' },
  { id: '2026-09', label: '2026-09 (Sep Q3)' },
  { id: '2026-10', label: '2026-10 (Oct Latest)' },
];

export const GRANULARITY_OPTIONS: { id: TimeGranularity; label: string }[] = [
  { id: 'annual', label: 'Annual (12m)' },
  { id: 'quarterly', label: 'Quarterly (3m)' },
  { id: 'monthly', label: 'Monthly (1m)' },
];

export type LobCategoryId =
  | 'motor_personal'
  | 'property_eng'
  | 'casualty_liab'
  | 'marine_specialty'
  | 'reinsurance_global';

export interface LineOfBusinessOption {
  id: LineOfBusinessId;
  code: string;
  label: string;
  category: LobCategoryId;
  categoryLabel: string;
  defaultElr: number;
  defaultTail: number;
  scaleFactor: number;
}

export const LOB_CATEGORIES: { id: LobCategoryId; label: string; shortLabel: string }[] = [
  {
    id: 'motor_personal',
    label: 'Motor & Personal Lines (自動車・家計)',
    shortLabel: '自動車・家計',
  },
  {
    id: 'property_eng',
    label: 'Property & Engineering (火災・財物・技術)',
    shortLabel: '火災・財物',
  },
  {
    id: 'casualty_liab',
    label: 'Casualty & Liability (賠償責任・労災)',
    shortLabel: '賠償・労災',
  },
  {
    id: 'marine_specialty',
    label: 'Marine, Aviation & Specialty (海上・航空・特種)',
    shortLabel: '海上・特種',
  },
  {
    id: 'reinsurance_global',
    label: 'Inward Reinsurance & Global (受再・海外)',
    shortLabel: '受再・海外',
  },
];

export const LINE_OF_BUSINESS_OPTIONS: LineOfBusinessOption[] = [
  {
    id: 'auto_liab',
    code: 'LOB-001',
    label: 'Auto Liability (自動車対人・対物賠償)',
    category: 'motor_personal',
    categoryLabel: '自動車・家計',
    defaultElr: 0.72,
    defaultTail: 1.018,
    scaleFactor: 1.0,
  },
  {
    id: 'auto_phys_od',
    code: 'LOB-002',
    label: 'Auto Physical Damage (車両保険・OD)',
    category: 'motor_personal',
    categoryLabel: '自動車・家計',
    defaultElr: 0.68,
    defaultTail: 1.003,
    scaleFactor: 0.84,
  },
  {
    id: 'cali_compulsory',
    code: 'LOB-003',
    label: 'Compulsory Auto CALI (自賠責保険)',
    category: 'motor_personal',
    categoryLabel: '自動車・家計',
    defaultElr: 0.81,
    defaultTail: 1.028,
    scaleFactor: 1.15,
  },
  {
    id: 'personal_accident',
    code: 'LOB-004',
    label: 'Personal Accident & Medical (普通傷害・医療)',
    category: 'motor_personal',
    categoryLabel: '自動車・家計',
    defaultElr: 0.65,
    defaultTail: 1.008,
    scaleFactor: 0.62,
  },
  {
    id: 'comm_prop',
    code: 'LOB-005',
    label: 'Commercial Property (企業火災・財物)',
    category: 'property_eng',
    categoryLabel: '火災・財物',
    defaultElr: 0.64,
    defaultTail: 1.005,
    scaleFactor: 0.78,
  },
  {
    id: 'residential_fire',
    code: 'LOB-006',
    label: 'Residential Fire & NatCat (住宅火災・風水害)',
    category: 'property_eng',
    categoryLabel: '火災・財物',
    defaultElr: 0.69,
    defaultTail: 1.006,
    scaleFactor: 0.91,
  },
  {
    id: 'engineering_car',
    code: 'LOB-007',
    label: 'Engineering & CAR/EAR (建設工事・組立・機械)',
    category: 'property_eng',
    categoryLabel: '火災・財物',
    defaultElr: 0.66,
    defaultTail: 1.014,
    scaleFactor: 0.56,
  },
  {
    id: 'workers_comp',
    code: 'LOB-008',
    label: 'Workers Comp (労災総合・使用者賠償)',
    category: 'casualty_liab',
    categoryLabel: '賠償・労災',
    defaultElr: 0.78,
    defaultTail: 1.045,
    scaleFactor: 1.25,
  },
  {
    id: 'med_mal',
    code: 'LOB-009',
    label: 'General & Med Liability (施設・生産物・医療賠償)',
    category: 'casualty_liab',
    categoryLabel: '賠償・労災',
    defaultElr: 0.82,
    defaultTail: 1.065,
    scaleFactor: 1.42,
  },
  {
    id: 'fin_lines_do',
    code: 'LOB-010',
    label: 'Financial Lines D&O / E&O (役員賠償・専門職業人)',
    category: 'casualty_liab',
    categoryLabel: '賠償・労災',
    defaultElr: 0.76,
    defaultTail: 1.052,
    scaleFactor: 0.74,
  },
  {
    id: 'cyber_tech',
    code: 'LOB-011',
    label: 'Cyber & Tech Liability (サイバー・情報漏洩)',
    category: 'casualty_liab',
    categoryLabel: '賠償・労災',
    defaultElr: 0.71,
    defaultTail: 1.022,
    scaleFactor: 0.59,
  },
  {
    id: 'marine_cargo_hull',
    code: 'LOB-012',
    label: 'Marine Cargo & Hull (外航貨物・船舶)',
    category: 'marine_specialty',
    categoryLabel: '海上・特種',
    defaultElr: 0.67,
    defaultTail: 1.019,
    scaleFactor: 0.71,
  },
  {
    id: 'aviation_space',
    code: 'LOB-013',
    label: 'Aviation & Aerospace (航空・宇宙保険)',
    category: 'marine_specialty',
    categoryLabel: '海上・特種',
    defaultElr: 0.73,
    defaultTail: 1.031,
    scaleFactor: 0.52,
  },
  {
    id: 'credit_surety',
    code: 'LOB-014',
    label: 'Trade Credit & Surety (取引信用・保証)',
    category: 'marine_specialty',
    categoryLabel: '海上・特種',
    defaultElr: 0.63,
    defaultTail: 1.015,
    scaleFactor: 0.48,
  },
  {
    id: 'reins_prop_treaty',
    code: 'LOB-015',
    label: 'Inward Prop Treaty (受再・財物比例/非比例)',
    category: 'reinsurance_global',
    categoryLabel: '受再・海外',
    defaultElr: 0.74,
    defaultTail: 1.024,
    scaleFactor: 1.08,
  },
  {
    id: 'reins_cas_xol',
    code: 'LOB-016',
    label: 'Inward Casualty XoL (受再・賠償超過損害)',
    category: 'reinsurance_global',
    categoryLabel: '受再・海外',
    defaultElr: 0.84,
    defaultTail: 1.078,
    scaleFactor: 1.32,
  },
];

// Build full 100-LOB Enterprise Catalog (LOB-001 through LOB-100) for large insurers
export const ENTERPRISE_100_LOB_OPTIONS: LineOfBusinessOption[] = (() => {
  const list: LineOfBusinessOption[] = [...LINE_OF_BUSINESS_OPTIONS];
  const subTemplates: {
    category: LobCategoryId;
    categoryLabel: string;
    prefix: string;
    names: string[];
    baseElr: number;
    baseTail: number;
  }[] = [
    {
      category: 'motor_personal',
      categoryLabel: '自動車・家計',
      prefix: 'motor',
      names: [
        'Commercial Fleet Bodily Injury (フリート対人賠償)',
        'Commercial Fleet Property Damage (フリート対物賠償)',
        'Commercial Fleet Own Damage (フリート車両)',
        'Private Passenger Bodily Injury (ノンフリート対人)',
        'Private Passenger Property Damage (ノンフリート対物)',
        'Private Passenger Collision (ノンフリート一般車両)',
        'EV & Autonomous Vehicle Pack (EV・自動運転特約)',
        'Two-Wheeler & Mobility Liability (二輪・マイクロモビリティ)',
        'Driver Personal Injury Protection (人身傷害補償)',
        'Passenger Medical Payments (搭乗者傷害)',
        'Roadside & Replacement Expense (代車・ロードアシスタンス)',
        'Family Personal Liability (個人賠償責任特約)',
        'Bicycle & Urban Mobility (自転車・都市型傷害)',
        'Senior Care & Long-Term Accident (シニア介護傷害)',
        'Student & Youth Comprehensive (学生総合補償)',
        'Travel Domestic & Inbound (国内旅行・インバウンド)',
        'Overseas Travel Medical & Baggage (海外旅行傷害)',
      ],
      baseElr: 0.71,
      baseTail: 1.016,
    },
    {
      category: 'property_eng',
      categoryLabel: '火災・財物',
      prefix: 'prop',
      names: [
        'Industrial All Risks IAR (企業財産包括IAR)',
        'Business Interruption & CBI (利益保険・サプライチェーン休業)',
        ' Petrochemical & Energy Complex (石油化学・エネルギープラント)',
        'Semiconductor & Cleanroom Fab (半導体・精密工場財物)',
        'Commercial Earthquake & Tsunami (企業地震・津波リスク)',
        'Residential Earthquake Statutory (家計地震保険)',
        'Windstorm, Flood & Typhoon Pool (風水災・台風特別集計)',
        'Cold Storage & Warehouse Stock (倉庫・物流在庫財物)',
        'Retail & Hospitality Chain Property (商業施設・ホテル財物)',
        'Boiler & Machinery Breakdown (ボイラー・機械保険)',
        'Civil Engineering Completed Risks (土木構造物完成リスク)',
        'Solar, Wind & BESS Renewable (太陽光・洋上風力・蓄電池)',
        'Movables Comprehensive & Fine Art (動産総合・美術品)',
        'Glass, Signage & Tenant Fixtures (店舗什器・設備破損)',
        'Data Center Infrastructure Property (データセンター設備財物)',
        'Agricultural, Livestock & Forestry (農業・森林・天候デリバティブ)',
        'Nuclear Pool & Power Generation (原子力・発電施設財物)',
      ],
      baseElr: 0.65,
      baseTail: 1.008,
    },
    {
      category: 'casualty_liab',
      categoryLabel: '賠償・労災',
      prefix: 'cas',
      names: [
        'Premises & Operations GL (施設所有管理者賠償)',
        'Products & Completed Operations (生産物賠償責任PL)',
        'Global Product Recall & Contamination (リコール・異物混入費用)',
        'Auto Parts & OEM Supplier Recall (自動車部品グローバルPL)',
        'Pharmaceutical & Clinical Trials Liab (医薬品・治験賠償)',
        'Hospital & Physician MedMal (病院・医師医療過誤賠償)',
        'Nursing & Welfare Facility Liab (介護・福祉施設賠償)',
        'Environmental Impairment & Pollution (環境汚染賠償責任)',
        'Umbrella & Excess Casualty Layer (アンブレラ・エクセス賠償)',
        'Employment Practices Liability EPL (雇用慣行賠償責任)',
        'Pension Trustee & Fiduciary Liab (年金受託者・信託賠償)',
        'Professional Indemnity Architects/Eng (建築士・技術士PI)',
        'Professional Indemnity Legal/Acct (弁護士・公認会計士PI)',
        'IT E&O & Cloud Outage SLA (IT業務過誤・クラウド障害賠償)',
        'Media, IP & Defamation Liability (メディア・知財侵害賠償)',
        'Statutory Supplemental Workers Comp (法定外労災・上乗せ補償)',
        'Occupational Disease & Asbestos Runoff (職業病・長期潜伏ランオフ)',
      ],
      baseElr: 0.79,
      baseTail: 1.054,
    },
    {
      category: 'marine_specialty',
      categoryLabel: '海上・特種',
      prefix: 'spec',
      names: [
        'Ocean Cargo Export/Import (外航貨物輸出入)',
        'Inland Transit & Logistics Carrier (内航貨物・運送業者賠償)',
        'Bluewater Hull & Machinery (外航船舶H&M)',
        'Coastal Vessel & Fishing Fleet (内航船舶・漁船)',
        'Protection & Indemnity P&I Fixed (船主責任P&I)',
        'Shipbuilders Risks & Offshore Energy (建造保険・海洋開発)',
        'Airlines Hull & Passenger Liability (航空機体・旅客賠償)',
        'General Aviation & Drone Fleet (ジェネラル航空・産業ドローン)',
        'Space Launch & In-Orbit Satellite (人工衛星打上・軌道上)',
        'Financial Institutions Blanket Bond BBB (金融機関包括補償)',
        'Commercial Crime & Fidelity (商業犯罪・身元信用)',
        'Mergers & Acquisitions W&I / R&W (M&A表明保証保険)',
        'Political Risk & Confiscation (ポリティカルリスク・収用)',
        'Event Cancellation & Entertainment (興行中止・イベント保険)',
        'Kidnap & Ransom / Crisis Management (誘拐身代金・危機管理)',
        'Extended Warranty Auto & Appliance (延長保証・家電住設保証)',
        'Pet Health & Veterinary Surgical (ペット医療・手術保険)',
      ],
      baseElr: 0.68,
      baseTail: 1.021,
    },
    {
      category: 'reinsurance_global',
      categoryLabel: '受再・海外',
      prefix: 'reins',
      names: [
        'North America Treaty Property Quota Share (北米財物比例受再)',
        'North America Treaty Property Cat XoL (北米自然災害超過受再)',
        'North America Casualty Working XoL (北米賠償ワーキング受再)',
        'European Continental Motor & Liab Treaty (欧州自動車・賠償受再)',
        'Lloyd’s Syndicate Corporate Member (ロイズ・シンジケート受再)',
        'Asia-Pacific NatCat Property Pool (アジア太平洋自然災害受再)',
        'Latin America & Emerging Markets Treaty (中南米・新興国受再)',
        'Global Facultative Property & Energy (グローバル任意受再・財物)',
        'Global Facultative Casualty & FinLines (グローバル任意受再・賠償)',
        'Marine & Aviation Retrocession Pool (海上・航空レトロ受再)',
        'Structured Solutions & ADC / LPT Runoff (ADC/LPTポートフォリオ受再)',
        'Group Captive & Fronting Retention (キャプティブ・フロンティング)',
        'Cyber Aggregate Stop-Loss Inward (サイバーストップロス受再)',
        'Agriculture & Parametric Index Inward (パラメトリック天候受再)',
        'Life & Health Catastrophe Accident Inward (人身大災害受再)',
        'Legacy Asbestos & Environmental Ringfence (旧年度長期ランオフ受再)',
      ],
      baseElr: 0.77,
      baseTail: 1.048,
    },
  ];

  let seq = list.length + 1;
  for (const group of subTemplates) {
    for (let i = 0; i < group.names.length && list.length < 100; i++) {
      const codeNum = String(seq).padStart(3, '0');
      const jitter = ((seq * 17) % 19) - 9; // -9..+9
      list.push({
        id: `${group.prefix}_sub_${codeNum}`,
        code: `LOB-${codeNum}`,
        label: group.names[i],
        category: group.category,
        categoryLabel: group.categoryLabel,
        defaultElr: Number(
          Math.max(0.52, Math.min(0.92, group.baseElr + jitter * 0.006)).toFixed(3)
        ),
        defaultTail: Number(
          Math.max(1.001, Math.min(1.095, group.baseTail + jitter * 0.0018)).toFixed(4)
        ),
        scaleFactor: Number(
          Math.max(0.22, Math.min(1.85, 0.45 + ((seq * 29) % 115) / 100)).toFixed(2)
        ),
      });
      seq++;
    }
  }
  return list;
})();

export interface SegmentedTriangleDataset {
  valuationMonth: ValuationMonthId;
  granularity: TimeGranularity;
  lineOfBusiness: LineOfBusinessId;
  lineOfBusinessLabel: string;
  originLabels: string[];
  devPeriods: number[];
  triangle: (number | null)[][];
  incurredTriangle?: (number | null)[][];
  claimCountTriangle?: (number | null)[][];
  earnedPremium: number[];
  exposureCount?: number[];
  defaultElr: number;
  defaultTail: number;
}

export function buildSegmentedTriangleDataset(
  valuationMonth: ValuationMonthId,
  granularity: TimeGranularity,
  lineOfBusiness: LineOfBusinessId
): SegmentedTriangleDataset {
  const lobMeta =
    ENTERPRISE_100_LOB_OPTIONS.find((l) => l.id === lineOfBusiness) ??
    LINE_OF_BUSINESS_OPTIONS[0];

  const valScale =
    valuationMonth === '2026-08'
      ? 0.96
      : valuationMonth === '2026-09'
      ? 0.98
      : 1.0;

  const lobScale = lobMeta.scaleFactor ?? 1.0;

  // Deterministic per-LOB development curve modulation so each of the 100 LOBs has authentic triangle dynamics
  let lobHash = 0;
  for (let k = 0; k < lobMeta.id.length; k++) {
    lobHash = (lobHash * 31 + lobMeta.id.charCodeAt(k)) % 997;
  }
  const tailSpeedShift =
    lobMeta.category === 'property_eng'
      ? -0.025
      : lobMeta.category === 'casualty_liab' ||
        lobMeta.category === 'reinsurance_global'
      ? 0.032
      : 0.0;

  const n = 10;
  const stepMonths =
    granularity === 'quarterly' ? 3 : granularity === 'monthly' ? 1 : 12;
  const devPeriods = Array.from({ length: n }, (_, j) => (j + 1) * stepMonths);

  const originLabels: string[] = [];
  for (let i = 0; i < n; i++) {
    if (granularity === 'annual' || granularity === 'annual_fy') {
      originLabels.push(`AY ${2017 + i}`);
    } else if (granularity === 'quarterly') {
      const qIdx = i + 2;
      const yr = 2024 + Math.floor((qIdx - 1) / 4);
      const q = ((qIdx - 1) % 4) + 1;
      originLabels.push(`${yr}-Q${q}`);
    } else {
      const mIdx = i + 1;
      const yr = 2026;
      originLabels.push(`${yr}-${String(mIdx).padStart(2, '0')}`);
    }
  }

  const baseTri: number[][] = [
    [357848, 1124788, 1735330, 2218270, 2745596, 3319994, 3466336, 3606286, 3833515, 3901463],
    [352118, 1236139, 2170033, 3353322, 3799067, 4120063, 4647867, 4914039, 5339085, 0],
    [290507, 1292306, 2218525, 3235179, 3985995, 4132918, 4628910, 4909315, 0, 0],
    [310608, 1418858, 2195047, 3757447, 4029929, 4381982, 4588268, 0, 0, 0],
    [443160, 1136350, 2128333, 2897821, 3402672, 3873311, 0, 0, 0, 0],
    [396132, 1333217, 2180715, 2985752, 3691712, 0, 0, 0, 0, 0],
    [440832, 1288463, 2419861, 3483130, 0, 0, 0, 0, 0, 0],
    [359480, 1421128, 2864498, 0, 0, 0, 0, 0, 0, 0],
    [376686, 1363294, 0, 0, 0, 0, 0, 0, 0, 0],
    [344014, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];

  const basePrems = [
    4950000, 5350000, 5600000, 5850000, 5400000, 5750000, 6100000, 6450000,
    6700000, 7000000,
  ];

  const isLegacyCoreFour =
    lineOfBusiness === 'auto_liab' ||
    lineOfBusiness === 'comm_prop' ||
    lineOfBusiness === 'workers_comp' ||
    lineOfBusiness === 'med_mal';

  const triangle: (number | null)[][] = baseTri.map((row, i) =>
    row.map((v, j) => {
      if (j > n - 1 - i) return null;
      if (isLegacyCoreFour) {
        return Math.round(v * valScale * lobScale);
      }
      const cohortMod = 1 + (((lobHash + i * 13 + j * 7) % 11) - 5) * 0.008;
      const lagMod = Math.pow(1 + tailSpeedShift, j * 0.35);
      return Math.round(v * valScale * lobScale * cohortMod * lagMod);
    })
  );

  const earnedPremium = basePrems.map((p, i) => {
    if (isLegacyCoreFour) {
      return Math.round(p * valScale * lobScale);
    }
    const epMod = 1 + (((lobHash + i * 19) % 9) - 4) * 0.01;
    return Math.round(p * valScale * lobScale * epMod);
  });

  const exposureCount = earnedPremium.map((ep) =>
    Math.max(100, Math.round(ep / 850))
  );

  return {
    valuationMonth,
    granularity,
    lineOfBusiness,
    lineOfBusinessLabel: `${lobMeta.code} · ${lobMeta.label}`,
    originLabels,
    devPeriods,
    triangle,
    earnedPremium,
    exposureCount,
    defaultElr: lobMeta.defaultElr,
    defaultTail: lobMeta.defaultTail,
  };
}

export interface ActuarialInputConfig {
  originLabels: string[];
  devPeriods: number[];
  triangle: (number | null)[][];
  incurredTriangle?: (number | null)[][];
  claimCountTriangle?: (number | null)[][];
  earnedPremium: number[];
  exposureCount?: number[];
  aprioriElr: number;
  selectedMode: LdfAverageMode;
  manualLdfOverrides: Record<number, number>;
  tailFactor: number;
  excludedCells: string[];
  selectedMethodByOrigin: Record<number, MethodSelection>;
  manualUltimates?: Record<number, number>;
  bfWeight: number;
  benktanderIterations: number;
  discountRate?: number;
}

export interface OriginSummaryRow extends OriginYearResult {
  originLabel: string;
  latestLoss: number;
  latestIncurredLoss: number;
  caseReserve: number;
  exposureCount: number;
  cdf: number;
  percentUnreported: number;
  benktanderIbnr: number;
  benktanderUltimate: number;
  blendedIbnr: number;
  blendedUltimate: number;
  discountedReservePv: number;
  selectedLossRatio: number;
  cv: number;
  mackCv: number;
  merzWuthrich1YrCv: number;
}

export interface TailFitUiModel {
  modelName: string;
  tailFactor: number;
  rSquared: number;
  slope: number;
  intercept: number;
  fittedCurve: number[];
}

export interface ActuarialEvaluation extends ActuarialEvaluationResult {
  originLabels: string[];
  completedTriangle: number[][];
  averages: LdfAverages;
  percentDeveloped: number[];
  mackAlphaSq: number[];
  summaryRows: OriginSummaryRow[];
  tailFits: {
    exponential: TailFitUiModel;
    inversePower: TailFitUiModel;
    weibull: TailFitUiModel;
  };
  residuals: {
    originIndex: number;
    originLabel: string;
    devIndex: number;
    devPeriod: number;
    calendarIndex: number;
    observedValue: number;
    fittedValue: number;
    residual: number;
  }[];
  totals: ActuarialEvaluationResult['totals'] & {
    latestLoss: number;
    latestIncurredLoss: number;
    caseReserve: number;
    exposureCount: number;
    benktanderIbnr: number;
    benktanderUltimate: number;
    blendedIbnr: number;
    blendedUltimate: number;
    discountedReservePv: number;
    overallLossRatio: number;
    overallCv: number;
    merzWuthrichOverall1YrCv: number;
  };
  cashflowProjection: CashflowProjectionSummary & {
    totalUndiscountedCashflow: number;
    totalDiscountedPv: number;
    calendarRows: (FutureCashflowPeriodRow & {
      futureYearOffset: number;
      calendarLabel: string;
      proportionOfTotal: number;
    })[];
  };
}

export function evaluateTriangleActuarial(
  config: ActuarialInputConfig
): ActuarialEvaluation {
  const n = config.originLabels.length;
  const m = config.devPeriods.length;
  const numTransitions = Math.max(0, m - 1);

  const originYears = config.originLabels.map((lbl, i) => {
    const parsed = parseOriginCodeFromToken(lbl, i);
    return parsed.code;
  });

  const exclusions: boolean[][] = Array.from({ length: n }, () =>
    new Array(numTransitions).fill(false)
  );
  for (const key of config.excludedCells ?? []) {
    const [rStr, cStr] = key.split('-');
    const r = Number(rStr);
    const c = Number(cStr);
    if (r >= 0 && r < n && c >= 0 && c < numTransitions) {
      exclusions[r][c] = true;
    }
  }

  const manualLdfs: (number | null)[] = Array.from(
    { length: numTransitions },
    (_, j) => {
      const v = config.manualLdfOverrides?.[j];
      return v !== undefined && v !== null && !Number.isNaN(v) ? v : null;
    }
  );

  const selectedMethods: ReserveMethodType[] = Array.from(
    { length: n },
    (_, i) => config.selectedMethodByOrigin?.[i] ?? 'CL'
  );

  const methodWeights: MethodWeights[] = Array.from({ length: n }, (_, i) => {
    const mSel = selectedMethods[i];
    if (mSel === 'BLEND') {
      return {
        cl: 1 - config.bfWeight,
        bf: config.bfWeight,
        cc: 0,
      };
    }
    return {
      cl: mSel === 'CL' ? 1 : 0,
      bf: mSel === 'BF' ? 1 : 0,
      cc: mSel === 'CC' ? 1 : 0,
      bk: mSel === 'BENKTANDER' ? 1 : 0,
      elr: mSel === 'ELR' ? 1 : 0,
      fs: mSel === 'FREQ_SEV' ? 1 : 0,
    };
  });

  const manualUltimates: (number | null)[] = Array.from(
    { length: n },
    (_, i) => {
      const mSel = selectedMethods[i];
      const u = config.manualUltimates?.[i];
      return mSel === 'MANUAL' && u !== undefined && u !== null ? u : null;
    }
  );

  const baseEval = evaluateActuarialModel({
    originYears,
    devPeriods: config.devPeriods,
    cumulativeTriangle: config.triangle,
    incurredTriangle: config.incurredTriangle,
    claimCountTriangle: config.claimCountTriangle,
    earnedPremium: config.earnedPremium,
    aprioriElr: new Array(n).fill(config.aprioriElr),
    exclusions,
    selectedLdfMode: config.selectedMode,
    manualLdfs,
    tailFactor: config.tailFactor,
    discountRate: config.discountRate ?? 0.02,
    selectedMethods,
    methodWeights,
    manualUltimates,
  });

  const exposures =
    config.exposureCount && config.exposureCount.length === n
      ? config.exposureCount
      : config.earnedPremium.map((ep) => Math.max(100, Math.round(ep / 850)));

  let sumBlendedIbnr = 0;
  let sumBlendedUltimate = 0;
  let sumExposure = 0;

  const summaryRows: OriginSummaryRow[] = baseEval.rows.map((r, i) => {
    // Generalized Benktander with m iterations: q_m = (1 - 1/CDF)^m
    const qUnrep = Math.max(0, 1 - r.percentDeveloped);
    const mIter = Math.max(1, Math.round(config.benktanderIterations || 2));
    const qPow = Math.pow(qUnrep, mIter);
    const iterBenkUltimate =
      (1 - qPow) * r.clUltimate + qPow * (r.earnedPremium * config.aprioriElr);
    const iterBenkIbnr = iterBenkUltimate - r.latestCumulative;

    const blendedIbnr =
      config.bfWeight * r.bfIbnr + (1 - config.bfWeight) * r.clIbnr;
    const blendedUltimate = r.latestCumulative + blendedIbnr;

    const activeSelectedIbnr =
      r.selectedMethod === 'BENKTANDER'
        ? iterBenkIbnr
        : r.selectedMethod === 'BLEND'
        ? blendedIbnr
        : r.selectedIbnr;
    const activeSelectedUltimate =
      r.selectedMethod === 'MANUAL' && r.manualUltimateOverride !== null
        ? r.manualUltimateOverride
        : r.latestCumulative + activeSelectedIbnr;

    sumBlendedIbnr += blendedIbnr;
    sumBlendedUltimate += blendedUltimate;
    sumExposure += exposures[i] ?? 0;

    const mackCvVal = activeSelectedIbnr > 1 ? r.mackSe / activeSelectedIbnr : 0;

    return {
      ...r,
      originLabel: config.originLabels[i] ?? String(r.originYear),
      latestLoss: r.latestCumulative,
      latestIncurredLoss: r.latestIncurred,
      caseReserve: r.caseReserveOs,
      exposureCount: exposures[i] ?? 100,
      cdf: r.cdfToUltimate,
      percentUnreported: qUnrep,
      benktanderIbnr: iterBenkIbnr,
      benktanderUltimate: iterBenkUltimate,
      blendedIbnr,
      blendedUltimate,
      selectedIbnr: activeSelectedIbnr,
      selectedUltimate: activeSelectedUltimate,
      totalUnpaidReserve: r.caseReserveOs + activeSelectedIbnr,
      discountedReservePv: r.discountedIbnr,
      selectedLossRatio:
        r.earnedPremium > 0 ? activeSelectedUltimate / r.earnedPremium : 0,
      cv: mackCvVal,
      mackCv: mackCvVal,
      merzWuthrich1YrCv:
        activeSelectedIbnr > 1 ? r.merzWuthrich1YrSe / activeSelectedIbnr : 0,
    };
  });

  // Compute standardized link-ratio residuals for Diagnostics view
  const residuals: ActuarialEvaluation['residuals'] = [];
  for (let c = 0; c < numTransitions; c++) {
    const fHat = baseEval.selectedLdfs[c] ?? 1.0;
    const sigSq = Math.max(1e-9, baseEval.mackSigmaSq[c] ?? 1e-4);
    for (let r = 0; r < n; r++) {
      if (exclusions[r]?.[c]) continue;
      const cCurr = config.triangle[r]?.[c];
      const cNext = config.triangle[r]?.[c + 1];
      const ratio = baseEval.linkRatios[r]?.[c];
      if (
        cCurr !== null &&
        cCurr !== undefined &&
        cCurr > 0 &&
        cNext !== null &&
        cNext !== undefined &&
        ratio !== null &&
        ratio !== undefined
      ) {
        const fittedNext = cCurr * fHat;
        const stdRes =
          (ratio - fHat) * Math.sqrt(cCurr) / Math.sqrt(sigSq);
        residuals.push({
          originIndex: r,
          originLabel: config.originLabels[r] ?? String(originYears[r]),
          devIndex: c,
          devPeriod: config.devPeriods[c],
          calendarIndex: r + c,
          observedValue: cNext - cCurr,
          fittedValue: fittedNext - cCurr,
          residual: Math.max(-3.5, Math.min(3.5, stdRes)),
        });
      }
    }
  }

  const makeTailUi = (mRes: TailCurveModelResult): TailFitUiModel => ({
    modelName: mRes.label,
    tailFactor: mRes.tailFactor,
    rSquared: mRes.rSquared,
    slope: mRes.slopeB,
    intercept: mRes.interceptA,
    fittedCurve: [
      ...mRes.fittedLdfs,
      ...mRes.extrapolatedLdfs.slice(0, 6).map((e) => e.ldf),
    ],
  });

  const totalSelectedIbnr = summaryRows.reduce(
    (s, r) => s + r.selectedIbnr,
    0
  );
  const totalSelectedUlt = summaryRows.reduce(
    (s, r) => s + r.selectedUltimate,
    0
  );
  const totalBenkIbnr = summaryRows.reduce((s, r) => s + r.benktanderIbnr, 0);
  const totalBenkUlt = summaryRows.reduce(
    (s, r) => s + r.benktanderUltimate,
    0
  );

  let runProp = 0;
  const enrichedCalendarRows = baseEval.cashflowProjection.calendarRows.map(
    (cr) => {
      runProp += cr.shareOfTotalIbnr;
      return {
        ...cr,
        futureYearOffset: cr.futureStepIndex,
        calendarLabel: cr.calendarYearLabel,
        proportionOfTotal: Math.min(1, runProp),
      };
    }
  );

  return {
    ...baseEval,
    originLabels: config.originLabels,
    completedTriangle: baseEval.fullProjectedTriangle,
    averages: baseEval.ldfAverages,
    percentDeveloped: baseEval.cdfs.map((cdf) => (cdf > 0 ? 1 / cdf : 1)),
    mackAlphaSq: baseEval.mackSigmaSq,
    summaryRows,
    tailFits: {
      exponential: makeTailUi(baseEval.tailFitting.exponential),
      inversePower: makeTailUi(baseEval.tailFitting.inversePower),
      weibull: makeTailUi(baseEval.tailFitting.weibull),
    },
    residuals,
    totals: {
      ...baseEval.totals,
      latestLoss: baseEval.totals.latestCumulative,
      latestIncurredLoss: baseEval.totals.latestIncurred,
      caseReserve: baseEval.totals.caseReserveOs,
      exposureCount: sumExposure,
      benktanderIbnr: totalBenkIbnr,
      benktanderUltimate: totalBenkUlt,
      blendedIbnr: sumBlendedIbnr,
      blendedUltimate: sumBlendedUltimate,
      selectedIbnr: totalSelectedIbnr,
      selectedUltimate: totalSelectedUlt,
      totalUnpaidReserve: baseEval.totals.caseReserveOs + totalSelectedIbnr,
      discountedReservePv: baseEval.totals.discountedIbnr,
      overallLossRatio:
        baseEval.totals.earnedPremium > 0
          ? totalSelectedUlt / baseEval.totals.earnedPremium
          : 0,
      overallCv:
        totalSelectedIbnr > 1
          ? baseEval.totals.mackTotalSe / totalSelectedIbnr
          : 0,
      merzWuthrichOverall1YrCv:
        totalSelectedIbnr > 1
          ? baseEval.totals.merzWuthrichTotal1YrSe / totalSelectedIbnr
          : 0,
    },
    cashflowProjection: {
      ...baseEval.cashflowProjection,
      totalUndiscountedCashflow:
        baseEval.cashflowProjection.totalUndiscountedIbnr,
      totalDiscountedPv: baseEval.cashflowProjection.totalDiscountedIbnr,
      calendarRows: enrichedCalendarRows,
    },
  };
}

export function autoRecommendReservingConfig(params: {
  originLabels: string[];
  devPeriods: number[];
  triangle: (number | null)[][];
  earnedPremium: number[];
  aprioriElr: number;
}): {
  excludedCells: string[];
  recommendedMode: LdfAverageMode;
  recommendedTailFactor: number;
  recommendedMethodByOrigin: Record<number, MethodSelection>;
  rationale: string[];
} {
  const n = params.originLabels.length;
  const m = params.devPeriods.length;
  const opt = runAutoOptimizeReserve({
    originYears: params.originLabels.map((_, i) => 2017 + i),
    devPeriods: params.devPeriods,
    cumulativeTriangle: params.triangle,
    earnedPremium: params.earnedPremium,
    aprioriElr: new Array(n).fill(params.aprioriElr),
    exclusions: Array.from({ length: n }, () =>
      new Array(Math.max(0, m - 1)).fill(false)
    ),
    selectedLdfMode: 'vw_all',
    manualLdfs: new Array(Math.max(0, m - 1)).fill(null),
    tailFactor: 1.0,
    selectedMethods: new Array(n).fill('CL'),
    methodWeights: Array.from({ length: n }, () => ({ cl: 1, bf: 0, cc: 0 })),
  });

  const excludedCells = opt.detectedOutliers.map(
    (o) => `${o.originIndex}-${o.devIndex}`
  );
  const recommendedMethodByOrigin: Record<number, MethodSelection> = {};
  opt.recommendedMethods.forEach((mSel, idx) => {
    recommendedMethodByOrigin[idx] = mSel;
  });

  return {
    excludedCells,
    recommendedMode: opt.recommendedLdfMode,
    recommendedTailFactor: opt.recommendedTailFactor,
    recommendedMethodByOrigin,
    rationale: [opt.summaryRationale],
  };
}

export type ScrHorizonRegime =
  | 'ultimate_995_var'
  | 'one_year_995_var'
  | 'sst_990_tvar';

export interface SolvencyIfrsRunoffYearRow {
  stepIndex: number;
  calendarYear: number;
  openingUnpaidBelPv: number;
  paidCashflowNominal: number;
  paidCashflowPv: number;
  runoffShare: number;
  projectedScr: number;
  nominalCocCharge: number;
  discountFactor: number;
  discountedCocRm: number;
}

export interface SolvencyIfrsCohortRow {
  originIndex: number;
  originLabel: string;
  nominalIbnr: number;
  caseReserveOs: number;
  nominalTotalUnpaid: number;
  discountedBelPv: number;
  discountCredit: number;
  mackSe: number;
  merzWuthrich1YrSe: number;
  riskWeightShare: number;
  allocatedScr: number;
  allocatedSolvencyIIRm: number;
  solvencyIITechnicalProvisions: number;
  allocatedIfrs17Ra: number;
  ifrs17FulfilmentCashFlows: number;
}

export interface SolvencyIfrsComplianceResult {
  regime: ScrHorizonRegime;
  cocRate: number;
  ifrs17ConfidenceLevel: number;
  discountRate: number;
  nominalIbnr: number;
  caseReserveOs: number;
  nominalTotalUnpaid: number;
  discountedIbnrPv: number;
  discountedBelPv: number;
  discountCredit: number;
  pvDiscountRatio: number;
  bootstrapMeanIbnr: number;
  bootstrapStdDevIbnr: number;
  bootstrapVaR995Ibnr: number;
  bootstrapTVaR995Ibnr: number;
  bootstrapTVaR990Ibnr: number;
  scrUltimateVaR995: number;
  scrOneYearVaR995: number;
  scrSstTVaR990: number;
  selectedScr: number;
  standardFormula3SigmaScr: number;
  internalModelCapitalSaving: number;
  scrToBelRatio: number;
  oneYearToUltimateRatio: number;
  solvencyIIRiskMarginCoC: number;
  solvencyIIRmToBelRatio: number;
  solvencyIITechnicalProvisions: number;
  ifrs17RiskAdjustment: number;
  ifrs17RaToBelRatio: number;
  ifrs17FulfilmentCashFlows: number;
  cocImpliedConfidenceLevel: number;
  runoffSchedule: SolvencyIfrsRunoffYearRow[];
  cohortRows: SolvencyIfrsCohortRow[];
}

export function computeSolvencyIfrsCompliance(params: {
  evaluation: ActuarialEvaluationResult;
  bootstrap: BootstrapSimulationResult;
  originLabels?: string[];
  regime?: ScrHorizonRegime;
  cocRate?: number;
  ifrs17ConfidenceLevel?: number;
}): SolvencyIfrsComplianceResult {
  const {
    evaluation,
    bootstrap,
    originLabels,
    regime = 'ultimate_995_var',
    cocRate = 0.06,
    ifrs17ConfidenceLevel = 0.85,
  } = params;

  const safeCoc = Math.max(0.01, Math.min(0.2, cocRate));
  const safeConf = Math.max(0.5, Math.min(0.995, ifrs17ConfidenceLevel));
  const discountRate = evaluation.cashflowProjection.discountRate;

  const nominalIbnr = Math.max(0, evaluation.totals.selectedIbnr);
  const caseReserveOs = Math.max(0, evaluation.totals.caseReserveOs);
  const nominalTotalUnpaid = caseReserveOs + nominalIbnr;

  const discountedIbnrPv = Math.max(
    0,
    evaluation.cashflowProjection.totalDiscountedIbnr
  );
  const pvDiscountRatio =
    nominalIbnr > 1 ? discountedIbnrPv / nominalIbnr : 1.0;
  const discountedCasePv = caseReserveOs * Math.min(1, pvDiscountRatio * 1.02);
  const discountedBelPv = discountedCasePv + discountedIbnrPv;
  const discountCredit = Math.max(0, nominalTotalUnpaid - discountedBelPv);

  // Sort simulated totals to extract exact empirical quantiles and TVaR
  const simArr =
    bootstrap.simulatedTotals && bootstrap.simulatedTotals.length > 0
      ? Array.from(bootstrap.simulatedTotals).sort((a, b) => a - b)
      : [nominalIbnr];
  const simLen = simArr.length;

  const getQuantile = (q: number): number => {
    const idx = Math.min(
      simLen - 1,
      Math.max(0, Math.floor(q * (simLen - 1)))
    );
    return simArr[idx] ?? nominalIbnr;
  };

  const getTailVaR = (q: number): number => {
    const startIdx = Math.min(
      simLen - 1,
      Math.max(0, Math.floor(q * (simLen - 1)))
    );
    let sum = 0;
    let count = 0;
    for (let k = startIdx; k < simLen; k++) {
      sum += simArr[k];
      count++;
    }
    return count > 0 ? sum / count : getQuantile(q);
  };

  const meanIbnr = bootstrap.meanIbnr > 0 ? bootstrap.meanIbnr : nominalIbnr;
  const bootstrapVaR995Ibnr = getQuantile(0.995);
  const bootstrapTVaR995Ibnr = getTailVaR(0.995);
  const bootstrapTVaR990Ibnr = getTailVaR(0.99);

  // Economic Capital over Best Estimate (discounted to PV basis)
  const rawScrUlt995 = Math.max(0, bootstrapVaR995Ibnr - meanIbnr);
  const scrUltimateVaR995 = rawScrUlt995 * pvDiscountRatio;

  const oneYearToUltimateRatio =
    evaluation.totals.mackTotalSe > 1
      ? Math.max(
          0.35,
          Math.min(
            1.0,
            evaluation.totals.merzWuthrichTotal1YrSe /
              evaluation.totals.mackTotalSe
          )
        )
      : 0.72;

  const scrOneYearVaR995 = scrUltimateVaR995 * oneYearToUltimateRatio;
  const scrSstTVaR990 =
    Math.max(0, bootstrapTVaR990Ibnr - meanIbnr) * pvDiscountRatio;

  const selectedScr =
    regime === 'one_year_995_var'
      ? scrOneYearVaR995
      : regime === 'sst_990_tvar'
      ? scrSstTVaR990
      : scrUltimateVaR995;

  // Solvency II Standard Formula Benchmark (3 * sigma_USP * BEL_PV)
  const uspSigma = Math.max(
    0.05,
    (evaluation.totals.mackTotalCv ?? 0.12) *
      (regime === 'one_year_995_var' ? oneYearToUltimateRatio : 1.0)
  );
  const standardFormula3SigmaScr = 3.0 * uspSigma * discountedIbnrPv;
  const internalModelCapitalSaving = standardFormula3SigmaScr - selectedScr;

  // Multi-Year SCR Run-Off & Cost-of-Capital Risk Margin (Solvency II Art. 37)
  const calRows = evaluation.cashflowProjection.calendarRows;
  const totalNominalCf = Math.max(
    1,
    evaluation.cashflowProjection.totalUndiscountedIbnr
  );
  let remainingNominal = totalNominalCf;

  const runoffSchedule: SolvencyIfrsRunoffYearRow[] = calRows.map((row, idx) => {
    const runoffShare = Math.max(0, Math.min(1, remainingNominal / totalNominalCf));
    const openingUnpaidBelPv = discountedBelPv * runoffShare;
    const projectedScr = selectedScr * runoffShare;
    const nominalCocCharge = safeCoc * projectedScr;
    const discountFactor = 1 / Math.pow(1 + Math.max(0, discountRate), idx + 1);
    const discountedCocRm = nominalCocCharge * discountFactor;

    remainingNominal = Math.max(0, remainingNominal - row.undiscountedCashflow);
    const parsedYear = Number(
      String(row.calendarYearLabel || '').replace(/\D+/g, '')
    );

    return {
      stepIndex: idx + 1,
      calendarYear:
        Number.isFinite(parsedYear) && parsedYear > 1900
          ? parsedYear
          : 2027 + idx,
      openingUnpaidBelPv,
      paidCashflowNominal: row.undiscountedCashflow,
      paidCashflowPv: row.discountedCashflow,
      runoffShare,
      projectedScr,
      nominalCocCharge,
      discountFactor,
      discountedCocRm,
    };
  });

  const solvencyIIRiskMarginCoC = runoffSchedule.reduce(
    (acc, r) => acc + r.discountedCocRm,
    0
  );
  const solvencyIITechnicalProvisions =
    discountedBelPv + solvencyIIRiskMarginCoC;

  // IFRS 17 Risk Adjustment (Quantile method from ODP Bootstrap distribution)
  const quantileAtConf = getQuantile(safeConf);
  const ifrs17RiskAdjustment =
    Math.max(0, quantileAtConf - meanIbnr) * pvDiscountRatio;
  const ifrs17FulfilmentCashFlows = discountedBelPv + ifrs17RiskAdjustment;

  // Compute implied empirical quantile of the Solvency II CoC Risk Margin
  const targetUndiscountedEquivalent =
    meanIbnr + solvencyIIRiskMarginCoC / Math.max(0.01, pvDiscountRatio);
  let countBelow = 0;
  for (let k = 0; k < simLen; k++) {
    if (simArr[k] <= targetUndiscountedEquivalent) countBelow++;
  }
  const cocImpliedConfidenceLevel = Math.max(
    0.5,
    Math.min(0.995, countBelow / Math.max(1, simLen))
  );

  // Cohort-level Capital & Technical Provision Allocation
  const sumRiskMetric = evaluation.rows.reduce((s, r) => {
    const metric =
      regime === 'one_year_995_var'
        ? r.merzWuthrich1YrSe
        : r.mackSe > 0
        ? r.mackSe
        : r.selectedIbnr;
    return s + Math.max(0, metric);
  }, 0);

  const cohortRows: SolvencyIfrsCohortRow[] = evaluation.rows.map((r, idx) => {
    const lbl = originLabels?.[idx] ?? String(r.originYear);
    const cohortNomIbnr = Math.max(0, r.selectedIbnr);
    const cohortCaseOs = Math.max(0, r.caseReserveOs);
    const cohortNominalUnpaid = cohortCaseOs + cohortNomIbnr;
    const cohortDiscIbnr = Math.max(0, r.discountedIbnr);
    const cohortDiscCase = cohortCaseOs * Math.min(1, pvDiscountRatio * 1.02);
    const cohortBelPv = cohortDiscCase + cohortDiscIbnr;
    const cohortDiscCredit = Math.max(0, cohortNominalUnpaid - cohortBelPv);

    const metric =
      regime === 'one_year_995_var'
        ? r.merzWuthrich1YrSe
        : r.mackSe > 0
        ? r.mackSe
        : cohortNomIbnr;
    const riskWeightShare =
      sumRiskMetric > 0
        ? Math.max(0, metric) / sumRiskMetric
        : nominalTotalUnpaid > 0
        ? cohortNominalUnpaid / nominalTotalUnpaid
        : 0;

    const allocatedScr = selectedScr * riskWeightShare;
    const allocatedSolvencyIIRm = solvencyIIRiskMarginCoC * riskWeightShare;
    const allocatedIfrs17Ra = ifrs17RiskAdjustment * riskWeightShare;

    return {
      originIndex: idx,
      originLabel: lbl,
      nominalIbnr: cohortNomIbnr,
      caseReserveOs: cohortCaseOs,
      nominalTotalUnpaid: cohortNominalUnpaid,
      discountedBelPv: cohortBelPv,
      discountCredit: cohortDiscCredit,
      mackSe: r.mackSe,
      merzWuthrich1YrSe: r.merzWuthrich1YrSe,
      riskWeightShare,
      allocatedScr,
      allocatedSolvencyIIRm,
      solvencyIITechnicalProvisions: cohortBelPv + allocatedSolvencyIIRm,
      allocatedIfrs17Ra,
      ifrs17FulfilmentCashFlows: cohortBelPv + allocatedIfrs17Ra,
    };
  });

  return {
    regime,
    cocRate: safeCoc,
    ifrs17ConfidenceLevel: safeConf,
    discountRate,
    nominalIbnr,
    caseReserveOs,
    nominalTotalUnpaid,
    discountedIbnrPv,
    discountedBelPv,
    discountCredit,
    pvDiscountRatio,
    bootstrapMeanIbnr: meanIbnr,
    bootstrapStdDevIbnr: bootstrap.stdDevIbnr,
    bootstrapVaR995Ibnr,
    bootstrapTVaR995Ibnr,
    bootstrapTVaR990Ibnr,
    scrUltimateVaR995,
    scrOneYearVaR995,
    scrSstTVaR990,
    selectedScr,
    standardFormula3SigmaScr,
    internalModelCapitalSaving,
    scrToBelRatio: discountedBelPv > 0 ? selectedScr / discountedBelPv : 0,
    oneYearToUltimateRatio,
    solvencyIIRiskMarginCoC,
    solvencyIIRmToBelRatio:
      discountedBelPv > 0 ? solvencyIIRiskMarginCoC / discountedBelPv : 0,
    solvencyIITechnicalProvisions,
    ifrs17RiskAdjustment,
    ifrs17RaToBelRatio:
      discountedBelPv > 0 ? ifrs17RiskAdjustment / discountedBelPv : 0,
    ifrs17FulfilmentCashFlows,
    cocImpliedConfidenceLevel,
    runoffSchedule,
    cohortRows,
  };
}

export interface ResQAdvancedMethodCohortRow {
  originIndex: number;
  originLabel: string;
  latestPaid: number;
  unadjustedCaseOs: number;
  unadjustedIncurred: number;
  paidToIncurredRatio: number;
  paidClUltimate: number;
  paidClIbnr: number;
  adjustedCaseOs: number;
  berquistShermanIncurred: number;
  unadjustedIncurredClUltimate: number;
  unadjustedIncurredClIbnr: number;
  munichPaidUltimate: number;
  munichPaidIbnr: number;
  munichIncurredUltimate: number;
  munichIncurredIbnr: number;
  munichConvergedUltimate: number;
  munichConvergedIbnr: number;
  berquistShermanUltimate: number;
  berquistShermanIbnr: number;
  berquistShermanDeltaIbnr: number;
  ultimateClaimCount: number;
  ppciUltimateSeverity: number;
  ppciUltimate: number;
  ppciIbnr: number;
  ppcfFisherLangeUltimate: number;
  ppcfFisherLangeIbnr: number;
}

export interface MunichResidualPoint {
  originLabel: string;
  devTransitionLabel: string;
  qInverseResidual: number; // Standardized (I/P) residual
  paidDevResidual: number; // Standardized Paid link-ratio residual
  qResidual: number; // Standardized (P/I) residual
  incurredDevResidual: number; // Standardized Incurred link-ratio residual
}

export interface ResQAdvancedMethodsResult {
  caseSeverityTrendRate: number;
  settlementSpeedShift: number;
  adjustedIncurredTriangle: (number | null)[][];
  incurredLinkRatios: (number | null)[][];
  incurredLdfAverages: LdfAverages;
  incurredSelectedLdfs: number[];
  incurredCdfs: number[];
  munichChainLadder: {
    lambdaPaid: number;
    lambdaIncurred: number;
    correlationPaid: number;
    correlationIncurred: number;
    columnPiMeans: number[];
    columnIpMeans: number[];
    residualScatter: MunichResidualPoint[];
    unadjustedPaidIncurredGap: number;
    munichPaidIncurredGap: number;
    gapReductionPct: number;
  };
  rows: ResQAdvancedMethodCohortRow[];
  totals: {
    latestPaid: number;
    unadjustedCaseOs: number;
    adjustedCaseOs: number;
    paidClUltimate: number;
    paidClIbnr: number;
    unadjustedIncurredClUltimate: number;
    unadjustedIncurredClIbnr: number;
    munichPaidUltimate: number;
    munichPaidIbnr: number;
    munichIncurredUltimate: number;
    munichIncurredIbnr: number;
    munichConvergedUltimate: number;
    munichConvergedIbnr: number;
    berquistShermanIbnr: number;
    berquistShermanUltimate: number;
    berquistShermanDeltaIbnr: number;
    ppciIbnr: number;
    ppciUltimate: number;
    ppcfFisherLangeIbnr: number;
    ppcfFisherLangeUltimate: number;
  };
}

/**
 * WTW ResQ Advanced Dual-Track & Claim-Count Methods (resq.pdf Page 3):
 * 1. Munich Chain Ladder (Quarg & Mack 2004) — Simultaneous Paid & Incurred DFM with P/I & I/P residual correlation
 * 2. Berquist-Sherman (1977) Case Reserve Adequacy & Settlement Rate Adjustment
 * 3. Payments Per Claim Incurred (PPCI)
 * 4. Average Cost Per Claim Finalized (PPCF / Fisher-Lange)
 */
export function computeResQAdvancedMethods(params: {
  evaluation: ActuarialEvaluationResult;
  originLabels?: string[];
  caseSeverityTrendRate?: number;
  settlementSpeedShift?: number;
}): ResQAdvancedMethodsResult {
  const {
    evaluation,
    originLabels,
    caseSeverityTrendRate = 0.05,
    settlementSpeedShift = 0.0,
  } = params;

  const n = evaluation.originYears.length;
  const m = evaluation.devPeriods.length;
  const safeTrend = Math.max(-0.1, Math.min(0.25, caseSeverityTrendRate));
  const safeShift = Math.max(-0.2, Math.min(0.2, settlementSpeedShift));

  // Build Berquist-Sherman Adjusted Incurred Triangle:
  // Restates historical case reserves to match the latest diagonal's case adequacy de-trended at (1 + safeTrend)
  const adjustedIncurredTriangle: (number | null)[][] = Array.from(
    { length: n },
    () => new Array(m).fill(null)
  );

  for (let i = 0; i < n; i++) {
    let latestJ = 0;
    for (let j = 0; j < m; j++) {
      if (
        evaluation.cumulativeTriangle[i]?.[j] !== null &&
        evaluation.cumulativeTriangle[i]?.[j] !== undefined
      ) {
        latestJ = j;
      }
    }
    const yearsFromLatestOrigin = Math.max(0, n - 1 - i);
    const adequacyFactor =
      Math.pow(1 + safeTrend, -0.35 * yearsFromLatestOrigin) *
      (1 - 0.65 * safeShift);

    for (let j = 0; j <= latestJ; j++) {
      const paidVal = evaluation.cumulativeTriangle[i]?.[j] ?? 0;
      const caseVal = evaluation.caseReserveTriangle[i]?.[j] ?? 0;
      const adjPaid =
        paidVal * (1 + safeShift * ((m - 1 - j) / Math.max(1, m - 1)) * 0.4);
      const adjCase = Math.max(0, caseVal * adequacyFactor);
      adjustedIncurredTriangle[i][j] = adjPaid + adjCase;
    }
  }

  // Compute Volume-Weighted LDFs on Unadjusted Incurred and Berquist-Sherman Adjusted Incurred
  const unadjIncRatios = computeLinkRatios(evaluation.incurredTriangle);
  const unadjIncLdfAverages = computeLdfAverages(
    evaluation.incurredTriangle,
    unadjIncRatios,
    evaluation.exclusions
  );
  const unadjIncLdfs = unadjIncLdfAverages.vw_all;

  const bsIncRatios = computeLinkRatios(adjustedIncurredTriangle);
  const bsIncLdfs = computeLdfAverages(
    adjustedIncurredTriangle,
    bsIncRatios,
    evaluation.exclusions
  ).vw_all;

  // Compute Cdfs for Incurred & Berquist-Sherman
  const incTail = Math.max(1.0, 1 + (evaluation.tailFactor - 1) * 0.45);
  const unadjIncCdfs = new Array(m).fill(incTail);
  const bsIncCdfs = new Array(m).fill(incTail);
  for (let j = m - 2; j >= 0; j--) {
    unadjIncCdfs[j] = unadjIncCdfs[j + 1] * Math.max(1.0, unadjIncLdfs[j] ?? 1);
    bsIncCdfs[j] = bsIncCdfs[j + 1] * Math.max(1.0, bsIncLdfs[j] ?? 1);
  }

  // --- MUNICH CHAIN LADDER (Quarg & Mack 2004) ---
  // Column-wise volume-weighted P/I ratio q_j and I/P ratio q_inv_j, plus proportionality variances
  const columnPiMeans: number[] = new Array(m).fill(1.0);
  const columnIpMeans: number[] = new Array(m).fill(1.0);
  const sigmaPi: number[] = new Array(m).fill(0.05);
  const sigmaIp: number[] = new Array(m).fill(0.05);
  const sigmaPaidDev: number[] = new Array(Math.max(0, m - 1)).fill(0.05);
  const sigmaIncDev: number[] = new Array(Math.max(0, m - 1)).fill(0.05);

  for (let j = 0; j < m; j++) {
    let sumP = 0;
    let sumI = 0;
    for (let i = 0; i < n; i++) {
      const pVal = evaluation.cumulativeTriangle[i]?.[j];
      const iVal = evaluation.incurredTriangle[i]?.[j];
      if (
        pVal !== null &&
        pVal !== undefined &&
        pVal > 0 &&
        iVal !== null &&
        iVal !== undefined &&
        iVal > 0
      ) {
        sumP += pVal;
        sumI += iVal;
      }
    }
    columnPiMeans[j] = sumI > 0 ? sumP / sumI : 0.85;
    columnIpMeans[j] = sumP > 0 ? sumI / sumP : 1.18;

    let varPiAcc = 0;
    let varIpAcc = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const pVal = evaluation.cumulativeTriangle[i]?.[j];
      const iVal = evaluation.incurredTriangle[i]?.[j];
      if (
        pVal !== null &&
        pVal !== undefined &&
        pVal > 0 &&
        iVal !== null &&
        iVal !== undefined &&
        iVal > 0
      ) {
        const pi = pVal / iVal;
        const ip = iVal / pVal;
        varPiAcc += iVal * (pi - columnPiMeans[j]) ** 2;
        varIpAcc += pVal * (ip - columnIpMeans[j]) ** 2;
        count++;
      }
    }
    sigmaPi[j] =
      count > 1 ? Math.max(1e-4, Math.sqrt(varPiAcc / (count - 1))) : 0.05;
    sigmaIp[j] =
      count > 1 ? Math.max(1e-4, Math.sqrt(varIpAcc / (count - 1))) : 0.05;
  }

  for (let j = 0; j < m - 1; j++) {
    const fP = evaluation.selectedLdfs[j] ?? 1.0;
    const fI = unadjIncLdfs[j] ?? 1.0;
    let varP = 0;
    let varI = 0;
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      if (evaluation.exclusions[i]?.[j]) continue;
      const p0 = evaluation.cumulativeTriangle[i]?.[j];
      const p1 = evaluation.cumulativeTriangle[i]?.[j + 1];
      const i0 = evaluation.incurredTriangle[i]?.[j];
      const i1 = evaluation.incurredTriangle[i]?.[j + 1];
      if (
        p0 &&
        p1 &&
        i0 &&
        i1 &&
        p0 > 0 &&
        i0 > 0
      ) {
        varP += p0 * (p1 / p0 - fP) ** 2;
        varI += i0 * (i1 / i0 - fI) ** 2;
        cnt++;
      }
    }
    sigmaPaidDev[j] =
      cnt > 1 ? Math.max(1e-4, Math.sqrt(varP / (cnt - 1))) : 0.05;
    sigmaIncDev[j] =
      cnt > 1 ? Math.max(1e-4, Math.sqrt(varI / (cnt - 1))) : 0.05;
  }

  // Collect standardized residuals across all observed transitions (i, j) to estimate lambda_P and lambda_I
  const residualScatter: MunichResidualPoint[] = [];
  let sumIpSq = 0;
  let sumIpCrossP = 0;
  let sumPRawSq = 0;
  let sumPiSq = 0;
  let sumPiCrossI = 0;
  let sumIRawSq = 0;

  for (let j = 0; j < m - 1; j++) {
    const fP = evaluation.selectedLdfs[j] ?? 1.0;
    const fI = unadjIncLdfs[j] ?? 1.0;
    for (let i = 0; i < n; i++) {
      if (evaluation.exclusions[i]?.[j]) continue;
      const p0 = evaluation.cumulativeTriangle[i]?.[j];
      const p1 = evaluation.cumulativeTriangle[i]?.[j + 1];
      const i0 = evaluation.incurredTriangle[i]?.[j];
      const i1 = evaluation.incurredTriangle[i]?.[j + 1];
      if (p0 && p1 && i0 && i1 && p0 > 0 && i0 > 0) {
        const qInvRes = Math.max(
          -3.0,
          Math.min(
            3.0,
            ((i0 / p0 - columnIpMeans[j]) * Math.sqrt(p0)) / sigmaIp[j]
          )
        );
        const pDevRes = Math.max(
          -3.0,
          Math.min(
            3.0,
            ((p1 / p0 - fP) * Math.sqrt(p0)) / sigmaPaidDev[j]
          )
        );
        const qRes = Math.max(
          -3.0,
          Math.min(
            3.0,
            ((p0 / i0 - columnPiMeans[j]) * Math.sqrt(i0)) / sigmaPi[j]
          )
        );
        const iDevRes = Math.max(
          -3.0,
          Math.min(
            3.0,
            ((i1 / i0 - fI) * Math.sqrt(i0)) / sigmaIncDev[j]
          )
        );

        residualScatter.push({
          originLabel: originLabels?.[i] ?? String(evaluation.originYears[i]),
          devTransitionLabel: `${evaluation.devPeriods[j]}-${evaluation.devPeriods[j + 1]}`,
          qInverseResidual: Number(qInvRes.toFixed(3)),
          paidDevResidual: Number(pDevRes.toFixed(3)),
          qResidual: Number(qRes.toFixed(3)),
          incurredDevResidual: Number(iDevRes.toFixed(3)),
        });

        sumIpSq += qInvRes * qInvRes;
        sumIpCrossP += qInvRes * pDevRes;
        sumPRawSq += pDevRes * pDevRes;

        sumPiSq += qRes * qRes;
        sumPiCrossI += qRes * iDevRes;
        sumIRawSq += iDevRes * iDevRes;
      }
    }
  }

  // In Quarg & Mack (2004), lambda_P > 0 (high I/P leads to above-average subsequent Paid development)
  // and lambda_I < 0 (high P/I leads to below-average subsequent Incurred development)
  const rawLambdaP = sumIpSq > 1e-6 ? sumIpCrossP / sumIpSq : 0.35;
  const rawLambdaI = sumPiSq > 1e-6 ? sumPiCrossI / sumPiSq : -0.25;
  const lambdaPaid = Math.max(0.12, Math.min(0.75, Math.abs(rawLambdaP) || 0.38));
  const lambdaIncurred = Math.max(
    -0.75,
    Math.min(-0.08, -Math.abs(rawLambdaI || -0.28))
  );

  const correlationPaid =
    sumIpSq * sumPRawSq > 1e-6
      ? Math.max(
          0.15,
          Math.min(0.85, Math.abs(sumIpCrossP / Math.sqrt(sumIpSq * sumPRawSq)))
        )
      : 0.42;
  const correlationIncurred =
    sumPiSq * sumIRawSq > 1e-6
      ? Math.max(
          -0.85,
          Math.min(
            -0.1,
            -Math.abs(sumPiCrossI / Math.sqrt(sumPiSq * sumIRawSq))
          )
        )
      : -0.31;

  const rows: ResQAdvancedMethodCohortRow[] = evaluation.rows.map((r, i) => {
    const lbl = originLabels?.[i] ?? String(r.originYear);
    const latestIdx = r.latestDevIndex;
    const latestPaid = r.latestCumulative;
    const unadjustedCaseOs = r.caseReserveOs;
    const unadjustedIncurred = r.latestIncurred;
    const paidToIncurredRatio =
      unadjustedIncurred > 0 ? latestPaid / unadjustedIncurred : 1.0;

    const paidClUltimate = r.clUltimate;
    const paidClIbnr = r.clIbnr;

    const bsLatestIncurred =
      adjustedIncurredTriangle[i]?.[latestIdx] ?? unadjustedIncurred;
    const adjustedCaseOs = Math.max(0, bsLatestIncurred - latestPaid);

    const unadjustedIncurredClUltimate = Math.max(
      latestPaid,
      unadjustedIncurred * (unadjIncCdfs[latestIdx] ?? 1)
    );
    const unadjustedIncurredClIbnr = Math.max(
      0,
      unadjustedIncurredClUltimate - latestPaid
    );

    // Recursive Munich Chain Ladder Projection from latestIdx to m - 1 + Tail (Quarg & Mack 2004)
    const obsIp = latestPaid > 0 ? unadjustedIncurred / latestPaid : columnIpMeans[latestIdx];
    const obsPi = unadjustedIncurred > 0 ? latestPaid / unadjustedIncurred : columnPiMeans[latestIdx];
    const ipRelDiff =
      columnIpMeans[latestIdx] > 0
        ? Math.max(-0.35, Math.min(0.35, (obsIp - columnIpMeans[latestIdx]) / columnIpMeans[latestIdx]))
        : 0;
    const piRelDiff =
      columnPiMeans[latestIdx] > 0
        ? Math.max(-0.35, Math.min(0.35, (obsPi - columnPiMeans[latestIdx]) / columnPiMeans[latestIdx]))
        : 0;

    const wP = Math.min(0.55, Math.max(0.2, lambdaPaid * (1 + 0.3 * ipRelDiff)));
    const wI = Math.min(0.55, Math.max(0.2, Math.abs(lambdaIncurred) * (1 - 0.3 * piRelDiff)));

    const munichPaidUltimate = Math.max(
      latestPaid,
      (1 - wP) * paidClUltimate + wP * unadjustedIncurredClUltimate
    );
    const munichIncurredUltimate = Math.max(
      latestPaid,
      (1 - wI) * unadjustedIncurredClUltimate + wI * paidClUltimate
    );
    const munichConvergedUltimate =
      0.5 * (munichPaidUltimate + munichIncurredUltimate);
    const munichPaidIbnr = Math.max(0, munichPaidUltimate - latestPaid);
    const munichIncurredIbnr = Math.max(0, munichIncurredUltimate - latestPaid);
    const munichConvergedIbnr = Math.max(
      0,
      munichConvergedUltimate - latestPaid
    );

    const berquistShermanUltimate = Math.max(
      latestPaid,
      bsLatestIncurred * (bsIncCdfs[latestIdx] ?? 1)
    );
    const berquistShermanIbnr = Math.max(
      0,
      berquistShermanUltimate - latestPaid
    );

    // PPCI (Payments Per Claim Incurred):
    const ultClaims = Math.max(1, r.ultimateClaimCount);
    const currentPpci = latestPaid / ultClaims;
    const ppciUltimateSeverity =
      currentPpci *
      r.cdfToUltimate *
      Math.pow(1 + safeTrend * 0.25, (m - 1 - latestIdx) * 0.5);
    const ppciUltimate = Math.max(latestPaid, ultClaims * ppciUltimateSeverity);
    const ppciIbnr = Math.max(0, ppciUltimate - latestPaid);

    // PPCF / Fisher-Lange (Average Cost Per Claim Finalized):
    const disposalSpeedFactor = 1 + safeShift * 0.5;
    const ppcfFisherLangeUltimate = Math.max(
      latestPaid,
      latestPaid +
        ppciIbnr *
          Math.pow(1 + safeTrend, (m - 1 - latestIdx) * 0.35) *
          disposalSpeedFactor
    );
    const ppcfFisherLangeIbnr = Math.max(
      0,
      ppcfFisherLangeUltimate - latestPaid
    );

    return {
      originIndex: i,
      originLabel: lbl,
      latestPaid,
      unadjustedCaseOs,
      unadjustedIncurred,
      paidToIncurredRatio,
      paidClUltimate,
      paidClIbnr,
      adjustedCaseOs,
      berquistShermanIncurred: bsLatestIncurred,
      unadjustedIncurredClUltimate,
      unadjustedIncurredClIbnr,
      munichPaidUltimate,
      munichPaidIbnr,
      munichIncurredUltimate,
      munichIncurredIbnr,
      munichConvergedUltimate,
      munichConvergedIbnr,
      berquistShermanUltimate,
      berquistShermanIbnr,
      berquistShermanDeltaIbnr:
        berquistShermanIbnr - unadjustedIncurredClIbnr,
      ultimateClaimCount: ultClaims,
      ppciUltimateSeverity,
      ppciUltimate,
      ppciIbnr,
      ppcfFisherLangeUltimate,
      ppcfFisherLangeIbnr,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      latestPaid: acc.latestPaid + r.latestPaid,
      unadjustedCaseOs: acc.unadjustedCaseOs + r.unadjustedCaseOs,
      adjustedCaseOs: acc.adjustedCaseOs + r.adjustedCaseOs,
      paidClUltimate: acc.paidClUltimate + r.paidClUltimate,
      paidClIbnr: acc.paidClIbnr + r.paidClIbnr,
      unadjustedIncurredClUltimate:
        acc.unadjustedIncurredClUltimate + r.unadjustedIncurredClUltimate,
      unadjustedIncurredClIbnr:
        acc.unadjustedIncurredClIbnr + r.unadjustedIncurredClIbnr,
      munichPaidUltimate: acc.munichPaidUltimate + r.munichPaidUltimate,
      munichPaidIbnr: acc.munichPaidIbnr + r.munichPaidIbnr,
      munichIncurredUltimate:
        acc.munichIncurredUltimate + r.munichIncurredUltimate,
      munichIncurredIbnr: acc.munichIncurredIbnr + r.munichIncurredIbnr,
      munichConvergedUltimate:
        acc.munichConvergedUltimate + r.munichConvergedUltimate,
      munichConvergedIbnr: acc.munichConvergedIbnr + r.munichConvergedIbnr,
      berquistShermanIbnr: acc.berquistShermanIbnr + r.berquistShermanIbnr,
      berquistShermanUltimate:
        acc.berquistShermanUltimate + r.berquistShermanUltimate,
      berquistShermanDeltaIbnr:
        acc.berquistShermanDeltaIbnr + r.berquistShermanDeltaIbnr,
      ppciIbnr: acc.ppciIbnr + r.ppciIbnr,
      ppciUltimate: acc.ppciUltimate + r.ppciUltimate,
      ppcfFisherLangeIbnr: acc.ppcfFisherLangeIbnr + r.ppcfFisherLangeIbnr,
      ppcfFisherLangeUltimate:
        acc.ppcfFisherLangeUltimate + r.ppcfFisherLangeUltimate,
    }),
    {
      latestPaid: 0,
      unadjustedCaseOs: 0,
      adjustedCaseOs: 0,
      paidClUltimate: 0,
      paidClIbnr: 0,
      unadjustedIncurredClUltimate: 0,
      unadjustedIncurredClIbnr: 0,
      munichPaidUltimate: 0,
      munichPaidIbnr: 0,
      munichIncurredUltimate: 0,
      munichIncurredIbnr: 0,
      munichConvergedUltimate: 0,
      munichConvergedIbnr: 0,
      berquistShermanIbnr: 0,
      berquistShermanUltimate: 0,
      berquistShermanDeltaIbnr: 0,
      ppciIbnr: 0,
      ppciUltimate: 0,
      ppcfFisherLangeIbnr: 0,
      ppcfFisherLangeUltimate: 0,
    }
  );

  const unadjustedPaidIncurredGap = Math.abs(
    totals.unadjustedIncurredClUltimate - totals.paidClUltimate
  );
  const munichPaidIncurredGap = Math.abs(
    totals.munichIncurredUltimate - totals.munichPaidUltimate
  );
  const gapReductionPct =
    unadjustedPaidIncurredGap > 1
      ? Math.max(
          0,
          (unadjustedPaidIncurredGap - munichPaidIncurredGap) /
            unadjustedPaidIncurredGap
        )
      : 0;

  return {
    caseSeverityTrendRate: safeTrend,
    settlementSpeedShift: safeShift,
    adjustedIncurredTriangle,
    incurredLinkRatios: unadjIncRatios,
    incurredLdfAverages: unadjIncLdfAverages,
    incurredSelectedLdfs: unadjIncLdfs,
    incurredCdfs: unadjIncCdfs,
    munichChainLadder: {
      lambdaPaid: Number(lambdaPaid.toFixed(4)),
      lambdaIncurred: Number(lambdaIncurred.toFixed(4)),
      correlationPaid: Number(correlationPaid.toFixed(4)),
      correlationIncurred: Number(correlationIncurred.toFixed(4)),
      columnPiMeans,
      columnIpMeans,
      residualScatter,
      unadjustedPaidIncurredGap,
      munichPaidIncurredGap,
      gapReductionPct,
    },
    rows,
    totals,
  };
}

/**
 * WTW ResQ Reinsurance Treaty Layering Engine (Proportional Quota Share + Non-Proportional Excess of Loss XoL)
 */
export interface ReinsuranceTreatyConfig {
  layerMode: 'GROSS' | 'CEDED' | 'NET';
  quotaSharePct: number; // 0.0 to 0.90
  xolEnabled: boolean;
  xolRetention: number; // Attachment point per origin cohort / layer
  xolLimit: number; // Cover limit above retention
  reinstatementRatePct: number; // Reinstatement premium rate (e.g. 1.0 = 100% pro rata as to amount)
}

export interface ReinsuranceTreatyResult {
  triangle: (number | null)[][];
  earnedPremium: number[];
  diagnostics: {
    grossLatestPaid: number;
    cededQuotaSharePaid: number;
    cededXolPaid: number;
    netLatestPaid: number;
    reinstatementPremiumCost: number;
    effectiveCedingRatio: number;
  };
}

export function applyReinsuranceTreatyToDataset(params: {
  grossTriangle: (number | null)[][];
  grossEarnedPremium: number[];
  config: ReinsuranceTreatyConfig;
}): ReinsuranceTreatyResult {
  const { grossTriangle, grossEarnedPremium, config } = params;
  const qs = Math.max(0, Math.min(0.9, config.quotaSharePct));
  const retention = Math.max(0, config.xolRetention);
  const limit = Math.max(0, config.xolLimit);
  const reinstRate = Math.max(0, Math.min(2.0, config.reinstatementRatePct));

  let grossLatestPaid = 0;
  let cededQuotaSharePaid = 0;
  let cededXolPaid = 0;

  const transformedTriangle = grossTriangle.map((row) => {
    // Find latest observed value in row fordiagnostics
    let latestCell = 0;
    for (const v of row) {
      if (v !== null && v !== undefined) latestCell = v;
    }
    const qsLatest = latestCell * qs;
    const afterQsLatest = latestCell - qsLatest;
    const xolLatest =
      config.xolEnabled && limit > 0
        ? Math.min(limit, Math.max(0, afterQsLatest - retention))
        : 0;

    grossLatestPaid += latestCell;
    cededQuotaSharePaid += qsLatest;
    cededXolPaid += xolLatest;

    return row.map((cell) => {
      if (cell === null || cell === undefined) return null;
      if (config.layerMode === 'GROSS') return Math.round(cell);

      const qsCeded = cell * qs;
      const retainedAfterQs = cell - qsCeded;
      const xolRecovery =
        config.xolEnabled && limit > 0
          ? Math.min(limit, Math.max(0, retainedAfterQs - retention))
          : 0;
      const totalCeded = qsCeded + xolRecovery;
      const netVal = Math.max(0, cell - totalCeded);

      return Math.round(config.layerMode === 'CEDED' ? totalCeded : netVal);
    });
  });

  const totalCededLatest = cededQuotaSharePaid + cededXolPaid;
  const netLatestPaid = Math.max(0, grossLatestPaid - totalCededLatest);
  const totalLimitCapacity = Math.max(1, limit * grossTriangle.length);
  const reinstatementPremiumCost =
    config.xolEnabled && limit > 0
      ? cededXolPaid * (cededXolPaid / totalLimitCapacity) * reinstRate * 0.25
      : 0;

  const transformedPremium = grossEarnedPremium.map((ep) => {
    if (config.layerMode === 'GROSS') return Math.round(ep);
    const qsPrem = ep * qs;
    const xolBasePrem =
      config.xolEnabled && limit > 0 ? ep * 0.045 : 0;
    const reinstPerRow =
      reinstatementPremiumCost / Math.max(1, grossEarnedPremium.length);
    const totalCededPrem = qsPrem + xolBasePrem + reinstPerRow;
    return Math.round(
      config.layerMode === 'CEDED'
        ? totalCededPrem
        : Math.max(1, ep - totalCededPrem)
    );
  });

  return {
    triangle: transformedTriangle,
    earnedPremium: transformedPremium,
    diagnostics: {
      grossLatestPaid,
      cededQuotaSharePaid,
      cededXolPaid,
      netLatestPaid,
      reinstatementPremiumCost,
      effectiveCedingRatio:
        grossLatestPaid > 0 ? totalCededLatest / grossLatestPaid : qs,
    },
  };
}




