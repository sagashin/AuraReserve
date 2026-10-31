'use client';

import React, { useState } from 'react';
import {
  ActuarialEvaluationResult,
  LdfSelectionMode,
} from '@/lib/actuarial-engine';
import { formatNumber, formatLdf, formatCurrency } from '@/lib/formatters';
import { RotateCcw, Sliders, Eye, Grid } from 'lucide-react';

interface TriangleWorkspaceProps {
  evaluation: ActuarialEvaluationResult;
  originLabels?: string[];
  currencySymbol: string;
  selectedLdfMode: LdfSelectionMode;
  manualLdfs: (number | null)[];
  onToggleCellExclusion: (originIdx: number, devIdx: number) => void;
  onSelectLdfMode: (mode: LdfSelectionMode) => void;
  onManualLdfChange: (devIdx: number, value: number | null) => void;
  onResetManualLdfs: () => void;
  onTailFactorChange: (tail: number) => void;
  onClearAllExclusions: () => void;
  onOpenTailFitting: () => void;
}

const LDF_MODES: { key: LdfSelectionMode; label: string; shortLabel: string }[] = [
  { key: 'vw_all', label: 'Volume-Weighted Average (All Periods)', shortLabel: 'VW All' },
  { key: 'vw_5', label: 'Volume-Weighted Average (Latest 5 Periods)', shortLabel: 'VW 5p' },
  { key: 'vw_3', label: 'Volume-Weighted Average (Latest 3 Periods)', shortLabel: 'VW 3p' },
  { key: 'simple_all', label: 'Simple Average (All Periods)', shortLabel: 'Simple All' },
  { key: 'simple_5', label: 'Simple Average (Latest 5 Periods)', shortLabel: 'Simple 5p' },
  { key: 'simple_3', label: 'Simple Average (Latest 3 Periods)', shortLabel: 'Simple 3p' },
  { key: 'medial', label: 'Medial Average (Excl. High/Low)', shortLabel: 'Medial' },
];

