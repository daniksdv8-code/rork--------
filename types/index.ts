export type PaymentMethod = 'cash' | 'card';
export type ServiceType = 'monthly' | 'onetime';
export type SessionStatus = 'active' | 'completed';
export type TransactionType = 'payment' | 'debt' | 'exit' | 'debt_payment' | 'entry' | 'cancel_entry' | 'cancel_exit' | 'cancel_payment' | 'withdrawal' | 'client_deleted' | 'refund';
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
}

export type ShiftStatus = 'open' | 'closed';

export interface CashShift {
  id: string;
  operatorId: string;
  operatorName: string;
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
  | 'refund';

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
  deletedClientIds?: string[];
  restoreEpoch?: number;
}
