import PDFDocument from 'pdfkit';
import { getDatabase } from '../database/db';

export function exportToPDF(userId: string, startDate?: string, endDate?: string): Buffer {
  const db = getDatabase();

  const doc = new PDFDocument();
  const buffers: Buffer[] = [];

  doc.on('data', (chunk) => buffers.push(chunk));

  // Determine date range label
  let dateLabel = 'All Time';
  if (startDate && endDate) {
    dateLabel = `${startDate} to ${endDate}`;
  } else if (startDate) {
    dateLabel = `From ${startDate}`;
  } else if (endDate) {
    dateLabel = `Until ${endDate}`;
  }

  // Header
  doc.fontSize(20).font('Helvetica-Bold').text('Expense Report', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text(dateLabel, { align: 'center' });
  doc.moveDown();

  // Summary stats
  let query = `
    SELECT COUNT(*) as count, SUM(i.total_price) as total
    FROM items i
    JOIN expenses e ON i.expense_id = e.id
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

  const summaryStmt = db.prepare(query);
  const summary = summaryStmt.get(...params) as any;

  const totalAmount = Number(summary.total || 0) / 100;
  const itemCount = summary.count || 0;

  doc.fontSize(11).font('Helvetica-Bold').text('Summary', { underline: true });
  doc.fontSize(10).font('Helvetica');
  doc.text(`Total Items: ${itemCount}`);
  doc.text(`Total Spent: €${totalAmount.toFixed(2)}`);
  doc.moveDown();

  // Category breakdown
  let categoryQuery = `
    SELECT c.name, COUNT(*) as count, SUM(i.total_price) as total
    FROM items i
    JOIN expenses e ON i.expense_id = e.id
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE e.user_id = ?
  `;
  const categoryParams: any[] = [userId];

  if (startDate) {
    categoryQuery += ` AND e.purchase_date >= ?`;
    categoryParams.push(startDate);
  }
  if (endDate) {
    categoryQuery += ` AND e.purchase_date <= ?`;
    categoryParams.push(endDate);
  }

  categoryQuery += ` GROUP BY c.name ORDER BY total DESC`;

  const categoryStmt = db.prepare(categoryQuery);
  const categories = categoryStmt.all(...categoryParams) as any[];

  if (categories.length > 0) {
    doc.fontSize(11).font('Helvetica-Bold').text('By Category', { underline: true });
    doc.fontSize(10).font('Helvetica');

    for (const cat of categories) {
      const catAmount = Number(cat.total || 0) / 100;
      const percentage = totalAmount > 0 ? ((catAmount / totalAmount) * 100).toFixed(1) : '0.0';
      doc.text(`${cat.name}: €${catAmount.toFixed(2)} (${percentage}%)`);
    }
    doc.moveDown();
  }

  // Detailed transaction table
  let transQuery = `
    SELECT
      e.purchase_date as date,
      e.store_name as store,
      i.item_name as item,
      i.total_price as price,
      c.name as category
    FROM expenses e
    JOIN items i ON e.id = i.expense_id
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE e.user_id = ?
  `;
  const transParams: any[] = [userId];

  if (startDate) {
    transQuery += ` AND e.purchase_date >= ?`;
    transParams.push(startDate);
  }
  if (endDate) {
    transQuery += ` AND e.purchase_date <= ?`;
    transParams.push(endDate);
  }

  transQuery += ` ORDER BY e.purchase_date DESC LIMIT 50`;

  const transStmt = db.prepare(transQuery);
  const transactions = transStmt.all(...transParams) as any[];

  if (transactions.length > 0) {
    doc.fontSize(11).font('Helvetica-Bold').text('Recent Transactions', { underline: true });
    doc.fontSize(9).font('Helvetica');

    const table = transactions.map((t) => {
      const price = Number(t.price || 0) / 100;
      return [t.date || '', t.store || '', t.item || '', `€${price.toFixed(2)}`, t.category || 'Other'];
    });

    // Simple table rendering
    const headers = ['Date', 'Store', 'Item', 'Price', 'Category'];
    const y = doc.y;
    let currentY = y;

    // Header row
    const colWidths = [80, 70, 100, 60, 100];
    let xPos = 50;

    doc.font('Helvetica-Bold').fontSize(9);
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], xPos, currentY, { width: colWidths[i], align: 'left' });
      xPos += colWidths[i];
    }

    currentY += 20;
    doc.font('Helvetica').fontSize(8);

    // Data rows
    for (const row of table) {
      if (currentY > 750) {
        doc.addPage();
        currentY = 50;
      }

      xPos = 50;
      for (let i = 0; i < row.length; i++) {
        doc.text(row[i].toString().substring(0, 15), xPos, currentY, { width: colWidths[i], align: 'left' });
        xPos += colWidths[i];
      }
      currentY += 15;
    }
  }

  // Footer
  doc.moveDown();
  doc.fontSize(8).font('Helvetica').text(`Generated on ${new Date().toISOString().split('T')[0]}`, { align: 'center' });

  doc.end();

  return Buffer.concat(buffers);
}
