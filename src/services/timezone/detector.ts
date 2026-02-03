import { getDatabase } from '../database/db';

export interface TimezoneInfo {
  name: string;
  offset: number;
  abbreviation: string;
}

/**
 * Detect timezone from user-provided time (HH:MM)
 * Calculates UTC offset and finds matching IANA timezone
 */
export function detectTimezoneFromTime(userTime: string): TimezoneInfo | null {
  const match = userTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const userHour = parseInt(match[1]);
  const userMinute = parseInt(match[2]);

  if (userHour < 0 || userHour > 23 || userMinute < 0 || userMinute > 59) {
    return null;
  }

  // Get current UTC time
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();

  // Calculate offset in minutes
  let offsetMinutes = userHour * 60 + userMinute - (utcHour * 60 + utcMinute);

  // Adjust for day boundary
  if (offsetMinutes > 12 * 60) {
    offsetMinutes -= 24 * 60;
  } else if (offsetMinutes < -12 * 60) {
    offsetMinutes += 24 * 60;
  }

  // Find matching timezone
  const tzInfo = findTimezoneByOffset(offsetMinutes);
  return tzInfo;
}

/**
 * Find IANA timezone by UTC offset
 * Prefers common timezones
 */
function findTimezoneByOffset(offsetMinutes: number): TimezoneInfo | null {
  const timezones: TimezoneInfo[] = [
    { name: 'Etc/GMT+12', offset: -12, abbreviation: 'IDLW' },
    { name: 'Pacific/Pago_Pago', offset: -11, abbreviation: 'SST' },
    { name: 'Pacific/Honolulu', offset: -10, abbreviation: 'HST' },
    { name: 'America/Anchorage', offset: -9, abbreviation: 'AKST' },
    { name: 'America/Los_Angeles', offset: -8, abbreviation: 'PST' },
    { name: 'America/Denver', offset: -7, abbreviation: 'MST' },
    { name: 'America/Chicago', offset: -6, abbreviation: 'CST' },
    { name: 'America/New_York', offset: -5, abbreviation: 'EST' },
    { name: 'America/Toronto', offset: -4, abbreviation: 'EDT' },
    { name: 'Canada/Newfoundland', offset: -3.5, abbreviation: 'NDT' },
    { name: 'America/Sao_Paulo', offset: -3, abbreviation: 'BRT' },
    { name: 'Atlantic/South_Georgia', offset: -2, abbreviation: 'GST' },
    { name: 'Atlantic/Azores', offset: -1, abbreviation: 'AZOT' },
    { name: 'UTC', offset: 0, abbreviation: 'UTC' },
    { name: 'Europe/London', offset: 1, abbreviation: 'GMT' },
    { name: 'Europe/Paris', offset: 2, abbreviation: 'CEST' },
    { name: 'Europe/Moscow', offset: 3, abbreviation: 'MSK' },
    { name: 'Asia/Dubai', offset: 4, abbreviation: 'GST' },
    { name: 'Asia/Karachi', offset: 5, abbreviation: 'PKT' },
    { name: 'Asia/Kolkata', offset: 5.5, abbreviation: 'IST' },
    { name: 'Asia/Dhaka', offset: 6, abbreviation: 'BDT' },
    { name: 'Asia/Bangkok', offset: 7, abbreviation: 'ICT' },
    { name: 'Asia/Shanghai', offset: 8, abbreviation: 'CST' },
    { name: 'Asia/Tokyo', offset: 9, abbreviation: 'JST' },
    { name: 'Australia/Sydney', offset: 10, abbreviation: 'AEST' },
    { name: 'Pacific/Guadalcanal', offset: 11, abbreviation: 'SBT' },
    { name: 'Pacific/Fiji', offset: 12, abbreviation: 'FJT' },
  ];

  const hours = offsetMinutes / 60;
  const match = timezones.find((tz) => tz.offset === hours);
  return match || null;
}

/**
 * Parse timezone name or offset from user input
 */
export function parseTimezone(input: string): TimezoneInfo | null {
  // Try parsing as time (HH:MM)
  if (input.includes(':')) {
    return detectTimezoneFromTime(input);
  }

  // Try parsing as offset (+5, -8, etc)
  const offsetMatch = input.match(/^([+-]?)(\d+)$/);
  if (offsetMatch) {
    const offset = parseInt(offsetMatch[0]);
    return findTimezoneByOffset(offset * 60);
  }

  // Try parsing as timezone name (Europe/London, UTC+1, etc)
  const commonNames: Record<string, TimezoneInfo> = {
    'UTC': { name: 'UTC', offset: 0, abbreviation: 'UTC' },
    'London': { name: 'Europe/London', offset: 0, abbreviation: 'GMT' },
    'Paris': { name: 'Europe/Paris', offset: 1, abbreviation: 'CET' },
    'Tokyo': { name: 'Asia/Tokyo', offset: 9, abbreviation: 'JST' },
    'Sydney': { name: 'Australia/Sydney', offset: 10, abbreviation: 'AEST' },
    'NewYork': { name: 'America/New_York', offset: -5, abbreviation: 'EST' },
    'LosAngeles': { name: 'America/Los_Angeles', offset: -8, abbreviation: 'PST' },
  };

  return commonNames[input] || null;
}

/**
 * Format time with user's timezone offset
 */
export function formatTimeWithOffset(date: Date, offsetHours: number): string {
  const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
  const localDate = new Date(utcDate.getTime() + offsetHours * 3600000);

  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  const hours = String(localDate.getHours()).padStart(2, '0');
  const minutes = String(localDate.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Get user's timezone offset from database
 */
export function getUserTimezoneOffset(userId: string): number {
  const db = getDatabase();
  const stmt = db.prepare('SELECT timezone FROM user_settings WHERE user_id = ?');
  const user = stmt.get(userId) as any;

  if (!user || !user.timezone) return 0; // Default to UTC

  // Parse timezone string (e.g., "UTC+1" or "UTC-5")
  const match = user.timezone.match(/^UTC([+-]?\d+(?:\.\d+)?)$/);
  if (match) {
    return parseFloat(match[1]);
  }

  return 0;
}
