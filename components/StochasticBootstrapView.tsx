'use client';

import React, { useState } from 'react';
import {
  BootstrapSimulationResult,
  ActuarialEvaluationResult,
} from '@/lib/actuarial-engine';
import {
  formatNumber,
  formatCurrency,
  formatPercent,
} from '@/lib/formatters';
import { Play, RefreshCw } from 'lucide-react';

interface StochasticBootstrapViewProps {
  evaluation: ActuarialEvaluationResult;
  bootstrap: BootstrapSimulationResult;
  currencySymbol: string;
  isSimulating: boolean;
  onRunSimulation: (iterations: number, seed: number) => void;
}

export default function StochasticBootstrapView({
  evaluation,
  bootstrap,
  currencySymbol,
  isSimulating,
  onRunSimulation,
}: StochasticBootstrapViewProps) {
  const [selectedIterations, setSelectedIterations] = useState<number>(
    bootstrap.iterations || 2000
  );
  const [residualAxis, setResidualAxis] = useState<
    'origin' | 'development' | 'calendar'
  >('origin');

  const p75Row = bootstrap.percentiles.find((p) => p.percentile === 75);
  const p995Row = bootstrap.percentiles.find((p) => p.percentile === 99.5);

  const maxHistDensity = Math.max(
    0.01,
    ...bootstrap.histogram.map((h) => Math.max(h.density, h.kdeDensity))
  );

  // Residual scatter bounds
  const maxAbsResidual = Math.max(
    1,
    ...bootstrap.residuals.map((r) => Math.abs(r.scaledResidual))
  );

  return (
    <div className="space-y-6">
      {/* Top KPI Summary & Simulation Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            ODP Bootstrap Mean IBNR
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(Math.round(bootstrap.meanIbnr), currencySymbol)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Std Dev: {formatCurrency(Math.round(bootstrap.stdDevIbnr), currencySymbol)} · CV: {formatPercent(bootstrap.cvIbnr, 1)}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-sky-500/40 bg-sky-50/40 dark:bg-sky-950/25">
          <div className="text-xs font-medium text-sky-800 dark:text-sky-300">
            IFRS 17 Risk Adjustment (75th Percentile)
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-sky-950 dark:text-white">
            +{formatCurrency(Math.round(p75Row?.riskCapitalOverMean ?? 0), currencySymbol)}
          </div>
          <div className="mt-1 text-xs text-sky-800/80 dark:text-sky-300/80 font-mono tabular-nums">
            75% Reserve: {formatCurrency(Math.round(p75Row?.ibnrValue ?? 0), currencySymbol)} ({(p75Row?.percentOfMean ?? 100).toFixed(1)}% of Mean)
          </div>
        </div>

        <div className="p-4 rounded-lg border border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/25">
          <div className="text-xs font-medium text-amber-900 dark:text-amber-300">
            Solvency II Reserve Risk SCR (99.5% VaR)
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-amber-950 dark:text-white">
            +{formatCurrency(Math.round(p995Row?.riskCapitalOverMean ?? 0), currencySymbol)}
          </div>
          <div className="mt-1 text-xs text-amber-900/80 dark:text-amber-300/80 font-mono tabular-nums">
            99.5% VaR: {formatCurrency(Math.round(p995Row?.ibnrValue ?? 0), currencySymbol)} ({(p995Row?.percentOfMean ?? 100).toFixed(1)}% of Mean)
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span>Scale φ: {bootstrap.scaleParameterPhi.toFixed(1)}</span>
            <span>·</span>
            <span>DoF: {bootstrap.degreesOfFreedom}</span>
            <span>·</span>
            <span>{bootstrap.executionTimeMs}ms</span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <select
              aria-label="Bootstrap Simulation Iterations"
              value={selectedIterations}
              onChange={(e) => setSelectedIterations(Number(e.target.value))}
              className="flex-1 text-xs font-mono tabular-nums px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value={1000}>1,000 runs</option>
              <option value={2000}>2,000 runs</option>
              <option value={5000}>5,000 runs</option>
              <option value={10000}>10,000 runs</option>
            </select>

            <button
              type="button"
              disabled={isSimulating}
              onClick={() =>
                onRunSimulation(
                  selectedIterations,
                  Math.floor(Math.random() * 900000) + 100000
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-slate-900 dark:bg-sky-600 text-white hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {isSimulating ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              Resample ODP
            </button>
          </div>
        </div>
      </div>

      {/* Middle Split: IBNR Predictive Distribution Histogram + KDE & Percentile VaR Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 7 Cols: Histogram & KDE Curve */}
        <section className="lg:col-span-7 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                01. Predictive Distribution of Total IBNR (ODP Bootstrap N = {formatNumber(bootstrap.iterations)})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Empirical simulation histogram with Gaussian Kernel Density Estimate (KDE) & IFRS 17 / Solvency II thresholds
              </p>
            </div>
          </div>

          <svg
            viewBox="0 0 680 260"
            className="w-full h-72 overflow-visible mt-1"
            role="img"
            aria-label="Total IBNR Predictive Distribution Histogram and KDE Curve"
          >
            {/* Horizontal grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = 32 + (1 - t) * 185;
              const pct = (t * maxHistDensity * 100).toFixed(1);
              return (
                <g key={t}>
                  <line
                    x1={55}
                    y1={y}
                    x2={655}
                    y2={y}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-slate-800"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={48}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                  >
                    {pct}%
                  </text>
                </g>
              );
            })}

            {/* Histogram Bars */}
            {bootstrap.histogram.map((bin, idx) => {
              const numBins = bootstrap.histogram.length;
              const slotW = 600 / numBins;
              const barW = Math.max(4, slotW - 2);
              const x = 55 + idx * slotW + 1;
              const barH = (bin.density / maxHistDensity) * 185;
              const y = 217 - barH;

              const isTailVaR =
                p995Row && bin.binCenter >= p995Row.ibnrValue;
              const isIfrsRa =
                p75Row &&
                bin.binCenter >= p75Row.ibnrValue &&
                (!p995Row || bin.binCenter < p995Row.ibnrValue);

              return (
                <g key={idx}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(0, barH)}
                    className={
                      isTailVaR
                        ? 'fill-rose-500/80 dark:fill-rose-500/70'
                        : isIfrsRa
                        ? 'fill-amber-500/75 dark:fill-amber-500/65'
                        : 'fill-sky-500/65 dark:fill-sky-500/55'
                    }
                    rx={1.5}
                  />
                  {idx % 4 === 0 && (
                    <text
                      x={x + barW / 2}
                      y={236}
                      textAnchor="middle"
                      className="fill-slate-500 dark:fill-slate-400 text-[9px] font-mono"
                    >
                      {formatNumber(Math.round(bin.binCenter / 1000))}k
                    </text>
                  )}
                </g>
              );
            })}

            {/* KDE Smooth Density Curve */}
            {(() => {
              const numBins = bootstrap.histogram.length;
              const slotW = 600 / Math.max(1, numBins);
              const kdePoints = bootstrap.histogram.map((bin, idx) => {
                const cx = 55 + (idx + 0.5) * slotW;
                const cy = 217 - (bin.kdeDensity / maxHistDensity) * 185;
                return `${cx},${cy}`;
              });

              const span = Math.max(1, bootstrap.maxIbnr - bootstrap.minIbnr);
              const xForVal = (v: number) =>
                55 + Math.min(1, Math.max(0, (v - bootstrap.minIbnr) / span)) * 600;

              const meanX = xForVal(bootstrap.meanIbnr);
              const p75X = xForVal(p75Row?.ibnrValue ?? bootstrap.meanIbnr);
              const p995X = xForVal(p995Row?.ibnrValue ?? bootstrap.maxIbnr);

              return (
                <>
                  <polyline
                    fill="none"
                    stroke="#0f172a"
                    className="stroke-slate-900 dark:stroke-white"
                    strokeWidth={2.2}
                    points={kdePoints.join(' ')}
                  />

                  {/* Mean Vertical Marker */}
                  <line
                    x1={meanX}
                    y1={16}
                    x2={meanX}
                    y2={217}
                    stroke="#0284c7"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                  <text
                    x={meanX - 4}
                    y={12}
                    textAnchor="end"
                    className="fill-sky-700 dark:fill-sky-300 text-[10px] font-mono font-semibold"
                  >
                    Mean
                  </text>

                  {/* 75% IFRS 17 RA Marker */}
                  <line
                    x1={p75X}
                    y1={26}
                    x2={p75X}
                    y2={217}
                    stroke="#d97706"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                  <text
                    x={p75X + 4}
                    y={23}
                    textAnchor="start"
                    className="fill-amber-700 dark:fill-amber-300 text-[10px] font-mono font-semibold"
                  >
                    75% (IFRS 17)
                  </text>

                  {/* 99.5% Solvency II VaR Marker */}
                  <line
                    x1={p995X}
                    y1={16}
                    x2={p995X}
                    y2={217}
                    stroke="#e11d48"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                  <text
                    x={p995X}
                    y={12}
                    textAnchor="middle"
                    className="fill-rose-600 dark:fill-rose-400 text-[10px] font-mono font-semibold"
                  >
                    99.5% VaR
                  </text>
                </>
              );
            })()}
          </svg>
        </section>

        {/* Right 5 Cols: Percentile & Economic Capital Table */}
        <section className="lg:col-span-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg overflow-hidden flex flex-col justify-between">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              02. Percentile & Economic Risk Capital Table
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Required Risk Capital = VaR_α - Mean Best Estimate
            </p>
          </div>

          <div className="overflow-x-auto flex-1">
            <table
              className="w-full border-collapse text-xs"
              aria-label="Bootstrap Percentile and Risk Capital Table"
            >
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                  <th className="py-2.5 px-3 text-left font-semibold">
                    Confidence Level
                  </th>
                  <th className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                    Reserve (IBNR)
                  </th>
                  <th className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                    Risk Capital (VaR - Mean)
                  </th>
                  <th className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                    % of Mean
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                <tr className="bg-slate-50/70 dark:bg-slate-900/50 font-medium">
                  <td className="py-2.5 px-3 text-slate-900 dark:text-slate-100">
                    Mean (Actuarial Central Estimate)
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrency(Math.round(bootstrap.meanIbnr), currencySymbol)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-400">
                    {currencySymbol}0
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    100.0%
                  </td>
                </tr>

                <tr className="bg-slate-50/40 dark:bg-slate-900/30">
                  <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                    Mack Distribution-Free SE (Reference)
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {formatCurrency(Math.round(evaluation.totals.mackTotalSe), currencySymbol)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-500">
                    —
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    CV: {evaluation.totals.mackTotalCv !== null ? formatPercent(evaluation.totals.mackTotalCv, 1) : '—'}
                  </td>
                </tr>

                {bootstrap.percentiles.map((row) => {
                  const isIfrs = row.percentile === 75;
                  const isSolvency = row.percentile === 99.5;
                  return (
                    <tr
                      key={row.percentile}
                      className={
                        isIfrs
                          ? 'bg-sky-50/70 dark:bg-sky-950/35 font-semibold text-sky-950 dark:text-sky-100'
                          : isSolvency
                          ? 'bg-rose-50/70 dark:bg-rose-950/35 font-semibold text-rose-950 dark:text-rose-100'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }
                    >
                      <td className="py-2.5 px-3">
                        {row.label}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatCurrency(Math.round(row.ibnrValue), currencySymbol)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                        +{formatCurrency(Math.round(row.riskCapitalOverMean), currencySymbol)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {row.percentOfMean.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Bottom Section: Pearson Residual Diagnostic Plots (Origin Year, Dev Period, Calendar Year) */}
      <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              03. ODP Pearson Residual Diagnostic Scatter Plot (DoF-Adjusted r_i,j)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Validates homoscedasticity and absence of calendar-year inflation trends across {bootstrap.residuals.length} upper-triangle observations (DoF Scale Factor = {bootstrap.dofScaleFactor.toFixed(3)})
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-md">
            {(
              [
                { key: 'origin', label: 'By Origin Year (事故年度別)' },
                { key: 'development', label: 'By Dev Period (進展年数別)' },
                { key: 'calendar', label: 'By Calendar Year (カレンダー年度別)' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setResidualAxis(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  residualAxis === tab.key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <svg
          viewBox="0 0 880 220"
          className="w-full h-52 overflow-visible"
          role="img"
          aria-label="Pearson Residuals Diagnostic Scatter Plot"
        >
          {/* Zero reference line and +/- 2 SD bands */}
          <line
            x1={65}
            y1={105}
            x2={850}
            y2={105}
            stroke="#0284c7"
            strokeWidth={1.5}
          />
          <line
            x1={65}
            y1={40}
            x2={850}
            y2={40}
            stroke="currentColor"
            className="text-amber-500/50"
            strokeDasharray="4 4"
          />
          <line
            x1={65}
            y1={170}
            x2={850}
            y2={170}
            stroke="currentColor"
            className="text-amber-500/50"
            strokeDasharray="4 4"
          />

          <text
            x={56}
            y={108}
            textAnchor="end"
            className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
          >
            0.0
          </text>
          <text
            x={56}
            y={43}
            textAnchor="end"
            className="fill-amber-600 dark:fill-amber-400 text-[10px] font-mono"
          >
            +{maxAbsResidual.toFixed(0)}
          </text>
          <text
            x={56}
            y={173}
            textAnchor="end"
            className="fill-amber-600 dark:fill-amber-400 text-[10px] font-mono"
          >
            -{maxAbsResidual.toFixed(0)}
          </text>

          {(() => {
            const xValues = bootstrap.residuals.map((r) =>
              residualAxis === 'origin'
                ? r.originYear
                : residualAxis === 'development'
                ? r.devPeriod
                : r.calendarYear
            );
            const uniqueXs = Array.from(new Set(xValues)).sort((a, b) => a - b);
            const minX = uniqueXs[0] ?? 0;
            const maxX = uniqueXs[uniqueXs.length - 1] ?? 1;
            const spanX = Math.max(1, maxX - minX);

            return (
              <>
                {uniqueXs.map((ux) => {
                  const cx = 85 + ((ux - minX) / spanX) * 740;
                  return (
                    <text
                      key={ux}
                      x={cx}
                      y={204}
                      textAnchor="middle"
                      className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                    >
                      {ux}
                    </text>
                  );
                })}

                {bootstrap.residuals.map((pt, idx) => {
                  const rawX =
                    residualAxis === 'origin'
                      ? pt.originYear
                      : residualAxis === 'development'
                      ? pt.devPeriod
                      : pt.calendarYear;
                  const cx = 85 + ((rawX - minX) / spanX) * 740;
                  const cy =
                    105 - (pt.scaledResidual / maxAbsResidual) * 68;
                  const isExtreme =
                    Math.abs(pt.scaledResidual) > maxAbsResidual * 0.65;

                  return (
                    <circle
                      key={idx}
                      cx={cx}
                      cy={cy}
                      r={4.2}
                      className={
                        isExtreme
                          ? 'fill-rose-500/85 stroke-white dark:stroke-slate-900'
                          : 'fill-sky-600/75 dark:fill-sky-400/80 stroke-white dark:stroke-slate-900'
                      }
                      strokeWidth={1}
                    >
                      <title>
                        {`Origin ${pt.originYear}, Dev ${pt.devPeriod}m (Cal ${pt.calendarYear}): Scaled Pearson Residual = ${pt.scaledResidual.toFixed(2)}`}
                      </title>
                    </circle>
                  );
                })}
              </>
            );
          })()}
        </svg>
      </section>
    </div>
  );
}
