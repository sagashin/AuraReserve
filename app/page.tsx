'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  DATASET_PRESETS,
  TAYLOR_ASHE_1983,
  DatasetPreset,
} from '@/lib/presets';
import {
  ActuarialInput,
  LdfSelectionMode,
  ReserveMethodType,
  MethodWeights,
  evaluateActuarialModel,
  runAutoOptimizeReserve,
  runOdpBootstrapSimulation,
} from '@/lib/actuarial-engine';
import {
  TimeGranularity,
  ValuationMonthId,
  SegmentFilterState,
  MultiSegmentFactRecord,
  PydConfiguration,
  AnalysisMetricType,
  ExposureBaseType,
  VALUATION_MONTH_OPTIONS,
  buildDefaultMultiSegmentFactStore,
  getAvailableSegmentDimensions,
  pivotSegmentTriangle,
  computePriorYearDevelopmentAndRollup,
} from '@/lib/segment-pyd-engine';
import {
  AuditLogEntry,
  DisplayUnitId,
  DISPLAY_UNIT_OPTIONS,
  formatCurrency,
  formatPercent,
  formatLdf,
  formatSignedDelta,
} from '@/lib/formatters';
import TriangleWorkspace from '@/components/TriangleWorkspace';
import MethodComparisonView from '@/components/MethodComparisonView';
import PriorYearDevAndSegmentsView from '@/components/PriorYearDevAndSegmentsView';
import DiagnosticsAndTailView from '@/components/DiagnosticsAndTailView';
import StochasticBootstrapView from '@/components/StochasticBootstrapView';
import AuditAndReportView from '@/components/AuditAndReportView';
import AuditTrailSidebar from '@/components/AuditTrailSidebar';
import CsvSchemaMapperModal from '@/components/CsvSchemaMapperModal';
import {
  Sparkles,
  Sun,
  Moon,
  RotateCcw,
  PanelRight,
  FileSpreadsheet,
  Filter,
  SlidersHorizontal,
  Link2,
} from 'lucide-react';

type ActiveWorkspaceTab =
  | 'triangle'
  | 'methods'
  | 'pyd_segments'
  | 'diagnostics'
  | 'stochastic'
  | 'audit';

interface SliceParameterOverrides {
  exclusions: boolean[][];
  selectedLdfMode: LdfSelectionMode;
  manualLdfs: (number | null)[];
  tailFactor: number;
  selectedMethods: ReserveMethodType[];
  methodWeights: MethodWeights[];
  earnedPremiumOverrides?: number[];
  aprioriElrOverrides?: number[];
}

function makeDefaultOverrides(n: number, m: number): SliceParameterOverrides {
  return {
    exclusions: Array.from({ length: n }, () =>
      new Array(Math.max(0, m - 1)).fill(false)
    ),
    selectedLdfMode: 'vw_all',
    manualLdfs: new Array(Math.max(0, m - 1)).fill(null),
    tailFactor: 1.0,
    selectedMethods: new Array(n).fill('CL'),
    methodWeights: Array.from({ length: n }, () => ({ cl: 1, bf: 0, cc: 0 })),
  };
}

