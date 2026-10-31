# Implementation Plan — Final Polish: Full Display Unit Synchronization, Multi-Sheet Excel Workbook Export (.xlsx), & Cleaned/Joined Dataset Export

## 1. Goal & Scope
Complete the remaining workflow and consistency items identified during the full application audit so that **AuraReserve** handles end-to-end data ingestion, unit scaling, analysis, and multi-sheet Excel reporting seamlessly:

1. **Full Display Unit Synchronization (`千円` / `百万円` / `億円` / `円` / `$ USD`) & Dynamic Audit Period Labels**:
   - Ensure `segmentRollupRows` (Table 04 in `PYD & Segments`) and its baseline/current IBNR, Ultimate, Earned Premium, PYD, and Mack SE values scale in exact lockstep with the selected `DisplayUnitSpec.divisor` (`1`, `1,000`, `1,000,000`, `100,000,000`) when `analysisMetric !== 'claim_count'`.
   - Replace hardcoded `> 100` denominator thresholds (`sumIbnr2025 > 100`, `segIbnr2025Prior > 100`) with scale-aware relative thresholds (`Math.abs(denom) > 1e-6`) so PYD % (`pydPctOf2025Reserve`, `pydPctOfPriorReserve`) remains exact even when displayed in `百万円` (`10^6`) or `億円` (`10^8`).
   - Update the PYD Diverging Bar Chart (`02. Prior Year Development by Origin Period`) so bar value labels adapt cleanly to the active display unit instead of hardcoding `/ 1000` + `k`.
   - Update `AuditAndReportView` (`auditMemoMarkdown`) so all section titles, narrative bullets, and markdown table headers dynamically reflect `pydAnalysis.baselineValuationLabel`, `pydAnalysis.currentValuationLabel`, and `pydAnalysis.priorCutoffLabel` instead of fixed `2025-12` / `2026` labels.

2. **Multi-Sheet Actuarial Excel Workbook Export (`.xlsx`)**:
   - Build a dedicated client-side `.xlsx` workbook generator (`exportActuarialWorkbookXlsx` using SheetJS `xlsx`) accessible from `AuditAndReportView` (and quick-exportable from the workspace):
     - **Sheet 1 (`01_Triangle_And_LDFs`)**: Cumulative Triangle (`C_i,j`), Incremental Triangle (`I_i,j`), Full Projected Triangle, Age-to-Age Link Ratios (`f_i,j`), Excluded Outlier Masks, LDF Averages (`VW All`, `VW 5p`, `VW 3p`, `Simple All`, `Medial`), Selected LDFs, Tail Factor, and Cumulative CDFs.
     - **Sheet 2 (`02_Method_Comparison`)**: Cohort-by-cohort Earned Premium / Exposure, A Priori ELR, Latest Cumulative, Selected CDF, Chain Ladder (`CL`), Bornhuetter-Ferguson (`BF`), Cape Cod (`CC`), Selected Method/Weights, Selected IBNR, Selected Ultimate, Ultimate Loss Ratio, and Mack SE.
     - **Sheet 3 (`03_PYD_Cohort_Runoff`)**: Origin Period PYD & Actual vs. Expected (AvE) Emergence decomposition (`Baseline Paid`, `Baseline IBNR`, `Baseline Ultimate`, `Actual Δ`, `Expected Δ`, `AvE Diff`, `Current Paid`, `Current IBNR`, `Current Ultimate`, `PYD`, `PYD %`).
     - **Sheet 4 (`04_Segment_Attribution`)**: Multi-Dimensional Segment Roll-Up & PYD Attribution across all dynamic segment columns (`dimensions`), Earned Premium, Baseline IBNR, Actual/Expected Emergence, Current Prior/New/Total IBNR, Ultimate LR, PYD, and Mack SE.
     - **Sheet 5 (`05_Stochastic_And_Audit`)**: ODP Bootstrap summary percentiles (`P50`, `P75 IFRS 17 Risk Adjustment`, `P90`, `P95`, `P99.5 Solvency II VaR`) and the chronological Governance & Audit Trail log.

