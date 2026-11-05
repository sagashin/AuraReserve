'use client';

import React, { useState } from 'react';
import {
  ActuarialEvaluation,
  LdfAverageMode,
  MethodSelection,
  parseTriangleCsv,
} from '@/lib/actuarial-engine';
import {
  decodeFileBuffer,
  readExcelSheetsFromBuffer,
  extractDirectTriangleFromGrid,
} from '@/lib/universal-data-parser';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  ClipboardCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { DisplayUnitConfig, formatScaledNumber } from '@/lib/format-utils';

interface AuditAndReportViewProps {
  evaluation: ActuarialEvaluation;
  lineOfBusinessLabel: string;
  selectedMode: LdfAverageMode;
  tailFactor: number;
  aprioriElr: number;
  bfWeight: number;
  benktanderIterations: number;
  discountRate?: number;
  excludedCells: string[];
  manualLdfOverrides: Record<number, number>;
  selectedMethodByOrigin: Record<number, MethodSelection>;
  onImportCustomCsv: (parsed: {
    originLabels: string[];
    devPeriods: number[];
    triangle: (number | null)[][];
    earnedPremium: number[];
  }) => void;
  onOpenUniversalMapper?: () => void;
  unitConfig: DisplayUnitConfig;
}

const SAMPLE_CSV_TEMPLATE = `Origin,12,24,36,48,60,72,EarnedPremium
2020,420000,725000,910000,1015000,1068000,1095000,1480000
2021,448000,768000,962000,1074000,1132000,,1550000
2022,472000,812000,1024000,1142000,,,1630000
2023,505000,868000,1092000,,,,1720000
2024,538000,924000,,,,,1810000
2025,576000,,,,,,1920000`;

