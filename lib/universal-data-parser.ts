/**
 * AuraReserve — Universal Data Ingestion, Multi-Shape Transformer (Long / Wide Pivot / Claim Ledger),
 * Excel (.xlsx) & Shift-JIS Decoder, and Separate Premium/Exposure Relational Join Engine
 */

import * as XLSX from 'xlsx';
import {
  MultiSegmentFactRecord,
  TimeGranularity,
  DataHealthDiagnostics,
  parseFlexiblePeriodString,
  inspectCsvHeadersAndPreview,
  ingestMappedCsvWithAutoRollup,
  getRecordDimensions,
} from './segment-pyd-engine';

export type FileCharacterEncoding = 'auto' | 'utf-8' | 'shift-jis';

export type LossDataShapeMode = 'long' | 'wide_pivot' | 'claim_ledger';

export type PremiumTableShapeMode = 'long' | 'wide_origin_cols';

/**
 * Decode an ArrayBuffer into string, auto-detecting UTF-8 vs Shift-JIS when encoding === 'auto'
 */
export function decodeFileBuffer(
  buffer: ArrayBuffer,
  encoding: FileCharacterEncoding = 'auto'
): { text: string; detectedEncoding: 'utf-8' | 'shift-jis' } {
  const bytes = new Uint8Array(buffer);

  // Check UTF-8 BOM (EF BB BF)
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    const decoder = new TextDecoder('utf-8');
    return { text: decoder.decode(bytes.subarray(3)), detectedEncoding: 'utf-8' };
  }

  if (encoding === 'shift-jis') {
    const decoder = new TextDecoder('shift-jis');
    return { text: decoder.decode(bytes), detectedEncoding: 'shift-jis' };
  }

  if (encoding === 'utf-8') {
    const decoder = new TextDecoder('utf-8');
    return { text: decoder.decode(bytes), detectedEncoding: 'utf-8' };
  }

  // Auto-detect: try fatal UTF-8 first; if invalid byte sequences exist, decode as Shift-JIS
  try {
    const utf8Fatal = new TextDecoder('utf-8', { fatal: true });
    const text = utf8Fatal.decode(bytes);
    return { text, detectedEncoding: 'utf-8' };
  } catch {
    const sjisDecoder = new TextDecoder('shift-jis');
    return {
      text: sjisDecoder.decode(bytes),
      detectedEncoding: 'shift-jis',
    };
  }
}

/**
 * Automatically score and detect the true header row index (scanning up to Row 30)
 * in corporate Excel sheets or CSV grids that have title blocks, metadata rows, or blank top rows.
 */
