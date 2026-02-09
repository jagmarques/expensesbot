import { InlineKeyboard } from 'grammy';

/**
 * Button UI - Primary interface for ExpensesBot
 * All major actions accessible via clickable buttons
 */

export function getMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📊 Stats', 'stats')
    .text('🧾 Receipts', 'receipts')
    .row()
    .text('🔄 Recurring', 'recurring')
    .text('📤 Export', 'export')
    .row()
    .text('🤖 Ask AI', 'ai')
    .text('⚙️ Settings', 'settings');
}

export function getReceiptsMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📷 Upload New', 'receipt_upload')
    .text('📋 Show Receipts', 'receipt_list')
    .row()
    .text('« Back', 'back_main');
}

export function getSettingsMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🕐 Timezone', 'timezone')
    .row()
    .text('🔄 Reset All Data', 'restart')
    .row()
    .text('« Back', 'back_main');
}

export function getConfirmResetKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Yes, delete all', 'confirm_reset')
    .text('No, cancel', 'back_main');
}

export function getBudgetMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📋 List', 'budget_list')
    .text('➕ Add', 'budget_set')
    .row()
    .text('🗑️ Delete', 'budget_delete')
    .row()
    .text('« Back', 'back_main');
}

export function getRecurringMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📋 List', 'recurring_list')
    .text('➕ Add', 'recurring_add')
    .row()
    .text('« Back', 'back_main');
}

export function getExportMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📄 CSV', 'export_csv')
    .text('📕 PDF', 'export_pdf')
    .row()
    .text('« Back', 'back_main');
}

export function getTimezoneMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🕐 Current Time', 'tz_time')
    .text('📍 City', 'tz_city')
    .row()
    .text('➕ Offset', 'tz_offset')
    .row()
    .text('« Back', 'back_main');
}

export function getYesNoKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✓ Yes', 'yes')
    .text('✗ No', 'no');
}

export function getBackKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('« Back to Menu', 'back_main');
}