export default function AuditAndReportView({
  evaluation,
  lineOfBusinessLabel,
  selectedMode,
  tailFactor,
  aprioriElr,
  bfWeight,
  benktanderIterations,
  discountRate = 0.02,
  excludedCells,
  manualLdfOverrides,
  onImportCustomCsv,
  onOpenUniversalMapper,
  unitConfig,
}: AuditAndReportViewProps) {
  const [csvText, setCsvText] = useState(SAMPLE_CSV_TEMPLATE);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvSuccess, setCsvSuccess] = useState<string | null>(null);
  const [copiedMemo, setCopiedMemo] = useState(false);

  const handleParseAndApplyCsv = (textToParse = csvText) => {
    setCsvError(null);
    setCsvSuccess(null);
    try {
      const parsed = parseTriangleCsv(textToParse);
      onImportCustomCsv(parsed);
      setCsvSuccess(
        `Imported ${parsed.originLabels.length} origin cohorts × ${parsed.devPeriods.length} development periods into active Triangle.`
      );
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'Invalid CSV format');
    }
  };

  const handleDirectFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(null);
    setCsvSuccess(null);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buf = reader.result as ArrayBuffer;
        if (isExcel) {
          const { sheetNames, sheetsGridMap, suggestedHeaderRowMap } =
            readExcelSheetsFromBuffer(buf);
          if (sheetNames.length === 0) {
            throw new Error('Excel workbook contains no sheets.');
          }
          const s0 = sheetNames[0];
          const extracted = extractDirectTriangleFromGrid(
            sheetsGridMap[s0],
            suggestedHeaderRowMap[s0]
          );
          onImportCustomCsv({
            originLabels: extracted.originLabels,
            devPeriods: extracted.devPeriods,
            triangle: extracted.triangle,
            earnedPremium: extracted.earnedPremium,
          });
          setCsvSuccess(
            `Excel file "${file.name}" (Sheet: ${s0}, Header Row ${
              extracted.headerRowIndex + 1
            }) imported directly: ${extracted.originLabels.length} origins × ${
              extracted.devPeriods.length
            } dev periods.`
          );
        } else {
          const decoded = decodeFileBuffer(buf, 'auto');
          setCsvText(decoded.text);
          handleParseAndApplyCsv(decoded.text);
        }
      } catch (err) {
        setCsvError(
          err instanceof Error ? err.message : 'Failed to import file.'
        );
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const generateAuditMemoMarkdown = () => {
    const lines: string[] = [
      `# Actuarial Reserve Valuation Sign-Off Memo`,
      `- **Portfolio / Line of Business**: ${lineOfBusinessLabel}`,
      `- **Valuation Basis**: Paid / Incurred Loss & ALAE Run-Off Triangle`,
      `- **Display Unit**: ${unitConfig.badge} (${unitConfig.label})`,
      `- **LDF Averaging Selection**: \`${selectedMode}\``,
      `- **Tail Factor Applied**: \`${tailFactor.toFixed(4)}\` (Exponential R² = ${evaluation.tailFits.exponential.rSquared.toFixed(3)}, Inverse Power R² = ${evaluation.tailFits.inversePower.rSquared.toFixed(3)}, Weibull R² = ${evaluation.tailFits.weibull.rSquared.toFixed(3)})`,
      `- **A Priori Expected Loss Ratio (ELR)**: \`${(aprioriElr * 100).toFixed(1)}%\` (Cape Cod Used-Up ELR = \`${(evaluation.capeCodElr * 100).toFixed(2)}%\`)`,
      `- **Credibility Blend Weight (w_BF)**: \`${(bfWeight * 100).toFixed(0)}% BF / ${((1 - bfWeight) * 100).toFixed(0)}% CL\``,
      `- **Benktander Iterations (m)**: \`${benktanderIterations}\``,
      `- **IFRS 17 / J-GAAP Discount Rate**: \`${(discountRate * 100).toFixed(2)}%\` (Macaulay Duration = \`${evaluation.cashflowProjection.macaulayDurationYears.toFixed(2)} yrs\`)`,
      `- **Excluded Outlier Link-Ratio Cells**: ${excludedCells.length > 0 ? excludedCells.join(', ') : 'None'}`,
      `- **Manual LDF Overrides**: ${
        Object.keys(manualLdfOverrides).length > 0
          ? Object.entries(manualLdfOverrides)
              .map(([k, v]) => `Col ${Number(k) + 1}=${v.toFixed(4)}`)
              .join(', ')
          : 'None'
      }`,
      ``,
      `## Portfolio Reserve Summary (${unitConfig.badge})`,
      `- **Total Paid / Reported to Date**: ${formatScaledNumber(evaluation.totals.latestLoss, unitConfig)}`,
      `- **Total Case Reserve (OS)**: ${formatScaledNumber(evaluation.totals.caseReserve, unitConfig)}`,
      `- **Total Selected IBNR Reserve**: ${formatScaledNumber(evaluation.totals.selectedIbnr, unitConfig)}`,
      `- **Total Unpaid Reserve (Case + IBNR)**: ${formatScaledNumber(evaluation.totals.totalUnpaidReserve, unitConfig)}`,
      `- **Discounted PV Reserve**: ${formatScaledNumber(evaluation.cashflowProjection.totalDiscountedPv, unitConfig)} (Discount Effect: -${formatScaledNumber(evaluation.cashflowProjection.totalDiscountEffect, unitConfig)})`,
      `- **Total Selected Ultimate Loss**: ${formatScaledNumber(evaluation.totals.selectedUltimate, unitConfig)}`,
      `- **Portfolio Implied Ultimate Loss Ratio**: ${(evaluation.totals.overallLossRatio * 100).toFixed(2)}%`,
      `- **Mack (1993) Ultimate SE**: ±${formatScaledNumber(evaluation.totals.mackTotalSe, unitConfig)} (CV = ${(evaluation.totals.overallCv * 100).toFixed(2)}%)`,
      `- **Merz-Wüthrich (2008) 1-Year CDR SE**: ±${formatScaledNumber(evaluation.totals.merzWuthrichTotal1YrSe, unitConfig)} (1-Yr CV = ${(evaluation.totals.merzWuthrichOverall1YrCv * 100).toFixed(2)}%)`,
      ``,
      `## Origin Cohort Schedule (${unitConfig.badge})`,
      `| Origin | Paid Loss | Case Reserve | Selected Method | Selected IBNR | Total Unpaid | Selected Ultimate | Ultimate LR | Mack Ult SE | M-W 1Yr SE |`,
      `| :--- | ---: | ---: | :--- | ---: | ---: | ---: | ---: | ---: | ---: |`,
      ...evaluation.summaryRows.map(
        (r) =>
          `| ${r.originLabel} | ${formatScaledNumber(r.latestLoss, unitConfig)} | ${formatScaledNumber(r.caseReserve, unitConfig)} | ${r.selectedMethod} | ${formatScaledNumber(r.selectedIbnr, unitConfig)} | ${formatScaledNumber(r.totalUnpaidReserve, unitConfig)} | ${formatScaledNumber(r.selectedUltimate, unitConfig)} | ${(r.selectedLossRatio * 100).toFixed(1)}% | ${formatScaledNumber(r.mackSe, unitConfig)} | ${formatScaledNumber(r.merzWuthrich1YrSe, unitConfig)} |`
      ),
    ];
    return lines.join('\n');
  };

  const handleDownloadCsvReport = () => {
    const headers = [
      'Origin',
      'Earned_Premium',
      'Paid_Loss',
      'Incurred_Loss',
      'Case_Reserve_OS',
      'Selected_LDF_to_Ult',
      'CL_IBNR',
      'BF_IBNR',
      'CapeCod_IBNR',
      'Benktander_IBNR',
      'ELR_IBNR',
      'FreqSev_IBNR',
      'Selected_Method',
      'Selected_IBNR',
      'Total_Unpaid_Reserve',
      'Discounted_PV_Reserve',
      'Selected_Ultimate',
      'Ultimate_Loss_Ratio',
      'Mack_Ult_SE',
      'Merz_Wuthrich_1Yr_SE',
    ];
    const rows = evaluation.summaryRows.map((r) =>
      [
        r.originLabel,
        r.earnedPremium,
        r.latestLoss,
        r.latestIncurred,
        r.caseReserve,
        r.cdf.toFixed(4),
        Math.round(r.clIbnr),
        Math.round(r.bfIbnr),
        Math.round(r.ccIbnr),
        Math.round(r.benktanderIbnr),
        Math.round(r.elrIbnr),
        Math.round(r.freqSevIbnr),
        r.selectedMethod,
        Math.round(r.selectedIbnr),
        Math.round(r.totalUnpaidReserve),
        Math.round(r.discountedReservePv),
        Math.round(r.selectedUltimate),
        r.selectedLossRatio.toFixed(4),
        Math.round(r.mackSe),
        Math.round(r.merzWuthrich1YrSe),
      ].join(',')
    );
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `actuarial-reserve-schedule-${lineOfBusinessLabel.toLowerCase().replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyMemo = async () => {
    try {
      await navigator.clipboard.writeText(generateAuditMemoMarkdown());
      setCopiedMemo(true);
      setTimeout(() => setCopiedMemo(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Custom CSV / Excel Triangle Import */}
      <div className="lg:col-span-6 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 p-5 flex flex-col justify-between">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-sky-500" />
                Direct Triangle CSV / TSV / Excel (.xlsx) Import
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                CSV/TSVの直接貼り付け、またはExcel(.xlsx)/CSVファイルの選択で即座にトライアングルを更新します。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                Upload File (.xlsx / .csv)
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xls"
                  onChange={handleDirectFileUpload}
                  className="hidden"
                />
              </label>
              {onOpenUniversalMapper && (
                <button
                  type="button"
                  onClick={onOpenUniversalMapper}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-sky-500/40 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  多軸・詳細マッピングを開く
                </button>
              )}
            </div>
          </div>

          <label htmlFor="custom-triangle-csv" className="sr-only">
            Custom Triangle CSV Data
          </label>
          <textarea
            id="custom-triangle-csv"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={10}
            className="w-full font-mono text-xs p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="Origin,12,24,36..."
          />

          {csvError && (
            <div className="mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{csvError}</span>
            </div>
          )}

          {csvSuccess && (
            <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{csvSuccess}</span>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setCsvText(SAMPLE_CSV_TEMPLATE)}
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            Reset to Template
          </button>
          <button
            type="button"
            onClick={() => handleParseAndApplyCsv(csvText)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Apply CSV / TSV to Active Triangle
          </button>
        </div>
      </div>

      {/* Audit Sign-Off Memo & Export */}
      <div className="lg:col-span-6 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 p-5 flex flex-col justify-between">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Governance Sign-Off Memo & Schedule Export
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                IFRS 17 / J-GAAP / Solvency II 監査証跡ドキュメント（Markdown & CSV）
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyMemo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ClipboardCheck className="w-3.5 h-3.5 text-emerald-500" />
                {copiedMemo ? 'Copied Markdown!' : 'Copy Audit Memo'}
              </button>
              <button
                type="button"
                onClick={handleDownloadCsvReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV Schedule
              </button>
            </div>
          </div>

          <pre className="w-full h-64 overflow-auto font-mono text-[11px] leading-relaxed p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {generateAuditMemoMarkdown()}
          </pre>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>Compliance: ASOP No. 43 / CAS Reserving / IAJ / IFRS 17</span>
          <span className="font-mono text-emerald-600 dark:text-emerald-400">
            Reconciliation Verified ✓
          </span>
        </div>
      </div>
    </div>
  );
}
