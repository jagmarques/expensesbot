import { Context } from 'grammy';
import { getDatabase } from '../database/db';
import { getMainMenuKeyboard } from './buttons';

/**
 * Manage message lifecycle: delete old messages, keep chat clean
 */

export async function deleteUserMessage(ctx: Context): Promise<void> {
  try {
    if (ctx.message?.message_id) {
      await ctx.api.deleteMessage(ctx.chat!.id, ctx.message.message_id);
    }
  } catch {
    // Silently fail if message already deleted or permissions issue
  }
}

export async function deletePreviousBotMessage(ctx: Context, userId: string): Promise<void> {
  try {
    const db = getDatabase();
    const stmt = db.prepare(
      'SELECT last_bot_message_id, last_chat_id FROM user_settings WHERE user_id = ?'
    );
    const user = stmt.get(userId) as any;

    if (user?.last_bot_message_id && user?.last_chat_id) {
      await ctx.api.deleteMessage(user.last_chat_id, user.last_bot_message_id);
    }
  } catch {
    // Silently fail - message may already be deleted
  }
}

export async function storeBotMessageId(
  ctx: Context,
  userId: string,
  messageId: number
): Promise<void> {
  try {
    const db = getDatabase();

    const checkStmt = db.prepare('SELECT user_id FROM user_settings WHERE user_id = ?');
    const exists = checkStmt.get(userId);

    if (exists) {
      const updateStmt = db.prepare(
        'UPDATE user_settings SET last_bot_message_id = ?, last_chat_id = ? WHERE user_id = ?'
      );
      updateStmt.run(messageId, ctx.chat?.id, userId);
    } else {
      const insertStmt = db.prepare(
        'INSERT INTO user_settings (user_id, last_bot_message_id, last_chat_id) VALUES (?, ?, ?)'
      );
      insertStmt.run(userId, messageId, ctx.chat?.id);
    }
  } catch {
    // Silently fail
  }
}

/**
 * Send fresh response: delete old messages, send new with menu
 */
export async function sendFreshResponse(
  ctx: Context,
  userId: string,
  message: string,
  options?: any
): Promise<any> {
  try {
    // Delete user's message
    await deleteUserMessage(ctx);

    // Delete previous bot message
    await deletePreviousBotMessage(ctx, userId);

    // Merge options with main menu keyboard
    const finalOptions = {
      ...options,
      reply_markup: options?.reply_markup || getMainMenuKeyboard(),
    };

    // Send fresh message with menu
    const response = await ctx.reply(message, finalOptions);
    await storeBotMessageId(ctx, userId, response.message_id);
    return response;
  } catch (error: any) {
    console.error('[MessageManager] Error sending fresh response:', error.message);
    return await ctx.reply(message, options);
  }
}
