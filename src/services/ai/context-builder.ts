import { getRecentExpenses, getTotalsByCategory, getMonthlyTotals } from '../database/expense-queries';
import { getDatabase } from '../database/db';

export function formatAmount(cents: bigint, currency: string = 'EUR'): string {
  const value = Number(cents) / 100;
  return `${value.toFixed(2)} ${currency}`;
}

interface ItemDetail {
  name: string;
  price: number;
  date: string;
}

function getAllItems(userId: string, days: number = 30): ItemDetail[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      i.item_name as name,
      i.total_price as price,
      e.purchase_date as date
    FROM items i
    JOIN expenses e ON i.expense_id = e.id
    WHERE i.user_id = ?
      AND e.purchase_date >= date('now', '-' || ? || ' days')
    ORDER BY e.purchase_date DESC
  `);
  return stmt.all(userId, days) as ItemDetail[];
}

function getPriceHistory(userId: string): { name: string; prices: { price: number; date: string }[] }[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      i.normalized_name as name,
      i.total_price as price,
      e.purchase_date as date
    FROM items i
    JOIN expenses e ON i.expense_id = e.id
    WHERE i.user_id = ?
    ORDER BY i.normalized_name, e.purchase_date DESC
  `);
  const rows = stmt.all(userId) as { name: string; price: number; date: string }[];

  const grouped: Record<string, { price: number; date: string }[]> = {};
  for (const row of rows) {
    if (!grouped[row.name]) {
      grouped[row.name] = [];
    }
    grouped[row.name].push({ price: row.price, date: row.date });
  }

  return Object.entries(grouped)
    .filter(([, prices]) => prices.length >= 2)
    .map(([name, prices]) => ({ name, prices }));
}

export async function buildExpenseContext(userId: string): Promise<string> {
  const recent = getRecentExpenses(userId, 30);
  const categories = getTotalsByCategory(userId, '2026-01-01', '2026-12-31');
  const monthly = getMonthlyTotals(userId, 6);
  const items = getAllItems(userId, 30);
  const priceHistory = getPriceHistory(userId);

  if (recent.length === 0) {
    return 'No expense records found. Start tracking by sending receipt photos or typing amounts.';
  }

  let context = 'USER EXPENSE CONTEXT:\n\n';

  context += 'Recent Activity (Last 30 Days):\n';
  const totalRecent = recent.reduce((sum, e) => sum + BigInt(e.total_amount), 0n);
  context += `- Total spent: ${formatAmount(totalRecent)}\n`;
  context += `- Number of transactions: ${recent.length}\n\n`;

  context += 'Category Breakdown:\n';
  for (const cat of categories.slice(0, 5)) {
    const pct = totalRecent > 0n ? (Number(cat.totalAmount) / Number(totalRecent) * 100).toFixed(0) : '0';
    context += `- ${cat.category}: ${formatAmount(cat.totalAmount)} (${pct}%, ${cat.itemCount} items)\n`;
  }
  context += '\n';

  context += 'Monthly Trends (Last 6 Months):\n';
  for (const m of monthly) {
    context += `- ${m.month}: ${formatAmount(m.totalAmount)}\n`;
  }
  context += '\n';

  // Add individual items for product-specific queries
  if (items.length > 0) {
    context += 'Individual Items Purchased (Last 30 Days):\n';
    for (const item of items.slice(0, 50)) {
      context += `- ${item.name}: ${formatAmount(BigInt(item.price))} (${item.date})\n`;
    }
    if (items.length > 50) {
      context += `... and ${items.length - 50} more items\n`;
    }
    context += '\n';
  }

  // Add price history for inflation tracking
  if (priceHistory.length > 0) {
    context += 'Price History (items bought multiple times):\n';
    for (const item of priceHistory.slice(0, 10)) {
      const prices = item.prices.slice(0, 3);
      const priceStr = prices.map(p => `${formatAmount(BigInt(p.price))} (${p.date})`).join(' -> ');
      const firstPrice = prices[prices.length - 1].price;
      const lastPrice = prices[0].price;
      const change = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice * 100).toFixed(1) : '0';
      context += `- ${item.name}: ${priceStr} [${change}% change]\n`;
    }
  }

  return context;
}
