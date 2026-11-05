import { NextRequest, NextResponse } from 'next/server';
import {
  evaluateTriangleActuarial,
  ActuarialInputConfig,
  LdfAverageMode,
  MethodSelection,
} from '@/lib/actuarial-engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const config: ActuarialInputConfig = {
      originLabels: body.originLabels ?? [],
      devPeriods: body.devPeriods ?? [],
      triangle: body.triangle ?? [],
      incurredTriangle: body.incurredTriangle,
      claimCountTriangle: body.claimCountTriangle,
      earnedPremium: body.earnedPremium ?? [],
      exposureCount: body.exposureCount,
      aprioriElr: typeof body.aprioriElr === 'number' ? body.aprioriElr : 0.72,
      selectedMode: (body.selectedMode as LdfAverageMode) ?? 'vw_all',
      manualLdfOverrides: body.manualLdfOverrides ?? {},
      tailFactor: typeof body.tailFactor === 'number' ? body.tailFactor : 1.0,
      excludedCells: body.excludedCells ?? [],
      selectedMethodByOrigin:
        (body.selectedMethodByOrigin as Record<number, MethodSelection>) ?? {},
      manualUltimates: body.manualUltimates ?? {},
      bfWeight: typeof body.bfWeight === 'number' ? body.bfWeight : 0.5,
      benktanderIterations:
        typeof body.benktanderIterations === 'number' ? body.benktanderIterations : 2,
      discountRate: typeof body.discountRate === 'number' ? body.discountRate : 0.02,
    };

    const evaluation = evaluateTriangleActuarial(config);
    return NextResponse.json({
      ...evaluation,
      engineStatus: 'online',
      evaluatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Evaluation failed' },
      { status: 400 }
    );
  }
}
