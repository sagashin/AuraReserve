import fs from 'fs';
import path from 'path';

export interface ResQProjectSnapshot {
  id: string;
  name: string;
  valuationMonth: string;
  granularity: string;
  lineOfBusiness: string;
  selectedMode: string;
  tailFactor: number;
  aprioriElr: number;
  bfWeight: number;
  benktanderIterations: number;
  discountRate: number;
  excludedCells: string[];
  manualLdfOverrides: Record<number, number>;
  selectedMethodByOrigin: Record<number, string>;
  manualUltimates: Record<number, number>;
  customDatasetLabel?: string | null;
  customRecordsCount?: number;
  customTriangleOverride?: {
    originLabels: string[];
    devPeriods: number[];
    triangle: (number | null)[][];
    earnedPremium: number[];
    exposureCount?: number[];
    aprioriElr?: number;
    label?: string;
  } | null;
  updatedAt: string;
}

export interface ResQWorkspaceState {
  activeProjectId: string;
  projects: ResQProjectSnapshot[];
  auditLogs: {
    id: string;
    timestamp: string;
    category: string;
    title: string;
    detail: string;
    impactDelta?: string;
  }[];
  lastSavedAt: string;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'actuarial-workspace.json');

const DEFAULT_WORKSPACE: ResQWorkspaceState = {
  activeProjectId: 'proj-fy2026-q3',
  projects: [
    {
      id: 'proj-fy2026-q3',
      name: 'Master Reserve Study — FY2026 Close',
      valuationMonth: '2026-10',
      granularity: 'annual',
      lineOfBusiness: 'auto_liab',
      selectedMode: 'vw_all',
      tailFactor: 1.018,
      aprioriElr: 0.72,
      bfWeight: 0.5,
      benktanderIterations: 2,
      discountRate: 0.02,
      excludedCells: [],
      manualLdfOverrides: {},
      selectedMethodByOrigin: {},
      manualUltimates: {},
      customDatasetLabel: null,
      customRecordsCount: 0,
      customTriangleOverride: null,
      updatedAt: new Date().toISOString(),
    },
  ],
  auditLogs: [],
  lastSavedAt: new Date().toISOString(),
};

export function loadResQWorkspace(): ResQWorkspaceState {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return DEFAULT_WORKSPACE;
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ResQWorkspaceState>;
    if (!parsed.projects || !Array.isArray(parsed.projects) || parsed.projects.length === 0) {
      return DEFAULT_WORKSPACE;
    }
    return {
      activeProjectId: parsed.activeProjectId || parsed.projects[0].id,
      projects: parsed.projects,
      auditLogs: parsed.auditLogs || [],
      lastSavedAt: parsed.lastSavedAt || new Date().toISOString(),
    };
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

export function saveResQWorkspace(nextState: Partial<ResQWorkspaceState>): ResQWorkspaceState {
  const current = loadResQWorkspace();
  const merged: ResQWorkspaceState = {
    activeProjectId: nextState.activeProjectId ?? current.activeProjectId,
    projects: nextState.projects ?? current.projects,
    auditLogs: nextState.auditLogs ?? current.auditLogs,
    lastSavedAt: new Date().toISOString(),
  };

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist workspace to disk:', err);
  }

  return merged;
}
