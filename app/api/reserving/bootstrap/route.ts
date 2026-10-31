import { NextRequest, NextResponse } from 'next/server';
import { runOdpBootstrapSimulation, ActuarialInput } from '@/lib/actuarial-engine';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      input: ActuarialInput;
      iterations?: number;
      seed?: number;
    };
    const result = runOdpBootstrapSimulation(
      body.input,
      body.iterations ?? 2000,
      body.seed ?? 20261030
    );
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to run ODP Bootstrap simulation';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
