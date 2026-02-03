export interface ReceiptItem {
  name: string;
  amount: bigint; // in cents
  quantity: number;
}

export interface ParsedReceipt {
  items: ReceiptItem[];
  totalAmount: bigint;
  confidence: number;
}

/**
 * Extract text from receipt image using Vision API
 * NOTE: Requires GOOGLE_VISION_API_KEY and @google-cloud/vision package
 * For now, returns empty - implement when API key is available
 */
export async function extractReceiptText(_imagePath: string): Promise<string> {
  // TODO: Implement Vision API integration when needed
  // Requires: npm install @google-cloud/vision
  return '';
}

/**
 * Parse receipt text to extract items and amounts
 * Basic parser: looks for patterns like "item amount"
 */
export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text.split('\n').filter((line) => line.trim());
  const items: ReceiptItem[] = [];
  let totalAmount = 0n;

  for (const line of lines) {
    // Look for patterns: "item name amount" or "amount item name"
    const match = line.match(/^(.+?)\s+(\d+[.,]\d{2})€?$/i);
    if (match) {
      const itemName = match[1].trim();
      const amountStr = match[2].replace(',', '.');
      const amountCents = BigInt(Math.round(parseFloat(amountStr) * 100));

      if (amountCents > 0n && itemName.length > 1) {
        items.push({
          name: itemName,
          amount: amountCents,
          quantity: 1,
        });
        totalAmount += amountCents;
      }
    }
  }

  // If no items found, try more lenient pattern
  if (items.length === 0) {
    const amountMatches = text.match(/€?\s*(\d+[.,]\d{2})/g);
    if (amountMatches && amountMatches.length > 0) {
      // Use last amount as total
      const lastAmount = amountMatches[amountMatches.length - 1];
      const totalCents = BigInt(Math.round(parseFloat(lastAmount.replace(/[€,]/g, '.')) * 100));

      items.push({
        name: 'Receipt total',
        amount: totalCents,
        quantity: 1,
      });
      totalAmount = totalCents;
    }
  }

  return {
    items,
    totalAmount,
    confidence: items.length > 0 ? 0.7 : 0.0, // Basic confidence score
  };
}

/**
 * Process receipt from Vision API
 */
export async function processReceipt(imagePath: string): Promise<ParsedReceipt> {
  try {
    const text = await extractReceiptText(imagePath);
    return parseReceiptText(text);
  } catch (error: any) {
    console.error('[Receipt] Processing failed:', error.message);
    return {
      items: [],
      totalAmount: 0n,
      confidence: 0,
    };
  }
}
