import { NextRequest, NextResponse } from 'next/server';
import { evaluateActuarialModel, ActuarialInput } from '@/lib/actuarial-engine';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ActuarialInput;
    const result = evaluateActuarialModel(body);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to evaluate actuarial model';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
