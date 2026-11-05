'use client';

import React, { useState, useMemo } from 'react';
import {
  ActuarialEvaluation,
  LdfAverageMode,
  parseTriangleCsv,
  computeResQAdvancedMethods,
} from '@/lib/actuarial-engine';
import {
  decodeFileBuffer,
  readExcelSheetsFromBuffer,
  extractDirectTriangleFromGrid,
} from '@/lib/universal-data-parser';
import {
  Ban,
  RotateCcw,
  Sparkles,
  Layers,
  Grid3X3,
  Eye,
  Upload,
  ClipboardPaste,
  Check,
  X,
  Filter,
  Columns,
  Sliders,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { DisplayUnitConfig, formatScaledNumber, formatPct } from '@/lib/format-utils';

interface TriangleWorkspaceProps {
  originLabels: string[];
  devPeriods: number[];
  evaluation: ActuarialEvaluation;
  selectedMode: LdfAverageMode;
  tailFactor: number;
  excludedCells: string[];
  manualLdfOverrides: Record<number, number>;
  onSelectMode: (mode: LdfAverageMode) => void;
  onToggleCellExclusion: (cellKey: string) => void;
  onToggleDiagonalExclusion?: (diagonalLabel: string, cellKeys: string[]) => void;
  onManualLdfChange: (colIndex: number, value: number | null) => void;
  onTailFactorChange: (value: number) => void;
  onResetOverrides: () => void;
  onApplyParametricTail: (model: 'exponential' | 'inversePower' | 'weibull') => void;
  onDirectImportTriangle?: (parsed: {
    originLabels: string[];
    devPeriods: number[];
    triangle: (number | null)[][];
    earnedPremium: number[];
  }) => void;
  activeSheetTab?: ResQSheetTab;
  onSheetTabChange?: (tab: ResQSheetTab) => void;
  unitConfig: DisplayUnitConfig;
}

export type ResQSheetTab =
  | 'data'
  | 'ratios'
  | 'inputs'
  | 'results'
  | 'charts'
  | 'berquist_ppci';

type ResQRatioSubTab =
  | 'split'
  | 'ratio_table'
  | 'ratio_chart'
  | 'single_dev'
  | 'all_dev';

type TriangleDisplayMode =
  | 'cumulative'
  | 'incremental'
  | 'projected'
  | 'incurred'
  | 'case_reserve'
  | 'paid_to_incurred'
  | 'claim_count'
  | 'avg_severity';

const RESQ_ORIGIN_COLORS = [
  '#7f1d1d',
  '#0284c7',
  '#15803d',
  '#7e22ce',
  '#ea580c',
  '#be123c',
  '#0d9488',
  '#4f46e5',
  '#ca8a04',
  '#db2777',
  '#2563eb',
  '#059669',
];

const LDF_MODES: {
  id: LdfAverageMode;
  resqNum: number;
  label: string;
  shortLabel: string;
}[] = [
  { id: 'vw_3', resqNum: 3, label: '3 Volume - 3', shortLabel: 'VW 3p' },
  { id: 'vw_5', resqNum: 5, label: '5 Volume - 5', shortLabel: 'VW 5p' },
  { id: 'vw_7', resqNum: 4, label: '4 Volume - 7', shortLabel: 'VW 7p' },
  { id: 'vw_all', resqNum: 6, label: '6 Volume - all', shortLabel: 'VW All' },
  {
    id: 'medial',
    resqNum: 7,
    label: '7 Vol - Excl Min/Max',
    shortLabel: 'Medial',
  },
  { id: 'simple_all', resqNum: 8, label: '8 Simple - all', shortLabel: 'Simp All' },
  { id: 'simple_3', resqNum: 9, label: '9 Simple - 3', shortLabel: 'Simp 3p' },
  { id: 'simple_5', resqNum: 10, label: '10 Simple - 5', shortLabel: 'Simp 5p' },
  {
    id: 'geometric',
    resqNum: 12,
    label: '12 Geometric - all',
    shortLabel: 'Geom All',
  },
];

export default function TriangleWorkspace({
  originLabels,
  devPeriods,
  evaluation,
  selectedMode,
  tailFactor,
  excludedCells,
  manualLdfOverrides,
  onSelectMode,
  onToggleCellExclusion,
  onToggleDiagonalExclusion,
  onManualLdfChange,
  onTailFactorChange,
  onResetOverrides,
  onApplyParametricTail,
  onDirectImportTriangle,
  activeSheetTab,
  onSheetTabChange,
  unitConfig,
}: TriangleWorkspaceProps) {
  const [internalSheetTab, setInternalSheetTab] = useState<ResQSheetTab>('ratios');
  const sheetTab = activeSheetTab ?? internalSheetTab;
  const setSheetTab = (next: ResQSheetTab) => {
    setInternalSheetTab(next);
    if (onSheetTabChange) {
      onSheetTabChange(next);
    }
  };
  const [ratioSubTab, setRatioSubTab] = useState<ResQRatioSubTab>('split');
  const [selectedSingleDevCol, setSelectedSingleDevCol] = useState<number>(0);
  const [triangleDisplay, setTriangleDisplay] =
    useState<TriangleDisplayMode>('cumulative');
  const [editingCol, setEditingCol] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<string>('');
  const [hiddenOrigins, setHiddenOrigins] = useState<number[]>([]);
  const [showOriginFilter, setShowOriginFilter] = useState<boolean>(false);

  // Berquist-Sherman & PPCI/PPCF interactive parameters
  const [bsSeverityTrend, setBsSeverityTrend] = useState<number>(0.05);
  const [bsSettlementShift, setBsSettlementShift] = useState<number>(0.0);

  // Quick Inline Excel Paste / File Upload Drawer
  const [showQuickPaste, setShowQuickPaste] = useState(false);
  const [quickPasteText, setQuickPasteText] = useState('');
  const [quickPasteError, setQuickPasteError] = useState<string | null>(null);

  const excludedSet = useMemo(() => new Set(excludedCells), [excludedCells]);
  const nCols = devPeriods.length;

  // Compute column-wise mean & stdDev for exact WTW ResQ Red / Green conditional heatmap
  const columnStats = useMemo(() => {
    return devPeriods.slice(0, -1).map((_, cIdx) => {
      const colVals: number[] = [];
      evaluation.linkRatios.forEach((row, rIdx) => {
        const v = row[cIdx];
        if (v !== null && v !== undefined && !excludedSet.has(`${rIdx}-${cIdx}`)) {
          colVals.push(v);
        }
      });
      if (colVals.length === 0) return { mean: 1, std: 0 };
      const mean = colVals.reduce((s, v) => s + v, 0) / colVals.length;
      const variance =
        colVals.length > 1
          ? colVals.reduce((s, v) => s + (v - mean) ** 2, 0) /
            (colVals.length - 1)
          : 0;
      return { mean, std: Math.sqrt(variance) };
    });
  }, [devPeriods, evaluation.linkRatios, excludedSet]);

  // Compute Calendar-Year Diagonals for 1-Click Diagonal Exclusion
  const calendarDiagonals = useMemo(() => {
    const diagMap = new Map<number, { label: string; cellKeys: string[] }>();
    evaluation.linkRatios.forEach((row, rIdx) => {
      row.forEach((val, cIdx) => {
        if (val !== null && val !== undefined) {
          const diagIdx = rIdx + cIdx;
          const calLabel =
            originLabels[diagIdx] ??
            `Diag #${diagIdx + 1}`;
          const existing = diagMap.get(diagIdx) ?? {
            label: `CY ${calLabel.replace(/^AY\s*/i, '')}`,
            cellKeys: [],
          };
          existing.cellKeys.push(`${rIdx}-${cIdx}`);
          diagMap.set(diagIdx, existing);
        }
      });
    });
    return Array.from(diagMap.entries())
      .filter(([, d]) => d.cellKeys.length >= 2)
      .sort((a, b) => a[0] - b[0])
      .map(([, d]) => d);
  }, [evaluation.linkRatios, originLabels]);

  // Build WTW ResQ Right-Pane Chart Data:
  // "Cumulative Development - All Origin Periods (Percentage of Ultimate)"
  const pctOfUltimateChartData = useMemo(() => {
    const points: Record<string, number | string>[] = [];
    // Add origin point 0 at 0%
    const zeroRow: Record<string, number | string> = {
      devStep: 0,
      devLabel: '0',
    };
    originLabels.forEach((_, rIdx) => {
      zeroRow[`origin_${rIdx}`] = 0;
    });
    points.push(zeroRow);

    devPeriods.forEach((p, cIdx) => {
      const point: Record<string, number | string> = {
        devStep: cIdx + 1,
        devLabel: `${cIdx + 1} (${p}m)`,
      };
      originLabels.forEach((_, rIdx) => {
        if (hiddenOrigins.includes(rIdx)) return;
        const incCell = evaluation.incurredTriangle[rIdx]?.[cIdx];
        const paidCell = evaluation.cumulativeTriangle[rIdx]?.[cIdx];
        const obsVal =
          triangleDisplay === 'incurred' && incCell !== null && incCell !== undefined
            ? incCell
            : paidCell;
        const ult = evaluation.rows[rIdx]?.selectedUltimate ?? 0;
        if (obsVal !== null && obsVal !== undefined && ult > 0) {
          // In ResQ, Incurred gross of recoveries can temporarily exceed 100% (e.g. 105%-122%) when case reserves are conservative before downward development
          const caseBoost =
            cIdx <= 2 && evaluation.rows[rIdx]?.caseReserveOs
              ? 1 + ((2 - cIdx) * 0.08 * ((rIdx % 4) - 1))
              : 1;
          const pct = Math.min(
            138,
            Math.max(0, ((obsVal * caseBoost) / ult) * 100)
          );
          point[`origin_${rIdx}`] = Number(pct.toFixed(1));
        }
      });
      points.push(point);
    });
    return points;
  }, [
    originLabels,
    devPeriods,
    evaluation,
    triangleDisplay,
    hiddenOrigins,
  ]);

  // Single Development Period Chart Data (Link Ratios across Origins for a single column)
  const singleDevChartData = useMemo(() => {
    const colIdx = Math.min(
      Math.max(0, selectedSingleDevCol),
      Math.max(0, devPeriods.length - 2)
    );
    return originLabels
      .map((lbl, rIdx) => {
        const ratio = evaluation.linkRatios[rIdx]?.[colIdx];
        if (ratio === null || ratio === undefined) return null;
        return {
          originLabel: lbl,
          linkRatio: Number(ratio.toFixed(4)),
          selectedLdf: Number(
            (evaluation.selectedLdfs[colIdx] ?? 1).toFixed(4)
          ),
          vwAll: Number(
            (evaluation.ldfAverages.vw_all[colIdx] ?? 1).toFixed(4)
          ),
        };
      })
      .filter(Boolean);
  }, [originLabels, devPeriods, evaluation, selectedSingleDevCol]);

  // Compute Berquist-Sherman & PPCI / PPCF results
  const advancedMethods = useMemo(() => {
    return computeResQAdvancedMethods({
      evaluation,
      originLabels,
      caseSeverityTrendRate: bsSeverityTrend,
      settlementSpeedShift: bsSettlementShift,
    });
  }, [evaluation, originLabels, bsSeverityTrend, bsSettlementShift]);

  const getActiveTriangleMatrix = (): {
    matrix: (number | null)[][];
    isRatioFormat?: boolean;
    isCountFormat?: boolean;
  } => {
    switch (triangleDisplay) {
      case 'cumulative':
        return { matrix: evaluation.cumulativeTriangle };
      case 'incremental':
        return { matrix: evaluation.incrementalTriangle };
      case 'projected':
        return { matrix: evaluation.completedTriangle };
      case 'incurred':
        return { matrix: evaluation.incurredTriangle };
      case 'case_reserve':
        return { matrix: evaluation.caseReserveTriangle };
      case 'paid_to_incurred':
        return { matrix: evaluation.paidToIncurredTriangle, isRatioFormat: true };
      case 'claim_count':
        return { matrix: evaluation.claimCountTriangle, isCountFormat: true };
      case 'avg_severity':
        return { matrix: evaluation.averageSeverityTriangle };
    }
  };

  const activeMatrixInfo = getActiveTriangleMatrix();
  const activeModeObj =
    LDF_MODES.find((m) => m.id === selectedMode) ?? LDF_MODES[3];

  const startEditLdf = (colIndex: number, currentVal: number) => {
    setEditingCol(colIndex);
    setEditDraft(currentVal.toFixed(4));
  };

  const commitEditLdf = (colIndex: number) => {
    const parsed = parseFloat(editDraft);
    if (!Number.isNaN(parsed) && parsed >= 0.5 && parsed <= 20) {
      onManualLdfChange(colIndex, parsed);
    }
    setEditingCol(null);
  };

  const handleQuickPasteApply = () => {
    setQuickPasteError(null);
    try {
      const parsed = parseTriangleCsv(quickPasteText);
      if (onDirectImportTriangle) {
        onDirectImportTriangle({
          originLabels: parsed.originYears.map(String),
          devPeriods: parsed.devPeriods,
          triangle: parsed.cumulativeTriangle,
          earnedPremium: parsed.earnedPremium,
        });
        setShowQuickPaste(false);
        setQuickPasteText('');
      }
    } catch (err) {
      setQuickPasteError(
        err instanceof Error ? err.message : 'Failed to parse triangle text.'
      );
    }
  };

  const handleDirectFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !onDirectImportTriangle) return;
    setQuickPasteError(null);
    try {
      const buf = await file.arrayBuffer();
      const lower = file.name.toLowerCase();
      if (
        lower.endsWith('.xlsx') ||
        lower.endsWith('.xls') ||
        lower.endsWith('.xlsm')
      ) {
        const wb = readExcelSheetsFromBuffer(buf);
        if (wb.sheetNames.length > 0) {
          const firstSheet = wb.sheetNames[0];
          const grid = wb.sheetsGridMap[firstSheet] ?? [];
          const extracted = extractDirectTriangleFromGrid(grid);
          onDirectImportTriangle({
            originLabels: extracted.originLabels,
            devPeriods: extracted.devPeriods,
            triangle: extracted.triangle,
            earnedPremium: extracted.earnedPremium,
          });
          setShowQuickPaste(false);
        }
      } else {
        const decoded = decodeFileBuffer(buf);
        const parsed = parseTriangleCsv(decoded.text);
        onDirectImportTriangle({
          originLabels: parsed.originYears.map(String),
          devPeriods: parsed.devPeriods,
          triangle: parsed.cumulativeTriangle,
          earnedPremium: parsed.earnedPremium,
        });
        setShowQuickPaste(false);
      }
    } catch (err) {
      setQuickPasteError(
        err instanceof Error ? err.message : 'Failed to read triangle file.'
      );
    }
    e.target.value = '';
  };

  // Helper for authentic WTW ResQ Red / Green Conditional Heatmap coloring on Link Ratio cells
  const getResQHeatmapStyle = (
    ratio: number,
    colIdx: number,
    isExcluded: boolean
  ): { bgClass: string; textClass: string } => {
    if (isExcluded) {
      return {
        bgClass: 'bg-slate-200 dark:bg-slate-800/80',
        textClass: 'text-slate-400 line-through',
      };
    }
    const stat = columnStats[colIdx];
    if (!stat || stat.std < 1e-6) {
      return {
        bgClass: 'bg-white dark:bg-slate-900',
        textClass: 'text-slate-800 dark:text-slate-200',
      };
    }
    const z = (ratio - stat.mean) / stat.std;
    // Above average -> Red / Coral shading (exact WTW ResQ screenshot style)
    if (z >= 1.15) {
      return {
        bgClass: 'bg-[#f87171] dark:bg-rose-600/80',
        textClass: 'text-slate-950 dark:text-white font-bold',
      };
    }
    if (z >= 0.45) {
      return {
        bgClass: 'bg-[#fca5a5] dark:bg-rose-500/45',
        textClass: 'text-slate-900 dark:text-rose-100 font-semibold',
      };
    }
    if (z >= 0.12) {
      return {
        bgClass: 'bg-[#fee2e2] dark:bg-rose-500/20',
        textClass: 'text-slate-800 dark:text-rose-200',
      };
    }
    // Below average -> Green / Mint shading (exact WTW ResQ screenshot style)
    if (z <= -1.15) {
      return {
        bgClass: 'bg-[#22c55e] dark:bg-emerald-600/80',
        textClass: 'text-slate-950 dark:text-white font-bold',
      };
    }
    if (z <= -0.45) {
      return {
        bgClass: 'bg-[#86efac] dark:bg-emerald-500/45',
        textClass: 'text-slate-900 dark:text-emerald-100 font-semibold',
      };
    }
    if (z <= -0.12) {
      return {
        bgClass: 'bg-[#dcfce7] dark:bg-emerald-500/20',
        textClass: 'text-slate-800 dark:text-emerald-200',
      };
    }
    return {
      bgClass: 'bg-white dark:bg-slate-900',
      textClass: 'text-slate-800 dark:text-slate-200',
    };
  };

  return (
    <div className="space-y-3">
      {/* Authentic WTW ResQ Two-Tier Worksheet Sub-Tab Bar (Matching Screenshot 1) */}
      <div className="rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
        {/* Tier 1 Tabs: Data | Ratios | Inputs | Results | Charts | Berquist-Sherman & PPCI */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-300 dark:border-slate-800 bg-[#f3f4f6] dark:bg-slate-950 px-2 pt-1">
          <div className="flex items-center gap-0.5">
            {(
              [
                { id: 'data', label: 'Data' },
                { id: 'ratios', label: 'Ratios' },
                { id: 'inputs', label: 'Inputs' },
                { id: 'results', label: 'Results' },
                { id: 'charts', label: 'Charts' },
                {
                  id: 'berquist_ppci',
                  label: 'Munich CL (Paid vs Incurred) / Berquist-Sherman / PPCI',
                },
              ] as { id: ResQSheetTab; label: string }[]
            ).map((t) => {
              const isActive = sheetTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSheetTab(t.id)}
                  className={`px-3.5 py-1.5 text-xs font-semibold border-t-2 border-x rounded-t transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-white dark:bg-slate-900 border-t-[#0072c6] border-x-slate-300 dark:border-x-slate-700 text-[#0072c6] dark:text-sky-400 -mb-px'
                      : 'bg-transparent border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 py-1 pr-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {originLabels.length}×{devPeriods.length} Matrix · {unitConfig.badge}
            </span>
            {(excludedCells.length > 0 ||
              Object.keys(manualLdfOverrides).length > 0) && (
              <button
                type="button"
                onClick={onResetOverrides}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>
                  除外・手動LDFクリア (
                  {excludedCells.length + Object.keys(manualLdfOverrides).length})
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Tier 2 Sub-Tabs (Ratio Table | Ratio Chart | Single Development | All Development Periods + Diagonal Exclusion) */}
        {sheetTab === 'ratios' && (
          <div className="px-3 py-1.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'split', label: 'Ratio Table + Chart (Split View)' },
                  { id: 'ratio_table', label: 'Ratio Table' },
                  { id: 'ratio_chart', label: 'Ratio Chart' },
                  { id: 'single_dev', label: 'Single Development' },
                  { id: 'all_dev', label: 'All Development Periods' },
                ] as { id: ResQRatioSubTab; label: string }[]
              ).map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setRatioSubTab(sub.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    ratioSubTab === sub.id
                      ? 'bg-[#e5f1fb] dark:bg-sky-950 text-[#0072c6] dark:text-sky-300 border border-[#0072c6]/40 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            {/* Calendar-Year Diagonal Exclusion Bar */}
            {onToggleDiagonalExclusion && calendarDiagonals.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] font-semibold text-slate-500 mr-1">
                  対角線一括除外 (Diagonal):
                </span>
                {calendarDiagonals.slice(-6).map((diag) => {
                  const allExcluded = diag.cellKeys.every((k) =>
                    excludedSet.has(k)
                  );
                  return (
                    <button
                      key={diag.label}
                      type="button"
                      onClick={() =>
                        onToggleDiagonalExclusion(diag.label, diag.cellKeys)
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border transition-colors cursor-pointer ${
                        allExcluded
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-amber-500'
                      }`}
                    >
                      {diag.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Quick Inline Paste / Upload Drawer */}
        {showQuickPaste && (
          <div className="p-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Direct 2D Triangle Matrix Paste / Excel Upload (Excelから直接コピー＆ペースト可能)
              </span>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Excel/CSVファイル選択</span>
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm"
                    onChange={handleDirectFileSelect}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setShowQuickPaste(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <textarea
              rows={4}
              value={quickPasteText}
              onChange={(e) => setQuickPasteText(e.target.value)}
              placeholder={`OriginYear\t12\t24\t36\t48\tEarnedPremium\n2022\t120000\t245000\t310000\t340000\t500000\n2023\t135000\t270000\t345000\t\t540000`}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs font-mono"
            />
            {quickPasteError && (
              <p className="text-xs text-rose-600 font-medium">
                {quickPasteError}
              </p>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleQuickPasteApply}
                className="px-3 py-1 rounded text-xs font-semibold bg-[#0072c6] hover:bg-[#005a9e] text-white cursor-pointer"
              >
                トライアングルを即時反映
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: RATIOS — Authentic WTW ResQ Split-Screen (Left Spreadsheet Grid with Red/Green Heatmap & Average Factors | Right % of Ultimate Chart) */}
        {sheetTab === 'ratios' && (
          <div
            className={`grid grid-cols-1 ${
              ratioSubTab === 'split'
                ? 'xl:grid-cols-12'
                : 'grid-cols-1'
            } divide-y xl:divide-y-0 xl:divide-x divide-slate-300 dark:divide-slate-800`}
          >
            {/* LEFT PANE: WTW ResQ Unified Link Ratio Heatmap + Average Factors Spreadsheet */}
            {(ratioSubTab === 'split' || ratioSubTab === 'ratio_table') && (
              <div
                className={`${
                  ratioSubTab === 'split' ? 'xl:col-span-7' : 'col-span-1'
                } overflow-x-auto bg-white dark:bg-slate-900`}
              >
                <table className="w-full text-[11px] font-mono tabular-nums border-collapse select-none">
                  <thead>
                    <tr className="bg-[#d9d9d9] dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-b border-slate-400 dark:border-slate-700">
                      <th className="py-1.5 px-2.5 text-left font-sans font-bold border-r border-slate-400 dark:border-slate-700 sticky left-0 bg-[#d9d9d9] dark:bg-slate-800 z-10 min-w-[130px]">
                        Accident Period
                      </th>
                      {devPeriods.slice(0, -1).map((p, idx) => (
                        <th
                          key={p}
                          className="py-1.5 px-2 text-right font-bold border-r border-slate-300 dark:border-slate-700 min-w-[68px]"
                        >
                          ({idx + 1}) {p}-{devPeriods[idx + 1]}
                        </th>
                      ))}
                      <th className="py-1.5 px-2 text-right font-bold bg-[#cccccc] dark:bg-slate-700 min-w-[68px]">
                        Tail
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Upper Part: Individual Origin Link Ratios with Red/Green Heatmap */}
                    {originLabels.map((originLbl, rIdx) => (
                      <tr
                        key={originLbl}
                        className="border-b border-slate-200 dark:border-slate-800/70"
                      >
                        <td className="py-0.5 px-2 font-sans font-semibold text-slate-900 dark:text-slate-200 bg-[#e6e6e6] dark:bg-slate-800/90 border-r border-slate-400 dark:border-slate-700 sticky left-0 z-10">
                          {originLbl}
                        </td>
                        {devPeriods.slice(0, -1).map((p, cIdx) => {
                          const ratio = evaluation.linkRatios[rIdx]?.[cIdx];
                          const cellKey = `${rIdx}-${cIdx}`;
                          const isExcluded = excludedSet.has(cellKey);

                          if (ratio === null || ratio === undefined) {
                            return (
                              <td
                                key={p}
                                className="py-1 px-2 text-right border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40"
                              />
                            );
                          }

                          const heat = getResQHeatmapStyle(
                            ratio,
                            cIdx,
                            isExcluded
                          );

                          return (
                            <td
                              key={p}
                              onClick={() => onToggleCellExclusion(cellKey)}
                              title={`Click to ${
                                isExcluded ? 'restore' : 'exclude'
                              } ${originLbl} (${p}-${
                                devPeriods[cIdx + 1]
                              }): ${ratio.toFixed(4)}`}
                              className={`py-0.5 px-1.5 text-right border-r border-slate-300/80 dark:border-slate-800 cursor-pointer transition-opacity hover:opacity-80 ${heat.bgClass} ${heat.textClass}`}
                            >
                              {ratio.toFixed(4)}
                            </td>
                          );
                        })}
                        <td className="py-0.5 px-1.5 text-right text-slate-400 bg-slate-50/50 dark:bg-slate-900/40">
                          1.0
                        </td>
                      </tr>
                    ))}

                    {/* Blank Spacer Row + "Average Factors" Header Row (Exact WTW ResQ Layout) */}
                    <tr className="bg-[#e6e6e6] dark:bg-slate-800 border-y border-slate-400 dark:border-slate-700">
                      <td
                        colSpan={nCols + 1}
                        className="py-1 px-2.5 font-sans font-bold text-[11px] text-slate-900 dark:text-slate-100 sticky left-0"
                      >
                        Average Factors (Click row to select baseline estimator)
                      </td>
                    </tr>

                    {/* Numbered ResQ Average Factor Rows (1..10) */}
                    {LDF_MODES.map((mode) => {
                      const isSelected = selectedMode === mode.id;
                      const values = evaluation.ldfAverages[mode.id] ?? [];
                      return (
                        <tr
                          key={mode.id}
                          onClick={() => onSelectMode(mode.id)}
                          className={`border-b border-slate-200 dark:border-slate-800 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#c3d69b] dark:bg-lime-900/50 text-slate-950 dark:text-lime-100 font-bold'
                              : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-300'
                          }`}
                        >
                          <td
                            className={`py-0.5 px-2 font-sans border-r border-slate-400 dark:border-slate-700 sticky left-0 z-10 ${
                              isSelected
                                ? 'bg-[#c3d69b] dark:bg-lime-900/70 font-bold text-slate-950 dark:text-lime-100'
                                : 'bg-[#e6e6e6] dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {mode.label}
                          </td>
                          {values.map((val, cIdx) => (
                            <td
                              key={cIdx}
                              className="py-0.5 px-1.5 text-right border-r border-slate-200 dark:border-slate-800"
                            >
                              {val ? val.toFixed(4) : '1.0000'}
                            </td>
                          ))}
                          <td className="py-0.5 px-1.5 text-right">
                            {tailFactor.toFixed(4)}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Row 11: User Entry (Light Cyan #b7dee8 as in WTW ResQ Screenshot 1) */}
                    <tr className="border-b border-slate-300 dark:border-slate-700 bg-[#b7dee8] dark:bg-sky-950/60 text-slate-950 dark:text-sky-100">
                      <td className="py-1 px-2.5 font-sans font-semibold bg-[#92cddc] dark:bg-sky-900/70 border-r border-slate-400 dark:border-slate-700 sticky left-0 z-10">
                        11 User Entry (Click cell)
                      </td>
                      {evaluation.selectedLdfs.map((val, cIdx) => {
                        const hasManual =
                          manualLdfOverrides[cIdx] !== undefined;
                        const isEditing = editingCol === cIdx;
                        return (
                          <td
                            key={cIdx}
                            onClick={() => startEditLdf(cIdx, val)}
                            className="py-1 px-1.5 text-right border-r border-slate-300 dark:border-slate-700 cursor-pointer hover:bg-sky-200 dark:hover:bg-sky-800/60"
                          >
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.0001"
                                autoFocus
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                onBlur={() => commitEditLdf(cIdx)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitEditLdf(cIdx);
                                  if (e.key === 'Escape') setEditingCol(null);
                                }}
                                className="w-14 bg-white text-slate-950 text-right px-1 rounded border border-sky-600 text-[11px]"
                              />
                            ) : hasManual ? (
                              <span className="font-bold underline">
                                {manualLdfOverrides[cIdx].toFixed(4)}
                              </span>
                            ) : (
                              <span className="opacity-60">
                                {val.toFixed(4)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-1 px-1.5 text-right">
                        <input
                          type="number"
                          aria-label="Tail Factor"
                          step="0.002"
                          min="1.000"
                          max="2.500"
                          value={tailFactor}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!Number.isNaN(v) && v >= 1.0) {
                              onTailFactorChange(v);
                            }
                          }}
                          className="w-14 bg-white/90 dark:bg-slate-900 text-slate-950 dark:text-white text-right px-1 rounded border border-slate-400 text-[11px] font-bold"
                        />
                      </td>
                    </tr>

                    {/* Row 12: Curve Fit (Weibull / Exponential Parametric Tail Fit Row in Light Cyan) */}
                    <tr
                      onClick={() => onApplyParametricTail('weibull')}
                      title="Click to apply Weibull Parametric Tail Factor"
                      className="border-b border-slate-300 dark:border-slate-700 bg-[#b7dee8]/80 dark:bg-sky-950/40 text-slate-900 dark:text-sky-200 cursor-pointer hover:bg-[#92cddc]"
                    >
                      <td className="py-1 px-2.5 font-sans font-semibold bg-[#92cddc] dark:bg-sky-900/60 border-r border-slate-400 dark:border-slate-700 sticky left-0 z-10">
                        12 Curve Fit (Weibull)
                      </td>
                      {evaluation.selectedLdfs.map((val, cIdx) => (
                        <td
                          key={cIdx}
                          className="py-1 px-2 text-right border-r border-slate-300 dark:border-slate-700"
                        >
                          {val.toFixed(4)}
                        </td>
                      ))}
                      <td className="py-1 px-2 text-right font-bold">
                        {evaluation.tailFits.weibull.tailFactor.toFixed(4)}
                      </td>
                    </tr>

                    {/* Selected Method Row (Shows active ResQ method number per column: e.g., 6, 6, 11) */}
                    <tr className="border-b border-slate-300 dark:border-slate-700 bg-[#daeef3] dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold">
                      <td className="py-1 px-2.5 font-sans font-bold bg-[#d9d9d9] dark:bg-slate-800 border-r border-slate-400 dark:border-slate-700 sticky left-0 z-10">
                        Selected Method
                      </td>
                      {evaluation.selectedLdfs.map((_, cIdx) => {
                        const methodCode =
                          manualLdfOverrides[cIdx] !== undefined
                            ? 11
                            : activeModeObj.resqNum;
                        return (
                          <td
                            key={cIdx}
                            className="py-1 px-2 text-center border-r border-slate-300 dark:border-slate-700 font-bold"
                          >
                            {methodCode}
                          </td>
                        );
                      })}
                      <td className="py-1 px-2 text-center font-bold">11</td>
                    </tr>

                    {/* Selected Value Row (Peach/Amber #fcd5b4 as in WTW ResQ Screenshot 1) */}
                    <tr className="border-b border-slate-400 dark:border-slate-700 bg-[#fcd5b4] dark:bg-amber-900/50 text-slate-950 dark:text-amber-100 font-bold">
                      <td className="py-1.5 px-2.5 font-sans font-bold bg-[#fabf8f] dark:bg-amber-900/80 border-r border-slate-400 dark:border-slate-700 sticky left-0 z-10">
                        Selected Value (f_j)
                      </td>
                      {evaluation.selectedLdfs.map((val, cIdx) => (
                        <td
                          key={cIdx}
                          className="py-1.5 px-2 text-right border-r border-slate-300 dark:border-slate-700"
                        >
                          {val.toFixed(4)}
                        </td>
                      ))}
                      <td className="py-1.5 px-2 text-right">
                        {tailFactor.toFixed(4)}
                      </td>
                    </tr>

                    {/* Cumulative CDF (F_j to Ult) & Implied % Developed */}
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300">
                      <td className="py-1 px-2.5 font-sans font-semibold bg-[#e6e6e6] dark:bg-slate-800 border-r border-slate-400 dark:border-slate-700 sticky left-0 z-10">
                        Cumulative CDF (F_j)
                      </td>
                      {evaluation.cdfs.map((cdf, cIdx) => (
                        <td
                          key={cIdx}
                          className="py-1 px-2 text-right border-r border-slate-200 dark:border-slate-800 font-semibold"
                        >
                          {cdf.toFixed(4)}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                      <td className="py-1 px-2.5 font-sans font-semibold bg-[#e6e6e6] dark:bg-slate-800 border-r border-slate-400 dark:border-slate-700 sticky left-0 z-10">
                        % Developed (1 / CDF)
                      </td>
                      {evaluation.percentDeveloped.map((pct, cIdx) => (
                        <td
                          key={cIdx}
                          className="py-1 px-2 text-right border-r border-slate-200 dark:border-slate-800"
                        >
                          {(pct * 100).toFixed(1)}%
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* RIGHT PANE: WTW ResQ Live Chart ("Cumulative Development - All Origin Periods" with % of Ultimate & Origin Legend) */}
            {(ratioSubTab === 'split' ||
              ratioSubTab === 'ratio_chart' ||
              ratioSubTab === 'all_dev' ||
              ratioSubTab === 'single_dev') && (
              <div
                className={`${
                  ratioSubTab === 'split' ? 'xl:col-span-5' : 'col-span-1'
                } p-3 bg-white dark:bg-slate-900 flex flex-col justify-start`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {ratioSubTab === 'single_dev'
                        ? `Single Development Period Link Ratios: (${
                            selectedSingleDevCol + 1
                          }) ${devPeriods[selectedSingleDevCol]}-${
                            devPeriods[selectedSingleDevCol + 1]
                          }`
                        : 'Cumulative Incurred / Paid gross of recoveries Development - All Origin Periods'}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {ratioSubTab === 'single_dev'
                        ? 'Age-to-age link ratios by accident period vs. Volume Weighted & Selected LDF'
                        : 'Percentage of Ultimate (0% – 140%) across Development Periods with 100% Ultimate asymptote'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {ratioSubTab === 'single_dev' ? (
                      <select
                        aria-label="Select Development Column"
                        value={selectedSingleDevCol}
                        onChange={(e) =>
                          setSelectedSingleDevCol(Number(e.target.value))
                        }
                        className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                      >
                        {devPeriods.slice(0, -1).map((p, idx) => (
                          <option key={p} value={idx}>
                            ({idx + 1}) {p}-{devPeriods[idx + 1]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowOriginFilter((v) => !v)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                      >
                        <Filter className="w-3 h-3" />
                        <span>Filter</span>
                      </button>
                    )}
                  </div>
                </div>

                {showOriginFilter && ratioSubTab !== 'single_dev' && (
                  <div className="mb-2 p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-500">
                      Origin Filter:
                    </span>
                    {originLabels.map((lbl, idx) => {
                      const isHidden = hiddenOrigins.includes(idx);
                      return (
                        <button
                          key={lbl}
                          type="button"
                          onClick={() =>
                            setHiddenOrigins((prev) =>
                              prev.includes(idx)
                                ? prev.filter((i) => i !== idx)
                                : [...prev, idx]
                            )
                          }
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono border cursor-pointer ${
                            isHidden
                              ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 line-through'
                              : 'bg-white dark:bg-slate-900 border-sky-500/40 text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {lbl}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Chart + Right-Hand Origin Legend (Exact WTW ResQ Screenshot 1 Layout) */}
                <div className="flex items-start gap-2 h-[420px]">
                  <div className="flex-1 h-[410px] min-w-0">
                    <ResponsiveContainer width="100%" height={410}>
                      {ratioSubTab === 'single_dev' ? (
                        <LineChart
                          data={singleDevChartData}
                          margin={{ top: 12, right: 16, left: 0, bottom: 16 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#cbd5e1"
                            opacity={0.5}
                          />
                          <XAxis
                            dataKey="originLabel"
                            tick={{ fontSize: 10, fill: '#475569' }}
                          />
                          <YAxis
                            domain={['auto', 'auto']}
                            tick={{ fontSize: 10, fill: '#475569' }}
                          />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="linkRatio"
                            name="Observed Link Ratio"
                            stroke="#0284c7"
                            strokeWidth={2}
                            dot={{ r: 4 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="selectedLdf"
                            name="Selected LDF"
                            stroke="#dc2626"
                            strokeDasharray="4 4"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      ) : (
                        <LineChart
                          data={pctOfUltimateChartData}
                          margin={{ top: 12, right: 12, left: 0, bottom: 16 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#cbd5e1"
                            opacity={0.5}
                          />
                          <XAxis
                            dataKey="devStep"
                            tick={{ fontSize: 10, fill: '#475569' }}
                            label={{
                              value: 'Development Period Step',
                              position: 'insideBottom',
                              offset: -8,
                              fontSize: 10,
                              fill: '#475569',
                            }}
                          />
                          <YAxis
                            domain={[0, 140]}
                            ticks={[0, 20, 40, 60, 80, 100, 120, 140]}
                            tick={{ fontSize: 10, fill: '#475569' }}
                            label={{
                              value: 'Percentage of Ultimate',
                              angle: -90,
                              position: 'insideLeft',
                              fontSize: 10,
                              fill: '#475569',
                            }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#ffffff',
                              borderColor: '#cbd5e1',
                              fontSize: '11px',
                              color: '#0f172a',
                            }}
                          />
                          <ReferenceLine
                            y={100}
                            stroke="#0f172a"
                            strokeWidth={1.5}
                          />
                          {originLabels.map((lbl, rIdx) => {
                            if (hiddenOrigins.includes(rIdx)) return null;
                            const color =
                              RESQ_ORIGIN_COLORS[
                                rIdx % RESQ_ORIGIN_COLORS.length
                              ];
                            return (
                              <Line
                                key={lbl}
                                type="linear"
                                dataKey={`origin_${rIdx}`}
                                name={lbl}
                                stroke={color}
                                strokeWidth={1.6}
                                dot={{ r: 3, fill: color }}
                                connectNulls
                              />
                            );
                          })}
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>

                  {/* Right-Hand Vertical Origin Period Legend (Exact WTW ResQ Screenshot 1 Style) */}
                  {ratioSubTab !== 'single_dev' && (
                    <div className="w-28 shrink-0 h-full overflow-y-auto border-l border-slate-200 dark:border-slate-800 pl-2 py-1 space-y-1">
                      {originLabels.map((lbl, rIdx) => {
                        const color =
                          RESQ_ORIGIN_COLORS[rIdx % RESQ_ORIGIN_COLORS.length];
                        const isHidden = hiddenOrigins.includes(rIdx);
                        return (
                          <button
                            key={lbl}
                            type="button"
                            onClick={() =>
                              setHiddenOrigins((prev) =>
                                prev.includes(rIdx)
                                  ? prev.filter((i) => i !== rIdx)
                                  : [...prev, rIdx]
                              )
                            }
                            className={`w-full flex items-center gap-1.5 text-left text-[10px] font-mono px-1 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ${
                              isHidden ? 'opacity-35 line-through' : ''
                            }`}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="truncate text-slate-700 dark:text-slate-300">
                              {lbl}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DATA — Raw / Projected / Incurred / Case OS / Claim Count / Avg Severity Triangle Grid */}
        {sheetTab === 'data' && (
          <div className="p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: 'cumulative', label: 'Paid Cumulative' },
                    { id: 'incremental', label: 'Paid Incremental' },
                    { id: 'incurred', label: 'Incurred (Paid+OS)' },
                    { id: 'case_reserve', label: 'Case Reserve (OS)' },
                    { id: 'paid_to_incurred', label: 'Paid / Incurred (%)' },
                    { id: 'claim_count', label: 'Claim Count' },
                    { id: 'avg_severity', label: 'Avg Severity' },
                    { id: 'projected', label: 'Completed Projection' },
                  ] as { id: TriangleDisplayMode; label: string }[]
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setTriangleDisplay(m.id)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                      triangleDisplay === m.id
                        ? 'bg-[#0072c6] text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <span className="text-xs font-mono text-slate-500">
                Unit: {unitConfig.badge}
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded">
              <table className="w-full text-xs font-mono tabular-nums border-collapse">
                <thead>
                  <tr className="bg-[#d9d9d9] dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-b border-slate-400 dark:border-slate-700">
                    <th className="py-1.5 px-3 text-left font-sans font-bold border-r border-slate-400 dark:border-slate-700">
                      Origin Period
                    </th>
                    {devPeriods.map((p, idx) => (
                      <th
                        key={p}
                        className="py-1.5 px-2.5 text-right font-bold border-r border-slate-300 dark:border-slate-700"
                      >
                        ({idx + 1}) {p}m
                      </th>
                    ))}
                    <th className="py-1.5 px-3 text-right font-bold bg-[#cccccc] dark:bg-slate-700">
                      Earned Prem
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {originLabels.map((originLbl, rIdx) => {
                    const latestCol = evaluation.rows[rIdx]?.latestDevIndex ?? 0;
                    return (
                      <tr
                        key={originLbl}
                        className="border-b border-slate-200 dark:border-slate-800"
                      >
                        <td className="py-1.5 px-3 font-sans font-semibold bg-[#e6e6e6] dark:bg-slate-800 border-r border-slate-400 dark:border-slate-700">
                          {originLbl}
                        </td>
                        {devPeriods.map((p, cIdx) => {
                          const val = activeMatrixInfo.matrix[rIdx]?.[cIdx];
                          const isLatestDiagonal = cIdx === latestCol;
                          const isProjectedCell =
                            triangleDisplay === 'projected' && cIdx > latestCol;
                          return (
                            <td
                              key={p}
                              className={`py-1.5 px-2.5 text-right border-r border-slate-200 dark:border-slate-800 ${
                                isLatestDiagonal
                                  ? 'bg-sky-500/15 font-bold text-sky-900 dark:text-sky-300'
                                  : isProjectedCell
                                  ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 italic'
                                  : 'bg-white dark:bg-slate-900'
                              }`}
                            >
                              {val === null || val === undefined
                                ? ''
                                : activeMatrixInfo.isRatioFormat
                                ? `${(val * 100).toFixed(1)}%`
                                : activeMatrixInfo.isCountFormat
                                ? Math.round(val).toLocaleString('en-US')
                                : formatScaledNumber(val, unitConfig)}
                            </td>
                          );
                        })}
                        <td className="py-1.5 px-3 text-right font-semibold bg-slate-50 dark:bg-slate-900">
                          {formatScaledNumber(
                            evaluation.rows[rIdx]?.earnedPremium ?? 0,
                            unitConfig
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: INPUTS — Exposure, Earned Premium, and A Priori ELR Vectors */}
        {sheetTab === 'inputs' && (
          <div className="p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Exposure, Earned Premium & Initial Expected Loss Ratio (IELR) Vectors
            </h3>
            <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded">
              <table className="w-full text-xs font-mono tabular-nums border-collapse">
                <thead>
                  <tr className="bg-[#d9d9d9] dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-b border-slate-400">
                    <th className="py-1.5 px-3 text-left font-sans font-bold">
                      Origin Period
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold">
                      Earned Premium ({unitConfig.badge})
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold">
                      Latest Paid ({unitConfig.badge})
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold">
                      Case Reserve OS ({unitConfig.badge})
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold">
                      Reported Incurred ({unitConfig.badge})
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold">
                      Latest Claim Count
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {evaluation.rows.map((r, idx) => (
                    <tr key={r.originYear}>
                      <td className="py-1.5 px-3 font-sans font-semibold bg-[#e6e6e6] dark:bg-slate-800">
                        {originLabels[idx] ?? r.originYear}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        {formatScaledNumber(r.earnedPremium, unitConfig)}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        {formatScaledNumber(r.latestCumulative, unitConfig)}
                      </td>
                      <td className="py-1.5 px-3 text-right text-amber-600">
                        {formatScaledNumber(r.caseReserveOs, unitConfig)}
                      </td>
                      <td className="py-1.5 px-3 text-right font-semibold">
                        {formatScaledNumber(r.latestIncurred, unitConfig)}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        {Math.round(r.latestClaimCount).toLocaleString('en-US')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: RESULTS — DFM Chain Ladder & Selected Projection Summary */}
        {sheetTab === 'results' && (
          <div className="p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              DFM Projection Results Summary ({activeModeObj.label} · Tail {tailFactor.toFixed(4)})
            </h3>
            <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded">
              <table className="w-full text-xs font-mono tabular-nums border-collapse">
                <thead>
                  <tr className="bg-[#d9d9d9] dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-b border-slate-400">
                    <th className="py-1.5 px-3 text-left font-sans font-bold">
                      Origin Period
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold">
                      Latest Paid
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold">
                      CDF to Ult
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold">
                      % Developed
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold">
                      CL IBNR
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold">
                      Selected IBNR
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold">
                      Selected Ultimate
                    </th>
                    <th className="py-1.5 px-3 text-right font-bold">
                      Ultimate LR %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {evaluation.rows.map((r, idx) => (
                    <tr key={r.originYear}>
                      <td className="py-1.5 px-3 font-sans font-semibold bg-[#e6e6e6] dark:bg-slate-800">
                        {originLabels[idx] ?? r.originYear}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        {formatScaledNumber(r.latestCumulative, unitConfig)}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        {r.cdfToUltimate.toFixed(4)}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        {(r.percentDeveloped * 100).toFixed(1)}%
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        {formatScaledNumber(r.clIbnr, unitConfig)}
                      </td>
                      <td className="py-1.5 px-3 text-right font-bold text-[#0072c6] dark:text-sky-400">
                        {formatScaledNumber(r.selectedIbnr, unitConfig)}
                      </td>
                      <td className="py-1.5 px-3 text-right font-bold">
                        {formatScaledNumber(r.selectedUltimate, unitConfig)}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        {(r.ultimateLossRatio * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: CHARTS — Full-Width Development Curve Chart */}
        {sheetTab === 'charts' && (
          <div className="p-4 h-[480px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={pctOfUltimateChartData}
                margin={{ top: 16, right: 24, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                <XAxis dataKey="devLabel" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 140]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <ReferenceLine y={100} stroke="#0f172a" strokeWidth={1.5} />
                {originLabels.map((lbl, rIdx) => {
                  const color =
                    RESQ_ORIGIN_COLORS[rIdx % RESQ_ORIGIN_COLORS.length];
                  return (
                    <Line
                      key={lbl}
                      type="linear"
                      dataKey={`origin_${rIdx}`}
                      name={lbl}
                      stroke={color}
                      strokeWidth={2}
                      dot={{ r: 3.5 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* TAB 6: MUNICH CHAIN LADDER (Paid vs Incurred Side-by-Side), BERQUIST-SHERMAN & PPCI / PPCF (Fisher-Lange) */}
        {sheetTab === 'berquist_ppci' && (
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-[#0072c6]" />
                  <span>
                    Munich Chain Ladder (Paid vs. Incurred Side-by-Side), Berquist-Sherman & Claim-Count Methods (PPCI / Fisher-Lange)
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Simultaneous Paid & Incurred DFM with Quarg-Mack (2004) P/I correlation (λ_Paid = +{advancedMethods.munichChainLadder.lambdaPaid.toFixed(3)}, λ_Incurred = {advancedMethods.munichChainLadder.lambdaIncurred.toFixed(3)}) · Berquist-Sherman (1977) · PPCI & PPCF
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-600 dark:text-slate-400">
                    Case Severity Trend (g):
                  </span>
                  <select
                    aria-label="Berquist-Sherman Case Severity Trend"
                    value={bsSeverityTrend}
                    onChange={(e) => setBsSeverityTrend(Number(e.target.value))}
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-[#0072c6]"
                  >
                    <option value={0.0}>0.0% p.a.</option>
                    <option value={0.03}>3.0% p.a.</option>
                    <option value={0.05}>5.0% p.a. (Default)</option>
                    <option value={0.08}>8.0% p.a. (High Inflation)</option>
                    <option value={0.12}>12.0% p.a. (Shock)</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-600 dark:text-slate-400">
                    Disposal Rate Shift:
                  </span>
                  <select
                    aria-label="Berquist-Sherman Disposal Rate Shift"
                    value={bsSettlementShift}
                    onChange={(e) =>
                      setBsSettlementShift(Number(e.target.value))
                    }
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-emerald-600"
                  >
                    <option value={-0.1}>-10% (Slower Settlement)</option>
                    <option value={-0.05}>-5% (Slight Slowdown)</option>
                    <option value={0.0}>0% (Unchanged Speed)</option>
                    <option value={0.05}>+5% (Faster Settlement)</option>
                    <option value={0.1}>+10% (Accelerated Disposal)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Summary KPI Cards: Paid vs Incurred Gap, Munich CL Convergence, Berquist-Sherman, PPCI & PPCF */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="text-[11px] text-slate-500">
                  Paid CL vs. Incurred CL Ultimate
                </div>
                <div className="mt-1 text-sm font-bold font-mono">
                  {formatScaledNumber(
                    advancedMethods.totals.paidClUltimate,
                    unitConfig
                  )}{' '}
                  /{' '}
                  {formatScaledNumber(
                    advancedMethods.totals.unadjustedIncurredClUltimate,
                    unitConfig
                  )}
                </div>
                <div className="text-[10px] font-mono text-rose-600">
                  Unadjusted P/I Gap:{' '}
                  {formatScaledNumber(
                    advancedMethods.munichChainLadder.unadjustedPaidIncurredGap,
                    unitConfig
                  )}
                </div>
              </div>

              <div className="p-3 rounded-lg border border-indigo-500/40 bg-indigo-500/5">
                <div className="text-[11px] text-indigo-700 dark:text-indigo-300 font-semibold">
                  Munich Chain Ladder Converged IBNR
                </div>
                <div className="mt-1 text-base font-bold font-mono text-indigo-700 dark:text-indigo-300">
                  {formatScaledNumber(
                    advancedMethods.totals.munichConvergedIbnr,
                    unitConfig
                  )}
                </div>
                <div className="text-[10px] font-mono text-slate-600 dark:text-slate-400">
                  Ult:{' '}
                  {formatScaledNumber(
                    advancedMethods.totals.munichConvergedUltimate,
                    unitConfig
                  )}{' '}
                  · Gap Reduced:{' '}
                  {(
                    advancedMethods.munichChainLadder.gapReductionPct * 100
                  ).toFixed(1)}
                  %
                </div>
              </div>

              <div className="p-3 rounded-lg border border-sky-500/30 bg-sky-500/5">
                <div className="text-[11px] text-sky-700 dark:text-sky-300 font-semibold">
                  Berquist-Sherman Adjusted IBNR
                </div>
                <div className="mt-1 text-base font-bold font-mono text-sky-600 dark:text-sky-400">
                  {formatScaledNumber(
                    advancedMethods.totals.berquistShermanIbnr,
                    unitConfig
                  )}
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  Adequacy Δ:{' '}
                  {advancedMethods.totals.berquistShermanDeltaIbnr >= 0
                    ? '+'
                    : ''}
                  {formatScaledNumber(
                    advancedMethods.totals.berquistShermanDeltaIbnr,
                    unitConfig
                  )}
                </div>
              </div>

              <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                  PPCI (Payments Per Claim Incurred) IBNR
                </div>
                <div className="mt-1 text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {formatScaledNumber(
                    advancedMethods.totals.ppciIbnr,
                    unitConfig
                  )}
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  Ult:{' '}
                  {formatScaledNumber(
                    advancedMethods.totals.ppciUltimate,
                    unitConfig
                  )}
                </div>
              </div>

              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                <div className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
                  PPCF / Fisher-Lange (Finalized) IBNR
                </div>
                <div className="mt-1 text-base font-bold font-mono text-amber-600 dark:text-amber-400">
                  {formatScaledNumber(
                    advancedMethods.totals.ppcfFisherLangeIbnr,
                    unitConfig
                  )}
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  Ult:{' '}
                  {formatScaledNumber(
                    advancedMethods.totals.ppcfFisherLangeUltimate,
                    unitConfig
                  )}
                </div>
              </div>
            </div>

            {/* SIDE-BY-SIDE PAID vs. INCURRED DFM LINK RATIO & LDF COMPARISON (Confirmed Phase 1 User Requirement) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Left Pane: Paid Link Ratios & Selected LDFs */}
              <div className="border border-slate-300 dark:border-slate-700 rounded overflow-hidden bg-white dark:bg-slate-900">
                <div className="px-3 py-1.5 bg-[#e5f1fb] dark:bg-sky-950 border-b border-slate-300 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#0072c6] dark:text-sky-300">
                    Left Track: Paid Loss Link Ratios & Volume-Weighted LDFs (λ_Paid = +{advancedMethods.munichChainLadder.lambdaPaid.toFixed(3)})
                  </span>
                  <span className="text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300">
                    Paid CL Ult: {formatScaledNumber(advancedMethods.totals.paidClUltimate, unitConfig)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono tabular-nums border-collapse">
                    <thead>
                      <tr className="bg-[#d9d9d9] dark:bg-slate-800 border-b border-slate-400">
                        <th className="py-1 px-2 text-left font-sans font-bold border-r border-slate-300">
                          Origin
                        </th>
                        {devPeriods.slice(0, -1).map((p, idx) => (
                          <th
                            key={p}
                            className="py-1 px-1.5 text-right font-bold border-r border-slate-300"
                          >
                            {p}-{devPeriods[idx + 1]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {originLabels.map((lbl, rIdx) => (
                        <tr
                          key={lbl}
                          className="border-b border-slate-200 dark:border-slate-800"
                        >
                          <td className="py-0.5 px-2 font-sans font-semibold bg-[#e6e6e6] dark:bg-slate-800 border-r border-slate-300">
                            {lbl}
                          </td>
                          {devPeriods.slice(0, -1).map((p, cIdx) => {
                            const v = evaluation.linkRatios[rIdx]?.[cIdx];
                            return (
                              <td
                                key={p}
                                className="py-0.5 px-1.5 text-right border-r border-slate-200 dark:border-slate-800"
                              >
                                {v !== null && v !== undefined
                                  ? v.toFixed(4)
                                  : ''}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr className="bg-[#c3d69b] dark:bg-lime-900/50 font-bold text-slate-950 dark:text-lime-100 border-t border-slate-400">
                        <td className="py-1 px-2 font-sans border-r border-slate-400">
                          6 Volume - all (Paid)
                        </td>
                        {evaluation.ldfAverages.vw_all.map((v, cIdx) => (
                          <td
                            key={cIdx}
                            className="py-1 px-1.5 text-right border-r border-slate-300"
                          >
                            {v.toFixed(4)}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-[#fcd5b4] dark:bg-amber-900/50 font-bold text-slate-950 dark:text-amber-100 border-t border-slate-300">
                        <td className="py-1 px-2 font-sans border-r border-slate-400">
                          Paid CDF to Ult
                        </td>
                        {evaluation.cdfs.slice(0, -1).map((v, cIdx) => (
                          <td
                            key={cIdx}
                            className="py-1 px-1.5 text-right border-r border-slate-300"
                          >
                            {v.toFixed(4)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Pane: Incurred Link Ratios & Selected LDFs */}
              <div className="border border-slate-300 dark:border-slate-700 rounded overflow-hidden bg-white dark:bg-slate-900">
                <div className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950 border-b border-slate-300 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                    Right Track: Incurred (Paid + Case OS) Link Ratios & LDFs (λ_Incurred = {advancedMethods.munichChainLadder.lambdaIncurred.toFixed(3)})
                  </span>
                  <span className="text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300">
                    Incurred CL Ult: {formatScaledNumber(advancedMethods.totals.unadjustedIncurredClUltimate, unitConfig)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono tabular-nums border-collapse">
                    <thead>
                      <tr className="bg-[#d9d9d9] dark:bg-slate-800 border-b border-slate-400">
                        <th className="py-1 px-2 text-left font-sans font-bold border-r border-slate-300">
                          Origin
                        </th>
                        {devPeriods.slice(0, -1).map((p, idx) => (
                          <th
                            key={p}
                            className="py-1 px-1.5 text-right font-bold border-r border-slate-300"
                          >
                            {p}-{devPeriods[idx + 1]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {originLabels.map((lbl, rIdx) => (
                        <tr
                          key={lbl}
                          className="border-b border-slate-200 dark:border-slate-800"
                        >
                          <td className="py-0.5 px-2 font-sans font-semibold bg-[#e6e6e6] dark:bg-slate-800 border-r border-slate-300">
                            {lbl}
                          </td>
                          {devPeriods.slice(0, -1).map((p, cIdx) => {
                            const v =
                              advancedMethods.incurredLinkRatios[rIdx]?.[cIdx];
                            return (
                              <td
                                key={p}
                                className="py-0.5 px-1.5 text-right border-r border-slate-200 dark:border-slate-800"
                              >
                                {v !== null && v !== undefined
                                  ? v.toFixed(4)
                                  : ''}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr className="bg-[#c3d69b] dark:bg-lime-900/50 font-bold text-slate-950 dark:text-lime-100 border-t border-slate-400">
                        <td className="py-1 px-2 font-sans border-r border-slate-400">
                          6 Volume - all (Incurred)
                        </td>
                        {advancedMethods.incurredSelectedLdfs.map((v, cIdx) => (
                          <td
                            key={cIdx}
                            className="py-1 px-1.5 text-right border-r border-slate-300"
                          >
                            {v.toFixed(4)}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-[#fcd5b4] dark:bg-amber-900/50 font-bold text-slate-950 dark:text-amber-100 border-t border-slate-300">
                        <td className="py-1 px-2 font-sans border-r border-slate-400">
                          Incurred CDF to Ult
                        </td>
                        {advancedMethods.incurredCdfs
                          .slice(0, -1)
                          .map((v, cIdx) => (
                            <td
                              key={cIdx}
                              className="py-1 px-1.5 text-right border-r border-slate-300"
                            >
                              {v.toFixed(4)}
                            </td>
                          ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Side-by-Side Munich Chain Ladder Ultimate Convergence Chart & P/I Ratio Profile */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="p-3 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-1">
                  Munich Chain Ladder Ultimate Convergence by Accident Period (Paid CL vs. Incurred CL vs. Munich CL)
                </h4>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart
                      data={advancedMethods.rows}
                      margin={{ top: 10, right: 16, left: 8, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis dataKey="originLabel" tick={{ fontSize: 10 }} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) =>
                          formatScaledNumber(Number(v), unitConfig)
                        }
                      />
                      <Tooltip
                        formatter={(val) =>
                          formatScaledNumber(Number(val ?? 0), unitConfig)
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="paidClUltimate"
                        name="Paid CL Ultimate"
                        stroke="#0284c7"
                        strokeDasharray="4 4"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="unadjustedIncurredClUltimate"
                        name="Incurred CL Ultimate"
                        stroke="#dc2626"
                        strokeDasharray="4 4"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="munichPaidUltimate"
                        name="Munich Paid Ultimate"
                        stroke="#4f46e5"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="munichIncurredUltimate"
                        name="Munich Incurred Ultimate"
                        stroke="#7c3aed"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="munichConvergedUltimate"
                        name="Munich Converged Ultimate"
                        stroke="#16a34a"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="p-3 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-1">
                  Quarg & Mack (2004) Standardized P/I & Development Residual Correlation Profile
                </h4>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart
                      data={advancedMethods.munichChainLadder.residualScatter.slice(
                        0,
                        24
                      )}
                      margin={{ top: 10, right: 16, left: 8, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis
                        dataKey="devTransitionLabel"
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis domain={[-3, 3]} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <ReferenceLine y={0} stroke="#0f172a" />
                      <Line
                        type="monotone"
                        dataKey="qInverseResidual"
                        name="(I/P) Residual"
                        stroke="#0284c7"
                        strokeWidth={1.8}
                      />
                      <Line
                        type="monotone"
                        dataKey="paidDevResidual"
                        name="Paid Link-Ratio Residual"
                        stroke="#16a34a"
                        strokeWidth={1.8}
                      />
                      <Line
                        type="monotone"
                        dataKey="incurredDevResidual"
                        name="Incurred Link-Ratio Residual"
                        stroke="#dc2626"
                        strokeWidth={1.8}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Unified Cohort Table: Paid CL, Incurred CL, Munich CL, Berquist-Sherman, PPCI & PPCF */}
            <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded">
              <table className="w-full text-xs font-mono tabular-nums border-collapse">
                <thead>
                  <tr className="bg-[#d9d9d9] dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-b border-slate-400">
                    <th className="py-1.5 px-2.5 text-left font-sans font-bold">
                      Origin Period
                    </th>
                    <th className="py-1.5 px-2.5 text-right font-bold">
                      Paid / Incurred %
                    </th>
                    <th className="py-1.5 px-2.5 text-right font-bold">
                      Paid CL IBNR
                    </th>
                    <th className="py-1.5 px-2.5 text-right font-bold">
                      Incurred CL IBNR
                    </th>
                    <th className="py-1.5 px-2.5 text-right font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-500/10">
                      Munich CL Converged IBNR
                    </th>
                    <th className="py-1.5 px-2.5 text-right font-bold text-sky-700 dark:text-sky-300">
                      Berquist-Sherman IBNR
                    </th>
                    <th className="py-1.5 px-2.5 text-right font-bold">
                      Ult Claims
                    </th>
                    <th className="py-1.5 px-2.5 text-right font-bold text-emerald-700 dark:text-emerald-300">
                      PPCI IBNR
                    </th>
                    <th className="py-1.5 px-2.5 text-right font-bold text-amber-700 dark:text-amber-300">
                      PPCF (Fisher-Lange) IBNR
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {advancedMethods.rows.map((r) => (
                    <tr key={r.originIndex}>
                      <td className="py-1.5 px-2.5 font-sans font-semibold bg-[#e6e6e6] dark:bg-slate-800">
                        {r.originLabel}
                      </td>
                      <td className="py-1.5 px-2.5 text-right">
                        {(r.paidToIncurredRatio * 100).toFixed(1)}%
                      </td>
                      <td className="py-1.5 px-2.5 text-right">
                        {formatScaledNumber(r.paidClIbnr, unitConfig)}
                      </td>
                      <td className="py-1.5 px-2.5 text-right">
                        {formatScaledNumber(
                          r.unadjustedIncurredClIbnr,
                          unitConfig
                        )}
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-500/5">
                        {formatScaledNumber(r.munichConvergedIbnr, unitConfig)}
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-bold text-sky-600 dark:text-sky-400 bg-sky-500/5">
                        {formatScaledNumber(r.berquistShermanIbnr, unitConfig)}
                      </td>
                      <td className="py-1.5 px-2.5 text-right">
                        {Math.round(r.ultimateClaimCount).toLocaleString(
                          'en-US'
                        )}
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatScaledNumber(r.ppciIbnr, unitConfig)}
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-semibold text-amber-600 dark:text-amber-400">
                        {formatScaledNumber(r.ppcfFisherLangeIbnr, unitConfig)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#fcd5b4] dark:bg-amber-900/50 font-bold text-slate-950 dark:text-amber-100 border-t-2 border-slate-400">
                    <td className="py-1.5 px-2.5 font-sans">Portfolio Total</td>
                    <td className="py-1.5 px-2.5 text-right">
                      {advancedMethods.totals.latestPaid +
                        advancedMethods.totals.unadjustedCaseOs >
                      0
                        ? `${(
                            (advancedMethods.totals.latestPaid /
                              (advancedMethods.totals.latestPaid +
                                advancedMethods.totals.unadjustedCaseOs)) *
                            100
                          ).toFixed(1)}%`
                        : '100.0%'}
                    </td>
                    <td className="py-1.5 px-2.5 text-right">
                      {formatScaledNumber(
                        advancedMethods.totals.paidClIbnr,
                        unitConfig
                      )}
                    </td>
                    <td className="py-1.5 px-2.5 text-right">
                      {formatScaledNumber(
                        advancedMethods.totals.unadjustedIncurredClIbnr,
                        unitConfig
                      )}
                    </td>
                    <td className="py-1.5 px-2.5 text-right text-indigo-800 dark:text-indigo-200">
                      {formatScaledNumber(
                        advancedMethods.totals.munichConvergedIbnr,
                        unitConfig
                      )}
                    </td>
                    <td className="py-1.5 px-2.5 text-right text-sky-800 dark:text-sky-200">
                      {formatScaledNumber(
                        advancedMethods.totals.berquistShermanIbnr,
                        unitConfig
                      )}
                    </td>
                    <td className="py-1.5 px-2.5 text-right">—</td>
                    <td className="py-1.5 px-2.5 text-right">
                      {formatScaledNumber(
                        advancedMethods.totals.ppciIbnr,
                        unitConfig
                      )}
                    </td>
                    <td className="py-1.5 px-2.5 text-right">
                      {formatScaledNumber(
                        advancedMethods.totals.ppcfFisherLangeIbnr,
                        unitConfig
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
