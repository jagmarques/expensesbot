import { getRecentExpenses, getTotalsByCategory, getMonthlyTotals } from '../database/expense-queries';

export function formatAmount(cents: bigint, currency: string = 'EUR'): string {
  const value = Number(cents) / 100;
  return `${value.toFixed(2)} ${currency}`;
}

export async function buildExpenseContext(userId: string): Promise<string> {
  const recent = getRecentExpenses(userId, 30);
  const categories = getTotalsByCategory(userId, '2026-01-01', '2026-12-31');
  const monthly = getMonthlyTotals(userId, 6);

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

  return context;
}
