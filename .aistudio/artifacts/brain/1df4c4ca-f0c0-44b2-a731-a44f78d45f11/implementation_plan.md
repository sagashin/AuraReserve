# WTW ResQ 100/100 Enterprise Complete — Implementation Plan

決算実務およびWTW ResQ公式仕様（`resq.pdf`）における残りの6点を完全に埋め、**100点満点のエンタープライズ保険数理プラットフォーム**へと完成させるための実装計画です。

---

## User Review & Critical Decisions

> [!IMPORTANT]
> 以下の4つの重点領域（先ほどのご回答で確定いただいた仕様）を統合実装します。内容をご確認の上、問題なければ **Proceed** を押してください。

- **確定仕様 1（Munich Chain Ladder & Paid/Incurred 左右同時評価）**:
  Paid（支払）と Incurred（発生）を同一画面で左右に並べて同時評価し、P/I 比率残差と進展係数残差の相関係数（$\lambda_{\text{Paid}}, \lambda_{\text{Incurred}}$）から Paid CL と Incurred CL の乖離を数理的に収束させる **Munich Chain Ladder（Quarg & Mack 2004）** を実装します。
- **確定仕様 2（非比例再保険 Excess of Loss レイヤー評価）**:
  従来の比例再保険（Quota Share 出再率）に加え、**Excess of Loss（超過損害額再保険：保有額 Retention・限度額 Limit・復元保険料率 Reinstatement %）** の条項設定および Gross / Ceded / Net 自動控除ロジックを実装します。
- **確定仕様 3（ResQ Stochastic 全サブタブ完全実装）**:
  スクリーンショット2枚目の全サブタブ（`Summary`、`Detail`、`Cashflow Summary`、`Origin Correlations`、`Cumulative Probability`、`Fitted Distribution`、`Reserve Development`）にそれぞれ専用のインタラクティブ図表・数理テーブルを実装します。
- **確定仕様 4（サーバー内ローカルファイルDBへの自動保存・履歴比較 API）**:
  外部クラウド設定なしで Git クローン直後から別PCでも即座に動作するサーバーサイド永続化 API（`/api/projects`）を構築し、評価変更時の自動保存・スナップショット履歴管理・過去バージョンとの差分ブリッジ比較を実装します。

---

## 1. Overview & Core Concept

- **What It Does**:
  WTW ResQ デスクトップ版が持つすべての主要モデリング機能（DFM、Berquist-Sherman、PPCI/PPCF、Munich Chain Ladder、比例/非比例再保険 Gross-Ceded-Net、Stochastic 全診断サブタブ、Solvency II / J-ICS / IFRS 17 規制資本、サーバー側自動保存・履歴管理）を単一の統合ワークベンチ上で完結させます。
- **Target Audience / Persona**:
  損害保険会社・再保険会社のチーフアクチュアリー、決算担当数理チーム、ERM（統合リスク管理）部門、および監査法人レビュー担当者。