export function detectBestHeaderRowIndex(grid: string[][]): number {
  if (!grid || grid.length === 0) return 0;
  const maxScan = Math.min(grid.length, 30);
  const maxCols = Math.max(1, ...grid.slice(0, maxScan).map((r) => r.filter((c) => c.trim() !== '').length));

  let bestRow = 0;
  let bestScore = -999;

  const headerKeywordRegex =
    /origin|accident|incurral|underwriting|policy|year|period|dev|lag|paid|incurred|loss|claim|premium|exposure|segment|line|product|channel|region|事故|発生|契約|年度|年月|進展|経過|支払|損害|備金|件数|保険料|種目|チャネル|地域|区分|\bay\b|\buy\b|\bpy\b|\bfy\b/i;

  for (let r = 0; r < maxScan; r++) {
    const row = grid[r] ?? [];
    const nonEmpty = row.map((c) => c.trim()).filter((c) => c.length > 0);
    if (nonEmpty.length < 2) continue;

    let score = 0;
    // Density of populated columns
    if (nonEmpty.length >= Math.max(2, Math.floor(maxCols * 0.5))) {
      score += nonEmpty.length * 2;
    }

    // Count actuarial / header keywords
    let keywordMatches = 0;
    let wideLagMatches = 0;
    for (const cell of nonEmpty) {
      if (headerKeywordRegex.test(cell)) {
        keywordMatches++;
      }
      if (parseWideDevOrPeriodHeader(cell).isWideValueCol) {
        wideLagMatches++;
      }
    }
    score += keywordMatches * 8;
    if (wideLagMatches >= 2) {
      score += wideLagMatches * 6;
    }

    // Check if the next row (r + 1) looks like a data row (starts with a date/cohort or has numbers)
    const nextRow = grid[r + 1];
    if (nextRow) {
      const nextNonEmpty = nextRow.map((c) => c.trim()).filter(Boolean);
      const hasOriginInNextRow = nextNonEmpty.some((c) => parseFlexiblePeriodString(c) !== null);
      const numCountInNextRow = nextNonEmpty.filter((c) => parseCleanActuarialNumber(c) !== null).length;
      if (hasOriginInNextRow) score += 15;
      if (numCountInNextRow >= 2) score += 10;

      // Penalize if row `r` itself looks like a pure data row (first cell is a date like FY2019 and rest are large numbers > 360)
      const firstCellDate = parseFlexiblePeriodString(row[0] ?? '');
      const largeNumsInRow = nonEmpty
        .slice(1)
        .filter((c) => {
          const n = parseCleanActuarialNumber(c);
          return n !== null && (Math.abs(n) > 360 || c.includes(','));
        }).length;
      if (firstCellDate && largeNumsInRow >= 2 && keywordMatches === 0) {
        score -= 25;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }

  return bestRow;
}

/**
 * Read an Excel (.xlsx / .xls) workbook ArrayBuffer into a map of sheet names -> 2D string grids
 * along with the auto-detected header row index per sheet.
 */
export function readExcelSheetsFromBuffer(buffer: ArrayBuffer): {
  sheetNames: string[];
  sheetsGridMap: Record<string, string[][]>;
  suggestedHeaderRowMap: Record<string, number>;
} {
  const workbook = XLSX.read(buffer, { type: 'array', raw: false, cellDates: true });
  const sheetNames = workbook.SheetNames;
  const sheetsGridMap: Record<string, string[][]> = {};
  const suggestedHeaderRowMap: Record<string, number> = {};

  for (const name of sheetNames) {
    const ws = workbook.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(ws, {
      header: 1,
      defval: '',
      blankrows: false,
      raw: false,
    });
    const grid = aoa.map((row) =>
      row.map((cell) => {
        if (cell === null || cell === undefined) return '';
        if (cell instanceof Date) {
          return cell.toISOString().slice(0, 10);
        }
        return String(cell).trim();
      })
    );
    sheetsGridMap[name] = grid;
    suggestedHeaderRowMap[name] = detectBestHeaderRowIndex(grid);
  }

  return { sheetNames, sheetsGridMap, suggestedHeaderRowMap };
}

/**
 * Parse a single CSV/TSV line respecting RFC-4180 double-quoted fields (e.g. "1,234,567")
 */
export function parseDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse raw CSV or Excel TSV text into a 2D string grid, automatically detecting delimiter (`,` vs `\t` vs `;`)
 * and scanning up to Row 30 for the best header row.
 */
export function parseTextToRawGrid(rawText: string): {
  grid: string[][];
  delimiter: ',' | '\t' | ';';
  suggestedHeaderRowIndex: number;
} {
  const rawLines = rawText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (rawLines.length === 0) {
    return { grid: [], delimiter: ',', suggestedHeaderRowIndex: 0 };
  }

  // Detect delimiter across the first 10 lines
  let tabScore = 0;
  let semiScore = 0;
  let commaScore = 0;
  for (let i = 0; i < Math.min(rawLines.length, 10); i++) {
    tabScore += (rawLines[i].match(/\t/g) ?? []).length;
    semiScore += (rawLines[i].match(/;/g) ?? []).length;
    commaScore += (rawLines[i].match(/,/g) ?? []).length;
  }

  const delimiter: ',' | '\t' | ';' =
    tabScore > commaScore && tabScore >= semiScore
      ? '\t'
      : semiScore > commaScore
      ? ';'
      : ',';

  const grid = rawLines.map((line) => parseDelimitedLine(line, delimiter));
  const suggestedHeaderRowIndex = detectBestHeaderRowIndex(grid);

  return { grid, delimiter, suggestedHeaderRowIndex };
}

/**
 * Clean and parse real-world financial / actuarial number strings:
 * Handles `"1,234,567"`, `¥1,234`, `$5,000`, `(12,345)`, `△12,345`, `▲12,345`, `76.5%`,
 * and returns `null` for `-`, `—`, `―`, `N/A`, `NaN`, `null`, or empty strings.
 */
export function parseCleanActuarialNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }

  let s = raw.trim();
  if (
    !s ||
    s === '-' ||
    s === '—' ||
    s === '―' ||
    s === 'ｰ' ||
    /^n\/?a$/i.test(s) ||
    /^nan$/i.test(s) ||
    /^null$/i.test(s)
  ) {
    return null;
  }

  let isNegative = false;
  if ((s.startsWith('(') && s.endsWith(')')) || s.startsWith('△') || s.startsWith('▲')) {
    isNegative = true;
    s = s.replace(/^[(\s△▲]+|[)\s]+$/g, '');
  }

  const isPercent = s.endsWith('%') || s.endsWith('％');
  // Strip currency symbols, commas, spaces, percent signs
  const cleaned = s.replace(/[¥￥$€£,\s%％"]/g, '');
  if (!cleaned) return null;

  const num = Number(cleaned);
  if (Number.isNaN(num) || !Number.isFinite(num)) return null;

  const signed = isNegative ? -Math.abs(num) : num;
  if (isPercent && Math.abs(signed) > 1.5) {
    return signed / 100;
  }
  return signed;
}

/**
 * Check if a column header represents a development lag or calendar period in a Wide Pivot table
 * e.g. '0', '1', '12', '12m', 'M12', '24ヶ月', 'Dev12', 'Lag_1', '第1期', '1年目', '経過1年', '0-12', '2020-01', '2022Q3', 'FY2021', 'R5'
 */
export function parseWideDevOrPeriodHeader(header: string): {
  isWideValueCol: boolean;
  mode: 'lag' | 'valuation_period';
  lagValue?: number;
  periodRaw?: string;
} {
  const h = header
    .trim()
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  if (!h) return { isWideValueCol: false, mode: 'lag' };

  // 0. Range lag header: "0-12", "12-24", "0〜12ヶ月" -> take upper bound
  const rangeMatch = h.match(/^(\d{1,3})\s*[-~〜～]\s*(\d{1,3})\s*(?:m|mo|months?|ヶ月|カ月|か月)?$/i);
  if (rangeMatch) {
    const upper = Number(rangeMatch[2]);
    if (upper >= 1 && upper <= 360) {
      return { isWideValueCol: true, mode: 'lag', lagValue: upper };
    }
  }

  // 1. Pure lag header: "0", "1", "12", "12m", "M12", "24M", "36ヶ月", "12カ月", "Dev 12", "Lag_24", "第1期", "1期", "進展12"
  const lagMatch = h.match(
    /^(?:dev[\s_:-]*|lag[\s_:-]*|development[\s_:-]*|m|進展|経過|第)?\s*(\d{1,3})\s*(?:m|mo|months?|ヶ月|カ月|か月|期|四半期)?$/i
  );
  if (lagMatch) {
    const val = Number(lagMatch[1]);
    // Avoid treating 4-digit years like 2021 as lag; allow 0..360
    if (val >= 0 && val <= 360) {
      return { isWideValueCol: true, mode: 'lag', lagValue: val };
    }
  }

  // 2. Year-based lag header: "1年", "2年目", "経過1年", "Year 1", "Yr 2", "Y1"
  const yrLagMatch = h.match(/^(?:経過|進展|year|yr|y)?\s*(\d{1,2})\s*(?:yr|year|年|年目)?$/i);
  if (yrLagMatch && /年|yr|year|^y\d/i.test(h)) {
    return {
      isWideValueCol: true,
      mode: 'lag',
      lagValue: Number(yrLagMatch[1]) * 12,
    };
  }

  // 3. Quarter-based lag header: "Q1", "Q2", "1Q", "2Q" (without 4-digit year)
  const qLagMatch = h.match(/^(?:[Qq](\d{1,2})|(\d{1,2})[Qq])$/);
  if (qLagMatch) {
    const qNum = Number(qLagMatch[1] || qLagMatch[2]);
    if (qNum >= 1 && qNum <= 40) {
      return {
        isWideValueCol: true,
        mode: 'lag',
        lagValue: qNum * 3,
      };
    }
  }

  // 4. Check if header is a date/period like '2020-06', '2021Q2', 'FY2020', '2021', '令和5年度', 'R5', 'H30'
  const periodInfo = parseFlexiblePeriodString(h);
  if (
    periodInfo &&
    (/\d{4}/.test(h) || /令和|平成|昭和|^[RrHhSs]\s*(?:元|\d)/i.test(h))
  ) {
    return {
      isWideValueCol: true,
      mode: 'valuation_period',
      periodRaw: h,
    };
  }

  return { isWideValueCol: false, mode: 'lag' };
}

export interface UniversalLossInspectResult {
  headers: string[];
  sampleRows: Record<string, string>[];
  totalDataRows: number;
  detectedShape: LossDataShapeMode;
  originCol: string;
  devMode: 'lag' | 'valuation_period';
  devOrValCol: string;
  wideValueCols: string[];
  metricTypeCol?: string;
  wideTargetMetric?: 'paid' | 'incurred' | 'claim_count';
  paidLossCol: string;
  incurredLossCol?: string;
  caseReserveCol?: string;
  claimCountCol?: string;
  premiumCol?: string;
  exposureCol?: string;
  elrCol?: string;
  lossType: 'cumulative' | 'incremental';
  segmentCols: string[];
  fillInteriorGaps?: boolean;
  unitMultiplier?: number;
}

/**
 * Inspect a 2D string grid (from CSV, TSV, or Excel sheet) starting at `headerRowIndex`
 * and automatically detect its shape (`long` vs `wide_pivot` vs `claim_ledger`) and column mappings!
 */
export function inspectUniversalLossGrid(
  grid: string[][],
  headerRowIndex = 0
): UniversalLossInspectResult {
  if (grid.length <= headerRowIndex) {
    throw new Error('Selected header row index exceeds total rows in data.');
  }

  const rawHeaders = grid[headerRowIndex] ?? [];
  const parentRow = headerRowIndex > 0 ? grid[headerRowIndex - 1] ?? [] : [];
  const dataRows = grid.slice(headerRowIndex + 1).filter((r) => r.some((c) => c.trim() !== ''));

  const maxColLen = Math.max(
    rawHeaders.length,
    ...dataRows.slice(0, 10).map((r) => r.length)
  );

  // Build headers, inheriting from `headerRowIndex - 1` if a merged header cell in Excel left `rawHeaders[i]` blank
  const usedNames = new Set<string>();
  const headers: string[] = [];
  for (let i = 0; i < maxColLen; i++) {
    const primary = (rawHeaders[i] ?? '').trim();
    const parent = (parentRow[i] ?? '').trim();
    let candidate = primary || parent || `Column_${i + 1}`;
    if (usedNames.has(candidate)) {
      candidate = `${candidate}_${i + 1}`;
    }
    usedNames.add(candidate);
    headers.push(candidate);
  }

  const sampleRows: Record<string, string>[] = dataRows.slice(0, 5).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? '';
    });
    return obj;
  });

  // Check how many columns look like Wide Pivot development/period headers
  const wideCols = headers.filter((h) => parseWideDevOrPeriodHeader(h).isWideValueCol);

  const findHeader = (patterns: RegExp[]): string | undefined =>
    headers.find((h) => patterns.some((p) => p.test(h.toLowerCase())));

  // Detect origin column by header keyword OR by checking which column contains dates/cohorts in dataRows
  let originCol = findHeader([
    /origin|accident|incurral|underwriting|policy_year|loss_date|\bay\b|\buy\b|\bpy\b|事故年月|事故年度|事故日|発生年月|発生年度|発生日|契約年度|対象年度|年度/,
  ]);
  if (!originCol && dataRows.length > 0) {
    for (let c = 0; c < Math.min(headers.length, 5); c++) {
      if (wideCols.includes(headers[c])) continue;
      const validDates = dataRows
        .slice(0, 8)
        .filter((r) => parseFlexiblePeriodString(r[c] ?? '') !== null).length;
      if (validDates >= Math.min(2, dataRows.length)) {
        originCol = headers[c];
        break;
      }
    }
  }
  if (!originCol) {
    originCol = headers[0];
  }

  const claimIdCol = findHeader([/claim_id|claim_no|クレーム番号|事故番号|証券番号|明細番号/]);
  const metricTypeCol = findHeader([/metric|item|指標区分|指標|項目区分|データ区分|種別/]);
  const premiumCol = findHeader([/prem|earned|\bep\b|\bgwp\b|\bnwp\b|保険料|既経過|収入保険料/]);
  const exposureCol = findHeader([/exposure|policy_count|契約件数|経過契約|台数|エクスポージャー/]);
  const elrCol = findHeader([/elr|loss_ratio|apriori|損害率|予定損害率/]);

  // Also identify numeric columns in dataRows as fallback candidate wide columns if user switches to wide_pivot manually
  const fallbackNumericCols = headers.filter((h, cIdx) => {
    if (
      h === originCol ||
      h === metricTypeCol ||
      h === premiumCol ||
      h === exposureCol ||
      h === elrCol ||
      h === claimIdCol
    ) {
      return false;
    }
    const sampleCheck = dataRows.slice(0, 8);
    if (sampleCheck.length === 0) return false;
    const numericOrDash = sampleCheck.filter((r) => {
      const cell = (r[cIdx] ?? '').trim();
      return cell === '' || cell === '-' || cell === '—' || parseCleanActuarialNumber(cell) !== null;
    }).length;
    const hasAtLeastOneNum = sampleCheck.some((r) => parseCleanActuarialNumber(r[cIdx]) !== null);
    return hasAtLeastOneNum && numericOrDash >= Math.ceil(sampleCheck.length * 0.7);
  });

  const candidateWideCols = wideCols.length >= 2 ? wideCols : fallbackNumericCols;

  // If 2 or more columns match wide lag/period headers, classify as 'wide_pivot'
  if (wideCols.length >= 2) {
    const firstWide = parseWideDevOrPeriodHeader(wideCols[0]);

    const reserved = new Set<string>([
      originCol,
      ...wideCols,
      ...(metricTypeCol ? [metricTypeCol] : []),
      ...(premiumCol ? [premiumCol] : []),
      ...(exposureCol ? [exposureCol] : []),
      ...(elrCol ? [elrCol] : []),
    ]);
    const segmentCols = headers.filter((h) => !reserved.has(h) && !/^Column_\d+$/.test(h));

    return {
      headers,
      sampleRows,
      totalDataRows: dataRows.length,
      detectedShape: 'wide_pivot',
      originCol,
      devMode: firstWide.mode,
      devOrValCol: wideCols[0],
      wideValueCols: wideCols,
      metricTypeCol,
      wideTargetMetric: 'paid',
      paidLossCol: wideCols[0],
      premiumCol,
      exposureCol,
      elrCol,
      lossType: 'cumulative',
      segmentCols,
      fillInteriorGaps: true,
      unitMultiplier: 1,
    };
  }

  // Otherwise Long or Claim Ledger
  const lagCol = findHeader([/dev|lag|elapsed|進展|経過|月数|年数/]);
  const valPeriodCol = findHeader([
    /valuation|calendar|accounting|eval|payment_date|paid_date|評価年月|支払年月|支払日|計上年月|会計年月|決済年月|集計年月/,
  ]);

  const detectedShape: LossDataShapeMode =
    claimIdCol || (!lagCol && valPeriodCol && /日|date|計上/i.test(valPeriodCol))
      ? 'claim_ledger'
      : 'long';

  const devMode: 'lag' | 'valuation_period' =
    !lagCol && valPeriodCol ? 'valuation_period' : 'lag';
  const devOrValCol =
    (devMode === 'valuation_period' ? valPeriodCol : lagCol) ??
    headers[Math.min(1, headers.length - 1)];

  const incLossCol = findHeader([/incremental|期間損害|当期支払|単月支払|支払額/]);
  const cumLossCol = findHeader([
    /cum|paid|loss|claim|amount|累積|支払損害|損害|支払|ロス|金額/,
  ]);
  const incurredLossCol = findHeader([/incurred|発生損害|発生ロス|既発生/]);
  const caseReserveCol = findHeader([/case|os_reserve|outstanding|個別備金|個別支払備金|支払備金残高/]);
  const claimCountCol = findHeader([/count|claims|件数|クレーム件数|事故件数/]);

  const lossType: 'cumulative' | 'incremental' =
    detectedShape === 'claim_ledger' ||
    (incLossCol && !/cum|累積/.test(incLossCol.toLowerCase()))
      ? 'incremental'
      : 'cumulative';

  const paidLossCol =
    (lossType === 'incremental' ? incLossCol ?? cumLossCol : cumLossCol ?? incLossCol) ??
    headers[Math.min(2, headers.length - 1)];

  const reserved = new Set(
    [
      originCol,
      devOrValCol,
      paidLossCol,
      incurredLossCol,
      caseReserveCol,
      claimCountCol,
      premiumCol,
      exposureCol,
      elrCol,
      valPeriodCol,
      claimIdCol,
    ].filter(Boolean) as string[]
  );

  const segmentCols = headers.filter((h) => !reserved.has(h) && !/^Column_\d+$/.test(h));

  return {
    headers,
    sampleRows,
    totalDataRows: dataRows.length,
    detectedShape,
    originCol,
    devMode,
    devOrValCol,
    wideValueCols: candidateWideCols,
    paidLossCol,
    incurredLossCol,
    caseReserveCol,
    claimCountCol,
    premiumCol,
    exposureCol,
    elrCol,
    lossType,
    segmentCols,
    fillInteriorGaps: true,
    unitMultiplier: 1,
  };
}

