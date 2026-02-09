import { getDatabase } from '../database/db';

export enum UserState {
  IDLE = 'idle',
  WAITING_BUDGET_CATEGORY = 'waiting_budget_category',
  WAITING_BUDGET_AMOUNT = 'waiting_budget_amount',
  WAITING_RECURRING_NAME = 'waiting_recurring_name',
  WAITING_RECURRING_AMOUNT = 'waiting_recurring_amount',
  WAITING_RECURRING_FREQUENCY = 'waiting_recurring_frequency',
  WAITING_TIMEZONE_INPUT = 'waiting_timezone_input',
  WAITING_AI_QUERY = 'waiting_ai_query',
  WAITING_RECEIPT_UPLOAD = 'waiting_receipt_upload',
}

export interface UserContextData {
  userId: string;
  state: UserState;
  data: Record<string, any>;
  createdAt: number;
  expiresAt: number;
}

// In-memory context storage (expires after 5 minutes)
const contextMap = new Map<string, UserContextData>();
const CONTEXT_TTL = 5 * 60 * 1000; // 5 minutes

// Track last menu message ID per user (for deletion when adding expenses)
const lastMenuMap = new Map<string, { chatId: number; messageId: number }>();

export function setLastMenuMessage(userId: string, chatId: number, messageId: number): void {
  lastMenuMap.set(userId, { chatId, messageId });
}

export function getLastMenuMessage(userId: string): { chatId: number; messageId: number } | null {
  return lastMenuMap.get(userId) || null;
}

export function clearLastMenuMessage(userId: string): void {
  lastMenuMap.delete(userId);
}

/**
 * Get current user context
 */
export function getUserContext(userId: string): UserContextData | null {
  const context = contextMap.get(userId);

  if (!context) {
    return null;
  }

  // Check if expired
  if (Date.now() > context.expiresAt) {
    contextMap.delete(userId);
    return null;
  }

  return context;
}

/**
 * Set user context
 */
export function setUserContext(userId: string, state: UserState, data: Record<string, any> = {}): void {
  const now = Date.now();
  contextMap.set(userId, {
    userId,
    state,
    data,
    createdAt: now,
    expiresAt: now + CONTEXT_TTL,
  });
}

/**
 * Update user context data (without changing state)
 */
export function updateUserContextData(userId: string, newData: Record<string, any>): void {
  const context = getUserContext(userId);
  if (context) {
    context.data = { ...context.data, ...newData };
  }
}

/**
 * Clear user context
 */
export function clearUserContext(userId: string): void {
  contextMap.delete(userId);
}

/**
 * Check if user is in specific state
 */
export function isUserInState(userId: string, expectedState: UserState): boolean {
  const context = getUserContext(userId);
  return context?.state === expectedState || false;
}

/**
 * Save user state to database (for persistence across restarts)
 */
export function persistUserContext(userId: string, state: UserState, data: Record<string, any>): void {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO user_context (user_id, state, data, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `);
    stmt.run(userId, state, JSON.stringify(data));
  } catch (error: any) {
    console.debug('[UserContext] Could not persist:', error.message);
  }
}

/**
 * Load user state from database
 */
export function loadUserContext(userId: string): UserContextData | null {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT state, data, created_at FROM user_context WHERE user_id = ?');
    const result = stmt.get(userId) as any;

    if (!result) {
      return null;
    }

    const createdAt = new Date(result.created_at).getTime();
    const expiresAt = createdAt + CONTEXT_TTL;

    // Check if expired
    if (Date.now() > expiresAt) {
      return null;
    }

    return {
      userId,
      state: result.state as UserState,
      data: JSON.parse(result.data || '{}'),
      createdAt,
      expiresAt,
    };
  } catch (error: any) {
    console.debug('[UserContext] Could not load:', error.message);
    return null;
  }
}

/**
 * Clean up expired contexts
 */
export function cleanupExpiredContexts(): void {
  const now = Date.now();
  let count = 0;

  for (const [userId, context] of contextMap.entries()) {
    if (now > context.expiresAt) {
      contextMap.delete(userId);
      count++;
    }
  }

  if (count > 0) {
    console.debug(`[UserContext] Cleaned up ${count} expired contexts`);
  }
}

/**
 * Initialize context database table
 */
export function initializeContextTable(): void {
  try {
    const db = getDatabase();
    db.prepare(`
      CREATE TABLE IF NOT EXISTS user_context (
        user_id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (error: any) {
    console.debug('[UserContext] Table already exists:', error.message);
  }
}
