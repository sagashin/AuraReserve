# Actuarial & Engineering Rules for Antigravity Agents

1. **Zero-Division & NaN Handling**:
   - トライアングルの右下半分（未経過の将来期間）は必ず `None` または `NaN` (`null`) として扱い、`0` と混同しないこと。
   - 累積損害額 $C_{i, j} = 0$ の場合のLink Ratio計算ではゼロ除算エラーを防ぎ、安全に `NaN`（計算対象外）として処理すること。
2. **Numerical Precision**:
   - 進展係数（LDF / CDF）は内部計算では64bit浮動小数点（`float64`）の精度を完全に保ち、UI表示時のみ小数点以下3桁〜4桁（例: `1.234`）にフォーマットすること。丸めた後の値で掛け算を行わないこと。
3. **Spreadsheet UX**:
   - テーブルの数値はすべて右揃え（`text-right`）かつ等幅フォント（`font-mono` / `tabular-nums`）を使用し、桁が綺麗に揃うようにスタイリングすること。
4. **Error Handling**:
   - Display clear visual indicators for invalid or missing calculations.