/**
 * Convert any Universal Loss Grid (Long, Wide Pivot, or Claim Ledger) into normalized CSV
 * and run multi-granularity roll-up (`annual`, `annual_fy`, `quarterly`, `monthly`)
 */
export function ingestUniversalLossGrid(
  grid: string[][],
  headerRowIndex: number,
  config: UniversalLossInspectResult,
  valuationLabel = 'Custom-Dataset'
): {
  records: MultiSegmentFactRecord[];
  detectedSegmentsCount: number;
  originsCount: number;
  detectedOriginRangeLabel: string;
  availableGranularities: TimeGranularity[];
  diagnostics: DataHealthDiagnostics;
} {
  const rawRow = grid[headerRowIndex] ?? [];
  const parentRow = headerRowIndex > 0 ? grid[headerRowIndex - 1] ?? [] : [];
  const dataRows = grid.slice(headerRowIndex + 1).filter((r) => r.some((c) => c.trim() !== ''));
  const maxColLen = Math.max(rawRow.length, ...dataRows.slice(0, 10).map((r) => r.length));

  const usedNames = new Set<string>();
  const rawHeaders: string[] = [];
  for (let i = 0; i < maxColLen; i++) {
    const primary = (rawRow[i] ?? '').trim();
    const parent = (parentRow[i] ?? '').trim();
    let candidate = primary || parent || `Column_${i + 1}`;
    if (usedNames.has(candidate)) {
      candidate = `${candidate}_${i + 1}`;
    }
    usedNames.add(candidate);
    rawHeaders.push(candidate);
  }

  const idxOf = (col?: string) => (col ? rawHeaders.findIndex((h) => h === col) : -1);

  const iOrigin = idxOf(config.originCol);
  const iPrem = idxOf(config.premiumCol);
  const iExp = idxOf(config.exposureCol);
  const iElr = idxOf(config.elrCol);
  const iMetricType = idxOf(config.metricTypeCol);
  const segCols = config.segmentCols.filter(
    (c) => idxOf(c) !== -1 && c !== config.metricTypeCol
  );

  if (iOrigin === -1) {
    throw new Error('Origin Period column was not found in the selected header row.');
  }

  // Build normalized long CSV rows
  const normHeader = [
    ...segCols,
    '__OriginPeriod',
    '__DevOrVal',
    '__PaidLoss',
    '__IncurredLoss',
    '__CaseReserve',
    '__ClaimCount',
    '__EarnedPremium',
    '__EarnedExposure',
    '__ELR',
  ];
  const normRows: string[] = [normHeader.join(',')];

  if (config.detectedShape === 'wide_pivot') {
    let wideCols =
      config.wideValueCols.length > 0
        ? config.wideValueCols.filter((c) => idxOf(c) !== -1)
        : rawHeaders.filter((h) => parseWideDevOrPeriodHeader(h).isWideValueCol);

    if (wideCols.length === 0) {
      // Fallback: use all columns after iOrigin that are not reserved segment/premium columns
      const reservedSet = new Set([
        config.originCol,
        config.metricTypeCol,
        config.premiumCol,
        config.exposureCol,
        config.elrCol,
        ...segCols,
      ]);
      wideCols = rawHeaders.filter((h, idx) => idx > iOrigin && !reservedSet.has(h));
    }

    if (wideCols.length === 0) {
      throw new Error('No development lag or period columns selected for Wide Pivot mode.');
    }

    const firstWideSpec = parseWideDevOrPeriodHeader(wideCols[0]);
    const effectiveDevMode = firstWideSpec.isWideValueCol ? firstWideSpec.mode : 'lag';

    // Group unpivoted cells by (segVals + originVal + devToken) so multi-metric Wide Pivot rows merge cleanly!
    interface MergedWideCell {
      segVals: string[];
      originVal: string;
      devToken: string;
      paid?: number;
      incurred?: number;
      caseReserve?: number;
      claimCount?: number;
      prem?: number | null;
      exp?: number | null;
      elr?: number | null;
    }

    const mergedMap = new Map<string, MergedWideCell>();

    for (const row of dataRows) {
      const originVal = (row[iOrigin] ?? '').replace(/,/g, '');
      if (!parseFlexiblePeriodString(originVal)) continue;

      const segVals = segCols.map((c) => (row[idxOf(c)] ?? 'All').replace(/,/g, ' '));
      const premVal = iPrem !== -1 ? parseCleanActuarialNumber(row[iPrem]) : null;
      const expVal = iExp !== -1 ? parseCleanActuarialNumber(row[iExp]) : null;
      const elrVal = iElr !== -1 ? parseCleanActuarialNumber(row[iElr]) : null;

      const metricRaw =
        iMetricType !== -1 ? (row[iMetricType] ?? '').toLowerCase() : '';
      const rowRole: 'paid' | 'incurred' | 'case' | 'count' =
        iMetricType !== -1
          ? /incurred|発生/.test(metricRaw)
            ? 'incurred'
            : /case|個別備金|os/.test(metricRaw)
            ? 'case'
            : /count|件数|クレーム数/.test(metricRaw)
            ? 'count'
            : 'paid'
          : config.wideTargetMetric === 'incurred'
          ? 'incurred'
          : config.wideTargetMetric === 'claim_count'
          ? 'count'
          : 'paid';

      for (let wPos = 0; wPos < wideCols.length; wPos++) {
        const wCol = wideCols[wPos];
        const wIdx = idxOf(wCol);
        if (wIdx === -1) continue;
        const numVal = parseCleanActuarialNumber(row[wIdx]);
        if (numVal === null) continue;

        const wSpec = parseWideDevOrPeriodHeader(wCol);
        const digitFallback = Number(wCol.replace(/[^0-9]/g, ''));
        const devToken =
          effectiveDevMode === 'valuation_period'
            ? wSpec.periodRaw ?? wCol
            : String(
                wSpec.lagValue !== undefined
                  ? wSpec.lagValue
                  : wCol.replace(/[^0-9]/g, '') !== '' && !Number.isNaN(digitFallback)
                  ? digitFallback
                  : (wPos + 1) * 12
              );

        const key = `${segVals.join('|')}__${originVal}__${devToken}`;
        const existing = mergedMap.get(key) ?? {
          segVals,
          originVal,
          devToken,
          prem: premVal,
          exp: expVal,
          elr: elrVal,
        };

        if (rowRole === 'incurred') {
          existing.incurred = numVal;
          if (existing.paid === undefined && iMetricType === -1) {
            existing.paid = numVal;
          }
        } else if (rowRole === 'case') {
          existing.caseReserve = numVal;
        } else if (rowRole === 'count') {
          existing.claimCount = numVal;
          if (existing.paid === undefined && iMetricType === -1) {
            existing.paid = numVal;
          }
        } else {
          existing.paid = numVal;
        }

        if (premVal !== null) existing.prem = premVal;
        if (expVal !== null) existing.exp = expVal;
        if (elrVal !== null) existing.elr = elrVal;

        mergedMap.set(key, existing);
      }
    }

    for (const cell of mergedMap.values()) {
      if (
        cell.paid === undefined &&
        cell.incurred === undefined &&
        cell.caseReserve === undefined &&
        cell.claimCount === undefined
      ) {
        continue;
      }

      normRows.push(
        [
          ...cell.segVals,
          cell.originVal,
          cell.devToken,
          cell.paid !== undefined ? String(cell.paid) : '',
          cell.incurred !== undefined ? String(cell.incurred) : '',
          cell.caseReserve !== undefined ? String(cell.caseReserve) : '',
          cell.claimCount !== undefined ? String(cell.claimCount) : '',
          cell.prem !== null && cell.prem !== undefined ? String(cell.prem) : '',
          cell.exp !== null && cell.exp !== undefined ? String(cell.exp) : '',
          cell.elr !== null && cell.elr !== undefined ? String(cell.elr) : '',
        ].join(',')
      );
    }

    return ingestMappedCsvWithAutoRollup(normRows.join('\n'), {
      originCol: '__OriginPeriod',
      devMode: effectiveDevMode,
      devOrValCol: '__DevOrVal',
      lossCol: '__PaidLoss',
      lossType: config.lossType,
      incurredCol: '__IncurredLoss',
      caseReserveCol: '__CaseReserve',
      claimCountCol: '__ClaimCount',
      premiumCol: '__EarnedPremium',
      exposureCol: '__EarnedExposure',
      elrCol: '__ELR',
      segmentCols: segCols,
      valuationLabel,
      fillInteriorGaps: config.fillInteriorGaps ?? true,
      unitMultiplier: config.unitMultiplier ?? 1,
    });
  }

  // Long or Claim Ledger shape
  const iDevOrVal = idxOf(config.devOrValCol);
  const iPaid = idxOf(config.paidLossCol);
  const iInc = idxOf(config.incurredLossCol);
  const iCase = idxOf(config.caseReserveCol);
  const iCount = idxOf(config.claimCountCol);

  if (iDevOrVal === -1 || iPaid === -1) {
    throw new Error('Development/Valuation column and Loss Amount column must be mapped.');
  }

  for (const row of dataRows) {
    const originVal = (row[iOrigin] ?? '').replace(/,/g, '');
    if (!parseFlexiblePeriodString(originVal)) continue;

    const devOrValRaw = (row[iDevOrVal] ?? '').replace(/,/g, '');
    if (!devOrValRaw) continue;

    const paidNum = parseCleanActuarialNumber(row[iPaid]);
    if (paidNum === null) continue;

    const incNum = iInc !== -1 ? parseCleanActuarialNumber(row[iInc]) : null;
    const caseNum = iCase !== -1 ? parseCleanActuarialNumber(row[iCase]) : null;
    const cntNum =
      iCount !== -1
        ? parseCleanActuarialNumber(row[iCount])
        : config.detectedShape === 'claim_ledger'
        ? 1
        : null;
    const premNum = iPrem !== -1 ? parseCleanActuarialNumber(row[iPrem]) : null;
    const expNum = iExp !== -1 ? parseCleanActuarialNumber(row[iExp]) : null;
    const elrNum = iElr !== -1 ? parseCleanActuarialNumber(row[iElr]) : null;

    const segVals = segCols.map((c) => (row[idxOf(c)] ?? 'All').replace(/,/g, ' '));

    normRows.push(
      [
        ...segVals,
        originVal,
        devOrValRaw,
        String(paidNum),
        incNum !== null ? String(incNum) : '',
        caseNum !== null ? String(caseNum) : '',
        cntNum !== null ? String(cntNum) : '',
        premNum !== null ? String(premNum) : '',
        expNum !== null ? String(expNum) : '',
        elrNum !== null ? String(elrNum) : '',
      ].join(',')
    );
  }

  return ingestMappedCsvWithAutoRollup(normRows.join('\n'), {
    originCol: '__OriginPeriod',
    devMode: config.devMode,
    devOrValCol: '__DevOrVal',
    lossCol: '__PaidLoss',
    lossType: config.lossType,
    incurredCol: '__IncurredLoss',
    caseReserveCol: '__CaseReserve',
    claimCountCol: '__ClaimCount',
    premiumCol: '__EarnedPremium',
    exposureCol: '__EarnedExposure',
    elrCol: '__ELR',
    segmentCols: segCols,
    valuationLabel,
    fillInteriorGaps: config.fillInteriorGaps ?? true,
    unitMultiplier: config.unitMultiplier ?? 1,
  });
}