export default function AuraReservePage() {
  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>('triangle');
  const [isDark, setIsDark] = useState<boolean>(true);
  const [showAuditDrawer, setShowAuditDrawer] = useState<boolean>(true);
  const [isSchemaMapperOpen, setIsSchemaMapperOpen] = useState<boolean>(false);
  const [schemaMapperMode, setSchemaMapperMode] = useState<
    'loss' | 'separate_premium'
  >('loss');

  // Portfolio Data Mode: 'multi_segment' (Dynamic Monthly/Quarterly/Annual CY/FY OLAP) or preset ID
  const [dataSourceMode, setDataSourceMode] = useState<string>('multi_segment');
  const [factStore, setFactStore] = useState<MultiSegmentFactRecord[]>(() =>
    buildDefaultMultiSegmentFactStore()
  );

  // Multi-Segment Slicer, Granularity, Metric & Denominator Base State
  const [valuationMonth, setValuationMonth] =
    useState<ValuationMonthId>('2026-10');
  const [granularity, setGranularity] = useState<TimeGranularity>('annual');
  const [analysisMetric, setAnalysisMetric] =
    useState<AnalysisMetricType>('paid');
  const [exposureBase, setExposureBase] =
    useState<ExposureBaseType>('premium');
  const [displayUnitId, setDisplayUnitId] = useState<DisplayUnitId>('usd');
  const [segmentFilters, setSegmentFilters] = useState<SegmentFilterState>({
    product: 'ALL',
    channel: 'ALL',
    coverage: 'ALL',
    region: 'ALL',
  });

  // Configurable Prior Year Development (PYD) parameters (auto-detected when null)
  const [pydConfig, setPydConfig] = useState<PydConfiguration>({
    priorCutoffOriginCode: null,
    baselineDiagonalStepsBack: null,
  });

  // Per-slice overrides map so each segment/granularity slice retains its own actuarial settings
  const [sliceOverridesMap, setSliceOverridesMap] = useState<
    Record<string, SliceParameterOverrides>
  >({});

  // Custom single-triangle override when user imports a simple CSV
  const [customSinglePreset, setCustomSinglePreset] =
    useState<DatasetPreset | null>(null);

  const [bootstrapParams, setBootstrapParams] = useState<{
    iterations: number;
    seed: number;
  }>({
    iterations: 2000,
    seed: 20261030,
  });
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [autoOptimizeBanner, setAutoOptimizeBanner] = useState<string | null>(
    null
  );

  // Available segment dropdown dimensions & values from the active factStore
  const availableDimensions = useMemo(
    () => getAvailableSegmentDimensions(factStore),
    [factStore]
  );

  const displayUnitSpec = useMemo(
    () =>
      DISPLAY_UNIT_OPTIONS.find((u) => u.id === displayUnitId) ??
      DISPLAY_UNIT_OPTIONS[0],
    [displayUnitId]
  );

  // Dynamically pivot the active triangle slice and apply homogeneous display unit scaling
  const activePivotedSlice = useMemo(() => {
    const rawSlice =
      dataSourceMode === 'multi_segment'
        ? pivotSegmentTriangle(
            factStore,
            valuationMonth,
            granularity,
            segmentFilters,
            analysisMetric,
            exposureBase
          )
        : (() => {
            const preset =
              dataSourceMode === 'custom_single' && customSinglePreset
                ? customSinglePreset
                : DATASET_PRESETS.find((p) => p.id === dataSourceMode) ??
                  TAYLOR_ASHE_1983;

            return {
              sliceKey: `preset|${preset.id}`,
              valuationMonth: '2026-10' as ValuationMonthId,
              granularity: 'annual' as TimeGranularity,
              metric: analysisMetric,
              exposureBase,
              filters: segmentFilters,
              matchedSegmentCount: 1,
              originCodes: preset.originYears,
              originLabels: preset.originYears.map((y) => `${y}`),
              isPriorYearFlags: preset.originYears.map(
                (_, idx) => idx < preset.originYears.length - 1
              ),
              devPeriods: preset.devPeriods,
              devUnitLabel: 'm',
              cumulativeTriangle: preset.cumulativeTriangle,
              priorYearEnd2025Diagonal: preset.cumulativeTriangle.map((row) => {
                const nonNull = row.filter((v): v is number => v !== null);
                return nonNull.length >= 2
                  ? nonNull[nonNull.length - 2]
                  : nonNull[0] ?? null;
              }),
              earnedPremium: preset.earnedPremium,
              earnedExposure: preset.earnedPremium.map((p) =>
                Math.round(p / 80)
              ),
              aprioriElr: preset.aprioriElr,
            };
          })();

    const div =
      analysisMetric === 'claim_count' ? 1 : displayUnitSpec.divisor;
    if (div === 1) return rawSlice;

    return {
      ...rawSlice,
      cumulativeTriangle: rawSlice.cumulativeTriangle.map((row) =>
        row.map((v) => (v === null ? null : v / div))
      ),
      priorYearEnd2025Diagonal: rawSlice.priorYearEnd2025Diagonal.map((v) =>
        v === null ? null : v / div
      ),
      earnedPremium:
        exposureBase === 'premium'
          ? rawSlice.earnedPremium.map((p) => p / div)
          : rawSlice.earnedPremium,
    };
  }, [
    dataSourceMode,
    factStore,
    valuationMonth,
    granularity,
    segmentFilters,
    analysisMetric,
    exposureBase,
    customSinglePreset,
    displayUnitSpec.divisor,
  ]);

  const currentOverrides = useMemo(() => {
    const existing = sliceOverridesMap[activePivotedSlice.sliceKey];
    const n = activePivotedSlice.originCodes.length;
    const m = activePivotedSlice.devPeriods.length;
    if (
      existing &&
      existing.exclusions.length === n &&
      (existing.exclusions[0]?.length ?? 0) === Math.max(0, m - 1)
    ) {
      return existing;
    }
    return makeDefaultOverrides(n, m);
  }, [sliceOverridesMap, activePivotedSlice]);

  const actuarialInput: ActuarialInput = useMemo(
    () => ({
      originYears: activePivotedSlice.originCodes,
      devPeriods: activePivotedSlice.devPeriods,
      cumulativeTriangle: activePivotedSlice.cumulativeTriangle,
      earnedPremium:
        currentOverrides.earnedPremiumOverrides ??
        activePivotedSlice.earnedPremium,
      aprioriElr:
        currentOverrides.aprioriElrOverrides ?? activePivotedSlice.aprioriElr,
      exclusions: currentOverrides.exclusions,
      selectedLdfMode: currentOverrides.selectedLdfMode,
      manualLdfs: currentOverrides.manualLdfs,
      tailFactor: currentOverrides.tailFactor,
      selectedMethods: currentOverrides.selectedMethods,
      methodWeights: currentOverrides.methodWeights,
    }),
    [activePivotedSlice, currentOverrides]
  );

  const evaluation = useMemo(
    () => evaluateActuarialModel(actuarialInput),
    [actuarialInput]
  );

  const pydAnalysis = useMemo(
    () =>
      computePriorYearDevelopmentAndRollup(
        factStore,
        activePivotedSlice,
        evaluation,
        pydConfig,
        displayUnitSpec.divisor
      ),
    [
      factStore,
      activePivotedSlice,
      evaluation,
      pydConfig,
      displayUnitSpec.divisor,
    ]
  );

  const bootstrapResult = useMemo(
    () =>
      runOdpBootstrapSimulation(
        actuarialInput,
        bootstrapParams.iterations,
        bootstrapParams.seed
      ),
    [actuarialInput, bootstrapParams.iterations, bootstrapParams.seed]
  );

  const currencySymbol = useMemo(() => {
    if (analysisMetric === 'claim_count') return '';
    return displayUnitSpec.symbol;
  }, [analysisMetric, displayUnitSpec.symbol]);

  const activeSliceLabel = useMemo(() => {
    if (dataSourceMode !== 'multi_segment') {
      if (dataSourceMode === 'custom_single' && customSinglePreset) {
        return customSinglePreset.name;
      }
      const preset = DATASET_PRESETS.find((p) => p.id === dataSourceMode);
      return preset?.name ?? TAYLOR_ASHE_1983.name;
    }
    const activeParts: string[] = [];
    for (const k of availableDimensions.dimensionKeys) {
      const val =
        segmentFilters[k] ??
        (k === 'Product'
          ? segmentFilters.product
          : k === 'Channel'
          ? segmentFilters.channel
          : k === 'Coverage'
          ? segmentFilters.coverage
          : k === 'Region'
          ? segmentFilters.region
          : 'ALL');
      if (val && val !== 'ALL') {
        activeParts.push(val);
      }
    }
    const segDesc =
      activeParts.length > 0
        ? activeParts.join(' × ')
        : `All Portfolio Segments Combined`;
    const granLabel =
      activePivotedSlice.granularity === 'annual_fy'
        ? 'ANNUAL FY (Apr–Mar)'
        : activePivotedSlice.granularity.toUpperCase();
    return `${segDesc} (${activePivotedSlice.valuationMonth} · ${granLabel})`;
  }, [
    dataSourceMode,
    customSinglePreset,
    availableDimensions.dimensionKeys,
    segmentFilters,
    activePivotedSlice.valuationMonth,
    activePivotedSlice.granularity,
  ]);

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([
    {
      id: 'init-multi-1',
      timestamp: '09:00:00',
      actionType: 'DATASET_LOAD',
      title: 'Loaded Multi-Segment Monthly Portfolio (2026-10 Close)',
      detail:
        'Aggregated 8 Product × Channel × Coverage × Region segments with Prior Year Development (PYD) baseline.',
      previousIbnr: 38150361,
      newIbnr: 38150361,
      deltaIbnr: 0,
    },
  ]);

  const updateCurrentSliceOverrides = useCallback(
    (
      updater: (prev: SliceParameterOverrides) => SliceParameterOverrides,
      actionType: AuditLogEntry['actionType'],
      title: string,
      detail: string
    ) => {
      const prevIbnr = evaluation.totals.selectedIbnr;
      const nextOverrides = updater(currentOverrides);
      const key = activePivotedSlice.sliceKey;

      setSliceOverridesMap((prev) => ({
        ...prev,
        [key]: nextOverrides,
      }));

      const nextInput: ActuarialInput = {
        originYears: activePivotedSlice.originCodes,
        devPeriods: activePivotedSlice.devPeriods,
        cumulativeTriangle: activePivotedSlice.cumulativeTriangle,
        earnedPremium:
          nextOverrides.earnedPremiumOverrides ??
          activePivotedSlice.earnedPremium,
        aprioriElr:
          nextOverrides.aprioriElrOverrides ?? activePivotedSlice.aprioriElr,
        exclusions: nextOverrides.exclusions,
        selectedLdfMode: nextOverrides.selectedLdfMode,
        manualLdfs: nextOverrides.manualLdfs,
        tailFactor: nextOverrides.tailFactor,
        selectedMethods: nextOverrides.selectedMethods,
        methodWeights: nextOverrides.methodWeights,
      };

      const nextEval = evaluateActuarialModel(nextInput);
      const nextIbnr = nextEval.totals.selectedIbnr;
      const timestamp = new Date().toTimeString().slice(0, 8);

      setAuditLogs((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp,
          actionType,
          title,
          detail,
          previousIbnr: prevIbnr,
          newIbnr: nextIbnr,
          deltaIbnr: nextIbnr - prevIbnr,
        },
        ...prev,
      ]);

      fetch('/api/reserving/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextInput),
      }).catch(() => {});
    },
    [evaluation, currentOverrides, activePivotedSlice]
  );

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', nextDark);
    }
  };

  // Handlers for Triangle & LDF Controls
  const handleToggleCellExclusion = (originIdx: number, devIdx: number) => {
    const wasExcluded = currentOverrides.exclusions[originIdx]?.[devIdx] ?? false;
    const ratio = evaluation.linkRatios[originIdx]?.[devIdx];
    const originLabel =
      activePivotedSlice.originLabels[originIdx] ??
      `${activePivotedSlice.originCodes[originIdx]}`;
    const devLabel = `${activePivotedSlice.devPeriods[devIdx]}–${activePivotedSlice.devPeriods[devIdx + 1]}m`;

    updateCurrentSliceOverrides(
      (prev) => ({
        ...prev,
        exclusions: prev.exclusions.map((row, rIdx) =>
          rIdx === originIdx
            ? row.map((v, cIdx) => (cIdx === devIdx ? !v : v))
            : [...row]
        ),
      }),
      'CELL_EXCLUSION',
      wasExcluded
        ? `Restored Cell (${originLabel}, ${devLabel})`
        : `Excluded Outlier Cell (${originLabel}, ${devLabel})`,
      `Link Ratio f = ${ratio ? ratio.toFixed(4) : 'N/A'} ${wasExcluded ? 'restored to' : 'masked from'} LDF calculation.`
    );
  };

  const handleClearAllExclusions = () => {
    updateCurrentSliceOverrides(
      (prev) => ({
        ...prev,
        exclusions: prev.exclusions.map((row) => row.map(() => false)),
      }),
      'CELL_EXCLUSION',
      'Restored All Excluded Link-Ratio Cells',
      'Cleared all outlier cell masks in the active segment slice.'
    );
  };

  const handleSelectLdfMode = (mode: LdfSelectionMode) => {
    updateCurrentSliceOverrides(
      (prev) => ({
        ...prev,
        selectedLdfMode: mode,
        manualLdfs: new Array(activePivotedSlice.devPeriods.length - 1).fill(
          null
        ),
      }),
      'LDF_MODE_CHANGE',
      `Switched LDF Basis to ${mode.toUpperCase()}`,
      `Updated Age-to-Age average selection to ${mode}.`
    );
  };

  const handleManualLdfChange = (devIdx: number, value: number | null) => {
    const devLabel = `${activePivotedSlice.devPeriods[devIdx]}–${activePivotedSlice.devPeriods[devIdx + 1]}m`;
    updateCurrentSliceOverrides(
      (prev) => {
        const nextManual = [...prev.manualLdfs];
        nextManual[devIdx] = value;
        return { ...prev, manualLdfs: nextManual };
      },
      'MANUAL_LDF_OVERRIDE',
      `Overrode Selected LDF (${devLabel})`,
      `Set manual LDF at ${devLabel} to ${value?.toFixed(4) ?? 'default'}.`
    );
  };

  const handleResetManualLdfs = () => {
    updateCurrentSliceOverrides(
      (prev) => ({
        ...prev,
        manualLdfs: new Array(activePivotedSlice.devPeriods.length - 1).fill(
          null
        ),
      }),
      'MANUAL_LDF_OVERRIDE',
      'Reset Manual LDF Overrides',
      `Reverted all development columns to ${currentOverrides.selectedLdfMode} averages.`
    );
  };

  const handleTailFactorChange = (newTail: number, modelLabel?: string) => {
    updateCurrentSliceOverrides(
      (prev) => ({
        ...prev,
        tailFactor: newTail,
      }),
      'TAIL_FACTOR_CHANGE',
      modelLabel ? `Applied ${modelLabel} Tail Factor` : 'Updated Tail Factor',
      `Tail Factor updated to ${newTail.toFixed(4)}.`
    );
  };

  const handleUpdateElr = (originIdx: number, newElr: number) => {
    const originLabel =
      activePivotedSlice.originLabels[originIdx] ??
      `${activePivotedSlice.originCodes[originIdx]}`;
    updateCurrentSliceOverrides(
      (prev) => {
        const base = [
          ...(prev.aprioriElrOverrides ?? activePivotedSlice.aprioriElr),
        ];
        base[originIdx] = newElr;
        return { ...prev, aprioriElrOverrides: base };
      },
      'ELR_EDIT',
      `Updated A Priori ELR (${originLabel})`,
      `Changed A Priori ELR to ${(newElr * 100).toFixed(1)}%.`
    );
  };

  const handleUpdateEarnedPremium = (originIdx: number, newPrem: number) => {
    const originLabel =
      activePivotedSlice.originLabels[originIdx] ??
      `${activePivotedSlice.originCodes[originIdx]}`;
    updateCurrentSliceOverrides(
      (prev) => {
        const base = [
          ...(prev.earnedPremiumOverrides ?? activePivotedSlice.earnedPremium),
        ];
        base[originIdx] = newPrem;
        return { ...prev, earnedPremiumOverrides: base };
      },
      'ELR_EDIT',
      `Updated Earned Premium (${originLabel})`,
      `Changed Earned Premium to ${formatCurrency(newPrem, currencySymbol)}.`
    );
  };

  const handleSelectOriginMethod = (
    originIdx: number,
    method: ReserveMethodType
  ) => {
    const originLabel =
      activePivotedSlice.originLabels[originIdx] ??
      `${activePivotedSlice.originCodes[originIdx]}`;
    updateCurrentSliceOverrides(
      (prev) => {
        const nextMethods = [...prev.selectedMethods];
        nextMethods[originIdx] = method;
        const nextWeights = [...prev.methodWeights];
        nextWeights[originIdx] =
          method === 'BLEND'
            ? { cl: 0.5, bf: 0.3, cc: 0.2 }
            : {
                cl: method === 'CL' ? 1 : 0,
                bf: method === 'BF' ? 1 : 0,
                cc: method === 'CC' ? 1 : 0,
              };
        return {
          ...prev,
          selectedMethods: nextMethods,
          methodWeights: nextWeights,
        };
      },
      'METHOD_SELECTION',
      `Selected ${method} Method (${originLabel})`,
      `Switched Origin Cohort ${originLabel} reserving methodology to ${method}.`
    );
  };

  const handleApplyUniformMethod = (method: ReserveMethodType) => {
    const n = activePivotedSlice.originCodes.length;
    updateCurrentSliceOverrides(
      (prev) => ({
        ...prev,
        selectedMethods: new Array(n).fill(method),
        methodWeights: Array.from({ length: n }, () =>
          method === 'BLEND'
            ? { cl: 0.5, bf: 0.3, cc: 0.2 }
            : {
                cl: method === 'CL' ? 1 : 0,
                bf: method === 'BF' ? 1 : 0,
                cc: method === 'CC' ? 1 : 0,
              }
        ),
      }),
      'METHOD_SELECTION',
      `Bulk Assigned ${method} Across All Cohorts`,
      `Applied uniform ${method} methodology to all ${n} cohorts in slice.`
    );
  };

  const handleUpdateMethodWeights = (
    originIdx: number,
    weights: MethodWeights
  ) => {
    const originLabel =
      activePivotedSlice.originLabels[originIdx] ??
      `${activePivotedSlice.originCodes[originIdx]}`;
    updateCurrentSliceOverrides(
      (prev) => {
        const nextWeights = [...prev.methodWeights];
        nextWeights[originIdx] = weights;
        return { ...prev, methodWeights: nextWeights };
      },
      'METHOD_SELECTION',
      `Adjusted Blend Weights (${originLabel})`,
      `Weights set to CL ${(weights.cl * 100).toFixed(0)}% / BF ${(weights.bf * 100).toFixed(0)}% / CC ${(weights.cc * 100).toFixed(0)}%.`
    );
  };

  const handleRunAutoOptimize = () => {
    const rec = runAutoOptimizeReserve(actuarialInput);
    fetch('/api/reserving/auto-optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actuarialInput),
    }).catch(() => {});

    setAutoOptimizeBanner(rec.summaryRationale);
    updateCurrentSliceOverrides(
      (prev) => ({
        ...prev,
        exclusions: rec.newExclusions,
        selectedLdfMode: rec.recommendedLdfMode,
        manualLdfs: new Array(activePivotedSlice.devPeriods.length - 1).fill(
          null
        ),
        tailFactor: rec.recommendedTailFactor,
        selectedMethods: rec.recommendedMethods,
        methodWeights: rec.recommendedWeights,
      }),
      'AUTO_OPTIMIZE',
      'Executed Auto-Optimize Reserve (Machine-Led Reserving)',
      rec.summaryRationale
    );
  };

  const handleResetSliceBaseline = () => {
    const n = activePivotedSlice.originCodes.length;
    const m = activePivotedSlice.devPeriods.length;
    setAutoOptimizeBanner(null);
    updateCurrentSliceOverrides(
      () => makeDefaultOverrides(n, m),
      'DATASET_LOAD',
      'Reset Active Slice Parameters',
      'Restored active segment slice to zero exclusions, VW All LDFs, Tail = 1.0000, and Chain Ladder.'
    );
  };

  const pydBadge = formatSignedDelta(
    pydAnalysis.priorTotals.priorYearDevelopment,
    currencySymbol
  );

  // Determine Valuation dropdown options (either default 2025-12..2026-10 or custom snapshots in factStore)
  const valuationSelectOptions = useMemo(() => {
    const storeMonths = availableDimensions.valuationMonths;
    const isDefaultSet = storeMonths.some((m) => m === '2026-10');
    if (isDefaultSet) {
      return VALUATION_MONTH_OPTIONS;
    }
    return storeMonths.map((m) => ({
      id: m,
      label: `${m} (Loaded CSV Snapshot)`,
      elapsedMonthsIn2026: 12,
    }));
  }, [availableDimensions.valuationMonths]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Bar Contract: Strictly 3 Zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-30">
        {/* Zone 1: Single text element Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('triangle');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          AuraReserve
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label="Primary Workspace Navigation"
          className="flex items-center gap-6 overflow-x-auto text-sm font-medium text-slate-600 dark:text-slate-400"
        >
          {(
            [
              { key: 'triangle', label: 'Triangle & LDFs' },
              { key: 'methods', label: 'Method Comparison' },
              { key: 'pyd_segments', label: 'PYD & Segments' },
              { key: 'diagnostics', label: 'Diagnostics & Tail' },
              { key: 'stochastic', label: 'Stochastic & IFRS 17' },
            ] as const
          ).map((nav) => {
            const isActive = activeTab === nav.key;
            return (
              <button
                key={nav.key}
                type="button"
                onClick={() => setActiveTab(nav.key)}
                className={`py-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 border-b-2 ${
                  isActive
                    ? 'border-sky-600 dark:border-sky-400 text-slate-950 dark:text-white font-semibold'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {nav.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action Button */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleRunAutoOptimize}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Auto-Optimize Reserve (AI推奨)
          </button>
        </div>
      </header>

      {/* Multi-Segment Dynamic Slicer & Monthly/Quarterly/Annual CY/FY Granularity Bar */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/95 px-6 py-2.5">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Left: Data Mode, Valuation Month & 4-Mode Granularity Switcher */}
          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor="data-source-select" className="sr-only">
              Select Portfolio Mode or Benchmark Dataset
            </label>
            <select
              id="data-source-select"
              value={dataSourceMode}
              onChange={(e) => setDataSourceMode(e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="multi_segment">
                Multi-Segment Portfolio ({availableDimensions.dimensionKeys.join(' × ')})
              </option>
              {DATASET_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  Benchmark: {p.name}
                </option>
              ))}
              {customSinglePreset && (
                <option value="custom_single">
                  {customSinglePreset.name}
                </option>
              )}
            </select>

            {dataSourceMode === 'multi_segment' && (
              <>
                {/* Valuation Month Selector */}
                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="valuation-month-select"
                    className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap"
                  >
                    Valuation:
                  </label>
                  <select
                    id="valuation-month-select"
                    value={activePivotedSlice.valuationMonth}
                    onChange={(e) =>
                      setValuationMonth(e.target.value as ValuationMonthId)
                    }
                    className="text-xs font-mono tabular-nums px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {valuationSelectOptions.map((vm) => (
                      <option key={vm.id} value={vm.id}>
                        {vm.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4-Mode Granularity Switcher (Annual CY | Annual FY Apr-Mar | Quarterly 3m | Monthly 1m) */}
                <div
                  role="group"
                  aria-label="Triangle Time Granularity"
                  className="inline-flex items-center gap-0.5 p-0.5 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300/80 dark:border-slate-700"
                >
                  {(
                    [
                      { key: 'annual', label: 'Annual CY (暦年)' },
                      { key: 'annual_fy', label: 'Annual FY (4月年度)' },
                      { key: 'quarterly', label: 'Quarterly (3m)' },
                      { key: 'monthly', label: 'Monthly (1m)' },
                    ] as const
                  ).map((g) => {
                    const isSupported =
                      availableDimensions.granularities.includes(g.key);
                    if (!isSupported) return null;
                    return (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => {
                          setGranularity(g.key);
                          setPydConfig({
                            priorCutoffOriginCode: null,
                            baselineDiagonalStepsBack: null,
                          });
                        }}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          activePivotedSlice.granularity === g.key
                            ? 'bg-sky-600 text-white shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {g.label}
                      </button>
                    );
                  })}
                </div>

                {/* Multi-Metric Switcher (Paid | Incurred | Count | Severity) */}
                <div
                  role="group"
                  aria-label="Triangle Analysis Metric"
                  className="inline-flex items-center gap-0.5 p-0.5 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300/80 dark:border-slate-700"
                >
                  {(
                    [
                      { key: 'paid', label: 'Paid (支払)' },
                      { key: 'incurred', label: 'Incurred (発生)' },
                      { key: 'claim_count', label: 'Count (件数)' },
                      { key: 'severity', label: 'Severity (単価)' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setAnalysisMetric(m.key)}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        analysisMetric === m.key
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Denominator Base Switcher (Earned Premium | Earned Exposure) */}
                <div
                  role="group"
                  aria-label="Exposure Denominator Base"
                  className="inline-flex items-center gap-0.5 p-0.5 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300/80 dark:border-slate-700"
                >
                  {(
                    [
                      { key: 'premium', label: 'Base: 保険料' },
                      { key: 'exposure', label: 'Base: 契約件数' },
                    ] as const
                  ).map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setExposureBase(b.key)}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        exposureBase === b.key
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>

                {/* Display Currency & Unit Scale Switcher ($ USD | ¥ 円 | ¥ 千円 | ¥ 百万円 | ¥ 億円) */}
                <div className="flex items-center gap-1">
                  <label htmlFor="display-unit-select" className="sr-only">
                    Display Currency & Unit Scale
                  </label>
                  <select
                    id="display-unit-select"
                    aria-label="Display Currency & Unit Scale"
                    value={displayUnitId}
                    onChange={(e) =>
                      setDisplayUnitId(e.target.value as DisplayUnitId)
                    }
                    className="text-xs font-mono font-semibold px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {DISPLAY_UNIT_OPTIONS.map((u) => (
                      <option key={u.id} value={u.id}>
                        Unit: {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Button to open Interactive Local CSV / Excel Schema Mapper */}
            <button
              type="button"
              onClick={() => {
                setSchemaMapperMode('loss');
                setIsSchemaMapperOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded border border-sky-500/40 bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors cursor-pointer whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Map Local CSV (社内CSV列設定)
            </button>

            {/* Quick Button to open Separate Premium / Exposure Join Tab */}
            <button
              type="button"
              onClick={() => {
                setSchemaMapperMode('separate_premium');
                setIsSchemaMapperOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Link2 className="w-3.5 h-3.5" />
              + Join Premium (別ファイル保険料結合)
            </button>
          </div>

          {/* Right: Dynamic N-Column Segment Slicers (Automatically adapts to any CSV columns) */}
          {dataSourceMode === 'multi_segment' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                <Filter className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                Segment Slicer:
              </span>

              {availableDimensions.dimensionKeys.map((dimKey) => {
                const values = availableDimensions.dimensionValues[dimKey] ?? [];
                const legacyKey =
                  dimKey === 'Product'
                    ? 'product'
                    : dimKey === 'Channel'
                    ? 'channel'
                    : dimKey === 'Coverage'
                    ? 'coverage'
                    : dimKey === 'Region'
                    ? 'region'
                    : null;
                const currentVal =
                  segmentFilters[dimKey] ??
                  (legacyKey ? segmentFilters[legacyKey] : 'ALL') ??
                  'ALL';

                return (
                  <select
                    key={dimKey}
                    aria-label={`Filter by ${dimKey} Segment`}
                    value={currentVal}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSegmentFilters((prev) => ({
                        ...prev,
                        [dimKey]: val,
                        ...(legacyKey ? { [legacyKey]: val } : {}),
                      }));
                    }}
                    className="text-xs px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 max-w-[180px] truncate"
                  >
                    <option value="ALL">All {dimKey} (全合算)</option>
                    {values.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Executive KPI & Utility Strip */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 px-6 py-2.5">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs">
          {/* Left: Unboxed Active Slice Metadata */}
          <div className="flex flex-wrap items-center gap-2 text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {activeSliceLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {activePivotedSlice.matchedSegmentCount} Segment(s) Aggregated
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Origins: {activePivotedSlice.originLabels[0]}–
              {
                activePivotedSlice.originLabels[
                  activePivotedSlice.originLabels.length - 1
                ]
              }
            </span>
            <span aria-hidden="true">·</span>
            <span>Tail: {formatLdf(evaluation.tailFactor, 4)}</span>
          </div>

          {/* Right: Live Reserve, Dynamic PYD & Utility Controls */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
              <div>
                <span className="text-slate-500 dark:text-slate-400 mr-1">
                  Selected IBNR:
                </span>
                <strong
                  data-testid="kpi-selected-ibnr"
                  className="text-sm font-bold text-sky-700 dark:text-sky-300"
                >
                  {formatCurrency(
                    Math.round(evaluation.totals.selectedIbnr),
                    currencySymbol
                  )}
                </strong>
              </div>

              <span className="text-slate-300 dark:text-slate-700">·</span>

              <div>
                <span className="text-slate-500 dark:text-slate-400 mr-1">
                  PYD ({pydAnalysis.priorCutoffLabel}):
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('pyd_segments')}
                  className={`font-bold underline cursor-pointer ${
                    pydAnalysis.priorTotals.priorYearDevelopment > 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {pydBadge.text} (
                  {formatPercent(
                    pydAnalysis.priorTotals.pydPctOf2025Reserve,
                    1
                  )}
                  )
                </button>
              </div>

              <span className="hidden md:inline text-slate-300 dark:text-slate-700">
                ·
              </span>

              <div className="hidden md:block">
                <span className="text-slate-500 dark:text-slate-400 mr-1">
                  Mack SE:
                </span>
                <strong className="text-slate-900 dark:text-slate-100">
                  {formatCurrency(
                    Math.round(evaluation.totals.mackTotalSe),
                    currencySymbol
                  )}{' '}
                  (
                  {evaluation.totals.mackTotalCv !== null
                    ? formatPercent(evaluation.totals.mackTotalCv, 1)
                    : '—'}
                  )
                </strong>
              </div>
            </div>

            <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-3">
              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'audit'
                    ? 'border-sky-500 bg-sky-600 text-white'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                CSV & Audit Memo
              </button>

              <button
                type="button"
                onClick={handleResetSliceBaseline}
                title="Reset active slice parameters"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>

              <button
                type="button"
                onClick={() => setShowAuditDrawer((prev) => !prev)}
                aria-label="Toggle Audit Trail Panel"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  showAuditDrawer
                    ? 'border-sky-500/40 bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-200'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <PanelRight className="w-3.5 h-3.5" />
                Audit ({auditLogs.length})
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                aria-label={
                  isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'
                }
                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                {isDark ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-700" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Auto-Optimize Notification Banner */}
      {autoOptimizeBanner && (
        <div className="bg-sky-950 text-sky-100 border-b border-sky-800 px-6 py-2.5 text-xs">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
            <div>
              <strong className="font-semibold text-sky-300 mr-2">
                Machine-Led Auto-Optimize Active:
              </strong>
              <span>{autoOptimizeBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setAutoOptimizeBanner(null)}
              className="text-sky-300 hover:text-white underline cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area + Right Audit Trail Sidebar */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-6 py-6 flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 w-full">
          {activeTab === 'triangle' && (
            <TriangleWorkspace
              evaluation={evaluation}
              originLabels={activePivotedSlice.originLabels}
              currencySymbol={currencySymbol}
              selectedLdfMode={actuarialInput.selectedLdfMode}
              manualLdfs={actuarialInput.manualLdfs}
              onToggleCellExclusion={handleToggleCellExclusion}
              onSelectLdfMode={handleSelectLdfMode}
              onManualLdfChange={handleManualLdfChange}
              onResetManualLdfs={handleResetManualLdfs}
              onTailFactorChange={(tail) => handleTailFactorChange(tail)}
              onClearAllExclusions={handleClearAllExclusions}
              onOpenTailFitting={() => setActiveTab('diagnostics')}
            />
          )}

          {activeTab === 'methods' && (
            <MethodComparisonView
              evaluation={evaluation}
              originLabels={activePivotedSlice.originLabels}
              currencySymbol={currencySymbol}
              onUpdateElr={handleUpdateElr}
              onUpdateEarnedPremium={handleUpdateEarnedPremium}
              onSelectOriginMethod={handleSelectOriginMethod}
              onApplyUniformMethod={handleApplyUniformMethod}
              onUpdateMethodWeights={handleUpdateMethodWeights}
            />
          )}

          {activeTab === 'pyd_segments' && (
            <PriorYearDevAndSegmentsView
              pydAnalysis={pydAnalysis}
              pydConfig={pydConfig}
              onUpdatePydConfig={setPydConfig}
              activeFilters={segmentFilters}
              currencySymbol={currencySymbol}
              onSelectSegmentSlice={(newFilters, openTriangle) => {
                setDataSourceMode('multi_segment');
                setSegmentFilters(newFilters);
                if (openTriangle) {
                  setActiveTab('triangle');
                }
              }}
            />
          )}

          {activeTab === 'diagnostics' && (
            <DiagnosticsAndTailView
              evaluation={evaluation}
              currencySymbol={currencySymbol}
              onApplyTailFactor={(tail, label) =>
                handleTailFactorChange(tail, label)
              }
            />
          )}

          {activeTab === 'stochastic' && (
            <StochasticBootstrapView
              evaluation={evaluation}
              bootstrap={bootstrapResult}
              currencySymbol={currencySymbol}
              isSimulating={isSimulating}
              onRunSimulation={(iterations, seed) => {
                setIsSimulating(true);
                setBootstrapParams({ iterations, seed });
                fetch('/api/reserving/bootstrap', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    input: actuarialInput,
                    iterations,
                    seed,
                  }),
                })
                  .catch(() => {})
                  .finally(() => setIsSimulating(false));
              }}
            />
          )}

          {activeTab === 'audit' && (
            <AuditAndReportView
              datasetName={activeSliceLabel}
              currencySymbol={currencySymbol}
              unitLabel={displayUnitSpec.label}
              originLabels={activePivotedSlice.originLabels}
              factRecords={factStore}
              evaluation={evaluation}
              bootstrap={bootstrapResult}
              pydAnalysis={pydAnalysis}
              auditLogs={auditLogs}
              onImportCustomCsv={(parsed, title) => {
                setCustomSinglePreset({
                  id: 'custom_single',
                  name: title,
                  subtitle: 'Custom Uploaded Matrix Triangle',
                  currency: '$',
                  unitLabel: 'USD',
                  originYears: parsed.originYears,
                  devPeriods: parsed.devPeriods,
                  cumulativeTriangle: parsed.cumulativeTriangle,
                  earnedPremium: parsed.earnedPremium,
                  aprioriElr: parsed.aprioriElr,
                });
                setDataSourceMode('custom_single');
                setActiveTab('triangle');
              }}
              onImportMultiSegmentCsv={(newRecords, summaryText) => {
                const prevIbnr = evaluation.totals.selectedIbnr;
                setFactStore(newRecords);
                setDataSourceMode('multi_segment');
                setSegmentFilters({
                  product: 'ALL',
                  channel: 'ALL',
                  coverage: 'ALL',
                  region: 'ALL',
                });
                setPydConfig({
                  priorCutoffOriginCode: null,
                  baselineDiagonalStepsBack: null,
                });
                setAuditLogs((prev) => [
                  {
                    id: `${Date.now()}`,
                    timestamp: new Date().toTimeString().slice(0, 8),
                    actionType: 'DATASET_LOAD',
                    title: 'Ingested Monthly Multi-Segment CSV Dataset',
                    detail: summaryText,
                    previousIbnr: prevIbnr,
                    newIbnr: prevIbnr,
                    deltaIbnr: 0,
                  },
                  ...prev,
                ]);
                setActiveTab('pyd_segments');
              }}
              onOpenUniversalMapper={() => {
                setSchemaMapperMode('loss');
                setIsSchemaMapperOpen(true);
              }}
            />
          )}
        </div>

        {/* Persistent Right-Hand Governance & Audit Trail Panel */}
        {showAuditDrawer && (
          <AuditTrailSidebar
            logs={auditLogs}
            currencySymbol={currencySymbol}
            onClearLogs={() => setAuditLogs([])}
          />
        )}
      </main>

      {/* Interactive Local CSV / Excel Schema Mapper & Separate Premium Join Modal */}
      <CsvSchemaMapperModal
        isOpen={isSchemaMapperOpen}
        initialMode={schemaMapperMode}
        existingRecords={factStore}
        onClose={() => setIsSchemaMapperOpen(false)}
        onIngestMappedDataset={({
          records,
          summaryText,
          valuationLabel,
          availableGranularities,
        }) => {
          const prevIbnr = evaluation.totals.selectedIbnr;
          setFactStore(records);
          setDataSourceMode('multi_segment');
          setValuationMonth(valuationLabel);
          // Switch display unit to JPY (円) automatically when Japanese dataset is loaded
          if (
            /[\u3040-\u30ff\u4e00-\u9faf]/.test(summaryText) ||
            /[\u3040-\u30ff\u4e00-\u9faf]/.test(valuationLabel)
          ) {
            if (displayUnitId === 'usd') {
              setDisplayUnitId('jpy_1');
            }
          }
          if (availableGranularities.length > 0) {
            setGranularity(
              availableGranularities.includes('annual_fy')
                ? 'annual_fy'
                : availableGranularities[0]
            );
          }
          setSegmentFilters({
            product: 'ALL',
            channel: 'ALL',
            coverage: 'ALL',
            region: 'ALL',
          });
          setPydConfig({
            priorCutoffOriginCode: null,
            baselineDiagonalStepsBack: null,
          });
          setAuditLogs((prev) => [
            {
              id: `${Date.now()}`,
              timestamp: new Date().toTimeString().slice(0, 8),
              actionType: 'DATASET_LOAD',
              title: 'Mapped & Rolled Up Custom Multi-Segment Dataset (Local)',
              detail: summaryText,
              previousIbnr: prevIbnr,
              newIbnr: prevIbnr,
              deltaIbnr: 0,
            },
            ...prev,
          ]);
          setActiveTab('pyd_segments');
        }}
        onJoinSeparatePremiumDataset={({ updatedRecords, summaryText }) => {
          const prevIbnr = evaluation.totals.selectedIbnr;
          setFactStore(updatedRecords);
          setDataSourceMode('multi_segment');
          setAuditLogs((prev) => [
            {
              id: `${Date.now()}-prem-join`,
              timestamp: new Date().toTimeString().slice(0, 8),
              actionType: 'DATASET_LOAD',
              title: 'Joined Separate Premium & Exposure Dataset',
              detail: summaryText,
              previousIbnr: prevIbnr,
              newIbnr: prevIbnr,
              deltaIbnr: 0,
            },
            ...prev,
          ]);
          setActiveTab('pyd_segments');
        }}
      />
    </div>
  );
}
