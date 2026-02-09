import { env } from '../../config/env';
import { getDatabase } from '../database/db';
import { SYSTEM_CATEGORIES } from '../../config/constants';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

interface CategoryResult {
  itemName: string;
  categoryName: string;
  categoryId: string | null;
}

/**
 * Use AI to categorize items into expense categories
 */
export async function categorizeItems(items: string[]): Promise<CategoryResult[]> {
  if (!env.DEEPSEEK_API_KEY || items.length === 0) {
    return items.map(item => ({
      itemName: item,
      categoryName: 'Other',
      categoryId: getCategoryId('Other'),
    }));
  }

  const itemList = items.join('\n');

  const prompt = `Categorize these items into categories. First, analyze if these items appear to be from a supermarket/grocery store receipt.

IMPORTANT CONTEXT:
- If items have similar naming patterns (like store brand prefixes), they're likely from ONE store
- Items bought at a supermarket (food, cleaning, personal care, vitamins, bags) = ALL "Groceries"
- Only use "Health" for pharmacy-specific purchases (prescription, doctor visit)
- Only use "Personal" for salon/spa SERVICES (haircut, massage)
- Only use "Shopping" for dedicated retail stores (clothing store, electronics store)

Categories:
- Groceries: ALL items from supermarket/grocery stores (food, drinks, cleaning, personal care, vitamins, household items, bags)
- Restaurants: eating out, cafes, takeaway, delivery food
- Transportation: fuel, taxi, uber, public transit, parking
- Entertainment: movies, games, streaming, concerts, hobbies
- Health: pharmacy prescriptions, doctor visits, gym membership
- Shopping: clothing stores, electronics stores, furniture stores
- Personal: haircut salon, beauty salon, spa services
- Bills: utilities, subscriptions, internet, phone bills
- Other: anything that doesn't fit above

Items:
${itemList}

Analyze: Do these items appear to be from a supermarket receipt? If yes, categorize ALL as Groceries.

Reply ONLY with JSON: [{"item": "item name", "category": "Category"}]`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

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
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error('[Categorizer] API error:', response.status);
      return fallbackCategorize(items);
    }

    const data = await response.json() as any;
    const text = data.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[Categorizer] No JSON found in response');
      return fallbackCategorize(items);
    }

    const parsed = JSON.parse(jsonMatch[0]) as { item: string; category: string }[];

    return items.map(itemName => {
      const match = parsed.find(p =>
        p.item.toLowerCase() === itemName.toLowerCase() ||
        itemName.toLowerCase().includes(p.item.toLowerCase())
      );
      const categoryName = match?.category || 'Other';
      const validCategory = SYSTEM_CATEGORIES.find(c =>
        c.name.toLowerCase() === categoryName.toLowerCase()
      );

      return {
        itemName,
        categoryName: validCategory?.name || 'Other',
        categoryId: getCategoryId(validCategory?.name || 'Other'),
      };
    });
  } catch (error: any) {
    console.error('[Categorizer] Error:', error.message);
    return fallbackCategorize(items);
  }
}

/**
 * Fallback: use keyword matching from SYSTEM_CATEGORIES
 */
function fallbackCategorize(items: string[]): CategoryResult[] {
  return items.map(itemName => {
    const lowerName = itemName.toLowerCase();

    for (const cat of SYSTEM_CATEGORIES) {
      if (cat.keywords.some(kw => lowerName.includes(kw))) {
        return {
          itemName,
          categoryName: cat.name,
          categoryId: getCategoryId(cat.name),
        };
      }
    }

    return {
      itemName,
      categoryName: 'Other',
      categoryId: getCategoryId('Other'),
    };
  });
}

/**
 * Get category ID from database by name
 */
function getCategoryId(name: string): string | null {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT id FROM categories WHERE name = ?');
    const result = stmt.get(name) as any;
    return result?.id || null;
  } catch {
    return null;
  }
}

/**
 * Categorize a single item
 */
export async function categorizeSingleItem(itemName: string): Promise<CategoryResult> {
  const results = await categorizeItems([itemName]);
  return results[0];
}
