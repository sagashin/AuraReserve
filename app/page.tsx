'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  VALUATION_MONTH_OPTIONS,
  GRANULARITY_OPTIONS,
  LINE_OF_BUSINESS_OPTIONS,
  ENTERPRISE_100_LOB_OPTIONS,
  LOB_CATEGORIES,
  LobCategoryId,
  ValuationMonthId,
  TimeGranularity,
  LineOfBusinessId,
  buildSegmentedTriangleDataset,
  evaluateTriangleActuarial,
  autoRecommendReservingConfig,
  LdfAverageMode,
  MethodSelection,
  runOdpBootstrapSimulation,
  BootstrapSimulationResult,
  applyReinsuranceTreatyToDataset,
  ReinsuranceTreatyResult,
} from '@/lib/actuarial-engine';
import {
  MultiSegmentFactRecord,
  getDefaultMultiSegmentFactStore,
  getAvailableSegmentDimensions,
  evaluatePortfolioPriorYearDevelopment,
} from '@/lib/segment-pyd-engine';
import TriangleWorkspace, { ResQSheetTab } from '@/components/TriangleWorkspace';
import MethodComparisonView from '@/components/MethodComparisonView';
import DiagnosticsAndTailView from '@/components/DiagnosticsAndTailView';
import AuditAndReportView from '@/components/AuditAndReportView';
import PriorYearDevAndSegmentsView from '@/components/PriorYearDevAndSegmentsView';
import StochasticBootstrapView from '@/components/StochasticBootstrapView';
import SolvencyIfrsComplianceView from '@/components/SolvencyIfrsComplianceView';
import AuditTrailSidebar, { AuditLogEntry } from '@/components/AuditTrailSidebar';
import CsvSchemaMapperModal from '@/components/CsvSchemaMapperModal';
import {
  DISPLAY_UNIT_OPTIONS,
  DisplayUnitId,
  getDisplayUnitConfig,
  formatScaledNumber,
} from '@/lib/format-utils';
import { exportActuarialValuationWorkbookXlsx } from '@/lib/workbook-export';
import {
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Grid3X3,
  Scale,
  Activity,
  FileText,
  History,
  Layers,
  Calendar,
  Clock,
  Briefcase,
  Upload,
  CheckCircle2,
  Coins,
  Download,
  Dice5,
  FolderTree,
  ChevronRight,
  ChevronDown,
  Server,
  PanelLeftClose,
  PanelLeftOpen,
  Lock,
  Unlock,
  FastForward,
  Copy,
  ClipboardPaste,
  Database,
  FolderOpen,
  Settings,
  Users,
  FileSpreadsheet,
  Search,
} from 'lucide-react';

type ActiveTab =
  | 'pyd_segments'
  | 'triangle'
  | 'methods'
  | 'diagnostics'
  | 'stochastic'
  | 'solvency_ifrs'
  | 'audit';

interface CustomTriangleOverride {
  originLabels: string[];
  devPeriods: number[];
  triangle: (number | null)[][];
  earnedPremium: number[];
  exposureCount?: number[];
  aprioriElr?: number;
}

