export interface Expense {
  id: string;
  userId: string;
  storeName?: string;
  totalAmount: bigint;
  currency: string;
  purchaseDate: string;
  receiptPhotoId?: string;
  ocrConfidence?: number;
  createdAt: string;
}

export interface Item {
  id: string;
  expenseId: string;
  userId: string;
  itemName: string;
  normalizedName: string;
  quantity?: number;
  unit?: string;
  unitPrice: bigint;
  totalPrice: bigint;
  categoryId?: string;
  createdAt: string;
}

export interface Category {
  id: string;
  userId?: string;
  name: string;
  icon?: string;
  parentId?: string;
  isSystem: boolean;
  createdAt: string;
}

export interface PriceHistory {
  id: string;
  userId: string;
  normalizedName: string;
  storeName?: string;
  unitPrice: bigint;
  unit?: string;
  purchaseDate: string;
  itemId?: string;
}

export interface BudgetLimit {
  id: string;
  userId: string;
  categoryId: string;
  monthlyLimit: bigint;
  currency: string;
  alertThreshold: number;
  createdAt: string;
}

export interface RecurringExpense {
  id: string;
  userId: string;
  name: string;
  amount: bigint;
  currency: string;
  categoryId?: string;
  frequency: 'weekly' | 'monthly' | 'yearly';
  nextDueDate: string;
  isActive: boolean;
  createdAt: string;
}

export interface UserSettings {
  userId: string;
  defaultCurrency: string;
  timezone: string;
  createdAt: string;
}
