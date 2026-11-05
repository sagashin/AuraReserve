'use client';

import React, { useMemo, useState } from 'react';
import {
  ActuarialEvaluation,
  BootstrapSimulationResult,
  ScrHorizonRegime,
  computeSolvencyIfrsCompliance,
} from '@/lib/actuarial-engine';
import {
  DisplayUnitConfig,
  DEFAULT_UNIT_CONFIG,
  formatScaledNumber,
  formatPct,
} from '@/lib/format-utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Legend,
} from 'recharts';
import {
  ShieldCheck,
  Landmark,
  Scale,
  TrendingDown,
  RefreshCw,
  Layers,
  CheckCircle2,
  Info,
} from 'lucide-react';

interface SolvencyIfrsComplianceViewProps {
  evaluation: ActuarialEvaluation;
  bootstrap: BootstrapSimulationResult;
  originLabels: string[];
  iterations: number;
  seed: number;
  discountRate: number;
  onDiscountRateChange: (rate: number) => void;
  onRunSimulation: (iterations: number, seed: number) => void;
  unitConfig?: DisplayUnitConfig;
}

export default function SolvencyIfrsComplianceView({
  evaluation,
  bootstrap,
  originLabels,
  iterations,
  seed,
  discountRate,
  onDiscountRateChange,
  onRunSimulation,
  unitConfig = DEFAULT_UNIT_CONFIG,
}: SolvencyIfrsComplianceViewProps) {
  const [regime, setRegime] = useState<ScrHorizonRegime>('ultimate_995_var');
  const [cocRate, setCocRate] = useState<number>(0.06);
  const [ifrs17ConfidenceLevel, setIfrs17ConfidenceLevel] =
    useState<number>(0.85);

  const compliance = useMemo(() => {
    return computeSolvencyIfrsCompliance({
      evaluation,
      bootstrap,
      originLabels,
      regime,
      cocRate,
      ifrs17ConfidenceLevel,
    });
  }, [
    evaluation,
    bootstrap,
    originLabels,
    regime,
    cocRate,
    ifrs17ConfidenceLevel,
  ]);

  const balanceSheetBridgeData = useMemo(() => {
    return [
      {
        stage: '1. Nominal Unpaid (J-GAAP)',
        belPv: Number(
          (compliance.discountedBelPv / unitConfig.divisor).toFixed(
            unitConfig.decimals
          )
        ),
        discountCredit: Number(
          (compliance.discountCredit / unitConfig.divisor).toFixed(
            unitConfig.decimals
          )
        ),
        riskMarginOrRa: 0,
        scrCapital: 0,
      },
      {
        stage: '2. Discounted BEL (PV)',
        belPv: Number(
          (compliance.discountedBelPv / unitConfig.divisor).toFixed(
            unitConfig.decimals
          )
        ),
        discountCredit: 0,
        riskMarginOrRa: 0,
        scrCapital: 0,
      },
      {
        stage: `3. IFRS 17 FCF (RA ${(ifrs17ConfidenceLevel * 100).toFixed(0)}%)`,
        belPv: Number(
          (compliance.discountedBelPv / unitConfig.divisor).toFixed(
            unitConfig.decimals
          )
        ),
        discountCredit: 0,
        riskMarginOrRa: Number(
          (compliance.ifrs17RiskAdjustment / unitConfig.divisor).toFixed(
            unitConfig.decimals
          )
        ),
        scrCapital: 0,
      },
      {
        stage: `4. Solvency II TP (CoC ${(cocRate * 100).toFixed(0)}%)`,
        belPv: Number(
          (compliance.discountedBelPv / unitConfig.divisor).toFixed(
            unitConfig.decimals
          )
        ),
        discountCredit: 0,
        riskMarginOrRa: Number(
          (compliance.solvencyIIRiskMarginCoC / unitConfig.divisor).toFixed(
            unitConfig.decimals
          )
        ),
        scrCapital: 0,
      },
      {
        stage: '5. Economic Balance Sheet (TP + SCR)',
        belPv: Number(
          (compliance.discountedBelPv / unitConfig.divisor).toFixed(
            unitConfig.decimals
          )
        ),
        discountCredit: 0,
        riskMarginOrRa: Number(
          (compliance.solvencyIIRiskMarginCoC / unitConfig.divisor).toFixed(
            unitConfig.decimals
          )
        ),
        scrCapital: Number(
          (compliance.selectedScr / unitConfig.divisor).toFixed(
            unitConfig.decimals
          )
        ),
      },
    ];
  }, [compliance, cocRate, ifrs17ConfidenceLevel, unitConfig]);

  const runoffChartData = useMemo(() => {
    return compliance.runoffSchedule.map((r) => ({
      calendarYear: `CY ${r.calendarYear}`,
      openingBelPv: Number(
        (r.openingUnpaidBelPv / unitConfig.divisor).toFixed(unitConfig.decimals)
      ),
      projectedScr: Number(
        (r.projectedScr / unitConfig.divisor).toFixed(unitConfig.decimals)
      ),
      discountedCocRm: Number(
        (r.discountedCocRm / unitConfig.divisor).toFixed(unitConfig.decimals)
      ),
    }));
  }, [compliance.runoffSchedule, unitConfig]);

  return (
    <div className="space-y-6">
      {/* Top ERM & Solvency II / IFRS 17 Parameter Control Bar */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Solvency II / J-ICS & IFRS 17 Enterprise Risk Management (ERM) Compliance
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                ODP Bootstrap ({bootstrap.iterations.toLocaleString()} Sims)
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Required Capital (SCR @ 99.5% VaR / 99.0% TVaR) · Solvency II Art. 37 Cost-of-Capital Risk Margin · IFRS 17 Fulfilment Cash Flows (FCF & RA)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* 1. Regulatory SCR Regime */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200/80 dark:border-slate-800">
            {(
              [
                {
                  id: 'ultimate_995_var',
                  label: 'Solvency II / J-ICS Ult (99.5% VaR)',
                },
                {
                  id: 'one_year_995_var',
                  label: 'Solvency II 1-Yr (99.5% VaR)',
                },
                {
                  id: 'sst_990_tvar',
                  label: 'Swiss SST / ERM (99.0% TVaR)',
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRegime(opt.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  regime === opt.id
                    ? 'bg-sky-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 2. Cost of Capital (CoC) Rate */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              CoC資本コスト率:
            </span>
            <select
              aria-label="Cost of Capital Rate"
              value={cocRate}
              onChange={(e) => setCocRate(Number(e.target.value))}
              className="bg-transparent text-xs font-mono font-bold text-amber-600 dark:text-amber-400 focus:outline-none cursor-pointer"
            >
              <option value={0.04}>4.0%</option>
              <option value={0.05}>5.0%</option>
              <option value={0.06}>6.0% (Solvency II Std)</option>
              <option value={0.07}>7.0%</option>
              <option value={0.08}>8.0%</option>
            </select>
          </div>

          {/* 3. IFRS 17 Risk Adjustment Confidence Level */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              IFRS 17 RA信頼水準:
            </span>
            <select
              aria-label="IFRS 17 Risk Adjustment Confidence Level"
              value={ifrs17ConfidenceLevel}
              onChange={(e) => setIfrs17ConfidenceLevel(Number(e.target.value))}
              className="bg-transparent text-xs font-mono font-bold text-sky-600 dark:text-sky-400 focus:outline-none cursor-pointer"
            >
              <option value={0.7}>70.0% Percentile</option>
              <option value={0.75}>75.0% Percentile</option>
              <option value={0.8}>80.0% Percentile</option>
              <option value={0.85}>85.0% Percentile</option>
              <option value={0.9}>90.0% Percentile</option>
            </select>
          </div>

          {/* 4. Risk-Free Discount Rate */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              割引率 (y):
            </span>
            <select
              aria-label="Risk-Free Discount Rate"
              value={discountRate}
              onChange={(e) => onDiscountRateChange(Number(e.target.value))}
              className="bg-transparent text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none cursor-pointer"
            >
              <option value={0}>0.00% (Undiscounted)</option>
              <option value={0.01}>1.00%</option>
              <option value={0.015}>1.50%</option>
              <option value={0.02}>2.00%</option>
              <option value={0.025}>2.50%</option>
              <option value={0.03}>3.00%</option>
              <option value={0.04}>4.00%</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => onRunSimulation(iterations, seed + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>ODP再シミュレーション</span>
          </button>
        </div>
      </div>

      {/* 5-Card Executive Solvency II & IFRS 17 KPI Summary Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Required Capital (SCR) */}
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/5 dark:bg-rose-950/25 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-rose-700 dark:text-rose-300 font-semibold">
            <span>Required Capital (SCR · 所要自己資本)</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15">
              {regime === 'one_year_995_var'
                ? '1-Yr 99.5% VaR'
                : regime === 'sst_990_tvar'
                ? '99.0% TVaR'
                : 'Ult 99.5% VaR'}
            </span>
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400">
            {formatScaledNumber(compliance.selectedScr, unitConfig)}
          </div>
          <div className="mt-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
            SCR / BEL Ratio: {formatPct(compliance.scrToBelRatio, 1)} · 1Yr/Ult:{' '}
            {formatPct(compliance.oneYearToUltimateRatio, 1)}
          </div>
        </div>

        {/* Card 2: Solvency II Technical Provisions (BEL PV + CoC RM) */}
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 dark:bg-amber-950/25 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-amber-800 dark:text-amber-300 font-semibold">
            <span>Solvency II Technical Provisions</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15">
              CoC {(cocRate * 100).toFixed(1)}%
            </span>
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatScaledNumber(
              compliance.solvencyIITechnicalProvisions,
              unitConfig
            )}
          </div>
          <div className="mt-1 text-[11px] font-mono text-amber-700 dark:text-amber-300">
            Risk Margin (RM): +
            {formatScaledNumber(compliance.solvencyIIRiskMarginCoC, unitConfig)}{' '}
            ({formatPct(compliance.solvencyIIRmToBelRatio, 1)})
          </div>
        </div>

        {/* Card 3: IFRS 17 Fulfilment Cash Flows (BEL PV + RA) */}
        <div className="rounded-xl border border-sky-500/35 bg-sky-500/5 dark:bg-sky-950/25 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-sky-700 dark:text-sky-300 font-semibold">
            <span>IFRS 17 Fulfilment Cash Flows (FCF)</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15">
              RA {(ifrs17ConfidenceLevel * 100).toFixed(0)}%
            </span>
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">
            {formatScaledNumber(
              compliance.ifrs17FulfilmentCashFlows,
              unitConfig
            )}
          </div>
          <div className="mt-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
            Risk Adj (RA): +
            {formatScaledNumber(compliance.ifrs17RiskAdjustment, unitConfig)} (
            {formatPct(compliance.ifrs17RaToBelRatio, 1)})
          </div>
        </div>

        {/* Card 4: Discounted Best Estimate Liability (BEL PV) */}
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Discounted Best Estimate (BEL PV)</span>
            <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
              y={(discountRate * 100).toFixed(2)}%
            </span>
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatScaledNumber(compliance.discountedBelPv, unitConfig)}
          </div>
          <div className="mt-1 text-[11px] font-mono text-slate-500">
            Nominal Unpaid: {formatScaledNumber(compliance.nominalTotalUnpaid, unitConfig)} · Disc Credit: -
            {formatScaledNumber(compliance.discountCredit, unitConfig)}
          </div>
        </div>

        {/* Card 5: Standard Formula (3σ) vs ODP Internal Model SCR */}
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Std Formula (3σ) vs Internal Model</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatScaledNumber(compliance.standardFormula3SigmaScr, unitConfig)}
          </div>
          <div className="mt-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
            CoC Implied Quantile:{' '}
            {formatPct(compliance.cocImpliedConfidenceLevel, 1)} · Saving:{' '}
            {compliance.internalModelCapitalSaving >= 0 ? '+' : ''}
            {formatScaledNumber(
              compliance.internalModelCapitalSaving,
              unitConfig
            )}
          </div>
        </div>
      </div>

      {/* Charts Row: 01. Balance Sheet Bridge & 02. Multi-Year SCR Run-Off Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Chart: Regulatory Valuation Bridge (J-GAAP Nominal -> BEL PV -> IFRS 17 FCF -> Solvency II TP -> Total Economic Capital) */}
        <div className="lg:col-span-6 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 p-5 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Landmark className="w-4 h-4 text-sky-500" />
                01. Regulatory Balance Sheet Bridge (J-GAAP vs. IFRS 17 FCF vs. Solvency II TP & SCR)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Comparison of Discounted Best Estimate (BEL), IFRS 17 Risk Adjustment, Solvency II Risk Margin, and Required Capital (SCR) in {unitConfig.badge}
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={balanceSheetBridgeData}
                margin={{ top: 12, right: 16, left: 10, bottom: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#334155"
                  opacity={0.22}
                />
                <XAxis
                  dataKey="stage"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  interval={0}
                  angle={-10}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => `${Number(v).toLocaleString()}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar
                  dataKey="belPv"
                  name="Discounted BEL (PV)"
                  stackId="a"
                  fill="#0ea5e9"
                  radius={[0, 0, 4, 4]}
                />
                <Bar
                  dataKey="discountCredit"
                  name="Discount Credit (Time Value)"
                  stackId="a"
                  fill="#94a3b8"
                />
                <Bar
                  dataKey="riskMarginOrRa"
                  name="Risk Margin (CoC) / IFRS 17 RA"
                  stackId="a"
                  fill="#f59e0b"
                />
                <Bar
                  dataKey="scrCapital"
                  name="Required Capital (SCR)"
                  stackId="a"
                  fill="#f43f5e"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Chart: Solvency II Art. 37 Multi-Year SCR(t) Run-Off & Cost-of-Capital Trajectory */}
        <div className="lg:col-span-6 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 p-5 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-amber-500" />
                02. Solvency II Art. 37 Multi-Year SCR(t) Run-Off & Cost-of-Capital Profile
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Projected future Required Capital SCR(t) proportional to remaining BEL PV and discounted {formatPct(cocRate, 1)} Cost-of-Capital charges
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={runoffChartData}
                margin={{ top: 12, right: 16, left: 10, bottom: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#334155"
                  opacity={0.22}
                />
                <XAxis
                  dataKey="calendarYear"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => `${Number(v).toLocaleString()}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar
                  dataKey="projectedScr"
                  name="Projected SCR(t)"
                  fill="#f43f5e"
                  opacity={0.85}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="discountedCocRm"
                  name="Discounted CoC Risk Margin Contribution"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="openingBelPv"
                  name="Opening Remaining BEL (PV)"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Table 01: Multi-Year SCR Run-Off & Cost-of-Capital Risk Margin Schedule */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Scale className="w-4 h-4 text-amber-500" />
              03. Solvency II Art. 37 Multi-Year SCR(t) Run-Off & Cost-of-Capital (CoC) Schedule
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Formula: RM = CoC ({formatPct(cocRate, 1)}) × Σ [ SCR(t) / (1 + y)^(t+1) ] where y = {formatPct(discountRate, 2)} · Display Unit: {unitConfig.badge}
            </p>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25">
            Total CoC Risk Margin ={' '}
            {formatScaledNumber(compliance.solvencyIIRiskMarginCoC, unitConfig)}{' '}
            {unitConfig.badge} (Implied IFRS 17 Quantile:{' '}
            {formatPct(compliance.cocImpliedConfidenceLevel, 1)})
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4 text-left font-semibold">
                  Projection Year (t)
                </th>
                <th className="py-2.5 px-4 text-right font-semibold">
                  Run-Off Share w(t)
                </th>
                <th className="py-2.5 px-4 text-right font-semibold">
                  Opening BEL (PV)
                </th>
                <th className="py-2.5 px-4 text-right font-semibold">
                  Calendar Paid CF (Nominal)
                </th>
                <th className="py-2.5 px-4 text-right font-semibold text-rose-600 dark:text-rose-400">
                  Projected SCR(t)
                </th>
                <th className="py-2.5 px-4 text-right font-semibold">
                  Nominal CoC Charge ({formatPct(cocRate, 1)})
                </th>
                <th className="py-2.5 px-4 text-right font-semibold">
                  Discount Factor (1+y)^-(t+1)
                </th>
                <th className="py-2.5 px-4 text-right font-semibold text-amber-600 dark:text-amber-400">
                  Discounted CoC RM Contribution
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 font-mono tabular-nums">
              {compliance.runoffSchedule.map((row) => (
                <tr
                  key={row.calendarYear}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <td className="py-2 px-4 font-semibold text-slate-900 dark:text-slate-100">
                    CY {row.calendarYear} (t={row.stepIndex})
                  </td>
                  <td className="py-2 px-4 text-right text-slate-600 dark:text-slate-400">
                    {formatPct(row.runoffShare, 1)}
                  </td>
                  <td className="py-2 px-4 text-right text-slate-800 dark:text-slate-200">
                    {formatScaledNumber(row.openingUnpaidBelPv, unitConfig)}
                  </td>
                  <td className="py-2 px-4 text-right text-slate-600 dark:text-slate-400">
                    {formatScaledNumber(row.paidCashflowNominal, unitConfig)}
                  </td>
                  <td className="py-2 px-4 text-right font-semibold text-rose-600 dark:text-rose-400">
                    {formatScaledNumber(row.projectedScr, unitConfig)}
                  </td>
                  <td className="py-2 px-4 text-right text-slate-700 dark:text-slate-300">
                    {formatScaledNumber(row.nominalCocCharge, unitConfig)}
                  </td>
                  <td className="py-2 px-4 text-right text-slate-500">
                    {row.discountFactor.toFixed(4)}
                  </td>
                  <td className="py-2 px-4 text-right font-bold text-amber-600 dark:text-amber-400 bg-amber-500/5">
                    {formatScaledNumber(row.discountedCocRm, unitConfig)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/90 dark:bg-slate-950 font-mono tabular-nums font-bold text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-slate-700">
                <td className="py-2.5 px-4">Total Run-Off Horizon</td>
                <td className="py-2.5 px-4 text-right">100.0%</td>
                <td className="py-2.5 px-4 text-right">
                  {formatScaledNumber(compliance.discountedBelPv, unitConfig)}
                </td>
                <td className="py-2.5 px-4 text-right">
                  {formatScaledNumber(compliance.nominalIbnr, unitConfig)}
                </td>
                <td className="py-2.5 px-4 text-right text-rose-600 dark:text-rose-400">
                  {formatScaledNumber(compliance.selectedScr, unitConfig)} (t=0)
                </td>
                <td className="py-2.5 px-4 text-right">
                  {formatScaledNumber(
                    compliance.runoffSchedule.reduce(
                      (s, r) => s + r.nominalCocCharge,
                      0
                    ),
                    unitConfig
                  )}
                </td>
                <td className="py-2.5 px-4 text-right">—</td>
                <td className="py-2.5 px-4 text-right text-amber-600 dark:text-amber-400 bg-amber-500/10">
                  {formatScaledNumber(
                    compliance.solvencyIIRiskMarginCoC,
                    unitConfig
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Table 02: Origin Cohort ERM Capital Allocation & IFRS 17 / Solvency II Valuation Matrix */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-500" />
              04. Origin Cohort ERM Capital Allocation & IFRS 17 / Solvency II Valuation Matrix
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cohort-level allocation of Discounted BEL (PV), IFRS 17 Risk Adjustment & FCF, Solvency II Risk Margin & Technical Provisions, and Required Capital (SCR)
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Info className="w-3.5 h-3.5 text-sky-500" />
            <span>
              Allocation Basis:{' '}
              {regime === 'one_year_995_var'
                ? 'Merz-Wüthrich 1-Yr CDR SE'
                : 'Mack Ultimate SE Risk Contribution'}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3.5 text-left font-semibold">
                  Origin Cohort
                </th>
                <th className="py-2.5 px-3.5 text-right font-semibold">
                  Nominal Unpaid (OS+IBNR)
                </th>
                <th className="py-2.5 px-3.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                  Discounted BEL (PV)
                </th>
                <th className="py-2.5 px-3.5 text-right font-semibold">
                  Risk Share %
                </th>
                <th className="py-2.5 px-3.5 text-right font-semibold text-sky-600 dark:text-sky-400">
                  IFRS 17 RA ({(ifrs17ConfidenceLevel * 100).toFixed(0)}%)
                </th>
                <th className="py-2.5 px-3.5 text-right font-semibold text-sky-700 dark:text-sky-300">
                  IFRS 17 FCF (BEL+RA)
                </th>
                <th className="py-2.5 px-3.5 text-right font-semibold text-amber-600 dark:text-amber-400">
                  Solvency II RM (CoC)
                </th>
                <th className="py-2.5 px-3.5 text-right font-semibold text-amber-700 dark:text-amber-300">
                  Solvency II TP (BEL+RM)
                </th>
                <th className="py-2.5 px-3.5 text-right font-semibold text-rose-600 dark:text-rose-400">
                  Allocated SCR
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 font-mono tabular-nums">
              {compliance.cohortRows.map((row) => (
                <tr
                  key={row.originIndex}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <td className="py-2 px-3.5 font-semibold text-slate-900 dark:text-slate-100">
                    {row.originLabel}
                  </td>
                  <td className="py-2 px-3.5 text-right text-slate-700 dark:text-slate-300">
                    {formatScaledNumber(row.nominalTotalUnpaid, unitConfig)}
                  </td>
                  <td className="py-2 px-3.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatScaledNumber(row.discountedBelPv, unitConfig)}
                  </td>
                  <td className="py-2 px-3.5 text-right text-slate-500">
                    {formatPct(row.riskWeightShare, 1)}
                  </td>
                  <td className="py-2 px-3.5 text-right text-sky-600 dark:text-sky-400">
                    {formatScaledNumber(row.allocatedIfrs17Ra, unitConfig)}
                  </td>
                  <td className="py-2 px-3.5 text-right font-semibold text-sky-700 dark:text-sky-300 bg-sky-500/5">
                    {formatScaledNumber(
                      row.ifrs17FulfilmentCashFlows,
                      unitConfig
                    )}
                  </td>
                  <td className="py-2 px-3.5 text-right text-amber-600 dark:text-amber-400">
                    {formatScaledNumber(row.allocatedSolvencyIIRm, unitConfig)}
                  </td>
                  <td className="py-2 px-3.5 text-right font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/5">
                    {formatScaledNumber(
                      row.solvencyIITechnicalProvisions,
                      unitConfig
                    )}
                  </td>
                  <td className="py-2 px-3.5 text-right font-bold text-rose-600 dark:text-rose-400 bg-rose-500/5">
                    {formatScaledNumber(row.allocatedScr, unitConfig)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/90 dark:bg-slate-950 font-mono tabular-nums font-bold text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-slate-700">
                <td className="py-2.5 px-3.5">Portfolio Total</td>
                <td className="py-2.5 px-3.5 text-right">
                  {formatScaledNumber(compliance.nominalTotalUnpaid, unitConfig)}
                </td>
                <td className="py-2.5 px-3.5 text-right text-emerald-600 dark:text-emerald-400">
                  {formatScaledNumber(compliance.discountedBelPv, unitConfig)}
                </td>
                <td className="py-2.5 px-3.5 text-right">100.0%</td>
                <td className="py-2.5 px-3.5 text-right text-sky-600 dark:text-sky-400">
                  {formatScaledNumber(
                    compliance.ifrs17RiskAdjustment,
                    unitConfig
                  )}
                </td>
                <td className="py-2.5 px-3.5 text-right text-sky-700 dark:text-sky-300 bg-sky-500/10">
                  {formatScaledNumber(
                    compliance.ifrs17FulfilmentCashFlows,
                    unitConfig
                  )}
                </td>
                <td className="py-2.5 px-3.5 text-right text-amber-600 dark:text-amber-400">
                  {formatScaledNumber(
                    compliance.solvencyIIRiskMarginCoC,
                    unitConfig
                  )}
                </td>
                <td className="py-2.5 px-3.5 text-right text-amber-700 dark:text-amber-300 bg-amber-500/10">
                  {formatScaledNumber(
                    compliance.solvencyIITechnicalProvisions,
                    unitConfig
                  )}
                </td>
                <td className="py-2.5 px-3.5 text-right text-rose-600 dark:text-rose-400 bg-rose-500/10">
                  {formatScaledNumber(compliance.selectedScr, unitConfig)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
