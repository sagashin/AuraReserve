import { NextRequest, NextResponse } from 'next/server';
import { runAutoOptimizeReserve, ActuarialInput } from '@/lib/actuarial-engine';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ActuarialInput;
    const recommendation = runAutoOptimizeReserve(body);
    return NextResponse.json(recommendation);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to run Auto-Optimize Reserve';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