// ============================================================================
// SEPARATE PREMIUM / EXPOSURE DATASET RELATIONAL JOIN ENGINE
// ============================================================================

export interface SeparatePremiumInspectResult {
  headers: string[];
  sampleRows: Record<string, string>[];
  totalDataRows: number;
  detectedShape: PremiumTableShapeMode;
  originCol: string;
  wideOriginCols: string[];
  metricTypeCol?: string;
  premiumCol: string;
  exposureCol?: string;
  elrCol?: string;
  segmentCols: string[];
  unitMultiplier?: number;
}

/**
 * Inspect a separate Premium / Exposure / ELR table (either Long or Wide with Origin Years in columns)
 */
export function inspectSeparatePremiumGrid(
  grid: string[][],
  headerRowIndex = 0
): SeparatePremiumInspectResult {
  if (grid.length <= headerRowIndex) {
    throw new Error('Header row index exceeds total rows in Premium dataset.');
  }

  const headers = grid[headerRowIndex].map((h, i) => h.trim() || `Column_${i + 1}`);
  const dataRows = grid.slice(headerRowIndex + 1).filter((r) => r.some((c) => c.trim() !== ''));

  const sampleRows: Record<string, string>[] = dataRows.slice(0, 5).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? '';
    });
    return obj;
  });

  // Check if multiple columns represent Origin Periods (e.g., 2018, 2019, FY2020, 2021-06, 平成30年度, 令和5年度...)
  const wideOriginCols = headers.filter((h) => {
    const p = parseFlexiblePeriodString(h);
    return (
      p !== null &&
      (/\d{4}/.test(h) || /令和|平成|昭和|[RrHhSs]\s*(?:元|\d)/.test(h))
    );
  });

  const findHeader = (patterns: RegExp[]): string | undefined =>
    headers.find((h) => patterns.some((p) => p.test(h.toLowerCase())));

  const metricTypeCol = findHeader([/metric|type|item|指標|項目|区分/]);

  if (wideOriginCols.length >= 2) {
    const reserved = new Set<string>([
      ...wideOriginCols,
      ...(metricTypeCol ? [metricTypeCol] : []),
    ]);
    const segmentCols = headers.filter((h) => !reserved.has(h));
    return {
      headers,
      sampleRows,
      totalDataRows: dataRows.length,
      detectedShape: 'wide_origin_cols',
      originCol: wideOriginCols[0],
      wideOriginCols,
      metricTypeCol,
      premiumCol: wideOriginCols[0],
      segmentCols,
    };
  }

  const originCol =
    findHeader([/origin|accident|fiscal|year|period|事故|年度|年月|会計/]) ?? headers[0];
  const premiumCol =
    findHeader([/prem|earned|\bep\b|保険料|既経過/]) ??
    headers[Math.min(1, headers.length - 1)];
  const exposureCol = findHeader([/exposure|policy|count|契約件数|経過契約|台数/]);
  const elrCol = findHeader([/elr|loss_ratio|損害率|予定損害率/]);

  const reserved = new Set(
    [originCol, premiumCol, exposureCol, elrCol].filter(Boolean) as string[]
  );
  const segmentCols = headers.filter((h) => !reserved.has(h));

  return {
    headers,
    sampleRows,
    totalDataRows: dataRows.length,
    detectedShape: 'long',
    originCol,
    wideOriginCols: [],
    premiumCol,
    exposureCol,
    elrCol,
    segmentCols,
  };
}