export default function TriangleWorkspace({
  evaluation,
  originLabels,
  currencySymbol,
  selectedLdfMode,
  manualLdfs,
  onToggleCellExclusion,
  onSelectLdfMode,
  onManualLdfChange,
  onResetManualLdfs,
  onTailFactorChange,
  onClearAllExclusions,
  onOpenTailFitting,
}: TriangleWorkspaceProps) {
  const [triangleDisplayMode, setTriangleDisplayMode] = useState<
    'cumulative' | 'incremental' | 'projected'
  >('cumulative');
  const [heatmapEnabled, setHeatmapEnabled] = useState<boolean>(true);
  const [tailInputText, setTailInputText] = useState<string>(
    evaluation.tailFactor.toFixed(4)
  );

  const {
    originYears,
    devPeriods,
    cumulativeTriangle,
    incrementalTriangle,
    fullProjectedTriangle,
    linkRatios,
    exclusions,
    ldfAverages,
    selectedLdfs,
    cdfs,
  } = evaluation;

  // Count total active exclusions
  const excludedCount = exclusions.reduce(
    (acc, row) => acc + row.filter(Boolean).length,
    0
  );

  // Compute column-wise min and max link ratios for relative heatmap normalization
  const colStats = devPeriods.slice(0, -1).map((_, j) => {
    const vals: number[] = [];
    for (let i = 0; i < originYears.length; i++) {
      const r = linkRatios[i]?.[j];
      if (r !== null && r !== undefined && !Number.isNaN(r)) {
        vals.push(r);
      }
    }
    if (vals.length === 0) return { min: 1, max: 2, mean: 1.5 };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { min, max, mean };
  });

  const getHeatmapStyle = (
    ratio: number | null,
    devIdx: number,
    isExcluded: boolean
  ): string => {
    if (ratio === null || isExcluded || !heatmapEnabled) return '';
    const { min, max } = colStats[devIdx] ?? { min: 1, max: 2 };
    const span = max - min;
    const norm = span > 1e-6 ? (ratio - min) / span : 0.5;

    if (norm >= 0.85) {
      return 'bg-rose-100/90 dark:bg-rose-950/70 text-rose-950 dark:text-rose-200 font-semibold';
    }
    if (norm >= 0.65) {
      return 'bg-amber-100/80 dark:bg-amber-950/50 text-amber-950 dark:text-amber-200';
    }
    if (norm >= 0.35) {
      return 'bg-sky-50/70 dark:bg-sky-950/30 text-slate-800 dark:text-slate-200';
    }
    return 'bg-emerald-50/60 dark:bg-emerald-950/25 text-emerald-950 dark:text-emerald-200';
  };

  const activeTriangle =
    triangleDisplayMode === 'cumulative'
      ? cumulativeTriangle
      : triangleDisplayMode === 'incremental'
      ? incrementalTriangle
      : fullProjectedTriangle;

  return (
    <div className="space-y-6">
      {/* Section 1: Upper Loss Triangle (Cumulative / Incremental / Projected) */}
      <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              01. Loss Development Triangle ({triangleDisplayMode === 'cumulative' ? 'Cumulative C_i,j' : triangleDisplayMode === 'incremental' ? 'Incremental I_i,j' : 'Full Chain-Ladder Projection'})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Origin Year (i) × Development Period in Months (j) · Unobserved lower-right cells strictly preserved as NaN/Null
            </p>
          </div>

          {/* Interactive View Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-md">
            <button
              type="button"
              onClick={() => setTriangleDisplayMode('cumulative')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                triangleDisplayMode === 'cumulative'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Cumulative (累積損害額)
            </button>
            <button
              type="button"
              onClick={() => setTriangleDisplayMode('incremental')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                triangleDisplayMode === 'incremental'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Incremental (期間損害額)
            </button>
            <button
              type="button"
              onClick={() => setTriangleDisplayMode('projected')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                triangleDisplayMode === 'projected'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Full Projected (将来予測展開)
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            className="w-full border-collapse text-xs"
            aria-label="Loss Development Triangle"
          >
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-3 text-left font-semibold sticky left-0 bg-slate-50 dark:bg-slate-950 z-10 border-r border-slate-200 dark:border-slate-800">
                  Origin \ Dev
                </th>
                {devPeriods.map((dev) => (
                  <th
                    key={dev}
                    className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold"
                  >
                    {dev}m
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold bg-slate-100/70 dark:bg-slate-900/90 border-l border-slate-200 dark:border-slate-800">
                  Latest Diagonal
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {originYears.map((yr, i) => {
                const label = originLabels?.[i] ?? `${yr}`;
                const latestVal = evaluation.rows[i]?.latestCumulative ?? 0;
                const latestIdx = evaluation.rows[i]?.latestDevIndex ?? 0;
                return (
                  <tr
                    key={yr}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2 px-3 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 sticky left-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      {label}
                    </td>
                    {devPeriods.map((dev, j) => {
                      const val = activeTriangle[i]?.[j];
                      const isObserved =
                        cumulativeTriangle[i]?.[j] !== null &&
                        cumulativeTriangle[i]?.[j] !== undefined;
                      const isLatestDiagonal = j === latestIdx;

                      if (val === null || val === undefined) {
                        return (
                          <td
                            key={dev}
                            className="py-2 px-3 text-right font-mono tabular-nums text-slate-300 dark:text-slate-700 bg-slate-50/40 dark:bg-slate-950/30 select-none"
                          >
                            NaN
                          </td>
                        );
                      }

                      return (
                        <td
                          key={dev}
                          className={`py-2 px-3 text-right font-mono tabular-nums ${
                            !isObserved
                              ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/20 italic'
                              : isLatestDiagonal
                              ? 'font-semibold text-slate-950 dark:text-white bg-sky-50/60 dark:bg-sky-950/30'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {formatNumber(Math.round(val))}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 bg-slate-50/90 dark:bg-slate-900/90 border-l border-slate-200 dark:border-slate-800">
                      {formatCurrency(Math.round(latestVal), currencySymbol)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2: Middle Age-to-Age Link Ratios & Interactive Outlier Exclusion Grid */}
      <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              02. Age-to-Age Link Ratios (f_i,j = C_i,j+1 / C_i,j) & Interactive Outlier Exclusions
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Click any Link Ratio cell to toggle outlier exclusion (strikethrough) and recalculate LDFs & IBNR in real time · Active Exclusions: {excludedCount}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHeatmapEnabled((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                heatmapEnabled
                  ? 'border-sky-600/30 bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-200'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              {heatmapEnabled ? 'Heatmap: On' : 'Heatmap: Off'}
            </button>

            {excludedCount > 0 && (
              <button
                type="button"
                onClick={onClearAllExclusions}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore Excluded Cells ({excludedCount})
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            className="w-full border-collapse text-xs"
            aria-label="Age-to-Age Link Ratios and LDF Selection Table"
          >
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-3 text-left font-semibold sticky left-0 bg-slate-50 dark:bg-slate-950 z-10 border-r border-slate-200 dark:border-slate-800">
                  Origin \ Link
                </th>
                {devPeriods.slice(0, -1).map((dev, j) => (
                  <th
                    key={dev}
                    className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold"
                  >
                    {dev}–{devPeriods[j + 1]}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold bg-slate-100/70 dark:bg-slate-900/90 border-l border-slate-200 dark:border-slate-800">
                  To Ult (Tail)
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {originYears.slice(0, -1).map((yr, i) => {
                const label = originLabels?.[i] ?? `${yr}`;
                return (
                  <tr
                    key={yr}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-1.5 px-3 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 sticky left-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      {label}
                    </td>
                  {devPeriods.slice(0, -1).map((dev, j) => {
                    const ratio = linkRatios[i]?.[j] ?? null;
                    const isExcluded = exclusions[i]?.[j] ?? false;

                    if (ratio === null) {
                      return (
                        <td
                          key={dev}
                          className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-300 dark:text-slate-700 bg-slate-50/40 dark:bg-slate-950/30 select-none"
                        >
                          —
                        </td>
                      );
                    }

                    const heatClass = getHeatmapStyle(ratio, j, isExcluded);

                    return (
                      <td
                        key={dev}
                        className={`p-0 text-right font-mono tabular-nums border-r border-slate-100 dark:border-slate-800/50 ${heatClass}`}
                      >
                        <button
                          type="button"
                          onClick={() => onToggleCellExclusion(i, j)}
                          aria-label={`Link ratio ${yr} ${dev}-${devPeriods[j + 1]} ${ratio.toFixed(4)}${isExcluded ? ' (Excluded)' : ''}`}
                          title={
                            isExcluded
                              ? `Excluded Outlier (${yr} at ${dev}–${devPeriods[j + 1]}m). Click to restore.`
                              : `Click to exclude (${yr} at ${dev}–${devPeriods[j + 1]}m: ${ratio.toFixed(4)})`
                          }
                          className={`w-full py-2 px-3 text-right font-mono tabular-nums cursor-pointer transition-all focus-visible:outline-2 focus-visible:outline-sky-500 ${
                            isExcluded
                              ? 'line-through text-slate-400 dark:text-slate-500 bg-slate-200/70 dark:bg-slate-800/80 italic'
                              : 'hover:ring-1 hover:ring-inset hover:ring-sky-500'
                          }`}
                        >
                          {formatLdf(ratio, 4)}
                        </button>
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-400 dark:text-slate-600 bg-slate-50/50 dark:bg-slate-950/30 border-l border-slate-200 dark:border-slate-800">
                    —
                  </td>
                </tr>
                );
              })}

              {/* Separator Row for LDF Averages */}
              <tr className="bg-slate-100 dark:bg-slate-950 border-t-2 border-slate-300 dark:border-slate-700">
                <td
                  colSpan={devPeriods.length + 1}
                  className="py-2 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  03. Age-to-Age Average Link Ratios (Excludes Masked Outliers) & Selected LDF Schedule
                </td>
              </tr>

              {LDF_MODES.map((mode) => {
                const isSelectedMode = selectedLdfMode === mode.key;
                const rowVals = ldfAverages[mode.key] || [];
                return (
                  <tr
                    key={mode.key}
                    className={`transition-colors ${
                      isSelectedMode
                        ? 'bg-sky-50/90 dark:bg-sky-950/40 font-semibold text-sky-950 dark:text-sky-100'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="py-2 px-3 sticky left-0 bg-inherit border-r border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => onSelectLdfMode(mode.key)}
                        className="flex items-center gap-2 text-left w-full cursor-pointer whitespace-nowrap"
                      >
                        <span
                          className={`inline-block w-3 h-3 rounded-full border ${
                            isSelectedMode
                              ? 'border-sky-600 bg-sky-600 dark:border-sky-400 dark:bg-sky-400'
                              : 'border-slate-400 dark:border-slate-600'
                          }`}
                        />
                        <span>{mode.label}</span>
                      </button>
                    </td>
                    {rowVals.map((val, j) => (
                      <td
                        key={j}
                        className="py-2 px-3 text-right font-mono tabular-nums"
                      >
                        {formatLdf(val, 4)}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400 border-l border-slate-200 dark:border-slate-800">
                      —
                    </td>
                  </tr>
                );
              })}

              {/* Manual Override / Selected LDF Row */}
              <tr className="bg-slate-900 dark:bg-slate-950 text-white font-semibold border-t-2 border-slate-400 dark:border-slate-700">
                <td className="py-2.5 px-3 sticky left-0 bg-slate-900 dark:bg-slate-950 border-r border-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <span className="whitespace-nowrap">Selected LDF (採用進展係数)</span>
                    {manualLdfs.some((x) => x !== null) && (
                      <button
                        type="button"
                        onClick={onResetManualLdfs}
                        className="text-xs font-normal text-sky-300 hover:text-sky-200 underline cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </td>
                {selectedLdfs.map((val, j) => {
                  const isManual = manualLdfs[j] !== null && manualLdfs[j] !== undefined;
                  return (
                    <td key={j} className="p-1.5 text-right font-mono tabular-nums">
                      <input
                        type="number"
                        step="0.001"
                        min="0.500"
                        max="10.000"
                        aria-label={`Selected LDF ${devPeriods[j]}-${devPeriods[j + 1]}`}
                        value={Number(val.toFixed(4))}
                        onChange={(e) => {
                          const parsed = parseFloat(e.target.value);
                          if (!Number.isNaN(parsed) && parsed > 0) {
                            onManualLdfChange(j, parsed);
                          }
                        }}
                        className={`w-20 text-right font-mono tabular-nums text-xs px-1.5 py-1 rounded border transition-colors ${
                          isManual
                            ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                            : 'bg-slate-800 border-slate-700 text-white focus:border-sky-400'
                        }`}
                      />
                    </td>
                  );
                })}
                <td className="p-1.5 text-right font-mono tabular-nums border-l border-slate-700">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="number"
                      step="0.001"
                      min="1.000"
                      max="1.500"
                      aria-label="Tail Factor"
                      value={tailInputText}
                      onChange={(e) => {
                        setTailInputText(e.target.value);
                        const parsed = parseFloat(e.target.value);
                        if (!Number.isNaN(parsed) && parsed >= 1.0 && parsed <= 1.5) {
                          onTailFactorChange(parsed);
                        }
                      }}
                      className="w-20 text-right font-mono tabular-nums text-xs px-1.5 py-1 rounded bg-sky-900/50 border border-sky-500/60 text-sky-100"
                    />
                    <button
                      type="button"
                      onClick={onOpenTailFitting}
                      title="Open Parametric Tail Curve Fitting"
                      className="p-1 rounded bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>

              {/* Cumulative LDF (CDF to Ultimate) Row */}
              <tr className="bg-slate-100/90 dark:bg-slate-900/90 text-slate-900 dark:text-slate-100 font-semibold border-t border-slate-300 dark:border-slate-800">
                <td className="py-2.5 px-3 sticky left-0 bg-slate-100 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                  Cumulative CDF to Ultimate (累積進展係数)
                </td>
                {cdfs.slice(0, -1).map((cdf, j) => (
                  <td
                    key={j}
                    className="py-2.5 px-3 text-right font-mono tabular-nums text-sky-700 dark:text-sky-300"
                  >
                    {formatLdf(cdf, 4)}
                  </td>
                ))}
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-sky-700 dark:text-sky-300 border-l border-slate-200 dark:border-slate-800">
                  {formatLdf(cdfs[cdfs.length - 1], 4)}
                </td>
              </tr>

              {/* Implied Development Maturity % (1 / CDF) */}
              <tr className="bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400">
                <td className="py-2 px-3 sticky left-0 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                  Implied Maturity % (1 / CDF)
                </td>
                {cdfs.slice(0, -1).map((cdf, j) => (
                  <td key={j} className="py-2 px-3 text-right font-mono tabular-nums">
                    {((1 / cdf) * 100).toFixed(1)}%
                  </td>
                ))}
                <td className="py-2 px-3 text-right font-mono tabular-nums border-l border-slate-200 dark:border-slate-800">
                  {((1 / cdfs[cdfs.length - 1]) * 100).toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
