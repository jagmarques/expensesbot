import { getDatabase } from '../database/db';
import { PriceTrend, CategoryInflation, StorePriceComparison } from '../../types/analytics';

export function calculateTrend(userId: string, itemName: string, days: number = 30): PriceTrend | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT
      normalized_name,
      unit_price,
      purchase_date
    FROM price_history
    WHERE user_id = ? AND normalized_name LIKE ?
      AND purchase_date >= date('now', '-' || ? || ' days')
    ORDER BY purchase_date ASC
  `);

  const prices = stmt.all(userId, `%${itemName}%`, days) as any[];

  if (prices.length < 2) {
    return null;
  }

  const firstPrice = BigInt(prices[0].unit_price);
  const lastPrice = BigInt(prices[prices.length - 1].unit_price);

  const percentChange =
    firstPrice > 0n ? Math.round(((Number(lastPrice) - Number(firstPrice)) / Number(firstPrice)) * 100) : 0;

  const trend: 'up' | 'down' | 'stable' = percentChange > 5 ? 'up' : percentChange < -5 ? 'down' : 'stable';

  return {
    itemName: prices[0].normalized_name,
    currentPrice: lastPrice,
    previousPrice: firstPrice,
    percentChange,
    daysAnalyzed: days,
    trend,
  };
}

export function getAllCategoryInflation(userId: string, days: number = 30): CategoryInflation[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT
      COALESCE(c.name, 'Other') as categoryName,
      AVG(CASE WHEN ph.purchase_date >= date('now', '-' || ? / 2 || ' days') THEN ph.unit_price END) as recentAvg,
      AVG(CASE WHEN ph.purchase_date < date('now', '-' || ? / 2 || ' days') THEN ph.unit_price END) as olderAvg
    FROM price_history ph
    LEFT JOIN items i ON ph.item_id = i.id
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE ph.user_id = ? AND ph.purchase_date >= date('now', '-' || ? || ' days')
    GROUP BY c.name
  `);

  const results = stmt.all(days, days, userId, days) as any[];

  return results
    .map((row) => {
      const recent = row.recentAvg ? Number(row.recentAvg) : 0;
      const older = row.olderAvg ? Number(row.olderAvg) : 0;
      const percentChange = older > 0 ? Math.round(((recent - older) / older) * 100) : 0;

      return {
        categoryName: row.categoryName,
        percentChange,
        daysAnalyzed: days,
      };
    })
    .sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange));
}

export function compareStorePrices(userId: string, itemName: string): StorePriceComparison | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT
      store_name,
      unit_price,
      normalized_name
    FROM price_history
    WHERE user_id = ? AND normalized_name LIKE ?
      AND purchase_date >= date('now', '-90 days')
    ORDER BY store_name, unit_price
  `);

  const prices = stmt.all(userId, `%${itemName}%`) as any[];

  if (prices.length === 0) {
    return null;
  }

  const storeMap = new Map<string, bigint[]>();

  for (const price of prices) {
    const store = price.store_name || 'Unknown';
    if (!storeMap.has(store)) {
      storeMap.set(store, []);
    }
    storeMap.get(store)?.push(BigInt(price.unit_price));
  }

  const stores = Array.from(storeMap.entries()).map(([storeName, storePrices]) => {
    const avg = storePrices.reduce((a, b) => a + b, 0n) / BigInt(storePrices.length);
    const min = storePrices.reduce((a, b) => (a < b ? a : b), storePrices[0]);
    const max = storePrices.reduce((a, b) => (a > b ? a : b), storePrices[0]);

    return {
      storeName,
      averagePrice: avg,
      lowestPrice: min,
      highestPrice: max,
    };
  });

  return {
    itemName: prices[0].normalized_name,
    stores: stores.sort((a, b) => Number(a.averagePrice) - Number(b.averagePrice)),
  };
}
