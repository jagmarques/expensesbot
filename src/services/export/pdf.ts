import PDFDocument from 'pdfkit';
import { getDatabase } from '../database/db';

export async function exportToPDF(userId: string, startDate?: string, endDate?: string): Promise<Buffer> {
  const db = getDatabase();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Determine date range label
    let dateLabel = 'All Time';
    if (startDate && endDate) {
      dateLabel = `${formatDate(startDate)} - ${formatDate(endDate)}`;
    } else if (startDate) {
      dateLabel = `From ${formatDate(startDate)}`;
    } else if (endDate) {
      dateLabel = `Until ${formatDate(endDate)}`;
    }

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('Expense Report', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica').text(dateLabel, { align: 'center' });
    doc.moveDown(0.5);

    // Divider line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    // Summary stats
    let query = `
      SELECT COUNT(*) as count, SUM(i.total_price) as total
      FROM items i
      WHERE i.user_id = ?
    `;
    const params: any[] = [userId];

    if (startDate) {
      query += ` AND date(i.created_at) >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND date(i.created_at) <= ?`;
      params.push(endDate);
    }

    const summaryStmt = db.prepare(query);
    const summary = summaryStmt.get(...params) as any;

    const totalAmount = Number(summary.total || 0) / 100;
    const itemCount = summary.count || 0;
    const average = itemCount > 0 ? totalAmount / itemCount : 0;

    // Summary section
    doc.fontSize(14).font('Helvetica-Bold').text('Summary');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Spent: ${formatEuro(totalAmount)}`);
    doc.text(`Total Items: ${itemCount}`);
    doc.text(`Average per Item: ${formatEuro(average)}`);
    doc.moveDown();

    // Category breakdown
    let categoryQuery = `
      SELECT COALESCE(c.name, 'Other') as name, COUNT(*) as count, SUM(i.total_price) as total
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.user_id = ?
    `;
    const categoryParams: any[] = [userId];

    if (startDate) {
      categoryQuery += ` AND date(i.created_at) >= ?`;
      categoryParams.push(startDate);
    }
    if (endDate) {
      categoryQuery += ` AND date(i.created_at) <= ?`;
      categoryParams.push(endDate);
    }

    categoryQuery += ` GROUP BY c.name ORDER BY total DESC`;

    const categoryStmt = db.prepare(categoryQuery);
    const categories = categoryStmt.all(...categoryParams) as any[];

    if (categories.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Spending by Category');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');

      for (const cat of categories) {
        const catAmount = Number(cat.total || 0) / 100;
        const percentage = totalAmount > 0 ? ((catAmount / totalAmount) * 100).toFixed(1) : '0.0';
        doc.text(`${cat.name || 'Uncategorized'}: ${formatEuro(catAmount)} (${percentage}%)`);
      }
      doc.moveDown();
    }

    // Detailed transaction table
    let transQuery = `
      SELECT
        date(i.created_at) as date,
        COALESCE(e.store_name, 'Manual') as store,
        i.item_name as item,
        i.total_price as price,
        COALESCE(c.name, 'Other') as category
      FROM items i
      LEFT JOIN expenses e ON i.expense_id = e.id
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.user_id = ?
    `;
    const transParams: any[] = [userId];

    if (startDate) {
      transQuery += ` AND date(i.created_at) >= ?`;
      transParams.push(startDate);
    }
    if (endDate) {
      transQuery += ` AND date(i.created_at) <= ?`;
      transParams.push(endDate);
    }

    transQuery += ` ORDER BY i.created_at DESC LIMIT 50`;

    const transStmt = db.prepare(transQuery);
    const transactions = transStmt.all(...transParams) as any[];

    if (transactions.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Recent Transactions');
      doc.moveDown(0.5);

      // Table header
      const headers = ['Date', 'Store', 'Item', 'Amount', 'Category'];
      const colWidths = [70, 90, 140, 70, 90];
      const tableStartX = 50;
      const rowHeight = 18;
      let currentY = doc.y;

      // Draw header row
      doc.fontSize(9).font('Helvetica-Bold');
      let xPos = tableStartX;
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], xPos, currentY, { width: colWidths[i] });
        xPos += colWidths[i];
      }

      // Header underline
      currentY += rowHeight;
      doc.moveTo(tableStartX, currentY - 4).lineTo(tableStartX + 460, currentY - 4).stroke();

      // Data rows
      doc.fontSize(8).font('Helvetica');

      for (const t of transactions) {
        // Check for page break
        if (currentY > 750) {
          doc.addPage();
          currentY = 50;

          // Repeat header on new page
          doc.fontSize(9).font('Helvetica-Bold');
          xPos = tableStartX;
          for (let i = 0; i < headers.length; i++) {
            doc.text(headers[i], xPos, currentY, { width: colWidths[i] });
            xPos += colWidths[i];
          }
          currentY += rowHeight;
          doc.moveTo(tableStartX, currentY - 4).lineTo(tableStartX + 460, currentY - 4).stroke();
          doc.fontSize(8).font('Helvetica');
        }

        const price = Number(t.price || 0) / 100;
        const row = [
          formatDate(t.date) || '-',
          truncate(t.store || '-', 16),
          truncate(t.item || '-', 24),
          formatEuro(price),
          truncate(t.category || 'Other', 14)
        ];

        xPos = tableStartX;
        for (let i = 0; i < row.length; i++) {
          doc.text(row[i], xPos, currentY, { width: colWidths[i] });
          xPos += colWidths[i];
        }
        currentY += rowHeight;
      }
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica').text(
      `Generated on ${formatDate(new Date().toISOString().split('T')[0])}`,
      { align: 'center' }
    );

    doc.end();
  });
}

function formatEuro(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

function truncate(str: string, maxLen: number): string {
  if (!str) return '-';
  return str.length > maxLen ? str.substring(0, maxLen - 1) + '...' : str;
}
