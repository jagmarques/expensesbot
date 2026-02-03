import { getDatabase } from '../database/db';
import { generateId } from '../../utils/id';
import { RecurringExpense } from '../../types/budget';

export function addRecurring(
  userId: string,
  name: string,
  amount: bigint,
  frequency: string,
  categoryId?: string
): RecurringExpense {
  const db = getDatabase();
  const id = generateId();
  const nextDueDate = calculateNextDueDate(new Date(), frequency);

  const stmt = db.prepare(`
    INSERT INTO recurring_expenses (id, user_id, name, amount, category_id, frequency, next_due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, userId, name, Number(amount), categoryId || null, frequency, nextDueDate);

  return {
    id,
    userId,
    name,
    amount,
    currency: 'EUR',
    categoryId,
    frequency: frequency as any,
    nextDueDate,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
}

export function getActiveRecurring(userId: string): RecurringExpense[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT *
    FROM recurring_expenses
    WHERE user_id = ? AND is_active = 1
    ORDER BY next_due_date ASC
  `);

  const rows = stmt.all(userId) as any[];
  return rows.map(mapRecurring);
}

export function getOverdueRecurring(userId: string): RecurringExpense[] {
  const db = getDatabase();
  const today = new Date().toISOString().split('T')[0];

  const stmt = db.prepare(`
    SELECT *
    FROM recurring_expenses
    WHERE user_id = ? AND is_active = 1 AND next_due_date <= ?
    ORDER BY next_due_date ASC
  `);

  const rows = stmt.all(userId, today) as any[];
  return rows.map(mapRecurring);
}

export function updateRecurringDate(id: string, nextDueDate: string): RecurringExpense | null {
  const db = getDatabase();

  const updateStmt = db.prepare(`
    UPDATE recurring_expenses
    SET next_due_date = ?
    WHERE id = ?
  `);

  updateStmt.run(nextDueDate, id);

  const selectStmt = db.prepare(`SELECT * FROM recurring_expenses WHERE id = ?`);
  const row = selectStmt.get(id) as any;
  return row ? mapRecurring(row) : null;
}

export function toggleRecurring(id: string, isActive: boolean): RecurringExpense | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE recurring_expenses
    SET is_active = ?
    WHERE id = ?
  `);

  stmt.run(isActive ? 1 : 0, id);

  const selectStmt = db.prepare(`SELECT * FROM recurring_expenses WHERE id = ?`);
  const row = selectStmt.get(id) as any;
  return row ? mapRecurring(row) : null;
}

export function getRecurringById(id: string): RecurringExpense | null {
  const db = getDatabase();

  const stmt = db.prepare(`SELECT * FROM recurring_expenses WHERE id = ?`);
  const row = stmt.get(id) as any;
  return row ? mapRecurring(row) : null;
}

function mapRecurring(row: any): RecurringExpense {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    amount: BigInt(row.amount),
    currency: row.currency,
    categoryId: row.category_id,
    frequency: row.frequency,
    nextDueDate: row.next_due_date,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

function calculateNextDueDate(startDate: Date, frequency: string): string {
  const date = new Date(startDate);

  switch (frequency.toLowerCase()) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'biweekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }

  return date.toISOString().split('T')[0];
}

export { calculateNextDueDate };
