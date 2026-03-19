import { AppData } from '@/types';
import { DEFAULT_TARIFFS } from '@/constants/tariffs';

export const EMPTY_DATA: AppData = {
  clients: [],
  cars: [],
  sessions: [],
  subscriptions: [],
  payments: [],
  debts: [],
  transactions: [],
  users: [],
  tariffs: DEFAULT_TARIFFS,
  shifts: [],
  expenses: [],
  withdrawals: [],
  scheduledShifts: [],
  actionLogs: [],
  adminExpenses: [],
  adminCashOperations: [],
  expenseCategories: [],
  dailyDebtAccruals: [],
  clientDebts: [],
};
