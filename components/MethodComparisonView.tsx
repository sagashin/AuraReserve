'use client';

import React, { useState } from 'react';
import {
  ActuarialEvaluation,
  MethodSelection,
} from '@/lib/actuarial-engine';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Scale, Sliders, CheckCircle2, Edit3 } from 'lucide-react';
import { DisplayUnitConfig, formatScaledNumber } from '@/lib/format-utils';

interface MethodComparisonViewProps {
  evaluation: ActuarialEvaluation;
  aprioriElr: number;
  bfWeight: number;
  benktanderIterations: number;
  selectedMethodByOrigin: Record<number, MethodSelection>;
  manualUltimates?: Record<number, number>;
  onAprioriElrChange: (val: number) => void;
  onBfWeightChange: (val: number) => void;
  onBenktanderIterationsChange: (val: number) => void;
  onSelectMethodForOrigin: (originIdx: number, method: MethodSelection) => void;
  onSelectMethodForAll: (method: MethodSelection) => void;
  onManualUltimateChange?: (originIdx: number, val: number | null) => void;
  bookedIbnrOverrides?: Record<number, number>;
  onBookedIbnrChange?: (originIdx: number, val: number | null) => void;
  unitConfig: DisplayUnitConfig;
}

const METHODS: { id: MethodSelection; label: string; short: string }[] = [
  { id: 'CL', label: 'Chain Ladder (CL)', short: 'CL' },
  { id: 'BF', label: 'Bornhuetter-Ferguson (BF)', short: 'BF' },
  { id: 'CC', label: 'Cape Cod (Stanard-Bühlmann)', short: 'CC' },
  { id: 'BENKTANDER', label: 'Benktander (Iterated BF)', short: 'Benk' },
  { id: 'ELR', label: 'Expected Loss Ratio (ELR)', short: 'ELR' },
  { id: 'FREQ_SEV', label: 'Frequency × Severity', short: 'F×S' },
  { id: 'BLEND', label: 'Credibility Blend (BF/CL)', short: 'Blend' },
];

