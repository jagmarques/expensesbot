export const SYSTEM_CATEGORIES = [
  { name: 'Groceries', icon: '🛒', keywords: ['supermarket', 'lidl', 'aldi', 'continente', 'mercado'] },
  { name: 'Restaurants', icon: '🍽️', keywords: ['restaurant', 'cafe', 'pizza', 'burger', 'food'] },
  { name: 'Transportation', icon: '🚗', keywords: ['fuel', 'metro', 'taxi', 'bus', 'transport'] },
  { name: 'Entertainment', icon: '🎬', keywords: ['cinema', 'netflix', 'game', 'streaming'] },
  { name: 'Health', icon: '💊', keywords: ['pharmacy', 'doctor', 'gym', 'healthcare'] },
  { name: 'Shopping', icon: '🛍️', keywords: ['clothing', 'amazon', 'electronics', 'shop'] },
  { name: 'Personal', icon: '💇', keywords: ['haircut', 'barber', 'beauty', 'salon'] },
  { name: 'Bills', icon: '📄', keywords: ['electric', 'water', 'internet', 'bill'] },
  { name: 'Other', icon: '📦', keywords: [] },
];

export const RECEIPT_RETENTION_DAYS = 90;
export const BUDGET_ALERT_THRESHOLD = 0.8;
export const CURRENCY_CACHE_HOURS = 24;

export const GEMINI_DAILY_LIMIT = 1500;
export const GEMINI_RESPONSE_TIMEOUT_MS = 10000;
export const GEMINI_MAX_RETRIES = 2;
export const GEMINI_MODEL = 'gemini-1.5-flash';

export const DEFAULT_MESSAGES = {
  WELCOME: 'Welcome to ExpensesBot! Send a receipt photo or type an expense to track.',
  NO_GEMINI_KEY: 'AI features disabled. Get a FREE Gemini API key from https://ai.google.dev/ and add it to your .env file.',
  ERROR: 'An error occurred. Please try again.',
  SUCCESS: 'Successfully saved.',
};
