import { describe, it, expect } from 'vitest';
import { detectTimezoneFromTime, parseTimezone } from '../src/services/timezone/detector';

describe('Timezone Detection', () => {
  it('should detect timezone from time format', () => {
    const result = detectTimezoneFromTime('14:30');
    expect(result).not.toBeNull();
    expect(result?.offset).toBeDefined();
  });

  it('should return null for invalid time format', () => {
    expect(detectTimezoneFromTime('25:00')).toBeNull();
    expect(detectTimezoneFromTime('14:60')).toBeNull();
    expect(detectTimezoneFromTime('invalid')).toBeNull();
  });

  it('should parse UTC offset format', () => {
    const result1 = parseTimezone('+5');
    const result2 = parseTimezone('-8');

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(result1?.offset).toBe(5);
    expect(result2?.offset).toBe(-8);
  });

  it('should parse city names', () => {
    const result = parseTimezone('Tokyo');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Asia/Tokyo');
  });

  it('should handle London timezone', () => {
    const result = parseTimezone('London');
    expect(result).not.toBeNull();
    expect(result?.offset).toBe(0);
  });

  it('should handle Sydney timezone', () => {
    const result = parseTimezone('Sydney');
    expect(result).not.toBeNull();
    expect(result?.offset).toBe(10);
  });

  it('should return null for unknown city', () => {
    expect(parseTimezone('UnknownCity123')).toBeNull();
  });
});