export default function MethodComparisonView({
  evaluation,
  aprioriElr,
  bfWeight,
  benktanderIterations,
  manualUltimates = {},
  onAprioriElrChange,
  onBfWeightChange,
  onBenktanderIterationsChange,
  onSelectMethodForOrigin,
  onSelectMethodForAll,
  onManualUltimateChange,
  bookedIbnrOverrides = {},
  onBookedIbnrChange,
  unitConfig,
}: MethodComparisonViewProps) {
  const [editingUltRow, setEditingUltRow] = useState<number | null>(null);
  const [ultDraft, setUltDraft] = useState<string>('');
  const [editingBookedRow, setEditingBookedRow] = useState<number | null>(null);
  const [bookedDraft, setBookedDraft] = useState<string>('');
  const [localBookedOverrides, setLocalBookedOverrides] = useState<
    Record<number, number>
  >({});

  const effectiveBookedMap = {
    ...localBookedOverrides,
    ...bookedIbnrOverrides,
  };

  const getCohortBookedIbnr = (rIdx: number) => {
    if (effectiveBookedMap[rIdx] !== undefined) {
      return effectiveBookedMap[rIdx];
    }
    const row = evaluation.summaryRows[rIdx];
    if (!row) return 0;
    // Realistic default corporate booked/statutory IBNR (blend of BF & prior expectation)
    return Math.round(0.65 * row.bfIbnr + 0.35 * row.elrIbnr);
  };

  const handleCommitBookedIbnr = (rIdx: number) => {
    const parsed = parseFloat(bookedDraft.replace(/,/g, ''));
    if (!Number.isNaN(parsed) && parsed >= 0) {
      const rawVal = parsed * unitConfig.divisor;
      setLocalBookedOverrides((prev) => ({ ...prev, [rIdx]: rawVal }));
      if (onBookedIbnrChange) {
        onBookedIbnrChange(rIdx, rawVal);
      }
    }
    setEditingBookedRow(null);
  };

  const chartData = evaluation.summaryRows.map((row) => ({
    origin: row.originLabel,
    PaidLoss: Math.round(row.latestLoss / unitConfig.divisor),
    CaseReserve: Math.round(row.caseReserve / unitConfig.divisor),
    CL_IBNR: Math.round(row.clIbnr / unitConfig.divisor),
    BF_IBNR: Math.round(row.bfIbnr / unitConfig.divisor),
    CC_IBNR: Math.round(row.ccIbnr / unitConfig.divisor),
    Benk_IBNR: Math.round(row.benktanderIbnr / unitConfig.divisor),
    Selected_IBNR: Math.round(row.selectedIbnr / unitConfig.divisor),
  }));

  const handleCommitManualUltimate = (rIdx: number) => {
    if (!onManualUltimateChange) {
      setEditingUltRow(null);
      return;
    }
    const parsed = parseFloat(ultDraft.replace(/,/g, ''));
    if (!Number.isNaN(parsed) && parsed > 0) {
      onManualUltimateChange(rIdx, parsed * unitConfig.divisor);
      onSelectMethodForOrigin(rIdx, 'MANUAL');
    }
    setEditingUltRow(null);
  };

  return (
    <div className="space-y-6">
      {/* Parameter Controls Bar + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 4 Cols: Actuarial Method Parameters */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 p-5 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sliders className="w-4 h-4 text-sky-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Actuarial Method Parameters
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              A Priori ELR, Credibility Weight, Cape Cod Used-Up ELR & Benktander Iterations
            </p>
          </div>

          <div className="space-y-4">
            {/* A Priori ELR Slider */}
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs mb-2">
                <label
                  htmlFor="apriori-elr-range"
                  className="font-medium text-slate-700 dark:text-slate-300"
                >
                  A Priori Expected Loss Ratio (ELR)
                </label>
                <span className="font-mono font-semibold text-sky-600 dark:text-sky-400">
                  {(aprioriElr * 100).toFixed(1)}%
                </span>
              </div>
              <input
                id="apriori-elr-range"
                type="range"
                min="0.40"
                max="1.20"
                step="0.005"
                value={aprioriElr}
                onChange={(e) => onAprioriElrChange(parseFloat(e.target.value))}
                className="w-full accent-sky-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
                <span>40.0%</span>
                <span>
                  Cape Cod ELR: {(evaluation.capeCodElr * 100).toFixed(2)}%
                </span>
                <span>120.0%</span>
              </div>
            </div>

            {/* Credibility Weight Slider */}
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs mb-2">
                <label
                  htmlFor="bf-weight-range"
                  className="font-medium text-slate-700 dark:text-slate-300"
                >
                  Credibility Blend Weight (w_BF)
                </label>
                <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                  {(bfWeight * 100).toFixed(0)}% BF /{' '}
                  {((1 - bfWeight) * 100).toFixed(0)}% CL
                </span>
              </div>
              <input
                id="bf-weight-range"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={bfWeight}
                onChange={(e) => onBfWeightChange(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Benktander Iterations */}
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs mb-2">
                <label
                  htmlFor="benktander-iter-range"
                  className="font-medium text-slate-700 dark:text-slate-300"
                >
                  Benktander Iterations (m)
                </label>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  m = {benktanderIterations} (q = (1 - 1/CDF)^{benktanderIterations})
                </span>
              </div>
              <input
                id="benktander-iter-range"
                type="range"
                min="1"
                max="5"
                step="1"
                value={benktanderIterations}
                onChange={(e) =>
                  onBenktanderIterationsChange(parseInt(e.target.value, 10))
                }
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
                <span>m=1 (BF)</span>
                <span>m=2 (Std Benktander)</span>
                <span>m=5 (→ CL)</span>
              </div>
            </div>
          </div>

          {/* Bulk Apply Method */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Apply Method to All Origin Periods
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectMethodForAll(m.id)}
                  className="py-1.5 px-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-sky-500/10 dark:bg-slate-800/80 dark:hover:bg-sky-500/20 text-slate-700 dark:text-slate-200 hover:border-sky-500/40 transition-all cursor-pointer"
                >
                  All {m.short}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right 8 Cols: Comparative IBNR & Case Reserve Bar Chart */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Scale className="w-4 h-4 text-sky-500" />
                Multi-Method IBNR & Case Reserve Comparison ({unitConfig.badge})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Comparing CL, BF, Cape Cod, Benktander, Case Reserve (OS), and Selected IBNR
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#334155"
                  opacity={0.2}
                />
                <XAxis
                  dataKey="origin"
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
                  formatter={(value) => [
                    `${Number(value).toLocaleString()} (${unitConfig.badge})`,
                    '',
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar
                  dataKey="CaseReserve"
                  name="Case Reserve (OS)"
                  fill="#64748b"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="CL_IBNR"
                  name="Chain Ladder IBNR"
                  fill="#38bdf8"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="BF_IBNR"
                  name="Bornhuetter-Ferguson IBNR"
                  fill="#f59e0b"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="Benk_IBNR"
                  name="Benktander IBNR"
                  fill="#a855f7"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="Selected_IBNR"
                  name="Selected IBNR"
                  fill="#10b981"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Origin-by-Origin Valuation Schedule */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Reserve Selection & Unpaid Liability Schedule ({unitConfig.badge})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select CL, BF, CC, Benktander, ELR, Freq×Sev, Blend, or click Selected Ultimate to enter a Manual Override.
            </p>
          </div>
          <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>
              Total Unpaid (OS + IBNR):{' '}
              {formatScaledNumber(
                evaluation.totals.totalUnpaidReserve,
                unitConfig
              )}{' '}
              {unitConfig.badge}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-2.5 text-left font-semibold">Origin</th>
                <th className="py-2.5 px-2.5 text-right font-semibold">
                  Paid Loss
                </th>
                <th className="py-2.5 px-2.5 text-right font-semibold text-amber-600 dark:text-amber-400">
                  Case OS
                </th>
                <th className="py-2.5 px-2.5 text-right font-semibold">
                  CDF
                </th>
                <th className="py-2.5 px-2.5 text-right font-semibold text-sky-600 dark:text-sky-400">
                  CL IBNR
                </th>
                <th className="py-2.5 px-2.5 text-right font-semibold text-amber-600 dark:text-amber-400">
                  BF IBNR
                </th>
                <th className="py-2.5 px-2.5 text-right font-semibold text-purple-600 dark:text-purple-400">
                  Benk IBNR
                </th>
                <th className="py-2.5 px-2.5 text-right font-semibold text-indigo-600 dark:text-indigo-400">
                  CC IBNR
                </th>
                <th className="py-2.5 px-2.5 text-right font-semibold text-teal-600 dark:text-teal-400">
                  F×S IBNR
                </th>
                <th className="py-2.5 px-2.5 text-center font-semibold">
                  Active Method
                </th>
                <th className="py-2.5 px-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                  Selected IBNR
                </th>
                <th className="py-2.5 px-2.5 text-right font-semibold text-sky-700 dark:text-sky-300">
                  Total Unpaid (OS+IBNR)
                </th>
                <th className="py-2.5 px-2.5 text-right font-semibold">
                  Selected Ultimate
                </th>
                <th className="py-2.5 px-2.5 text-right font-semibold">
                  Ult LR
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
              {evaluation.summaryRows.map((row) => {
                const isEditingUlt = editingUltRow === row.originIndex;
                const hasManualUlt =
                  manualUltimates[row.originIndex] !== undefined &&
                  row.selectedMethod === 'MANUAL';

                return (
                  <tr
                    key={row.originLabel}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-2 px-2.5 font-semibold font-mono text-slate-900 dark:text-slate-100">
                      {row.originLabel}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatScaledNumber(row.latestLoss, unitConfig)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-amber-700 dark:text-amber-300">
                      {formatScaledNumber(row.caseReserve, unitConfig)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
                      {row.cdf.toFixed(4)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-sky-700 dark:text-sky-300">
                      {formatScaledNumber(row.clIbnr, unitConfig)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-amber-700 dark:text-amber-300">
                      {formatScaledNumber(row.bfIbnr, unitConfig)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-purple-700 dark:text-purple-300">
                      {formatScaledNumber(row.benktanderIbnr, unitConfig)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-indigo-700 dark:text-indigo-300">
                      {formatScaledNumber(row.ccIbnr, unitConfig)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-teal-700 dark:text-teal-300">
                      {formatScaledNumber(row.freqSevIbnr, unitConfig)}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <div className="inline-flex rounded-md p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        {METHODS.map((m) => {
                          const active = row.selectedMethod === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              title={m.label}
                              onClick={() =>
                                onSelectMethodForOrigin(row.originIndex, m.id)
                              }
                              className={`px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded transition-colors cursor-pointer ${
                                active
                                  ? 'bg-sky-600 text-white shadow-2xs'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                              }`}
                            >
                              {m.short}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/5">
                      {formatScaledNumber(row.selectedIbnr, unitConfig)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums font-bold text-sky-700 dark:text-sky-300 bg-sky-500/5">
                      {formatScaledNumber(row.totalUnpaidReserve, unitConfig)}
                    </td>
                    <td
                      onClick={() => {
                        if (!isEditingUlt && onManualUltimateChange) {
                          setEditingUltRow(row.originIndex);
                          setUltDraft(
                            String(
                              Math.round(
                                row.selectedUltimate / unitConfig.divisor
                              )
                            )
                          );
                        }
                      }}
                      title="Click to enter Manual Ultimate Override"
                      className={`py-2 px-2.5 text-right font-mono tabular-nums font-semibold cursor-pointer ${
                        hasManualUlt
                          ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
                          : 'text-slate-900 dark:text-slate-100 hover:bg-sky-500/10'
                      }`}
                    >
                      {isEditingUlt ? (
                        <input
                          type="number"
                          value={ultDraft}
                          autoFocus
                          onChange={(e) => setUltDraft(e.target.value)}
                          onBlur={() =>
                            handleCommitManualUltimate(row.originIndex)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')
                              handleCommitManualUltimate(row.originIndex);
                            if (e.key === 'Escape') setEditingUltRow(null);
                          }}
                          className="w-24 px-1.5 py-0.5 text-right font-mono text-xs rounded bg-white dark:bg-slate-950 border border-sky-500"
                        />
                      ) : (
                        <span className="inline-flex items-center justify-end gap-1">
                          {formatScaledNumber(row.selectedUltimate, unitConfig)}
                          <Edit3 className="w-3 h-3 text-slate-400 opacity-60" />
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {(row.selectedLossRatio * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}

              {/* Portfolio Total Footer Row */}
              <tr className="bg-slate-100/90 dark:bg-slate-950 font-semibold border-t-2 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
                <td className="py-2.5 px-2.5 font-mono">Total</td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                  {formatScaledNumber(evaluation.totals.latestLoss, unitConfig)}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
                  {formatScaledNumber(
                    evaluation.totals.caseReserve,
                    unitConfig
                  )}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono text-slate-400">
                  —
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-sky-600 dark:text-sky-400">
                  {formatScaledNumber(evaluation.totals.clIbnr, unitConfig)}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
                  {formatScaledNumber(evaluation.totals.bfIbnr, unitConfig)}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-purple-600 dark:text-purple-400">
                  {formatScaledNumber(
                    evaluation.totals.benktanderIbnr,
                    unitConfig
                  )}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                  {formatScaledNumber(evaluation.totals.ccIbnr, unitConfig)}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-teal-600 dark:text-teal-400">
                  {formatScaledNumber(
                    evaluation.totals.freqSevIbnr,
                    unitConfig
                  )}
                </td>
                <td className="py-2.5 px-2.5 text-center font-mono text-xs text-slate-500">
                  Selected
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                  {formatScaledNumber(
                    evaluation.totals.selectedIbnr,
                    unitConfig
                  )}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-sky-600 dark:text-sky-300 bg-sky-500/10">
                  {formatScaledNumber(
                    evaluation.totals.totalUnpaidReserve,
                    unitConfig
                  )}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                  {formatScaledNumber(
                    evaluation.totals.selectedUltimate,
                    unitConfig
                  )}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                  {(evaluation.totals.overallLossRatio * 100).toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Corporate Closing Bridge — Booked / Statutory Reserve vs. Actuarial Best Estimate (LAT) */}
      {(() => {
        const bridgeRows = evaluation.summaryRows.map((row, idx) => {
          const bookedIbnr = getCohortBookedIbnr(idx);
          const bookedTotalUnpaid = row.caseReserve + bookedIbnr;
          const actIbnr = row.selectedIbnr;
          const actTotalUnpaid = row.totalUnpaidReserve;
          const ibnrSurplusDeficiency = bookedIbnr - actIbnr;
          const sufficiencyPct =
            actIbnr > 1 ? (bookedIbnr / actIbnr) * 100 : 100;
          return {
            row,
            idx,
            bookedIbnr,
            bookedTotalUnpaid,
            actIbnr,
            actTotalUnpaid,
            ibnrSurplusDeficiency,
            sufficiencyPct,
          };
        });

        const totalBookedIbnr = bridgeRows.reduce(
          (s, b) => s + b.bookedIbnr,
          0
        );
        const totalActIbnr = evaluation.totals.selectedIbnr;
        const totalSurplusDeficiency = totalBookedIbnr - totalActIbnr;
        const totalSufficiencyPct =
          totalActIbnr > 1 ? (totalBookedIbnr / totalActIbnr) * 100 : 100;

        return (
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Corporate Closing Bridge: Booked / Statutory IBNR vs. Actuarial Best Estimate (決算計上備金・法定IBNR 過不足ブリッジ検証 / LAT)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  現行計上備金（または法定普通IBNR・予算見込値）をクリックして直接入力し、数理ベストエスティメイト（Selected IBNR）との過不足（余剰/不足）を検証します。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<number, number> = {};
                    evaluation.summaryRows.forEach((r, idx) => {
                      next[idx] = Math.round(r.elrIbnr);
                    });
                    setLocalBookedOverrides(next);
                  }}
                  className="px-2.5 py-1 rounded text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  予定損害率(ELR)基準をセット
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<number, number> = {};
                    evaluation.summaryRows.forEach((r, idx) => {
                      next[idx] = Math.round(r.selectedIbnr * 1.05);
                    });
                    setLocalBookedOverrides(next);
                  }}
                  className="px-2.5 py-1 rounded text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  保守的(+5% Buffer)をセット
                </button>
                <button
                  type="button"
                  onClick={() => setLocalBookedOverrides({})}
                  className="px-2.5 py-1 rounded text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  初期値リセット
                </button>
              </div>
            </div>

            {/* 4-Card LAT Sufficiency Summary Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 bg-slate-50/60 dark:bg-slate-950/40 border-b border-slate-200/70 dark:border-slate-800/70">
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">
                  Total Booked / Statutory IBNR (現行計上備金)
                </div>
                <div className="mt-1 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {formatScaledNumber(totalBookedIbnr, unitConfig)}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    {unitConfig.badge}
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">
                  Actuarial Best Estimate IBNR (数理推計値)
                </div>
                <div className="mt-1 text-base font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">
                  {formatScaledNumber(totalActIbnr, unitConfig)}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    {unitConfig.badge}
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">
                  Reserve Surplus / Deficiency (備金過不足額)
                </div>
                <div
                  className={`mt-1 text-base font-bold font-mono tabular-nums ${
                    totalSurplusDeficiency >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {totalSurplusDeficiency >= 0 ? '+' : ''}
                  {formatScaledNumber(totalSurplusDeficiency, unitConfig)}{' '}
                  <span className="text-xs font-normal">
                    ({totalSurplusDeficiency >= 0 ? '余剰 Redundancy' : '不足 Deficiency'})
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">
                  LAT Sufficiency Ratio (負債十分性比率)
                </div>
                <div
                  className={`mt-1 text-base font-bold font-mono tabular-nums ${
                    totalSufficiencyPct >= 100
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {totalSufficiencyPct.toFixed(1)}% ·{' '}
                  {totalSufficiencyPct >= 100 ? 'LAT 適格 (Adequate)' : '追加積立検討'}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs font-mono tabular-nums">
                <thead>
                  <tr className="bg-slate-50/90 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2 px-3 text-left font-sans font-semibold">
                      Origin
                    </th>
                    <th className="py-2 px-3 text-right font-sans font-semibold">
                      Active Method
                    </th>
                    <th className="py-2 px-3 text-right font-sans font-semibold text-sky-600 dark:text-sky-400">
                      Actuarial Selected IBNR
                    </th>
                    <th className="py-2 px-3 text-right font-sans font-semibold text-amber-600 dark:text-amber-400">
                      Booked / Statutory IBNR (Click to Edit)
                    </th>
                    <th className="py-2 px-3 text-right font-sans font-semibold">
                      Surplus / (Deficiency) 過不足額
                    </th>
                    <th className="py-2 px-3 text-right font-sans font-semibold">
                      Sufficiency % (十分性比率)
                    </th>
                    <th className="py-2 px-3 text-right font-sans font-semibold">
                      Mack ±1 SE Band Check
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                  {bridgeRows.map((b) => {
                    const isEditing = editingBookedRow === b.idx;
                    const withinOneSe =
                      Math.abs(b.ibnrSurplusDeficiency) <=
                      Math.max(1, b.row.mackSe);
                    return (
                      <tr
                        key={b.row.originLabel}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30"
                      >
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
                          {b.row.originLabel}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-500">
                          {b.row.selectedMethod}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-sky-700 dark:text-sky-300">
                          {formatScaledNumber(b.actIbnr, unitConfig)}
                        </td>
                        <td
                          onClick={() => {
                            if (!isEditing) {
                              setEditingBookedRow(b.idx);
                              setBookedDraft(
                                String(
                                  Math.round(b.bookedIbnr / unitConfig.divisor)
                                )
                              );
                            }
                          }}
                          title="Click to edit Booked / Statutory IBNR for this origin cohort"
                          className="py-2 px-3 text-right font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/5 hover:bg-amber-500/15 cursor-pointer"
                        >
                          {isEditing ? (
                            <input
                              type="number"
                              aria-label={`Booked IBNR for ${b.row.originLabel}`}
                              value={bookedDraft}
                              autoFocus
                              onChange={(e) => setBookedDraft(e.target.value)}
                              onBlur={() => handleCommitBookedIbnr(b.idx)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter')
                                  handleCommitBookedIbnr(b.idx);
                                if (e.key === 'Escape')
                                  setEditingBookedRow(null);
                              }}
                              className="w-24 px-1.5 py-0.5 text-right font-mono text-xs rounded bg-white dark:bg-slate-950 border border-amber-500"
                            />
                          ) : (
                            <span className="inline-flex items-center justify-end gap-1">
                              {formatScaledNumber(b.bookedIbnr, unitConfig)}
                              <Edit3 className="w-3 h-3 text-slate-400 opacity-60" />
                            </span>
                          )}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-semibold ${
                            b.ibnrSurplusDeficiency >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {b.ibnrSurplusDeficiency >= 0 ? '+' : ''}
                          {formatScaledNumber(
                            b.ibnrSurplusDeficiency,
                            unitConfig
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {b.sufficiencyPct.toFixed(1)}%
                        </td>
                        <td className="py-2 px-3 text-right font-sans text-[11px]">
                          {withinOneSe ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              Within ±1σ SE
                            </span>
                          ) : b.ibnrSurplusDeficiency > 0 ? (
                            <span className="text-sky-600 dark:text-sky-400">
                              Conservative (&gt;+1σ)
                            </span>
                          ) : (
                            <span className="text-rose-600 dark:text-rose-400 font-semibold">
                              Below -1σ SE
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-100/90 dark:bg-slate-950 font-bold border-t-2 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
                    <td className="py-2.5 px-3">Portfolio Total</td>
                    <td className="py-2.5 px-3 text-right">—</td>
                    <td className="py-2.5 px-3 text-right text-sky-600 dark:text-sky-400">
                      {formatScaledNumber(totalActIbnr, unitConfig)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-600 dark:text-amber-400">
                      {formatScaledNumber(totalBookedIbnr, unitConfig)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right ${
                        totalSurplusDeficiency >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {totalSurplusDeficiency >= 0 ? '+' : ''}
                      {formatScaledNumber(totalSurplusDeficiency, unitConfig)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {totalSufficiencyPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans text-xs">
                      {totalSufficiencyPct >= 100
                        ? 'Adequate (十分)'
                        : 'Deficient (要検証)'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
