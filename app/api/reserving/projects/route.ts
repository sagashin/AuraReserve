import { NextRequest, NextResponse } from 'next/server';
import { loadResQWorkspace, saveResQWorkspace } from '@/lib/resq-backend-store';

export async function GET() {
  try {
    const workspace = loadResQWorkspace();
    return NextResponse.json({
      status: 'ok',
      engine: 'AuraReserve Actuarial Server Engine v3.2',
      workspace,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load workspace' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const updated = saveResQWorkspace(body);
    return NextResponse.json({
      status: 'saved',
      workspace: updated,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save workspace' },
      { status: 400 }
    );
  }
}
