import { z } from 'zod';

/**
 * Budget amount validation
 */
export const BudgetAmountSchema = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/, 'Must be a valid amount (e.g., 100 or 99.99)')
  .transform((val) => BigInt(Math.round(parseFloat(val) * 100)))
  .refine((val) => val > 0n, 'Amount must be greater than 0')
  .refine((val) => val <= BigInt(999999 * 100), 'Amount too large (max 999999)');

/**
 * Budget category validation
 */
export const CategorySchema = z
  .string()
  .min(1, 'Category name required')
  .max(50, 'Category name too long')
  .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Invalid characters in category name')
  .transform((val) => val.toLowerCase().trim());

/**
 * Recurring expense frequency validation
 */
export const RecurringFrequencySchema = z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annual'], {
  errorMap: () => ({
    message: 'Frequency must be: daily, weekly, biweekly, monthly, quarterly, or annual',
  }),
});

/**
 * Timezone validation
 */
export const TimezoneSchema = z
  .string()
  .regex(/^(UTC[+-]\d{1,2}(?:\.\d)?|\d{1,2}:\d{2}|[A-Za-z_/]+)$/, 'Invalid timezone format')
  .transform((val) => val.trim());

/**
 * Quick entry validation
 */
export const QuickEntrySchema = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?\s+.{1,}$/, 'Format: "20 coffee" or "15.50 gas"')
  .transform((val) => val.trim());

/**
 * AI query validation
 */
export const AIQuerySchema = z
  .string()
  .min(3, 'Query too short')
  .max(500, 'Query too long')
  .transform((val) => val.trim());

/**
 * Export date range validation
 */
export const DateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
});

/**
 * Validate and parse user input safely
 */
export function validateInput<T>(schema: z.ZodSchema<T>, input: string): { valid: true; data: T } | { valid: false; error: string } {
  try {
    const result = schema.parse(input);
    return { valid: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, error: error.errors[0]?.message || 'Invalid input' };
    }
    return { valid: false, error: 'Validation failed' };
  }
}
