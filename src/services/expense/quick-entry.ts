import { getDatabase } from '../database/db';
import { getUserTimezoneOffset } from '../timezone/detector';

export interface ParsedExpense {
  amount: bigint;
  description: string;
  category?: string;
}

/**
 * Parse quick entry format: "20 coffee", "15.50 gas", "100 food"
 * Returns parsed expense or null if format invalid
 */
export function parseQuickEntry(text: string): ParsedExpense | null {
  // Trim and remove extra whitespace
  const trimmed = text.trim();

  // Match patterns: "20 coffee", "15.50 coffee", etc
  // Amount (integer or decimal) followed by description
  const match = trimmed.match(/^(\d+(?:\.\d{1,2})?)\s+(.+)$/);
  if (!match) {
    return null;
  }

  const amountStr = match[1];
  const description = match[2];

  // Convert to cents (BigInt)
  const amountFloat = parseFloat(amountStr);
  const amountCents = BigInt(Math.round(amountFloat * 100));

  if (amountCents <= 0n) {
    return null;
  }

  return {
    amount: amountCents,
    description,
  };
}

/**
 * Add quick entry expense to database
 */
export function addQuickExpense(userId: string, description: string, amountCents: bigint): boolean {
  try {
    const db = getDatabase();
    const tzOffset = getUserTimezoneOffset(userId);

    // Get current date in user's timezone
    const now = new Date();
    const utcDate = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    const userDate = new Date(utcDate.getTime() + tzOffset * 3600000);
    const dateStr = userDate.toISOString().split('T')[0];

    // Create expense
    const expenseStmt = db.prepare(`
      INSERT INTO expenses (user_id, total_amount, purchase_date, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `);
    const expenseResult = expenseStmt.run(userId, amountCents.toString(), dateStr) as any;
    const expenseId = expenseResult.lastInsertRowid;

    // Get or create category (default "Other")
    let categoryId: number | null = null;
    const categoryStmt = db.prepare('SELECT id FROM categories WHERE name = ?');
    const category = categoryStmt.get('Other') as any;
    if (category) {
      categoryId = category.id;
    }

    // Create item
    const itemStmt = db.prepare(`
      INSERT INTO items (
        expense_id,
        user_id,
        item_name,
        normalized_name,
        quantity,
        unit_price,
        total_price,
        category_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    // Normalize name (lowercase, trim)
    const normalizedName = description.toLowerCase().trim();

    itemStmt.run(
      expenseId,
      userId,
      description,
      normalizedName,
      1,
      amountCents.toString(), // unit_price = total for single item
      amountCents.toString(),
      categoryId || null,
    );

    return true;
  } catch (error: any) {
    console.error('[QuickEntry] Failed to add expense:', error.message);
    return false;
  }
}

/**
 * Format amount for display
 */
export function formatAmount(amountCents: bigint): string {
  const cents = Number(amountCents);
  const euros = Math.floor(cents / 100);
  const remaining = cents % 100;
  return `€${euros.toFixed(0)}.${String(remaining).padStart(2, '0')}`;
}
