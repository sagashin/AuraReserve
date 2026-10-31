'use client';

import React from 'react';
import {
  PriorYearDevelopmentAnalysis,
  PydConfiguration,
  SegmentFilterState,
} from '@/lib/segment-pyd-engine';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedDelta,
} from '@/lib/formatters';
import {
  TrendingDown,
  TrendingUp,
  Layers,
  ArrowUpRight,
  SlidersHorizontal,
} from 'lucide-react';

interface PriorYearDevAndSegmentsViewProps {
  pydAnalysis: PriorYearDevelopmentAnalysis;
  pydConfig: PydConfiguration;
  onUpdatePydConfig: (nextConfig: PydConfiguration) => void;
  activeFilters: SegmentFilterState;
  currencySymbol: string;
  onSelectSegmentSlice: (
    filters: SegmentFilterState,
    openTriangleTab?: boolean
  ) => void;
}

export default function PriorYearDevAndSegmentsView({
  pydAnalysis,
  pydConfig,
  onUpdatePydConfig,
  activeFilters,
  currencySymbol,
  onSelectSegmentSlice,
}: PriorYearDevAndSegmentsViewProps) {
  const {
    priorTotals,
    currentYear2026Totals,
    cohortRows,
    segmentRollupRows,
    currentValuationLabel,
    baselineValuationLabel,
    priorCutoffOriginCode,
    priorCutoffLabel,
    baselineStepsBack,
    availableCutoffOrigins,
    availableBaselineSteps,
  } = pydAnalysis;

  const isAdverseTotal = priorTotals.priorYearDevelopment > 0;
  const pydSign = formatSignedDelta(
    priorTotals.priorYearDevelopment,
    currencySymbol
  );
  const aveSign = formatSignedDelta(priorTotals.aveEmergenceDiff, currencySymbol);

  const priorCohorts = cohortRows.filter((r) => r.isPriorYear);
  const newCohorts = cohortRows.filter((r) => !r.isPriorYear);
  const newCohortsLabel =
    newCohorts.length > 0
      ? newCohorts.map((c) => c.originLabel).join(', ')
      : 'Current New Cohort';

  // Diverging bar scale (works across all display units from raw Yen to 億円)
  const maxAbsCohortPyd = Math.max(
    1e-6,
    ...priorCohorts.map((c) => Math.abs(c.priorYearDevelopment))
  );

  // Reserve Roll-Forward Waterfall Steps
  const wfStart2025Ibnr = priorTotals.ibnr2025End;
  const wfAfterEmergence = wfStart2025Ibnr - priorTotals.actual2026Emergence;
  const wfPriorRemainingIbnr = priorTotals.ibnr2026Current;
  const wfFinalTotalIbnr =
    wfPriorRemainingIbnr + currentYear2026Totals.ibnr2026Current;

  const wfMaxScale = Math.max(
    1,
    wfStart2025Ibnr,
    wfFinalTotalIbnr,
    wfStart2025Ibnr + Math.max(0, priorTotals.priorYearDevelopment)
  );

  // Dynamic segment dimension keys from the first rollup row
  const dynamicDimKeys =
    segmentRollupRows.length > 0
      ? Object.keys(segmentRollupRows[0].dimensions)
      : ['Product', 'Channel', 'Coverage', 'Region'];

  return (
    <div className="space-y-6">
      {/* Interactive PYD Baseline & Prior Year Cutoff Control Bar */}
      <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs">
          <SlidersHorizontal className="w-4 h-4 text-sky-500 shrink-0" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            PYD Evaluation Parameters (過年度ロス増減の基準年度・比較時点設定):
          </span>
          <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
            データの事故期間に応じて自動判定しつつ、任意の境界年度・遡及ステップへ変更可能
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="pyd-cutoff-select"
              className="font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap"
            >
              Prior Year Cutoff (過年度上限):
            </label>
            <select
              id="pyd-cutoff-select"
              value={priorCutoffOriginCode}
              onChange={(e) =>
                onUpdatePydConfig({
                  ...pydConfig,
                  priorCutoffOriginCode: Number(e.target.value),
                })
              }
              className="font-mono tabular-nums px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {availableCutoffOrigins.map((o) => (
                <option key={o.code} value={o.code}>
                  ≤ {o.label} (Prior Cohorts)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label
              htmlFor="pyd-baseline-step-select"
              className="font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap"
            >
              Comparison Baseline (比較基準):
            </label>
            <select
              id="pyd-baseline-step-select"
              value={
                pydConfig.baselineDiagonalStepsBack == null
                  ? 'auto'
                  : String(pydConfig.baselineDiagonalStepsBack)
              }
              onChange={(e) => {
                const val = e.target.value;
                onUpdatePydConfig({
                  ...pydConfig,
                  baselineDiagonalStepsBack: val === 'auto' ? null : Number(val),
                });
              }}
              className="font-mono tabular-nums px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="auto">
                Auto Baseline ({baselineValuationLabel})
              </option>
              {availableBaselineSteps.map((s) => (
                <option key={s.stepsBack} value={s.stepsBack}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {(pydConfig.priorCutoffOriginCode != null ||
            pydConfig.baselineDiagonalStepsBack != null) && (
            <button
              type="button"
              onClick={() =>
                onUpdatePydConfig({
                  priorCutoffOriginCode: null,
                  baselineDiagonalStepsBack: null,
                })
              }
              className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Auto-Detect Reset
            </button>
          )}
        </div>
      </div>

      {/* Top 4 Executive PYD & Runoff KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          className={`p-4 rounded-lg border ${
            isAdverseTotal
              ? 'border-rose-500/40 bg-rose-50/40 dark:bg-rose-950/20'
              : 'border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
            <span>
              Prior Year Development ({priorCutoffLabel} 過年度ロス増減: PYD)
            </span>
            {isAdverseTotal ? (
              <TrendingUp className="w-4 h-4 text-rose-500 shrink-0" />
            ) : (
              <TrendingDown className="w-4 h-4 text-emerald-500 shrink-0" />
            )}
          </div>
          <div
            data-testid="pyd-headline-total"
            className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${
              isAdverseTotal
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {pydSign.text}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
            {isAdverseTotal
              ? 'Adverse / Reserve Deficiency (不足・積み増し)'
              : 'Favorable / Reserve Redundancy (余剰・戻入)'}{' '}
            · {formatPercent(priorTotals.pydPctOf2025Reserve, 1)} of Baseline IBNR
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Actual vs. Expected Emergence ({priorCutoffLabel} 過年度分AvE)
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {aveSign.text}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Actual: {formatCurrency(priorTotals.actual2026Emergence, currencySymbol)} · Expected:{' '}
            {formatCurrency(Math.round(priorTotals.expected2026Emergence), currencySymbol)}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Prior Years ({priorCutoffLabel}) Reserve Runoff
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(Math.round(priorTotals.ibnr2026Current), currencySymbol)}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Baseline IBNR: {formatCurrency(Math.round(priorTotals.ibnr2025End), currencySymbol)} ·
            ΔIBNR: {formatSignedDelta(priorTotals.ibnrChange2026, currencySymbol).text}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-sky-500/30 bg-sky-50/40 dark:bg-sky-950/20">
          <div className="text-xs font-medium text-sky-800 dark:text-sky-300">
            New Origin Cohort IBNR ({newCohortsLabel} 当年度新規発生備金)
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatCurrency(Math.round(currentYear2026Totals.ibnr2026Current), currencySymbol)}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-sky-700 dark:text-sky-300/80">
            New Ultimate: {formatCurrency(Math.round(currentYear2026Totals.ultimate2026Current), currencySymbol)}{' '}
            · Paid: {formatCurrency(Math.round(currentYear2026Totals.paid2026Current), currencySymbol)}
          </div>
        </div>
      </div>

      {/* Visual Row: Reserve Roll-Forward Waterfall + Origin Year PYD Diverging Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Reserve Roll-Forward Waterfall */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              01. {baselineValuationLabel} to {currentValuationLabel} Reserve Roll-Forward Waterfall
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Reconciles Prior Baseline IBNR ({baselineValuationLabel}) with Current Total IBNR ({currentValuationLabel}) via Emergence, PYD ({priorCutoffLabel}), and New Business ({newCohortsLabel})
            </p>
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox="0 0 600 225"
              className="w-full h-auto min-w-[460px]"
              role="img"
              aria-label="Reserve Roll-Forward Waterfall Chart"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
                const y = 24 + (1 - frac) * 145;
                return (
                  <line
                    key={idx}
                    x1={40}
                    y1={y}
                    x2={575}
                    y2={y}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-slate-800"
                    strokeDasharray="3 3"
                  />
                );
              })}

              {(() => {
                const chartTop = 24;
                const chartHeight = 145;
                const yForVal = (v: number) =>
                  chartTop + (1 - Math.max(0, v) / wfMaxScale) * chartHeight;

                const bars = [
                  {
                    x: 56,
                    label1: 'Baseline IBNR',
                    label2: baselineValuationLabel,
                    topVal: wfStart2025Ibnr,
                    botVal: 0,
                    displayVal: formatNumber(Math.round(wfStart2025Ibnr)),
                    color: '#475569',
                  },
                  {
                    x: 142,
                    label1: 'Paid Emergence',
                    label2: 'Paid Runoff (-)',
                    topVal: Math.max(wfStart2025Ibnr, wfAfterEmergence),
                    botVal: Math.min(wfStart2025Ibnr, wfAfterEmergence),
                    displayVal: `-${formatNumber(Math.round(priorTotals.actual2026Emergence))}`,
                    color: '#0284c7',
                  },
                  {
                    x: 228,
                    label1: 'PYD Impact',
                    label2: isAdverseTotal ? 'Adverse (+)' : 'Favorable (-)',
                    topVal: Math.max(wfAfterEmergence, wfPriorRemainingIbnr),
                    botVal: Math.min(wfAfterEmergence, wfPriorRemainingIbnr),
                    displayVal: `${isAdverseTotal ? '+' : ''}${formatNumber(Math.round(priorTotals.priorYearDevelopment))}`,
                    color: isAdverseTotal ? '#e11d48' : '#10b981',
                  },
                  {
                    x: 314,
                    label1: `${priorCutoffLabel} Rem IBNR`,
                    label2: currentValuationLabel,
                    topVal: wfPriorRemainingIbnr,
                    botVal: 0,
                    displayVal: formatNumber(Math.round(wfPriorRemainingIbnr)),
                    color: '#334155',
                  },
                  {
                    x: 400,
                    label1: '+New Cohort',
                    label2: newCohortsLabel,
                    topVal: wfFinalTotalIbnr,
                    botVal: wfPriorRemainingIbnr,
                    displayVal: `+${formatNumber(Math.round(currentYear2026Totals.ibnr2026Current))}`,
                    color: '#6366f1',
                  },
                  {
                    x: 486,
                    label1: 'Total Current IBNR',
                    label2: 'All Cohorts',
                    topVal: wfFinalTotalIbnr,
                    botVal: 0,
                    displayVal: formatNumber(Math.round(wfFinalTotalIbnr)),
                    color: '#0ea5e9',
                  },
                ];

                return bars.map((b, i) => {
                  const yTop = yForVal(b.topVal);
                  const yBot = yForVal(b.botVal);
                  const h = Math.max(4, yBot - yTop);
                  return (
                    <g key={i}>
                      <rect
                        x={b.x}
                        y={yTop}
                        width={48}
                        height={h}
                        rx={3}
                        fill={b.color}
                      />
                      <text
                        x={b.x + 24}
                        y={Math.max(14, yTop - 5)}
                        textAnchor="middle"
                        className="fill-slate-700 dark:fill-slate-200 text-[9px] font-mono font-semibold"
                      >
                        {b.displayVal}
                      </text>
                      <text
                        x={b.x + 24}
                        y={186}
                        textAnchor="middle"
                        className="fill-slate-700 dark:fill-slate-300 text-[9px] font-medium"
                      >
                        {b.label1}
                      </text>
                      <text
                        x={b.x + 24}
                        y={198}
                        textAnchor="middle"
                        className="fill-slate-500 text-[8px] font-mono"
                      >
                        {b.label2}
                      </text>
                    </g>
                  );
                });
              })()}
            </svg>
          </div>
        </section>

        {/* Chart 2: Origin Period PYD Diverging Bar Chart */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                02. Prior Year Development (PYD) by Origin Period ({priorCutoffLabel} Cohorts)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ultimate Loss change (Ultimate_Current − Ultimate_Baseline) per prior accident cohort
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
                Adverse (+PYD)
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                Favorable (-PYD)
              </span>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox="0 0 600 225"
              className="w-full h-auto min-w-[460px]"
              role="img"
              aria-label="Prior Year Development by Origin Year Chart"
            >
              <line
                x1={45}
                y1={105}
                x2={575}
                y2={105}
                stroke="currentColor"
                className="text-slate-400 dark:text-slate-600"
                strokeWidth={1.2}
              />

              {priorCohorts.map((c, idx) => {
                const count = Math.max(1, priorCohorts.length);
                const slotWidth = 510 / count;
                const barWidth = Math.min(36, slotWidth * 0.65);
                const x = 52 + idx * slotWidth + (slotWidth - barWidth) / 2;

                const val = c.priorYearDevelopment;
                const ratio = Math.min(1, Math.abs(val) / maxAbsCohortPyd);
                const barH = Math.max(3, ratio * 72);
                const isAdv = val >= 0;
                const y = isAdv ? 105 - barH : 105;

                return (
                  <g key={c.originCode}>
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barH}
                      rx={2.5}
                      fill={isAdv ? '#f43f5e' : '#10b981'}
                    />
                    <text
                      x={x + barWidth / 2}
                      y={isAdv ? Math.max(14, y - 5) : Math.min(192, y + barH + 11)}
                      textAnchor="middle"
                      className="fill-slate-700 dark:fill-slate-200 text-[8.5px] font-mono"
                    >
                      {val >= 0 ? '+' : ''}
                      {Math.abs(val) >= 100000
                        ? `${Math.round(val / 1000)}k`
                        : formatNumber(Math.round(val))}
                    </text>
                    <text
                      x={x + barWidth / 2}
                      y={208}
                      textAnchor="middle"
                      className="fill-slate-500 text-[9px] font-mono"
                    >
                      {c.originLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>
      </div>

      {/* Table 1: Origin Period PYD & Actual vs. Expected Decomposition Table */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/50">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              03. Prior Year Development (PYD: {priorCutoffLabel}) & Actual vs. Expected Decomposition by Origin Period
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mathematical Identity: PYD (Ultimate Δ) = Actual Paid Emergence + (Current IBNR − Baseline IBNR [{baselineValuationLabel}])
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-3 text-left font-semibold sticky left-0 bg-slate-100 dark:bg-slate-950 z-10 border-r border-slate-200 dark:border-slate-800">
                  Origin Period
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  Baseline Paid ({baselineValuationLabel})
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  Baseline IBNR
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold border-r border-slate-200 dark:border-slate-800">
                  Baseline Ultimate
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-300">
                  Actual Paid Δ
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  Expected Δ
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold border-r border-slate-200 dark:border-slate-800">
                  AvE Diff
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  Current Paid ({currentValuationLabel})
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  Current IBNR
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold border-r border-slate-200 dark:border-slate-800">
                  Current Ultimate
                </th>
                <th className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold bg-slate-200/50 dark:bg-slate-900">
                  PYD (Ult Δ)
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  PYD / Base IBNR
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {cohortRows.map((row) => {
                const pydCell = formatSignedDelta(
                  row.priorYearDevelopment,
                  currencySymbol
                );
                const aveCell = formatSignedDelta(
                  row.aveEmergenceDiff,
                  currencySymbol
                );
                return (
                  <tr
                    key={row.originCode}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                      !row.isPriorYear
                        ? 'bg-sky-50/30 dark:bg-sky-950/15'
                        : ''
                    }`}
                  >
                    <td className="py-2 px-3 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 sticky left-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
                      {row.originLabel}
                      {!row.isPriorYear && (
                        <span className="ml-1.5 text-[10px] font-normal text-sky-600 dark:text-sky-400">
                          (New Cohort)
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {row.isPriorYear
                        ? formatNumber(Math.round(row.paid2025End))
                        : '—'}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {row.isPriorYear
                        ? formatNumber(Math.round(row.ibnr2025End))
                        : '—'}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800">
                      {row.isPriorYear
                        ? formatNumber(Math.round(row.ultimate2025End))
                        : '—'}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {formatNumber(Math.round(row.actual2026Emergence))}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {row.isPriorYear
                        ? formatNumber(Math.round(row.expected2026Emergence))
                        : '—'}
                    </td>
                    <td
                      className={`py-2 px-2.5 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 ${
                        !row.isPriorYear
                          ? 'text-slate-400'
                          : row.aveEmergenceDiff > 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {row.isPriorYear ? aveCell.text : '—'}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatNumber(Math.round(row.paid2026Current))}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                      {formatNumber(Math.round(row.ibnr2026Current))}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800">
                      {formatNumber(Math.round(row.ultimate2026Current))}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums font-bold bg-slate-50/70 dark:bg-slate-900/60 ${
                        !row.isPriorYear
                          ? 'text-slate-400 font-normal'
                          : row.priorYearDevelopment > 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {row.isPriorYear ? pydCell.text : 'New Cohort'}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {row.isPriorYear && row.pydPctOf2025Reserve !== null
                        ? `${row.pydPctOf2025Reserve >= 0 ? '+' : ''}${formatPercent(row.pydPctOf2025Reserve, 1)}`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 font-semibold">
                <td className="py-2.5 px-3 text-slate-900 dark:text-white sticky left-0 bg-slate-100 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
                  Total Prior Years ({priorCutoffLabel})
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                  {formatNumber(Math.round(priorTotals.paid2025End))}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                  {formatNumber(Math.round(priorTotals.ibnr2025End))}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">
                  {formatNumber(Math.round(priorTotals.ultimate2025End))}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                  {formatNumber(Math.round(priorTotals.actual2026Emergence))}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                  {formatNumber(Math.round(priorTotals.expected2026Emergence))}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 text-amber-600 dark:text-amber-400">
                  {aveSign.text}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                  {formatNumber(Math.round(priorTotals.paid2026Current))}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                  {formatNumber(Math.round(priorTotals.ibnr2026Current))}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">
                  {formatNumber(Math.round(priorTotals.ultimate2026Current))}
                </td>
                <td
                  className={`py-2.5 px-3 text-right font-mono tabular-nums font-bold ${
                    isAdverseTotal
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {pydSign.text}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                  {priorTotals.pydPctOf2025Reserve >= 0 ? '+' : ''}
                  {formatPercent(priorTotals.pydPctOf2025Reserve, 1)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Table 2: Multi-Segment Portfolio Roll-Up Table (Dynamic N-Column Segment Attribution) */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-500" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                04. Multi-Segment Portfolio Batch Roll-Up & PYD Attribution Table ({dynamicDimKeys.join(' × ')})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Independent reserve & PYD evaluation across every dynamic segment combination · Click any segment to slice its Triangle
              </p>
            </div>
          </div>

          {(activeFilters.product !== 'ALL' ||
            activeFilters.channel !== 'ALL' ||
            activeFilters.coverage !== 'ALL' ||
            activeFilters.region !== 'ALL' ||
            Object.entries(activeFilters).some(
              ([k, v]) =>
                !['product', 'channel', 'coverage', 'region'].includes(k) &&
                v !== 'ALL'
            )) && (
            <button
              type="button"
              onClick={() =>
                onSelectSegmentSlice({
                  product: 'ALL',
                  channel: 'ALL',
                  coverage: 'ALL',
                  region: 'ALL',
                })
              }
              className="px-2.5 py-1 text-xs font-medium rounded border border-sky-500/40 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 cursor-pointer"
            >
              Reset Segment Filter to All Portfolio
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400">
                {dynamicDimKeys.map((dimKey) => (
                  <th
                    key={dimKey}
                    className="py-2.5 px-3 text-left font-semibold whitespace-nowrap"
                  >
                    {dimKey}
                  </th>
                ))}
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  Baseline IBNR ({baselineValuationLabel})
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  Paid Emergence
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  PYD ({priorCutoffLabel} Δ)
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  PYD %
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold bg-sky-50/60 dark:bg-sky-950/30 text-sky-900 dark:text-sky-200">
                  Current Total IBNR
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  Ult LR
                </th>
                <th className="py-2.5 px-3 text-right font-semibold">
                  Drill-Down
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {segmentRollupRows.map((seg) => {
                const segPyd = formatSignedDelta(
                  seg.priorYearDevelopment2026,
                  currencySymbol
                );
                const isSelected = dynamicDimKeys.every(
                  (k) =>
                    activeFilters[k] === seg.dimensions[k] ||
                    (k === 'Product' && activeFilters.product === seg.product)
                );

                return (
                  <tr
                    key={seg.segmentId}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-sky-50/70 dark:bg-sky-950/40'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {dynamicDimKeys.map((dimKey, dIdx) => (
                      <td
                        key={dimKey}
                        className={`py-2.5 px-3 ${
                          dIdx === 0
                            ? 'font-semibold text-slate-900 dark:text-slate-100'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {seg.dimensions[dimKey] ?? '—'}
                      </td>
                    ))}
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {formatCurrency(
                        Math.round(seg.ibnr2025EndPriorCohorts),
                        currencySymbol
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(
                        Math.round(seg.actual2026EmergencePriorCohorts),
                        currencySymbol
                      )}
                    </td>
                    <td
                      className={`py-2.5 px-2.5 text-right font-mono tabular-nums font-bold ${
                        seg.priorYearDevelopment2026 > 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {segPyd.text}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {seg.pydPctOfPriorReserve >= 0 ? '+' : ''}
                      {formatPercent(seg.pydPctOfPriorReserve, 1)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-bold bg-sky-50/40 dark:bg-sky-950/20 text-slate-900 dark:text-white">
                      {formatCurrency(
                        Math.round(seg.ibnr2026CurrentTotal),
                        currencySymbol
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {formatPercent(seg.ultimateLossRatio2026, 1)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectSegmentSlice(
                            {
                              product: seg.product,
                              channel: seg.channel,
                              coverage: seg.coverage,
                              region: seg.region,
                              ...seg.dimensions,
                            },
                            true
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Analyze Slice
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