export default function ActuarialWorkbenchPage() {
  // 3-Axis Portfolio Segmentation State
  const [valuationMonth, setValuationMonth] =
    useState<ValuationMonthId>('2026-10');
  const [granularity, setGranularity] = useState<TimeGranularity>('annual');
  const [lineOfBusiness, setLineOfBusiness] =
    useState<LineOfBusinessId>('auto_liab');
  const [lobCatalogMode, setLobCatalogMode] = useState<'16_core' | '100_full'>(
    '100_full'
  );
  const [lobSearchQuery, setLobSearchQuery] = useState<string>('');
  const [expandedLobCategories, setExpandedLobCategories] = useState<
    Record<LobCategoryId, boolean>
  >({
    motor_personal: true,
    property_eng: true,
    casualty_liab: true,
    marine_specialty: false,
    reinsurance_global: false,
  });

  // Global Display Unit Scale (円 / 千円 / 百万円 / 億円 / USD)
  const [displayUnitId, setDisplayUnitId] = useState<DisplayUnitId>('raw_yen');
  const unitConfig = useMemo(
    () => getDisplayUnitConfig(displayUnitId),
    [displayUnitId]
  );

  // Multi-Segment Fact Store
  const [customFactRecords, setCustomFactRecords] = useState<
    MultiSegmentFactRecord[] | null
  >(null);
  const [customDatasetBanner, setCustomDatasetBanner] = useState<string | null>(
    null
  );
  const [isSchemaMapperOpen, setIsSchemaMapperOpen] = useState(false);
  const [schemaMapperInitialTab, setSchemaMapperInitialTab] = useState<
    'loss' | 'separate_premium' | 'direct_triangle'
  >('loss');

  // Custom single-triangle CSV/Excel override
  const [customDataset, setCustomDataset] =
    useState<CustomTriangleOverride | null>(null);

  // Actuarial Judgment Parameters (WTW ResQ Complete Set)
  const [selectedMode, setSelectedMode] = useState<LdfAverageMode>('vw_all');
  const [tailFactor, setTailFactor] = useState<number>(1.018);
  const [aprioriElr, setAprioriElr] = useState<number>(0.72);
  const [bfWeight, setBfWeight] = useState<number>(0.5);
  const [benktanderIterations, setBenktanderIterations] = useState<number>(2);
  const [discountRate, setDiscountRate] = useState<number>(0.02);
  const [excludedCells, setExcludedCells] = useState<string[]>([]);
  const [manualLdfOverrides, setManualLdfOverrides] = useState<
    Record<number, number>
  >({});
  const [selectedMethodByOrigin, setSelectedMethodByOrigin] = useState<
    Record<number, MethodSelection>
  >({});
  const [manualUltimates, setManualUltimates] = useState<
    Record<number, number>
  >({});
  const [bookedIbnrByOrigin, setBookedIbnrByOrigin] = useState<
    Record<number, number>
  >({});

  // WTW ResQ Reinsurance Evaluation Layer (Gross 元受 / Ceded 出再 / Net 正味 + Quota Share & Excess of Loss XoL)
  const [reinsuranceBasis, setReinsuranceBasis] = useState<
    'gross' | 'ceded' | 'net'
  >('gross');
  const [cessionRate, setCessionRate] = useState<number>(0.2);
  const [xolEnabled, setXolEnabled] = useState<boolean>(false);
  const [xolRetention, setXolRetention] = useState<number>(2500000);
  const [xolLimit, setXolLimit] = useState<number>(5000000);
  const [reinstatementRatePct, setReinstatementRatePct] = useState<number>(1.0);

  // Server-Side Local File DB (/api/projects) State
  interface ServerProjectSnapshot {
    id: string;
    name: string;
    savedAt?: string;
    updatedAt?: string;
    author?: string;
    valuationMonth: string;
    granularity: string;
    lineOfBusiness: string;
    reinsuranceBasis?: 'gross' | 'ceded' | 'net';
    layerMode?: string;
    cessionRate?: number;
    xolEnabled?: boolean;
    xolRetention?: number;
    xolLimit?: number;
    selectedMode?: string;
    tailFactor?: number;
    aprioriElr?: number;
    bfWeight?: number;
    benktanderIterations?: number;
    discountRate?: number;
    excludedCells?: string[];
    manualLdfOverrides?: Record<number, number>;
    selectedMethodByOrigin?: Record<number, string>;
    manualUltimates?: Record<number, number>;
    bookedIbnrByOrigin?: Record<number, number>;
    statePayload?: Record<string, unknown>;
    summaryMetrics: {
      latestPaid: number;
      selectedIbnr: number;
      selectedUltimate: number;
      discountedPv?: number;
      discountedReservePv?: number;
      mackSe?: number;
      mackTotalSe?: number;
    };
  }
  const [serverSnapshots, setServerSnapshots] = useState<
    ServerProjectSnapshot[]
  >([]);
  const [isServerDbModalOpen, setIsServerDbModalOpen] =
    useState<boolean>(false);
  const [newSnapshotName, setNewSnapshotName] = useState<string>('');
  const [compareSnapshotId, setCompareSnapshotId] = useState<string>(
    'snapshot-fy2026-q3-baseline'
  );

  // Stochastic ODP Bootstrap State
  const [bootstrapIterations, setBootstrapIterations] = useState<number>(2000);
  const [bootstrapSeed, setBootstrapSeed] = useState<number>(202610);
  const [isSimulatingBootstrap, setIsSimulatingBootstrap] =
    useState<boolean>(false);

  // Navigation & UI State
  const [activeTab, setActiveTab] = useState<ActiveTab>('triangle');
  const [activeSheetTab, setActiveSheetTab] = useState<ResQSheetTab>('ratios');
  const [isProjectLocked, setIsProjectLocked] = useState<boolean>(false);
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);
  const [isResQExplorerOpen, setIsResQExplorerOpen] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [backendSyncBadge, setBackendSyncBadge] = useState<string>('Synced');

  const appendAuditLog = useCallback(
    (
      category: AuditLogEntry['category'],
      title: string,
      detail: string,
      impactDelta?: string
    ) => {
      const now = new Date();
      const timeStr = now.toTimeString().slice(0, 8);
      setAuditLogs((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: timeStr,
          category,
          title,
          detail,
          impactDelta,
        },
        ...prev,
      ]);
    },
    []
  );

  // Load persisted ResQ workspace & Server DB snapshots on mount
  useEffect(() => {
    let active = true;
    fetch('/api/projects')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.snapshots) return;
        setServerSnapshots(data.snapshots);
        setBackendSyncBadge('DB Synced');
      })
      .catch(() => {});

    fetch('/api/reserving/projects')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.workspace?.projects?.length) return;
        const proj = data.workspace.projects[0];
        if (proj.selectedMode) setSelectedMode(proj.selectedMode as LdfAverageMode);
        if (typeof proj.tailFactor === 'number') setTailFactor(proj.tailFactor);
        if (typeof proj.aprioriElr === 'number') setAprioriElr(proj.aprioriElr);
        if (typeof proj.bfWeight === 'number') setBfWeight(proj.bfWeight);
        if (typeof proj.benktanderIterations === 'number')
          setBenktanderIterations(proj.benktanderIterations);
        if (typeof proj.discountRate === 'number')
          setDiscountRate(proj.discountRate);
        if (proj.customTriangleOverride) {
          setCustomDataset(proj.customTriangleOverride);
          if (proj.customDatasetLabel) {
            setCustomDatasetBanner(proj.customDatasetLabel);
          }
        }
      })
      .catch(() => {
        // Fallback to local evaluation
      });
    return () => {
      active = false;
    };
  }, []);

  // Build active dataset & Reinsurance Treaty Layering (Gross / Ceded / Net with Proportional Quota Share + Non-Proportional Excess of Loss)
  const { activeDataset, reinsuranceTreatySummary } = useMemo(() => {
    const buildLayerBadge = () => {
      if (reinsuranceBasis === 'gross') return 'GROSS';
      const qsText = `QS ${(cessionRate * 100).toFixed(0)}%`;
      const xolText = xolEnabled
        ? ` + XoL ${(xolLimit / 1_000_000).toFixed(1)}M xs ${(
            xolRetention / 1_000_000
          ).toFixed(1)}M`
        : '';
      return `${reinsuranceBasis.toUpperCase()}: ${qsText}${xolText}`;
    };

    let rawDs: {
      valuationMonth: ValuationMonthId;
      granularity: TimeGranularity;
      lineOfBusiness: LineOfBusinessId;
      lineOfBusinessLabel: string;
      originLabels: string[];
      devPeriods: number[];
      triangle: (number | null)[][];
      incurredTriangle?: (number | null)[][];
      claimCountTriangle?: (number | null)[][];
      earnedPremium: number[];
      exposureCount?: number[];
      defaultElr: number;
      defaultTail: number;
    } | null = null;

    if (customDataset) {
      rawDs = {
        valuationMonth,
        granularity,
        lineOfBusiness,
        lineOfBusinessLabel: customDatasetBanner || 'Custom Imported Triangle',
        originLabels: customDataset.originLabels,
        devPeriods: customDataset.devPeriods,
        triangle: customDataset.triangle,
        earnedPremium: customDataset.earnedPremium,
        exposureCount: customDataset.exposureCount,
        defaultElr: customDataset.aprioriElr ?? aprioriElr,
        defaultTail: tailFactor,
      };
    } else if (customFactRecords && customFactRecords.length > 0) {
      const dimsInfo = getAvailableSegmentDimensions(customFactRecords);
      const latestVal =
        dimsInfo.valuationMonths[dimsInfo.valuationMonths.length - 1] ??
        valuationMonth;
      const effectiveGran = dimsInfo.granularities.includes(granularity)
        ? granularity
        : dimsInfo.granularities[0] ?? 'annual';

      const matching = customFactRecords.filter(
        (r) =>
          r.valuationMonth === latestVal && r.granularity === effectiveGran
      );
      const recs = matching.length > 0 ? matching : customFactRecords;

      const allDevs = Array.from(
        new Set(recs.flatMap((r) => r.devLagPeriods))
      ).sort((a, b) => a - b);

      const originMap = new Map<
        number,
        {
          label: string;
          cumRow: (number | null)[];
          incRow: (number | null)[];
          cntRow: (number | null)[];
          prem: number;
          exp: number;
          elrWeighted: number;
        }
      >();

      for (const r of recs) {
        const existing = originMap.get(r.originCode) ?? {
          label: r.originLabel,
          cumRow: allDevs.map(() => null),
          incRow: allDevs.map(() => null),
          cntRow: allDevs.map(() => null),
          prem: 0,
          exp: 0,
          elrWeighted: 0,
        };
        existing.prem += r.earnedPremium;
        existing.exp += r.earnedExposure ?? 0;
        existing.elrWeighted += r.earnedPremium * r.aprioriElr;

        allDevs.forEach((d, dIdx) => {
          const rIdx = r.devLagPeriods.indexOf(d);
          if (rIdx !== -1) {
            const pv = r.cumulativeRow[rIdx];
            if (pv !== null && pv !== undefined) {
              existing.cumRow[dIdx] = (existing.cumRow[dIdx] ?? 0) + pv;
            }
            const iv = r.incurredCumulativeRow?.[rIdx];
            if (iv !== null && iv !== undefined) {
              existing.incRow[dIdx] = (existing.incRow[dIdx] ?? 0) + iv;
            }
            const cv = r.claimCountCumulativeRow?.[rIdx];
            if (cv !== null && cv !== undefined) {
              existing.cntRow[dIdx] = (existing.cntRow[dIdx] ?? 0) + cv;
            }
          }
        });
        originMap.set(r.originCode, existing);
      }

      const sortedOrigins = Array.from(originMap.entries()).sort(
        (a, b) => a[0] - b[0]
      );
      if (sortedOrigins.length >= 2 && allDevs.length >= 2) {
        rawDs = {
          valuationMonth,
          granularity: effectiveGran,
          lineOfBusiness,
          lineOfBusinessLabel: `Imported Portfolio (${recs.length} slices)`,
          originLabels: sortedOrigins.map(([, v]) => v.label),
          devPeriods: allDevs,
          triangle: sortedOrigins.map(([, v]) => v.cumRow),
          incurredTriangle: sortedOrigins.map(([, v]) => v.incRow),
          claimCountTriangle: sortedOrigins.map(([, v]) => v.cntRow),
          earnedPremium: sortedOrigins.map(([, v]) =>
            Math.max(100, Math.round(v.prem))
          ),
          exposureCount: sortedOrigins.map(([, v]) => Math.max(10, v.exp)),
          defaultElr: 0.72,
          defaultTail: tailFactor,
        };
      }
    }

    if (!rawDs) {
      rawDs = buildSegmentedTriangleDataset(
        valuationMonth,
        granularity,
        lineOfBusiness
      );
    }

    const layerMode = reinsuranceBasis.toUpperCase() as
      | 'GROSS'
      | 'CEDED'
      | 'NET';
    const treatyConfig = {
      layerMode,
      quotaSharePct: cessionRate,
      xolEnabled,
      xolRetention,
      xolLimit,
      reinstatementRatePct,
    };

    const paidTreaty: ReinsuranceTreatyResult = applyReinsuranceTreatyToDataset({
      grossTriangle: rawDs.triangle,
      grossEarnedPremium: rawDs.earnedPremium,
      config: treatyConfig,
    });

    const incurredTreaty = rawDs.incurredTriangle
      ? applyReinsuranceTreatyToDataset({
          grossTriangle: rawDs.incurredTriangle,
          grossEarnedPremium: rawDs.earnedPremium,
          config: treatyConfig,
        })
      : null;

    const totalGrossPaid = rawDs.triangle.reduce((acc, row) => {
      for (let c = row.length - 1; c >= 0; c--) {
        if (row[c] !== null && row[c] !== undefined) {
          return acc + Number(row[c]);
        }
      }
      return acc;
    }, 0);
    const totalNetPaid = Math.max(
      0,
      totalGrossPaid -
        paidTreaty.diagnostics.cededQuotaSharePaid -
        paidTreaty.diagnostics.cededXolPaid
    );

    return {
      reinsuranceTreatySummary: {
        effectiveCessionRatio: paidTreaty.diagnostics.effectiveCedingRatio,
        totalCededXolPaid: paidTreaty.diagnostics.cededXolPaid,
        totalCededQsPaid: paidTreaty.diagnostics.cededQuotaSharePaid,
        totalGrossPaid,
        totalNetPaid,
      },
      activeDataset: {
        ...rawDs,
        lineOfBusinessLabel:
          reinsuranceBasis === 'gross'
            ? rawDs.lineOfBusinessLabel
            : `${rawDs.lineOfBusinessLabel} [${buildLayerBadge()}]`,
        triangle: paidTreaty.triangle,
        incurredTriangle: incurredTreaty
          ? incurredTreaty.triangle
          : rawDs.incurredTriangle,
        earnedPremium: paidTreaty.earnedPremium,
      },
    };
  }, [
    customDataset,
    customDatasetBanner,
    customFactRecords,
    valuationMonth,
    granularity,
    lineOfBusiness,
    aprioriElr,
    tailFactor,
    reinsuranceBasis,
    cessionRate,
    xolEnabled,
    xolRetention,
    xolLimit,
    reinstatementRatePct,
  ]);

  // Evaluate deterministic + Mack + Merz-Wuthrich + Cashflow Discounting
  const evaluation = useMemo(() => {
    return evaluateTriangleActuarial({
      originLabels: activeDataset.originLabels,
      devPeriods: activeDataset.devPeriods,
      triangle: activeDataset.triangle,
      incurredTriangle: (activeDataset as { incurredTriangle?: (number | null)[][] }).incurredTriangle,
      claimCountTriangle: (activeDataset as { claimCountTriangle?: (number | null)[][] }).claimCountTriangle,
      earnedPremium: activeDataset.earnedPremium,
      exposureCount: (activeDataset as { exposureCount?: number[] }).exposureCount,
      aprioriElr,
      selectedMode,
      manualLdfOverrides,
      tailFactor,
      excludedCells,
      selectedMethodByOrigin,
      manualUltimates,
      bfWeight,
      benktanderIterations,
      discountRate,
    });
  }, [
    activeDataset,
    aprioriElr,
    selectedMode,
    manualLdfOverrides,
    tailFactor,
    excludedCells,
    selectedMethodByOrigin,
    manualUltimates,
    bfWeight,
    benktanderIterations,
    discountRate,
  ]);

  // Evaluate Stochastic ODP Bootstrap
  const bootstrapResult: BootstrapSimulationResult = useMemo(() => {
    return runOdpBootstrapSimulation(
      evaluation,
      bootstrapIterations,
      bootstrapSeed
    );
  }, [evaluation, bootstrapIterations, bootstrapSeed]);

  // Sync with backend `/api/reserving/evaluate` & Auto-Save to Server File DB `/api/projects`
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/reserving/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originLabels: activeDataset.originLabels,
        devPeriods: activeDataset.devPeriods,
        triangle: activeDataset.triangle,
        earnedPremium: activeDataset.earnedPremium,
        aprioriElr,
        selectedMode,
        manualLdfOverrides,
        tailFactor,
        excludedCells,
        selectedMethodByOrigin,
        manualUltimates,
        bfWeight,
        benktanderIterations,
        discountRate,
      }),
      signal: controller.signal,
    }).catch(() => {});

    const timer = setTimeout(() => {
      const statePayload = {
        valuationMonth,
        granularity,
        lineOfBusiness,
        reinsuranceBasis,
        cessionRate,
        xolEnabled,
        xolRetention,
        xolLimit,
        selectedMode,
        tailFactor,
        aprioriElr,
        bfWeight,
        benktanderIterations,
        discountRate,
        excludedCells,
        manualLdfOverrides,
        selectedMethodByOrigin,
        manualUltimates,
        bookedIbnrByOrigin,
      };
      fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'autosave-latest',
          isAutoSave: true,
          name: `${valuationMonth} (Live Working Auto-Save · ${lineOfBusiness.toUpperCase()})`,
          valuationMonth,
          granularity,
          lineOfBusiness,
          layerMode: reinsuranceBasis.toUpperCase(),
          summaryMetrics: {
            latestPaid: Math.round(evaluation.totals.latestLoss),
            caseReserveOs: Math.round(evaluation.totals.caseReserve),
            selectedIbnr: Math.round(evaluation.totals.selectedIbnr),
            selectedUltimate: Math.round(evaluation.totals.selectedUltimate),
            discountedReservePv: Math.round(
              evaluation.cashflowProjection.totalDiscountedPv
            ),
            mackTotalSe: Math.round(evaluation.totals.mackTotalSe),
          },
          statePayload,
        }),
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.snapshots) {
            setServerSnapshots(data.snapshots);
            setBackendSyncBadge('DB Auto-Saved');
          }
        })
        .catch(() => {});
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    activeDataset,
    valuationMonth,
    granularity,
    lineOfBusiness,
    reinsuranceBasis,
    cessionRate,
    xolEnabled,
    xolRetention,
    xolLimit,
    aprioriElr,
    selectedMode,
    manualLdfOverrides,
    tailFactor,
    excludedCells,
    selectedMethodByOrigin,
    manualUltimates,
    bookedIbnrByOrigin,
    bfWeight,
    benktanderIterations,
    discountRate,
    evaluation,
  ]);

  const handleCreateServerSnapshot = () => {
    const label =
      newSnapshotName.trim() ||
      `${valuationMonth} Official Closing (${lineOfBusiness.toUpperCase()} · ${reinsuranceBasis.toUpperCase()})`;
    const statePayload = {
      valuationMonth,
      granularity,
      lineOfBusiness,
      reinsuranceBasis,
      cessionRate,
      xolEnabled,
      xolRetention,
      xolLimit,
      selectedMode,
      tailFactor,
      aprioriElr,
      bfWeight,
      benktanderIterations,
      discountRate,
      excludedCells,
      manualLdfOverrides,
      selectedMethodByOrigin,
      manualUltimates,
      bookedIbnrByOrigin,
    };
    fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isAutoSave: false,
        name: label,
        valuationMonth,
        granularity,
        lineOfBusiness,
        layerMode: reinsuranceBasis.toUpperCase(),
        summaryMetrics: {
          latestPaid: Math.round(evaluation.totals.latestLoss),
          caseReserveOs: Math.round(evaluation.totals.caseReserve),
          selectedIbnr: Math.round(evaluation.totals.selectedIbnr),
          selectedUltimate: Math.round(evaluation.totals.selectedUltimate),
          discountedReservePv: Math.round(
            evaluation.cashflowProjection.totalDiscountedPv
          ),
          mackTotalSe: Math.round(evaluation.totals.mackTotalSe),
        },
        statePayload,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.snapshots) {
          setServerSnapshots(data.snapshots);
          setNewSnapshotName('');
          appendAuditLog(
            'AUTO',
            `Committed Closing Snapshot to Server DB: ${label}`,
            `Persisted snapshot to .actuarial-data/projects-db.json (IBNR: ${formatScaledNumber(
              evaluation.totals.selectedIbnr,
              unitConfig
            )} ${unitConfig.badge}).`
          );
        }
      })
      .catch(() => {});
  };

  const handleRestoreServerSnapshot = (snap: ServerProjectSnapshot) => {
    const sp = (snap.statePayload ?? {}) as Partial<ServerProjectSnapshot>;
    setValuationMonth(
      ((sp.valuationMonth ?? snap.valuationMonth) ||
        '2026-10') as ValuationMonthId
    );
    setGranularity(
      ((sp.granularity ?? snap.granularity) || 'annual') as TimeGranularity
    );
    const lobRaw = (sp.lineOfBusiness ?? snap.lineOfBusiness) || 'auto_liab';
    setLineOfBusiness(
      (lobRaw === 'auto_liability' ? 'auto_liab' : lobRaw) as LineOfBusinessId
    );
    const basisRaw = (
      sp.reinsuranceBasis ??
      snap.reinsuranceBasis ??
      snap.layerMode ??
      'gross'
    )
      .toString()
      .toLowerCase();
    if (basisRaw === 'gross' || basisRaw === 'ceded' || basisRaw === 'net') {
      setReinsuranceBasis(basisRaw);
    }
    if (typeof sp.cessionRate === 'number') setCessionRate(sp.cessionRate);
    if (typeof sp.xolEnabled === 'boolean') setXolEnabled(sp.xolEnabled);
    if (typeof sp.xolRetention === 'number') setXolRetention(sp.xolRetention);
    if (typeof sp.xolLimit === 'number') setXolLimit(sp.xolLimit);
    if (sp.selectedMode) setSelectedMode(sp.selectedMode as LdfAverageMode);
    if (typeof sp.tailFactor === 'number') setTailFactor(sp.tailFactor);
    if (typeof sp.aprioriElr === 'number') setAprioriElr(sp.aprioriElr);
    if (typeof sp.bfWeight === 'number') setBfWeight(sp.bfWeight);
    if (typeof sp.benktanderIterations === 'number')
      setBenktanderIterations(sp.benktanderIterations);
    if (typeof sp.discountRate === 'number') setDiscountRate(sp.discountRate);
    setExcludedCells((sp.excludedCells as string[]) ?? []);
    setManualLdfOverrides(
      (sp.manualLdfOverrides as Record<number, number>) ?? {}
    );
    setSelectedMethodByOrigin(
      (sp.selectedMethodByOrigin as Record<number, MethodSelection>) ?? {}
    );
    setManualUltimates((sp.manualUltimates as Record<number, number>) ?? {});
    setBookedIbnrByOrigin(
      (sp.bookedIbnrByOrigin as Record<number, number>) ?? {}
    );
    appendAuditLog(
      'AUTO',
      `Restored Server DB Snapshot: ${snap.name}`,
      `Loaded closing assumptions from server snapshot (${
        snap.updatedAt ?? snap.savedAt ?? ''
      }).`
    );
  };

  // Handlers
  const handleValuationChange = (nextMonth: ValuationMonthId) => {
    setCustomDataset(null);
    setValuationMonth(nextMonth);
    appendAuditLog(
      'SEGMENT',
      `Valuation Period → ${nextMonth}`,
      `Switched valuation cutoff to ${nextMonth}.`
    );
  };

  const handleGranularityChange = (nextGran: TimeGranularity) => {
    setCustomDataset(null);
    setGranularity(nextGran);
    setExcludedCells([]);
    setManualLdfOverrides({});
    setSelectedMethodByOrigin({});
    appendAuditLog(
      'SEGMENT',
      `Time Granularity → ${nextGran.toUpperCase()}`,
      `Re-aggregated origin cohorts and development lags to ${nextGran} intervals.`
    );
  };

  const handleLobChange = (nextLob: LineOfBusinessId) => {
    setCustomDataset(null);
    setLineOfBusiness(nextLob);
    const nextDs = buildSegmentedTriangleDataset(
      valuationMonth,
      granularity,
      nextLob
    );
    setAprioriElr(nextDs.defaultElr);
    setTailFactor(nextDs.defaultTail);
    setExcludedCells([]);
    setManualLdfOverrides({});
    setSelectedMethodByOrigin({});
    setManualUltimates({});
    appendAuditLog(
      'SEGMENT',
      `Reserving Class → ${nextDs.lineOfBusinessLabel}`,
      `Loaded default ELR ${(nextDs.defaultElr * 100).toFixed(1)}% and Tail ${nextDs.defaultTail.toFixed(3)}.`
    );
  };

  const handleToggleCellExclusion = (cellKey: string) => {
    const prevIbnr = evaluation.totals.selectedIbnr;
    const isExcluding = !excludedCells.includes(cellKey);
    const nextExcluded = isExcluding
      ? [...excludedCells, cellKey]
      : excludedCells.filter((k) => k !== cellKey);
    setExcludedCells(nextExcluded);

    const nextEval = evaluateTriangleActuarial({
      originLabels: activeDataset.originLabels,
      devPeriods: activeDataset.devPeriods,
      triangle: activeDataset.triangle,
      earnedPremium: activeDataset.earnedPremium,
      aprioriElr,
      selectedMode,
      manualLdfOverrides,
      tailFactor,
      excludedCells: nextExcluded,
      selectedMethodByOrigin,
      manualUltimates,
      bfWeight,
      benktanderIterations,
      discountRate,
    });
    const delta = nextEval.totals.selectedIbnr - prevIbnr;
    const [rStr, cStr] = cellKey.split('-');
    const originLbl = activeDataset.originLabels[Number(rStr)] ?? rStr;
    const devFrom = activeDataset.devPeriods[Number(cStr)];
    const devTo = activeDataset.devPeriods[Number(cStr) + 1];

    appendAuditLog(
      'OUTLIER',
      isExcluding
        ? `Excluded Link Ratio (${originLbl} @ ${devFrom}–${devTo}m)`
        : `Restored Link Ratio (${originLbl} @ ${devFrom}–${devTo}m)`,
      `Updated LDF averages across column ${devFrom}–${devTo}m.`,
      `Δ IBNR: ${delta >= 0 ? '+' : ''}${formatScaledNumber(delta, unitConfig)} (${unitConfig.badge})`
    );
  };

  const handleToggleDiagonalExclusion = (
    diagLabel: string,
    cellKeys: string[]
  ) => {
    const isCurrentlyAllExcluded =
      cellKeys.length > 0 && cellKeys.every((k) => excludedCells.includes(k));
    const prevIbnr = evaluation.totals.selectedIbnr;
    const nextExcluded = isCurrentlyAllExcluded
      ? excludedCells.filter((k) => !cellKeys.includes(k))
      : Array.from(new Set([...excludedCells, ...cellKeys]));
    setExcludedCells(nextExcluded);

    const nextEval = evaluateTriangleActuarial({
      originLabels: activeDataset.originLabels,
      devPeriods: activeDataset.devPeriods,
      triangle: activeDataset.triangle,
      earnedPremium: activeDataset.earnedPremium,
      aprioriElr,
      selectedMode,
      manualLdfOverrides,
      tailFactor,
      excludedCells: nextExcluded,
      selectedMethodByOrigin,
      manualUltimates,
      bfWeight,
      benktanderIterations,
      discountRate,
    });
    const delta = nextEval.totals.selectedIbnr - prevIbnr;

    appendAuditLog(
      'OUTLIER',
      isCurrentlyAllExcluded
        ? `Restored Calendar Diagonal (${diagLabel})`
        : `Excluded Calendar Diagonal (${diagLabel} · ${cellKeys.length} cells)`,
      `Batch ${isCurrentlyAllExcluded ? 'restored' : 'excluded'} ${
        cellKeys.length
      } link ratios along calendar diagonal ${diagLabel}.`,
      `Δ IBNR: ${delta >= 0 ? '+' : ''}${formatScaledNumber(delta, unitConfig)} (${unitConfig.badge})`
    );
  };

  const handleSaveProjectFile = () => {
    const snapshot = {
      schemaVersion: 'AuraReserve-Portable-3.2',
      exportedAt: new Date().toISOString(),
      valuationMonth,
      granularity,
      lineOfBusiness,
      displayUnitId,
      reinsuranceBasis,
      cessionRate,
      xolEnabled,
      xolRetention,
      xolLimit,
      selectedMode,
      tailFactor,
      aprioriElr,
      bfWeight,
      benktanderIterations,
      discountRate,
      excludedCells,
      manualLdfOverrides,
      selectedMethodByOrigin,
      manualUltimates,
      bookedIbnrByOrigin,
      customDataset,
      customDatasetBanner,
      auditLogs,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AuraReserve_${lineOfBusiness}_${valuationMonth}.json`;
    a.click();
    URL.revokeObjectURL(url);
    appendAuditLog(
      'AUTO',
      'Saved Portable Closing Project File (.json)',
      `Exported complete actuarial state (${excludedCells.length} exclusions, Tail ${tailFactor.toFixed(4)}).`
    );
  };

  const handleLoadProjectFile = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed.valuationMonth) setValuationMonth(parsed.valuationMonth);
        if (parsed.granularity) setGranularity(parsed.granularity);
        if (parsed.lineOfBusiness) setLineOfBusiness(parsed.lineOfBusiness);
        if (parsed.displayUnitId) setDisplayUnitId(parsed.displayUnitId);
        if (parsed.reinsuranceBasis)
          setReinsuranceBasis(parsed.reinsuranceBasis);
        if (typeof parsed.cessionRate === 'number')
          setCessionRate(parsed.cessionRate);
        if (typeof parsed.xolEnabled === 'boolean')
          setXolEnabled(parsed.xolEnabled);
        if (typeof parsed.xolRetention === 'number')
          setXolRetention(parsed.xolRetention);
        if (typeof parsed.xolLimit === 'number')
          setXolLimit(parsed.xolLimit);
        if (parsed.selectedMode) setSelectedMode(parsed.selectedMode);
        if (typeof parsed.tailFactor === 'number')
          setTailFactor(parsed.tailFactor);
        if (typeof parsed.aprioriElr === 'number')
          setAprioriElr(parsed.aprioriElr);
        if (typeof parsed.bfWeight === 'number') setBfWeight(parsed.bfWeight);
        if (typeof parsed.benktanderIterations === 'number')
          setBenktanderIterations(parsed.benktanderIterations);
        if (typeof parsed.discountRate === 'number')
          setDiscountRate(parsed.discountRate);
        if (Array.isArray(parsed.excludedCells))
          setExcludedCells(parsed.excludedCells);
        if (parsed.manualLdfOverrides)
          setManualLdfOverrides(parsed.manualLdfOverrides);
        if (parsed.selectedMethodByOrigin)
          setSelectedMethodByOrigin(parsed.selectedMethodByOrigin);
        if (parsed.manualUltimates) setManualUltimates(parsed.manualUltimates);
        if (parsed.bookedIbnrByOrigin)
          setBookedIbnrByOrigin(parsed.bookedIbnrByOrigin);
        if (parsed.customDataset) setCustomDataset(parsed.customDataset);
        if (parsed.customDatasetBanner)
          setCustomDatasetBanner(parsed.customDatasetBanner);
        appendAuditLog(
          'AUTO',
          `Loaded Project File: ${file.name}`,
          `Restored full closing assumptions from ${file.name}.`
        );
      } catch {
        // Ignore invalid JSON
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSelectMode = (mode: LdfAverageMode) => {
    const prevIbnr = evaluation.totals.selectedIbnr;
    setSelectedMode(mode);
    const nextEval = evaluateTriangleActuarial({
      originLabels: activeDataset.originLabels,
      devPeriods: activeDataset.devPeriods,
      triangle: activeDataset.triangle,
      earnedPremium: activeDataset.earnedPremium,
      aprioriElr,
      selectedMode: mode,
      manualLdfOverrides,
      tailFactor,
      excludedCells,
      selectedMethodByOrigin,
      manualUltimates,
      bfWeight,
      benktanderIterations,
      discountRate,
    });
    const delta = nextEval.totals.selectedIbnr - prevIbnr;
    appendAuditLog(
      'LDF',
      `LDF Estimator → ${mode.toUpperCase()}`,
      `Updated baseline link-ratio averaging mode to ${mode}.`,
      `Δ IBNR: ${delta >= 0 ? '+' : ''}${formatScaledNumber(delta, unitConfig)} (${unitConfig.badge})`
    );
  };

  const handleManualLdfChange = (colIndex: number, value: number | null) => {
    const nextOverrides = { ...manualLdfOverrides };
    if (value === null) {
      delete nextOverrides[colIndex];
    } else {
      nextOverrides[colIndex] = value;
    }
    setManualLdfOverrides(nextOverrides);
    const devFrom = activeDataset.devPeriods[colIndex];
    const devTo = activeDataset.devPeriods[colIndex + 1];
    appendAuditLog(
      'LDF',
      `Manual LDF Override (${devFrom}–${devTo}m)`,
      value !== null
        ? `Set custom LDF = ${value.toFixed(4)} for ${devFrom}–${devTo}m.`
        : `Cleared custom LDF for ${devFrom}–${devTo}m.`
    );
  };

  const handleTailFactorChange = (val: number, sourceLabel = 'Manual Input') => {
    const prevIbnr = evaluation.totals.selectedIbnr;
    setTailFactor(val);
    const nextEval = evaluateTriangleActuarial({
      originLabels: activeDataset.originLabels,
      devPeriods: activeDataset.devPeriods,
      triangle: activeDataset.triangle,
      earnedPremium: activeDataset.earnedPremium,
      aprioriElr,
      selectedMode,
      manualLdfOverrides,
      tailFactor: val,
      excludedCells,
      selectedMethodByOrigin,
      manualUltimates,
      bfWeight,
      benktanderIterations,
      discountRate,
    });
    const delta = nextEval.totals.selectedIbnr - prevIbnr;
    appendAuditLog(
      'TAIL',
      `Tail Factor → ${val.toFixed(4)} (${sourceLabel})`,
      `Applied beyond-${activeDataset.devPeriods[activeDataset.devPeriods.length - 1]}m tail factor.`,
      `Δ IBNR: ${delta >= 0 ? '+' : ''}${formatScaledNumber(delta, unitConfig)} (${unitConfig.badge})`
    );
  };

  const handleAutoRecommend = () => {
    const prevIbnr = evaluation.totals.selectedIbnr;
    const rec = autoRecommendReservingConfig({
      originLabels: activeDataset.originLabels,
      devPeriods: activeDataset.devPeriods,
      triangle: activeDataset.triangle,
      earnedPremium: activeDataset.earnedPremium,
      aprioriElr,
    });

    setExcludedCells(rec.excludedCells);
    setSelectedMode(rec.recommendedMode);
    setTailFactor(rec.recommendedTailFactor);
    setSelectedMethodByOrigin(rec.recommendedMethodByOrigin);
    setManualLdfOverrides({});

    const nextEval = evaluateTriangleActuarial({
      originLabels: activeDataset.originLabels,
      devPeriods: activeDataset.devPeriods,
      triangle: activeDataset.triangle,
      earnedPremium: activeDataset.earnedPremium,
      aprioriElr,
      selectedMode: rec.recommendedMode,
      manualLdfOverrides: {},
      tailFactor: rec.recommendedTailFactor,
      excludedCells: rec.excludedCells,
      selectedMethodByOrigin: rec.recommendedMethodByOrigin,
      manualUltimates,
      bfWeight,
      benktanderIterations,
      discountRate,
    });
    const delta = nextEval.totals.selectedIbnr - prevIbnr;

    appendAuditLog(
      'AUTO',
      `Auto-Recommended Reserving Setup Applied`,
      rec.rationale.join(' '),
      `Δ IBNR: ${delta >= 0 ? '+' : ''}${formatScaledNumber(delta, unitConfig)} (${unitConfig.badge})`
    );
  };

  const handleExportWorkbookXlsx = () => {
    const activeRecords =
      customFactRecords && customFactRecords.length > 0
        ? customFactRecords
        : getDefaultMultiSegmentFactStore();
    const dimsInfo = getAvailableSegmentDimensions(activeRecords);
    const valMonths = dimsInfo.valuationMonths;
    const curVal =
      valMonths.includes(valuationMonth)
        ? valuationMonth
        : valMonths[valMonths.length - 1] ?? valuationMonth;
    const baseVal =
      valMonths.length >= 2 ? valMonths[valMonths.length - 2] : curVal;

    const pydAnalysis = evaluatePortfolioPriorYearDevelopment(
      activeRecords,
      curVal,
      granularity,
      {},
      selectedMode,
      tailFactor,
      baseVal
    );

    const formattedAuditLogs = auditLogs.map((l) => ({
      id: l.id,
      timestamp: l.timestamp,
      actionType: l.category || l.actionType || 'AUDIT',
      title: l.title,
      detail: l.detail,
      previousIbnr: evaluation.totals.selectedIbnr,
      newIbnr: evaluation.totals.selectedIbnr,
      deltaIbnr: 0,
    }));

    exportActuarialValuationWorkbookXlsx({
      datasetName: activeDataset.lineOfBusinessLabel,
      currencySymbol: unitConfig.symbol || unitConfig.badge,
      unitLabel: `${unitConfig.badge} (${unitConfig.label})`,
      originLabels: activeDataset.originLabels,
      evaluation,
      pydAnalysis,
      bootstrap: bootstrapResult,
      auditLogs: formattedAuditLogs,
    });

    appendAuditLog(
      'AUTO',
      'Exported Multi-Sheet Valuation Workbook (.xlsx)',
      `Generated 5-sheet Excel workbook in display unit [${unitConfig.badge}].`
    );
  };

  const handleApplyDirectTriangle = (parsed: {
    originLabels: string[];
    devPeriods: number[];
    triangle: (number | null)[][];
    earnedPremium: number[];
    exposureCount?: number[];
    aprioriElr?: number;
    label?: string;
  }) => {
    const nextOverride: CustomTriangleOverride = {
      originLabels: parsed.originLabels,
      devPeriods: parsed.devPeriods,
      triangle: parsed.triangle,
      earnedPremium: parsed.earnedPremium,
      exposureCount: parsed.exposureCount,
      aprioriElr: parsed.aprioriElr,
    };
    setCustomDataset(nextOverride);
    if (parsed.aprioriElr) setAprioriElr(parsed.aprioriElr);
    setCustomDatasetBanner(
      parsed.label
        ? `Direct Triangle: ${parsed.label} (${parsed.originLabels.length}×${parsed.devPeriods.length})`
        : `Direct Triangle (${parsed.originLabels.length}×${parsed.devPeriods.length})`
    );
    setExcludedCells([]);
    setManualLdfOverrides({});
    setSelectedMethodByOrigin({});
    setManualUltimates({});
    setActiveTab('triangle');

    // Persist to backend project store
    fetch('/api/reserving/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projects: [
          {
            id: 'proj-fy2026-q3',
            name: parsed.label || 'Custom Imported Closing Project',
            valuationMonth,
            granularity,
            lineOfBusiness,
            selectedMode,
            tailFactor,
            aprioriElr: parsed.aprioriElr ?? aprioriElr,
            bfWeight,
            benktanderIterations,
            discountRate,
            excludedCells: [],
            manualLdfOverrides: {},
            selectedMethodByOrigin: {},
            manualUltimates: {},
            customDatasetLabel: parsed.label || 'Direct Imported Triangle',
            customTriangleOverride: nextOverride,
            updatedAt: new Date().toISOString(),
          },
        ],
      }),
    }).catch(() => {});

    appendAuditLog(
      'SEGMENT',
      `Imported Direct 2D Triangle (${parsed.originLabels.length}×${parsed.devPeriods.length})`,
      `Replaced active triangle matrix with ${parsed.originLabels.length} origin cohorts.`
    );
  };

  const handleRollForwardWizard = () => {
    const idx = VALUATION_MONTH_OPTIONS.findIndex(
      (o) => o.id === valuationMonth
    );
    const nextOpt =
      VALUATION_MONTH_OPTIONS[(idx + 1) % VALUATION_MONTH_OPTIONS.length];
    setCustomDataset(null);
    setValuationMonth(nextOpt.id);
    appendAuditLog(
      'SEGMENT',
      `Roll-Forward Wizard → ${nextOpt.label}`,
      `Rolled forward LDF estimators (${selectedMode}), Tail (${tailFactor.toFixed(
        4
      )}), and Method Selections to valuation cutoff ${nextOpt.label}.`
    );
  };

  const handleCopyAllToClipboard = () => {
    const header = [
      'Origin',
      ...activeDataset.devPeriods.map((p) => `${p}m`),
      'Selected_IBNR',
      'Selected_Ultimate',
    ].join('\t');
    const body = activeDataset.originLabels
      .map((lbl, rIdx) => {
        const cells = activeDataset.devPeriods.map(
          (_, cIdx) => evaluation.cumulativeTriangle[rIdx]?.[cIdx] ?? ''
        );
        const r = evaluation.rows[rIdx];
        return [
          lbl,
          ...cells,
          Math.round(r?.selectedIbnr ?? 0),
          Math.round(r?.selectedUltimate ?? 0),
        ].join('\t');
      })
      .join('\n');
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(`${header}\n${body}`).catch(() => {});
    }
    appendAuditLog(
      'AUTO',
      'Copied Triangle & Reserve Results to Clipboard (TSV)',
      `Copied ${activeDataset.originLabels.length}×${activeDataset.devPeriods.length} matrix for direct Excel paste.`
    );
  };

  const handleExportCurrentScheduleCsv = () => {
    const headers = [
      'Origin',
      'Earned_Premium',
      'Paid_Loss',
      'Incurred_Loss',
      'Case_Reserve_OS',
      'Selected_CDF',
      'CL_IBNR',
      'BF_IBNR',
      'CapeCod_IBNR',
      'Benktander_IBNR',
      'Selected_Method',
      'Selected_IBNR',
      'Total_Unpaid_Reserve',
      'Discounted_PV_Reserve',
      'Selected_Ultimate',
      'Ultimate_LR',
      'Mack_Ult_SE',
      'Merz_Wuthrich_1Yr_SE',
    ];
    const rows = evaluation.summaryRows.map((r) =>
      [
        r.originLabel,
        Math.round(r.earnedPremium),
        Math.round(r.latestLoss),
        Math.round(r.latestIncurred),
        Math.round(r.caseReserve),
        r.cdf.toFixed(4),
        Math.round(r.clIbnr),
        Math.round(r.bfIbnr),
        Math.round(r.ccIbnr),
        Math.round(r.benktanderIbnr),
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
    a.download = `actuarial-cohort-schedule-${valuationMonth}-${reinsuranceBasis}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    appendAuditLog(
      'AUTO',
      `Exported Active Cohort Reserve Schedule (.csv)`,
      `Downloaded ${evaluation.summaryRows.length}-cohort valuation schedule (${reinsuranceBasis.toUpperCase()}).`
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#eef2f6] dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Actuarial Application Ribbon Header */}
      <header className="sticky top-0 z-30 border-b border-slate-300 dark:border-slate-800 bg-[#f8fafc] dark:bg-slate-900 shadow-xs select-none">
        {/* Top Row: Enterprise Application Title Bar + Global Valuation Context */}
        <div className="max-w-[1720px] mx-auto px-3 py-1 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          {/* Left: Product Identity, Active Portfolio Breadcrumb & Governance Status */}
          <div className="flex items-center gap-2 text-[11px]">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#0072c6] text-white font-bold tracking-tight shadow-2xs">
              <Scale className="w-3.5 h-3.5" />
              <span>AuraReserve Enterprise</span>
              <span className="text-[9px] font-mono bg-white/20 px-1 rounded">
                v3.2
              </span>
            </div>

            <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-300">
              <Briefcase className="w-3 h-3 text-[#0072c6]" />
              <span>
                {customDatasetBanner
                  ? customDatasetBanner
                  : (() => {
                      const found =
                        ENTERPRISE_100_LOB_OPTIONS.find(
                          (l) => l.id === lineOfBusiness
                        ) ?? LINE_OF_BUSINESS_OPTIONS[0];
                      return `${found.code} · ${found.label}`;
                    })()}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-500/15 text-[#0072c6] dark:text-sky-400">
                {reinsuranceBasis.toUpperCase()}
                {reinsuranceBasis !== 'gross'
                  ? ` (QS ${(cessionRate * 100).toFixed(1)}%)`
                  : ''}
              </span>
            </span>

            {isProjectLocked && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold border border-amber-500/30">
                <Lock className="w-3 h-3" />
                SOX / IFRS 17 Locked
              </span>
            )}
          </div>

          {/* Right: Global Valuation Cutoff, Cohort Granularity & Display Currency Unit */}
          <div className="flex flex-wrap items-center gap-2 py-0.5 text-[11px]">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100/80 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
              <Calendar className="w-3.5 h-3.5 text-[#0072c6]" />
              <label htmlFor="select-valuation-month" className="sr-only">
                Valuation Month
              </label>
              <select
                id="select-valuation-month"
                value={valuationMonth}
                onChange={(e) =>
                  handleValuationChange(e.target.value as ValuationMonthId)
                }
                className="bg-transparent font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                {VALUATION_MONTH_OPTIONS.map((opt) => (
                  <option
                    key={opt.id}
                    value={opt.id}
                    className="bg-white dark:bg-slate-900"
                  >
                    Val: {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="inline-flex rounded-md bg-slate-100 dark:bg-slate-900 p-0.5 border border-slate-200 dark:border-slate-800">
              {GRANULARITY_OPTIONS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => handleGranularityChange(g.id)}
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors cursor-pointer ${
                    granularity === g.id
                      ? 'bg-[#0072c6] text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {g.id === 'annual'
                    ? 'Annual'
                    : g.id === 'quarterly'
                    ? 'Quarterly'
                    : 'Monthly'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20">
              <Coins className="w-3.5 h-3.5 text-[#0072c6]" />
              <label htmlFor="select-display-unit" className="sr-only">
                Display Currency Unit
              </label>
              <select
                id="select-display-unit"
                aria-label="Display Currency Unit"
                value={displayUnitId}
                onChange={(e) =>
                  setDisplayUnitId(e.target.value as DisplayUnitId)
                }
                className="bg-transparent font-mono font-bold text-[#0072c6] dark:text-sky-400 focus:outline-none cursor-pointer"
              >
                {DISPLAY_UNIT_OPTIONS.map((u) => (
                  <option
                    key={u.id}
                    value={u.id}
                    className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    単位: {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Bottom Row: Zero-Duplication 3-Group Enterprise Ribbon Toolbar */}
        <div className="max-w-[1720px] mx-auto px-3 py-1 flex items-stretch justify-between gap-2 overflow-x-auto text-[10px] text-slate-700 dark:text-slate-300">
          {/* Group 1: Project, Database & SOX Governance */}
          <div className="flex flex-col justify-between pr-2 border-r border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-1 h-[48px]">
              <button
                type="button"
                onClick={() => setIsServerDbModalOpen(true)}
                className="h-[48px] px-2 rounded-lg border border-sky-500/25 bg-sky-500/5 hover:bg-sky-500/15 flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer whitespace-nowrap"
                title="Open Server Database & Closing Snapshot History (.actuarial-data/projects-db.json)"
              >
                <div className="w-6 h-6 rounded-md bg-[#0072c6]/15 text-[#0072c6] dark:text-sky-400 flex items-center justify-center">
                  <Database className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-[#0072c6] dark:text-sky-300 leading-none">
                  Server DB
                </span>
                <span className="text-[8px] font-mono text-emerald-700 dark:text-emerald-400 leading-none">
                  {backendSyncBadge}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsResQExplorerOpen((v) => !v)}
                className={`h-[48px] px-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                  isResQExplorerOpen
                    ? 'bg-[#cce4f7] dark:bg-sky-950/80 text-[#0072c6] dark:text-sky-300 font-semibold'
                    : 'hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
                title="Toggle Left Project & Treaty Explorer Sidebar"
              >
                <div className="w-6 h-6 rounded-md bg-sky-500/15 text-[#0072c6] dark:text-sky-400 flex items-center justify-center">
                  <FolderTree className="w-3.5 h-3.5" />
                </div>
                <span className="leading-none">Explorer</span>
              </button>

              <label
                className="h-[48px] px-2 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                title="Open Portable Project File (.json)"
              >
                <div className="w-6 h-6 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center">
                  <FolderOpen className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium leading-none">Open (.json)</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleLoadProjectFile}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleSaveProjectFile}
                className="h-[48px] px-2 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                title="Save Portable Closing Project File (.json)"
              >
                <div className="w-6 h-6 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center">
                  <Download className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium leading-none">Save (.json)</span>
              </button>

              {/* Stacked Mini Governance Actions (Lock Project, Roll-Forward Wizard, Audit Log) */}
              <div className="h-[48px] flex flex-col justify-between py-0.5 pl-1.5 border-l border-slate-200/70 dark:border-slate-800 text-[9.5px] whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => {
                    setIsProjectLocked((v) => !v);
                    appendAuditLog(
                      'AUTO',
                      !isProjectLocked
                        ? 'Locked Closing Project (SOX / Solvency II / IFRS 17 Sign-Off)'
                        : 'Unlocked Closing Project for Editing',
                      'Updated project governance security lock state.'
                    );
                  }}
                  className="h-3.5 flex items-center gap-1 px-1 rounded hover:bg-[#e5f1fb] dark:hover:bg-slate-800 text-left cursor-pointer"
                >
                  {isProjectLocked ? (
                    <Unlock className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                  ) : (
                    <Lock className="w-2.5 h-2.5 text-slate-600 shrink-0" />
                  )}
                  <span className="font-medium leading-none">
                    {isProjectLocked ? 'Unlock' : 'Lock Project'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleRollForwardWizard}
                  className="h-3.5 flex items-center gap-1 px-1 rounded hover:bg-[#e5f1fb] dark:hover:bg-slate-800 text-left cursor-pointer"
                  title="Roll-Forward Wizard: Advance valuation cutoff to next accounting period"
                >
                  <FastForward className="w-2.5 h-2.5 text-[#0072c6] shrink-0" />
                  <span className="font-medium leading-none">Roll-Forward</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAuditDrawerOpen(true)}
                  className="h-3.5 flex items-center gap-1 px-1 rounded hover:bg-[#e5f1fb] dark:hover:bg-slate-800 text-left cursor-pointer"
                >
                  <History className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                  <span className="font-medium leading-none">
                    Audit Log ({auditLogs.length})
                  </span>
                </button>
              </div>
            </div>
            <div className="text-center text-[8.5px] text-slate-400 font-semibold uppercase tracking-wider pt-0.5">
              Project & Governance
            </div>
          </div>

          {/* Group 2: Single Authoritative 7-Module Navigation Bar */}
          <div className="flex flex-col justify-between pr-1.5 border-r border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-0.5 h-[48px]">
              {(
                [
                  {
                    id: 'triangle',
                    label: '1. Triangles',
                    icon: Grid3X3,
                    badgeBg: 'bg-sky-500/15 text-[#0072c6]',
                  },
                  {
                    id: 'methods',
                    label: '2. Methods',
                    icon: Scale,
                    badgeBg: 'bg-purple-500/15 text-purple-600',
                  },
                  {
                    id: 'diagnostics',
                    label: '3. Tail & PV',
                    icon: Activity,
                    badgeBg: 'bg-teal-500/15 text-teal-600',
                  },
                  {
                    id: 'stochastic',
                    label: '4. Stochastic',
                    icon: Dice5,
                    badgeBg: 'bg-sky-500/15 text-sky-600',
                  },
                  {
                    id: 'solvency_ifrs',
                    label: '5. Solvency/IFRS',
                    icon: ShieldCheck,
                    badgeBg: 'bg-emerald-500/15 text-emerald-600',
                  },
                  {
                    id: 'pyd_segments',
                    label: '6. Segments/PYD',
                    icon: Layers,
                    badgeBg: 'bg-indigo-500/15 text-indigo-600',
                  },
                  {
                    id: 'audit',
                    label: '7. Sign-Off',
                    icon: FileText,
                    badgeBg: 'bg-amber-500/15 text-amber-600',
                  },
                ] as {
                  id: ActiveTab;
                  label: string;
                  icon: React.ComponentType<{ className?: string }>;
                  badgeBg: string;
                }[]
              ).map((mod) => {
                const Icon = mod.icon;
                const isActive = activeTab === mod.id;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => setActiveTab(mod.id)}
                    className={`h-[48px] px-1.5 rounded-lg flex flex-col items-center justify-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-[#0072c6] text-white font-bold shadow-2xs'
                        : 'hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center ${
                        isActive ? 'bg-white/20 text-white' : mod.badgeBg
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="leading-none">{mod.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="text-center text-[8.5px] text-slate-400 font-semibold uppercase tracking-wider pt-0.5">
              Actuarial Valuation Modules (1 – 7)
            </div>
          </div>

          {/* Group 3: Actuarial Automation, Data Studio & Deliverables */}
          <div className="flex flex-col justify-between shrink-0">
            <div className="flex items-center gap-0.5 h-[48px]">
              <button
                type="button"
                onClick={handleAutoRecommend}
                className="h-[48px] px-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                title="Auto-Recommend LDF, Outlier Exclusions, Tail & Cohort Methods"
              >
                <div className="w-6 h-6 rounded-md bg-sky-500/15 text-[#0072c6] flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold leading-none">Auto-Select</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSchemaMapperInitialTab('loss');
                  setIsSchemaMapperOpen(true);
                }}
                className="h-[48px] px-1.5 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                title="Open Universal Excel/CSV Multi-Segment & 2D Triangle Import Studio"
              >
                <div className="w-6 h-6 rounded-md bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                  <Upload className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold leading-none">Data Import</span>
              </button>

              <button
                type="button"
                onClick={handleCopyAllToClipboard}
                className="h-[48px] px-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                title="Copy Active Triangle & Selected Ultimates to Clipboard (TSV)"
              >
                <div className="w-6 h-6 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center">
                  <Copy className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium leading-none">Copy TSV</span>
              </button>

              <button
                type="button"
                onClick={handleExportCurrentScheduleCsv}
                className="h-[48px] px-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                title="Export Active Cohort Reserve Schedule (.csv)"
              >
                <div className="w-6 h-6 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium leading-none">Export (.csv)</span>
              </button>

              <button
                type="button"
                onClick={handleExportWorkbookXlsx}
                className="h-[48px] px-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 text-[#0072c6] dark:text-sky-300 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                title="Export Complete 6-Sheet Actuarial Valuation Workbook (.xlsx)"
              >
                <div className="w-6 h-6 rounded-md bg-[#0072c6]/15 text-[#0072c6] dark:text-sky-300 flex items-center justify-center">
                  <Download className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold leading-none">Workbook (.xlsx)</span>
              </button>
            </div>
            <div className="text-center text-[8.5px] text-slate-400 font-semibold uppercase tracking-wider pt-0.5">
              Automation, Import & Export
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout: Left Project & Treaty Inspector + Right Main Workspace */}
      <div className="flex-1 max-w-[1680px] w-full mx-auto px-4 sm:px-6 py-4 flex gap-5 items-start">
        {/* Collapsible Left Sidebar: Portfolio Hierarchy, Worksheet Tree & Reinsurance Treaty Inspector */}
        {isResQExplorerOpen && (
          <aside className="w-72 shrink-0 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xs overflow-hidden hidden lg:block">
            <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/60 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                <div className="w-6 h-6 rounded-md bg-[#0072c6]/10 text-[#0072c6] flex items-center justify-center">
                  <FolderTree className="w-3.5 h-3.5" />
                </div>
                <span>Project Explorer</span>
              </div>
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-sky-500/15 text-[#0072c6] dark:text-sky-400">
                {activeDataset.originLabels.length}×{activeDataset.devPeriods.length}
              </span>
            </div>

            <div className="p-2.5 space-y-3 text-xs">
              {/* Tree Group 1: Scalable 100-Class Reserving Hierarchy (Search + Category Folders + Virtual Scroll) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-1 px-1">
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                    <ChevronDown className="w-3 h-3 shrink-0" />
                    <span>Reserving Classes</span>
                  </div>
                  <div className="inline-flex shrink-0 rounded bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 text-[9px] font-mono whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setLobCatalogMode('16_core')}
                      className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
                        lobCatalogMode === '16_core'
                          ? 'bg-[#0072c6] text-white font-bold'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                      title="Show 16 Statutory Core Lines of Business"
                    >
                      16標準
                    </button>
                    <button
                      type="button"
                      onClick={() => setLobCatalogMode('100_full')}
                      className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
                        lobCatalogMode === '100_full'
                          ? 'bg-[#0072c6] text-white font-bold'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                      title="Show Full 100-Class Enterprise Reserving Catalog (LOB-001 to LOB-100)"
                    >
                      100種目
                    </button>
                  </div>
                </div>

                {/* Instant Search Filter for 100+ LOBs */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    aria-label="Search Reserving Classes (LOB)"
                    value={lobSearchQuery}
                    onChange={(e) => setLobSearchQuery(e.target.value)}
                    placeholder="種目コード・名称検索 (例: LOB-042, 賠償)..."
                    className="w-full pl-7 pr-6 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-[#0072c6]"
                  />
                  {lobSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setLobSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                      title="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Expand All / Collapse All + Count Status */}
                {(() => {
                  const catalogSource =
                    lobCatalogMode === '100_full'
                      ? ENTERPRISE_100_LOB_OPTIONS
                      : LINE_OF_BUSINESS_OPTIONS;
                  const q = lobSearchQuery.trim().toLowerCase();
                  const filteredLobs = q
                    ? ENTERPRISE_100_LOB_OPTIONS.filter(
                        (l) =>
                          l.label.toLowerCase().includes(q) ||
                          l.code.toLowerCase().includes(q) ||
                          l.categoryLabel.toLowerCase().includes(q)
                      )
                    : catalogSource;

                  return (
                    <>
                      <div className="flex items-center justify-between px-1 text-[10px] text-slate-400">
                        <span className="font-mono">
                          表示: <strong className="text-slate-700 dark:text-slate-200">{filteredLobs.length}</strong> / {catalogSource.length} 種目
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedLobCategories({
                                motor_personal: true,
                                property_eng: true,
                                casualty_liab: true,
                                marine_specialty: true,
                                reinsurance_global: true,
                              })
                            }
                            className="hover:text-[#0072c6] cursor-pointer"
                          >
                            全展開
                          </button>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedLobCategories({
                                motor_personal: false,
                                property_eng: false,
                                casualty_liab: false,
                                marine_specialty: false,
                                reinsurance_global: false,
                              })
                            }
                            className="hover:text-[#0072c6] cursor-pointer"
                          >
                            全折畳
                          </button>
                        </div>
                      </div>

                      {/* Bounded Scrollable Hierarchical Category Tree */}
                      <div className="max-h-56 overflow-y-auto pr-0.5 space-y-1 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-1">
                        {LOB_CATEGORIES.map((cat) => {
                          const catLobs = filteredLobs.filter(
                            (l) => l.category === cat.id
                          );
                          if (catLobs.length === 0) return null;
                          const isExpanded =
                            q.length > 0 || expandedLobCategories[cat.id];
                          const hasSelectedInCat = catLobs.some(
                            (l) => !customDataset && l.id === lineOfBusiness
                          );

                          return (
                            <div
                              key={cat.id}
                              className="rounded-md bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/80 overflow-hidden"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedLobCategories((prev) => ({
                                    ...prev,
                                    [cat.id]: !prev[cat.id],
                                  }))
                                }
                                className={`w-full px-2 py-1 text-left flex items-center justify-between text-[10.5px] font-bold transition-colors cursor-pointer ${
                                  hasSelectedInCat
                                    ? 'bg-sky-500/10 text-[#0072c6] dark:text-sky-300'
                                    : 'bg-slate-100/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200/60'
                                }`}
                              >
                                <span className="flex items-center gap-1 truncate">
                                  {isExpanded ? (
                                    <ChevronDown className="w-3 h-3 shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3 shrink-0" />
                                  )}
                                  <span className="truncate">{cat.shortLabel}</span>
                                </span>
                                <span className="font-mono text-[9.5px] px-1.5 py-0.2 rounded bg-white/80 dark:bg-slate-950 text-slate-500 shrink-0">
                                  {catLobs.length}
                                </span>
                              </button>

                              {isExpanded && (
                                <div className="p-1 space-y-0.5">
                                  {catLobs.map((lob) => {
                                    const isSelected =
                                      !customDataset && lineOfBusiness === lob.id;
                                    return (
                                      <button
                                        key={lob.id}
                                        type="button"
                                        onClick={() => handleLobChange(lob.id)}
                                        title={`${lob.code} · ${lob.label} (ELR ${(
                                          lob.defaultElr * 100
                                        ).toFixed(1)}%, Tail ${lob.defaultTail.toFixed(
                                          3
                                        )})`}
                                        className={`w-full py-1 px-2 text-left rounded flex items-center justify-between gap-1.5 transition-colors cursor-pointer ${
                                          isSelected
                                            ? 'bg-[#0072c6] text-white font-semibold shadow-2xs'
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                                        }`}
                                      >
                                        <span className="truncate text-[10.5px]">
                                          <span
                                            className={`font-mono text-[9.5px] mr-1 ${
                                              isSelected
                                                ? 'text-sky-100'
                                                : 'text-slate-400'
                                            }`}
                                          >
                                            {lob.code}
                                          </span>
                                          {lob.label}
                                        </span>
                                        <span
                                          className={`font-mono text-[9px] px-1 rounded shrink-0 ${
                                            isSelected
                                              ? 'bg-white/20 text-white'
                                              : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                          }`}
                                        >
                                          {(lob.defaultElr * 100).toFixed(0)}%
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Tree Group 2: Gross / Ceded / Net Reinsurance Evaluation Layer (Arbitrary Quota Share % + Arbitrary XoL) */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between px-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Reinsurance Layer (再保険)
                  </span>
                  <span className="text-[10px] font-mono text-[#0072c6] dark:text-sky-400 font-semibold">
                    {reinsuranceBasis.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800">
                  {(
                    [
                      { id: 'gross', label: 'Gross (元受)' },
                      { id: 'ceded', label: 'Ceded (出再)' },
                      { id: 'net', label: 'Net (正味)' },
                    ] as const
                  ).map((layer) => (
                    <button
                      key={layer.id}
                      type="button"
                      onClick={() => {
                        setReinsuranceBasis(layer.id);
                        appendAuditLog(
                          'SEGMENT',
                          `Reinsurance Layer → ${layer.label}`,
                          `Switched triangle & IBNR evaluation basis to ${layer.label} (QS ${(
                            cessionRate * 100
                          ).toFixed(1)}%${
                            xolEnabled
                              ? ` + XoL ${(xolLimit / 1_000_000).toFixed(
                                  2
                                )}M xs ${(xolRetention / 1_000_000).toFixed(2)}M`
                              : ''
                          }).`
                        );
                      }}
                      className={`h-7 px-1 rounded text-[10px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                        reinsuranceBasis === layer.id
                          ? 'bg-[#0072c6] text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {layer.label}
                    </button>
                  ))}
                </div>

                {/* Arbitrary Proportional Quota Share (%) Input + Slider + Presets */}
                <div className="p-2 rounded-lg bg-sky-500/5 border border-sky-500/20 space-y-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <label
                        htmlFor="input-quota-share-pct"
                        className="text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                      >
                        比例出再率 (Quota Share):
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          id="input-quota-share-pct"
                          aria-label="Quota Share Cession Rate (%)"
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={Number((cessionRate * 100).toFixed(2))}
                          onChange={(e) => {
                            const rawPct = parseFloat(e.target.value);
                            if (Number.isNaN(rawPct)) {
                              setCessionRate(0);
                              return;
                            }
                            const clamped = Math.max(0, Math.min(100, rawPct));
                            setCessionRate(clamped / 100);
                          }}
                          className="w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-right text-[11px] font-mono font-bold text-[#0072c6] dark:text-sky-400 focus:outline-none focus:border-[#0072c6]"
                        />
                        <span className="text-[11px] font-mono font-bold text-[#0072c6] dark:text-sky-400">
                          %
                        </span>
                      </div>
                    </div>

                    {/* Smooth 0% - 100% Slider */}
                    <input
                      type="range"
                      aria-label="Quota Share Slider"
                      min={0}
                      max={100}
                      step={0.5}
                      value={Number((cessionRate * 100).toFixed(1))}
                      onChange={(e) =>
                        setCessionRate(Number(e.target.value) / 100)
                      }
                      className="w-full h-1.5 accent-[#0072c6] cursor-pointer"
                    />

                    {/* Quick Preset Chips + Arbitrary Entry Hint */}
                    <div className="flex items-center justify-between gap-1">
                      {[0, 15, 20, 33.3, 50, 75].map((pct) => {
                        const isMatch =
                          Math.abs(cessionRate * 100 - pct) < 0.08;
                        return (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setCessionRate(pct / 100)}
                            className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono cursor-pointer transition-colors ${
                              isMatch
                                ? 'bg-[#0072c6] text-white font-bold'
                                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-[#0072c6]'
                            }`}
                          >
                            {pct}%
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Non-Proportional Excess of Loss (XoL) Toggle & Arbitrary Layer Inputs */}
                  <div className="pt-1.5 border-t border-sky-500/15 space-y-1.5">
                    <label className="flex items-center justify-between gap-1.5 cursor-pointer">
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                        非比例 XoL (超過損害額再保険)
                      </span>
                      <input
                        type="checkbox"
                        checked={xolEnabled}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setXolEnabled(next);
                          if (next && reinsuranceBasis === 'gross') {
                            setReinsuranceBasis('net');
                          }
                          appendAuditLog(
                            'SEGMENT',
                            next
                              ? `Enabled Non-Proportional XoL Treaty (${(
                                  xolLimit / 1_000_000
                                ).toFixed(2)}M xs ${(
                                  xolRetention / 1_000_000
                                ).toFixed(2)}M)`
                              : 'Disabled Non-Proportional XoL Treaty',
                            'Updated Gross / Ceded / Net triangle layering with non-proportional Excess of Loss.'
                          );
                        }}
                        className="rounded border-slate-300 text-[#0072c6] focus:ring-0 cursor-pointer"
                      />
                    </label>

                    {xolEnabled && (
                      <div className="space-y-1.5 text-[10px]">
                        <div className="flex items-center justify-between gap-1">
                          <label
                            htmlFor="input-xol-retention"
                            className="text-slate-500"
                          >
                            Retention (保有額):
                          </label>
                          <div className="flex items-center gap-1">
                            <input
                              id="input-xol-retention"
                              aria-label="XoL Retention"
                              type="number"
                              min={0}
                              step={100000}
                              value={Math.round(xolRetention)}
                              onChange={(e) =>
                                setXolRetention(
                                  Math.max(0, Number(e.target.value) || 0)
                                )
                              }
                              className="w-24 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-right font-mono font-semibold text-slate-800 dark:text-slate-200"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <label
                            htmlFor="input-xol-limit"
                            className="text-slate-500"
                          >
                            Limit (限度額):
                          </label>
                          <div className="flex items-center gap-1">
                            <input
                              id="input-xol-limit"
                              aria-label="XoL Limit"
                              type="number"
                              min={100000}
                              step={100000}
                              value={Math.round(xolLimit)}
                              onChange={(e) =>
                                setXolLimit(
                                  Math.max(100000, Number(e.target.value) || 0)
                                )
                              }
                              className="w-24 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-right font-mono font-semibold text-slate-800 dark:text-slate-200"
                            />
                          </div>
                        </div>
                        <div className="pt-1 text-[10px] font-mono text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-900/80 px-1.5 py-1 rounded border border-slate-200 dark:border-slate-800">
                          <div>
                            実効出再率:{' '}
                            <strong className="text-[#0072c6]">
                              {(
                                reinsuranceTreatySummary.effectiveCessionRatio *
                                100
                              ).toFixed(2)}
                              %
                            </strong>
                          </div>
                          <div>
                            XoL回収累計:{' '}
                            <strong>
                              {formatScaledNumber(
                                reinsuranceTreatySummary.totalCededXolPaid,
                                unitConfig
                              )}
                            </strong>{' '}
                            {unitConfig.badge}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tree Group 3: Gross → Ceded → Net Reinsurance Balance Bridge */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between px-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Gross / Ceded / Net Bridge
                  </span>
                  <span className="text-[9.5px] font-mono text-[#0072c6] dark:text-sky-400 font-semibold">
                    {unitConfig.badge}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-1 text-[11px] font-mono">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-slate-500">Gross Paid (元受):</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formatScaledNumber(
                        reinsuranceTreatySummary.totalGrossPaid,
                        unitConfig
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-slate-500">
                      Ceded QS ({(cessionRate * 100).toFixed(1)}%):
                    </span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      -
                      {formatScaledNumber(
                        reinsuranceTreatySummary.totalCededQsPaid,
                        unitConfig
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-slate-500">Ceded XoL (超過損害):</span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      -
                      {formatScaledNumber(
                        reinsuranceTreatySummary.totalCededXolPaid,
                        unitConfig
                      )}
                    </span>
                  </div>
                  <div className="pt-1 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="font-sans font-semibold text-slate-700 dark:text-slate-300">
                      Net Retained Paid:
                    </span>
                    <span className="font-bold text-[#0072c6] dark:text-sky-400">
                      {formatScaledNumber(
                        reinsuranceTreatySummary.totalNetPaid,
                        unitConfig
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tree Group 4: Live Actuarial Assumptions Readout (Replaces duplicate Import/Save buttons) */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between px-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Valuation Parameters
                  </span>
                  <span className="text-[9.5px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                    Live Sync ✓
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-1 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Baseline LDF:</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {selectedMode.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Tail Factor:</span>
                    <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                      {tailFactor.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">A Priori / CC ELR:</span>
                    <span className="font-mono font-semibold text-[#0072c6] dark:text-sky-400">
                      {(aprioriElr * 100).toFixed(1)}% /{' '}
                      {(evaluation.capeCodElr * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Discount / Dur:</span>
                    <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {(discountRate * 100).toFixed(2)}% ·{' '}
                      {evaluation.cashflowProjection.macaulayDurationYears.toFixed(
                        2
                      )}
                      y
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Outliers / Manual:</span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {excludedCells.length} Excl ·{' '}
                      {Object.keys(manualLdfOverrides).length} LDF
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Right Main Content Area */}
        <main className="flex-1 min-w-0 space-y-4">
          {customDatasetBanner && (
            <div className="px-4 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/30 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900 dark:text-emerald-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  <strong>Active Imported Dataset:</strong> {customDatasetBanner}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSchemaMapperInitialTab('separate_premium');
                    setIsSchemaMapperOpen(true);
                  }}
                  className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold cursor-pointer"
                >
                  + 別ファイル保険料を結合
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomFactRecords(null);
                    setCustomDataset(null);
                    setCustomDatasetBanner(null);
                  }}
                  className="px-2.5 py-1 rounded border border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 cursor-pointer"
                >
                  標準サンプルへ戻す
                </button>
              </div>
            </div>
          )}

          {/* 5-Card Executive Actuarial KPI Ribbon with Uniform Icon Containers & 3-Row Rhythm */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* KPI 1: Paid & Case Reserve */}
            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-3.5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Paid Loss + Case (OS)
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {activeDataset.originLabels.length}×{activeDataset.devPeriods.length}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                    <Coins className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
              <div className="my-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {formatScaledNumber(evaluation.totals.latestLoss, unitConfig)}
              </div>
              <div className="text-[11px] text-amber-600 dark:text-amber-400 font-mono">
                Case OS: {formatScaledNumber(evaluation.totals.caseReserve, unitConfig)} ({unitConfig.badge})
              </div>
            </div>

            {/* KPI 2: Selected IBNR & Total Unpaid Reserve */}
            <div className="rounded-xl border border-sky-500/35 bg-sky-500/5 dark:bg-sky-950/30 p-3.5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#0072c6] dark:text-sky-300">
                  Selected IBNR Reserve
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-[#0072c6] dark:text-sky-300">
                    {selectedMode.toUpperCase()}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-sky-500/15 text-[#0072c6] dark:text-sky-400 flex items-center justify-center">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
              <div className="my-1.5 text-xl font-bold font-mono tabular-nums text-[#0072c6] dark:text-sky-400">
                {formatScaledNumber(evaluation.totals.selectedIbnr, unitConfig)}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                Total Unpaid (OS+IBNR):{' '}
                {formatScaledNumber(
                  evaluation.totals.totalUnpaidReserve,
                  unitConfig
                )}
              </div>
            </div>

            {/* KPI 3: Selected Ultimate Loss */}
            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-3.5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Selected Ultimate Loss
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    Tail {tailFactor.toFixed(3)}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Scale className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
              <div className="my-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {formatScaledNumber(
                  evaluation.totals.selectedUltimate,
                  unitConfig
                )}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                Benktander IBNR:{' '}
                {formatScaledNumber(
                  evaluation.totals.benktanderIbnr,
                  unitConfig
                )}
              </div>
            </div>

            {/* KPI 4: Discounted PV Reserve & Duration */}
            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-3.5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Discounted PV Reserve
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    y={(discountRate * 100).toFixed(2)}%
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
              <div className="my-1.5 text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatScaledNumber(
                  evaluation.cashflowProjection.totalDiscountedPv,
                  unitConfig
                )}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                Duration:{' '}
                {evaluation.cashflowProjection.macaulayDurationYears.toFixed(2)}{' '}
                yrs · Ult LR:{' '}
                {(evaluation.totals.overallLossRatio * 100).toFixed(1)}%
              </div>
            </div>

            {/* KPI 5: Mack Ultimate SE & Merz-Wuthrich 1-Yr CDR SE */}
            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-3.5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Mack Ult SE / M-W 1Yr
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    CV {(evaluation.totals.overallCv * 100).toFixed(1)}%
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
              <div className="my-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                ±{formatScaledNumber(evaluation.totals.mackTotalSe, unitConfig)}
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                1-Yr CDR SE: ±
                {formatScaledNumber(
                  evaluation.totals.merzWuthrichTotal1YrSe,
                  unitConfig
                )}{' '}
                ({(evaluation.totals.merzWuthrichOverall1YrCv * 100).toFixed(1)}%)
              </div>
            </div>
          </div>

          {/* Active Workspace View */}
          {activeTab === 'pyd_segments' && (
            <PriorYearDevAndSegmentsView
              valuationMonth={valuationMonth}
              granularity={granularity}
              selectedMode={selectedMode}
              tailFactor={tailFactor}
              customFactRecords={customFactRecords}
              unitConfig={unitConfig}
              onOpenSchemaMapper={(mode) => {
                setSchemaMapperInitialTab(mode ?? 'loss');
                setIsSchemaMapperOpen(true);
              }}
              onLoadCustomRecords={(records, summaryText) => {
                setCustomFactRecords(records);
                setCustomDatasetBanner(summaryText);
                appendAuditLog('SEGMENT', 'Loaded Multi-Segment Dataset', summaryText);
              }}
              onResetToDefaultRecords={() => {
                setCustomFactRecords(null);
                setCustomDatasetBanner(null);
                appendAuditLog(
                  'SEGMENT',
                  'Reset to Built-In Multi-Segment Store',
                  'Restored default 12-segment portfolio.'
                );
              }}
              onValuationMonthChange={(m) => handleValuationChange(m)}
              onGranularityChange={(g) => handleGranularityChange(g)}
              onApplySegmentToTriangle={(segPayload) => {
                setCustomDataset({
                  originLabels: segPayload.originLabels,
                  devPeriods: segPayload.devPeriods,
                  triangle: segPayload.triangle,
                  earnedPremium: segPayload.earnedPremium,
                });
                setAprioriElr(segPayload.aprioriElr);
                setExcludedCells([]);
                setManualLdfOverrides({});
                setSelectedMethodByOrigin({});
                setManualUltimates({});
                setActiveTab('triangle');
                appendAuditLog(
                  'SEGMENT',
                  `Loaded Slice into Triangle: ${segPayload.label}`,
                  `Loaded ${segPayload.originLabels.length} origin cohorts into active triangle.`
                );
              }}
            />
          )}

          {activeTab === 'triangle' && (
            <TriangleWorkspace
              originLabels={activeDataset.originLabels}
              devPeriods={activeDataset.devPeriods}
              evaluation={evaluation}
              selectedMode={selectedMode}
              tailFactor={tailFactor}
              excludedCells={excludedCells}
              manualLdfOverrides={manualLdfOverrides}
              onSelectMode={handleSelectMode}
              onToggleCellExclusion={handleToggleCellExclusion}
              onToggleDiagonalExclusion={handleToggleDiagonalExclusion}
              onManualLdfChange={handleManualLdfChange}
              onTailFactorChange={(v) => handleTailFactorChange(v, 'Manual Input')}
              onResetOverrides={() => {
                setExcludedCells([]);
                setManualLdfOverrides({});
                appendAuditLog(
                  'LDF',
                  'Reset All LDF Overrides & Exclusions',
                  'Restored all excluded link-ratio cells and manual LDF overrides.'
                );
              }}
              onApplyParametricTail={(model) => {
                const fit = evaluation.tailFits[model];
                handleTailFactorChange(fit.tailFactor, fit.modelName);
              }}
              onDirectImportTriangle={(parsed) =>
                handleApplyDirectTriangle({
                  ...parsed,
                  label: 'Inline Pasted / Uploaded Triangle',
                })
              }
              activeSheetTab={activeSheetTab}
              onSheetTabChange={setActiveSheetTab}
              unitConfig={unitConfig}
            />
          )}

          {activeTab === 'methods' && (
            <MethodComparisonView
              evaluation={evaluation}
              aprioriElr={aprioriElr}
              bfWeight={bfWeight}
              benktanderIterations={benktanderIterations}
              selectedMethodByOrigin={selectedMethodByOrigin}
              manualUltimates={manualUltimates}
              bookedIbnrOverrides={bookedIbnrByOrigin}
              onBookedIbnrChange={(originIdx, val) => {
                setBookedIbnrByOrigin((prev) => {
                  const next = { ...prev };
                  if (val === null) delete next[originIdx];
                  else next[originIdx] = val;
                  return next;
                });
              }}
              onAprioriElrChange={(val) => {
                setAprioriElr(val);
                appendAuditLog(
                  'METHOD',
                  `A Priori ELR → ${(val * 100).toFixed(1)}%`,
                  `Updated expected loss ratio assumption.`
                );
              }}
              onBfWeightChange={(val) => {
                setBfWeight(val);
                appendAuditLog(
                  'METHOD',
                  `Credibility Weight w_BF → ${(val * 100).toFixed(0)}%`,
                  `Updated BF/CL credibility blend weight.`
                );
              }}
              onBenktanderIterationsChange={(val) => {
                setBenktanderIterations(val);
                appendAuditLog(
                  'METHOD',
                  `Benktander Iterations → m=${val}`,
                  `Updated iterated Bornhuetter-Ferguson step count.`
                );
              }}
              onSelectMethodForOrigin={(originIdx, method) => {
                setSelectedMethodByOrigin((prev) => ({
                  ...prev,
                  [originIdx]: method,
                }));
                appendAuditLog(
                  'METHOD',
                  `Origin ${activeDataset.originLabels[originIdx]} Method → ${method}`,
                  `Selected ${method} estimator for origin cohort ${activeDataset.originLabels[originIdx]}.`
                );
              }}
              onSelectMethodForAll={(method) => {
                const nextMap: Record<number, MethodSelection> = {};
                activeDataset.originLabels.forEach((_, idx) => {
                  nextMap[idx] = method;
                });
                setSelectedMethodByOrigin(nextMap);
                appendAuditLog(
                  'METHOD',
                  `All Origin Cohorts Method → ${method}`,
                  `Applied ${method} across all ${activeDataset.originLabels.length} origin cohorts.`
                );
              }}
              onManualUltimateChange={(originIdx, val) => {
                setManualUltimates((prev) => {
                  const next = { ...prev };
                  if (val === null) delete next[originIdx];
                  else next[originIdx] = val;
                  return next;
                });
                if (val !== null) {
                  appendAuditLog(
                    'METHOD',
                    `Manual Ultimate Override (${activeDataset.originLabels[originIdx]})`,
                    `Set Manual Ultimate = ${formatScaledNumber(val, unitConfig)} ${unitConfig.badge}.`
                  );
                }
              }}
              unitConfig={unitConfig}
            />
          )}

          {activeTab === 'diagnostics' && (
            <DiagnosticsAndTailView
              evaluation={evaluation}
              devPeriods={activeDataset.devPeriods}
              currentTailFactor={tailFactor}
              discountRate={discountRate}
              onApplyTailFactor={(val, label) => handleTailFactorChange(val, label)}
              onDiscountRateChange={(rate) => {
                setDiscountRate(rate);
                appendAuditLog(
                  'TAIL',
                  `Discount Rate → ${(rate * 100).toFixed(2)}%`,
                  `Updated IFRS 17 / J-GAAP cashflow discounting yield.`
                );
              }}
              unitConfig={unitConfig}
            />
          )}

          {activeTab === 'stochastic' && (
            <StochasticBootstrapView
              evaluation={evaluation}
              bootstrap={bootstrapResult}
              currencySymbol={unitConfig.symbol || `${unitConfig.badge} `}
              isSimulating={isSimulatingBootstrap}
              onRunSimulation={(iters, seed) => {
                setIsSimulatingBootstrap(true);
                setBootstrapIterations(iters);
                setBootstrapSeed(seed);
                setTimeout(() => setIsSimulatingBootstrap(false), 120);
                appendAuditLog(
                  'AUTO',
                  `Ran ODP Bootstrap Simulation (${iters.toLocaleString()} runs)`,
                  `Simulated predictive distribution & Merz-Wüthrich 1-Yr CDR risk capital.`
                );
              }}
            />
          )}

          {activeTab === 'solvency_ifrs' && (
            <SolvencyIfrsComplianceView
              evaluation={evaluation}
              bootstrap={bootstrapResult}
              originLabels={activeDataset.originLabels}
              iterations={bootstrapIterations}
              seed={bootstrapSeed}
              discountRate={discountRate}
              onDiscountRateChange={(rate) => {
                setDiscountRate(rate);
                appendAuditLog(
                  'TAIL',
                  `Discount Rate → ${(rate * 100).toFixed(2)}%`,
                  `Updated Solvency II / IFRS 17 risk-free discount yield.`
                );
              }}
              onRunSimulation={(iters, nextSeed) => {
                setIsSimulatingBootstrap(true);
                setBootstrapIterations(iters);
                setBootstrapSeed(nextSeed);
                setTimeout(() => setIsSimulatingBootstrap(false), 120);
                appendAuditLog(
                  'AUTO',
                  `Resimulated ODP Bootstrap for Solvency II SCR (${iters.toLocaleString()} runs)`,
                  `Updated SCR (99.5% VaR) & IFRS 17 Fulfilment Cash Flows.`
                );
              }}
              unitConfig={unitConfig}
            />
          )}

          {activeTab === 'audit' && (
            <AuditAndReportView
              evaluation={evaluation}
              lineOfBusinessLabel={activeDataset.lineOfBusinessLabel}
              selectedMode={selectedMode}
              tailFactor={tailFactor}
              aprioriElr={aprioriElr}
              bfWeight={bfWeight}
              benktanderIterations={benktanderIterations}
              discountRate={discountRate}
              excludedCells={excludedCells}
              manualLdfOverrides={manualLdfOverrides}
              selectedMethodByOrigin={selectedMethodByOrigin}
              onImportCustomCsv={(parsed) =>
                handleApplyDirectTriangle({
                  ...parsed,
                  label: 'Direct CSV/Excel Import',
                })
              }
              onOpenUniversalMapper={() => {
                setSchemaMapperInitialTab('loss');
                setIsSchemaMapperOpen(true);
              }}
              unitConfig={unitConfig}
            />
          )}
        </main>
      </div>

      {/* Universal CSV / Excel Schema Mapper & Direct Triangle Modal */}
      <CsvSchemaMapperModal
        isOpen={isSchemaMapperOpen}
        initialMode={schemaMapperInitialTab}
        existingRecords={
          customFactRecords && customFactRecords.length > 0
            ? customFactRecords
            : getDefaultMultiSegmentFactStore()
        }
        onClose={() => setIsSchemaMapperOpen(false)}
        onIngestMappedDataset={({
          records,
          summaryText,
          availableGranularities,
        }) => {
          setCustomFactRecords(records);
          setCustomDataset(null);
          setCustomDatasetBanner(summaryText);
          if (
            availableGranularities.length > 0 &&
            !availableGranularities.includes(granularity)
          ) {
            setGranularity(availableGranularities[0]);
          }
          appendAuditLog(
            'SEGMENT',
            'Ingested Custom Dataset via Universal Studio',
            summaryText
          );
        }}
        onJoinSeparatePremiumDataset={({ updatedRecords, summaryText }) => {
          setCustomFactRecords(updatedRecords);
          setCustomDatasetBanner(summaryText);
          appendAuditLog(
            'SEGMENT',
            'Joined Separate Premium / Exposure Table',
            summaryText
          );
        }}
        onApplyDirectTriangle={(direct) => {
          handleApplyDirectTriangle(direct);
        }}
      />

      {/* Slide-Over Audit Trail Drawer */}
      <AuditTrailSidebar
        isOpen={isAuditDrawerOpen}
        logs={auditLogs}
        onClose={() => setIsAuditDrawerOpen(false)}
        onClearLogs={() => setAuditLogs([])}
      />

      {/* Server Database & Closing Snapshot History / Bridge Comparison Modal */}
      {isServerDbModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl max-w-4xl w-full max-h-[88vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 bg-[#0072c6] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5" />
                <div>
                  <h3 className="text-sm font-bold">
                    Server Database & Closing Snapshot History (サーバー自動保存DB・決算履歴比較)
                  </h3>
                  <p className="text-[11px] text-sky-100">
                    Storage: <code>.actuarial-data/projects-db.json</code> · Status:{' '}
                    <strong>{backendSyncBadge}</strong> ({serverSnapshots.length}{' '}
                    snapshots persisted)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsServerDbModalOpen(false)}
                className="px-2.5 py-1 rounded bg-white/15 hover:bg-white/25 text-xs font-semibold cursor-pointer"
              >
                Close (閉じる)
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 text-xs">
              {/* Save New Official Closing Snapshot */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1 min-w-[240px]">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Commit New Official Closing Snapshot to Server DB (決算スナップショット登録)
                  </label>
                  <input
                    type="text"
                    value={newSnapshotName}
                    onChange={(e) => setNewSnapshotName(e.target.value)}
                    placeholder={`例: ${valuationMonth} Q4 本決算確定 (${lineOfBusiness.toUpperCase()})`}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateServerSnapshot}
                  className="px-4 py-2 rounded bg-[#0072c6] hover:bg-[#005a9e] text-white font-bold cursor-pointer shrink-0"
                >
                  Save Snapshot to Server DB
                </button>
              </div>

              {/* Two-Snapshot Closing Bridge Comparison (前期 vs 当期 IBNR / Ultimate 増減ブリッジ) */}
              {(() => {
                const baselineSnap =
                  serverSnapshots.find((s) => s.id === compareSnapshotId) ??
                  serverSnapshots[0];
                if (!baselineSnap) return null;
                const dPaid =
                  evaluation.totals.latestLoss -
                  baselineSnap.summaryMetrics.latestPaid;
                const dIbnr =
                  evaluation.totals.selectedIbnr -
                  baselineSnap.summaryMetrics.selectedIbnr;
                const dUlt =
                  evaluation.totals.selectedUltimate -
                  (baselineSnap.summaryMetrics?.selectedUltimate ?? 0);
                const dPv =
                  evaluation.cashflowProjection.totalDiscountedPv -
                  (baselineSnap.summaryMetrics?.discountedReservePv ??
                    baselineSnap.summaryMetrics?.discountedPv ??
                    0);

                return (
                  <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        Closing Bridge Comparison: Active Live Workspace vs. Baseline Snapshot (決算ブリッジ比較)
                      </span>
                      <select
                        aria-label="Baseline Snapshot for Bridge Comparison"
                        value={baselineSnap.id}
                        onChange={(e) => setCompareSnapshotId(e.target.value)}
                        className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold text-xs"
                      >
                        {serverSnapshots.map((s) => (
                          <option key={s.id} value={s.id}>
                            比較基準: {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
                      <div className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-500">
                          Δ Latest Paid Loss
                        </div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {dPaid >= 0 ? '+' : ''}
                          {formatScaledNumber(dPaid, unitConfig)}{' '}
                          {unitConfig.badge}
                        </div>
                      </div>
                      <div className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-500">
                          Δ Selected IBNR Reserve
                        </div>
                        <div
                          className={`text-sm font-bold ${
                            dIbnr >= 0 ? 'text-amber-600' : 'text-emerald-600'
                          }`}
                        >
                          {dIbnr >= 0 ? '+' : ''}
                          {formatScaledNumber(dIbnr, unitConfig)}{' '}
                          {unitConfig.badge}
                        </div>
                      </div>
                      <div className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-500">
                          Δ Selected Ultimate Loss
                        </div>
                        <div className="text-sm font-bold text-[#0072c6]">
                          {dUlt >= 0 ? '+' : ''}
                          {formatScaledNumber(dUlt, unitConfig)}{' '}
                          {unitConfig.badge}
                        </div>
                      </div>
                      <div className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-500">
                          Δ Discounted PV Reserve
                        </div>
                        <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                          {dPv >= 0 ? '+' : ''}
                          {formatScaledNumber(dPv, unitConfig)}{' '}
                          {unitConfig.badge}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Persisted Server DB Snapshots Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                      <th className="py-2 px-3">Snapshot Name</th>
                      <th className="py-2 px-2">Valuation / LOB / Layer</th>
                      <th className="py-2 px-2 text-right">Selected IBNR</th>
                      <th className="py-2 px-2 text-right">Selected Ultimate</th>
                      <th className="py-2 px-2 text-right">Saved At</th>
                      <th className="py-2 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serverSnapshots.map((snap) => (
                      <tr
                        key={snap.id}
                        className="border-b border-slate-200/70 dark:border-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                          {snap.name}
                          {snap.id === 'autosave-latest' && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9px] font-mono">
                              AUTO-SAVE
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 font-mono text-slate-600 dark:text-slate-400">
                          {snap.valuationMonth} · {snap.lineOfBusiness} ·{' '}
                          {(
                            snap.reinsuranceBasis ??
                            snap.layerMode ??
                            'GROSS'
                          )
                            .toString()
                            .toUpperCase()}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-[#0072c6]">
                          {formatScaledNumber(
                            snap.summaryMetrics?.selectedIbnr ?? 0,
                            unitConfig
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {formatScaledNumber(
                            snap.summaryMetrics?.selectedUltimate ?? 0,
                            unitConfig
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-slate-500">
                          {(snap.updatedAt ?? snap.savedAt ?? '')
                            .slice(0, 19)
                            .replace('T', ' ')}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              handleRestoreServerSnapshot(snap);
                              setIsServerDbModalOpen(false);
                            }}
                            className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold cursor-pointer"
                          >
                            Restore (復元)
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
