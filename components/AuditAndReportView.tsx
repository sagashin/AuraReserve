'use client';

import React, { useState } from 'react';
import {
  ActuarialEvaluationResult,
  BootstrapSimulationResult,
  parseTriangleCsv,
} from '@/lib/actuarial-engine';
import {
  PriorYearDevelopmentAnalysis,
  MultiSegmentFactRecord,
  parseMultiSegmentLongCsv,
} from '@/lib/segment-pyd-engine';
import {
  AuditLogEntry,
  formatCurrency,
  formatLdf,
  formatPercent,
  formatNumber,
  formatSignedDelta,
} from '@/lib/formatters';
import {
  exportActuarialValuationWorkbookXlsx,
  exportNormalizedFactDatasetXlsx,
  exportNormalizedFactDatasetCsv,
} from '@/lib/workbook-export';
import {
  Download,
  Upload,
  FileText,
  Copy,
  Check,
  Printer,
  SlidersHorizontal,
  FileSpreadsheet,
  Database,
} from 'lucide-react';

interface AuditAndReportViewProps {
  datasetName: string;
  currencySymbol: string;
  unitLabel?: string;
  originLabels?: string[];
  factRecords?: MultiSegmentFactRecord[];
  evaluation: ActuarialEvaluationResult;
  bootstrap: BootstrapSimulationResult;
  pydAnalysis: PriorYearDevelopmentAnalysis;
  auditLogs: AuditLogEntry[];
  onImportCustomCsv: (
    parsed: ReturnType<typeof parseTriangleCsv>,
    title: string
  ) => void;
  onImportMultiSegmentCsv: (
    records: MultiSegmentFactRecord[],
    summaryText: string
  ) => void;
  onOpenUniversalMapper?: () => void;
}