- **Key Value**:
  Paid と Incurred の最終損害額の乖離問題（Munich CL による解消）、XoL 再保険カバー後のネット所要資本（SCR）の算出、確率論的ランオフ推移の可視化、およびサーバー側自動履歴管理による監査対応力を一気に100点満点の水準へ引き上げます。

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Paid vs. Incurred 左右同時比較 & Munich Chain Ladder フロー**:
     `Ratios` / `Berquist-Sherman / Munich CL` ワークシートまたは `Method Comparison` にて、左側に **Paid Cumulative / Link Ratios**、右側に **Incurred Cumulative / Link Ratios**、中央〜下部に **P/I 残差プロット（傾き $\lambda_P, \lambda_I$）と Munich Chain Ladder 収束結果** を同時表示します。
  2. **非比例再保険（XoL）レイヤー設定フロー**:
     左ペインまたは上部リボンの `Reserving Class (GROSS / CEDED / NET)` から、比例出再率（Quota Share %）に加えて **XoL Retention（保有限度額）**・**XoL Limit（カバー限度額）**・**Reinstatement Rate（復元保険料率）** をスライダーまたは数値入力で即時変更でき、全タブの三角形・IBNR・Stochastic 分布へリアルタイム反映します。
  3. **ResQ Stochastic 全サブタブ探索フロー**:
     `ResQ Stochastic` 画面の3階層タブを切り替えることで、以下の専用ビューをシームレスに表示します：
     - `Fitted Distribution`: シアン色ヒストグラム＋事故年度ファンチャート（既存・ResQ完全準拠）
     - `Cumulative Probability`: 累積確率分布（S字 CDF カーブ）と任意の信頼水準（75%, 85%, 99.5%）のクロスヘア照会
     - `Origin Correlations`: 事故年度間・種目間の相関マトリクス（ヒートマップ）と分散効果（Diversification Benefit）の定量表示
     - `Cashflow Summary`: 確率論的キャッシュフローの将来カレンダー年度別パーセンタイル推移と割引現在価値（Discounted PV）分布
     - `Reserve Development`: 将来進展年度にわたる未払準備金ランオフ・コーン（Stochastic Run-Off Fan Chart）
  4. **サーバー自動保存・バージョン履歴比較フロー**:
     画面上部リボンの `Connect` / `Project` グループにサーバー同期インジケーター（`Auto-Saved to Server DB`）を表示し、1クリックで過去の保存スナップショット一覧の呼び出し・復元・二時点間 IBNR ブリッジ比較を行えます。

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: WTW ResQ オフィス・デスクトップ標準のクリーンなライトUI（`#f3f4f6` リボン背景、`#0072c6` コーポレートブルーアクセント、高密度スプレッドシートグリッド）。
  - *Color Palette & Mood*:
    - 60% Neutral Canvas: ホワイト（`#ffffff`）およびクールグレー（`#f8fafc`, `#e6e6e6`）
    - 30% Structural Surfaces: スプレッドシート見出し（`#d9d9d9`）、平均LDF選択行（オリーブ `#c3d69b`）、手動入力行（ライトシアン `#b7dee8`）、最終選択行（ピーチ `#fcd5b4`）
    - 10% Semantic Accents: 高LDFセル（コーラルレッド `#f87171`）、低LDFセル（ミントグリーン `#22c55e`）、確率密度バー（シアン `#00ffff`）
  - *Typography & Hierarchy*: 見出し・UIラベルに `Plus Jakarta Sans`、すべての数理マトリクス・金額・LDF・残差には等幅フォント `JetBrains Mono`（`tabular-nums`）を厳格に適用し、桁揃えを保証します。
  - *Component Styling & Layout*: 1440px デスクトップ基準のフルワイド・スプリットペイン設計。高密度テーブル（行高 28px〜34px）と右ペインのリアルタイム Recharts グラフを並列配置します。

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Munich Chain Ladder（Quarg & Mack 2004）の厳密な残差回帰実装**
  - *Chosen Approach*: 各セル $(i, j)$ における Paid 進展残差と $(I/P)$ 残差の原点通過最小二乗回帰から $\lambda_P$ を推定し、同様に Incurred 進展残差と $(P/I)$ 残差から $\lambda_I$ を推定して、Paid LDF と Incurred LDF を事故年度ごとに動的補正します。
  - *Why*: 単純な Paid CL と Incurred CL の加重平均ではなく、ケースリザーブの積み方の強弱（P/I 比率の高低）を翌期以降の進展係数へ数理的にフィードバックできるため、WTW ResQ の中核機能を完全に再現できます。
- **Decision 2: サーバー内ローカルファイルDB（JSON ストア）による自動保存アーキテクチャ**
  - *Chosen Approach*: Next.js Route Handler（`/api/projects`）がワークスペース内のローカル永続化ファイル（`.resq-data/projects-db.json`）へ自動保存・スナップショット管理を行い、フロントエンドのデバウンス自動保存と連動させます。
  - *Why*: 外部データベースや API キーの設定が一切不要であり、別PCへ Git クローンして `npm run dev` を起動した瞬間からバックエンド永続化が100%確実に機能します。

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                     WTW ResQ Desktop Ribbon & Menu Header                        │
│  [FILE | HOME | ADMINISTRATION | RESERVING | EDITING | FINANCIAL REPORTING | VIEW]│
│  + Auto-Save Server Status Badge & Version History / Snapshot Diff Modal         │
└───────────────────┬──────────────────────────────────────────┬───────────────────┘
                    │                                          │
                    ▼                                          ▼
