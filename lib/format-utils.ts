export type DisplayUnitId =
  | 'raw_yen'
  | 'thousand_yen'
  | 'million_yen'
  | 'oku_yen'
  | 'usd'
  | 'jpy_1'
  | 'jpy_1k'
  | 'jpy_1m'
  | 'jpy_100m';

export interface DisplayUnitConfig {
  id: DisplayUnitId;
  label: string;
  shortLabel: string;
  badge: string;
  symbol: string;
  divisor: number;
  decimals: number;
}

export const DISPLAY_UNIT_OPTIONS: DisplayUnitConfig[] = [
  {
    id: 'raw_yen',
    label: '¥ (円)',
    shortLabel: '円',
    badge: '円',
    symbol: '¥',
    divisor: 1,
    decimals: 0,
  },
  {
    id: 'thousand_yen',
    label: '¥ (千円)',
    shortLabel: '千円',
    badge: '千円',
    symbol: '¥',
    divisor: 1000,
    decimals: 0,
  },
  {
    id: 'million_yen',
    label: '¥ (百万円)',
    shortLabel: '百万円',
    badge: '百万円',
    symbol: '¥',
    divisor: 1_000_000,
    decimals: 1,
  },
  {
    id: 'oku_yen',
    label: '¥ (億円)',
    shortLabel: '億円',
    badge: '億円',
    symbol: '¥',
    divisor: 100_000_000,
    decimals: 2,
  },
  {
    id: 'usd',
    label: '$ (USD)',
    shortLabel: 'USD',
    badge: 'USD',
    symbol: '$',
    divisor: 1,
    decimals: 0,
  },
];

export const DEFAULT_UNIT_CONFIG: DisplayUnitConfig = DISPLAY_UNIT_OPTIONS[0];

export function getDisplayUnitConfig(id: DisplayUnitId): DisplayUnitConfig {
  return (
    DISPLAY_UNIT_OPTIONS.find((u) => u.id === id) ?? DISPLAY_UNIT_OPTIONS[0]
  );
}

export function formatPct(
  value: number | null | undefined,
  decimals = 1
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatScaledNumber(
  value: number | null | undefined,
  unitConfig: DisplayUnitConfig,
  options?: {
    overrideDecimals?: number;
    includeUnitSuffix?: boolean;
    signed?: boolean;
  }
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const scaled = value / (unitConfig.divisor || 1);
  const decimals = options?.overrideDecimals ?? unitConfig.decimals ?? 0;
  const absFormatted = Math.abs(scaled).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  let prefix = '';
  if (scaled < 0) prefix = '-';
  else if (options?.signed && scaled > 0) prefix = '+';

  const suffix = options?.includeUnitSuffix ? ` ${unitConfig.shortLabel}` : '';
  return `${prefix}${absFormatted}${suffix}`;
}

