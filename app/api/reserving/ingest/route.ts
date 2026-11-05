import { NextRequest, NextResponse } from 'next/server';
import {
  parseTextToRawGrid,
  inspectUniversalLossGrid,
  ingestUniversalLossGrid,
  extractDirectTriangleFromGrid,
} from '@/lib/universal-data-parser';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode: 'universal' | 'direct_triangle' = body.mode || 'universal';

    let grid: string[][] = body.grid ?? [];
    let suggestedHeaderRowIndex =
      typeof body.headerRowIndex === 'number' ? body.headerRowIndex : 0;

    if ((!grid || grid.length === 0) && typeof body.rawText === 'string') {
      const parsed = parseTextToRawGrid(body.rawText);
      grid = parsed.grid;
      if (typeof body.headerRowIndex !== 'number') {
        suggestedHeaderRowIndex = parsed.suggestedHeaderRowIndex;
      }
    }

    if (!grid || grid.length === 0) {
      return NextResponse.json(
        { error: 'No data grid or text provided to ingest.' },
        { status: 400 }
      );
    }

    if (mode === 'direct_triangle') {
      const direct = extractDirectTriangleFromGrid(
        grid,
        suggestedHeaderRowIndex,
        body.unitMultiplier ?? 1
      );
      return NextResponse.json({
        status: 'ok',
        mode: 'direct_triangle',
        directTriangle: direct,
      });
    }

    const inspect = body.config || inspectUniversalLossGrid(grid, suggestedHeaderRowIndex);
    const result = ingestUniversalLossGrid(
      grid,
      suggestedHeaderRowIndex,
      inspect,
      body.valuationLabel || 'Server-Ingested'
    );

    return NextResponse.json({
      status: 'ok',
      mode: 'universal',
      headerRowIndex: suggestedHeaderRowIndex,
      inspect,
      result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Data ingestion failed' },
      { status: 400 }
    );
  }
}
