import { Bot, InputFile, InlineKeyboard } from 'grammy';
import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';
import { handleAIMessage } from '../ai/message-handler';
import { clearConversationHistory } from '../ai/conversation-history';
import { getMonthlyStats, generateReportText, getAllCategoryInflation, getCategoriesWithReceipts, generateCategoryReceiptReport } from '../analytics';
import { setBudgetLimit, getBudgetLimits, checkBudgetStatus, deleteBudgetLimit } from '../budget';
import { addRecurring, getActiveRecurring, getOverdueRecurring } from '../recurring';
import { handleExport } from '../export';
import { parseTimezone } from '../timezone';
import { deleteUserMessage, sendFreshResponse } from './message-manager';
import { getMainMenuKeyboard, getBudgetMenuKeyboard, getRecurringMenuKeyboard, getExportMenuKeyboard, getTimezoneMenuKeyboard, getBackKeyboard, getSettingsMenuKeyboard, getConfirmResetKeyboard, getReceiptsMenuKeyboard } from './buttons';
import { getDatabase, resetUserData } from '../database/db';
import { parseQuickEntry, addQuickExpense, formatAmount } from '../expense/quick-entry';
import { getUserContext, setUserContext, clearUserContext, UserState, setLastMenuMessage, getLastMenuMessage, clearLastMenuMessage } from '../state/user-context';
import { processReceipt } from '../receipt/vision';
import { saveReceiptExpense } from '../receipt/handler';

export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// Show animated thinking message that cycles through dots
async function showThinking(ctx: any): Promise<() => Promise<void>> {
  const chatId = ctx.chat?.id;
  if (!chatId) return async () => {};

  try {
    const frames = ['.', '..', '...'];
    let frameIndex = 0;
    const msg = await ctx.reply(frames[0]);

    const interval = setInterval(async () => {
      frameIndex = (frameIndex + 1) % frames.length;
      try {
        await ctx.api.editMessageText(chatId, msg.message_id, frames[frameIndex]);
      } catch {
        // Ignore edit errors
      }
    }, 400);

    return async () => {
      clearInterval(interval);
      try {
        await ctx.api.deleteMessage(chatId, msg.message_id);
      } catch {
        // Message may already be deleted
      }
    };
  } catch {
    return async () => {};
  }
}

