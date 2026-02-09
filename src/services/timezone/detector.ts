import { getDatabase } from '../database/db';
import cityTimezones from 'city-timezones';

export interface TimezoneInfo {
  name: string;
  offset: number;
  abbreviation: string;
}

/**
 * Get current UTC offset for a timezone (handles DST)
 */
function getTimezoneOffset(timezoneName: string): number {
  try {
    const now = new Date();
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezoneName }));
    return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60);
  } catch {
    return 0;
  }
}

/**
 * Get timezone abbreviation
 */
function getTimezoneAbbreviation(timezoneName: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezoneName,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart?.value || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Find timezone by UTC offset (hours)
 */
function findTimezoneByOffset(offsetHours: number): TimezoneInfo {
  const rounded = Math.round(offsetHours);
  // Etc/GMT signs are inverted (Etc/GMT-5 = UTC+5)
  const etcOffset = -rounded;
  const tzName = rounded === 0 ? 'UTC' : `Etc/GMT${etcOffset > 0 ? '+' : ''}${etcOffset}`;

  return {
    name: tzName,
    offset: rounded,
    abbreviation: `UTC${rounded >= 0 ? '+' : ''}${rounded}`,
  };
}

/**
 * Parse timezone from city name using city-timezones library
 */
function findTimezoneByCity(cityName: string): TimezoneInfo | null {
  const results = cityTimezones.lookupViaCity(cityName);

  if (results && results.length > 0) {
    const city = results[0];
    const timezoneName = city.timezone;
    const offset = getTimezoneOffset(timezoneName);
    const abbreviation = getTimezoneAbbreviation(timezoneName);

    return {
      name: timezoneName,
      offset,
      abbreviation,
    };
  }

  return null;
}

/**
 * Parse timezone from user input
 * Supports: city name, offset (+5, -8), or time (14:30)
 */
export function parseTimezone(input: string): TimezoneInfo | null {
  const trimmed = input.trim();

  // Handle UTC special case
  if (trimmed.toLowerCase() === 'utc') {
    return { name: 'UTC', offset: 0, abbreviation: 'UTC' };
  }

  // Try parsing as offset (+5, -8, etc)
  const offsetMatch = trimmed.match(/^([+-]?)(\d+)$/);
  if (offsetMatch) {
    const offset = parseInt(offsetMatch[0]);
    return findTimezoneByOffset(offset);
  }

  // Try parsing as time (HH:MM) - calculate offset from current UTC
  if (trimmed.includes(':')) {
    const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const userHour = parseInt(match[1]);
      const userMinute = parseInt(match[2]);

      if (userHour >= 0 && userHour <= 23 && userMinute >= 0 && userMinute <= 59) {
        const now = new Date();
        const utcHour = now.getUTCHours();
        const utcMinute = now.getUTCMinutes();

        let offsetMinutes = userHour * 60 + userMinute - (utcHour * 60 + utcMinute);

        if (offsetMinutes > 12 * 60) offsetMinutes -= 24 * 60;
        if (offsetMinutes < -12 * 60) offsetMinutes += 24 * 60;

        return findTimezoneByOffset(offsetMinutes / 60);
      }
    }
    return null;
  }

  // Try finding city using city-timezones library
  return findTimezoneByCity(trimmed);
}

/**
 * Get user's timezone offset from database
 */
export function getUserTimezoneOffset(userId: string): number {
  const db = getDatabase();
  const stmt = db.prepare('SELECT timezone FROM user_settings WHERE user_id = ?');
  const user = stmt.get(userId) as any;

  if (!user || !user.timezone) return 0;

  try {
    return getTimezoneOffset(user.timezone);
  } catch {
    const match = user.timezone.match(/^UTC([+-]?\d+(?:\.\d+)?)$/);
    if (match) return parseFloat(match[1]);
  }

  return 0;
}