3. **Cleaned & Joined Normalized Dataset Export (`.csv` & `.xlsx`)**:
   - Allow users to export the **cleaned, date-normalized, interior-gap-filled, and separate-premium-joined `MultiSegmentFactRecord[]` dataset** at any time (both from `AuditAndReportView` and directly inside `CsvSchemaMapperModal`) as either:
     - **Normalized Long Tidy CSV (`.csv`)** or **Excel (`.xlsx`)**: Contains all dynamic segment columns, `Granularity`, `OriginPeriod`, `DevLagMonths`, `CumulativePaid`, `CumulativeIncurred`, `CumulativeClaimCount`, `ImpliedSeverity`, `EarnedPremium`, `EarnedExposure`, and `APrioriELR`.
     - **Normalized Wide Matrix Pivot Excel (`.xlsx`)**: Contains the clean wide pivot triangles for Paid, Incurred, and Claim Count alongside the joined Earned Premium and Exposure columns so actuaries can archive or share the pre-processed data table immediately.

---

## 2. Planned File Changes

### A. `/lib/segment-pyd-engine.ts`
- Update `computePriorYearDevelopmentAndRollup` to accept an optional `displayDivisor: number = 1` parameter (or infer scale from `activeSlice`) and apply `displayDivisor` when pivoting `sliceCurr` and `sliceBase` for each segment in `segmentRollupRows`.
- Replace `> 100` denominator checks (`sumIbnr2025 > 100`, `sumUlt2025 > 100`, `segIbnr2025Prior > 100`, `ibnr2025End > 100`) with `Math.abs(denom) > 1e-6` so percentage ratios (`pydPctOf2025Reserve`, `pydPctOfPriorReserve`) remain invariant across all display units (`円`, `千円`, `百万円`, `億円`, `$ USD`).

### B. `/lib/workbook-export.ts` (New Helper Module)
- Implement browser-local export functions using `xlsx`:
  - `exportActuarialValuationWorkbookXlsx(...)`: Generates and triggers download of the 5-sheet `.xlsx` actuarial evaluation & PYD workbook.
  - `exportNormalizedFactDatasetCsv(...)`: Exports the cleaned, date-normalized, and premium-joined `MultiSegmentFactRecord[]` store for the active granularity as a UTF-8 BOM CSV (Excel-safe for Japanese characters).
  - `exportNormalizedFactDatasetXlsx(...)`: Exports the cleaned & joined dataset as a 2-sheet `.xlsx` file (`Normalized_Long_Tidy` and `Normalized_Wide_Matrix`).

### C. `/components/PriorYearDevAndSegmentsView.tsx`
- Update Chart 2 (`02. Prior Year Development (PYD) by Origin Period`) bar value labels so that when values are already scaled (e.g., `千円`, `百万円`, `億円`, or `< 10,000`), it formats with `formatNumber(Math.round(val))` instead of dividing by `1000` and appending `k`.

### D. `/components/AuditAndReportView.tsx` & `/components/CsvSchemaMapperModal.tsx` & `/app/page.tsx`
- Pass `displayDivisor` from `/app/page.tsx` into `computePriorYearDevelopmentAndRollup`.
- Pass `factStore`, `activeGranularity`, and `displayUnitSpec` into `AuditAndReportView`.
- Update `AuditAndReportView` with:
  - Dynamic period labels (`pydAnalysis.baselineValuationLabel`, `pydAnalysis.currentValuationLabel`, `pydAnalysis.priorCutoffLabel`) in `auditMemoMarkdown`.
  - **Download Multi-Sheet Excel Workbook (`.xlsx`)** button alongside the existing single-sheet CSV export.
  - **Download Cleaned & Joined Normalized Dataset (`.xlsx` / `.csv`)** buttons so users can save the unified dataset after joining separate premium/exposure tables and normalizing Wareki/Japanese dates.
- Add a quick **"Export Cleaned & Joined Preview (.xlsx)"** button in `CsvSchemaMapperModal` footer when data is loaded.

---

## 3. Verification Plan
1. **Unit Tests (`lib/segment-pyd-engine.test.ts`)**:
   - Verify that `computePriorYearDevelopmentAndRollup` with `displayDivisor = 1000` (`千円`) and `1000000` (`百万円`) scales `segmentRollupRows` identically to `priorTotals` and preserves exact `pydPctOf2025Reserve` and `pydPctOfPriorReserve` percentages.
   - Verify workbook generation buffers from `lib/workbook-export.ts` contain all 5 sheets and valid normalized rows.
2. **Build & Browser Verification**:
   - Run `compile_applet` and `restart_dev_server`.
   - Verify in headless Chromium (`playwright-cli`) that switching units (`¥ (千円)` / `¥ (百万円)`) updates `segmentRollupRows` and PYD bar labels cleanly, and that the new `.xlsx` and normalized dataset export buttons render and execute with zero console errors.
