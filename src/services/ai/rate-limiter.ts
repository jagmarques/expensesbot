import { RateLimitStatus } from '../../types/ai';

const DEEPSEEK_DAILY_LIMIT = 14400;

let dailyCount = 0;
let resetDate = new Date().toISOString().split('T')[0];

export function canMakeRequest(): boolean {
  checkAndResetIfNewDay();
  return dailyCount < DEEPSEEK_DAILY_LIMIT;
}

export function recordRequest(): void {
  checkAndResetIfNewDay();
  dailyCount++;
}

export function getRateLimitStatus(): RateLimitStatus {
  checkAndResetIfNewDay();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    dailyUsed: dailyCount,
    dailyLimit: DEEPSEEK_DAILY_LIMIT,
    isLimited: dailyCount >= DEEPSEEK_DAILY_LIMIT,
    resetsAt: tomorrow.toISOString().split('T')[0],
  };
}

function checkAndResetIfNewDay(): void {
  const today = new Date().toISOString().split('T')[0];
  if (today !== resetDate) {
    resetDate = today;
    dailyCount = 0;
  }
}
