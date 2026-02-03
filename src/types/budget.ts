export interface BudgetLimit {
  id: string;
  userId: string;
  categoryId: string;
  monthlyLimit: bigint;
  currency: string;
  alertThreshold: number;
  createdAt: string;
}

export interface BudgetStatus {
  categoryId: string;
  categoryName: string;
  limit: bigint;
  spent: bigint;
  percentage: number;
  isAlertTriggered: boolean;
  daysRemainingInMonth: number;
}

export interface RecurringExpense {
  id: string;
  userId: string;
  name: string;
  amount: bigint;
  currency: string;
  categoryId?: string;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  nextDueDate: string;
  isActive: boolean;
  createdAt: string;
}