export default function AuditAndReportView({
  datasetName,
  currencySymbol,
  unitLabel = currencySymbol || 'Unit',
  originLabels,
  factRecords = [],
  evaluation,
  bootstrap,
  pydAnalysis,
  auditLogs,
  onImportCustomCsv,
  onImportMultiSegmentCsv,
  onOpenUniversalMapper,
}: AuditAndReportViewProps) {
  const [importMode, setImportMode] = useState<'multi_segment' | 'single_triangle'>(
    'multi_segment'
  );
  const [csvText, setCsvText] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [copiedMemo, setCopiedMemo] = useState<boolean>(false);

  const p75Row = bootstrap.percentiles.find((p) => p.percentile === 75);
  const p995Row = bootstrap.percentiles.find((p) => p.percentile === 99.5);
  const pydSign = formatSignedDelta(
    pydAnalysis.priorTotals.priorYearDevelopment,
    currencySymbol
  );

  // Build list of excluded cells for the Actuarial Report
  const excludedCellsList: string[] = [];
  evaluation.exclusions.forEach((row, i) => {
    row.forEach((isEx, j) => {
      if (isEx) {
        const ratio = evaluation.linkRatios[i]?.[j];
        excludedCellsList.push(
          `Origin ${evaluation.originYears[i]} @ ${evaluation.devPeriods[j]}–${evaluation.devPeriods[j + 1]}m (f = ${ratio ? ratio.toFixed(4) : 'N/A'})`
        );
      }
    });
  });

  // Build formal Markdown Actuarial Audit & Reserve Evaluation Report including dynamic PYD labels
  const auditMemoMarkdown = `# ACTUARIAL RESERVE EVALUATION & GOVERNANCE MEMORANDUM
**Portfolio / Active Slice**: ${datasetName}
**Valuation Snapshot**: ${pydAnalysis.currentValuationLabel} (Compared against Baseline: ${pydAnalysis.baselineValuationLabel})
**Granularity & Display Unit**: ${pydAnalysis.granularity.toUpperCase()} · ${unitLabel}
**Prepared By**: AuraReserve Principal Actuarial Engine

---

## 1. Executive Reserve & Prior Year Development (PYD) Summary
The Actuarial Function has completed its evaluation of unpaid loss and LAE reserves as of **${pydAnalysis.currentValuationLabel}**:

- **Selected Unreported Reserve (Total IBNR)**: **${formatCurrency(Math.round(evaluation.totals.selectedIbnr), currencySymbol)}**
- **Selected Ultimate Loss**: **${formatCurrency(Math.round(evaluation.totals.selectedUltimate), currencySymbol)}** (Portfolio Ultimate Loss Ratio: **${formatPercent(evaluation.totals.ultimateLossRatio, 1)}**)
- **Prior Year Development (PYD on ${pydAnalysis.priorCutoffLabel} Cohorts)**: **${pydSign.text}** (${pydAnalysis.priorTotals.priorYearDevelopment > 0 ? 'Unfavorable / Reserve Deficiency' : 'Favorable / Reserve Redundancy'}, **${formatPercent(pydAnalysis.priorTotals.pydPctOf2025Reserve, 1)}** of Baseline [${pydAnalysis.baselineValuationLabel}] Starting IBNR)
- **Actual vs. Expected (AvE) Emergence on ${pydAnalysis.priorCutoffLabel} Cohorts**: Actual **${formatCurrency(Math.round(pydAnalysis.priorTotals.actual2026Emergence), currencySymbol)}** vs. Expected **${formatCurrency(Math.round(pydAnalysis.priorTotals.expected2026Emergence), currencySymbol)}** (Variance: **${formatSignedDelta(pydAnalysis.priorTotals.aveEmergenceDiff, currencySymbol).text}**)
- **Chain Ladder (CL) / Bornhuetter-Ferguson (BF) / Cape Cod (CC) Benchmarks**: CL = ${formatCurrency(Math.round(evaluation.totals.clIbnr), currencySymbol)} · BF = ${formatCurrency(Math.round(evaluation.totals.bfIbnr), currencySymbol)} · CC = ${formatCurrency(Math.round(evaluation.totals.ccIbnr), currencySymbol)}

---

## 2. Link Ratio Selection, Outlier Exclusions & Tail Extrapolation
- **Selected LDF Schedule**: ${evaluation.selectedLdfs.map((f, j) => `${evaluation.devPeriods[j]}–${evaluation.devPeriods[j + 1]}m: ${f.toFixed(4)}`).join(' · ')}
- **Selected Tail Factor**: **${formatLdf(evaluation.tailFactor, 4)}** (Exponential R² = ${(evaluation.tailFitting.exponential.rSquared * 100).toFixed(1)}%, Inverse Power R² = ${(evaluation.tailFitting.inversePower.rSquared * 100).toFixed(1)}%)
- **Excluded Outlier Link-Ratio Cells (${excludedCellsList.length})**:
${excludedCellsList.length > 0 ? excludedCellsList.map((c) => `  - ${c}`).join('\n') : '  - None (All historical link ratios retained in volume-weighted average)'}

---

## 3. Stochastic Uncertainty, IFRS 17 Risk Adjustment & Solvency II Capital
- **Mack (1993) Distribution-Free Standard Error**: **${formatCurrency(Math.round(evaluation.totals.mackTotalSe), currencySymbol)}** (Overall CV: **${evaluation.totals.mackTotalCv !== null ? formatPercent(evaluation.totals.mackTotalCv, 1) : 'N/A'}**)
- **ODP Bootstrap Mean IBNR (${formatNumber(bootstrap.iterations)} Simulations)**: **${formatCurrency(Math.round(bootstrap.meanIbnr), currencySymbol)}** (Bootstrap SD: **${formatCurrency(Math.round(bootstrap.stdDevIbnr), currencySymbol)}**, Scale φ = ${bootstrap.scaleParameterPhi.toFixed(1)})
- **IFRS 17 Risk Adjustment (75th Percentile Benchmark)**: **+${formatCurrency(Math.round(p75Row?.riskCapitalOverMean ?? 0), currencySymbol)}** above Mean (Total 75% Reserve: **${formatCurrency(Math.round(p75Row?.ibnrValue ?? 0), currencySymbol)}**)
- **Solvency II 1-in-200 Reserve Risk VaR (99.5th Percentile)**: **+${formatCurrency(Math.round(p995Row?.riskCapitalOverMean ?? 0), currencySymbol)}** Capital Buffer (Total 99.5% Reserve: **${formatCurrency(Math.round(p995Row?.ibnrValue ?? 0), currencySymbol)}**)

---

## 4. Prior Year Development (PYD) Schedule (Origin Cohorts ${pydAnalysis.priorCutoffLabel})
| Origin | Baseline Paid (${pydAnalysis.baselineValuationLabel}) | Baseline IBNR | Baseline Ult | Actual Δ | Expected Δ | Current IBNR (${pydAnalysis.currentValuationLabel}) | Current Ult | PYD (Ult Δ) |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${pydAnalysis.cohortRows
  .filter((r) => r.isPriorYear)
  .map(
    (r) =>
      `| ${r.originLabel} | ${formatNumber(Math.round(r.paid2025End))} | ${formatNumber(Math.round(r.ibnr2025End))} | ${formatNumber(Math.round(r.ultimate2025End))} | ${formatNumber(Math.round(r.actual2026Emergence))} | ${formatNumber(Math.round(r.expected2026Emergence))} | ${formatNumber(Math.round(r.ibnr2026Current))} | ${formatNumber(Math.round(r.ultimate2026Current))} | **${formatSignedDelta(r.priorYearDevelopment, currencySymbol).text}** |`
  )
  .join('\n')}

---

## 5. Governance & Audit Trail Log (${auditLogs.length} Recorded Events)
${
  auditLogs.length > 0
    ? auditLogs
        .slice(0, 15)
        .map(
          (log) =>
            `- **[${log.timestamp}] ${log.title}**: ${log.detail} (ΔIBNR: ${log.deltaIbnr >= 0 ? '+' : ''}${formatCurrency(Math.round(log.deltaIbnr), currencySymbol)})`
        )
        .join('\n')
    : '- Initial baseline actuarial evaluation loaded with zero manual overrides.'
}
`;

  const handleDownloadWorkbookCsv = () => {
    const lines: string[] = [];
    lines.push(`# AuraReserve Actuarial Reserve & PYD Export — ${datasetName}`);
    lines.push(
      [
        'OriginPeriod',
        ...evaluation.devPeriods.map((d) => `Cum_${d}m`),
        'LatestPaid',
        'EarnedPremium',
        'APrioriELR',
        'SelectedCDF',
        'CL_IBNR',
        'BF_IBNR',
        'CC_IBNR',
        'SelectedMethod',
        'SelectedIBNR',
        'SelectedUltimate',
        'UltimateLR',
        'MackSE',
        'PYD_2026',
      ].join(',')
    );

    evaluation.rows.forEach((r, i) => {
      const cumCols = evaluation.cumulativeTriangle[i].map((v) =>
        v === null || v === undefined ? '' : Math.round(v)
      );
      const pydRow = pydAnalysis.cohortRows[i];
      lines.push(
        [
          pydRow?.originLabel ?? r.originYear,
          ...cumCols,
          Math.round(r.latestCumulative),
          Math.round(r.earnedPremium),
          r.aprioriElr.toFixed(4),
          r.cdfToUltimate.toFixed(4),
          Math.round(r.clIbnr),
          Math.round(r.bfIbnr),
          Math.round(r.ccIbnr),
          r.selectedMethod,
          Math.round(r.selectedIbnr),
          Math.round(r.selectedUltimate),
          r.ultimateLossRatio.toFixed(4),
          Math.round(r.mackSe),
          pydRow ? Math.round(pydRow.priorYearDevelopment) : 0,
        ].join(',')
      );
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AuraReserve_Workbook_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadSampleTemplate = () => {
    if (importMode === 'multi_segment') {
      const sampleMulti = [
        'Product,Channel,Coverage,Region,OriginPeriod,DevLag,CumulativePaid,EarnedPremium,ELR',
        'Cyber Liability,Corporate Broker,Third-Party Breach,East / Kanto,2023,12,420000,1500000,0.76',
        'Cyber Liability,Corporate Broker,Third-Party Breach,East / Kanto,2023,24,890000,1500000,0.76',
        'Cyber Liability,Corporate Broker,Third-Party Breach,East / Kanto,2023,36,1180000,1500000,0.76',
        'Cyber Liability,Corporate Broker,Third-Party Breach,East / Kanto,2023,48,1310000,1500000,0.76',
        'Cyber Liability,Corporate Broker,Third-Party Breach,East / Kanto,2024,12,480000,1650000,0.78',
        'Cyber Liability,Corporate Broker,Third-Party Breach,East / Kanto,2024,24,1040000,1650000,0.78',
        'Cyber Liability,Corporate Broker,Third-Party Breach,East / Kanto,2024,36,1390000,1650000,0.78',
        'Cyber Liability,Corporate Broker,Third-Party Breach,East / Kanto,2025,12,530000,1800000,0.79',
        'Cyber Liability,Corporate Broker,Third-Party Breach,East / Kanto,2025,24,1190000,1800000,0.79',
        'Cyber Liability,Corporate Broker,Third-Party Breach,East / Kanto,2026,12,590000,1950000,0.80',
        'Marine Cargo,Agency Network,Transit Hull,West / Kansai,2023,12,610000,1400000,0.70',
        'Marine Cargo,Agency Network,Transit Hull,West / Kansai,2023,24,920000,1400000,0.70',
        'Marine Cargo,Agency Network,Transit Hull,West / Kansai,2023,36,1010000,1400000,0.70',
        'Marine Cargo,Agency Network,Transit Hull,West / Kansai,2023,48,1045000,1400000,0.70',
        'Marine Cargo,Agency Network,Transit Hull,West / Kansai,2024,12,640000,1480000,0.71',
        'Marine Cargo,Agency Network,Transit Hull,West / Kansai,2024,24,950000,1480000,0.71',
        'Marine Cargo,Agency Network,Transit Hull,West / Kansai,2024,36,1030000,1480000,0.71',
        'Marine Cargo,Agency Network,Transit Hull,West / Kansai,2025,12,670000,1550000,0.72',
        'Marine Cargo,Agency Network,Transit Hull,West / Kansai,2025,24,980000,1550000,0.72',
        'Marine Cargo,Agency Network,Transit Hull,West / Kansai,2026,12,705000,1620000,0.72',
      ].join('\n');
      setCsvText(sampleMulti);
    } else {
      const sampleSingle = [
        'OriginYear,12,24,36,48,60,72,EarnedPremium,ELR',
        '2021,520000,1240000,1850000,2210000,2480000,2610000,3400000,0.77',
        '2022,560000,1310000,1960000,2350000,2640000,,3600000,0.78',
        '2023,610000,1450000,2180000,2620000,,,3900000,0.79',
        '2024,640000,1890000,2540000,,,,4100000,0.80',
        '2025,690000,1620000,,,,,4350000,0.80',
        '2026,730000,,,,,,4600000,0.81',
      ].join('\n');
      setCsvText(sampleSingle);
    }
    setImportError(null);
  };

  const handleParseAndImport = (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);
    setImportSuccess(null);
    if (!csvText.trim()) {
      setImportError('Please paste CSV data or load a sample template first.');
      return;
    }
    try {
      if (importMode === 'multi_segment') {
        const res = parseMultiSegmentLongCsv(
          csvText,
          pydAnalysis.valuationMonth,
          pydAnalysis.granularity
        );
        const msg = `Loaded ${res.detectedSegmentsCount} multi-column segments across ${res.originsCount} origin cohorts (${res.records.length} segment-origin rows).`;
        onImportMultiSegmentCsv(res.records, msg);
        setImportSuccess(msg);
      } else {
        const parsed = parseTriangleCsv(csvText);
        onImportCustomCsv(
          parsed,
          `Imported Custom CSV (${parsed.originYears.length}×${parsed.devPeriods.length})`
        );
        setImportSuccess(
          `Successfully imported ${parsed.originYears.length}×${parsed.devPeriods.length} triangle.`
        );
      }
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Invalid CSV format');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 5 Cols: Monthly Multi-Segment & Triangle CSV Integration */}
      <section className="lg:col-span-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              01. Monthly Multi-Segment CSV Ingestion & Workbook Export
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ingest monthly long-format CSV files containing multiple Product & Segment columns, or export the active valuation & PYD workbook
            </p>
          </div>
          {onOpenUniversalMapper && (
            <button
              type="button"
              onClick={onOpenUniversalMapper}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Open Universal Mapper (和暦・横持ち・Excel・別表保険料結合)
            </button>
          )}
        </div>

        {/* Export Box 1: Multi-Sheet Actuarial & PYD Excel Workbook (.xlsx) + Single CSV */}
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 space-y-2.5">
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
            1A. Export Actuarial Valuation & PYD Workbook (5-Sheet Excel .xlsx / .CSV)
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            ①トライアングル＆LDF・②CL/BF/CC手法比較・③過年度ロス増減(PYD)・④セグメント別要因分解・⑤ODPブートストラップ＆監査ログの5シート構成Excelブック（または単一CSV）を一括出力します。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="export-multi-sheet-xlsx-btn"
              onClick={() =>
                exportActuarialValuationWorkbookXlsx({
                  datasetName,
                  currencySymbol,
                  unitLabel,
                  originLabels:
                    originLabels ??
                    pydAnalysis.cohortRows.map((c) => c.originLabel),
                  evaluation,
                  pydAnalysis,
                  bootstrap,
                  auditLogs,
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Download 5-Sheet Excel Workbook (.xlsx)
            </button>

            <button
              type="button"
              onClick={handleDownloadWorkbookCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Summary Workbook (.CSV)
            </button>
          </div>
        </div>

        {/* Export Box 2: Cleaned, Date-Normalized & Separate-Premium-Joined Dataset (.xlsx / .csv) */}
        {factRecords.length > 0 && (
          <div className="p-4 rounded-lg border border-sky-500/30 bg-sky-50/40 dark:bg-sky-950/20 space-y-2.5">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-sky-500" />
              1B. Export Cleaned & Joined Normalized Dataset (正規化・保険料結合済データ出力)
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              和暦/日付正規化・歯抜け補完・別ファイル保険料＆契約件数按分結合を終えたクリーンなデータセットを、縦持ち（Long Tidy）＋横持ち（Wide Matrix）の2シートExcelまたはBOM付きCSVとして書き出します。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="export-normalized-xlsx-btn"
                onClick={() =>
                  exportNormalizedFactDatasetXlsx(
                    factRecords,
                    pydAnalysis.granularity
                  )
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export Normalized Dataset (.xlsx 縦持ち＋横持ち)
              </button>

              <button
                type="button"
                data-testid="export-normalized-csv-btn"
                onClick={() =>
                  exportNormalizedFactDatasetCsv(
                    factRecords,
                    pydAnalysis.granularity
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded border border-sky-500/40 bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Export Normalized Tidy (.CSV)
              </button>
            </div>
          </div>
        )}

        {/* Mode Switcher for CSV Import */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-md">
          <button
            type="button"
            onClick={() => setImportMode('multi_segment')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
              importMode === 'multi_segment'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Multi-Segment Long CSV (複数セグメント縦持ち)
          </button>
          <button
            type="button"
            onClick={() => setImportMode('single_triangle')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
              importMode === 'single_triangle'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Single Matrix CSV (単一トライアングル)
          </button>
        </div>

        {/* Import Form */}
        <form onSubmit={handleParseAndImport} className="space-y-3">
          <div className="flex items-center justify-between">
            <label
              htmlFor="csv-triangle-input"
              className="text-xs font-semibold text-slate-800 dark:text-slate-200"
            >
              {importMode === 'multi_segment'
                ? 'Paste Multi-Segment Long CSV (Product, Channel, Coverage, Region...)'
                : 'Paste Wide Triangle Matrix CSV'}
            </label>
            <button
              type="button"
              onClick={handleLoadSampleTemplate}
              className="text-xs text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              Load Sample CSV Template
            </button>
          </div>

          <textarea
            id="csv-triangle-input"
            rows={8}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={
              importMode === 'multi_segment'
                ? 'Product,Channel,Coverage,Region,OriginPeriod,DevLag,CumulativePaid,EarnedPremium,ELR\nCyber Liability,Broker,Breach,Kanto,2024,12,480000,1650000,0.78'
                : 'OriginYear,12,24,36,EarnedPremium,ELR\n2024,1000,2500,3200,5000,0.75'
            }
            className="w-full font-mono text-xs p-3 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
          />

          {importError && (
            <div
              role="alert"
              className="p-2.5 rounded bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300"
            >
              {importError}
            </div>
          )}

          {importSuccess && (
            <div
              role="status"
              className="p-2.5 rounded bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300"
            >
              {importSuccess}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              Import & Dynamically Pivot Data
            </button>
          </div>
        </form>
      </section>

      {/* Right 7 Cols: Automated Actuarial Audit & PYD Governance Memo Generator */}
      <section className="lg:col-span-7 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                02. Actuarial Audit Memo & Prior Year Development Report
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Includes 2026 Prior Year Development (PYD) attribution, AvE emergence, and IFRS 17 / Solvency II metrics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(auditMemoMarkdown);
                setCopiedMemo(true);
                setTimeout(() => setCopiedMemo(false), 2000);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {copiedMemo ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  Copied Markdown
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Markdown
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-slate-900 dark:bg-sky-600 text-white hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
          </div>
        </div>

        <div className="p-5">
          <pre className="w-full max-h-[560px] overflow-y-auto p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
            {auditMemoMarkdown}
          </pre>
        </div>
      </section>
    </div>
  );
}
