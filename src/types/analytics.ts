export interface MonthlyStats {
  month: string;
  totalSpent: bigint;
  expenseCount: number;
  categoryBreakdown: CategoryStat[];
  topItems: ItemStat[];
  previousMonthTotal?: bigint;
  trendPercentage?: number;
}

export interface CategoryStat {
  name: string;
  amount: bigint;
  percentage: number;
  itemCount: number;
}

export interface ItemStat {
  name: string;
  amount: bigint;
  count: number;
  avgPrice: bigint;
}

export interface PriceTrend {
  itemName: string;
  currentPrice: bigint;
  previousPrice: bigint;
  percentChange: number;
  daysAnalyzed: number;
  trend: 'up' | 'down' | 'stable';
}

export interface CategoryInflation {
  categoryName: string;
  percentChange: number;
  daysAnalyzed: number;
}

export interface StorePriceComparison {
  itemName: string;
  stores: StorePriceStat[];
}

export interface StorePriceStat {
  storeName: string;
  averagePrice: bigint;
  lowestPrice: bigint;
  highestPrice: bigint;
}
