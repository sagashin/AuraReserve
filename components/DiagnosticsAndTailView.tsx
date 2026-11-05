'use client';

import React, { useState } from 'react';
import { ActuarialEvaluation } from '@/lib/actuarial-engine';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LineChart,
  Line,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import {
  Activity,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Banknote,
} from 'lucide-react';
import { DisplayUnitConfig, formatScaledNumber } from '@/lib/format-utils';

interface DiagnosticsAndTailViewProps {
  evaluation: ActuarialEvaluation;
  devPeriods: number[];
  currentTailFactor: number;
  discountRate?: number;
  onApplyTailFactor: (val: number, label: string) => void;
  onDiscountRateChange?: (rate: number) => void;
  unitConfig: DisplayUnitConfig;
}

type ResidualAxisMode = 'devPeriod' | 'originIndex' | 'calendarIndex';

export default function DiagnosticsAndTailView({
  evaluation,
  devPeriods,
  currentTailFactor,
  discountRate = 0.02,
  onApplyTailFactor,
  onDiscountRateChange,
  unitConfig,
}: DiagnosticsAndTailViewProps) {
  const [residualAxis, setResidualAxis] =
    useState<ResidualAxisMode>('devPeriod');

  // Build Tail Extrapolation Curve Data (Exponential, Inverse Power, Weibull)
  const nLdfs = evaluation.selectedLdfs.length;
  const tailChartData = Array.from({ length: nLdfs + 4 }, (_, idx) => {
    const stepLabel =
      idx < nLdfs
        ? `${devPeriods[idx]}–${devPeriods[idx + 1]}m`
        : `Tail +${idx - nLdfs + 1}`;
    const empirical =
      idx < nLdfs ? Number(evaluation.selectedLdfs[idx].toFixed(4)) : null;
    const expFitted = Number(
      (evaluation.tailFits.exponential.fittedCurve[idx] ?? 1.0).toFixed(4)
    );
    const invPowerFitted = Number(
      (evaluation.tailFits.inversePower.fittedCurve[idx] ?? 1.0).toFixed(4)
    );
    const weibullFitted = Number(
      (evaluation.tailFits.weibull.fittedCurve[idx] ?? 1.0).toFixed(4)
    );
    return {
      step: stepLabel,
      Empirical_LDF: empirical,
      Exponential_Fit: expFitted,
      InversePower_Fit: invPowerFitted,
      Weibull_Fit: weibullFitted,
    };
  });

  // Residual scatter points
  const scatterData = evaluation.residuals.map((pt) => ({
    x:
      residualAxis === 'devPeriod'
        ? pt.devPeriod
        : residualAxis === 'originIndex'
        ? pt.originIndex + 1
        : pt.calendarIndex + 1,
    y: pt.residual,
    originLabel: pt.originLabel,
    devPeriod: pt.devPeriod,
    fittedValue: pt.fittedValue,
    observedValue: pt.observedValue,
  }));

  const outlierCount = evaluation.residuals.filter(
    (r) => Math.abs(r.residual) > 2.0
  ).length;

  // Cashflow Projection Chart Data
  const cfChartData = evaluation.cashflowProjection.calendarRows.map((r) => ({
    calendarLabel: r.calendarLabel,
    Undiscounted: Math.round(r.undiscountedCashflow / unitConfig.divisor),
    Discounted_PV: Math.round(r.discountedCashflow / unitConfig.divisor),
  }));

  return (
    <div className="space-y-6">
      {/* Row 1: 3-Model Parametric Tail Extrapolation & Residual Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 6 Cols: 3-Model Parametric Tail Curve Fitting */}
        <div className="lg:col-span-6 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 p-5 flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-sky-500" />
                Parametric Tail Curve Extrapolation (3 Models)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Exponential Decay, Sherman Inverse Power, and Weibull Survival Curve Fits
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              Active Tail: {currentTailFactor.toFixed(4)}
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={tailChartData}
                margin={{ top: 8, right: 16, left: 4, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#334155"
                  opacity={0.2}
                />
                <XAxis
                  dataKey="step"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                />
                <YAxis
                  domain={[0.98, 'auto']}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <ReferenceLine y={1.0} stroke="#64748b" strokeDasharray="3 3" />
                <Line
                  type="monotone"
                  dataKey="Empirical_LDF"
                  name="Selected Empirical LDF"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#38bdf8' }}
                />
                <Line
                  type="monotone"
                  dataKey="Exponential_Fit"
                  name="Exponential Decay"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="InversePower_Fit"
                  name="Inverse Power (Sherman)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="Weibull_Fit"
                  name="Weibull Survival"
                  stroke="#a855f7"
                  strokeWidth={2}
                  strokeDasharray="2 2"
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 3 Fit Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
            {(
              [
                evaluation.tailFits.exponential,
                evaluation.tailFits.inversePower,
                evaluation.tailFits.weibull,
              ] as const
            ).map((fit) => (
              <div
                key={fit.modelName}
                className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {fit.modelName}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      R²={(fit.rSquared * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between font-mono text-xs">
                    <span className="text-slate-500">Implied Tail:</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {fit.tailFactor.toFixed(4)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onApplyTailFactor(fit.tailFactor, fit.modelName)
                  }
                  className="w-full py-1.5 px-2.5 rounded-md text-xs font-medium bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/20 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Apply {fit.tailFactor.toFixed(4)}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right 6 Cols: Standardized Residual Diagnostics */}
        <div className="lg:col-span-6 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 p-5 flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-500" />
                Standardized Residual Diagnostics (r_ij)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verify homoscedasticity & calendar-year diagonal inflation trends (±2σ bounds)
              </p>
            </div>

            <div className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              {(
                [
                  { id: 'devPeriod', label: 'vs Dev Lag' },
                  { id: 'originIndex', label: 'vs Origin Yr' },
                  { id: 'calendarIndex', label: 'vs Calendar Yr' },
                ] as { id: ResidualAxisMode; label: string }[]
              ).map((ax) => (
                <button
                  key={ax.id}
                  type="button"
                  onClick={() => setResidualAxis(ax.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    residualAxis === ax.id
                      ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {ax.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#334155"
                  opacity={0.2}
                />
                <XAxis
                  type="number"
                  dataKey="x"
                  name={residualAxis}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  domain={['auto', 'auto']}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Std Residual"
                  domain={[-3.2, 3.2]}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                  formatter={(val) => [Number(val).toFixed(3), 'Residual']}
                />
                <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1.5} />
                <ReferenceLine
                  y={2.0}
                  stroke="#f43f5e"
                  strokeDasharray="4 4"
                  label={{
                    value: '+2σ Warning',
                    fill: '#f43f5e',
                    fontSize: 10,
                  }}
                />
                <ReferenceLine
                  y={-2.0}
                  stroke="#f43f5e"
                  strokeDasharray="4 4"
                  label={{
                    value: '-2σ Warning',
                    fill: '#f43f5e',
                    fontSize: 10,
                  }}
                />
                <Scatter
                  name="Pearson Residuals"
                  data={scatterData}
                  fill="#38bdf8"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                Evaluated{' '}
                <strong className="font-mono">
                  {evaluation.residuals.length}
                </strong>{' '}
                incremental cells;{' '}
                <strong className="font-mono text-amber-600 dark:text-amber-400">
                  {outlierCount}
                </strong>{' '}
                cells exceed |r_ij| &gt; 2.0σ.
              </span>
            </div>
            <span className="font-mono text-[11px] text-slate-400">
              Mack Scale Diagnostic
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: Future Calendar-Year Cashflow Projection & IFRS 17 / J-GAAP Present Value Discounting */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Banknote className="w-4 h-4 text-emerald-500" />
              Future Calendar-Year Cashflow Runoff & IFRS 17 / J-GAAP Discounting ({unitConfig.badge})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Projects future incremental payouts along calendar diagonals with half-year convention discounting (t - 0.5)
            </p>
          </div>

          {/* Discount Rate Control & Duration KPIs */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
              <label
                htmlFor="discount-rate-input"
                className="font-medium text-slate-600 dark:text-slate-400"
              >
                Discount Rate (割引率 y):
              </label>
              <input
                id="discount-rate-input"
                type="number"
                step="0.25"
                min="0"
                max="15"
                value={Number((discountRate * 100).toFixed(2))}
                onChange={(e) => {
                  const pct = parseFloat(e.target.value);
                  if (!Number.isNaN(pct) && onDiscountRateChange) {
                    onDiscountRateChange(
                      Math.max(0, Math.min(0.25, pct / 100))
                    );
                  }
                }}
                className="w-16 px-1.5 py-0.5 text-right font-mono font-semibold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400"
              />
              <span className="font-mono text-slate-500">%</span>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono">
              <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                PV Reserve:{' '}
                <strong>
                  {formatScaledNumber(
                    evaluation.cashflowProjection.totalDiscountedPv,
                    unitConfig
                  )}
                </strong>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
                Discount Effect: -
                <strong>
                  {formatScaledNumber(
                    evaluation.cashflowProjection.totalDiscountEffect,
                    unitConfig
                  )}
                </strong>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-700 dark:text-sky-300">
                Macaulay Duration:{' '}
                <strong>
                  {evaluation.cashflowProjection.macaulayDurationYears.toFixed(
                    2
                  )}{' '}
                  yrs
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 6 Cols: Cashflow Runoff Bar Chart */}
          <div className="lg:col-span-6 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={cfChartData}
                margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#334155"
                  opacity={0.2}
                />
                <XAxis
                  dataKey="calendarLabel"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(v) => `${Number(v).toLocaleString()}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar
                  dataKey="Undiscounted"
                  name={`Undiscounted Cashflow (${unitConfig.badge})`}
                  fill="#38bdf8"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="Discounted_PV"
                  name={`Discounted PV Cashflow (${unitConfig.badge})`}
                  fill="#10b981"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Right 6 Cols: Calendar-Year Payout Schedule Table */}
          <div className="lg:col-span-6 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full border-collapse text-xs font-mono tabular-nums">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 px-3 text-left">Future Period</th>
                  <th className="py-2 px-3 text-right">
                    Undiscounted CF ({unitConfig.badge})
                  </th>
                  <th className="py-2 px-3 text-right">Discount Factor</th>
                  <th className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">
                    Discounted PV ({unitConfig.badge})
                  </th>
                  <th className="py-2 px-3 text-right">Cum Runoff %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                {evaluation.cashflowProjection.calendarRows.map((row) => (
                  <tr key={row.futureYearOffset}>
                    <td className="py-1.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                      {row.calendarLabel}
                    </td>
                    <td className="py-1.5 px-3 text-right text-slate-700 dark:text-slate-300">
                      {formatScaledNumber(row.undiscountedCashflow, unitConfig)}
                    </td>
                    <td className="py-1.5 px-3 text-right text-slate-500">
                      {row.discountFactor.toFixed(4)}
                    </td>
                    <td className="py-1.5 px-3 text-right font-semibold text-emerald-700 dark:text-emerald-300">
                      {formatScaledNumber(row.discountedCashflow, unitConfig)}
                    </td>
                    <td className="py-1.5 px-3 text-right text-sky-600 dark:text-sky-400">
                      {(row.proportionOfTotal * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