┌─────────────────────────────────────────┐  ┌─────────────────────────────────────┐
│   Reinsurance Treaty & Layer Engine     │  │   Next.js Server Persistence API    │
│  • Gross / Ceded / Net Switch           │  │  • GET / POST / DELETE /api/projects│
│  • Quota Share % + XoL (Retention/Limit)│  │  • Auto-Save Debounce & Snapshots   │
│  • Reinstatement Premium Calculation    │  │  • Local Disk DB (.resq-data/*.json)│
└───────────────────┬─────────────────────┘  └─────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                  Core 64-Bit Actuarial & Stochastic Engine                       │
│  ┌─────────────────────────────────────┐  ┌────────────────────────────────────┐ │
│  │ Deterministic & Dual-Track Methods  │  │ Stochastic & ERM Compliance Suite  │ │
│  │ • Paid & Incurred Simultaneous DFM  │  │ • Fitted PDF (Cyan) & Origin Fan   │ │
│  │ • Munich Chain Ladder (λ_P, λ_I)    │  │ • Cumulative Probability (S-Curve) │ │
│  │ • Berquist-Sherman & PPCI / PPCF    │  │ • Origin Correlation Matrix & Div. │ │
│  │ • CL / BF / CC / Benktander / F×S   │  │ • Reserve Development Run-Off Cone │ │
│  └─────────────────────────────────────┘  └────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State
- **MunichChainLadderResult**:
  - `lambdaPaid`: Paid 進展残差に対する $(I/P)$ 残差の回帰係数
  - `lambdaIncurred`: Incurred 進展残差に対する $(P/I)$ 残差の回帰係数
  - `rows`: 各事故年度の Paid CL Ultimate、Incurred CL Ultimate、Munich Paid Ultimate、Munich Incurred Ultimate、P/I Ratio、収束ギャップ縮小率
- **ReinsuranceTreatyConfig**:
  - `layerMode`: `'GROSS' | 'CEDED' | 'NET'`
  - `quotaSharePct`: 比例出再率（0%〜90%）
  - `xolEnabled`: 非比例超過損害額再保険（XoL）の有効フラグ
  - `xolRetention`: 保有限度額（Priority / Retention）
  - `xolLimit`: カバー限度額（Limit）
  - `reinstatementRatePct`: 復元保険料率（%）
- **ServerProjectSnapshot**:
  - `id`, `name`, `valuationMonth`, `lineOfBusiness`, `updatedAt`, `locked`, `summaryMetrics`（Paid, OS, Selected IBNR, Ultimate, SCR）, `statePayload`

### Interactive Component & State Mapping
- **Paid vs. Incurred 左右同時比較 & Munich CL タブ**:
  - ユーザーがセル除外や平均LDFモードを変更すると、Paid 三角形・Incurred 三角形・P/I 比率マトリクス・Munich CL 回帰直線（$\lambda_P, \lambda_I$）および事故年度別 Munich CL 最終損害額がリアルタイムに再計算されます。
- **ResQ Stochastic サブタブ群**:
  - `Summary` / `Detail`: 全パーセンタイル・VaR・TVaR・事故年度別 Mack / Merz-Wüthrich / Bootstrap 比較表
  - `Cashflow Summary`: 将来カレンダー年度別の名目/割引キャッシュフロー確率分布グラフとテーブル
  - `Origin Correlations`: 事故年度間の相関行列（相関係数 $\rho_{i,k}$ 調整スライダー付き）とポートフォリオ分散効果（Diversification Benefit）の算出
  - `Cumulative Probability`: 累積確率 S字カーブ（0%〜99.9%）とターゲット確率水準スライダー
  - `Reserve Development`: 将来進展年度（$t = +1 \dots +10$）にわたる未払準備金ランオフ・ファンチャート
- **サーバー自動保存・バージョン履歴モーダル**:
  - 状態変更時に 1.5秒デバウンスで `POST /api/projects` へ自動保存し、上部リボンの `Connect / Server DB` ボタンから保存済みスナップショット一覧の閲覧・1クリック復元・二時点間ブリッジ比較を実行します。
