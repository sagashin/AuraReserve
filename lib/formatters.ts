export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actionType:
    | 'CELL_EXCLUSION'
    | 'LDF_MODE_CHANGE'
    | 'MANUAL_LDF_OVERRIDE'
    | 'TAIL_FACTOR_CHANGE'
    | 'METHOD_SELECTION'
    | 'ELR_EDIT'
    | 'AUTO_OPTIMIZE'
    | 'DATASET_LOAD'
    | 'BOOTSTRAP_RUN'
    | string;
  title: string;
  detail: string;
  previousIbnr: number;
  newIbnr: number;
  deltaIbnr: number;
}

export type DisplayUnitId = 'usd' | 'jpy_1' | 'jpy_1k' | 'jpy_1m' | 'jpy_100m';

export interface DisplayUnitSpec {
  id: DisplayUnitId;
  label: string;
  shortLabel: string;
  symbol: string;
  divisor: number;
}

export const DISPLAY_UNIT_OPTIONS: DisplayUnitSpec[] = [
  {
    id: 'usd',
    label: '$ (USD)',
    shortLabel: '$ USD',
    symbol: '$',
    divisor: 1,
  },
  {
    id: 'jpy_1',
    label: '¥ (円)',
    shortLabel: '¥ (円)',
    symbol: '¥',
    divisor: 1,
  },
  {
    id: 'jpy_1k',
    label: '¥ (千円)',
    shortLabel: '¥ (千円)',
    symbol: '¥(千)',
    divisor: 1000,
  },
  {
    id: 'jpy_1m',
    label: '¥ (百万円)',
    shortLabel: '¥ (百万円)',
    symbol: '¥(百万)',
    divisor: 1000000,
  },
  {
    id: 'jpy_100m',
    label: '¥ (億円)',
    shortLabel: '¥ (億円)',
    symbol: '¥(億)',
    divisor: 100000000,
  },
];

export function formatNumber(val: number | null | undefined, decimals = 0): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCurrency(
  val: number | null | undefined,
  symbol = '$',
  decimals = 0
): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  const absFormatted = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return val < 0 ? `-${symbol}${absFormatted}` : `${symbol}${absFormatted}`;
}

export function formatLdf(val: number | null | undefined, decimals = 4): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return val.toFixed(decimals);
}

export function formatPercent(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return `${(val * 100).toFixed(decimals)}%`;
}

export function formatSignedDelta(
  delta: number,
  symbol = '$'
): { text: string; tone: 'positive' | 'negative' | 'neutral' } {
  if (Math.abs(delta) < 0.5) {
    return { text: `${symbol}0`, tone: 'neutral' };
  }
  const absStr = Math.abs(Math.round(delta)).toLocaleString('en-US');
  if (delta > 0) {
    return { text: `+${symbol}${absStr}`, tone: 'positive' };
  }
  return { text: `-${symbol}${absStr}`, tone: 'negative' };
}

