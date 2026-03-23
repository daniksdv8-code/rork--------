export type PaymentMethod = 'cash' | 'card';
export type ServiceType = 'monthly' | 'onetime' | 'lombard';
export type TariffType = 'standard' | 'lombard';
export type SessionStatus = 'active' | 'completed' | 'active_debt' | 'released_debt';
export type TransactionType = 'payment' | 'debt' | 'exit' | 'debt_payment' | 'entry' | 'cancel_entry' | 'cancel_exit' | 'cancel_payment' | 'withdrawal' | 'client_deleted' | 'refund' | 'admin_withdrawal' | 'admin_expense' | 'debt_accrual' | 'debt_freeze' | 'manager_expense';

export type CashOperationType = 'income' | 'expense' | 'withdrawal' | 'deposit' | 'refund' | 'debt_payment_income';

export interface CashOperation {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  shiftId: string | null;
  type: CashOperationType;
  amount: number;
  category: string;
  description: string;
  method: PaymentMethod;
  balanceBefore: number;
  balanceAfter: number;
  date: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
}
export type UserRole = 'admin' | 'manager';

export interface User {
  id: string;
  login: string;
  password: string;
  name: string;
  role: UserRole;
  active: boolean;
  updatedAt?: string;
  deleted?: boolean;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  phone2?: string;
  notes: string;
  createdAt: string;
  updatedAt?: string;
  deleted?: boolean;
  deletedAt?: string;
}

export interface Car {
  id: string;
  plateNumber: string;
  carModel?: string;
  clientId: string;
  updatedAt?: string;
  deleted?: boolean;
  deletedAt?: string;
}

export interface ParkingSession {
  id: string;
  carId: string;
  clientId: string;
  entryTime: string;
  exitTime: string | null;
  serviceType: ServiceType;
  status: SessionStatus;
  plannedDepartureTime?: string | null;
  managerId?: string;
  managerName?: string;
  shiftId?: string | null;
  cancelled?: boolean;
  updatedAt?: string;
  prepaidAmount?: number;
  prepaidMethod?: PaymentMethod | null;
  tariffType?: TariffType;
  lombardRateApplied?: number;
}

export interface MonthlySubscription {
  id: string;
  carId: string;
  clientId: string;
  paidUntil: string;
  updatedAt?: string;
}

export interface Payment {
  id: string;
  clientId: string;
  carId: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  serviceType: ServiceType;
  operatorId: string;
  operatorName: string;
  description: string;
  shiftId?: string | null;
  cancelled?: boolean;
  updatedAt?: string;
  originalAmount?: number;
  refundAmount?: number;
  refundDate?: string;
  refundMethod?: PaymentMethod;
  refundReason?: string;
}

export interface Debt {
  id: string;
  clientId: string;
  carId: string;
  totalAmount: number;
  remainingAmount: number;
  createdAt: string;
  description: string;
  updatedAt?: string;
  parkingEntryId?: string;
  status?: 'active' | 'frozen' | 'paid';
}

export interface DailyDebtAccrual {
  id: string;
  parkingEntryId: string;
  clientId: string;
  carId: string;
  accrualDate: string;
  amount: number;
  tariffRate: number;
  createdAt: string;
}

export interface ClientDebt {
  id: string;
  clientId: string;
  totalAmount: number;
  frozenAmount: number;
  activeAmount: number;
  lastUpdate: string;
  frozenDate?: string;
}

export interface Transaction {
  id: string;
  clientId: string;
  carId: string;
  type: TransactionType;
  amount: number;
  method: PaymentMethod | null;
  date: string;
  operatorId: string;
  operatorName: string;
  description: string;
  shiftId?: string | null;
}

export interface Tariffs {
  monthlyCash: number;
  monthlyCard: number;
  onetimeCash: number;
  onetimeCard: number;
  lombardRate: number;
}

export type ShiftStatus = 'open' | 'closed';

