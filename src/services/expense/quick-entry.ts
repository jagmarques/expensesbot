import { getDatabase } from '../database/db';
import { getUserTimezoneOffset } from '../timezone/detector';
import { generateId } from '../../utils/id';
import { categorizeSingleItem } from '../ai/categorizer';
import { env } from '../../config/env';

export interface ParsedExpense {
  amount: bigint;
  description: string;
  currency: string;
  category?: string;
}

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

/**
 * Use AI to parse expense input - handles any format
 * Examples: "€5.50 coffee", "bought lunch for $20", "15 pizza", "coffee 5€"
 */
export async function parseQuickEntry(text: string): Promise<ParsedExpense | null> {
  const trimmed = text.trim();

  // Quick check - must have at least one number
  if (!/\d/.test(trimmed)) {
    return null;
  }

  // Try AI parsing first
  if (env.DEEPSEEK_API_KEY) {
    try {
      const result = await parseWithAI(trimmed);
      if (result) return result;
    } catch (e) {
      console.error('[QuickEntry] AI parse failed, using fallback');
    }
  }

  // Fallback: simple regex
  return fallbackParse(trimmed);
}

async function parseWithAI(text: string): Promise<ParsedExpense | null> {
  const prompt = `Parse this expense entry and extract: amount (number), currency (3-letter code like EUR, USD, GBP - default EUR if not specified), and item description.

Input: "${text}"

Reply ONLY with JSON: {"amount": 5.50, "currency": "EUR", "item": "coffee"}
No explanation.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 100,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json() as any;
    const responseText = data.choices?.[0]?.message?.content || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.amount || parsed.amount <= 0 || !parsed.item) {
      return null;
    }

    return {
      amount: BigInt(Math.round(parsed.amount * 100)),
      description: parsed.item,
      currency: (parsed.currency || 'EUR').toUpperCase(),
    };
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

function fallbackParse(text: string): ParsedExpense | null {
  // Simple pattern: number + text
  const match = text.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!match) return null;

  const amount = parseFloat(match[1].replace(',', '.'));
  if (amount <= 0) return null;

  // Remove amount and currency symbols from text to get description
  let description = text
    .replace(/[\d.,]+/, '')
    .replace(/[€$£¥₹₽₿฿₫₱₩₴]/g, '')
    .replace(/\b(EUR|USD|GBP|CHF|PLN|BRL|JPY|CNY)\b/gi, '')
    .trim();

  if (!description) return null;

  // Detect currency
  let currency = 'EUR';
  if (/[$]/.test(text)) currency = 'USD';
  else if (/[£]/.test(text)) currency = 'GBP';
  else if (/[¥]/.test(text)) currency = 'JPY';
  else if (/USD/i.test(text)) currency = 'USD';
  else if (/GBP/i.test(text)) currency = 'GBP';

  return {
    amount: BigInt(Math.round(amount * 100)),
    description,
    currency,
  };
}

/**
 * Add quick entry expense to database with AI categorization
 */
export async function addQuickExpense(userId: string, description: string, amountCents: bigint, currency: string = 'EUR'): Promise<boolean> {
  try {
    const db = getDatabase();
    const tzOffset = getUserTimezoneOffset(userId);

    // Get current date in user's timezone
    const now = new Date();
    const utcDate = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    const userDate = new Date(utcDate.getTime() + tzOffset * 3600000);
    const dateStr = userDate.toISOString().split('T')[0];

    // AI categorization
    const category = await categorizeSingleItem(description);
    console.log('[QuickEntry] AI categorized:', description, '->', category.categoryName);

    // Create expense with generated ID (source = manual)
    const expenseId = generateId();
    const expenseStmt = db.prepare(`
      INSERT INTO expenses (id, user_id, total_amount, currency, purchase_date, source, created_at)
      VALUES (?, ?, ?, ?, ?, 'manual', datetime('now'))
    `);
    expenseStmt.run(expenseId, userId, amountCents.toString(), currency, dateStr);

    // Create item with AI category
    const itemStmt = db.prepare(`
      INSERT INTO items (
        id,
        expense_id,
        user_id,
        item_name,
        normalized_name,
        quantity,
        unit_price,
        total_price,
        category_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    // Normalize name (lowercase, trim)
    const normalizedName = description.toLowerCase().trim();

    itemStmt.run(
      generateId(),
      expenseId,
      userId,
      description,
      normalizedName,
      1,
      amountCents.toString(),
      amountCents.toString(),
      category.categoryId,
    );

    return true;
  } catch (error: any) {
    console.error('[QuickEntry] Failed to add expense:', error.message);
    return false;
  }
}

/**
 * Format amount for display
 */
export function formatAmount(amountCents: bigint): string {
  const cents = Number(amountCents);
  const euros = Math.floor(cents / 100);
  const remaining = cents % 100;
  return `€${euros.toFixed(0)}.${String(remaining).padStart(2, '0')}`;
}
