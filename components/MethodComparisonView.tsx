'use client';

import React from 'react';
import {
  ActuarialEvaluationResult,
  MethodWeights,
  ReserveMethodType,
} from '@/lib/actuarial-engine';
import {
  formatNumber,
  formatLdf,
  formatPercent,
  formatCurrency,
} from '@/lib/formatters';

interface MethodComparisonViewProps {
  evaluation: ActuarialEvaluationResult;
  originLabels?: string[];
  currencySymbol: string;
  onUpdateElr: (originIdx: number, newElr: number) => void;
  onUpdateEarnedPremium: (originIdx: number, newPrem: number) => void;
  onSelectOriginMethod: (originIdx: number, method: ReserveMethodType) => void;
  onApplyUniformMethod: (method: ReserveMethodType) => void;
  onUpdateMethodWeights: (originIdx: number, weights: MethodWeights) => void;
}

export default function MethodComparisonView({
  evaluation,
  originLabels,
  currencySymbol,
  onUpdateElr,
  onUpdateEarnedPremium,
  onSelectOriginMethod,
  onApplyUniformMethod,
  onUpdateMethodWeights,
}: MethodComparisonViewProps) {
  const { rows, totals, capeCodElr } = evaluation;

  return (
    <div className="space-y-6">
      {/* Top Method Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Chain Ladder (CL) Total IBNR
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(Math.round(totals.clIbnr), currencySymbol)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Ultimate: {formatCurrency(Math.round(totals.clUltimate), currencySymbol)} · LR: {formatPercent(totals.clUltimate / totals.earnedPremium, 1)}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Bornhuetter-Ferguson (BF) Total IBNR
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(Math.round(totals.bfIbnr), currencySymbol)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Ultimate: {formatCurrency(Math.round(totals.bfUltimate), currencySymbol)} · LR: {formatPercent(totals.bfUltimate / totals.earnedPremium, 1)}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Cape Cod (CC) Total IBNR
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(Math.round(totals.ccIbnr), currencySymbol)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Implied CC ELR: {formatPercent(capeCodElr, 2)} · Used-Up Prem: {formatCurrency(Math.round(totals.usedUpPremium), currencySymbol)}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-sky-500/40 dark:border-sky-500/40 bg-sky-50/40 dark:bg-sky-950/30">
          <div className="text-xs font-medium text-sky-800 dark:text-sky-300">
            Selected Reserve (採用IBNR) & Mack SE
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-sky-950 dark:text-white">
            {formatCurrency(Math.round(totals.selectedIbnr), currencySymbol)}
          </div>
          <div className="mt-1 text-xs text-sky-800/80 dark:text-sky-300/80 font-mono tabular-nums">
            Mack SE: {formatCurrency(Math.round(totals.mackTotalSe), currencySymbol)} · CV: {totals.mackTotalCv !== null ? formatPercent(totals.mackTotalCv, 1) : '—'}
          </div>
        </div>
      </div>

      {/* Main Comparison & Selection Table */}
      <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Deterministic & Stochastic Method Comparison Table (CL / BF / Cape Cod / Mack SE)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Edit Earned Premium or A Priori ELR directly, or switch each Origin Year between Chain Ladder (CL), Bornhuetter-Ferguson (BF), Cape Cod (CC), or Credibility Blend
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">
              Bulk Assign:
            </span>
            {(['CL', 'BF', 'CC', 'BLEND'] as ReserveMethodType[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onApplyUniformMethod(m)}
                className="px-2.5 py-1 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                All {m}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            className="w-full border-collapse text-xs"
            aria-label="Method Comparison and Reserve Selection Table"
          >
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-3 text-left font-semibold sticky left-0 bg-slate-100 dark:bg-slate-950 z-10 border-r border-slate-200 dark:border-slate-800">
                  Origin
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  Latest Paid/Inc
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  CDF
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  Earned Prem
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  A Priori ELR
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold bg-slate-50 dark:bg-slate-900/60 border-l border-slate-200 dark:border-slate-800">
                  CL IBNR
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold bg-slate-50 dark:bg-slate-900/60">
                  BF IBNR
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold bg-slate-50 dark:bg-slate-900/60 border-r border-slate-200 dark:border-slate-800">
                  CC IBNR
                </th>
                <th className="py-2.5 px-3 text-center font-semibold">
                  Method Selection
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold bg-sky-50/70 dark:bg-sky-950/30">
                  Selected Ultimate
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold bg-sky-100/70 dark:bg-sky-950/50 text-sky-950 dark:text-sky-200">
                  Selected IBNR
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  Ult LR
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold border-l border-slate-200 dark:border-slate-800">
                  Mack SE
                </th>
                <th className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                  Mack CV
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {rows.map((row, i) => (
                <tr
                  key={row.originYear}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-2 px-3 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 sticky left-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                    {originLabels?.[i] ?? row.originYear}
                  </td>
                  <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {formatNumber(Math.round(row.latestCumulative))}
                  </td>
                  <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {formatLdf(row.cdfToUltimate, 4)}
                  </td>
                  <td className="p-1 text-right font-mono tabular-nums">
                    <input
                      type="number"
                      step="50000"
                      aria-label={`Earned Premium ${row.originYear}`}
                      value={Math.round(row.earnedPremium)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val) && val > 0) {
                          onUpdateEarnedPremium(i, val);
                        }
                      }}
                      className="w-20 text-right font-mono tabular-nums text-xs px-1 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </td>
                  <td className="p-1 text-right font-mono tabular-nums">
                    <div className="inline-flex items-center justify-end gap-0.5">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="300"
                        aria-label={`A Priori ELR % ${row.originYear}`}
                        value={Number((row.aprioriElr * 100).toFixed(1))}
                        onChange={(e) => {
                          const pct = parseFloat(e.target.value);
                          if (!Number.isNaN(pct) && pct > 0 && pct <= 500) {
                            onUpdateElr(i, pct / 100);
                          }
                        }}
                        className="w-14 text-right font-mono tabular-nums text-xs px-1 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      />
                      <span className="text-slate-400">%</span>
                    </div>
                  </td>

                  {/* Method IBNRs */}
                  <td
                    className={`py-2 px-2.5 text-right font-mono tabular-nums border-l border-slate-200 dark:border-slate-800 ${
                      row.selectedMethod === 'CL'
                        ? 'font-semibold text-sky-700 dark:text-sky-300 bg-sky-50/40 dark:bg-sky-950/20'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {formatNumber(Math.round(row.clIbnr))}
                  </td>
                  <td
                    className={`py-2 px-2.5 text-right font-mono tabular-nums ${
                      row.selectedMethod === 'BF'
                        ? 'font-semibold text-sky-700 dark:text-sky-300 bg-sky-50/40 dark:bg-sky-950/20'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {formatNumber(Math.round(row.bfIbnr))}
                  </td>
                  <td
                    className={`py-2 px-2.5 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 ${
                      row.selectedMethod === 'CC'
                        ? 'font-semibold text-sky-700 dark:text-sky-300 bg-sky-50/40 dark:bg-sky-950/20'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {formatNumber(Math.round(row.ccIbnr))}
                  </td>

                  {/* Segmented Method Selector */}
                  <td className="py-1.5 px-2 text-center">
                    <div className="inline-flex items-center gap-0.5 p-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      {(['CL', 'BF', 'CC', 'BLEND'] as ReserveMethodType[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => onSelectOriginMethod(i, m)}
                          aria-label={`Select ${m} method for ${row.originYear}`}
                          className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                            row.selectedMethod === m
                              ? 'bg-sky-600 text-white shadow-2xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>

                    {row.selectedMethod === 'BLEND' && (
                      <div className="mt-1 flex items-center justify-center gap-1 text-[10px] font-mono tabular-nums text-slate-500">
                        <span>CL:{Math.round(row.weights.cl * 100)}%</span>
                        <span>·</span>
                        <span>BF:{Math.round(row.weights.bf * 100)}%</span>
                        <span>·</span>
                        <span>CC:{Math.round(row.weights.cc * 100)}%</span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateMethodWeights(i, {
                              cl: row.weights.cl === 0.5 ? 0.34 : 0.5,
                              bf: row.weights.bf === 0.5 ? 0.33 : 0.5,
                              cc: row.weights.cc > 0 ? 0 : 0.33,
                            })
                          }
                          className="ml-1 text-sky-600 dark:text-sky-400 underline cursor-pointer"
                        >
                          cycle
                        </button>
                      </div>
                    )}
                  </td>

                  <td className="py-2 px-2.5 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100 bg-sky-50/40 dark:bg-sky-950/20">
                    {formatNumber(Math.round(row.selectedUltimate))}
                  </td>
                  <td className="py-2 px-2.5 text-right font-mono tabular-nums font-bold text-sky-900 dark:text-sky-200 bg-sky-100/60 dark:bg-sky-950/40">
                    {formatNumber(Math.round(row.selectedIbnr))}
                  </td>
                  <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {formatPercent(row.ultimateLossRatio, 1)}
                  </td>
                  <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800">
                    {formatNumber(Math.round(row.mackSe))}
                  </td>
                  <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {row.mackCv !== null ? formatPercent(row.mackCv, 1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="bg-slate-900 dark:bg-slate-950 text-white font-semibold border-t-2 border-slate-400 dark:border-slate-700">
                <td className="py-3 px-3 sticky left-0 bg-slate-900 dark:bg-slate-950 border-r border-slate-700">
                  Total / Overall
                </td>
                <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                  {formatNumber(Math.round(totals.latestCumulative))}
                </td>
                <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-400">
                  —
                </td>
                <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                  {formatNumber(Math.round(totals.earnedPremium))}
                </td>
                <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-300">
                  CC: {formatPercent(capeCodElr, 1)}
                </td>
                <td className="py-3 px-2.5 text-right font-mono tabular-nums border-l border-slate-700">
                  {formatNumber(Math.round(totals.clIbnr))}
                </td>
                <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                  {formatNumber(Math.round(totals.bfIbnr))}
                </td>
                <td className="py-3 px-2.5 text-right font-mono tabular-nums border-r border-slate-700">
                  {formatNumber(Math.round(totals.ccIbnr))}
                </td>
                <td className="py-3 px-2 text-center text-xs text-sky-300 font-mono">
                  Active Selection
                </td>
                <td className="py-3 px-2.5 text-right font-mono tabular-nums text-sky-200">
                  {formatCurrency(Math.round(totals.selectedUltimate), currencySymbol)}
                </td>
                <td className="py-3 px-2.5 text-right font-mono tabular-nums text-amber-300 font-bold">
                  {formatCurrency(Math.round(totals.selectedIbnr), currencySymbol)}
                </td>
                <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                  {formatPercent(totals.ultimateLossRatio, 1)}
                </td>
                <td className="py-3 px-2.5 text-right font-mono tabular-nums border-l border-slate-700 text-sky-200">
                  {formatCurrency(Math.round(totals.mackTotalSe), currencySymbol)}
                </td>
                <td className="py-3 px-2.5 text-right font-mono tabular-nums text-sky-200">
                  {totals.mackTotalCv !== null ? formatPercent(totals.mackTotalCv, 1) : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