export interface CashShift {
  id: string;
  operatorId: string;
  operatorName: string;
  operatorRole?: 'admin' | 'manager';
  openedAt: string;
  closedAt: string | null;
  status: ShiftStatus;
  expectedCash: number;
  actualCash: number | null;
  carryOver: number;
  notes: string;
  updatedAt?: string;
  closingSummary?: {
    cashIncome: number;
    cardIncome: number;
    totalExpenses: number;
    totalWithdrawals: number;
    calculatedBalance: number;
    discrepancy: number;
  } | null;
}

export interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string;
  operatorId: string;
  operatorName: string;
  date: string;
  shiftId: string | null;
  method?: PaymentMethod;
}

export interface AdminExpense {
  id: string;
  amount: number;
  category: string;
  description: string;
  method: PaymentMethod;
  operatorId: string;
  operatorName: string;
  date: string;
  updatedAt?: string;
}

export interface AdminCashOperation {
  id: string;
  type: 'card_income' | 'cash_withdrawal_from_manager' | 'admin_expense';
  amount: number;
  method: PaymentMethod;
  description: string;
  sourceManagerId?: string;
  sourceManagerName?: string;
  relatedPaymentId?: string;
  operatorId: string;
  operatorName: string;
  date: string;
  updatedAt?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  ownerType: 'admin' | 'manager';
  deleted?: boolean;
  updatedAt?: string;
}

export interface CashWithdrawal {
  id: string;
  amount: number;
  operatorId: string;
  operatorName: string;
  date: string;
  shiftId: string | null;
  notes: string;
}

export interface ScheduledShift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  operatorId: string;
  operatorName: string;
  comment: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ActionType =
  | 'client_add'
  | 'client_edit'
  | 'client_delete'
  | 'car_add'
  | 'car_delete'
  | 'checkin'
  | 'checkout'
  | 'cancel_checkin'
  | 'cancel_checkout'
  | 'payment'
  | 'cancel_payment'
  | 'debt_payment'
  | 'shift_open'
  | 'shift_close'
  | 'expense_add'
  | 'withdrawal'
  | 'tariff_update'
  | 'user_add'
  | 'user_remove'
  | 'user_toggle'
  | 'user_password'
  | 'admin_profile'
  | 'schedule_add'
  | 'schedule_edit'
  | 'schedule_delete'
  | 'data_reset'
  | 'backup_create'
  | 'backup_restore'
  | 'refund'
  | 'admin_withdrawal'
  | 'admin_expense_add'
  | 'expense_category_add'
  | 'expense_category_edit'
  | 'expense_category_delete'
  | 'admin_edit'
  | 'debt_accrual'
  | 'debt_freeze'
  | 'violation_add'
  | 'violation_delete'
  | 'manual_debt_add'
  | 'manual_debt_delete';

export interface ActionLog {
  id: string;
  action: ActionType;
  label: string;
  details: string;
  userId: string;
  userName: string;
  timestamp: string;
  entityId?: string;
  entityType?: string;
}

export type ViolationStatus = 'ok' | 'warning' | 'bonus_denied';

export interface ViolationEntry {
  id: string;
  managerId: string;
  managerName: string;
  type: string;
  comment: string;
  date: string;
  addedBy: string;
  addedByName: string;
}

export interface TeamViolationMonth {
  id: string;
  month: string;
  violationCount: number;
  status: ViolationStatus;
  violations: ViolationEntry[];
}

export interface AppData {
  clients: Client[];
  cars: Car[];
  sessions: ParkingSession[];
  subscriptions: MonthlySubscription[];
  payments: Payment[];
  debts: Debt[];
  transactions: Transaction[];
  users: User[];
  tariffs: Tariffs;
  shifts: CashShift[];
  expenses: Expense[];
  withdrawals: CashWithdrawal[];
  scheduledShifts: ScheduledShift[];
  actionLogs: ActionLog[];
  adminExpenses: AdminExpense[];
  adminCashOperations: AdminCashOperation[];
  expenseCategories: ExpenseCategory[];
  dailyDebtAccruals: DailyDebtAccrual[];
  clientDebts: ClientDebt[];
  cashOperations: CashOperation[];
  teamViolations: TeamViolationMonth[];
  deletedClientIds?: string[];
  restoreEpoch?: number;
}
