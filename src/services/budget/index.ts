import { getDatabase } from '../database/db';
import { generateId } from '../../utils/id';
import { BudgetLimit, BudgetStatus } from '../../types/budget';

export function setBudgetLimit(
  userId: string,
  categoryId: string,
  monthlyLimit: bigint,
  alertThreshold: number = 0.8
): BudgetLimit {
  const db = getDatabase();
  const id = generateId();

  const stmt = db.prepare(`
    INSERT INTO budget_limits (id, user_id, category_id, monthly_limit, alert_threshold)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, category_id) DO UPDATE SET monthly_limit = ?, alert_threshold = ?
  `);

  stmt.run(id, userId, categoryId, Number(monthlyLimit), alertThreshold, Number(monthlyLimit), alertThreshold);

  return {
    id,
    userId,
    categoryId,
    monthlyLimit,
    currency: 'EUR',
    alertThreshold,
    createdAt: new Date().toISOString(),
  };
}

export function getBudgetLimits(userId: string): BudgetLimit[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT bl.*, c.name as category_name
    FROM budget_limits bl
    JOIN categories c ON bl.category_id = c.id
    WHERE bl.user_id = ?
    ORDER BY c.name
  `);

  const rows = stmt.all(userId) as any[];
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    categoryId: row.category_id,
    monthlyLimit: BigInt(row.monthly_limit),
    currency: row.currency,
    alertThreshold: row.alert_threshold,
    createdAt: row.created_at,
  }));
}

export function checkBudgetStatus(userId: string, categoryId: string): BudgetStatus | null {
  const db = getDatabase();

  const budgetStmt = db.prepare(`
    SELECT bl.*, c.name as category_name
    FROM budget_limits bl
    JOIN categories c ON bl.category_id = c.id
    WHERE bl.user_id = ? AND bl.category_id = ?
  `);

  const budget = budgetStmt.get(userId, categoryId) as any;
  if (!budget) return null;

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const spentStmt = db.prepare(`
    SELECT SUM(i.total_price) as total
    FROM items i
    JOIN expenses e ON i.expense_id = e.id
    WHERE i.category_id = ? AND e.user_id = ? AND e.purchase_date LIKE ?
  `);

  const result = spentStmt.get(categoryId, userId, `${currentMonth}%`) as { total: number | null };
  const spent = BigInt(result.total || 0);
  const limit = BigInt(budget.monthly_limit);
  const percentage = Number((spent * 100n) / limit);

  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysRemainingInMonth = Math.max(0, lastDay.getDate() - now.getDate());

  return {
    categoryId,
    categoryName: budget.category_name,
    limit,
    spent,
    percentage,
    isAlertTriggered: percentage >= budget.alert_threshold * 100,
    daysRemainingInMonth,
  };
}

export function getAllBudgetAlerts(userId: string): BudgetStatus[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT DISTINCT category_id
    FROM budget_limits
    WHERE user_id = ?
  `);

  const budgets = stmt.all(userId) as { category_id: string }[];
  const alerts: BudgetStatus[] = [];

  for (const budget of budgets) {
    const status = checkBudgetStatus(userId, budget.category_id);
    if (status && status.isAlertTriggered) {
      alerts.push(status);
    }
  }

  return alerts.sort((a, b) => b.percentage - a.percentage);
}

export function deleteBudgetLimit(userId: string, categoryId: string): boolean {
  const db = getDatabase();

  const stmt = db.prepare(`
    DELETE FROM budget_limits
    WHERE user_id = ? AND category_id = ?
  `);

  const result = stmt.run(userId, categoryId);
  return result.changes > 0;
}
