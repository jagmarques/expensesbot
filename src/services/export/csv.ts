import { getDatabase } from '../database/db';

export function exportToCSV(userId: string, startDate?: string, endDate?: string): string {
  const db = getDatabase();

  let query = `
    SELECT
      e.purchase_date as date,
      e.store_name as store,
      i.item_name as item,
      i.quantity,
      i.unit,
      i.unit_price,
      i.total_price,
      c.name as category
    FROM expenses e
    JOIN items i ON e.id = i.expense_id
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE e.user_id = ?
  `;

  const params: any[] = [userId];

  if (startDate) {
    query += ` AND e.purchase_date >= ?`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND e.purchase_date <= ?`;
    params.push(endDate);
  }

  query += ` ORDER BY e.purchase_date DESC, e.id DESC`;

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as any[];

  // Build CSV with headers
  const headers = ['Date', 'Store', 'Item', 'Quantity', 'Unit', 'Unit Price', 'Total Price', 'Category'];
  const csvLines: string[] = [headers.join(',')];

  for (const row of rows) {
    const unitPrice = Number(row.unit_price) / 100;
    const totalPrice = Number(row.total_price) / 100;
    const values = [
      row.date || '',
      escapeCsvField(row.store || ''),
      escapeCsvField(row.item || ''),
      row.quantity || '',
      row.unit || '',
      unitPrice.toFixed(2),
      totalPrice.toFixed(2),
      escapeCsvField(row.category || 'Other'),
    ];
    csvLines.push(values.join(','));
  }

  // Add summary section
  if (rows.length > 0) {
    csvLines.push('');
    csvLines.push('SUMMARY');

    const totalQuery = `
      SELECT COUNT(*) as count, SUM(i.total_price) as total
      FROM items i
      JOIN expenses e ON i.expense_id = e.id
      WHERE e.user_id = ?
    `;
    const totalParams = [userId];

    let summaryQuery = totalQuery;
    if (startDate) {
      summaryQuery += ` AND e.purchase_date >= ?`;
      totalParams.push(startDate);
    }
    if (endDate) {
      summaryQuery += ` AND e.purchase_date <= ?`;
      totalParams.push(endDate);
    }

    const summaryStmt = db.prepare(summaryQuery);
    const summary = summaryStmt.get(...totalParams) as any;

    const totalAmount = Number(summary.total || 0) / 100;
    csvLines.push(`Total Items,${summary.count || 0}`);
    csvLines.push(`Total Spent,€${totalAmount.toFixed(2)}`);
  }

  return csvLines.join('\n');
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
