'use client';

import React, { useState, useMemo } from 'react';
import {
  MultiSegmentFactRecord,
  TimeGranularity,
  DataHealthDiagnostics,
  generateCustomJapaneseFiscalSampleCsv,
} from '@/lib/segment-pyd-engine';
import {
  FileCharacterEncoding,
  LossDataShapeMode,
  UniversalLossInspectResult,
  SeparatePremiumInspectResult,
  decodeFileBuffer,
  readExcelSheetsFromBuffer,
  detectBestHeaderRowIndex,
  parseTextToRawGrid,
  inspectUniversalLossGrid,
  ingestUniversalLossGrid,
  inspectSeparatePremiumGrid,
  joinSeparatePremiumExposureDataset,
  extractDirectTriangleFromGrid,
  generateWidePivotLossAndSeparatePremiumSample,
  generateWarekiMultiMetricAndEdgeCaseSample,
} from '@/lib/universal-data-parser';
import {
  ShieldCheck,
  Upload,
  CheckSquare,
  Square,
  Sparkles,
  X,
  Table,
  SlidersHorizontal,
  Link2,
  FileSpreadsheet,
  Activity,
  Download,
  Grid3X3,
} from 'lucide-react';
import { exportNormalizedFactDatasetXlsx } from '@/lib/workbook-export';

interface CsvSchemaMapperModalProps {
  isOpen: boolean;
  initialMode?: 'loss' | 'separate_premium' | 'direct_triangle';
  existingRecords: MultiSegmentFactRecord[];
  onClose: () => void;
  onIngestMappedDataset: (payload: {
    records: MultiSegmentFactRecord[];
    summaryText: string;
    valuationLabel: string;
    availableGranularities: TimeGranularity[];
  }) => void;
  onJoinSeparatePremiumDataset: (payload: {
    updatedRecords: MultiSegmentFactRecord[];
    summaryText: string;
  }) => void;
  onApplyDirectTriangle?: (payload: {
    originLabels: string[];
    devPeriods: number[];
    triangle: (number | null)[][];
    earnedPremium: number[];
    exposureCount: number[];
    aprioriElr: number;
    label: string;
  }) => void;
}

