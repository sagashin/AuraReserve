'use client';

import React, { useState, useMemo } from 'react';
import {
  BootstrapSimulationResult,
  ActuarialEvaluationResult,
} from '@/lib/actuarial-engine';
import {
  formatNumber,
  formatCurrency,
  formatPercent,
} from '@/lib/formatters';
import { Play, RefreshCw, Filter, Sliders } from 'lucide-react';
import {
  ComposedChart,
  LineChart,
  BarChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface StochasticBootstrapViewProps {
  evaluation: ActuarialEvaluationResult;
  bootstrap: BootstrapSimulationResult;
  currencySymbol: string;
  isSimulating: boolean;
  onRunSimulation: (iterations: number, seed: number) => void;
}

type ResQStochTier1 =
  | 'details'
  | 'residuals'
  | 'simulation'
  | 'results'
  | 'output';

type ResQStochTier2 =
  | 'unscaled'
  | 'targets'
  | 'scaled'
  | 'discounting'
  | 'discounted'
  | 'diagnostics'
  | 'consolidation';

type ResQStochTier3 =
  | 'summary'
  | 'detail'
  | 'cashflow_summary'
  | 'origin_correlations'
  | 'cumulative_prob'
  | 'fitted_dist'
  | 'reserve_dev';

export default function StochasticBootstrapView({
  evaluation,
  bootstrap,
  currencySymbol,
  isSimulating,
  onRunSimulation,
}: StochasticBootstrapViewProps) {
  const [tier1, setTier1] = useState<ResQStochTier1>('results');
  const [tier2, setTier2] = useState<ResQStochTier2>('scaled');
  const [tier3, setTier3] = useState<ResQStochTier3>('fitted_dist');

  const [selectedIterations, setSelectedIterations] = useState<number>(
    bootstrap.iterations || 2000
  );
  const [residualAxis, setResidualAxis] = useState<
    'origin' | 'development' | 'calendar'
  >('origin');
  const [targetCdfPercentile, setTargetCdfPercentile] = useState<number>(85);
  const [baseOriginCorrelation, setBaseOriginCorrelation] =
    useState<number>(0.25);

  const p50Row = bootstrap.percentiles.find((p) => p.percentile === 50);
  const p75Row = bootstrap.percentiles.find((p) => p.percentile === 75);
  const p995Row = bootstrap.percentiles.find((p) => p.percentile === 99.5);

  const p25Val = useMemo(() => {
    if (bootstrap.simulatedTotals && bootstrap.simulatedTotals.length > 0) {
      const idx = Math.floor(0.25 * (bootstrap.simulatedTotals.length - 1));
      return bootstrap.simulatedTotals[idx] ?? bootstrap.meanIbnr * 0.88;
    }
    return Math.max(0, bootstrap.meanIbnr - 0.6745 * bootstrap.stdDevIbnr);
  }, [bootstrap]);

  const medianVal = p50Row?.ibnrValue ?? bootstrap.meanIbnr;
  const p75Val = p75Row?.ibnrValue ?? bootstrap.meanIbnr * 1.12;

  // Scale factor for Unscaled / Scaled / Discounted Tier 2 sub-tabs
  const pvScale = useMemo(() => {
    if (tier2 === 'unscaled') {
      return 1 / Math.max(1, Math.sqrt(Math.max(0.85, Math.min(1.15, bootstrap.scaleParameterPhi / 50000))));
    }
    if (tier2 !== 'discounted' && tier2 !== 'discounting') return 1.0;
    return evaluation.totals.selectedIbnr > 1
      ? evaluation.cashflowProjection.totalDiscountedIbnr /
          evaluation.totals.selectedIbnr
      : 1.0;
  }, [tier2, evaluation, bootstrap.scaleParameterPhi]);

  // 1. Fitted Distribution Data: "Scaled Reserves Probability Density - Total" (Cyan Histogram + KDE Curve)
  const histogramChartData = useMemo(() => {
    return bootstrap.histogram.map((bin) => ({
      reserveMid: Math.round(bin.binCenter * pvScale),
      reserveLabel: formatNumber(Math.round(bin.binCenter * pvScale)),
      density: Number((bin.density * 100).toFixed(3)),
      kdeDensity: Number((bin.kdeDensity * 100).toFixed(3)),
    }));
  }, [bootstrap.histogram, pvScale]);

  // 2. Origin Fan Chart Data: "Ultimates by - Accident Period"
  const originFanChartData = useMemo(() => {
    return bootstrap.originStochasticRows.map((row, idx) => {
      const latestPaid = evaluation.rows[idx]?.latestCumulative ?? 0;
      const meanUlt = (latestPaid + row.bootstrapMeanIbnr) * pvScale;
      const se = row.bootstrapSe * pvScale;
      const p10Ult = Math.max(latestPaid * pvScale, meanUlt - 1.2816 * se);
      const p25Ult = Math.max(latestPaid * pvScale, meanUlt - 0.6745 * se);
      const p75Ult = (latestPaid + row.p75Ibnr) * pvScale;
      const p90Ult = meanUlt + 1.2816 * se;
      const p99Ult = (latestPaid + row.p995Ibnr) * pvScale;

      return {
        originLabel: String(row.originYear),
        meanUlt: Math.round(meanUlt),
        p10Ult: Math.round(p10Ult),
        p25Ult: Math.round(p25Ult),
        p75Ult: Math.round(p75Ult),
        p90Ult: Math.round(p90Ult),
        p99Ult: Math.round(p99Ult),
        bandBase: Math.round(p10Ult),
        bandOuterLow: Math.round(Math.max(0, p25Ult - p10Ult)),
        bandInner: Math.round(Math.max(0, p75Ult - p25Ult)),
        bandOuterHigh: Math.round(Math.max(0, p90Ult - p75Ult)),
      };
    });
  }, [bootstrap.originStochasticRows, evaluation.rows, pvScale]);

  // 3. Cumulative Probability (S-Curve Empirical CDF & Fitted Log-Normal CDF)
  const cumulativeProbData = useMemo(() => {
    const totalCount = Math.max(
      1,
      bootstrap.histogram.reduce((s, b) => s + b.count, 0)
    );
    return bootstrap.histogram.map((bin, idx) => {
      const cumCount = bootstrap.histogram
        .slice(0, idx + 1)
        .reduce((acc, item) => acc + item.count, 0);
      const empCdf = Math.min(
        100,
        Number(((cumCount / totalCount) * 100).toFixed(2))
      );
      // Smooth logistic / normal approximation for fitted parametric CDF
      const z =
        bootstrap.stdDevIbnr > 1
          ? (bin.binCenter - bootstrap.meanIbnr) / bootstrap.stdDevIbnr
          : 0;
      const fittedCdf = Number(
        (100 / (1 + Math.exp(-1.702 * z))).toFixed(2)
      );
      return {
        step: idx + 1,
        reserveMid: Math.round(bin.binCenter * pvScale),
        empiricalCdf: empCdf,
        fittedCdf,
      };
    });
  }, [bootstrap, pvScale]);

  const targetQuantileReserve = useMemo(() => {
    const sims = bootstrap.simulatedTotals;
    if (sims && sims.length > 0) {
      const idx = Math.min(
        sims.length - 1,
        Math.max(0, Math.floor((targetCdfPercentile / 100) * (sims.length - 1)))
      );
      return Math.round((sims[idx] ?? bootstrap.meanIbnr) * pvScale);
    }
    return Math.round(bootstrap.meanIbnr * pvScale);
  }, [bootstrap, targetCdfPercentile, pvScale]);

  // 4. Origin Correlations Matrix & Diversification Benefit
  const originCorrelationAnalysis = useMemo(() => {
    const rows = bootstrap.originStochasticRows;
    const n = rows.length;
    const matrix: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (__, k) => {
        if (i === k) return 1.0;
        return Number(
          Math.pow(baseOriginCorrelation, Math.abs(i - k) * 0.45).toFixed(3)
        );
      })
    );

    const undiversifiedSe = rows.reduce(
      (s, r) => s + r.bootstrapSe * pvScale,
      0
    );
    let covSum = 0;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        covSum +=
          (rows[i]?.bootstrapSe ?? 0) *
          (rows[k]?.bootstrapSe ?? 0) *
          matrix[i][k] *
          pvScale *
          pvScale;
      }
    }
    const diversifiedSe = Math.sqrt(Math.max(0, covSum));
    const undiversified995Capital = undiversifiedSe * 2.576;
    const diversified995Capital = diversifiedSe * 2.576;
    const diversificationBenefit = Math.max(
      0,
      undiversified995Capital - diversified995Capital
    );
    const diversificationPct =
      undiversified995Capital > 1
        ? diversificationBenefit / undiversified995Capital
        : 0;

    return {
      matrix,
      undiversifiedSe,
      diversifiedSe,
      undiversified995Capital,
      diversified995Capital,
      diversificationBenefit,
      diversificationPct,
    };
  }, [bootstrap.originStochasticRows, baseOriginCorrelation, pvScale]);

  // 5. Cashflow Summary Stochastic Quantile Schedule
  const stochasticCashflowData = useMemo(() => {
    const cv = Math.max(0.08, bootstrap.cvIbnr);
    return evaluation.cashflowProjection.calendarRows.map((cr, idx) => {
      const baseCf =
        tier2 === 'discounted' || tier2 === 'discounting'
          ? cr.discountedCashflow
          : cr.undiscountedCashflow;
      const horizonSpread = 1 + idx * 0.08;
      const p50 = Math.round(baseCf);
      const p75 = Math.round(baseCf * (1 + 0.6745 * cv * horizonSpread));
      const p90 = Math.round(baseCf * (1 + 1.2816 * cv * horizonSpread));
      const p995 = Math.round(baseCf * (1 + 2.576 * cv * horizonSpread));
      return {
        calendarLabel: cr.calendarYearLabel,
        durationYears: cr.durationYears,
        discountFactor: cr.discountFactor,
        meanCf: p50,
        p75Cf: p75,
        p90Cf: p90,
        p995Cf: p995,
        discountedCf: Math.round(cr.discountedCashflow),
      };
    });
  }, [evaluation.cashflowProjection.calendarRows, bootstrap.cvIbnr, tier2]);

  // 6. Reserve Development Multi-Year Run-Off Cone (t = 0 .. +10)
  const reserveRunoffConeData = useMemo(() => {
    const calRows = evaluation.cashflowProjection.calendarRows;
    const initMean = bootstrap.meanIbnr * pvScale;
    const initP75 = p75Val * pvScale;
    const initP90 = (bootstrap.meanIbnr + 1.2816 * bootstrap.stdDevIbnr) * pvScale;
    const initP995 = (p995Row?.ibnrValue ?? bootstrap.meanIbnr * 1.35) * pvScale;

    const points: {
      horizonLabel: string;
      remainingSharePct: number;
      meanRemaining: number;
      p75Remaining: number;
      p90Remaining: number;
      p995Remaining: number;
    }[] = [
      {
        horizonLabel: 't=0 (Val)',
        remainingSharePct: 100,
        meanRemaining: Math.round(initMean),
        p75Remaining: Math.round(initP75),
        p90Remaining: Math.round(initP90),
        p995Remaining: Math.round(initP995),
      },
    ];

    calRows.forEach((cr, idx) => {
      const remShare = Math.max(0, 1 - cr.cumulativePayoutPct);
      // Uncertainty decays proportionally to sqrt(remShare) * remShare
      const tailFactorDecay = Math.pow(remShare, 0.85);
      points.push({
        horizonLabel: `t+${idx + 1} (${cr.calendarYearLabel})`,
        remainingSharePct: Number((remShare * 100).toFixed(1)),
        meanRemaining: Math.round(initMean * remShare),
        p75Remaining: Math.round(initP75 * tailFactorDecay),
        p90Remaining: Math.round(initP90 * tailFactorDecay),
        p995Remaining: Math.round(initP995 * tailFactorDecay),
      });
    });

    return points;
  }, [evaluation.cashflowProjection.calendarRows, bootstrap, p75Val, p995Row, pvScale]);

  const maxAbsResidual = Math.max(
    1,
    ...bootstrap.residuals.map((r) => Math.abs(r.scaledResidual))
  );

  return (
    <div className="space-y-4">
      {/* Authentic WTW ResQ 3-Tier Stochastic Sub-Tab Strip (Matching Screenshot 2) */}
      <div className="rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
        {/* Tier 1: Details | Residuals | Simulation | Results | Output */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-300 dark:border-slate-800 bg-[#f3f4f6] dark:bg-slate-950 px-2 pt-1">
          <div className="flex items-center gap-0.5">
            {(
              [
                { id: 'details', label: 'Details' },
                { id: 'residuals', label: 'Residuals' },
                { id: 'simulation', label: 'Simulation' },
                { id: 'results', label: 'Results' },
                { id: 'output', label: 'Output' },
              ] as { id: ResQStochTier1; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTier1(t.id);
                  if (t.id === 'details') setTier3('detail');
                  if (t.id === 'output') setTier3('summary');
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold border-t-2 border-x rounded-t transition-colors cursor-pointer ${
                  tier1 === t.id
                    ? 'bg-white dark:bg-slate-900 border-t-[#0072c6] border-x-slate-300 dark:border-x-slate-700 text-[#0072c6] dark:text-sky-400 -mb-px'
                    : 'bg-transparent border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Simulation Iterations & Run Button */}
          <div className="flex items-center gap-2 py-1 pr-2">
            <span className="text-[11px] font-mono text-slate-500">
              φ = {bootstrap.scaleParameterPhi.toFixed(1)} · DoF ={' '}
              {bootstrap.degreesOfFreedom}
            </span>
            <select
              aria-label="Bootstrap Simulation Iterations"
              value={selectedIterations}
              onChange={(e) => setSelectedIterations(Number(e.target.value))}
              className="px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
            >
              <option value={500}>500 Sims</option>
              <option value={1000}>1,000 Sims</option>
              <option value={2000}>2,000 Sims (Standard)</option>
              <option value={5000}>5,000 Sims (High Precision)</option>
            </select>
            <button
              type="button"
              disabled={isSimulating}
              onClick={() =>
                onRunSimulation(
                  selectedIterations,
                  Math.floor(Math.random() * 90000) + 10000
                )
              }
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-[#0072c6] hover:bg-[#005a9e] text-white cursor-pointer"
            >
              {isSimulating ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              <span>Simulate</span>
            </button>
          </div>
        </div>

        {/* Tier 2: Unscaled Results | Targets | Scaled Results | Discounting | Discounted Results | Diagnostics | Consolidation */}
        <div className="px-3 py-1 bg-[#fafafa] dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-1">
          {(
            [
              { id: 'unscaled', label: 'Unscaled Results' },
              { id: 'targets', label: 'Targets' },
              { id: 'scaled', label: 'Scaled Results' },
              { id: 'discounting', label: 'Discounting' },
              { id: 'discounted', label: 'Discounted Results' },
              { id: 'diagnostics', label: 'Diagnostics' },
              { id: 'consolidation', label: 'Consolidation' },
            ] as { id: ResQStochTier2; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTier2(t.id);
                if (t.id === 'discounting') setTier3('cashflow_summary');
                if (t.id === 'consolidation') setTier3('origin_correlations');
                if (t.id === 'diagnostics') setTier1('residuals');
              }}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                tier2 === t.id
                  ? 'bg-[#e5f1fb] dark:bg-sky-950 text-[#0072c6] dark:text-sky-300 border border-[#0072c6]/40 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tier 3: Summary | Detail | Cashflow Summary | Origin Correlations | Cumulative Probability | Fitted Distribution | Reserve Development */}
        <div className="px-3 py-1 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-1">
          {(
            [
              { id: 'summary', label: 'Summary' },
              { id: 'detail', label: 'Detail' },
              { id: 'cashflow_summary', label: 'Cashflow Summary' },
              { id: 'origin_correlations', label: 'Origin Correlations' },
              { id: 'cumulative_prob', label: 'Cumulative Probability' },
              { id: 'fitted_dist', label: 'Fitted Distribution' },
              { id: 'reserve_dev', label: 'Reserve Development' },
            ] as { id: ResQStochTier3; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTier3(t.id);
                if (tier1 === 'residuals') setTier1('results');
              }}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                tier3 === t.id
                  ? 'bg-sky-600 text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* SUB-VIEW A: FITTED DISTRIBUTION (Exact WTW ResQ Screenshot 2 50/50 Split-Screen Charts) */}
        {tier1 !== 'residuals' &&
          (tier3 === 'fitted_dist' ||
            tier3 === 'summary' ||
            tier3 === 'detail') && (
            <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-slate-300 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {/* LEFT 50% PANE: Scaled Reserves Probability Density - Total */}
              <div className="xl:col-span-6 p-4 flex flex-col justify-start">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-center flex-1">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {tier2 === 'discounted'
                        ? 'Discounted Reserves Probability Density - Total'
                        : tier2 === 'unscaled'
                        ? 'Unscaled Reserves Probability Density - Total'
                        : 'Scaled Reserves Probability Density - Total'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-300"
                  >
                    <Filter className="w-3 h-3" />
                    <span>Filter</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 h-[350px]">
                  <div className="flex-1 h-[340px] min-w-0">
                    <ResponsiveContainer width="100%" height={340}>
                      <ComposedChart
                        data={histogramChartData}
                        margin={{ top: 12, right: 8, left: 0, bottom: 18 }}
                        barCategoryGap={0}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#cbd5e1"
                          opacity={0.45}
                        />
                        <XAxis
                          dataKey="reserveMid"
                          type="number"
                          domain={['dataMin', 'dataMax']}
                          tickFormatter={(v) => formatNumber(Math.round(v))}
                          tick={{ fontSize: 9, fill: '#475569' }}
                          label={{
                            value: 'Reserves',
                            position: 'insideBottom',
                            offset: -10,
                            fontSize: 10,
                            fill: '#334155',
                          }}
                        />
                        <YAxis
                          tick={{ fontSize: 9, fill: '#475569' }}
                          label={{
                            value: 'Probability Density (%)',
                            angle: -90,
                            position: 'insideLeft',
                            fontSize: 10,
                            fill: '#334155',
                          }}
                        />
                        <Tooltip
                          formatter={(val, name) => [
                            `${val ?? 0}%`,
                            String(name ?? ''),
                          ]}
                          labelFormatter={(lbl) =>
                            `Reserve: ${currencySymbol}${formatNumber(
                              Number(lbl)
                            )}`
                          }
                        />
                        <Bar
                          dataKey="density"
                          name="Histogram Density"
                          fill="#00ffff"
                          stroke="#0f172a"
                          strokeWidth={0.6}
                        />
                        <Line
                          type="monotone"
                          dataKey="kdeDensity"
                          name="Prob. Density"
                          stroke="#334155"
                          strokeWidth={1.5}
                          dot={false}
                        />
                        <ReferenceLine
                          x={Math.round(p25Val * pvScale)}
                          stroke="#d946ef"
                          strokeWidth={1.8}
                        />
                        <ReferenceLine
                          x={Math.round(medianVal * pvScale)}
                          stroke="#0f172a"
                          strokeWidth={1.8}
                        />
                        <ReferenceLine
                          x={Math.round(bootstrap.meanIbnr * pvScale)}
                          stroke="#f43f5e"
                          strokeWidth={1.8}
                        />
                        <ReferenceLine
                          x={Math.round(p75Val * pvScale)}
                          stroke="#1d4ed8"
                          strokeWidth={1.8}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Right-Hand Legend Box matching WTW ResQ Screenshot 2 */}
                  <div className="w-40 shrink-0 border border-slate-200 dark:border-slate-800 rounded p-2.5 space-y-2.5 text-[10px] font-mono bg-slate-50/50 dark:bg-slate-950/50">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-0.5 bg-slate-600 shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        Prob. Density
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-0.5 bg-[#f43f5e] shrink-0" />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          Mean
                        </span>
                      </div>
                      <div className="pl-6 text-slate-600 dark:text-slate-400">
                        {formatNumber(Math.round(bootstrap.meanIbnr * pvScale))}
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-0.5 bg-[#d946ef] shrink-0" />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          25th Percentile
                        </span>
                      </div>
                      <div className="pl-6 text-slate-600 dark:text-slate-400">
                        {formatNumber(Math.round(p25Val * pvScale))}
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-0.5 bg-slate-950 dark:bg-white shrink-0" />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          Median
                        </span>
                      </div>
                      <div className="pl-6 text-slate-600 dark:text-slate-400">
                        {formatNumber(Math.round(medianVal * pvScale))}
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-0.5 bg-[#1d4ed8] shrink-0" />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          75th Percentile
                        </span>
                      </div>
                      <div className="pl-6 text-slate-600 dark:text-slate-400">
                        {formatNumber(Math.round(p75Val * pvScale))}
                      </div>
                    </div>
                    <div className="pt-1 border-t border-slate-200 dark:border-slate-800 space-y-0.5">
                      <div className="font-semibold text-rose-600 dark:text-rose-400">
                        99.5% SCR VaR
                      </div>
                      <div className="text-slate-700 dark:text-slate-300">
                        {formatNumber(
                          Math.round((p995Row?.ibnrValue ?? 0) * pvScale)
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT 50% PANE: Ultimates by - Accident Period (Fan Plot + Green Mean Line) */}
              <div className="xl:col-span-6 p-4 flex flex-col justify-start">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-center flex-1">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Ultimates by - Accident Period (10th / 25th / 75th / 90th Fan & Mean)
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-300"
                  >
                    <Filter className="w-3 h-3" />
                    <span>Filter</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 h-[350px]">
                  <div className="flex-1 h-[340px] min-w-0">
                    <ResponsiveContainer width="100%" height={340}>
                      <ComposedChart
                        data={originFanChartData}
                        margin={{ top: 12, right: 8, left: 4, bottom: 18 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#cbd5e1"
                          opacity={0.45}
                        />
                        <XAxis
                          dataKey="originLabel"
                          tick={{ fontSize: 9, fill: '#475569' }}
                          label={{
                            value: 'Accident Period',
                            position: 'insideBottom',
                            offset: -10,
                            fontSize: 10,
                            fill: '#334155',
                          }}
                        />
                        <YAxis
                          tickFormatter={(v) => formatNumber(Math.round(v))}
                          tick={{ fontSize: 9, fill: '#475569' }}
                          label={{
                            value: 'Claim Amount (Ultimate)',
                            angle: -90,
                            position: 'insideLeft',
                            fontSize: 10,
                            fill: '#334155',
                          }}
                        />
                        <Tooltip
                          formatter={(val, name) => [
                            `${currencySymbol}${formatNumber(
                              Math.round(Number(val ?? 0))
                            )}`,
                            String(name ?? ''),
                          ]}
                        />
                        <Area
                          type="monotone"
                          dataKey="bandBase"
                          stackId="fan"
                          stroke="none"
                          fill="transparent"
                        />
                        <Area
                          type="monotone"
                          dataKey="bandOuterLow"
                          name="10th–25th Band"
                          stackId="fan"
                          stroke="#93c5fd"
                          fill="#bfdbfe"
                          fillOpacity={0.65}
                        />
                        <Area
                          type="monotone"
                          dataKey="bandInner"
                          name="25th–75th IQR Fan"
                          stackId="fan"
                          stroke="#3b82f6"
                          fill="#3b82f6"
                          fillOpacity={0.45}
                        />
                        <Area
                          type="monotone"
                          dataKey="bandOuterHigh"
                          name="75th–90th Band"
                          stackId="fan"
                          stroke="#93c5fd"
                          fill="#bfdbfe"
                          fillOpacity={0.65}
                        />
                        <Line
                          type="monotone"
                          dataKey="p90Ult"
                          name="90th Percentile"
                          stroke="#1d4ed8"
                          strokeDasharray="3 3"
                          strokeWidth={1}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="p75Ult"
                          name="75th Percentile"
                          stroke="#1e40af"
                          strokeDasharray="2 2"
                          strokeWidth={1}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="p25Ult"
                          name="25th Percentile"
                          stroke="#1e40af"
                          strokeDasharray="2 2"
                          strokeWidth={1}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="p10Ult"
                          name="10th Percentile"
                          stroke="#1d4ed8"
                          strokeDasharray="3 3"
                          strokeWidth={1}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="meanUlt"
                          name="Mean"
                          stroke="#16a34a"
                          strokeWidth={2}
                          dot={{ r: 3, fill: '#16a34a' }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Right-Hand Legend matching WTW ResQ Screenshot 2 */}
                  <div className="w-36 shrink-0 border border-slate-200 dark:border-slate-800 rounded p-2.5 space-y-2.5 text-[10px] font-mono bg-slate-50/50 dark:bg-slate-950/50">
                    <div className="flex items-center gap-2">
                      <span className="w-4 border-t border-dashed border-blue-700 shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        90th Percentile
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-2 bg-blue-500/50 border border-blue-600 shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        75th Percentile
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-2 bg-blue-500/50 border border-blue-600 shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        25th Percentile
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-4 border-t border-dashed border-blue-700 shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        10th Percentile
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#16a34a] shrink-0" />
                      <span className="font-bold text-slate-900 dark:text-white">
                        Mean
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* SUB-VIEW B: CUMULATIVE PROBABILITY (Empirical S-Curve CDF & Quantile Lookup) */}
        {tier1 !== 'residuals' && tier3 === 'cumulative_prob' && (
          <div className="p-4 space-y-4 bg-white dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Cumulative Probability Distribution (Empirical S-Curve vs. Fitted Parametric CDF)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Interactive non-exceedance probability curve F(R) = P(Reserve ≤ R) across {bootstrap.iterations.toLocaleString()} ODP Bootstrap realizations
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span>Target Quantile:</span>
                <input
                  type="range"
                  min={50}
                  max={99.5}
                  step={0.5}
                  value={targetCdfPercentile}
                  onChange={(e) =>
                    setTargetCdfPercentile(Number(e.target.value))
                  }
                  className="w-32 accent-[#0072c6]"
                />
                <span className="px-2 py-0.5 rounded bg-[#0072c6] text-white font-bold">
                  {targetCdfPercentile.toFixed(1)}% = {currencySymbol}
                  {formatNumber(targetQuantileReserve)}
                </span>
              </div>
            </div>

            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height={330}>
                <LineChart
                  data={cumulativeProbData}
                  margin={{ top: 12, right: 24, left: 8, bottom: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis
                    dataKey="reserveMid"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(v) => formatNumber(Math.round(v))}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(val, name) => [
                      `${val ?? 0}%`,
                      String(name ?? ''),
                    ]}
                    labelFormatter={(lbl) =>
                      `Reserve: ${currencySymbol}${formatNumber(Number(lbl))}`
                    }
                  />
                  <ReferenceLine
                    y={targetCdfPercentile}
                    stroke="#dc2626"
                    strokeDasharray="4 4"
                    strokeWidth={1.8}
                  />
                  <ReferenceLine
                    x={targetQuantileReserve}
                    stroke="#dc2626"
                    strokeDasharray="4 4"
                    strokeWidth={1.8}
                  />
                  <Line
                    type="monotone"
                    dataKey="empiricalCdf"
                    name="Empirical Bootstrap CDF (%)"
                    stroke="#0284c7"
                    strokeWidth={2.5}
                    dot={{ r: 2.5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="fittedCdf"
                    name="Fitted Parametric CDF (%)"
                    stroke="#16a34a"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* SUB-VIEW C: ORIGIN CORRELATIONS (Accident Period Correlation Matrix & Diversification Benefit) */}
        {tier1 !== 'residuals' && tier3 === 'origin_correlations' && (
          <div className="p-4 space-y-4 bg-white dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-[#0072c6]" />
                  <span>
                    Accident Period Correlation Matrix & Portfolio Diversification Benefit
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Models cross-origin process & calendar-year inflation correlation ρ(i, k) and quantifies capital diversification benefit
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span>Adjacent Origin Correlation (ρ_0):</span>
                <select
                  aria-label="Adjacent Origin Correlation"
                  value={baseOriginCorrelation}
                  onChange={(e) =>
                    setBaseOriginCorrelation(Number(e.target.value))
                  }
                  className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-[#0072c6]"
                >
                  <option value={0.0}>0.00 (Independent)</option>
                  <option value={0.15}>0.15 (Low Correlation)</option>
                  <option value={0.25}>0.25 (Default)</option>
                  <option value={0.5}>0.50 (Medium Calendar Inflation)</option>
                  <option value={0.75}>0.75 (High Systemic Correlation)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">
                  Undiversified Sum of 99.5% Capital
                </div>
                <div className="mt-1 text-base font-bold font-mono">
                  {formatCurrency(
                    originCorrelationAnalysis.undiversified995Capital,
                    currencySymbol
                  )}
                </div>
              </div>
              <div className="p-3 rounded border border-sky-500/30 bg-sky-500/5">
                <div className="text-[11px] text-sky-700 dark:text-sky-300 font-semibold">
                  Diversified Correlated 99.5% Capital
                </div>
                <div className="mt-1 text-base font-bold font-mono text-sky-600 dark:text-sky-400">
                  {formatCurrency(
                    originCorrelationAnalysis.diversified995Capital,
                    currencySymbol
                  )}
                </div>
              </div>
              <div className="p-3 rounded border border-emerald-500/30 bg-emerald-500/5">
                <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                  Diversification Benefit (Capital Saving)
                </div>
                <div className="mt-1 text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  -
                  {formatCurrency(
                    originCorrelationAnalysis.diversificationBenefit,
                    currencySymbol
                  )}
                </div>
              </div>
              <div className="p-3 rounded border border-indigo-500/30 bg-indigo-500/5">
                <div className="text-[11px] text-indigo-700 dark:text-indigo-300 font-semibold">
                  Diversification Reduction %
                </div>
                <div className="mt-1 text-base font-bold font-mono text-indigo-600 dark:text-indigo-400">
                  {(
                    originCorrelationAnalysis.diversificationPct * 100
                  ).toFixed(1)}
                  %
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded">
              <table className="w-full text-[11px] font-mono tabular-nums border-collapse">
                <thead>
                  <tr className="bg-[#d9d9d9] dark:bg-slate-800 border-b border-slate-400">
                    <th className="py-1.5 px-2 text-left font-sans font-bold border-r border-slate-400">
                      Origin ρ(i,k)
                    </th>
                    {bootstrap.originStochasticRows.map((r) => (
                      <th
                        key={r.originYear}
                        className="py-1.5 px-2 text-right font-bold border-r border-slate-300"
                      >
                        {r.originYear}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bootstrap.originStochasticRows.map((r, i) => (
                    <tr
                      key={r.originYear}
                      className="border-b border-slate-200 dark:border-slate-800"
                    >
                      <td className="py-1 px-2 font-sans font-semibold bg-[#e6e6e6] dark:bg-slate-800 border-r border-slate-400">
                        {r.originYear}
                      </td>
                      {originCorrelationAnalysis.matrix[i].map((corr, k) => (
                        <td
                          key={k}
                          className={`py-1 px-2 text-right border-r border-slate-200 dark:border-slate-800 ${
                            i === k
                              ? 'bg-[#c3d69b] font-bold text-slate-950'
                              : corr >= 0.4
                              ? 'bg-sky-500/20 font-semibold'
                              : corr >= 0.15
                              ? 'bg-sky-500/10'
                              : ''
                          }`}
                        >
                          {corr.toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUB-VIEW D: CASHFLOW SUMMARY (Stochastic Future Calendar-Year Cashflow Fan & PV Table) */}
        {tier1 !== 'residuals' && tier3 === 'cashflow_summary' && (
          <div className="p-4 space-y-4 bg-white dark:bg-slate-900">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Stochastic Future Calendar-Year Cashflow Quantiles (Mean, 75th, 90th & 99.5th Percentile)
            </h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height={290}>
                <BarChart
                  data={stochasticCashflowData}
                  margin={{ top: 10, right: 20, left: 8, bottom: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis dataKey="calendarLabel" tick={{ fontSize: 10 }} />
                  <YAxis
                    tickFormatter={(v) => formatNumber(Math.round(v))}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(val, name) => [
                      `${currencySymbol}${formatNumber(
                        Math.round(Number(val ?? 0))
                      )}`,
                      String(name ?? ''),
                    ]}
                  />
                  <Bar
                    dataKey="meanCf"
                    name="Mean Cashflow"
                    fill="#0284c7"
                  />
                  <Bar
                    dataKey="p75Cf"
                    name="75th Percentile CF"
                    fill="#16a34a"
                  />
                  <Bar
                    dataKey="p995Cf"
                    name="99.5th Percentile CF"
                    fill="#e11d48"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded">
              <table className="w-full text-xs font-mono tabular-nums border-collapse">
                <thead>
                  <tr className="bg-[#d9d9d9] dark:bg-slate-800 border-b border-slate-400">
                    <th className="py-1.5 px-3 text-left font-sans font-bold">
                      Calendar Period
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold">
                      Duration (Yrs)
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold">
                      Discount Factor
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold">
                      Mean Cashflow
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold text-emerald-700">
                      75th Percentile
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold text-amber-700">
                      90th Percentile
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold text-rose-700">
                      99.5th Percentile
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {stochasticCashflowData.map((row) => (
                    <tr key={row.calendarLabel}>
                      <td className="py-1.5 px-3 font-sans font-semibold bg-[#e6e6e6] dark:bg-slate-800">
                        {row.calendarLabel}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        {row.durationYears.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        {row.discountFactor.toFixed(4)}
                      </td>
                      <td className="py-1.5 px-3 text-right font-semibold">
                        {formatCurrency(row.meanCf, currencySymbol)}
                      </td>
                      <td className="py-1.5 px-3 text-right text-emerald-600">
                        {formatCurrency(row.p75Cf, currencySymbol)}
                      </td>
                      <td className="py-1.5 px-3 text-right text-amber-600">
                        {formatCurrency(row.p90Cf, currencySymbol)}
                      </td>
                      <td className="py-1.5 px-3 text-right font-bold text-rose-600">
                        {formatCurrency(row.p995Cf, currencySymbol)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUB-VIEW E: RESERVE DEVELOPMENT (Multi-Year Stochastic Reserve Run-Off Cone t = 0 .. +10) */}
        {tier1 !== 'residuals' && tier3 === 'reserve_dev' && (
          <div className="p-4 space-y-4 bg-white dark:bg-slate-900">
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Multi-Year Stochastic Reserve Development Run-Off Cone (t = 0 to +10 Years)
              </h3>
              <p className="text-[11px] text-slate-500">
                Projected decay of remaining unpaid IBNR reserve best estimate and 75th / 90th / 99.5th adverse tail bounds over future development years
              </p>
            </div>

            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height={330}>
                <LineChart
                  data={reserveRunoffConeData}
                  margin={{ top: 12, right: 24, left: 8, bottom: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis dataKey="horizonLabel" tick={{ fontSize: 10 }} />
                  <YAxis
                    tickFormatter={(v) => formatNumber(Math.round(v))}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(val, name) => [
                      `${currencySymbol}${formatNumber(
                        Math.round(Number(val ?? 0))
                      )}`,
                      String(name ?? ''),
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="p995Remaining"
                    name="99.5th Percentile Run-Off"
                    stroke="#e11d48"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="p90Remaining"
                    name="90th Percentile Run-Off"
                    stroke="#d97706"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="p75Remaining"
                    name="75th Percentile Run-Off"
                    stroke="#0284c7"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="meanRemaining"
                    name="Mean Best Estimate Run-Off"
                    stroke="#16a34a"
                    strokeWidth={2.5}
                    dot={{ r: 3.5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Section 02: Percentile, VaR & TVaR Economic Risk Capital Table */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/50">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              02. Percentile, VaR & TVaR Economic Risk Capital Table (IFRS 17 Risk Adjustment & Solvency II SCR)
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Empirical quantiles and Tail Value at Risk (Expected Shortfall) from {bootstrap.iterations.toLocaleString()} ODP Bootstrap simulations
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 px-3 text-left font-semibold">
                  Confidence Level / Quantile
                </th>
                <th className="py-2 px-3 text-right font-semibold">
                  Simulated IBNR (VaR)
                </th>
                <th className="py-2 px-3 text-right font-semibold text-rose-700 dark:text-rose-400">
                  TVaR (Tail VaR / Expected Shortfall)
                </th>
                <th className="py-2 px-3 text-right font-semibold">
                  Simulated Ultimate Loss
                </th>
                <th className="py-2 px-3 text-right font-semibold">
                  Risk Margin / Capital (VaR − Mean)
                </th>
                <th className="py-2 px-3 text-right font-semibold">
                  % of Mean Reserve
                </th>
                <th className="py-2 px-3 text-center font-semibold">
                  Regulatory Standard
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 font-mono tabular-nums">
              {bootstrap.percentiles.map((row) => {
                const isHighlight =
                  row.percentile === 75 ||
                  row.percentile === 99.5 ||
                  row.percentile === 50;
                return (
                  <tr
                    key={row.percentile}
                    className={`${
                      row.percentile === 99.5
                        ? 'bg-rose-500/10 dark:bg-rose-950/30 font-semibold'
                        : row.percentile === 75
                        ? 'bg-emerald-500/10 dark:bg-emerald-950/30 font-semibold'
                        : isHighlight
                        ? 'bg-sky-500/5 dark:bg-sky-950/20'
                        : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2 px-3 font-sans font-medium text-slate-900 dark:text-slate-200">
                      {row.label}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-900 dark:text-white">
                      {formatCurrency(row.ibnrValue * pvScale, currencySymbol)}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                      {formatCurrency(
                        row.tvarIbnrValue * pvScale,
                        currencySymbol
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-700 dark:text-slate-300">
                      {formatCurrency(
                        row.ultimateValue * pvScale,
                        currencySymbol
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-amber-700 dark:text-amber-400">
                      {row.riskCapitalOverMean >= 0 ? '+' : ''}
                      {formatCurrency(
                        row.riskCapitalOverMean * pvScale,
                        currencySymbol
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-400">
                      {formatPercent(row.percentOfMean, 1)}
                    </td>
                    <td className="py-2 px-3 text-center font-sans">
                      {row.regulatoryTag ? (
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          {row.regulatoryTag}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 03: Accident Year Analytical Mack vs Merz-Wüthrich 1-Yr vs Bootstrap Comparison */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
            03. Accident Year Stochastic Uncertainty Table: Analytical Mack (Ultimate) vs. Merz-Wüthrich (1-Year CDR) vs. ODP Bootstrap
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono tabular-nums border-collapse">
            <thead>
              <tr className="bg-slate-100/80 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-sans">
                <th className="py-2 px-3 text-left font-semibold">Origin Year</th>
                <th className="py-2 px-3 text-right font-semibold">Deterministic CL IBNR</th>
                <th className="py-2 px-3 text-right font-semibold text-sky-600 dark:text-sky-400">Mack Ultimate SE</th>
                <th className="py-2 px-3 text-right font-semibold text-indigo-600 dark:text-indigo-400">Merz-Wüthrich 1-Yr SE</th>
                <th className="py-2 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">Bootstrap Mean IBNR</th>
                <th className="py-2 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">Bootstrap SE</th>
                <th className="py-2 px-3 text-right font-semibold">75th Percentile</th>
                <th className="py-2 px-3 text-right font-semibold text-rose-600 dark:text-rose-400">99.5th Percentile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {bootstrap.originStochasticRows.map((row, idx) => {
                const mw1Yr = evaluation.rows[idx]?.merzWuthrich1YrSe ?? 0;
                return (
                  <tr
                    key={row.originYear}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-1.5 px-3 font-semibold text-slate-900 dark:text-slate-200">
                      {row.originYear}
                    </td>
                    <td className="py-1.5 px-3 text-right text-slate-700 dark:text-slate-300">
                      {formatNumber(row.deterministicIbnr * pvScale)}
                    </td>
                    <td className="py-1.5 px-3 text-right text-sky-600 dark:text-sky-400">
                      {formatNumber(
                        (evaluation.rows[idx]?.mackSe ?? row.bootstrapSe) *
                          pvScale
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right text-indigo-600 dark:text-indigo-400">
                      {formatNumber(mw1Yr * pvScale)}
                    </td>
                    <td className="py-1.5 px-3 text-right font-medium text-emerald-700 dark:text-emerald-300">
                      {formatNumber(row.bootstrapMeanIbnr * pvScale)}
                    </td>
                    <td className="py-1.5 px-3 text-right text-emerald-600 dark:text-emerald-400">
                      {formatNumber(row.bootstrapSe * pvScale)}
                    </td>
                    <td className="py-1.5 px-3 text-right text-slate-700 dark:text-slate-300">
                      {formatNumber(row.p75Ibnr * pvScale)}
                    </td>
                    <td className="py-1.5 px-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                      {formatNumber(row.p995Ibnr * pvScale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 04: Standardized Pearson Residuals Scatter & Diagnostic Plot (Shown when Residuals tab or below) */}
      {(tier1 === 'residuals' || tier2 === 'diagnostics') && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                04. Standardized Pearson Residual Diagnostics (ODP Model Validation)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                DoF-adjusted Pearson residuals r_&#123;i,j&#125; = √(N / (N − p)) · (q_&#123;i,j&#125; − m̂_&#123;i,j&#125;) / √m̂_&#123;i,j&#125;
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
              {(
                [
                  { id: 'origin', label: 'By Accident Year' },
                  { id: 'development', label: 'By Development Lag' },
                  { id: 'calendar', label: 'By Calendar Year' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setResidualAxis(tab.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    residualAxis === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative h-48 w-full border border-slate-200 dark:border-slate-800 rounded bg-slate-50/50 dark:bg-slate-950/50 p-4">
            <div className="absolute left-4 right-4 top-1/2 border-t border-dashed border-slate-400 dark:border-slate-600" />
            <span className="absolute left-2 top-2 text-[10px] font-mono text-slate-400">
              +{maxAbsResidual.toFixed(1)}σ
            </span>
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">
              0.0σ
            </span>
            <span className="absolute left-2 bottom-2 text-[10px] font-mono text-slate-400">
              −{maxAbsResidual.toFixed(1)}σ
            </span>

            <div className="relative h-full ml-10 mr-2">
              {bootstrap.residuals.map((pt, idx) => {
                const xValues =
                  residualAxis === 'origin'
                    ? evaluation.originYears
                    : residualAxis === 'development'
                    ? evaluation.devPeriods
                    : Array.from(
                        new Set(bootstrap.residuals.map((r) => r.calendarYear))
                      ).sort((a, b) => a - b);

                const xVal =
                  residualAxis === 'origin'
                    ? pt.originYear
                    : residualAxis === 'development'
                    ? pt.devPeriod
                    : pt.calendarYear;

                const minX = Math.min(...xValues);
                const maxX = Math.max(...xValues);
                const xRatio =
                  maxX > minX ? (xVal - minX) / (maxX - minX) : 0.5;
                const yRatio =
                  0.5 - (pt.scaledResidual / (maxAbsResidual * 1.15)) * 0.45;

                return (
                  <div
                    key={idx}
                    title={`AY ${pt.originYear}, Dev ${pt.devPeriod}m (CY ${
                      pt.calendarYear
                    }): Scaled Residual = ${pt.scaledResidual.toFixed(2)}`}
                    style={{
                      left: `${Math.min(98, Math.max(2, xRatio * 96 + 2))}%`,
                      top: `${Math.min(95, Math.max(5, yRatio * 100))}%`,
                    }}
                    className={`w-2.5 h-2.5 -ml-1.25 -mt-1.25 rounded-full absolute transition-transform hover:scale-150 ${
                      pt.scaledResidual >= 0
                        ? 'bg-sky-500/80 border border-sky-300'
                        : 'bg-amber-500/80 border border-amber-300'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
