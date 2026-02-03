import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database/db';
import { getUserTimezoneOffset } from '../timezone/detector';
import { ReceiptItem } from './vision';

/**
 * Save receipt data to database
 */
export async function saveReceiptExpense(
  userId: string,
  items: ReceiptItem[],
  totalAmount: bigint
): Promise<boolean> {
  try {
    const db = getDatabase();
    const tzOffset = getUserTimezoneOffset(userId);

    // Get current date in user's timezone
    const now = new Date();
    const utcDate = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    const userDate = new Date(utcDate.getTime() + tzOffset * 3600000);
    const dateStr = userDate.toISOString().split('T')[0];

    // Create expense record
    const expenseStmt = db.prepare(`
      INSERT INTO expenses (user_id, total_amount, purchase_date, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `);

    const expenseResult = expenseStmt.run(userId, totalAmount.toString(), dateStr) as any;
    const expenseId = expenseResult.lastInsertRowid;

    // Get default category
    let categoryId: number | null = null;
    const categoryStmt = db.prepare('SELECT id FROM categories WHERE name = ?');
    const category = categoryStmt.get('Shopping') as any;
    if (category) {
      categoryId = category.id;
    }

    // Insert items
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

    for (const item of items) {
      const normalizedName = item.name.toLowerCase().trim();

      itemStmt.run(
        expenseId,
        userId,
        item.name,
        normalizedName,
        item.quantity,
        item.amount.toString(),
        item.amount.toString(),
        categoryId || null
      );
    }

    return true;
  } catch (error: any) {
    console.error('[ReceiptHandler] Failed to save expense:', error.message);
    return false;
  }
}

/**
 * Get receipt file path for storage
 */
export function getReceiptPath(userId: string, filename: string): string {
  const receiptDir = path.join(process.cwd(), 'data', 'receipts', userId);

  // Create directory if it doesn't exist
  if (!fs.existsSync(receiptDir)) {
    fs.mkdirSync(receiptDir, { recursive: true });
  }

  return path.join(receiptDir, filename);
}

/**
 * Delete old receipts (older than RECEIPT_RETENTION_DAYS)
 */
export function cleanupOldReceipts(retentionDays: number = 90): void {
  try {
    const receiptDir = path.join(process.cwd(), 'data', 'receipts');

    if (!fs.existsSync(receiptDir)) {
      return;
    }

    const now = Date.now();
    const maxAge = retentionDays * 24 * 60 * 60 * 1000;

    // Walk through all user directories
    const userDirs = fs.readdirSync(receiptDir);

    for (const userDir of userDirs) {
      const userPath = path.join(receiptDir, userDir);

      if (!fs.statSync(userPath).isDirectory()) {
        continue;
      }

      const files = fs.readdirSync(userPath);

      for (const file of files) {
        const filePath = path.join(userPath, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`[ReceiptCleanup] Deleted old receipt: ${file}`);
        }
      }

      // Remove directory if empty
      const remainingFiles = fs.readdirSync(userPath);
      if (remainingFiles.length === 0) {
        fs.rmdirSync(userPath);
      }
    }
  } catch (error: any) {
    console.error('[ReceiptCleanup] Cleanup failed:', error.message);
  }
}
