import { getDatabase } from '../database/db';

export interface ExportedExpense {
  date: string;
  description: string;
  amount: string;
  category: string;
  items: ExportedItem[];
}

export interface ExportedItem {
  name: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

export interface JSONExport {
  exportDate: string;
  userId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalSpent: string;
    expenseCount: number;
    averageExpense: string;
    topCategory: string;
  };
  expenses: ExportedExpense[];
}

/**
 * Export expenses as JSON
 */
export function generateJSON(userId: string, startDate: string, endDate: string): string {
  try {
    const db = getDatabase();

    // Get expenses
    const expensesStmt = db.prepare(`
      SELECT
        e.id,
        e.purchase_date,
        e.total_amount,
        COALESCE(c.name, 'Other') as category,
        GROUP_CONCAT(i.item_name, ', ') as items
      FROM expenses e
      LEFT JOIN items i ON i.expense_id = e.id
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE e.user_id = ?
        AND e.purchase_date >= ?
        AND e.purchase_date <= ?
      GROUP BY e.id
      ORDER BY e.purchase_date DESC
    `);

    const expenses = expensesStmt.all(userId, startDate, endDate) as any[];

    // Get summary
    const summaryStmt = db.prepare(`
      SELECT
        SUM(total_amount) as totalSpent,
        COUNT(*) as expenseCount,
        AVG(total_amount) as avgExpense,
        COALESCE((
          SELECT c.name
          FROM items i
          LEFT JOIN categories c ON i.category_id = c.id
          WHERE i.user_id = ?
          GROUP BY c.name
          ORDER BY SUM(i.total_price) DESC
          LIMIT 1
        ), 'Other') as topCategory
      FROM expenses
      WHERE user_id = ?
        AND purchase_date >= ?
        AND purchase_date <= ?
    `);

    const summary = summaryStmt.get(userId, userId, startDate, endDate) as any;

    // Format export
    const exportedExpenses: ExportedExpense[] = expenses.map((e) => ({
      date: e.purchase_date,
      description: e.items || 'Expense',
      amount: (Number(e.total_amount) / 100).toFixed(2),
      category: e.category,
      items: [], // Basic export - could be enhanced with item details
    }));

    const jsonExport: JSONExport = {
      exportDate: new Date().toISOString(),
      userId,
      period: {
        startDate,
        endDate,
      },
      summary: {
        totalSpent: (Number(summary.totalSpent || 0) / 100).toFixed(2),
        expenseCount: summary.expenseCount || 0,
        averageExpense: (Number(summary.avgExpense || 0) / 100).toFixed(2),
        topCategory: summary.topCategory || 'Other',
      },
      expenses: exportedExpenses,
    };

    return JSON.stringify(jsonExport, null, 2);
  } catch (error: any) {
    console.error('[JSONExport] Failed:', error.message);
    throw error;
  }
}

/**
 * Generate filename for JSON export
 */
export function getJSONFilename(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  return `expenses_${date}.json`;
}