/**
 * Relational Join of a Separate Premium / Exposure Dataset onto an existing MultiSegmentFactRecord[] store!
 * - Supports both Long and Wide (Origin-Columns) Premium tables.
 * - Matches on shared segment dimensions + Origin Period across all granularities (Annual CY, Annual FY Apr-Mar, Quarterly, Monthly).
 * - If the Premium table has coarser segment granularity (e.g. only 2 of the 4 segment columns),
 *   automatically allocates Premium & Exposure across finer sub-segments proportionally to their latest cumulative loss!
 */
export function joinSeparatePremiumExposureDataset(
  existingRecords: MultiSegmentFactRecord[],
  grid: string[][],
  headerRowIndex: number,
  config: SeparatePremiumInspectResult
): {
  updatedRecords: MultiSegmentFactRecord[];
  matchedRecordCount: number;
  sharedSegmentCols: string[];
  summaryText: string;
} {
  const headers = grid[headerRowIndex].map((h, i) => h.trim() || `Column_${i + 1}`);
  const dataRows = grid.slice(headerRowIndex + 1).filter((r) => r.some((c) => c.trim() !== ''));
  const idxOf = (col?: string) => (col ? headers.findIndex((h) => h === col) : -1);

  interface RawPremEntry {
    dims: Record<string, string>;
    originRaw: string;
    premium?: number;
    exposure?: number;
    elr?: number;
  }

  const rawEntries: RawPremEntry[] = [];

  if (config.detectedShape === 'wide_origin_cols') {
    const iMetric = idxOf(config.metricTypeCol);
    const segCols = config.segmentCols.filter((c) => idxOf(c) !== -1);

    for (const row of dataRows) {
      const dims: Record<string, string> = {};
      segCols.forEach((c) => {
        dims[c] = (row[idxOf(c)] ?? '').trim();
      });
      const metricLabel = iMetric !== -1 ? (row[iMetric] ?? '').toLowerCase() : 'premium';
      const isExpRow = /exposure|count|件数|台数/.test(metricLabel);
      const isElrRow = /elr|ratio|損害率/.test(metricLabel);

      for (const wCol of config.wideOriginCols) {
        const wIdx = idxOf(wCol);
        if (wIdx === -1) continue;
        const val = parseCleanActuarialNumber(row[wIdx]);
        if (val === null) continue;

        rawEntries.push({
          dims,
          originRaw: wCol,
          premium: !isExpRow && !isElrRow ? val : undefined,
          exposure: isExpRow ? val : undefined,
          elr: isElrRow ? val : undefined,
        });
      }
    }
  } else {
    const iOrigin = idxOf(config.originCol);
    const iPrem = idxOf(config.premiumCol);
    const iExp = idxOf(config.exposureCol);
    const iElr = idxOf(config.elrCol);
    const segCols = config.segmentCols.filter((c) => idxOf(c) !== -1);

    for (const row of dataRows) {
      const originRaw = (row[iOrigin] ?? '').trim();
      if (!originRaw) continue;
      const dims: Record<string, string> = {};
      segCols.forEach((c) => {
        dims[c] = (row[idxOf(c)] ?? '').trim();
      });

      const prem = iPrem !== -1 ? parseCleanActuarialNumber(row[iPrem]) : null;
      const exp = iExp !== -1 ? parseCleanActuarialNumber(row[iExp]) : null;
      const elr = iElr !== -1 ? parseCleanActuarialNumber(row[iElr]) : null;

      if (prem === null && exp === null && elr === null) continue;

      rawEntries.push({
        dims,
        originRaw,
        premium: prem ?? undefined,
        exposure: exp ?? undefined,
        elr: elr ?? undefined,
      });
    }
  }

  if (rawEntries.length === 0) {
    throw new Error('No valid numeric Premium/Exposure rows found in the separate dataset.');
  }

  // Find shared segment dimension keys between existingRecords and the separate Premium table
  const existingDimKeys =
    existingRecords.length > 0
      ? Object.keys(getRecordDimensions(existingRecords[0]))
      : [];
  const premDimKeys = Object.keys(rawEntries[0].dims);
  const sharedSegmentCols = existingDimKeys.filter((k) => premDimKeys.includes(k));

  const makeSharedKey = (dims: Record<string, string>) =>
    sharedSegmentCols.map((k) => `${k}=${dims[k] ?? ''}`).join('|');

  // Helper to bucket a raw entry's origin period into (granularity, originCode)
  const bucketOriginCode = (
    originRaw: string,
    gran: TimeGranularity
  ): number | null => {
    const info = parseFlexiblePeriodString(originRaw);
    if (!info) return null;
    if (gran === 'monthly') return info.year * 100 + info.month;
    if (gran === 'quarterly') return info.year * 10 + info.quarter;
    if (gran === 'annual_fy') return info.fiscalYearApr;
    return info.year;
  };

  // Pre-compute latest cumulative loss per record for proportional allocation when Premium segments are coarser
  const latestLossOf = (rec: MultiSegmentFactRecord): number => {
    const nonNull = rec.cumulativeRow.filter((v): v is number => v !== null);
    return nonNull.length > 0 ? Math.max(1, nonNull[nonNull.length - 1]) : 1;
  };

  let matchedRecordCount = 0;
  const updatedRecords = existingRecords.map((rec) => ({ ...rec }));

  // Group updatedRecords by (valuationMonth, granularity, originCode, sharedSegKey)
  const recGroupMap = new Map<string, MultiSegmentFactRecord[]>();
  for (const rec of updatedRecords) {
    const dims = getRecordDimensions(rec);
    const sKey = makeSharedKey(dims);
    const groupKey = `${rec.valuationMonth}|${rec.granularity}|${rec.originCode}|${sKey}`;
    const arr = recGroupMap.get(groupKey) ?? [];
    arr.push(rec);
    recGroupMap.set(groupKey, arr);
  }

  for (const group of recGroupMap.values()) {
    const sampleRec = group[0];
    const sKey = makeSharedKey(getRecordDimensions(sampleRec));

    // Find all rawEntries matching sKey and sampleRec.originCode at sampleRec.granularity
    let matchingEntries = rawEntries.filter((e) => {
      if (makeSharedKey(e.dims) !== sKey) return false;
      const code = bucketOriginCode(e.originRaw, sampleRec.granularity);
      return code === sampleRec.originCode;
    });

    // If Premium table is annual (e.g. FY2021) and rec is quarterly/monthly, match by year and divide by 4 or 12
    let periodScale = 1.0;
    if (
      matchingEntries.length === 0 &&
      (sampleRec.granularity === 'quarterly' || sampleRec.granularity === 'monthly')
    ) {
      const targetYear =
        sampleRec.granularity === 'quarterly'
          ? Math.floor(sampleRec.originCode / 10)
          : Math.floor(sampleRec.originCode / 100);
      matchingEntries = rawEntries.filter((e) => {
        if (makeSharedKey(e.dims) !== sKey) return false;
        const info = parseFlexiblePeriodString(e.originRaw);
        return info !== null && (info.year === targetYear || info.fiscalYearApr === targetYear);
      });
      if (matchingEntries.length > 0) {
        periodScale = sampleRec.granularity === 'quarterly' ? 0.25 : 1 / 12;
      }
    }

    if (matchingEntries.length === 0) continue;

    const sumPrem =
      matchingEntries.reduce((acc, e) => acc + (e.premium ?? 0), 0) *
      periodScale *
      (config.unitMultiplier && config.unitMultiplier > 0
        ? config.unitMultiplier
        : 1);
    const sumExp =
      matchingEntries.reduce((acc, e) => acc + (e.exposure ?? 0), 0) *
      periodScale;
    const elrEntries = matchingEntries.filter((e) => e.elr !== undefined);
    const avgElr =
      elrEntries.length > 0
        ? elrEntries.reduce((acc, e) => acc + (e.elr ?? 0), 0) / elrEntries.length
        : null;

    // Allocate across sub-segments in `group` proportionally to their latest cumulative loss
    const totalGroupLoss = group.reduce((acc, r) => acc + latestLossOf(r), 0);

    for (const rec of group) {
      const weight =
        group.length === 1 ? 1.0 : latestLossOf(rec) / Math.max(1, totalGroupLoss);
      if (sumPrem > 0) {
        rec.earnedPremium = Math.round(sumPrem * weight);
      }
      if (sumExp > 0) {
        rec.earnedExposure = Math.round(sumExp * weight);
      }
      if (avgElr !== null && avgElr > 0) {
        rec.aprioriElr = Number(avgElr.toFixed(4));
      }
      matchedRecordCount++;
    }
  }

  return {
    updatedRecords,
    matchedRecordCount,
    sharedSegmentCols,
    summaryText: `Joined Separate Premium/Exposure Table across [${
      sharedSegmentCols.join(' × ') || 'Portfolio Total'
    }] (${matchedRecordCount} segment-period slices updated with proportional sub-segment allocation).`,
  };
}

