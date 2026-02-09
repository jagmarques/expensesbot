import fs from 'fs';
import { env } from '../../config/env';
import { generateDeepSeekResponse } from '../ai/deepseek';

export interface ReceiptItem {
  name: string;
  amount: bigint; // in cents
  quantity: number;
}

export interface ParsedReceipt {
  items: ReceiptItem[];
  totalAmount: bigint;
  storeName: string;
  confidence: number;
}

// Extract text from receipt image via Google Vision OCR
export async function extractReceiptText(imagePath: string): Promise<string> {
  if (!env.GOOGLE_VISION_API_KEY) {
    console.log('[Vision] No API key configured');
    return '';
  }

  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${env.GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [{ type: 'TEXT_DETECTION' }],
          }],
        }),
      }
    );

    if (!response.ok) {
      console.error('[Vision] API error:', response.status, await response.text());
      return '';
    }

    const data = await response.json() as any;
    const text = data.responses?.[0]?.fullTextAnnotation?.text || '';
    console.log('[Vision] Extracted text length:', text.length);
    return text;
  } catch (error: any) {
    console.error('[Vision] Error:', error.message);
    return '';
  }
}

// Use AI to parse receipt text into structured items
export async function parseReceiptText(text: string): Promise<ParsedReceipt> {
  console.log('[Receipt] Raw text:', text);

  if (!env.DEEPSEEK_API_KEY) {
    console.log('[Receipt] No DeepSeek API key configured');
    return { items: [], totalAmount: 0n, storeName: 'Store', confidence: 0 };
  }

  const prompt = `You are an expert receipt parser that works with ANY store, country, language, and currency.

CRITICAL PRICE FORMAT DETECTION:
- European format (most of Europe): COMMA is decimal separator
  - "2,49" = 2.49 (two point forty-nine)
  - "12,99" = 12.99 (twelve point ninety-nine)
  - "0,52" = 0.52 (fifty-two cents)
- US/UK format: DOT is decimal separator
  - "2.49" = 2.49
- IMPORTANT: A price like "2,45" is NEVER 245! It's always 2.45

Detect the format from context (currency symbols, country, store name) and convert ALL prices to dot-decimal in your output.

Return ONLY valid JSON:
{"store":"Store Name","items":[{"name":"item name","price":2.49,"qty":1}],"total":51.18}

RULES:
1. STORE NAME: Extract from header/top (any store: Jumbo, Lidl, Walmart, Tesco, Carrefour, etc.)
2. PRICES: Always output as dot-decimal numbers (2.49 not "2,49")
3. QUANTITY: Look for patterns like "2x", "x2", "2 ST", "2 STK", "QTY 2", "2 @". Default is 1.
4. When qty > 1: price should be line total (not unit price)
5. DISCOUNTS: Include as negative prices (korting, discount, rabatt, desconto, remise, etc.)
6. Clean item names: remove product codes, barcodes, weird characters

EXCLUDE from items:
- Tax lines (BTW, VAT, TVA, IVA, MwSt, GST)
- Payment info (PIN, card, cash, change, paid, balance)
- Subtotals that aren't the final total

INCLUDE as items:
- ALL products with prices
- Bags (any language: draagtas, bag, sac, bolsa, Tute)
- Deposits (statiegeld, deposit, consigne, pfand)
- Discounts as negative prices

VALIDATION: Sum of item prices MUST equal total. Double-check each price conversion.

Receipt text:
${text}`;

  try {
    console.log('[Receipt] Using DeepSeek for parsing');
    const response = await generateDeepSeekResponse({
      systemPrompt: 'You extract receipt data into JSON. Output only valid JSON, no markdown.',
      userMessage: prompt,
    });

    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[Receipt] No JSON in response');
      return { items: [], totalAmount: 0n, storeName: 'Store', confidence: 0 };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    let items: ReceiptItem[] = (parsed.items || []).map((i: any) => ({
      name: String(i.name || '').substring(0, 100),
      amount: BigInt(Math.round((Number(i.price) || 0) * 100)),
      quantity: Number(i.qty) || 1,
    }));

    const totalAmount = BigInt(Math.round((Number(parsed.total) || 0) * 100));
    const storeName = String(parsed.store || 'Store').substring(0, 50);

    // Validate and auto-correct: if sum is too low, some prices may have been parsed wrong
    let itemsSum = items.reduce((sum, item) => sum + item.amount, 0n);
    const diff = Number(totalAmount - itemsSum);

    // If items sum is significantly less than total, try to fix misparses
    if (diff > 100 && totalAmount > 0n) { // More than 1 euro missing
      console.log('[Receipt] Attempting price correction. Missing:', diff, 'cents');

      // Sort items by price to try fixing smallest first (likely misparses)
      const itemsWithIndex = items.map((item, idx) => ({ item, idx, originalAmount: item.amount }));
      itemsWithIndex.sort((a, b) => Number(a.item.amount - b.item.amount));

      let remaining = diff;
      for (const { item, originalAmount } of itemsWithIndex) {
        if (remaining <= 50) break; // Close enough

        const currentPrice = Number(originalAmount);
        // If price is under 1 euro and multiplying by 10 would help close the gap
        if (currentPrice > 0 && currentPrice < 100) {
          const correctedPrice = currentPrice * 10;
          const priceIncrease = correctedPrice - currentPrice;

          // Only apply if this correction helps and doesn't overshoot too much
          if (priceIncrease <= remaining + 50) {
            console.log(`[Receipt] Correcting ${item.name}: ${currentPrice} -> ${correctedPrice} cents`);
            item.amount = BigInt(correctedPrice);
            remaining -= priceIncrease;
          }
        }
      }

      // Recalculate sum after corrections
      itemsSum = items.reduce((sum, item) => sum + item.amount, 0n);
    }

    const finalDiff = Math.abs(Number(itemsSum - totalAmount));
    const tolerance = Math.max(Number(totalAmount) * 0.05, 50);

    if (finalDiff > tolerance) {
      console.warn('[Receipt] Price mismatch after correction! Items sum:', itemsSum.toString(), 'Total:', totalAmount.toString(), 'Diff:', finalDiff);
    }

    console.log('[Receipt] Parsed store:', storeName, 'items:', items.length, 'Total:', totalAmount.toString(), 'Items sum:', itemsSum.toString());

    return {
      items,
      totalAmount,
      storeName,
      confidence: items.length > 3 ? 0.9 : items.length > 0 ? 0.6 : 0.0,
    };
  } catch (error: any) {
    console.error('[Receipt] AI parse failed:', error.message);
    return { items: [], totalAmount: 0n, storeName: 'Store', confidence: 0 };
  }
}

// Process receipt image: OCR then AI parsing
export async function processReceipt(imagePath: string): Promise<ParsedReceipt> {
  try {
    const text = await extractReceiptText(imagePath);
    if (!text) {
      return { items: [], totalAmount: 0n, storeName: 'Store', confidence: 0 };
    }
    return await parseReceiptText(text);
  } catch (error: any) {
    console.error('[Receipt] Processing failed:', error.message);
    return { items: [], totalAmount: 0n, storeName: 'Store', confidence: 0 };
  }
}
