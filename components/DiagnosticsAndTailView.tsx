'use client';

import React, { useState } from 'react';
import { ActuarialEvaluationResult } from '@/lib/actuarial-engine';
import { formatNumber, formatLdf, formatCurrency } from '@/lib/formatters';
import { Check, TrendingUp } from 'lucide-react';

interface DiagnosticsAndTailViewProps {
  evaluation: ActuarialEvaluationResult;
  currencySymbol: string;
  onApplyTailFactor: (newTail: number, modelLabel: string) => void;
}

const ORIGIN_COLORS = [
  '#0284c7',
  '#2563eb',
  '#4f46e5',
  '#7c3aed',
  '#9333ea',
  '#db2777',
  '#e11d48',
  '#ea580c',
  '#d97706',
  '#059669',
];

export default function DiagnosticsAndTailView({
  evaluation,
  currencySymbol,
  onApplyTailFactor,
}: DiagnosticsAndTailViewProps) {
  const {
    originYears,
    devPeriods,
    cumulativeTriangle,
    fullProjectedTriangle,
    rows,
    tailFitting,
    tailFactor,
  } = evaluation;

  const [hoveredOrigin, setHoveredOrigin] = useState<number | null>(null);

  // Chart 1: Development Curves scales
  const maxCumVal = Math.max(
    1,
    ...fullProjectedTriangle.flatMap((r) => r.filter((v) => v !== null))
  );

  // Chart 2: Ultimate Breakdown (Paid vs Selected IBNR)
  const maxUltVal = Math.max(1, ...rows.map((r) => r.selectedUltimate));

  // Chart 3: Method Comparison (CL vs BF vs CC IBNR per Origin Year)
  const maxMethodIbnr = Math.max(
    1,
    ...rows.flatMap((r) => [r.clIbnr, r.bfIbnr, r.ccIbnr])
  );

  const { exponential, inversePower, observedPoints, recommendedModel } = tailFitting;

  return (
    <div className="space-y-6">
      {/* Top Section: Parametric Tail Curve Fitting Studio (Extension 1) */}
      <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              01. Tail Factor Curve Fitting Studio (Exponential Decay vs. Inverse Power Extrapolation)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Fits OLS log-linear regression to excess link ratios ln(f_j - 1) and extrapolates 20 future development periods beyond {devPeriods[devPeriods.length - 1]}m
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
            Active Tail Factor: <strong className="text-sky-600 dark:text-sky-400">{formatLdf(tailFactor, 4)}</strong>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left 5 cols: Model Cards & 1-Click Apply */}
          <div className="lg:col-span-5 flex flex-col justify-between gap-4">
            {[exponential, inversePower].map((model) => {
              const isRecommended = recommendedModel === model.modelType;
              const isCurrentlyApplied =
                Math.abs(tailFactor - Number(model.tailFactor.toFixed(4))) < 0.0002;

              return (
                <div
                  key={model.modelType}
                  className={`p-4 rounded-lg border transition-colors ${
                    isRecommended
                      ? 'border-sky-500/50 bg-sky-50/30 dark:bg-sky-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {model.label}
                        {isRecommended && (
                          <span className="ml-2 text-[11px] font-normal text-sky-600 dark:text-sky-400">
                            · Best Fit (Highest R²)
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        {model.formula} · a={model.interceptA.toFixed(3)}, b={model.slopeB.toFixed(3)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onApplyTailFactor(
                          Number(model.tailFactor.toFixed(4)),
                          model.label
                        )
                      }
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        isCurrentlyApplied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-900 dark:bg-sky-600 text-white hover:bg-slate-800 dark:hover:bg-sky-500'
                      }`}
                    >
                      {isCurrentlyApplied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Applied ({model.tailFactor.toFixed(4)})
                        </>
                      ) : (
                        <>
                          <TrendingUp className="w-3.5 h-3.5" />
                          Apply Tail ({model.tailFactor.toFixed(4)})
                        </>
                      )}
                    </button>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-800 grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[11px]">
                        Compound Tail
                      </span>
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                        {model.tailFactor.toFixed(4)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[11px]">
                        R² Goodness-of-Fit
                      </span>
                      <span className="font-bold text-sky-700 dark:text-sky-300 text-sm">
                        {(model.rSquared * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[11px]">
                        +1yr Next LDF
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                        {(model.extrapolatedLdfs[0]?.ldf ?? 1).toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right 7 cols: Interactive SVG Tail Curve Plot */}
          <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50/30 dark:bg-slate-950/40 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Selected LDF vs. Fitted Parametric Decay Curves (f_j - 1)
              </span>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-900 dark:bg-white inline-block" />
                  Observed LDF
                </span>
                <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                  <span className="w-3 h-0.5 bg-sky-500 inline-block" />
                  Exponential Decay
                </span>
                <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <span className="w-3 h-0.5 bg-amber-500 inline-block" />
                  Inverse Power
                </span>
              </div>
            </div>

            <svg
              viewBox="0 0 640 230"
              className="w-full h-60 overflow-visible"
              role="img"
              aria-label="Tail Factor Curve Fitting Chart"
            >
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
                const y = 20 + t * 175;
                return (
                  <g key={idx}>
                    <line
                      x1={50}
                      y1={y}
                      x2={615}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-slate-800"
                      strokeDasharray="3 3"
                    />
                  </g>
                );
              })}

              {(() => {
                const totalSteps = observedPoints.length + 6;
                const maxExcess = Math.max(
                  0.1,
                  ...observedPoints.map((p) => Math.max(0, p.ldf - 1)),
                  ...exponential.fittedLdfs.map((v) => Math.max(0, v - 1)),
                  ...inversePower.fittedLdfs.map((v) => Math.max(0, v - 1))
                );

                const xForStep = (stepIdx: number) =>
                  55 + (stepIdx / Math.max(1, totalSteps - 1)) * 550;
                const yForExcess = (ex: number) =>
                  195 - Math.min(1, Math.max(0, ex / maxExcess)) * 170;

                const expPoints: string[] = [];
                const invPoints: string[] = [];

                for (let s = 0; s < totalSteps; s++) {
                  const x = xForStep(s);
                  const expLdf =
                    s < exponential.fittedLdfs.length
                      ? exponential.fittedLdfs[s]
                      : exponential.extrapolatedLdfs[s - exponential.fittedLdfs.length]?.ldf ?? 1;
                  const invLdf =
                    s < inversePower.fittedLdfs.length
                      ? inversePower.fittedLdfs[s]
                      : inversePower.extrapolatedLdfs[s - inversePower.fittedLdfs.length]?.ldf ?? 1;

                  expPoints.push(`${x},${yForExcess(expLdf - 1)}`);
                  invPoints.push(`${x},${yForExcess(invLdf - 1)}`);
                }

                const tailDividerX = xForStep(observedPoints.length - 0.5);

                return (
                  <>
                    {/* Tail Extrapolation Zone shading */}
                    <rect
                      x={tailDividerX}
                      y={20}
                      width={615 - tailDividerX}
                      height={175}
                      className="fill-sky-500/5 dark:fill-sky-400/5"
                    />
                    <line
                      x1={tailDividerX}
                      y1={20}
                      x2={tailDividerX}
                      y2={195}
                      stroke="#0284c7"
                      strokeDasharray="4 4"
                      strokeWidth={1.2}
                    />
                    <text
                      x={tailDividerX + 6}
                      y={34}
                      className="fill-sky-600 dark:fill-sky-400 text-[10px] font-mono"
                    >
                      Tail Extrapolation Zone →
                    </text>

                    {/* Inverse Power Curve */}
                    <polyline
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      points={invPoints.join(' ')}
                    />

                    {/* Exponential Decay Curve */}
                    <polyline
                      fill="none"
                      stroke="#0284c7"
                      strokeWidth={2.2}
                      points={expPoints.join(' ')}
                    />

                    {/* Observed Points */}
                    {observedPoints.map((pt, idx) => {
                      const cx = xForStep(idx);
                      const cy = yForExcess(Math.max(0, pt.ldf - 1));
                      return (
                        <g key={pt.devIndex}>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={4}
                            className="fill-slate-900 dark:fill-white stroke-white dark:stroke-slate-900"
                            strokeWidth={1.5}
                          />
                          <text
                            x={cx}
                            y={214}
                            textAnchor="middle"
                            className="fill-slate-500 dark:fill-slate-400 text-[9px] font-mono"
                          >
                            {pt.devLabel}
                          </text>
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>
      </section>

      {/* Bottom Grid: 3 Core Actuarial Diagnostic Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Diagnostic Chart 1: Cumulative Loss Development Curves */}
        <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                02. Cumulative Development Curves by Origin Year
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Solid lines = Observed Cumulative C_i,j · Dashed lines = Chain-Ladder Projected Trajectory
              </p>
            </div>
          </div>

          <svg
            viewBox="0 0 600 260"
            className="w-full h-64 overflow-visible"
            role="img"
            aria-label="Cumulative Development Curves by Origin Year"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = 20 + (1 - t) * 200;
              const val = Math.round(t * maxCumVal);
              return (
                <g key={t}>
                  <line
                    x1={65}
                    y1={y}
                    x2={580}
                    y2={y}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-slate-800"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={60}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                  >
                    {formatNumber(val)}
                  </text>
                </g>
              );
            })}

            {devPeriods.map((dev, j) => {
              const x = 65 + (j / Math.max(1, devPeriods.length - 1)) * 515;
              return (
                <text
                  key={dev}
                  x={x}
                  y={240}
                  textAnchor="middle"
                  className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                >
                  {dev}m
                </text>
              );
            })}

            {originYears.map((yr, i) => {
              const color = ORIGIN_COLORS[i % ORIGIN_COLORS.length];
              const isHighlighted = hoveredOrigin === null || hoveredOrigin === yr;
              const opacity = isHighlighted ? 1 : 0.2;

              const obsPoints: string[] = [];
              const projPoints: string[] = [];

              for (let j = 0; j < devPeriods.length; j++) {
                const x = 65 + (j / Math.max(1, devPeriods.length - 1)) * 515;
                const y = 220 - (fullProjectedTriangle[i][j] / maxCumVal) * 200;
                if (cumulativeTriangle[i][j] !== null) {
                  obsPoints.push(`${x},${y}`);
                }
                if (
                  j >= evaluation.rows[i].latestDevIndex
                ) {
                  projPoints.push(`${x},${y}`);
                }
              }

              return (
                <g
                  key={yr}
                  style={{ opacity }}
                  onMouseEnter={() => setHoveredOrigin(yr)}
                  onMouseLeave={() => setHoveredOrigin(null)}
                  className="cursor-pointer transition-opacity"
                >
                  {obsPoints.length > 1 && (
                    <polyline
                      fill="none"
                      stroke={color}
                      strokeWidth={2.2}
                      points={obsPoints.join(' ')}
                    />
                  )}
                  {projPoints.length > 1 && (
                    <polyline
                      fill="none"
                      stroke={color}
                      strokeWidth={1.6}
                      strokeDasharray="4 4"
                      points={projPoints.join(' ')}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* Compact Legend */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-mono">
            {originYears.map((yr, i) => (
              <button
                key={yr}
                type="button"
                onMouseEnter={() => setHoveredOrigin(yr)}
                onMouseLeave={() => setHoveredOrigin(null)}
                className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <span
                  className="w-2.5 h-2.5 rounded-xs inline-block"
                  style={{ backgroundColor: ORIGIN_COLORS[i % ORIGIN_COLORS.length] }}
                />
                {yr}
              </button>
            ))}
          </div>
        </section>

        {/* Diagnostic Chart 2: Ultimate Breakdown Stacked Bar Chart (Paid vs Selected IBNR) */}
        <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                03. Ultimate Loss Breakdown (Paid/Incurred vs. Selected IBNR)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Stacked composition of Latest Cumulative Diagonal and Selected Unreported IBNR Reserve
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span className="w-2.5 h-2.5 bg-slate-700 dark:bg-slate-400 inline-block rounded-xs" />
                Latest Paid
              </span>
              <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                <span className="w-2.5 h-2.5 bg-sky-500 inline-block rounded-xs" />
                Selected IBNR
              </span>
            </div>
          </div>

          <svg
            viewBox="0 0 600 260"
            className="w-full h-64 overflow-visible"
            role="img"
            aria-label="Ultimate Breakdown Stacked Bar Chart"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = 20 + (1 - t) * 200;
              const val = Math.round(t * maxUltVal);
              return (
                <g key={t}>
                  <line
                    x1={65}
                    y1={y}
                    x2={580}
                    y2={y}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-slate-800"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={60}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                  >
                    {formatNumber(val)}
                  </text>
                </g>
              );
            })}

            {rows.map((r, i) => {
              const slotW = 515 / rows.length;
              const barW = Math.min(32, slotW * 0.62);
              const x = 65 + i * slotW + (slotW - barW) / 2;

              const paidH = (r.latestCumulative / maxUltVal) * 200;
              const ibnrH = (r.selectedIbnr / maxUltVal) * 200;
              const paidY = 220 - paidH;
              const ibnrY = paidY - ibnrH;

              return (
                <g key={r.originYear}>
                  {/* Paid bar */}
                  <rect
                    x={x}
                    y={paidY}
                    width={barW}
                    height={Math.max(0, paidH)}
                    className="fill-slate-700 dark:fill-slate-500"
                    rx={2}
                  />
                  {/* IBNR bar */}
                  <rect
                    x={x}
                    y={ibnrY}
                    width={barW}
                    height={Math.max(0, ibnrH)}
                    className="fill-sky-500 dark:fill-sky-400"
                    rx={2}
                  />
                  <text
                    x={x + barW / 2}
                    y={240}
                    textAnchor="middle"
                    className="fill-slate-600 dark:fill-slate-400 text-[10px] font-mono"
                  >
                    {r.originYear}
                  </text>
                </g>
              );
            })}
          </svg>
        </section>

        {/* Diagnostic Chart 3: Method Comparison Grouped Bar Chart (CL vs BF vs CC IBNR) */}
        <section className="lg:col-span-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                04. Method Comparison by Origin Year — IBNR Reserve (Chain Ladder vs. Bornhuetter-Ferguson vs. Cape Cod)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Visualizes divergence between loss-ratio anchored methods (BF/CC) and link-ratio leverage (CL) in immature accident years
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                <span className="w-2.5 h-2.5 bg-sky-600 inline-block rounded-xs" />
                Chain Ladder (CL)
              </span>
              <span className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                <span className="w-2.5 h-2.5 bg-indigo-500 inline-block rounded-xs" />
                Bornhuetter-Ferguson (BF)
              </span>
              <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <span className="w-2.5 h-2.5 bg-amber-500 inline-block rounded-xs" />
                Cape Cod (CC)
              </span>
            </div>
          </div>

          <svg
            viewBox="0 0 900 240"
            className="w-full h-56 overflow-visible"
            role="img"
            aria-label="Method Comparison IBNR Chart"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = 20 + (1 - t) * 185;
              const val = Math.round(t * maxMethodIbnr);
              return (
                <g key={t}>
                  <line
                    x1={75}
                    y1={y}
                    x2={880}
                    y2={y}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-slate-800"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={68}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                  >
                    {formatCurrency(val, currencySymbol)}
                  </text>
                </g>
              );
            })}

            {rows.map((r, i) => {
              const groupW = 805 / rows.length;
              const singleW = Math.min(18, groupW * 0.24);
              const groupStart = 75 + i * groupW + (groupW - singleW * 3 - 4) / 2;

              const clH = (r.clIbnr / maxMethodIbnr) * 185;
              const bfH = (r.bfIbnr / maxMethodIbnr) * 185;
              const ccH = (r.ccIbnr / maxMethodIbnr) * 185;

              return (
                <g key={r.originYear}>
                  <rect
                    x={groupStart}
                    y={205 - clH}
                    width={singleW}
                    height={Math.max(0, clH)}
                    fill="#0284c7"
                    rx={1.5}
                  />
                  <rect
                    x={groupStart + singleW + 2}
                    y={205 - bfH}
                    width={singleW}
                    height={Math.max(0, bfH)}
                    fill="#6366f1"
                    rx={1.5}
                  />
                  <rect
                    x={groupStart + (singleW + 2) * 2}
                    y={205 - ccH}
                    width={singleW}
                    height={Math.max(0, ccH)}
                    fill="#f59e0b"
                    rx={1.5}
                  />
                  <text
                    x={groupStart + singleW * 1.5 + 2}
                    y={224}
                    textAnchor="middle"
                    className="fill-slate-600 dark:fill-slate-400 text-[10px] font-mono"
                  >
                    {r.originYear}
                  </text>
                </g>
              );
            })}
          </svg>
        </section>
      </div>
    </div>
  );
}