// ============================================================================
// ONE-CLICK MULTI-SHAPE & SEPARATE PREMIUM SAMPLE GENERATORS
// ============================================================================

/**
 * Sample 1:
 * - Loss Table: Wide Pivot Format (進展月数 12m..72m が列方向に並び、カンマ付き数値・ハイフンを含み、保険料列が無い表)
 * - Separate Premium/Exposure Table: 別ファイル横持ち形式 (保険種目×販売チャネル別に FY2018..FY2023 が列方向に並ぶ表)
 */
export function generateWidePivotLossAndSeparatePremiumSample(): {
  lossWideCsv: string;
  separatePremiumWideCsv: string;
} {
  const lossWideRows: string[] = [
    '保険種目,販売チャネル,地域ブロック,事故年度,12m,24m,36m,48m,60m,72m',
    '自動車保険(対人・対物),専業代理店,首都圏,FY2018,"312,400","548,900","682,100","754,300","798,200","821,500"',
    '自動車保険(対人・対物),専業代理店,首都圏,FY2019,"328,100","572,400","710,800","789,500","836,900",-',
    '自動車保険(対人・対物),専業代理店,首都圏,FY2020,"341,500","598,200","745,600","828,400",-,-',
    '自動車保険(対人・対物),専業代理店,首都圏,FY2021,"359,800","629,400","788,900",-,-,-',
    '自動車保険(対人・対物),専業代理店,首都圏,FY2022,"378,200","668,500",-,-,-,-',
    '自動車保険(対人・対物),専業代理店,首都圏,FY2023,"396,400",-,-,-,-,-',
    '自動車保険(対人・対物),専業代理店,近畿圏,FY2018,"214,500","376,200","468,900","518,400","549,100","564,800"',
    '自動車保険(対人・対物),専業代理店,近畿圏,FY2019,"221,800","389,400","485,200","538,100","570,200",-',
    '自動車保険(対人・対物),専業代理店,近畿圏,FY2020,"232,600","408,100","509,400","564,800",-,-',
    '自動車保険(対人・対物),専業代理店,近畿圏,FY2021,"244,100","428,900","536,200",-,-,-',
    '自動車保険(対人・対物),専業代理店,近畿圏,FY2022,"256,400","451,200",-,-,-,-',
    '自動車保険(対人・対物),専業代理店,近畿圏,FY2023,"268,900",-,-,-,-,-',
    '火災・新種賠償保険,企業ブローカー,首都圏,FY2018,"198,000","412,500","618,400","764,200","852,100","904,500"',
    '火災・新種賠償保険,企業ブローカー,首都圏,FY2019,"212,400","441,800","662,900","819,400","918,600",-',
    '火災・新種賠償保険,企業ブローカー,首都圏,FY2020,"226,800","472,100","708,500","884,200",-,-',
    '火災・新種賠償保険,企業ブローカー,首都圏,FY2021,"242,500","506,400","768,900",-,-,-',
    '火災・新種賠償保険,企業ブローカー,首都圏,FY2022,"258,900","548,200",-,-,-,-',
    '火災・新種賠償保険,企業ブローカー,首都圏,FY2023,"276,400",-,-,-,-,-',
  ];

  // Separate Premium & Exposure table (Note: Coarser segment level — 保険種目 × 販売チャネル without 地域ブロック, and Wide FY columns!)
  const separatePremiumWideRows: string[] = [
    '保険種目,販売チャネル,指標区分,FY2018,FY2019,FY2020,FY2021,FY2022,FY2023',
    '自動車保険(対人・対物),専業代理店,既経過保険料,"1,820,000","1,890,000","1,960,000","2,050,000","2,140,000","2,230,000"',
    '自動車保険(対人・対物),専業代理店,経過契約件数,"22,400","23,100","23,900","24,800","25,600","26,500"',
    '火災・新種賠償保険,企業ブローカー,既経過保険料,"1,180,000","1,240,000","1,310,000","1,390,000","1,460,000","1,540,000"',
    '火災・新種賠償保険,企業ブローカー,経過契約件数,"4,100","4,300","4,550","4,800","5,050","5,300"',
  ];

  return {
    lossWideCsv: lossWideRows.join('\n'),
    separatePremiumWideCsv: separatePremiumWideRows.join('\n'),
  };
}

