import { Bot, InputFile } from 'grammy';
import { env } from '../../config/env';
import { handleAIMessage } from '../ai/message-handler';
import { isExpenseQuery } from '../ai/prompt-templates';
import { getMonthlyStats, generateReportText, getAllCategoryInflation } from '../analytics';
import { setBudgetLimit, getBudgetLimits, checkBudgetStatus, deleteBudgetLimit } from '../budget';
import { addRecurring, getActiveRecurring, getOverdueRecurring } from '../recurring';
import { handleExport } from '../export';
import { detectTimezoneFromTime, parseTimezone } from '../timezone';
import { deleteUserMessage, sendFreshResponse } from './message-manager';
import { getMainMenuKeyboard, getBudgetMenuKeyboard, getRecurringMenuKeyboard, getExportMenuKeyboard, getTimezoneMenuKeyboard } from './buttons';
import { getDatabase } from '../database/db';
import { parseQuickEntry, addQuickExpense, formatAmount } from '../expense/quick-entry';
import { getUserContext, setUserContext, clearUserContext, UserState } from '../state/user-context';

export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

export async function initializeBot(): Promise<void> {
  bot.command('start', async (ctx) => {
    const userId = ctx.from?.id.toString();
    const db = getDatabase();

    // Check if user has timezone set
    const checkStmt = db.prepare('SELECT timezone FROM user_settings WHERE user_id = ?');
    const user = checkStmt.get(userId) as any;

    await ctx.reply(
      'Welcome to ExpensesBot! 👋\n\nTrack your expenses with AI-powered insights, budgets, and analytics.\n\nUse the buttons below to get started or type "20 coffee" for quick entry.',
      { reply_markup: getMainMenuKeyboard() }
    );

    // Prompt for timezone if not set
    if (!user) {
      ctx.reply('First time here? Please set your timezone by clicking the ⚙️ button above or type: /timezone 14:30 (your current time)');
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
    const response = await handleAIMessage(userId, query);
    await ctx.reply(response);
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

      // Try auto-detect from current time
      let tzInfo = detectTimezoneFromTime(input);

      // If time doesn't work, try parsing as offset/name
      if (!tzInfo) {
        tzInfo = parseTimezone(input);
      }

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

      const menuMessage = `✓ Timezone set to ${tzString} (${tzInfo.name})\n\nCommands:\n/stats - Monthly report\n/ai <query> - Ask about spending\n/budget list - Show budgets\n/budget set <category> <amount> - Set monthly budget\n/recurring list - Show recurring\n/recurring add <name> <amount> <freq> - Add recurring\n/export csv - Download as CSV\n/export pdf - Download as PDF\n\nAlso:\n- Type "20 coffee" for quick entry\n- Ask: "How much on food?"`;

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
          const stats = getMonthlyStats(userId, currentMonth);

          if (stats.expenseCount === 0) {
            await ctx.editMessageText('📊 No expenses this month yet.\n\nStart by typing "20 coffee" for quick entries or ask me questions!',
              { reply_markup: getMainMenuKeyboard() });
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

          await ctx.editMessageText(fullReport, { reply_markup: getMainMenuKeyboard() });
          break;
        }

        case 'budget':
          await ctx.answerCallbackQuery();
          await ctx.editMessageText('💰 Budget Management\n\nWhat would you like to do?',
            { reply_markup: getBudgetMenuKeyboard() });
          break;

        case 'budget_list': {
          await ctx.answerCallbackQuery();
          const budgets = getBudgetLimits(userId);

          if (budgets.length === 0) {
            await ctx.editMessageText('No budgets set yet. Use the Add button to create one.',
              { reply_markup: getBudgetMenuKeyboard() });
            return;
          }

          let response = '💰 Your Monthly Budgets:\n\n';
          for (const budget of budgets) {
            const status = checkBudgetStatus(userId, budget.categoryId);
            if (status) {
              const filled = Math.min(100, status.percentage);
              response += `${status.categoryName}\n€${status.spent}/${status.limit} (${filled}%)\n`;
              if (status.isAlertTriggered) response += '⚠️ ALERT\n';
              response += '\n';
            }
          }

          await ctx.editMessageText(response, { reply_markup: getBudgetMenuKeyboard() });
          break;
        }

        case 'recurring':
          await ctx.answerCallbackQuery();
          await ctx.editMessageText('🔄 Recurring Expenses\n\nWhat would you like to do?',
            { reply_markup: getRecurringMenuKeyboard() });
          break;

        case 'recurring_list': {
          await ctx.answerCallbackQuery();
          const active = getActiveRecurring(userId);

          if (active.length === 0) {
            await ctx.editMessageText('No recurring expenses yet. Use the Add button to create one.',
              { reply_markup: getRecurringMenuKeyboard() });
            return;
          }

          let response = '🔄 Active Recurring Expenses:\n\n';
          for (const recurring of active) {
            response += `${recurring.name} - €${recurring.amount}\n`;
            response += `${recurring.frequency} | Due: ${recurring.nextDueDate}\n\n`;
          }

          await ctx.editMessageText(response, { reply_markup: getRecurringMenuKeyboard() });
          break;
        }

        case 'export':
          await ctx.answerCallbackQuery();
          await ctx.editMessageText('📤 Export Your Expenses\n\nChoose format:',
            { reply_markup: getExportMenuKeyboard() });
          break;

        case 'export_csv': {
          await ctx.answerCallbackQuery();
          const result = await handleExport({ userId, format: 'csv' });
          if (result.success && result.data) {
            const csvBuffer = Buffer.from(result.data as string);
            const { InputFile: IFile } = await import('grammy');
            const file = new IFile(csvBuffer);
            await ctx.replyWithDocument(file);
            await ctx.editMessageText('✓ CSV export sent!', { reply_markup: getMainMenuKeyboard() });
          }
          break;
        }

        case 'export_pdf': {
          await ctx.answerCallbackQuery();
          const result = await handleExport({ userId, format: 'pdf' });
          if (result.success && result.data) {
            const { InputFile: IFile } = await import('grammy');
            const file = new IFile(result.data as Buffer);
            await ctx.replyWithDocument(file);
            await ctx.editMessageText('✓ PDF export sent!', { reply_markup: getMainMenuKeyboard() });
          }
          break;
        }

        case 'ai':
          await ctx.answerCallbackQuery();
          setUserContext(userId, UserState.WAITING_AI_QUERY, {});
          await ctx.editMessageText('🤖 Ask Me Anything\n\nReply with your question about your spending.\n\nExamples:\n- How much on groceries?\n- Show me trends\n- What\'s my top category?');
          break;

        case 'timezone':
          await ctx.answerCallbackQuery();
          await ctx.editMessageText('⚙️ Set Your Timezone\n\nHow would you like to set it?',
            { reply_markup: getTimezoneMenuKeyboard() });
          break;

        case 'tz_time':
          await ctx.answerCallbackQuery();
          setUserContext(userId, UserState.WAITING_TIMEZONE_INPUT, { type: 'time' });
          await ctx.editMessageText('Enter your current time (e.g., 14:30)\n\nI\'ll auto-detect your timezone!');
          break;

        case 'tz_city':
          await ctx.answerCallbackQuery();
          setUserContext(userId, UserState.WAITING_TIMEZONE_INPUT, { type: 'city' });
          await ctx.editMessageText('Enter city name (e.g., Tokyo, London, New York)');
          break;

        case 'tz_offset':
          await ctx.answerCallbackQuery();
          setUserContext(userId, UserState.WAITING_TIMEZONE_INPUT, { type: 'offset' });
          await ctx.editMessageText('Enter UTC offset (e.g., +5, -8)');
          break;

        case 'budget_set':
          await ctx.answerCallbackQuery();
          setUserContext(userId, UserState.WAITING_BUDGET_CATEGORY, {});
          await ctx.editMessageText('Enter category name (e.g., food, transport):');
          break;

        case 'budget_delete':
          await ctx.answerCallbackQuery();
          const budgetsToDelete = getBudgetLimits(userId);
          if (budgetsToDelete.length === 0) {
            await ctx.editMessageText('No budgets to delete.',
              { reply_markup: getBudgetMenuKeyboard() });
          } else {
            setUserContext(userId, UserState.WAITING_BUDGET_CATEGORY, { action: 'delete' });
            await ctx.editMessageText('Which budget do you want to delete?\n\nReply with the category name:');
          }
          break;

        case 'recurring_add':
          await ctx.answerCallbackQuery();
          setUserContext(userId, UserState.WAITING_RECURRING_NAME, {});
          await ctx.editMessageText('Enter recurring expense name (e.g., netflix):');
          break;

        case 'back_main':
          await ctx.answerCallbackQuery();
          await ctx.editMessageText('Welcome to ExpensesBot! 👋\n\nTrack expenses, set budgets, and get AI insights.\n\nChoose an action:',
            { reply_markup: getMainMenuKeyboard() });
          break;

        default:
          await ctx.answerCallbackQuery();
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
              await ctx.reply('⚠️ Invalid timezone. Try: 14:30 (time), Tokyo (city), or +5 (offset)');
              return;
            }

            const db = getDatabase();
            const updateStmt = db.prepare('UPDATE user_settings SET timezone = ? WHERE user_id = ?');
            updateStmt.run(`UTC${tzInfo.offset >= 0 ? '+' : ''}${tzInfo.offset}`, userId);

            clearUserContext(userId);
            await ctx.reply(`✓ Timezone set to ${tzInfo.name} (UTC${tzInfo.offset >= 0 ? '+' : ''}${tzInfo.offset})`);
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
                await ctx.reply(`⚠️ Category not found. Available: Groceries, Restaurants, Transportation, Entertainment, Health, Shopping, Personal, Bills, Other`);
                return;
              }

              const deleted = deleteBudgetLimit(userId, category.id);
              clearUserContext(userId);
              await ctx.reply(deleted ? `✓ Budget deleted for ${categoryName}` : `⚠️ No budget found for ${categoryName}`);
            } else {
              // Setting budget - wait for amount next
              setUserContext(userId, UserState.WAITING_BUDGET_AMOUNT, { category: categoryName });
              await ctx.reply(`Enter monthly limit for ${categoryName} (e.g., 500):`);
            }
            return;
          }

          case UserState.WAITING_BUDGET_AMOUNT: {
            const categoryName = userContext.data.category;
            const amountStr = text.trim();
            const amount = BigInt(parseInt(amountStr) * 100);

            if (isNaN(Number(amountStr)) || amount <= 0n) {
              await ctx.reply('⚠️ Invalid amount. Enter a positive number.');
              return;
            }

            const db = getDatabase();
            const catStmt = db.prepare('SELECT id FROM categories WHERE name = ? AND (user_id = ? OR is_system = 1)');
            const category = catStmt.get(categoryName, userId) as any;

            if (!category) {
              await ctx.reply(`⚠️ Category not found.`);
              clearUserContext(userId);
              return;
            }

            setBudgetLimit(userId, category.id, amount);
            clearUserContext(userId);
            await ctx.reply(`✓ Budget set: ${categoryName} - €${amount / 100n}/month`);
            return;
          }

          case UserState.WAITING_RECURRING_NAME: {
            const name = text.trim();
            if (name.length < 2) {
              await ctx.reply('⚠️ Name too short. Use at least 2 characters.');
              return;
            }

            setUserContext(userId, UserState.WAITING_RECURRING_AMOUNT, { name });
            await ctx.reply(`Enter amount for "${name}" (e.g., 10.99):`);
            return;
          }

          case UserState.WAITING_RECURRING_AMOUNT: {
            const name = userContext.data.name;
            const amountStr = text.trim();
            const amount = BigInt(Math.round(parseFloat(amountStr) * 100));

            if (isNaN(Number(amountStr)) || amount <= 0n) {
              await ctx.reply('⚠️ Invalid amount. Enter a positive number.');
              return;
            }

            setUserContext(userId, UserState.WAITING_RECURRING_FREQUENCY, { name, amount });
            await ctx.reply(`Enter frequency (daily/weekly/monthly/quarterly/annual):`);
            return;
          }

          case UserState.WAITING_RECURRING_FREQUENCY: {
            const name = userContext.data.name;
            const amount = BigInt(userContext.data.amount);
            const frequency = text.toLowerCase().trim();

            if (!['daily', 'weekly', 'monthly', 'quarterly', 'annual'].includes(frequency)) {
              await ctx.reply('⚠️ Invalid frequency. Options: daily, weekly, monthly, quarterly, annual');
              return;
            }

            addRecurring(userId, name, amount, frequency);
            clearUserContext(userId);
            await ctx.reply(`✓ Recurring expense added: ${name} - €${amount / 100n} ${frequency}`);
            return;
          }

          case UserState.WAITING_AI_QUERY: {
            const response = await handleAIMessage(userId, text);
            clearUserContext(userId);
            await ctx.reply(response);
            return;
          }
        }
      } catch (error: any) {
        console.error('[StateHandler] Error:', error.message);
        clearUserContext(userId);
        await ctx.reply('⚠️ An error occurred. Please try again.');
        return;
      }
    }

    // No context - try quick entry format: "20 coffee"
    const quickEntry = parseQuickEntry(text);
    if (quickEntry) {
      const success = addQuickExpense(userId, quickEntry.description, quickEntry.amount);
      if (success) {
        await ctx.reply(
          `✓ Added: ${quickEntry.description}\nAmount: ${formatAmount(quickEntry.amount)}`
        );
        return;
      }
    }

    // Then check for AI queries
    if (isExpenseQuery(text)) {
      const response = await handleAIMessage(userId, text);
      await ctx.reply(response);
      return;
    }

    await ctx.reply('Send a receipt photo, type "20 coffee" for quick entry, or ask about your spending.');
  });

  // Handle receipt photo uploads
  bot.on('message:photo', async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply('Unable to identify user');
      return;
    }

    try {
      await ctx.reply('📸 Receipt received!\n\nTo extract items, enable Google Vision API in .env\n\nFor now, you can:\n- Type "20 coffee" for quick entry\n- Or ask: "How much on food?"');
    } catch (error: any) {
      console.error('[PhotoHandler] Error:', error.message);
      await ctx.reply('⚠️ Could not process receipt. Try again or use quick entry: "20 coffee"');
    }
  });

  console.log('[Bot] Commands registered');
}

export async function startBot(): Promise<void> {
  await bot.start();
}
