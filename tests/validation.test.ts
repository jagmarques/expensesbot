import { describe, it, expect } from 'vitest';
import { BudgetAmountSchema, CategorySchema, RecurringFrequencySchema, validateInput } from '../src/services/validation/schemas';

describe('Input Validation', () => {
  describe('Budget Amount', () => {
    it('should validate positive amounts', () => {
      const result = validateInput(BudgetAmountSchema, '100');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data).toBe(BigInt(10000)); // 100 * 100 cents
      }
    });

    it('should validate decimal amounts', () => {
      const result = validateInput(BudgetAmountSchema, '99.99');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data).toBe(BigInt(9999));
      }
    });

    it('should reject zero', () => {
      const result = validateInput(BudgetAmountSchema, '0');
      expect(result.valid).toBe(false);
    });

    it('should reject negative amounts', () => {
      const result = validateInput(BudgetAmountSchema, '-50');
      expect(result.valid).toBe(false);
    });

    it('should reject invalid format', () => {
      const result = validateInput(BudgetAmountSchema, 'not a number');
      expect(result.valid).toBe(false);
    });
  });

  describe('Category Schema', () => {
    it('should validate valid category names', () => {
      const result = validateInput(CategorySchema, 'groceries');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data).toBe('groceries');
      }
    });

    it('should accept numbers and dashes', () => {
      const result = validateInput(CategorySchema, 'food-and-drinks');
      expect(result.valid).toBe(true);
    });

    it('should reject empty category', () => {
      const result = validateInput(CategorySchema, '');
      expect(result.valid).toBe(false);
    });

    it('should reject special characters', () => {
      const result = validateInput(CategorySchema, 'food@home');
      expect(result.valid).toBe(false);
    });

    it('should trim whitespace', () => {
      const result = validateInput(CategorySchema, '  food  ');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data).toBe('food');
      }
    });
  });

  describe('Recurring Frequency', () => {
    it('should accept valid frequencies', () => {
      const frequencies = ['daily', 'weekly', 'monthly', 'annual'];
      for (const freq of frequencies) {
        const result = validateInput(RecurringFrequencySchema, freq);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject invalid frequency', () => {
      const result = validateInput(RecurringFrequencySchema, 'yearly');
      expect(result.valid).toBe(false);
    });
  });
});