/**
 * Sample 2 (Edge-Case Readiness Verification):
 * - Uses Japanese Wareki dates ('平成30年度', '令和元年度', '令和2年度', '令和3年度', '令和4年度', '令和5年度')
 * - Wide Pivot table with `指標区分` column ('累積支払損害額', '累積発生損害額', 'クレーム件数')
 * - Includes genuine negative development (case reserve takedown where Incurred drops from 48m to 60m, LDF < 1.0)
 * - Includes an interior blank cell ('-') at 36m that gets carried forward automatically
 * - Includes a newly launched product ('サイバー情報漏洩保険') starting in '令和3年度' (asymmetric triangle)
 * - Separate Premium table in Thousand Yen (千円単位, unitMultiplier = 1000)
 */
export function generateWarekiMultiMetricAndEdgeCaseSample(): {
  warekiWideLossCsv: string;
  thousandYenSeparatePremCsv: string;
} {
  const warekiWideLossRows: string[] = [
    '保険種目,販売チャネル,指標区分,事故年度,12ヶ月,24ヶ月,36ヶ月,48ヶ月,60ヶ月,72ヶ月',
    // Segment 1: 企業賠償責任保険 × 企業ブローカー (Paid, Incurred with reserve takedown LDF<1.0, and Claim Count, plus 1 interior gap at 令和元年度 36ヶ月)
    '企業賠償責任保険,企業ブローカー,累積支払損害額,平成30年度,"210,000","395,000","510,000","580,000","615,000","632,000"',
    '企業賠償責任保険,企業ブローカー,累積支払損害額,令和元年度,"225,000","418,000",-,"612,000","648,000",-',
    '企業賠償責任保険,企業ブローカー,累積支払損害額,令和2年度,"238,000","442,000","568,000","645,000",-,-',
    '企業賠償責任保険,企業ブローカー,累積支払損害額,令和3年度,"252,000","468,000","602,000",-,-,-',
    '企業賠償責任保険,企業ブローカー,累積支払損害額,令和4年度,"268,000","498,000",-,-,-,-',
    '企業賠償責任保険,企業ブローカー,累積支払損害額,令和5年度,"285,000",-,-,-,-,-',
    // Incurred Loss rows (Notice 48m -> 60m has case reserve takedown: 660,000 -> 642,000 so LDF < 1.0!)
    '企業賠償責任保険,企業ブローカー,累積発生損害額,平成30年度,"340,000","520,000","615,000","660,000","642,000","638,000"',
    '企業賠償責任保険,企業ブローカー,累積発生損害額,令和元年度,"362,000","548,000","645,000","692,000","674,000",-',
    '企業賠償責任保険,企業ブローカー,累積発生損害額,令和2年度,"385,000","582,000","685,000","732,000",-,-',
    '企業賠償責任保険,企業ブローカー,累積発生損害額,令和3年度,"408,000","618,000","728,000",-,-,-',
    '企業賠償責任保険,企業ブローカー,累積発生損害額,令和4年度,"432,000","655,000",-,-,-,-',
    '企業賠償責任保険,企業ブローカー,累積発生損害額,令和5年度,"458,000",-,-,-,-,-',
    // Claim Count rows
    '企業賠償責任保険,企業ブローカー,クレーム件数,平成30年度,42,74,92,102,106,108',
    '企業賠償責任保険,企業ブローカー,クレーム件数,令和元年度,45,78,96,107,111,-',
    '企業賠償責任保険,企業ブローカー,クレーム件数,令和2年度,48,83,103,114,-,-',
    '企業賠償責任保険,企業ブローカー,クレーム件数,令和3年度,51,88,109,-,-,-',
    '企業賠償責任保険,企業ブローカー,クレーム件数,令和4年度,54,94,-,-,-,-',
    '企業賠償責任保険,企業ブローカー,クレーム件数,令和5年度,58,-,-,-,-,-',
    // Segment 2: Newly launched product in 令和3年度 (Asymmetric Triangle — only 令和3年度..令和5年度 exist!)
    'サイバー情報漏洩保険,ダイレクト法人,累積支払損害額,令和3年度,"125,000","248,000","335,000",-,-,-',
    'サイバー情報漏洩保険,ダイレクト法人,累積支払損害額,令和4年度,"158,000","312,000",-,-,-,-',
    'サイバー情報漏洩保険,ダイレクト法人,累積支払損害額,令和5年度,"195,000",-,-,-,-,-',
    'サイバー情報漏洩保険,ダイレクト法人,累積発生損害額,令和3年度,"195,000","310,000","362,000",-,-,-',
    'サイバー情報漏洩保険,ダイレクト法人,累積発生損害額,令和4年度,"245,000","388,000",-,-,-,-',
    'サイバー情報漏洩保険,ダイレクト法人,累積発生損害額,令和5年度,"302,000",-,-,-,-,-',
    'サイバー情報漏洩保険,ダイレクト法人,クレーム件数,令和3年度,18,34,44,-,-,-',
    'サイバー情報漏洩保険,ダイレクト法人,クレーム件数,令和4年度,23,42,-,-,-,-',
    'サイバー情報漏洩保険,ダイレクト法人,クレーム件数,令和5年度,29,-,-,-,-,-',
  ];

  // Separate Premium Table in Thousand Yen (千円単位 -> requires ×1,000 multiplier to match Loss table!)
  const thousandYenSeparatePremRows: string[] = [
    '保険種目,販売チャネル,指標区分,平成30年度,令和元年度,令和2年度,令和3年度,令和4年度,令和5年度',
    '企業賠償責任保険,企業ブローカー,既経過保険料,820,860,910,960,"1,020","1,080"',
    '企業賠償責任保険,企業ブローカー,経過契約件数,"1,450","1,520","1,600","1,680","1,750","1,840"',
    'サイバー情報漏洩保険,ダイレクト法人,既経過保険料,-,-,-,480,620,780',
    'サイバー情報漏洩保険,ダイレクト法人,経過契約件数,-,-,-,620,810,"1,050"',
  ];

  return {
    warekiWideLossCsv: warekiWideLossRows.join('\n'),
    thousandYenSeparatePremCsv: thousandYenSeparatePremRows.join('\n'),
  };
}

