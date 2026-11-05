import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface ServerProjectSnapshot {
  id: string;
  name: string;
  isAutoSave: boolean;
  valuationMonth: string;
  granularity: string;
  lineOfBusiness: string;
  layerMode: string;
  updatedAt: string;
  locked: boolean;
  summaryMetrics: {
    latestPaid: number;
    caseReserveOs: number;
    selectedIbnr: number;
    selectedUltimate: number;
    discountedReservePv: number;
    mackTotalSe: number;
  };
  statePayload: Record<string, unknown>;
}

interface ProjectsDatabaseFile {
  version: string;
  updatedAt: string;
  snapshots: ServerProjectSnapshot[];
}

const DB_DIR = path.join(process.cwd(), '.actuarial-data');
const DB_FILE = path.join(DB_DIR, 'projects-db.json');

async function readDb(): Promise<ProjectsDatabaseFile> {
  try {
    await fs.mkdir(DB_DIR, { recursive: true });
    const raw = await fs.readFile(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as ProjectsDatabaseFile;
    if (parsed && Array.isArray(parsed.snapshots)) {
      return parsed;
    }
  } catch {
    // Initialize default closing snapshots if DB file doesn't exist yet
  }

  const initialDb: ProjectsDatabaseFile = {
    version: 'AuraReserve-ServerDB-1.0',
    updatedAt: new Date().toISOString(),
    snapshots: [
      {
        id: 'baseline-2026-09-q3',
        name: '2026-09 (Q3 Official Closing Baseline - Auto Liability)',
        isAutoSave: false,
        valuationMonth: '2026-09',
        granularity: 'annual',
        lineOfBusiness: 'auto_liability',
        layerMode: 'GROSS',
        updatedAt: '2026-09-30T15:00:00.000Z',
        locked: true,
        summaryMetrics: {
          latestPaid: 32940000,
          caseReserveOs: 1495000,
          selectedIbnr: 18890000,
          selectedUltimate: 51830000,
          discountedReservePv: 17945500,
          mackTotalSe: 2410000,
        },
        statePayload: {
          valuationMonth: '2026-09',
          granularity: 'annual',
          lineOfBusiness: 'auto_liability',
          selectedMode: 'vw_all',
          tailFactor: 1.018,
          aprioriElr: 0.72,
          discountRate: 0.02,
          excludedCells: [],
          manualLdfOverrides: {},
        },
      },
    ],
  };

  try {
    await fs.writeFile(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
  } catch {
    // Ignore write error on read-only fallback
  }
  return initialDb;
}

async function writeDb(db: ProjectsDatabaseFile): Promise<void> {
  await fs.mkdir(DB_DIR, { recursive: true });
  db.updatedAt = new Date().toISOString();
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

export async function GET() {
  const db = await readDb();
  return NextResponse.json(db);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await readDb();

    const isAutoSave = Boolean(body.isAutoSave);
    const id = isAutoSave
      ? 'autosave-latest'
      : String(body.id || `snap-${Date.now()}`);

    const snapshot: ServerProjectSnapshot = {
      id,
      name: String(
        body.name ||
          (isAutoSave
            ? `Auto-Save (${body.valuationMonth || '2026-10'} · ${body.lineOfBusiness || 'auto_liability'})`
            : `Closing Snapshot ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`)
      ),
      isAutoSave,
      valuationMonth: String(body.valuationMonth || '2026-10'),
      granularity: String(body.granularity || 'annual'),
      lineOfBusiness: String(body.lineOfBusiness || 'auto_liability'),
      layerMode: String(body.layerMode || 'GROSS'),
      updatedAt: new Date().toISOString(),
      locked: Boolean(body.locked),
      summaryMetrics: {
        latestPaid: Number(body.summaryMetrics?.latestPaid ?? 0),
        caseReserveOs: Number(body.summaryMetrics?.caseReserveOs ?? 0),
        selectedIbnr: Number(body.summaryMetrics?.selectedIbnr ?? 0),
        selectedUltimate: Number(body.summaryMetrics?.selectedUltimate ?? 0),
        discountedReservePv: Number(
          body.summaryMetrics?.discountedReservePv ?? 0
        ),
        mackTotalSe: Number(body.summaryMetrics?.mackTotalSe ?? 0),
      },
      statePayload:
        body.statePayload && typeof body.statePayload === 'object'
          ? (body.statePayload as Record<string, unknown>)
          : {},
    };

    const existingIdx = db.snapshots.findIndex((s) => s.id === id);
    if (existingIdx >= 0) {
      db.snapshots[existingIdx] = snapshot;
    } else {
      db.snapshots.unshift(snapshot);
    }

    // Keep at most 30 snapshots
    if (db.snapshots.length > 30) {
      db.snapshots = db.snapshots.slice(0, 30);
    }

    await writeDb(db);
    return NextResponse.json({
      ok: true,
      savedSnapshot: snapshot,
      snapshots: db.snapshots,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to save snapshot',
      },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const db = await readDb();
    if (id) {
      db.snapshots = db.snapshots.filter((s) => s.id !== id || s.locked);
      await writeDb(db);
    }
    return NextResponse.json({ ok: true, snapshots: db.snapshots });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to delete snapshot',
      },
      { status: 400 }
    );
  }
}
