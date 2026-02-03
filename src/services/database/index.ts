export { initializeDatabase, getDatabase, closeDatabase } from './db';
export { getRecentExpenses, getTotalsByCategory, getMonthlyTotals, getTopItems, getExpenseStats, type CategoryTotal, type MonthlyTotal, type ItemTotal, type ExpenseStats } from './expense-queries';