export async function initializeBot(): Promise<void> {
  bot.command('start', async (ctx) => {
    const userId = ctx.from?.id.toString();
    const chatId = ctx.chat?.id;
    const menuMsg = await ctx.reply(
      'Send a receipt photo or type an expense to add it.',
      { reply_markup: getMainMenuKeyboard() }
    );
    if (userId && chatId) {
      setLastMenuMessage(userId, chatId, menuMsg.message_id);
    }
  });

  bot.command('stats', async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply('Unable to identify user');
      return;
    }

    try {
      await deleteUserMessage(ctx);

      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const stats = getMonthlyStats(userId, currentMonth);

      if (stats.expenseCount === 0) {
        await sendFreshResponse(ctx, userId, 'No expenses recorded this month yet. Start tracking by sending receipt photos or using /ai');
        return;
      }

      let fullReport = generateReportText(stats);

      const inflation = getAllCategoryInflation(userId, 30);
      if (inflation.length > 0) {
        fullReport += '\n\nPrice Trends (30 days):\n';
        for (const trend of inflation.slice(0, 5)) {
          const direction = trend.percentChange > 0 ? '↑' : trend.percentChange < 0 ? '↓' : '→';
          fullReport += `- ${trend.categoryName}: ${direction} ${Math.abs(trend.percentChange)}%\n`;
        }
      }

      await sendFreshResponse(ctx, userId, fullReport);
    } catch (error: any) {
      console.error('[Stats] Error:', error.message);
      await deleteUserMessage(ctx);
      await ctx.reply('Unable to generate report. Try again later.');
    }
  });

  bot.command('ai', async (ctx) => {
    const query = ctx.message?.text?.replace('/ai', '').trim() || '';
    if (!query) {
      await ctx.reply('Usage: /ai How much did I spend on food?');
      return;
    }
    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply('Unable to identify user');
      return;
    }
    const hideThinking = await showThinking(ctx);
    try {
      const response = await handleAIMessage(userId, query);
      await hideThinking();
      await ctx.reply(response);
    } catch (e) {
      await hideThinking();
      throw e;
    }
  });

  bot.command('budget', async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply('Unable to identify user');
      return;
    }

    const text = ctx.message?.text || '';
    const [, command, ...args] = text.split(/\s+/);

    if (!command) {
      await ctx.reply('Usage:\n/budget list - Show all budgets\n/budget set <category> <limit> - e.g., /budget set Groceries 500');
      return;
    }

    try {
      if (command === 'list') {
        await deleteUserMessage(ctx);
        const budgets = getBudgetLimits(userId);

        if (budgets.length === 0) {
          await sendFreshResponse(ctx, userId, 'No budgets set. Use /budget set <category> <limit> to create one.');
          return;
        }

        let response = 'Your Monthly Budgets:\n\n';
        for (const budget of budgets) {
          const status = checkBudgetStatus(userId, budget.categoryId);
          if (status) {
            const filled = Math.min(100, status.percentage);
            response += `${status.categoryName}\n`;
            response += `${status.spent}/${status.limit} (${filled}%)\n`;
            if (status.isAlertTriggered) {
              response += 'ALERT: Budget exceeded!\n';
            }
            response += '\n';
          }
        }
        await sendFreshResponse(ctx, userId, response);
      } else if (command === 'set') {
        if (args.length < 2) {
          await ctx.reply('Usage: /budget set <category> <limit>\nExample: /budget set Groceries 500');
          return;
        }

        const categoryName = args.slice(0, -1).join(' ');
        const limit = BigInt(parseInt(args[args.length - 1]));

        if (isNaN(Number(limit))) {
          await ctx.reply('Invalid amount. Please enter a number.');
          return;
        }

        const db = getDatabase();
        const catStmt = db.prepare(`
          SELECT id FROM categories WHERE name = ? AND (user_id = ? OR is_system = 1)
        `);
        const category = catStmt.get(categoryName, userId) as { id: string } | undefined;

        if (!category) {
          await ctx.reply(`Category "${categoryName}" not found. Available: Groceries, Restaurants, Transportation, Entertainment, Health, Shopping, Personal, Bills, Other`);
          return;
        }

        setBudgetLimit(userId, category.id, limit);
        await ctx.reply(`Budget set: ${categoryName} - €${limit}/month`);
      } else if (command === 'delete' || command === 'remove') {
        if (args.length === 0) {
          await ctx.reply('Usage: /budget delete <category>');
          return;
        }

        const categoryName = args.join(' ');
        const db = getDatabase();
        const catStmt = db.prepare(`
          SELECT id FROM categories WHERE name = ? AND (user_id = ? OR is_system = 1)
        `);
        const category = catStmt.get(categoryName, userId) as { id: string } | undefined;

        if (!category) {
          await ctx.reply(`Category "${categoryName}" not found.`);
          return;
        }

        const deleted = deleteBudgetLimit(userId, category.id);
        if (deleted) {
          await ctx.reply(`Budget deleted for ${categoryName}`);
        } else {
          await ctx.reply(`No budget found for ${categoryName}`);
        }
      }
    } catch (error: any) {
      console.error('[Budget] Error:', error.message);
      await ctx.reply('Unable to process budget command. Try again later.');
    }
  });

  bot.command('recurring', async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply('Unable to identify user');
      return;
    }

    const text = ctx.message?.text || '';
    const [, command, ...args] = text.split(/\s+/);

    if (!command) {
      await ctx.reply('Usage:\n/recurring list - Show active recurring expenses\n/recurring add <name> <amount> <frequency> - e.g., /recurring add Netflix 15 monthly');
      return;
    }

    try {
      if (command === 'list') {
        await deleteUserMessage(ctx);
        const active = getActiveRecurring(userId);
        const overdue = getOverdueRecurring(userId);

        if (active.length === 0) {
          await sendFreshResponse(ctx, userId, 'No active recurring expenses. Use /recurring add to create one.');
          return;
        }

        let response = 'Active Recurring Expenses:\n\n';
        for (const recurring of active) {
          const status = overdue.some((r) => r.id === recurring.id) ? ' (DUE TODAY!)' : '';
          response += `${recurring.name} - €${recurring.amount}\n`;
          response += `${recurring.frequency} | Due: ${recurring.nextDueDate}${status}\n\n`;
        }
        await sendFreshResponse(ctx, userId, response);
      } else if (command === 'add') {
        if (args.length < 3) {
          await ctx.reply('Usage: /recurring add <name> <amount> <frequency>\nFrequencies: weekly, biweekly, monthly, quarterly, yearly\nExample: /recurring add Netflix 15 monthly');
          return;
        }

        const amount = BigInt(parseInt(args[args.length - 2]));
        const frequency = args[args.length - 1].toLowerCase();
        const name = args.slice(0, -2).join(' ');

        if (isNaN(Number(amount))) {
          await ctx.reply('Invalid amount. Please enter a number.');
          return;
        }

        const validFrequencies = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];
        if (!validFrequencies.includes(frequency)) {
          await ctx.reply(`Invalid frequency. Use: ${validFrequencies.join(', ')}`);
          return;
        }

        addRecurring(userId, name, amount, frequency);
        await ctx.reply(`Added recurring: ${name} (€${amount} ${frequency})`);
      }
    } catch (error: any) {
      console.error('[Recurring] Error:', error.message);
      await ctx.reply('Unable to process recurring command. Try again later.');
    }
  });

  bot.command('export', async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply('Unable to identify user');
      return;
    }

    const text = ctx.message?.text || '';
    const [, format] = text.split(/\s+/);

    if (!format) {
      await ctx.reply('Usage:\n/export csv - Download expenses as CSV\n/export pdf - Download expenses as PDF');
      return;
    }

    try {
      if (format.toLowerCase() === 'csv') {
        const result = await handleExport({
          userId,
          format: 'csv',
        });

        if (result.success && result.data) {
          const csvBuffer = Buffer.from(result.data as string);
          const file = new InputFile(csvBuffer);
          await ctx.replyWithDocument(file);
        } else {
          await ctx.reply(result.message);
        }
      } else if (format.toLowerCase() === 'pdf') {
        const result = await handleExport({
          userId,
          format: 'pdf',
        });

        if (result.success && result.data) {
          const file = new InputFile(result.data as Buffer);
          await ctx.replyWithDocument(file);
        } else {
          await ctx.reply(result.message);
        }
      } else {
        await ctx.reply('Invalid format. Use: /export csv or /export pdf');
      }
    } catch (error: any) {
      console.error('[Export] Error:', error.message);
      await ctx.reply('Unable to export data. Try again later.');
    }
  });

  bot.command('timezone', async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply('Unable to identify user');
      return;
    }

    const text = ctx.message?.text || '';
    const input = text.split(/\s+/).slice(1).join(' ').trim();

    if (!input) {
      const db = getDatabase();
      const stmt = db.prepare('SELECT timezone FROM user_settings WHERE user_id = ?');
      const user = stmt.get(userId) as any;
      const currentTz = user?.timezone || 'UTC';
      await ctx.reply(
        `Set your timezone:\n\nOptions:\n- Time: /timezone 14:30 (current time)\n- Offset: /timezone +5 or /timezone -8\n- Name: /timezone Tokyo or /timezone London\n\nYour current: ${currentTz}`
      );
      return;
    }

    try {
      await deleteUserMessage(ctx);

      // Parse timezone from input (city, offset, or time)
      const tzInfo = parseTimezone(input);

      if (!tzInfo) {
        await sendFreshResponse(ctx, userId, 'Invalid timezone. Try:\n- /timezone 14:30 (current time)\n- /timezone +5 (UTC offset)\n- /timezone Tokyo');
        return;
      }

      const db = getDatabase();
      const tzString = `UTC${tzInfo.offset >= 0 ? '+' : ''}${tzInfo.offset}`;

      const checkStmt = db.prepare('SELECT user_id FROM user_settings WHERE user_id = ?');
      const exists = checkStmt.get(userId);

      if (exists) {
        const updateStmt = db.prepare('UPDATE user_settings SET timezone = ? WHERE user_id = ?');
        updateStmt.run(tzString, userId);
      } else {
        const insertStmt = db.prepare('INSERT INTO user_settings (user_id, timezone) VALUES (?, ?)');
        insertStmt.run(userId, tzString);
      }

      const menuMessage = `Timezone set to ${tzString} (${tzInfo.name})\n\nSend a receipt photo or type an expense to add it.`;

      await sendFreshResponse(ctx, userId, menuMessage);
    } catch (error: any) {
      console.error('[Timezone] Error:', error.message);
      await deleteUserMessage(ctx);
      await ctx.reply('Unable to set timezone. Try again.');
    }
  });

  /**
   * Button UI Callbacks - Primary interaction method
   */
  bot.on('callback_query:data', async (ctx) => {
    const action = ctx.callbackQuery.data;
    const userId = ctx.from?.id.toString();

    if (!userId) {
      await ctx.answerCallbackQuery();
      return;
    }

    try {
      switch (action) {
        case 'stats': {
          await ctx.answerCallbackQuery();
          const now = new Date();
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const categories = getCategoriesWithReceipts(userId, currentMonth);

          if (categories.length === 0) {
            await ctx.editMessageText('No expenses this month yet.\n\nSend a receipt photo or type an expense to add it.',
              { reply_markup: getBackKeyboard() });
            return;
          }

          const report = generateCategoryReceiptReport(categories);
          await ctx.editMessageText(report, { reply_markup: getBackKeyboard() });
          break;
        }

        case 'receipts':
          await ctx.answerCallbackQuery();
          await ctx.editMessageText('Receipts\n\nUpload a new receipt or view existing ones:',
            { reply_markup: getReceiptsMenuKeyboard() });
          break;

        case 'receipt_upload':
          await ctx.answerCallbackQuery();
          setUserContext(userId, UserState.WAITING_RECEIPT_UPLOAD, {
            chatId: ctx.chat?.id,
            promptMsgId: ctx.callbackQuery.message?.message_id
          });
          await ctx.editMessageText('Send a photo of your receipt:',
            { reply_markup: getBackKeyboard() });
          break;

        case 'receipt_list': {
          await ctx.answerCallbackQuery();
          console.log('[Receipt List] User:', userId);

          try {
            const db = getDatabase();
            const stmt = db.prepare(`
              SELECT e.id, e.total_amount, e.created_at, COUNT(i.id) as item_count
              FROM expenses e
              LEFT JOIN items i ON i.expense_id = e.id
              WHERE e.user_id = ? AND e.source = 'receipt'
              GROUP BY e.id
              ORDER BY e.created_at DESC
              LIMIT 10
            `);
            const receipts = stmt.all(userId) as any[];
            console.log('[Receipt List] Found receipts:', receipts.length);

            if (receipts.length === 0) {
              console.log('[Receipt List] No receipts, showing empty message');
              await ctx.editMessageText('You have no receipts yet.\n\nUse "Upload New" to add your first receipt.',
                { reply_markup: getReceiptsMenuKeyboard() });
              break;
            }

            const keyboard = new InlineKeyboard();
            for (const r of receipts) {
              const date = new Date(r.created_at).toLocaleDateString();
              keyboard.text(`${date} - ${formatAmount(BigInt(r.total_amount))}`, `receipt_view_${r.id}`).row();
            }
            keyboard.text('« Back', 'receipts');

            await ctx.editMessageText('Select a receipt to view details:', { reply_markup: keyboard });
          } catch (err: any) {
            console.error('[Receipt List] Error:', err.message);
            await ctx.editMessageText('Error loading receipts.', { reply_markup: getReceiptsMenuKeyboard() });
          }
          break;
        }

        case 'recurring':
          await ctx.answerCallbackQuery();
          await ctx.editMessageText('Recurring Expenses\n\nWhat would you like to do?',
            { reply_markup: getRecurringMenuKeyboard() });
          break;

        case 'recurring_list': {
          await ctx.answerCallbackQuery();
          const active = getActiveRecurring(userId);

          if (active.length === 0) {
            await ctx.editMessageText('No recurring expenses yet.',
              { reply_markup: getBackKeyboard() });
            return;
          }

          let response = 'Active Recurring Expenses:\n\n';
          for (const recurring of active) {
            response += `${recurring.name} - EUR ${recurring.amount}\n`;
            response += `${recurring.frequency} | Due: ${recurring.nextDueDate}\n\n`;
          }

          await ctx.editMessageText(response, { reply_markup: getBackKeyboard() });
          break;
        }

        case 'export':
          await ctx.answerCallbackQuery();
          await ctx.editMessageText('Export Your Expenses\n\nChoose format:',
            { reply_markup: getExportMenuKeyboard() });
          break;

        case 'export_csv': {
          await ctx.answerCallbackQuery();
          const chatIdCsv = ctx.chat?.id;
          const msgIdCsv = ctx.callbackQuery.message?.message_id;
          const hideThinkingCsv = await showThinking(ctx);
          try {
            const result = await handleExport({ userId, format: 'csv' });
            await hideThinkingCsv();
            if (result.success && result.data) {
              const csvBuffer = Buffer.from(result.data as string);
              const { InputFile: IFile } = await import('grammy');
              const file = new IFile(csvBuffer, result.fileName || 'expenses.csv');
              // Delete old menu first
              if (chatIdCsv && msgIdCsv) {
                try { await ctx.api.deleteMessage(chatIdCsv, msgIdCsv); } catch {}
              }
              await ctx.replyWithDocument(file);
              await ctx.reply('CSV export sent!', { reply_markup: getBackKeyboard() });
            }
          } catch {
            await hideThinkingCsv();
          }
          break;
        }

        case 'export_pdf': {
          await ctx.answerCallbackQuery();
          const chatIdPdf = ctx.chat?.id;
          const msgIdPdf = ctx.callbackQuery.message?.message_id;
          const hideThinkingPdf = await showThinking(ctx);
          try {
            const result = await handleExport({ userId, format: 'pdf' });
            await hideThinkingPdf();
            if (result.success && result.data) {
              const { InputFile: IFile } = await import('grammy');
              const file = new IFile(result.data as Buffer, result.fileName || 'expenses.pdf');
              // Delete old menu first
              if (chatIdPdf && msgIdPdf) {
                try { await ctx.api.deleteMessage(chatIdPdf, msgIdPdf); } catch {}
              }
              await ctx.replyWithDocument(file);
              await ctx.reply('PDF export sent!', { reply_markup: getBackKeyboard() });
            }
          } catch {
            await hideThinkingPdf();
          }
          break;
        }

        case 'ai': {
          await ctx.answerCallbackQuery();
          const aiPromptMsg = await ctx.editMessageText('Ask me anything about your spending:',
            { reply_markup: getBackKeyboard() });
          const promptMsgId = typeof aiPromptMsg === 'object' && 'message_id' in aiPromptMsg ? aiPromptMsg.message_id : undefined;
          setUserContext(userId, UserState.WAITING_AI_QUERY, { chatId: ctx.chat?.id, promptMessageId: promptMsgId });
          break;
        }

        case 'timezone':
          await ctx.answerCallbackQuery();
          await ctx.editMessageText('Set Your Timezone\n\nHow would you like to set it?',
            { reply_markup: getTimezoneMenuKeyboard() });
          break;

        case 'tz_time':
          await ctx.answerCallbackQuery();
          setUserContext(userId, UserState.WAITING_TIMEZONE_INPUT, { type: 'time' });
          await ctx.editMessageText('Enter your current time (e.g., 14:30)\n\nI\'ll auto-detect your timezone!',
            { reply_markup: getBackKeyboard() });
          break;

        case 'tz_city':
          await ctx.answerCallbackQuery();
          setUserContext(userId, UserState.WAITING_TIMEZONE_INPUT, { type: 'city' });
          await ctx.editMessageText('Enter city name (e.g., Tokyo, London, New York)',
            { reply_markup: getBackKeyboard() });
          break;

        case 'tz_offset':
          await ctx.answerCallbackQuery();
          setUserContext(userId, UserState.WAITING_TIMEZONE_INPUT, { type: 'offset' });
          await ctx.editMessageText('Enter UTC offset (e.g., +5, -8)',
            { reply_markup: getBackKeyboard() });
          break;

        case 'budget_set':
          await ctx.answerCallbackQuery();
          setUserContext(userId, UserState.WAITING_BUDGET_CATEGORY, {});
          await ctx.editMessageText('Enter category name (e.g., food, transport):',
            { reply_markup: getBackKeyboard() });
          break;

        case 'budget_delete':
          await ctx.answerCallbackQuery();
          const budgetsToDelete = getBudgetLimits(userId);
          if (budgetsToDelete.length === 0) {
            await ctx.editMessageText('No budgets to delete.',
              { reply_markup: getBudgetMenuKeyboard() });
          } else {
            setUserContext(userId, UserState.WAITING_BUDGET_CATEGORY, { action: 'delete' });
            await ctx.editMessageText('Which budget do you want to delete?\n\nReply with the category name:',
              { reply_markup: getBackKeyboard() });
          }
          break;

        case 'recurring_add':
          await ctx.answerCallbackQuery();
          setUserContext(userId, UserState.WAITING_RECURRING_NAME, {});
          await ctx.editMessageText('Enter recurring expense name (e.g., netflix):',
            { reply_markup: getBackKeyboard() });
          break;

        case 'settings':
          await ctx.answerCallbackQuery();
          await ctx.editMessageText('Settings\n\nConfigure your preferences:',
            { reply_markup: getSettingsMenuKeyboard() });
          break;

        case 'restart':
          await ctx.answerCallbackQuery();
          await ctx.editMessageText('Are you sure you want to delete ALL your data?\n\nThis will remove:\n- All expenses\n- All items\n- All budgets\n- All recurring expenses\n\nThis action cannot be undone!',
            { reply_markup: getConfirmResetKeyboard() });
          break;

        case 'confirm_reset': {
          await ctx.answerCallbackQuery();
          const success = resetUserData(userId);
          if (success) {
            await ctx.editMessageText('All data has been deleted.\n\nSend a receipt photo or type an expense to add it.',
              { reply_markup: getBackKeyboard() });
          } else {
            await ctx.editMessageText('Failed to reset data. Please try again.',
              { reply_markup: getBackKeyboard() });
          }
          break;
        }

        case 'back_main': {
          await ctx.answerCallbackQuery();
          const chatId = ctx.chat?.id;
          const currentMsgId = ctx.callbackQuery.message?.message_id;

          // Delete AI chat messages if coming from AI mode
          const context = getUserContext(userId);
          if (context?.data && chatId) {
            if (context.data.responseMessageId) {
              try {
                await ctx.api.deleteMessage(chatId, context.data.responseMessageId);
              } catch {}
            }
          }

          // Delete the current message (the prompt with Back button)
          if (chatId && currentMsgId) {
            try {
              await ctx.api.deleteMessage(chatId, currentMsgId);
            } catch {}
          }

          clearUserContext(userId);
          clearConversationHistory(userId);

          // Send fresh main menu and track it
          const menuMsg = await ctx.reply('Send a receipt photo or type an expense to add it.',
            { reply_markup: getMainMenuKeyboard() });
          if (chatId) {
            setLastMenuMessage(userId, chatId, menuMsg.message_id);
          }
          break;
        }

        default:
          // Handle dynamic receipt view
          if (action.startsWith('receipt_view_')) {
            await ctx.answerCallbackQuery();
            const receiptId = action.replace('receipt_view_', '');
            const db = getDatabase();

            // Get receipt info
            const receiptStmt = db.prepare(`
              SELECT total_amount, created_at FROM expenses WHERE id = ? AND user_id = ?
            `);
            const receipt = receiptStmt.get(receiptId, userId) as any;

            if (!receipt) {
              await ctx.editMessageText('Receipt not found.', { reply_markup: getReceiptsMenuKeyboard() });
              break;
            }

            // Get items
            const itemsStmt = db.prepare(`
              SELECT item_name, total_price, quantity FROM items WHERE expense_id = ?
            `);
            const items = itemsStmt.all(receiptId) as any[];

            const date = new Date(receipt.created_at).toLocaleDateString();
            let response = `Receipt from ${date}\n\n`;

            for (const item of items) {
              const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
              response += `- ${item.item_name}${qty}: ${formatAmount(BigInt(item.total_price))}\n`;
            }

            response += `\nTotal: ${formatAmount(BigInt(receipt.total_amount))}`;

            const keyboard = new InlineKeyboard()
              .text('« Back to Receipts', 'receipt_list');

            await ctx.editMessageText(response, { reply_markup: keyboard });
          } else {
            await ctx.answerCallbackQuery();
          }
      }
    } catch (error: any) {
      console.error('[Callback] Error:', error.message);
      await ctx.answerCallbackQuery();
    }
  });

  bot.on('message:text', async (ctx) => {
    const text = ctx.message?.text;
    const userId = ctx.from?.id.toString();

    if (!userId || !text) {
      return;
    }

    if (text.startsWith('/')) {
      return;
    }

    // Check if user is in a context-aware state
    const userContext = getUserContext(userId);
    if (userContext) {
      try {
        switch (userContext.state) {
          case UserState.WAITING_TIMEZONE_INPUT: {
            const tzInfo = parseTimezone(text);

            if (!tzInfo) {
              await ctx.reply('Invalid timezone. Try: 14:30 (time), Tokyo (city), or +5 (offset)',
                { reply_markup: getBackKeyboard() });
              return;
            }

            const db = getDatabase();
            const updateStmt = db.prepare('UPDATE user_settings SET timezone = ? WHERE user_id = ?');
            updateStmt.run(`UTC${tzInfo.offset >= 0 ? '+' : ''}${tzInfo.offset}`, userId);

            clearUserContext(userId);
            await ctx.reply(`Timezone set to ${tzInfo.name} (UTC${tzInfo.offset >= 0 ? '+' : ''}${tzInfo.offset})`,
              { reply_markup: getMainMenuKeyboard() });
            return;
          }

          case UserState.WAITING_BUDGET_CATEGORY: {
            const isDelete = userContext.data.action === 'delete';
            const categoryName = text.toLowerCase().trim();

            if (isDelete) {
              const db = getDatabase();
              const catStmt = db.prepare('SELECT id FROM categories WHERE name = ? AND (user_id = ? OR is_system = 1)');
              const category = catStmt.get(categoryName, userId) as any;

              if (!category) {
                await ctx.reply(`Category not found. Available: Groceries, Restaurants, Transportation, Entertainment, Health, Shopping, Personal, Bills, Other`,
                  { reply_markup: getBackKeyboard() });
                return;
              }

              const deleted = deleteBudgetLimit(userId, category.id);
              clearUserContext(userId);
              await ctx.reply(deleted ? `Budget deleted for ${categoryName}` : `No budget found for ${categoryName}`,
                { reply_markup: getMainMenuKeyboard() });
            } else {
              // Setting budget - wait for amount next
              setUserContext(userId, UserState.WAITING_BUDGET_AMOUNT, { category: categoryName });
              await ctx.reply(`Enter monthly limit for ${categoryName} (e.g., 500):`,
                { reply_markup: getBackKeyboard() });
            }
            return;
          }

          case UserState.WAITING_BUDGET_AMOUNT: {
            const categoryName = userContext.data.category;
            const amountStr = text.trim();
            const amount = BigInt(parseInt(amountStr) * 100);

            if (isNaN(Number(amountStr)) || amount <= 0n) {
              await ctx.reply('Invalid amount. Enter a positive number.',
                { reply_markup: getBackKeyboard() });
              return;
            }

            const db = getDatabase();
            const catStmt = db.prepare('SELECT id FROM categories WHERE name = ? AND (user_id = ? OR is_system = 1)');
            const category = catStmt.get(categoryName, userId) as any;

            if (!category) {
              await ctx.reply(`Category not found.`,
                { reply_markup: getMainMenuKeyboard() });
              clearUserContext(userId);
              return;
            }

            setBudgetLimit(userId, category.id, amount);
            clearUserContext(userId);
            await ctx.reply(`Budget set: ${categoryName} - €${amount / 100n}/month`,
              { reply_markup: getMainMenuKeyboard() });
            return;
          }

          case UserState.WAITING_RECURRING_NAME: {
            const name = text.trim();
            if (name.length < 2) {
              await ctx.reply('Name too short. Use at least 2 characters.',
                { reply_markup: getBackKeyboard() });
              return;
            }

            setUserContext(userId, UserState.WAITING_RECURRING_AMOUNT, { name });
            await ctx.reply(`Enter amount for "${name}" (e.g., 10.99):`,
              { reply_markup: getBackKeyboard() });
            return;
          }

          case UserState.WAITING_RECURRING_AMOUNT: {
            const name = userContext.data.name;
            const amountStr = text.trim();
            const amount = BigInt(Math.round(parseFloat(amountStr) * 100));

            if (isNaN(Number(amountStr)) || amount <= 0n) {
              await ctx.reply('Invalid amount. Enter a positive number.',
                { reply_markup: getBackKeyboard() });
              return;
            }

            setUserContext(userId, UserState.WAITING_RECURRING_FREQUENCY, { name, amount });
            await ctx.reply(`Enter frequency (daily/weekly/monthly/quarterly/annual):`,
              { reply_markup: getBackKeyboard() });
            return;
          }

          case UserState.WAITING_RECURRING_FREQUENCY: {
            const name = userContext.data.name;
            const amount = BigInt(userContext.data.amount);
            const frequency = text.toLowerCase().trim();

            if (!['daily', 'weekly', 'monthly', 'quarterly', 'annual'].includes(frequency)) {
              await ctx.reply('Invalid frequency. Options: daily, weekly, monthly, quarterly, annual',
                { reply_markup: getBackKeyboard() });
              return;
            }

            addRecurring(userId, name, amount, frequency);
            clearUserContext(userId);
            await ctx.reply(`Recurring expense added: ${name} - €${amount / 100n} ${frequency}`,
              { reply_markup: getMainMenuKeyboard() });
            return;
          }

          case UserState.WAITING_AI_QUERY: {
            const chatId = ctx.chat?.id;
            const hideThinking = await showThinking(ctx);
            try {
              const response = await handleAIMessage(userId, text);
              await hideThinking();

              // Delete the old AI response message
              if (chatId && userContext.data.responseMessageId) {
                try {
                  await ctx.api.deleteMessage(chatId, userContext.data.responseMessageId);
                } catch {}
              }

              // Delete the old prompt message
              if (chatId && userContext.data.promptMessageId) {
                try {
                  await ctx.api.deleteMessage(chatId, userContext.data.promptMessageId);
                } catch {}
              }

              // Delete user's question message
              if (ctx.message?.message_id) {
                try {
                  await ctx.api.deleteMessage(chatId!, ctx.message.message_id);
                } catch {}
              }

              // Send the AI response
              const responseMsg = await ctx.reply(response);

              // Send fresh prompt
              const newPromptMsg = await ctx.reply('Ask me anything about your spending:',
                { reply_markup: getBackKeyboard() });
              setUserContext(userId, UserState.WAITING_AI_QUERY, {
                chatId,
                promptMessageId: newPromptMsg.message_id,
                responseMessageId: responseMsg.message_id,
              });
            } catch (e) {
              await hideThinking();
              throw e;
            }
            return;
          }
        }
      } catch (error: any) {
        console.error('[StateHandler] Error:', error.message);
        clearUserContext(userId);
        await ctx.reply('An error occurred. Please try again.');
        return;
      }
    }

    // No context - try quick entry format (AI-powered parsing)
    const chatId = ctx.chat?.id;
    const userMsgId = ctx.message?.message_id;

    // Show thinking animation
    const hideThinking = await showThinking(ctx);

    try {
      const quickEntry = await parseQuickEntry(text);
      if (quickEntry) {
        const success = await addQuickExpense(userId, quickEntry.description, quickEntry.amount, quickEntry.currency);
        await hideThinking();

        // Delete user's message
        if (chatId && userMsgId) {
          try { await ctx.api.deleteMessage(chatId, userMsgId); } catch {}
        }

        // Delete old menu message
        const lastMenu = getLastMenuMessage(userId);
        if (lastMenu) {
          try { await ctx.api.deleteMessage(lastMenu.chatId, lastMenu.messageId); } catch {}
          clearLastMenuMessage(userId);
        }

        if (success) {
          const amt = Number(quickEntry.amount) / 100;
          await ctx.reply(
            `Added: ${quickEntry.description}\nAmount: ${amt.toFixed(2)} ${quickEntry.currency}\n\nSend a receipt photo or type an expense to add it.`,
            { reply_markup: getBackKeyboard() }
          );
          return;
        }
      } else {
        await hideThinking();
      }
    } catch {
      await hideThinking();
    }

    // Delete user message and show menu for unrecognized input
    if (chatId && userMsgId) {
      try { await ctx.api.deleteMessage(chatId, userMsgId); } catch {}
    }
    await ctx.reply('Use the menu or type an expense.',
      { reply_markup: getMainMenuKeyboard() });
  });

  // Handle receipt photo uploads - only when in upload mode
  bot.on('message:photo', async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply('Unable to identify user');
      return;
    }

    // Check if user is in receipt upload mode
    const userContext = getUserContext(userId);
    if (!userContext || userContext.state !== UserState.WAITING_RECEIPT_UPLOAD) {
      // Delete the photo message
      const chatId = ctx.chat?.id;
      const msgId = ctx.message?.message_id;
      if (chatId && msgId) {
        try { await ctx.api.deleteMessage(chatId, msgId); } catch {}
      }
      await ctx.reply('Use the Receipts menu to upload a receipt.',
        { reply_markup: getMainMenuKeyboard() });
      return;
    }

    const chatId = ctx.chat?.id;
    const photoMsgId = ctx.message?.message_id;
    const promptMsgId = userContext.data?.promptMsgId;

    // Helper to delete photo message
    const deletePhoto = async () => {
      if (chatId && photoMsgId) {
        try { await ctx.api.deleteMessage(chatId, photoMsgId); } catch {}
      }
    };

    // Helper to delete the "Send a photo" prompt message
    const deletePrompt = async () => {
      if (chatId && promptMsgId) {
        try { await ctx.api.deleteMessage(chatId, promptMsgId); } catch {}
      }
    };

    try {
      if (!env.GOOGLE_VISION_API_KEY) {
        await deletePhoto();
        clearUserContext(userId);
        await ctx.reply('Vision API not configured. Use typing an expense',
          { reply_markup: getMainMenuKeyboard() });
        return;
      }

      const hideThinking = await showThinking(ctx);

      try {
        // Get the largest photo
        const photos = ctx.message?.photo;
        if (!photos || photos.length === 0) {
          await hideThinking();
          await deletePhoto();
          clearUserContext(userId);
          await ctx.reply('No photo found', { reply_markup: getReceiptsMenuKeyboard() });
          return;
        }
        const photo = photos[photos.length - 1];

        // Download the photo
        const file = await ctx.api.getFile(photo.file_id);
        if (!file.file_path) {
          await hideThinking();
          await deletePhoto();
          clearUserContext(userId);
          await ctx.reply('Could not download photo', { reply_markup: getReceiptsMenuKeyboard() });
          return;
        }

        const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        const response = await fetch(fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());

        // Save temporarily
        const tempDir = path.join(process.cwd(), 'data', 'receipts', userId);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        const tempPath = path.join(tempDir, `${Date.now()}.jpg`);
        fs.writeFileSync(tempPath, buffer);

        // Process with Vision API
        const result = await processReceipt(tempPath);

        if (result.items.length === 0) {
          await hideThinking();
          clearUserContext(userId);
          await deletePrompt();
          await deletePhoto();
          await ctx.reply('Could not read receipt. Try typing an expense',
            { reply_markup: getMainMenuKeyboard() });
          return;
        }

        // Save to database
        const saved = await saveReceiptExpense(userId, result.items, result.totalAmount, result.storeName);

        // Hide thinking animation after everything is done
        await hideThinking();
        clearUserContext(userId);

        if (saved) {
          let itemList = result.items.map(i => `- ${i.name}: ${formatAmount(i.amount)}`).join('\n');
          if (itemList.length > 300) {
            itemList = result.items.slice(0, 5).map(i => `- ${i.name}: ${formatAmount(i.amount)}`).join('\n');
            itemList += `\n... and ${result.items.length - 5} more items`;
          }
          // Delete prompt and photo messages
          await deletePrompt();
          await deletePhoto();
          await ctx.reply(`Receipt saved!\n\n${itemList}\n\nTotal: ${formatAmount(result.totalAmount)}\n\nSend a receipt photo or type an expense to add it.`,
            { reply_markup: getBackKeyboard() });
        } else {
          await deletePrompt();
          await deletePhoto();
          await ctx.reply('Failed to save receipt. Try again.',
            { reply_markup: getBackKeyboard() });
        }
      } catch (e) {
        await hideThinking();
        throw e;
      }
    } catch (error: any) {
      console.error('[PhotoHandler] Error:', error.message);
      await deletePrompt();
      await deletePhoto();
      clearUserContext(userId);
      await ctx.reply('Could not process receipt. Try typing an expense',
        { reply_markup: getMainMenuKeyboard() });
    }
  });

  console.log('[Bot] Commands registered');
}

export async function startBot(): Promise<void> {
  await bot.start();
}