export default function CsvSchemaMapperModal({
  isOpen,
  initialMode = 'loss',
  existingRecords,
  onClose,
  onIngestMappedDataset,
  onJoinSeparatePremiumDataset,
  onApplyDirectTriangle,
}: CsvSchemaMapperModalProps) {
  const [activeStudioTab, setActiveStudioTab] = useState<
    'loss' | 'separate_premium' | 'direct_triangle'
  >(initialMode);

  // Loss Ingestion State
  const [encoding, setEncoding] = useState<FileCharacterEncoding>('auto');
  const [detectedEncodingBadge, setDetectedEncodingBadge] =
    useState<string>('UTF-8 / Auto');
  const [excelSheetsMap, setExcelSheetsMap] = useState<
    Record<string, string[][]>
  >({});
  const [excelSuggestedHeaderMap, setExcelSuggestedHeaderMap] = useState<
    Record<string, number>
  >({});
  const [excelSheetNames, setExcelSheetNames] = useState<string[]>([]);
  const [selectedLossSheet, setSelectedLossSheet] = useState<string>('');
  const [rawLossText, setRawLossText] = useState<string>('');
  const [lossGrid, setLossGrid] = useState<string[][]>([]);
  const [headerRowIdx, setHeaderRowIdx] = useState<number>(0);
  const [lossConfig, setLossConfig] =
    useState<UniversalLossInspectResult | null>(null);
  const [valuationLabel, setValuationLabel] = useState<string>(
    '2023-12 (FY2018-2023)'
  );

  // Separate Premium / Exposure State
  const [rawPremText, setRawPremText] = useState<string>('');
  const [premGrid, setPremGrid] = useState<string[][]>([]);
  const [premHeaderRowIdx, setPremHeaderRowIdx] = useState<number>(0);
  const [premConfig, setPremConfig] =
    useState<SeparatePremiumInspectResult | null>(null);
  const [selectedPremSheet, setSelectedPremSheet] = useState<string>('');

  // Direct 2D Triangle Preview State
  const [directUnitMult, setDirectUnitMult] = useState<number>(1);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Live Pre-Flight Data Health Check Diagnostics
  const liveDiagnostics: DataHealthDiagnostics | null = useMemo(() => {
    if (!lossConfig || lossGrid.length === 0) return null;
    try {
      const previewRes = ingestUniversalLossGrid(
        lossGrid,
        headerRowIdx,
        lossConfig,
        valuationLabel
      );
      return previewRes.diagnostics;
    } catch {
      return null;
    }
  }, [lossConfig, lossGrid, headerRowIdx, valuationLabel]);

  // Direct 2D Triangle Preview
  const directTrianglePreview = useMemo(() => {
    if (lossGrid.length === 0) return null;
    try {
      return extractDirectTriangleFromGrid(lossGrid, headerRowIdx, directUnitMult);
    } catch {
      return null;
    }
  }, [lossGrid, headerRowIdx, directUnitMult]);

  if (!isOpen) return null;

  const applyLossGrid = (
    grid: string[][],
    hIdx?: number,
    defaultValLabel = 'Custom-Dataset'
  ) => {
    setErrorMsg(null);
    setLossGrid(grid);
    const effectiveHIdx =
      hIdx !== undefined ? hIdx : detectBestHeaderRowIndex(grid);
    setHeaderRowIdx(effectiveHIdx);
    setValuationLabel(defaultValLabel);
    try {
      const inspected = inspectUniversalLossGrid(grid, effectiveHIdx);
      setLossConfig(inspected);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to inspect loss data grid.'
      );
    }
  };

  const applyPremiumGrid = (grid: string[][], hIdx?: number) => {
    setErrorMsg(null);
    setPremGrid(grid);
    const effectiveHIdx =
      hIdx !== undefined ? hIdx : detectBestHeaderRowIndex(grid);
    setPremHeaderRowIdx(effectiveHIdx);
    try {
      const inspected = inspectSeparatePremiumGrid(grid, effectiveHIdx);
      setPremConfig(inspected);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Failed to inspect separate premium data grid.'
      );
    }
  };

  const handleLossFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setStatusMsg(null);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const cleanName = file.name.replace(/\.(csv|tsv|txt|xlsx|xls)$/i, '');

    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer;
      if (isExcel) {
        try {
          const {
            sheetNames,
            sheetsGridMap,
            suggestedHeaderRowMap,
          } = readExcelSheetsFromBuffer(buf);
          setExcelSheetNames(sheetNames);
          setExcelSheetsMap(sheetsGridMap);
          setExcelSuggestedHeaderMap(suggestedHeaderRowMap);
          setDetectedEncodingBadge('Excel Workbook (.xlsx)');
          if (sheetNames.length > 0) {
            const s0 = sheetNames[0];
            setSelectedLossSheet(s0);
            const h0 = suggestedHeaderRowMap[s0] ?? 0;
            applyLossGrid(sheetsGridMap[s0], h0, cleanName);
            setStatusMsg(
              `Excelブック「${file.name}」(${sheetNames.length}シート) を読み込み、Row ${
                h0 + 1
              } をヘッダー行として自動検出しました。`
            );
          }
          if (sheetNames.length > 1) {
            const s1 = sheetNames[1];
            setSelectedPremSheet(s1);
            const h1 = suggestedHeaderRowMap[s1] ?? 0;
            applyPremiumGrid(sheetsGridMap[s1], h1);
          }
        } catch (err) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Failed to read Excel workbook.'
          );
        }
      } else {
        const decoded = decodeFileBuffer(buf, encoding);
        setDetectedEncodingBadge(decoded.detectedEncoding.toUpperCase());
        setRawLossText(decoded.text);
        const parsed = parseTextToRawGrid(decoded.text);
        applyLossGrid(parsed.grid, parsed.suggestedHeaderRowIndex, cleanName);
        setStatusMsg(
          `ファイル「${file.name}」を読み込み、Row ${
            parsed.suggestedHeaderRowIndex + 1
          } をヘッダー行として自動検出しました。`
        );
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSeparatePremFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer;
      if (isExcel) {
        try {
          const {
            sheetNames,
            sheetsGridMap,
            suggestedHeaderRowMap,
          } = readExcelSheetsFromBuffer(buf);
          setExcelSheetNames(sheetNames);
          setExcelSheetsMap(sheetsGridMap);
          setExcelSuggestedHeaderMap(suggestedHeaderRowMap);
          if (sheetNames.length > 0) {
            const s0 = sheetNames[0];
            setSelectedPremSheet(s0);
            applyPremiumGrid(
              sheetsGridMap[s0],
              suggestedHeaderRowMap[s0] ?? 0
            );
          }
        } catch (err) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Failed to read Excel file.'
          );
        }
      } else {
        const decoded = decodeFileBuffer(buf, encoding);
        setDetectedEncodingBadge(decoded.detectedEncoding.toUpperCase());
        setRawPremText(decoded.text);
        const parsed = parseTextToRawGrid(decoded.text);
        applyPremiumGrid(parsed.grid, parsed.suggestedHeaderRowIndex);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Preset 1: Wide Pivot Loss + Separate Wide Premium/Exposure Table
  const handleLoadWidePivotAndSeparatePremDemo = () => {
    const { lossWideCsv, separatePremiumWideCsv } =
      generateWidePivotLossAndSeparatePremiumSample();
    setRawLossText(lossWideCsv);
    const parsedLoss = parseTextToRawGrid(lossWideCsv);
    applyLossGrid(parsedLoss.grid, 0, 'FY2023-Close (Wide-Pivot)');

    setRawPremText(separatePremiumWideCsv);
    const parsedPrem = parseTextToRawGrid(separatePremiumWideCsv);
    applyPremiumGrid(parsedPrem.grid, 0);

    setStatusMsg(
      '①横持ちピボット損害表（保険料列なし・カンマ付き数値）と、②別ファイルの横持ち保険料・契約件数表（粗いセグメント粒度）を両方セットしました！'
    );
  };

  // Preset 2: Multi-Metric (Paid + Incurred + Claim Count + Exposure) Japanese Fiscal Dataset
  const handleLoadMultiMetricJapaneseSample = () => {
    const sample = generateCustomJapaneseFiscalSampleCsv();
    setRawLossText(sample);
    const parsed = parseTextToRawGrid(sample);
    applyLossGrid(parsed.grid, 0, '2023-12 (FY2018-2023)');
    setStatusMsg(
      'Paid（支払損害額）・Incurred（発生損害額）・クレーム件数・既経過保険料・経過契約件数（Exposure）を含む4セグメント列データを読み込みました。'
    );
  };

  // Preset 3: Wareki (令和/平成), Wide Multi-Metric, Negative Dev (LDF < 1.0), Interior Gap, Asymmetric Launch, and 1,000-Yen Separate Premium
  const handleLoadWarekiMultiMetricEdgeCaseDemo = () => {
    const { warekiWideLossCsv, thousandYenSeparatePremCsv } =
      generateWarekiMultiMetricAndEdgeCaseSample();
    setRawLossText(warekiWideLossCsv);
    const parsedLoss = parseTextToRawGrid(warekiWideLossCsv);
    applyLossGrid(parsedLoss.grid, 0, '令和5年度末 (Wareki-EdgeCase)');

    setRawPremText(thousandYenSeparatePremCsv);
    const parsedPrem = parseTextToRawGrid(thousandYenSeparatePremCsv);
    const inspectedPrem = inspectSeparatePremiumGrid(parsedPrem.grid, 0);
    inspectedPrem.unitMultiplier = 1000;
    setPremGrid(parsedPrem.grid);
    setPremHeaderRowIdx(0);
    setPremConfig(inspectedPrem);

    setStatusMsg(
      '検証C：和暦（平成30年度〜令和5年度）・横持ちマルチ指標（支払/発生/件数）・マイナス進展（求償回収によるLDF<1.0）・歯抜けセル自動補完・令和3年度新設商品・別ファイル千円単位保険料（×1,000倍自動補正）をセットしました！'
    );
  };

  const toggleLossSegmentCol = (colName: string) => {
    if (!lossConfig) return;
    const exists = lossConfig.segmentCols.includes(colName);
    setLossConfig({
      ...lossConfig,
      segmentCols: exists
        ? lossConfig.segmentCols.filter((c) => c !== colName)
        : [...lossConfig.segmentCols, colName],
    });
  };

  const toggleWideValueCol = (colName: string) => {
    if (!lossConfig) return;
    const exists = lossConfig.wideValueCols.includes(colName);
    const nextWide = exists
      ? lossConfig.wideValueCols.filter((c) => c !== colName)
      : [...lossConfig.wideValueCols, colName];
    setLossConfig({
      ...lossConfig,
      wideValueCols: nextWide,
      segmentCols: lossConfig.segmentCols.filter((c) => !nextWide.includes(c)),
    });
  };

  const togglePremSegmentCol = (colName: string) => {
    if (!premConfig) return;
    const exists = premConfig.segmentCols.includes(colName);
    setPremConfig({
      ...premConfig,
      segmentCols: exists
        ? premConfig.segmentCols.filter((c) => c !== colName)
        : [...premConfig.segmentCols, colName],
    });
  };

  const handleExecuteLossIngest = (alsoJoinPremIfLoaded = true) => {
    if (!lossConfig || lossGrid.length === 0) return;
    setErrorMsg(null);
    try {
      const res = ingestUniversalLossGrid(
        lossGrid,
        headerRowIdx,
        lossConfig,
        valuationLabel
      );

      let finalRecords = res.records;
      let joinNote = '';

      if (alsoJoinPremIfLoaded && premConfig && premGrid.length > 0) {
        const joined = joinSeparatePremiumExposureDataset(
          finalRecords,
          premGrid,
          premHeaderRowIdx,
          premConfig
        );
        finalRecords = joined.updatedRecords;
        joinNote = ` + ${joined.summaryText}`;
      }

      const summaryText = `Shape: ${lossConfig.detectedShape.toUpperCase()} · ${res.detectedSegmentsCount} segment(s) across [${lossConfig.segmentCols.join(', ') || 'Portfolio'}] · Origins: ${res.detectedOriginRangeLabel}${joinNote}`;

      onIngestMappedDataset({
        records: finalRecords,
        summaryText,
        valuationLabel,
        availableGranularities: res.availableGranularities,
      });

      // Also apply as direct triangle if only 1 segment was imported so the main Triangle Workspace updates immediately
      if (onApplyDirectTriangle && directTrianglePreview && res.detectedSegmentsCount <= 1) {
        onApplyDirectTriangle({
          ...directTrianglePreview,
          label: valuationLabel,
        });
      }

      onClose();
    } catch (err) {
      // Fallback: if multi-segment ingestion failed because it's a simple 2D triangle, try direct 2D triangle extraction!
      if (directTrianglePreview && onApplyDirectTriangle) {
        onApplyDirectTriangle({
          ...directTrianglePreview,
          label: valuationLabel,
        });
        onClose();
        return;
      }
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to ingest dataset.'
      );
    }
  };

  const handleExecuteDirectTriangleOnly = () => {
    if (!directTrianglePreview) {
      setErrorMsg('有効な2Dトライアングル行列が検出できませんでした。ヘッダー行（Row）を確認してください。');
      return;
    }
    if (onApplyDirectTriangle) {
      onApplyDirectTriangle({
        ...directTrianglePreview,
        label: valuationLabel,
      });
    }
    // Also try to ingest into MultiSegmentFactRecord store if possible so Segment/PYD view stays synced
    if (lossConfig) {
      try {
        const res = ingestUniversalLossGrid(
          lossGrid,
          headerRowIdx,
          { ...lossConfig, detectedShape: 'wide_pivot' },
          valuationLabel
        );
        onIngestMappedDataset({
          records: res.records,
          summaryText: `Direct 2D Triangle Matrix (${directTrianglePreview.originLabels.length}×${directTrianglePreview.devPeriods.length})`,
          valuationLabel,
          availableGranularities: res.availableGranularities,
        });
      } catch {
        // Direct triangle already applied to main workspace
      }
    }
    onClose();
  };

  const handleExecuteSeparatePremiumJoinOnly = () => {
    if (!premConfig || premGrid.length === 0) return;
    setErrorMsg(null);
    try {
      const joined = joinSeparatePremiumExposureDataset(
        existingRecords,
        premGrid,
        premHeaderRowIdx,
        premConfig
      );
      onJoinSeparatePremiumDataset({
        updatedRecords: joined.updatedRecords,
        summaryText: joined.summaryText,
      });
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Failed to join separate Premium/Exposure dataset.'
      );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="schema-mapper-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="w-full max-w-6xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden my-6">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/70 dark:bg-slate-950/60">
          <div>
            <h2
              id="schema-mapper-title"
              className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"
            >
              <SlidersHorizontal className="w-4 h-4 text-sky-500" />
              Universal Data Ingestion & Direct Triangle Studio
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              会社のExcel(.xlsx/.xls)・CSV・TSVコピペ・タイトル行付きシート・和暦(R5/H30/令和)・縦持ち/横持ちピボット/単一2Dトライアングルに完全対応
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Schema Mapper Modal"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Studio Mode Tabs */}
        <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveStudioTab('loss')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeStudioTab === 'loss'
                  ? 'border-sky-500 bg-white dark:bg-slate-950 text-sky-700 dark:text-sky-300'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              ① 損害・クレームデータ取込 (縦持ち / 横持ちピボット / 個別明細)
            </button>

            <button
              type="button"
              onClick={() => setActiveStudioTab('direct_triangle')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeStudioTab === 'direct_triangle'
                  ? 'border-sky-500 bg-white dark:bg-slate-950 text-sky-700 dark:text-sky-300'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              ② 単一2Dトライアングル直接取込 (Direct Matrix)
              {directTrianglePreview && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-sky-500/20 text-sky-600 dark:text-sky-300 font-mono">
                  {directTrianglePreview.originLabels.length}×{directTrianglePreview.devPeriods.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveStudioTab('separate_premium')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeStudioTab === 'separate_premium'
                  ? 'border-sky-500 bg-white dark:bg-slate-950 text-sky-700 dark:text-sky-300'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              ③ 別ファイル・別シートの保険料／契約件数結合
              {premConfig && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-mono">
                  Ready
                </span>
              )}
            </button>
          </div>

          {/* Encoding Selector */}
          <div className="flex items-center gap-2 pb-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Encoding:
            </span>
            <select
              aria-label="Character Encoding"
              value={encoding}
              onChange={(e) =>
                setEncoding(e.target.value as FileCharacterEncoding)
              }
              className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="auto">Auto (Shift-JIS / UTF-8 自動判定)</option>
              <option value="shift-jis">Shift-JIS (日本語Windows/基幹系)</option>
              <option value="utf-8">UTF-8 / UTF-8 BOM</option>
            </select>
            <span className="font-mono text-[11px] text-slate-500">
              [{detectedEncodingBadge}]
            </span>
          </div>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Privacy Assurance + Quick One-Click Multi-Shape Demo Loaders */}
          <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/25 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-emerald-950 dark:text-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                <strong>100% ローカル処理＆ヘッダー行自動検出 (Row 1〜30):</strong>{' '}
                Excelブックの上部にタイトルや空白行があっても自動でヘッダー行を特定します。
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleLoadWidePivotAndSeparatePremDemo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                検証A：横持ちピボット損害表＋別ファイル保険料表
              </button>

              <button
                type="button"
                onClick={handleLoadMultiMetricJapaneseSample}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-sky-500/40 bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                検証B：Paid/Incurred/件数/Exposure フルセット
              </button>

              <button
                type="button"
                onClick={handleLoadWarekiMultiMetricEdgeCaseDemo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                検証C：和暦(令和/平成)・横持ちマルチ指標・マイナス進展・千円別表保険料
              </button>
            </div>
          </div>

          {statusMsg && (
            <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-xs text-sky-800 dark:text-sky-200">
              {statusMsg}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 1: LOSS / CLAIM DATA INGESTION (LONG / WIDE PIVOT / LEDGER)   */}
          {/* ================================================================= */}
          {activeStudioTab === 'loss' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    Select Loss CSV / TSV / Excel (.xlsx / .xls)
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,.xlsx,.xls"
                      onChange={handleLossFileUpload}
                      className="hidden"
                    />
                  </label>

                  {excelSheetNames.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-400">
                        Excel Sheet:
                      </span>
                      <select
                        value={selectedLossSheet}
                        onChange={(e) => {
                          const s = e.target.value;
                          setSelectedLossSheet(s);
                          if (excelSheetsMap[s]) {
                            const suggestedH =
                              excelSuggestedHeaderMap[s] ??
                              detectBestHeaderRowIndex(excelSheetsMap[s]);
                            applyLossGrid(excelSheetsMap[s], suggestedH, s);
                          }
                        }}
                        className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      >
                        {excelSheetNames.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {lossGrid.length > 1 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-400">
                        Header Row (ヘッダー行):
                      </span>
                      <select
                        aria-label="Loss Header Row Index"
                        value={headerRowIdx}
                        onChange={(e) =>
                          applyLossGrid(
                            lossGrid,
                            Number(e.target.value),
                            valuationLabel
                          )
                        }
                        className="font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      >
                        {lossGrid.slice(0, 30).map((row, idx) => (
                          <option key={idx} value={idx}>
                            Row {idx + 1}:{' '}
                            {row
                              .filter((c) => c.trim() !== '')
                              .slice(0, 4)
                              .join(', ')
                              .slice(0, 38) || '(空行)'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {lossConfig && (
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="px-2.5 py-1 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold">
                      Shape: {lossConfig.detectedShape.toUpperCase()}
                    </span>
                    <span className="text-slate-500">
                      {lossConfig.totalDataRows} rows
                    </span>
                  </div>
                )}
              </div>

              {/* Paste Box for Excel / CSV */}
              <div>
                <label
                  htmlFor="loss-paste-box"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  またはExcelから直接コピペ（タブ区切り・カンマ付き数値・横持ちピボット表もそのまま貼り付け可）:
                </label>
                <textarea
                  id="loss-paste-box"
                  rows={3}
                  placeholder="Excelの表範囲をコピーしてそのまま貼り付けてください（縦持ち・横持ちピボット・個別明細すべて自動認識）..."
                  value={rawLossText}
                  onChange={(e) => {
                    const txt = e.target.value;
                    setRawLossText(txt);
                    if (txt.trim().includes('\n')) {
                      const parsed = parseTextToRawGrid(txt);
                      applyLossGrid(parsed.grid, parsed.suggestedHeaderRowIndex);
                    }
                  }}
                  className="w-full p-2.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              {lossConfig && (
                <div className="space-y-4">
                  {/* Table Shape Mode Selector & Primary Column Mappings */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        1. テーブル構造 (Data Shape)
                      </label>
                      <select
                        aria-label="Loss Data Shape Mode"
                        value={lossConfig.detectedShape}
                        onChange={(e) => {
                          const nextShape = e.target.value as LossDataShapeMode;
                          let nextWide = lossConfig.wideValueCols;
                          if (nextShape === 'wide_pivot' && nextWide.length === 0) {
                            nextWide = lossConfig.headers.filter(
                              (h) =>
                                h !== lossConfig.originCol &&
                                h !== lossConfig.metricTypeCol &&
                                h !== lossConfig.premiumCol &&
                                !lossConfig.segmentCols.includes(h)
                            );
                          }
                          setLossConfig({
                            ...lossConfig,
                            detectedShape: nextShape,
                            wideValueCols: nextWide,
                          });
                        }}
                        className="w-full text-xs px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        <option value="long">
                          縦持ち集計 (Long / Tidy Format)
                        </option>
                        <option value="wide_pivot">
                          横持ちピボット (Wide Matrix: 列に進展月/評価期)
                        </option>
                        <option value="claim_ledger">
                          個別クレーム明細 (Raw Claim Ledger → 自動集計)
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        2. 事故期間 / 事故日列 (Origin)
                      </label>
                      <select
                        aria-label="Origin Column"
                        value={lossConfig.originCol}
                        onChange={(e) =>
                          setLossConfig({
                            ...lossConfig,
                            originCol: e.target.value,
                          })
                        }
                        className="w-full text-xs px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        {lossConfig.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {lossConfig.detectedShape !== 'wide_pivot' ? (
                      <>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              3. 進展期間 / 計上年月列
                            </label>
                            <select
                              value={lossConfig.devMode}
                              onChange={(e) =>
                                setLossConfig({
                                  ...lossConfig,
                                  devMode: e.target.value as
                                    | 'lag'
                                    | 'valuation_period',
                                })
                              }
                              className="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            >
                              <option value="lag">進展経過数</option>
                              <option value="valuation_period">
                                評価/支払年月
                              </option>
                            </select>
                          </div>
                          <select
                            value={lossConfig.devOrValCol}
                            onChange={(e) =>
                              setLossConfig({
                                ...lossConfig,
                                devOrValCol: e.target.value,
                              })
                            }
                            className="w-full text-xs px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          >
                            {lossConfig.headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              4. 支払損害額列 (Paid Loss)
                            </label>
                            <select
                              value={lossConfig.lossType}
                              onChange={(e) =>
                                setLossConfig({
                                  ...lossConfig,
                                  lossType: e.target.value as
                                    | 'cumulative'
                                    | 'incremental',
                                })
                              }
                              className="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            >
                              <option value="cumulative">累積 (Cum)</option>
                              <option value="incremental">期間増分 (Inc)</option>
                            </select>
                          </div>
                          <select
                            value={lossConfig.paidLossCol}
                            onChange={(e) =>
                              setLossConfig({
                                ...lossConfig,
                                paidLossCol: e.target.value,
                              })
                            }
                            className="w-full text-xs px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          >
                            {lossConfig.headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="lg:col-span-2">
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              3. 横持ち展開する進展月数 / 評価年月列 (クリックでON/OFF切替可):
                            </label>
                            <select
                              value={lossConfig.lossType}
                              onChange={(e) =>
                                setLossConfig({
                                  ...lossConfig,
                                  lossType: e.target.value as
                                    | 'cumulative'
                                    | 'incremental',
                                })
                              }
                              className="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            >
                              <option value="cumulative">累積値マトリクス</option>
                              <option value="incremental">期間増分マトリクス</option>
                            </select>
                          </div>
                          <div className="flex flex-wrap gap-1.5 p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 max-h-24 overflow-y-auto">
                            {lossConfig.headers
                              .filter((h) => h !== lossConfig.originCol)
                              .map((wc) => {
                                const active = lossConfig.wideValueCols.includes(wc);
                                return (
                                  <button
                                    key={wc}
                                    type="button"
                                    onClick={() => toggleWideValueCol(wc)}
                                    className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors cursor-pointer flex items-center gap-1 ${
                                      active
                                        ? 'border-sky-500 bg-sky-500/20 text-sky-700 dark:text-sky-300 font-semibold'
                                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500'
                                    }`}
                                  >
                                    {active ? '✓' : '+'} {wc}
                                  </button>
                                );
                              })}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            4. 横持ち表の指標区分列 (Metric Type Col · 任意)
                          </label>
                          <select
                            aria-label="Wide Pivot Metric Type Column"
                            value={lossConfig.metricTypeCol ?? ''}
                            onChange={(e) =>
                              setLossConfig({
                                ...lossConfig,
                                metricTypeCol: e.target.value || undefined,
                              })
                            }
                            className="w-full text-xs px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          >
                            <option value="">(指標区分列なし → 単一指標として取込)</option>
                            {lossConfig.headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>

                        {!lossConfig.metricTypeCol && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              5. 横持ち表の単一指標種別 (Target Metric)
                            </label>
                            <select
                              aria-label="Wide Pivot Target Metric"
                              value={lossConfig.wideTargetMetric ?? 'paid'}
                              onChange={(e) =>
                                setLossConfig({
                                  ...lossConfig,
                                  wideTargetMetric: e.target.value as
                                    | 'paid'
                                    | 'incurred'
                                    | 'claim_count',
                                })
                              }
                              className="w-full text-xs px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                            >
                              <option value="paid">支払損害額 (Paid Loss)</option>
                              <option value="incurred">
                                発生損害額 (Incurred Loss)
                              </option>
                              <option value="claim_count">
                                クレーム件数 (Claim Count)
                              </option>
                            </select>
                          </div>
                        )}
                      </>
                    )}

                    {/* Multi-Metric Optional Columns */}
                    {lossConfig.detectedShape !== 'wide_pivot' && (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            5. 発生損害額列 (Incurred · 任意)
                          </label>
                          <select
                            value={lossConfig.incurredLossCol ?? ''}
                            onChange={(e) =>
                              setLossConfig({
                                ...lossConfig,
                                incurredLossCol: e.target.value || undefined,
                              })
                            }
                            className="w-full text-xs px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          >
                            <option value="">(未指定 / 個別備金から合成)</option>
                            {lossConfig.headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            6. 個別支払備金列 (Case Reserve · 任意)
                          </label>
                          <select
                            value={lossConfig.caseReserveCol ?? ''}
                            onChange={(e) =>
                              setLossConfig({
                                ...lossConfig,
                                caseReserveCol: e.target.value || undefined,
                              })
                            }
                            className="w-full text-xs px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          >
                            <option value="">(未指定)</option>
                            {lossConfig.headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            7. クレーム件数列 (Claim Count · 任意)
                          </label>
                          <select
                            value={lossConfig.claimCountCol ?? ''}
                            onChange={(e) =>
                              setLossConfig({
                                ...lossConfig,
                                claimCountCol: e.target.value || undefined,
                              })
                            }
                            className="w-full text-xs px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          >
                            <option value="">(未指定)</option>
                            {lossConfig.headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        既経過保険料列 (別ファイルの場合は不要)
                      </label>
                      <select
                        value={lossConfig.premiumCol ?? ''}
                        onChange={(e) =>
                          setLossConfig({
                            ...lossConfig,
                            premiumCol: e.target.value || undefined,
                          })
                        }
                        className="w-full text-xs px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        <option value="">
                          (別データ結合 または 損害規模から自動推計)
                        </option>
                        {lossConfig.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Unit Multiplier & Interior Gap Carry-Forward Controls */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        金額単位倍率補正 (Loss Unit Multiplier)
                      </label>
                      <select
                        aria-label="Loss Unit Multiplier"
                        value={lossConfig.unitMultiplier ?? 1}
                        onChange={(e) =>
                          setLossConfig({
                            ...lossConfig,
                            unitMultiplier: Number(e.target.value),
                          })
                        }
                        className="w-full text-xs font-mono px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        <option value={1}>×1 (等倍・そのまま)</option>
                        <option value={1000}>×1,000 (千円表記 → 円へ換算)</option>
                        <option value={1000000}>
                          ×1,000,000 (百万円表記 → 円へ換算)
                        </option>
                        <option value={0.001}>÷1,000 (円表記 → 千円へ縮小)</option>
                      </select>
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={lossConfig.fillInteriorGaps ?? true}
                          onChange={(e) =>
                            setLossConfig({
                              ...lossConfig,
                              fillInteriorGaps: e.target.checked,
                            })
                          }
                          className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span>
                          途中の歯抜け進展セルを直前累積値で自動補完 (未到来領域はNull保持)
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Pre-Flight Data Health Check Summary Panel */}
                  {liveDiagnostics && (
                    <div
                      data-testid="preflight-diagnostics-banner"
                      className="p-3.5 rounded-lg border border-sky-500/30 bg-sky-50/50 dark:bg-sky-950/30 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-sky-500" />
                          Pre-Flight Data Health Check (取込前データ自動診断サマリー)
                        </div>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold">
                          Ready to Analyze Immediately
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs font-mono">
                        <div className="p-2 rounded bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
                          <div className="text-[10px] text-slate-500">認識データ点</div>
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {liveDiagnostics.validCellsCount} pts
                          </div>
                        </div>

                        <div className="p-2 rounded bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
                          <div className="text-[10px] text-slate-500">スキップ行/空欄</div>
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {liveDiagnostics.skippedRowsCount}
                          </div>
                        </div>

                        <div className="p-2 rounded bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
                          <div className="text-[10px] text-slate-500">自動認識した日付形式</div>
                          <div className="font-bold text-sky-700 dark:text-sky-300 truncate">
                            {liveDiagnostics.detectedDateFormats.join(', ') || 'Auto'}
                          </div>
                        </div>

                        <div className="p-2 rounded bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
                          <div className="text-[10px] text-slate-500">歯抜け直前値補完</div>
                          <div className="font-bold text-amber-600 dark:text-amber-400">
                            {liveDiagnostics.interiorGapsFilledCount} cells
                          </div>
                        </div>

                        <div className="p-2 rounded bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
                          <div className="text-[10px] text-slate-500">
                            マイナス進展 (LDF&lt;1.0)
                          </div>
                          <div className="font-bold text-emerald-600 dark:text-emerald-400">
                            {liveDiagnostics.negativeDevCellsCount} cells保持
                          </div>
                        </div>

                        <div className="p-2 rounded bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
                          <div className="text-[10px] text-slate-500">
                            途中新設/非対称セグメント
                          </div>
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {liveDiagnostics.asymmetricSegmentsCount} segs整列
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Arbitrary Segment Checkboxes */}
                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">
                      セグメント軸として使用する列を選択（単一トライアングルの場合は全OFFでもOK）:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {lossConfig.headers.map((h) => {
                        const isChecked = lossConfig.segmentCols.includes(h);
                        return (
                          <button
                            key={h}
                            type="button"
                            onClick={() => toggleLossSegmentCol(h)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                              isChecked
                                ? 'border-sky-500 bg-sky-600 text-white'
                                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {isChecked ? (
                              <CheckSquare className="w-3.5 h-3.5" />
                            ) : (
                              <Square className="w-3.5 h-3.5" />
                            )}
                            {h}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800/70 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Table className="w-3.5 h-3.5 text-sky-500" />
                      Loss Data Preview (Row {headerRowIdx + 1} ヘッダー基準・先頭5行プレビュー)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500">
                            {lossConfig.headers.map((h) => (
                              <th
                                key={h}
                                className="py-2 px-3 text-left font-mono whitespace-nowrap"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                          {lossConfig.sampleRows.map((row, idx) => (
                            <tr key={idx}>
                              {lossConfig.headers.map((h) => (
                                <td
                                  key={h}
                                  className="py-1.5 px-3 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap"
                                >
                                  {row[h]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: DIRECT 2D TRIANGLE MATRIX MODE (Single Triangle)           */}
          {/* ================================================================= */}
          {activeStudioTab === 'direct_triangle' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-sky-500/30 bg-sky-50/40 dark:bg-sky-950/20 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong className="font-semibold text-slate-900 dark:text-white">
                  単一2Dトライアングル直接取込モード (Direct Matrix):
                </strong>{' '}
                セグメント列や保険料列がないシンプルな2次元トライアングル表（Excelシートまたはコピー＆ペースト）を、列マッピング設定なしでそのままメイン画面のトライアングルへ直接取り込みます。
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    Select Triangle Excel (.xlsx) / CSV / TSV
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,.xlsx,.xls"
                      onChange={handleLossFileUpload}
                      className="hidden"
                    />
                  </label>

                  {lossGrid.length > 1 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-400">
                        Header Row:
                      </span>
                      <select
                        value={headerRowIdx}
                        onChange={(e) =>
                          applyLossGrid(
                            lossGrid,
                            Number(e.target.value),
                            valuationLabel
                          )
                        }
                        className="font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      >
                        {lossGrid.slice(0, 30).map((row, idx) => (
                          <option key={idx} value={idx}>
                            Row {idx + 1}:{' '}
                            {row
                              .filter((c) => c.trim() !== '')
                              .slice(0, 4)
                              .join(', ')
                              .slice(0, 38) || '(空行)'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      Multiplier:
                    </span>
                    <select
                      value={directUnitMult}
                      onChange={(e) => setDirectUnitMult(Number(e.target.value))}
                      className="font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value={1}>×1</option>
                      <option value={1000}>×1,000 (千円→円)</option>
                      <option value={1000000}>×1,000,000 (百万円→円)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Excelの2Dトライアングル範囲をここに直接貼り付け (Tab / CSV):
                </label>
                <textarea
                  rows={4}
                  placeholder={
                    'Origin\t12\t24\t36\t48\n2020\t120,000\t210,000\t265,000\t290,000\n2021\t135,000\t232,000\t291,000\t-\n2022\t148,000\t254,000\t-\t-\n2023\t162,000\t-\t-\t-'
                  }
                  value={rawLossText}
                  onChange={(e) => {
                    const txt = e.target.value;
                    setRawLossText(txt);
                    if (txt.trim().includes('\n')) {
                      const parsed = parseTextToRawGrid(txt);
                      applyLossGrid(parsed.grid, parsed.suggestedHeaderRowIndex);
                    }
                  }}
                  className="w-full p-2.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              {directTrianglePreview && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/20 overflow-hidden">
                  <div className="px-4 py-2 bg-emerald-500/10 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                    <span>
                      Direct 2D Triangle Matrix Preview ({directTrianglePreview.originLabels.length} Origins × {directTrianglePreview.devPeriods.length} Dev Periods)
                    </span>
                    <button
                      type="button"
                      onClick={handleExecuteDirectTriangleOnly}
                      className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                    >
                      この2Dトライアングルを今すぐ反映
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs font-mono tabular-nums">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500">
                          <th className="py-1.5 px-3 text-left">Origin</th>
                          {directTrianglePreview.devPeriods.map((d) => (
                            <th key={d} className="py-1.5 px-3 text-right">
                              Dev {d}
                            </th>
                          ))}
                          <th className="py-1.5 px-3 text-right text-sky-600 dark:text-sky-400">
                            Earned Prem (Auto/Col)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                        {directTrianglePreview.originLabels.map((lbl, rIdx) => (
                          <tr key={lbl}>
                            <td className="py-1.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                              {lbl}
                            </td>
                            {directTrianglePreview.triangle[rIdx].map((v, cIdx) => (
                              <td
                                key={cIdx}
                                className="py-1.5 px-3 text-right text-slate-700 dark:text-slate-300"
                              >
                                {v !== null ? v.toLocaleString() : '—'}
                              </td>
                            ))}
                            <td className="py-1.5 px-3 text-right text-sky-700 dark:text-sky-300">
                              {directTrianglePreview.earnedPremium[rIdx]?.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: SEPARATE PREMIUM / EXPOSURE DATASET RELATIONAL JOIN        */}
          {/* ================================================================= */}
          {activeStudioTab === 'separate_premium' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-sky-500/30 bg-sky-50/40 dark:bg-sky-950/20 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong className="font-semibold text-slate-900 dark:text-white">
                  別ファイル・別シートの保険料／契約件数（Exposure）スマート結合:
                </strong>{' '}
                損害データとは別管理になっている保険料・契約件数テーブル（縦持ち または 年度が列方向に並ぶ横持ち表）を読み込み、共通するセグメント列と期間（月次・四半期・暦年CY・4月会計年度FY）で自動突合します。
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    Select Separate Premium / Exposure CSV or Excel (.xlsx)
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,.xlsx,.xls"
                      onChange={handleSeparatePremFileUpload}
                      className="hidden"
                    />
                  </label>

                  {excelSheetNames.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-400">
                        Excel Sheet:
                      </span>
                      <select
                        value={selectedPremSheet}
                        onChange={(e) => {
                          const s = e.target.value;
                          setSelectedPremSheet(s);
                          if (excelSheetsMap[s]) {
                            const suggestedH =
                              excelSuggestedHeaderMap[s] ??
                              detectBestHeaderRowIndex(excelSheetsMap[s]);
                            applyPremiumGrid(excelSheetsMap[s], suggestedH);
                          }
                        }}
                        className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      >
                        {excelSheetNames.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {premGrid.length > 1 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-400">
                        Header Row:
                      </span>
                      <select
                        value={premHeaderRowIdx}
                        onChange={(e) =>
                          applyPremiumGrid(premGrid, Number(e.target.value))
                        }
                        className="font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      >
                        {premGrid.slice(0, 30).map((row, idx) => (
                          <option key={idx} value={idx}>
                            Row {idx + 1}:{' '}
                            {row
                              .filter((c) => c.trim() !== '')
                              .slice(0, 4)
                              .join(', ')
                              .slice(0, 38) || '(空行)'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {premConfig && (
                  <div className="text-xs font-mono text-sky-700 dark:text-sky-300 font-semibold">
                    Premium Table Shape: {premConfig.detectedShape.toUpperCase()} (
                    {premConfig.totalDataRows} rows)
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="prem-paste-box"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  または別エクセルの保険料・契約件数表をここに直接貼り付け（縦持ち・横持ち年度列どちらも可）:
                </label>
                <textarea
                  id="prem-paste-box"
                  rows={3}
                  placeholder="保険種目,販売チャネル,指標区分,FY2018,FY2019,FY2020..."
                  value={rawPremText}
                  onChange={(e) => {
                    const txt = e.target.value;
                    setRawPremText(txt);
                    if (txt.trim().includes('\n')) {
                      const parsed = parseTextToRawGrid(txt);
                      applyPremiumGrid(
                        parsed.grid,
                        parsed.suggestedHeaderRowIndex
                      );
                    }
                  }}
                  className="w-full p-2.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              {premConfig && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        結合キーとして使用するセグメント列（損害データと共通する列で自動マッチング＆下位セグメント按分）:
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          保険料テーブルの単位倍率 (Premium Unit Multiplier):
                        </span>
                        <select
                          aria-label="Premium Unit Multiplier"
                          value={premConfig.unitMultiplier ?? 1}
                          onChange={(e) =>
                            setPremConfig({
                              ...premConfig,
                              unitMultiplier: Number(e.target.value),
                            })
                          }
                          className="text-xs font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                        >
                          <option value={1}>×1 (損害表と同じ単位)</option>
                          <option value={1000}>
                            ×1,000 (千円表記の保険料 → 円単位の損害表へ合わせる)
                          </option>
                          <option value={1000000}>
                            ×1,000,000 (百万円表記の保険料 → 円単位へ合わせる)
                          </option>
                          <option value={0.001}>
                            ÷1,000 (円表記の保険料 → 千円単位へ縮小)
                          </option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {premConfig.headers.map((h) => {
                        const isChecked = premConfig.segmentCols.includes(h);
                        return (
                          <button
                            key={h}
                            type="button"
                            onClick={() => togglePremSegmentCol(h)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                              isChecked
                                ? 'border-sky-500 bg-sky-600 text-white'
                                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {isChecked ? (
                              <CheckSquare className="w-3.5 h-3.5" />
                            ) : (
                              <Square className="w-3.5 h-3.5" />
                            )}
                            {h}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800/70 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Table className="w-3.5 h-3.5 text-sky-500" />
                      Separate Premium / Exposure Preview (先頭5行プレビュー)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500">
                            {premConfig.headers.map((h) => (
                              <th
                                key={h}
                                className="py-2 px-3 text-left font-mono whitespace-nowrap"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                          {premConfig.sampleRows.map((row, idx) => (
                            <tr key={idx}>
                              {premConfig.headers.map((h) => (
                                <td
                                  key={h}
                                  className="py-1.5 px-3 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap"
                                >
                                  {row[h]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            カンマ付き数値・ハイフン・空白セルを自動クレンジングし、未観測領域は厳密に <code>NaN / Null</code> として保持します。
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>

            {activeStudioTab === 'direct_triangle' && directTrianglePreview && (
              <button
                type="button"
                onClick={handleExecuteDirectTriangleOnly}
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors cursor-pointer"
              >
                Apply Direct 2D Triangle Matrix (単一2Dトライアングルとして反映)
              </button>
            )}

            {activeStudioTab === 'separate_premium' && premConfig && !lossConfig && (
              <button
                type="button"
                onClick={handleExecuteSeparatePremiumJoinOnly}
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors cursor-pointer"
              >
                Join Separate Premium / Exposure to Current Portfolio (現在のデータへ保険料結合)
              </button>
            )}

            {lossConfig && lossGrid.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  try {
                    const res = ingestUniversalLossGrid(
                      lossGrid,
                      headerRowIdx,
                      lossConfig,
                      valuationLabel
                    );
                    let finalRecs = res.records;
                    if (premConfig && premGrid.length > 0) {
                      finalRecs = joinSeparatePremiumExposureDataset(
                        finalRecs,
                        premGrid,
                        premHeaderRowIdx,
                        premConfig
                      ).updatedRecords;
                    }
                    exportNormalizedFactDatasetXlsx(finalRecs);
                  } catch (err) {
                    setErrorMsg(
                      err instanceof Error
                        ? err.message
                        : 'Failed to export normalized dataset.'
                    );
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-sky-500/40 bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                クレンジング・保険料結合済データをExcel出力 (.xlsx)
              </button>
            )}

            <button
              type="button"
              disabled={!lossConfig && !premConfig && !directTrianglePreview}
              onClick={() => {
                if (activeStudioTab === 'direct_triangle' && directTrianglePreview) {
                  handleExecuteDirectTriangleOnly();
                } else if (lossConfig) {
                  handleExecuteLossIngest(true);
                } else if (premConfig) {
                  handleExecuteSeparatePremiumJoinOnly();
                }
              }}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white shadow-xs transition-colors cursor-pointer"
            >
              {lossConfig && premConfig
                ? 'Build Triangles & Join Separate Premium Table (損害＋別表保険料を一括結合生成)'
                : 'Apply Mapping & Build Triangles (トライアングル生成)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
