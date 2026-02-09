import { getDatabase } from '../database/db';
import { CategoryInflation } from '../../types/analytics';

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