/**
 * Direct 2D Triangle Matrix Extractor (WTW ResQ Single-Triangle Mode):
 * Extracts a clean 2D Run-Off Triangle directly from any Excel sheet or CSV/TSV grid
 * (even when there are title rows above, empty top-left header cells, or no Premium/Segment columns).
 */
export function extractDirectTriangleFromGrid(
  grid: string[][],
  explicitHeaderRowIndex?: number,
  unitMultiplier = 1
): {
  originLabels: string[];
  devPeriods: number[];
  triangle: (number | null)[][];
  earnedPremium: number[];
  exposureCount: number[];
  aprioriElr: number;
  headerRowIndex: number;
} {
  if (!grid || grid.length === 0) {
    throw new Error('Grid is empty.');
  }

  const headerRowIndex =
    explicitHeaderRowIndex !== undefined
      ? explicitHeaderRowIndex
      : detectBestHeaderRowIndex(grid);

  const headerRow = grid[headerRowIndex] ?? [];
  const dataRows = grid
    .slice(headerRowIndex + 1)
    .filter((r) => r.some((c) => (c ?? '').trim() !== ''));

  if (dataRows.length < 2) {
    throw new Error('Triangle grid must contain at least 2 origin rows.');
  }

  // Find which column holds the Origin labels (usually col 0, or col 1 if col 0 is blank margin)
  let originColIdx = 0;
  for (let c = 0; c < Math.min(4, headerRow.length); c++) {
    const validDates = dataRows
      .slice(0, 10)
      .filter((r) => parseFlexiblePeriodString(r[c] ?? '') !== null).length;
    if (validDates >= Math.min(2, dataRows.length)) {
      originColIdx = c;
      break;
    }
  }

  // Check if any column after originColIdx is Earned Premium, Exposure, or ELR
  let premColIdx = -1;
  let expColIdx = -1;
  let elrColIdx = -1;
  const devColIndices: number[] = [];
  const devPeriods: number[] = [];

  for (let c = originColIdx + 1; c < headerRow.length; c++) {
    const h = (headerRow[c] ?? '').trim();
    const hLow = h.toLowerCase();
    if (/prem|earned|\bep\b|\bgwp\b|保険料|既経過/.test(hLow)) {
      premColIdx = c;
      continue;
    }
    if (/exposure|policy|count|契約件数|経過契約|台数/.test(hLow)) {
      expColIdx = c;
      continue;
    }
    if (/elr|loss_ratio|apriori|損害率|予定損害率/.test(hLow)) {
      elrColIdx = c;
      continue;
    }
    // Check if column has at least one numeric cell in dataRows
    const hasNumeric = dataRows.some((r) => parseCleanActuarialNumber(r[c]) !== null);
    if (!hasNumeric) continue;

    devColIndices.push(c);
    const spec = parseWideDevOrPeriodHeader(h);
    if (spec.lagValue !== undefined && spec.lagValue > 0) {
      devPeriods.push(spec.lagValue);
    } else {
      const numMatch = h.match(/\d+/);
      const parsed = numMatch ? Number(numMatch[0]) : NaN;
      devPeriods.push(
        !Number.isNaN(parsed) && parsed > 0 && parsed <= 360
          ? parsed
          : devColIndices.length * 12
      );
    }
  }

  if (devColIndices.length < 2) {
    throw new Error('Could not detect at least 2 numeric development columns in the selected grid.');
  }

  const mult = unitMultiplier > 0 ? unitMultiplier : 1;
  const originLabels: string[] = [];
  const triangle: (number | null)[][] = [];
  const earnedPremium: number[] = [];
  const exposureCount: number[] = [];
  const elrList: number[] = [];

  for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
    const row = dataRows[rIdx];
    const rawOrigin = (row[originColIdx] ?? '').trim();
    // Skip summary/total rows at the bottom of Excel tables
    if (/^(total|sum|all|合計|総計|計|平均|average|vw|ldf)$/i.test(rawOrigin)) {
      continue;
    }

    const rowVals = devColIndices.map((cIdx) => {
      const v = parseCleanActuarialNumber(row[cIdx]);
      return v !== null ? v * mult : null;
    });

    if (rowVals.every((v) => v === null)) continue;

    const pInfo = parseFlexiblePeriodString(rawOrigin);
    originLabels.push(rawOrigin || pInfo?.rawLabel || `AY-${rIdx + 1}`);
    triangle.push(rowVals);

    const nonNulls = rowVals.filter((v): v is number => v !== null);
    const latestLoss = nonNulls.length > 0 ? Math.abs(nonNulls[nonNulls.length - 1]) : 1000;
    const maturity = Math.max(0.35, nonNulls.length / Math.max(1, devColIndices.length));

    const premRaw = premColIdx !== -1 ? parseCleanActuarialNumber(row[premColIdx]) : null;
    const premVal =
      premRaw !== null && premRaw > 0
        ? premRaw * mult
        : Math.max(100, Math.round((latestLoss / maturity) * 1.4));
    earnedPremium.push(premVal);

    const expRaw = expColIdx !== -1 ? parseCleanActuarialNumber(row[expColIdx]) : null;
    const expVal =
      expRaw !== null && expRaw > 0
        ? expRaw
        : Math.max(10, Math.round(premVal / Math.max(1, 80 * mult)));
    exposureCount.push(expVal);

    const elrRaw = elrColIdx !== -1 ? parseCleanActuarialNumber(row[elrColIdx]) : null;
    if (elrRaw !== null && elrRaw > 0) {
      elrList.push(elrRaw > 2 ? elrRaw / 100 : elrRaw);
    }
  }

  if (triangle.length < 2) {
    throw new Error('At least 2 valid origin rows with numeric cells are required.');
  }

  const aprioriElr =
    elrList.length > 0
      ? Number((elrList.reduce((a, b) => a + b, 0) / elrList.length).toFixed(4))
      : 0.72;

  return {
    originLabels,
    devPeriods,
    triangle,
    earnedPremium,
    exposureCount,
    aprioriElr,
    headerRowIndex,
  };
}


