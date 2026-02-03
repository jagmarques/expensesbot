import { Context } from 'grammy';
import { getDatabase } from '../database/db';

/**
 * Manage message lifecycle: delete old messages, keep chat clean
 */

export async function deleteUserMessage(ctx: Context): Promise<void> {
  try {
    if (ctx.message?.message_id) {
      await ctx.api.deleteMessage(ctx.chat!.id, ctx.message.message_id);
    }
  } catch (error: any) {
    // Silently fail if message already deleted or permissions issue
    console.debug('[MessageManager] Could not delete user message:', error.message);
  }
}

export async function deletePreviousBotMessage(userId: string): Promise<void> {
  try {
    const db = getDatabase();
    const stmt = db.prepare(
      'SELECT last_bot_message_id FROM user_settings WHERE user_id = ?'
    );
    const user = stmt.get(userId) as any;

    if (user?.last_bot_message_id) {
      // Would need chat_id to delete, so skip for now
      // This would require storing both message_id and chat_id
      console.debug('[MessageManager] Tracking last message for cleanup');
    }
  } catch (error: any) {
    console.debug('[MessageManager] Could not delete previous message:', error.message);
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
  } catch (error: any) {
    console.debug('[MessageManager] Could not store message ID:', error.message);
  }
}

/**
 * Delete message with error handling
 */
export async function deleteMessage(
  ctx: Context,
  chatId: number | string,
  messageId: number
): Promise<boolean> {
  try {
    await ctx.api.deleteMessage(chatId, messageId);
    return true;
  } catch (error: any) {
    console.debug('[MessageManager] Delete failed:', error.message);
    return false;
  }
}

/**
 * Send fresh response: delete old, send new
 */
export async function sendFreshResponse(
  ctx: Context,
  userId: string,
  message: string,
  options?: any
): Promise<any> {
  try {
    // Delete user's command message
    await deleteUserMessage(ctx);

    // Send fresh message
    const response = await ctx.reply(message, options);
    await storeBotMessageId(ctx, userId, response.message_id);
    return response;
  } catch (error: any) {
    console.error('[MessageManager] Error sending fresh response:', error.message);
    // Fallback: just send message
    return await ctx.reply(message, options);
  }
}

/**
 * Edit previous message if it exists
 */
export async function editPreviousMessage(
  ctx: Context,
  userId: string,
  newText: string
): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare(
      'SELECT last_bot_message_id, last_chat_id FROM user_settings WHERE user_id = ?'
    );
    const user = stmt.get(userId) as any;

    if (user?.last_bot_message_id && user?.last_chat_id) {
      await ctx.api.editMessageText(
        user.last_chat_id,
        user.last_bot_message_id,
        newText
      );
      return true;
    }

    return false;
  } catch (error: any) {
    console.debug('[MessageManager] Could not edit previous message:', error.message);
    return false;
  }
}
