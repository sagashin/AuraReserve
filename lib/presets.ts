export interface DatasetPreset {
  id: string;
  name: string;
  subtitle: string;
  currency: string;
  unitLabel: string;
  originYears: number[];
  devPeriods: number[];
  cumulativeTriangle: (number | null)[][];
  earnedPremium: number[];
  aprioriElr: number[];
}

/**
 * Famous Taylor & Ashe (1983) 10x10 Loss Reserving Triangle
 * Used in Mack (1993) "Distribution-free Calculation of the Standard Error of Chain Ladder Reserve Estimates"
 * and England & Verrall (2002) Stochastic Claims Reserving in General Insurance.
 */
export const TAYLOR_ASHE_1983: DatasetPreset = {
  id: 'taylor-ashe-1983',
  name: 'Taylor & Ashe (1983) — Benchmark 10×10',
  subtitle: 'Classic Mack (1993) & England-Verrall General Liability Triangle',
  currency: '$',
  unitLabel: 'USD',
  originYears: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
  devPeriods: [12, 24, 36, 48, 60, 72, 84, 96, 108, 120],
  cumulativeTriangle: [
    [357848, 1124788, 1735330, 2218270, 2745596, 3319994, 3466336, 3606286, 3833515, 3901463],
    [352118, 1236139, 2170033, 3353322, 3799067, 4120063, 4647867, 4914039, 5339085, null],
    [290507, 1292306, 2218525, 3235179, 3985995, 4132918, 4628910, 4909315, null, null],
    [310608, 1418858, 2195047, 3757447, 4029929, 4381982, 4588268, null, null, null],
    [443160, 1136350, 2128333, 2897821, 3402672, 3873311, null, null, null, null],
    [396132, 1333217, 2180715, 2985752, 3691712, null, null, null, null, null],
    [440832, 1288463, 2419861, 3483130, null, null, null, null, null, null],
    [359480, 1421128, 2864498, null, null, null, null, null, null, null],
    [376686, 1363294, null, null, null, null, null, null, null, null],
    [344014, null, null, null, null, null, null, null, null, null],
  ],
  earnedPremium: [
    5000000, 6400000, 6200000, 6350000, 5800000,
    6100000, 6650000, 7100000, 7250000, 7500000,
  ],
  aprioriElr: [0.78, 0.82, 0.80, 0.81, 0.78, 0.79, 0.80, 0.82, 0.80, 0.80],
};

/**
 * Commercial Motor / Auto Bodily Injury 10x10 Dataset with realistic shock claims
 */
export const COMMERCIAL_AUTO_BI: DatasetPreset = {
  id: 'commercial-auto-bi',
  name: 'Commercial Fleet Auto BI — 10×10',
  subtitle: 'Long-Tail Commercial Motor Liability with Catastrophic Jury Verdict Outliers',
  currency: '$',
  unitLabel: 'USD (000s)',
  originYears: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
  devPeriods: [12, 24, 36, 48, 60, 72, 84, 96, 108, 120],
  cumulativeTriangle: [
    [14200, 31800, 45900, 56200, 63100, 67800, 70400, 72100, 73200, 73850],
    [15100, 33400, 48200, 59100, 66400, 71200, 74100, 75900, 77050, null],
    [15800, 35200, 51400, 62800, 70500, 75600, 78600, 80450, null, null],
    [16400, 44900, 61200, 73400, 81900, 87400, 90800, null, null, null], // Shock jump at 12-24
    [17200, 38100, 55300, 67900, 76100, 81500, null, null, null, null],
    [14900, 33100, 48400, 59600, 67200, null, null, null, null, null],
    [18300, 40800, 59200, 78900, null, null, null, null, null, null], // Shock jump at 36-48
    [19500, 43400, 63100, null, null, null, null, null, null, null],
    [20800, 46300, null, null, null, null, null, null, null, null],
    [22100, null, null, null, null, null, null, null, null, null],
  ],
  earnedPremium: [
    98000, 103000, 108000, 114000, 118000,
    105000, 122000, 129000, 136000, 144000,
  ],
  aprioriElr: [0.74, 0.74, 0.75, 0.76, 0.75, 0.72, 0.76, 0.77, 0.77, 0.78],
};

/**
 * Japanese Non-Life General Liability / Workers Comp Dataset (JPY Millions)
 */
export const JAPAN_LIABILITY_JPY: DatasetPreset = {
  id: 'japan-casualty-jpy',
  name: 'Tokyo Corporate Casualty — 10×10 (百万円)',
  subtitle: 'Japanese Corporate General & Product Liability Portfolio (JPY Millions)',
  currency: '¥',
  unitLabel: '百万円 (JPY M)',
  originYears: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
  devPeriods: [12, 24, 36, 48, 60, 72, 84, 96, 108, 120],
  cumulativeTriangle: [
    [1850, 4620, 6840, 8390, 9420, 10150, 10620, 10910, 11080, 11190],
    [1920, 4810, 7120, 8750, 9840, 10610, 11100, 11410, 11590, null],
    [2040, 5100, 7560, 9280, 10450, 11260, 11790, 12120, null, null],
    [2110, 5290, 8950, 10720, 11980, 12890, 13480, null, null, null],
    [2230, 5580, 8260, 10150, 11420, 12310, null, null, null, null],
    [2180, 5420, 8040, 9890, 11130, null, null, null, null, null],
    [2350, 5890, 8720, 10740, null, null, null, null, null, null],
    [2490, 6240, 9250, null, null, null, null, null, null, null],
    [2610, 7420, null, null, null, null, null, null, null, null],
    [2750, null, null, null, null, null, null, null, null, null],
  ],
  earnedPremium: [
    15200, 15800, 16500, 17200, 17900,
    17400, 18600, 19500, 20400, 21500,
  ],
  aprioriElr: [0.73, 0.73, 0.74, 0.75, 0.74, 0.73, 0.75, 0.76, 0.76, 0.76],
};

export const DATASET_PRESETS: DatasetPreset[] = [
  TAYLOR_ASHE_1983,
  COMMERCIAL_AUTO_BI,
  JAPAN_LIABILITY_JPY,
];
