/**
 * User-friendly feedback messages
 */

export const messages = {
  // Success messages
  success: {
    expenseAdded: (description: string, amount: string) => `Added: ${description}\nAmount: ${amount}`,
    budgetSet: (category: string, amount: string) => `Budget set for ${category}: ${amount}/month`,
    recurringAdded: (name: string, amount: string) => `Recurring expense added: ${name}\nAmount: ${amount}`,
    timezoneSet: (timezone: string) => `Timezone set to ${timezone}`,
    exported: (format: string) => `Data exported as ${format}`,
  },

  // Error messages with recovery suggestions
  error: {
    invalidAmount: 'Invalid amount format. Try: "20" or "19.99"',
    amountTooLarge: 'Amount too large (max 999,999). Please enter a smaller amount.',
    invalidCategory: 'Category name contains invalid characters. Use: letters, numbers, dashes.',
    categoryTooLong: 'Category name too long (max 50 characters).',
    invalidFrequency: 'Invalid frequency. Options: daily, weekly, biweekly, monthly, quarterly, annual',
    invalidTimezone: 'Invalid timezone. Try: 14:30 (your time) or +5 (UTC offset)',
    invalidDate: 'Invalid date format. Use: YYYY-MM-DD',
    noData: 'No expenses recorded yet.\n\nSend a receipt photo or type an expense to add it.',
    noBudgets: 'No budgets set. Create one: /budget set food 500',
    noRecurring: 'No recurring expenses set. Add one: /recurring add netflix 10 monthly',
    queryTooShort: 'Query too short. Ask something specific like "How much on food?"',
    queryTooLong: 'Query too long (max 500 characters). Please shorten it.',
    databaseError: 'Database error. Your data is safe, but please try again later.',
    apiError: 'API error. Please try again in a moment.',
  },

  // Info messages
  info: {
    helpQuickEntry: 'Quick entry: Type amount and item\nExample: "20 coffee" or "15.50 groceries"',
    helpBudget: 'Budget commands:\n/budget list - Show all budgets\n/budget set food 500 - Set monthly budget\n/budget delete food - Remove budget',
    helpRecurring: 'Recurring commands:\n/recurring list - Show all\n/recurring add netflix 10 monthly - Add new',
    helpExport: '/export csv - Download as CSV\n/export pdf - Download as PDF',
    helpAI: 'Ask about your spending:\n"How much on food?" or "What was my biggest expense?"',
    helpTimezone: '/timezone 14:30 - Auto-detect from current time\n/timezone +5 - UTC offset\n/timezone Tokyo - City name',
  },

  // Prompts
  prompt: {
    enterBudgetCategory: 'Enter category name (e.g., food, transport):',
    enterBudgetAmount: 'Enter monthly budget amount (e.g., 500 or 99.99):',
    enterRecurringName: 'Enter name (e.g., netflix, spotify):',
    enterRecurringAmount: 'Enter monthly amount (e.g., 10.99):',
    enterRecurringFrequency: 'Enter frequency (daily/weekly/monthly/quarterly/annual):',
    enterTimezone: 'Enter timezone (14:30 = current time, +5 = UTC offset):',
    enterAIQuery: 'What would you like to know about your expenses?',
  },
};

/**
 * Format large numbers with thousands separator
 */
export function formatCurrency(amountCents: bigint, currency: string = 'EUR'): string {
  const amount = Number(amountCents) / 100;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  const symbol = getCurrencySymbol(currency);
  return `${symbol}${formatted}`;
}

/**
 * Get currency symbol
 */
function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    EUR: '€',
    USD: '$',
    GBP: '£',
    JPY: '¥',
  };
  return symbols[currency] || currency;
}

/**
 * Create suggestion message based on context
 */
export function getSuggestion(context: string): string {
  const suggestions: Record<string, string> = {
    noExpenses: 'Send a receipt photo or type an expense to add it.',
    lowBudget: 'You\'re close to your budget limit. Check: /budget list',
    highSpend: 'You\'re spending more than expected. Ask: "Where is my money going?"',
    firstTime: 'Welcome! Try: /start to see all features',
  };
  return suggestions[context] || '';
}
