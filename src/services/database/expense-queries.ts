import { getDatabase } from './db';

export interface CategoryTotal {
  category: string;
  totalAmount: bigint;
  itemCount: number;
}

export interface MonthlyTotal {
  month: string;
  totalAmount: bigint;
  itemCount: number;
}

export interface ItemTotal {
  normalizedName: string;
  totalAmount: bigint;
  purchaseCount: number;
}

export interface ExpenseStats {
  totalSpent: bigint;
  expenseCount: number;
  avgExpense: bigint;
  topCategory: string;
  firstExpenseDate: string;
}

export function getRecentExpenses(userId: string, days: number = 30): any[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT e.*, GROUP_CONCAT(i.item_name) as items
    FROM expenses e
    LEFT JOIN items i ON i.expense_id = e.id
    WHERE e.user_id = ?
      AND e.purchase_date >= date('now', '-' || ? || ' days')
    GROUP BY e.id
    ORDER BY e.purchase_date DESC
  `);
  return stmt.all(userId, days) as any[];
}

export function getTotalsByCategory(userId: string, startDate: string, endDate: string): CategoryTotal[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      COALESCE(c.name, 'Other') as category,
      SUM(i.total_price) as totalAmount,
      COUNT(i.id) as itemCount
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE i.user_id = ?
      AND i.created_at >= ?
      AND i.created_at <= ?
    GROUP BY c.name
    ORDER BY totalAmount DESC
  `);
  return stmt.all(userId, startDate, endDate) as CategoryTotal[];
}

export function getMonthlyTotals(userId: string, months: number = 6): MonthlyTotal[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      strftime('%Y-%m', purchase_date) as month,
      SUM(total_amount) as totalAmount,
      COUNT(*) as itemCount
    FROM expenses
    WHERE user_id = ?
      AND purchase_date >= date('now', '-' || ? || ' months')
    GROUP BY strftime('%Y-%m', purchase_date)
    ORDER BY month DESC
  `);
  return stmt.all(userId, months) as MonthlyTotal[];
}

export function getTopItems(userId: string, limit: number = 10): ItemTotal[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      normalized_name as normalizedName,
      SUM(total_price) as totalAmount,
      COUNT(*) as purchaseCount
    FROM items
    WHERE user_id = ?
    GROUP BY normalized_name
    ORDER BY totalAmount DESC
    LIMIT ?
  `);
  return stmt.all(userId, limit) as ItemTotal[];
}

export function getExpenseStats(userId: string): ExpenseStats {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      SUM(total_amount) as totalSpent,
      COUNT(*) as expenseCount,
      AVG(total_amount) as avgExpense,
      MIN(purchase_date) as firstExpenseDate
    FROM expenses
    WHERE user_id = ?
  `);
  const result = stmt.get(userId) as any;

  return {
    totalSpent: BigInt(result?.totalSpent || 0),
    expenseCount: result?.expenseCount || 0,
    avgExpense: BigInt(Math.round(parseFloat(result?.avgExpense || 0))),
    topCategory: 'Groceries',
    firstExpenseDate: result?.firstExpenseDate || new Date().toISOString().split('T')[0],
  };
}
