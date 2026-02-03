import { describe, it, expect } from 'vitest';
import { parseQuickEntry } from '../src/services/expense/quick-entry';

describe('Quick Entry Parser', () => {
  it('should parse "20 coffee" format', () => {
    const result = parseQuickEntry('20 coffee');
    expect(result).not.toBeNull();
    expect(result?.amount).toBe(BigInt(2000)); // 20 * 100 cents
    expect(result?.description).toBe('coffee');
  });

  it('should parse "15.50 gas" format', () => {
    const result = parseQuickEntry('15.50 gas');
    expect(result).not.toBeNull();
    expect(result?.amount).toBe(BigInt(1550)); // 15.50 * 100 cents
    expect(result?.description).toBe('gas');
  });

  it('should parse multi-word descriptions', () => {
    const result = parseQuickEntry('25 coffee at starbucks');
    expect(result).not.toBeNull();
    expect(result?.amount).toBe(BigInt(2500));
    expect(result?.description).toBe('coffee at starbucks');
  });

  it('should return null for invalid format', () => {
    expect(parseQuickEntry('coffee')).toBeNull();
    expect(parseQuickEntry('20')).toBeNull();
    expect(parseQuickEntry('invalid format')).toBeNull();
  });

  it('should return null for zero or negative amounts', () => {
    expect(parseQuickEntry('0 coffee')).toBeNull();
    expect(parseQuickEntry('-5 coffee')).toBeNull();
  });

  it('should handle whitespace', () => {
    const result = parseQuickEntry('  20   coffee  ');
    expect(result).not.toBeNull();
    expect(result?.amount).toBe(BigInt(2000));
  });

  it('should parse decimal amounts correctly', () => {
    const result = parseQuickEntry('99.99 expensive item');
    expect(result).not.toBeNull();
    expect(result?.amount).toBe(BigInt(9999));
  });
});
