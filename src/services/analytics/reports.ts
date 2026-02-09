import { getDatabase } from '../database/db';
import { MonthlyStats, CategoryStat, ItemStat } from '../../types/analytics';
import { SYSTEM_CATEGORIES } from '../../config/constants';

export function getMonthlyStats(userId: string, month: string): MonthlyStats {
  const db = getDatabase();

  const statsStmt = db.prepare(`
    SELECT
      ? as month,
      SUM(total_amount) as totalSpent,
      COUNT(*) as expenseCount
    FROM expenses
    WHERE user_id = ? AND strftime('%Y-%m', purchase_date) = ?
  `);
  const stats = statsStmt.get(month, userId, month) as any;

  const categoryStmt = db.prepare(`
    SELECT
      COALESCE(c.name, 'Other') as name,
      SUM(i.total_price) as amount,
      COUNT(i.id) as itemCount
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE i.user_id = ? AND strftime('%Y-%m', i.created_at) = ?
    GROUP BY c.name
    ORDER BY amount DESC
  `);
  const categories = categoryStmt.all(userId, month) as any[];

  const topItemsStmt = db.prepare(`
    SELECT
      normalized_name as name,
      SUM(total_price) as amount,
      COUNT(*) as count,
      CAST(AVG(unit_price) AS INTEGER) as avgPrice
    FROM items
    WHERE user_id = ? AND strftime('%Y-%m', created_at) = ?
    GROUP BY normalized_name
    ORDER BY amount DESC
    LIMIT 5
  `);
  const topItems = topItemsStmt.all(userId, month) as any[];

  const prevMonth = getPreviousMonth(month);
  const prevStmt = db.prepare(`
    SELECT SUM(total_amount) as total
    FROM expenses
    WHERE user_id = ? AND strftime('%Y-%m', purchase_date) = ?
  `);
  const prevStats = prevStmt.get(userId, prevMonth) as any;

  const totalSpent = BigInt(stats?.totalSpent || 0);
  const previousMonthTotal = BigInt(prevStats?.total || 0);

  const categoryBreakdown: CategoryStat[] = categories.map((cat) => ({
    name: cat.name,
    amount: BigInt(cat.amount || 0),
    percentage: totalSpent > 0n ? Math.round((Number(BigInt(cat.amount || 0)) / Number(totalSpent)) * 100) : 0,
    itemCount: cat.itemCount,
  }));

  const items: ItemStat[] = topItems.map((item) => ({
    name: item.name,
    amount: BigInt(item.amount || 0),
    count: item.count,
    avgPrice: BigInt(item.avgPrice || 0),
  }));

  const trendPercentage =
    previousMonthTotal > 0n
      ? Math.round(((Number(totalSpent) - Number(previousMonthTotal)) / Number(previousMonthTotal)) * 100)
      : 0;

  return {
    month,
    totalSpent,
    expenseCount: stats?.expenseCount || 0,
    categoryBreakdown,
    topItems: items,
    previousMonthTotal: previousMonthTotal > 0n ? previousMonthTotal : undefined,
    trendPercentage: previousMonthTotal > 0n ? trendPercentage : undefined,
  };
}

export function generateReportText(stats: MonthlyStats): string {
  let report = `Monthly Report: ${stats.month}\n`;
  report += `Total Spent: ${formatAmount(stats.totalSpent)}\n`;
  report += `Transactions: ${stats.expenseCount}\n\n`;

  if (stats.previousMonthTotal !== undefined && stats.trendPercentage !== undefined) {
    const trend = stats.trendPercentage > 0 ? '↑' : stats.trendPercentage < 0 ? '↓' : '→';
    report += `vs Previous Month: ${trend} ${Math.abs(stats.trendPercentage)}%\n\n`;
  }

  report += 'Category Breakdown:\n';
  for (const cat of stats.categoryBreakdown) {
    report += `- ${cat.name}: ${formatAmount(cat.amount)} (${cat.percentage}%)\n`;
  }

  if (stats.topItems.length > 0) {
    report += '\nTop Items:\n';
    for (const item of stats.topItems.slice(0, 5)) {
      report += `- ${item.name}: ${formatAmount(item.amount)} (${item.count}x)\n`;
    }
  }

  return report;
}

function formatAmount(cents: bigint): string {
  const value = Number(cents) / 100;
  return `EUR ${value.toFixed(2)}`;
}

function getPreviousMonth(month: string): string {
  const [year, monthNum] = month.split('-').map(Number);
  let prevMonth = monthNum - 1;
  let prevYear = year;

  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }

  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

interface CategoryWithReceipts {
  name: string;
  icon: string;
  total: bigint;
  receipts: Map<string, { storeName: string; date: string; items: { name: string; amount: bigint; quantity: number }[]; total: bigint }>;
}

export function getCategoriesWithReceipts(userId: string, month: string): CategoryWithReceipts[] {
  const db = getDatabase();

  const itemsStmt = db.prepare(`
    SELECT
      i.item_name,
      i.total_price,
      i.quantity,
      i.expense_id,
      i.created_at,
      COALESCE(c.name, 'Other') as category_name,
      COALESCE(e.store_name, 'Manual') as store_name
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    LEFT JOIN expenses e ON i.expense_id = e.id
    WHERE i.user_id = ? AND strftime('%Y-%m', i.created_at) = ?
    ORDER BY c.name, i.created_at DESC
  `);
  const items = itemsStmt.all(userId, month) as any[];

  const categoryMap = new Map<string, CategoryWithReceipts>();

  for (const item of items) {
    const catName = item.category_name;
    const expenseId = item.expense_id || `manual_${item.created_at}`;

    if (!categoryMap.has(catName)) {
      const systemCat = SYSTEM_CATEGORIES.find(c => c.name === catName);
      categoryMap.set(catName, {
        name: catName,
        icon: systemCat?.icon || '📦',
        total: 0n,
        receipts: new Map(),
      });
    }

    const category = categoryMap.get(catName)!;
    const itemAmount = BigInt(item.total_price);
    category.total += itemAmount;

    if (!category.receipts.has(expenseId)) {
      category.receipts.set(expenseId, {
        storeName: item.store_name,
        date: new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        items: [],
        total: 0n,
      });
    }

    const receipt = category.receipts.get(expenseId)!;
    receipt.items.push({
      name: item.item_name,
      amount: itemAmount,
      quantity: item.quantity,
    });
    receipt.total += itemAmount;
  }

  return Array.from(categoryMap.values()).sort((a, b) => Number(b.total - a.total));
}

export function generateCategoryReceiptReport(categories: CategoryWithReceipts[]): string {
  if (categories.length === 0) {
    return 'No purchases this month yet.';
  }

  let report = 'Your Purchases\n\n';
  let grandTotal = 0n;

  for (const category of categories) {
    report += `${category.icon} ${category.name} (${formatAmount(category.total)})\n`;

    for (const receipt of category.receipts.values()) {
      report += `  ${receipt.storeName} - ${receipt.date} (${formatAmount(receipt.total)})\n`;
      for (const item of receipt.items) {
        const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
        report += `    - ${item.name}${qty}: ${formatAmount(item.amount)}\n`;
      }
    }
    report += '\n';
    grandTotal += category.total;
  }

  report += `Total: ${formatAmount(grandTotal)}`;

  return report;
}
