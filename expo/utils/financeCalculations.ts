import {
  Debt, ClientDebt, ParkingSession, MonthlySubscription,
  Tariffs, DailyDebtAccrual, Transaction, CashWithdrawal,
  AdminExpense, SalaryAdvance, SalaryPayment, Expense,
  CashShift, ServiceType,
} from '@/types';
import { roundMoney } from '@/utils/money';
import { calculateDays, isExpired, getMonthlyAmount } from '@/utils/date';

export interface ClientDebtState {
  debts: Debt[];
  clientDebts: ClientDebt[];
  sessions: ParkingSession[];
  subscriptions: MonthlySubscription[];
  tariffs: Tariffs;
  dailyDebtAccruals: DailyDebtAccrual[];
}

export interface AdminCashBalanceState {
  transactions: Transaction[];
  withdrawals: CashWithdrawal[];
  adminExpenses: AdminExpense[];
  salaryAdvances: SalaryAdvance[];
  salaryPayments: SalaryPayment[];
}

export interface ShiftCashBalanceState {
  transactions: Transaction[];
  expenses: Expense[];
  withdrawals: CashWithdrawal[];
}

export interface OverstayedSessionDetail {
  sessionId: string;
  carId: string;
  clientId: string;
  days: number;
  rate: number;
  amount: number;
  prepaid: number;
  serviceType: ServiceType;
}

export interface ClientDebtBreakdown {
  oldDebtsTotal: number;
  clientDebtTotal: number;
  overstayTotal: number;
  total: number;
}

export function getActiveSessionsForDebt(
  sessions: ParkingSession[],
): ParkingSession[] {
  return sessions.filter(s =>
    (s.status === 'active' || s.status === 'active_debt') && !s.cancelled
  );
}

export function calculateOverstayedSessionDebts(
  activeSessions: ParkingSession[],
  debts: Debt[],
  subscriptions: MonthlySubscription[],
  tariffs: Tariffs,
): Record<string, number> {
  const result: Record<string, number> = {};
  const sessionIdsWithActiveDebt = new Set(
    debts.filter(d => d.parkingEntryId && d.remainingAmount > 0).map(d => d.parkingEntryId!)
  );
  const sessionPaidDebtTotals: Record<string, number> = {};
  for (const d of debts) {
    if (d.parkingEntryId && d.remainingAmount <= 0) {
      sessionPaidDebtTotals[d.parkingEntryId] = roundMoney(
        (sessionPaidDebtTotals[d.parkingEntryId] ?? 0) + d.totalAmount
      );
    }
  }
  for (const session of activeSessions) {
    if (session.status === 'active_debt') continue;
    if (session.serviceType === 'lombard' || session.tariffType === 'lombard') continue;
    if (sessionIdsWithActiveDebt.has(session.id)) continue;

    if (session.serviceType === 'onetime') {
      const days = calculateDays(session.entryTime);
      const dailyRate = tariffs.onetimeCash;
      const totalOwed = roundMoney(dailyRate * days);
      const prepaid = session.prepaidAmount ?? 0;
      const paidDebtTotal = sessionPaidDebtTotals[session.id] ?? 0;
      const alreadyCovered = roundMoney(Math.max(prepaid, paidDebtTotal));
      const owing = roundMoney(Math.max(0, totalOwed - alreadyCovered));
      if (owing > 0) {
        result[session.clientId] = roundMoney((result[session.clientId] ?? 0) + owing);
      }
    } else if (session.serviceType === 'monthly') {
      const sub = subscriptions.find(s => s.carId === session.carId && s.clientId === session.clientId);
      if (!sub || isExpired(sub.paidUntil)) {
        const monthlyAmount = getMonthlyAmount(tariffs.monthlyCash);
        result[session.clientId] = roundMoney((result[session.clientId] ?? 0) + monthlyAmount);
      }
    }
  }
  return result;
}

export function calculateOverstayedSessionDetails(
  activeSessions: ParkingSession[],
  debts: Debt[],
  subscriptions: MonthlySubscription[],
  tariffs: Tariffs,
): Record<string, OverstayedSessionDetail[]> {
  const result: Record<string, OverstayedSessionDetail[]> = {};
  const sessionIdsWithActiveDebt = new Set(
    debts.filter(d => d.parkingEntryId && d.remainingAmount > 0).map(d => d.parkingEntryId!)
  );
  const sessionPaidDebtTotals: Record<string, number> = {};
  for (const d of debts) {
    if (d.parkingEntryId && d.remainingAmount <= 0) {
      sessionPaidDebtTotals[d.parkingEntryId] = roundMoney(
        (sessionPaidDebtTotals[d.parkingEntryId] ?? 0) + d.totalAmount
      );
    }
  }
  for (const session of activeSessions) {
    if (session.status === 'active_debt') continue;
    if (session.serviceType === 'lombard' || session.tariffType === 'lombard') continue;
    if (sessionIdsWithActiveDebt.has(session.id)) continue;

    if (session.serviceType === 'onetime') {
      const days = calculateDays(session.entryTime);
      const dailyRate = tariffs.onetimeCash;
      const totalOwed = roundMoney(dailyRate * days);
      const prepaid = session.prepaidAmount ?? 0;
      const paidDebtTotal = sessionPaidDebtTotals[session.id] ?? 0;
      const alreadyCovered = roundMoney(Math.max(prepaid, paidDebtTotal));
      const owing = roundMoney(Math.max(0, totalOwed - alreadyCovered));
      if (owing > 0) {
        if (!result[session.clientId]) result[session.clientId] = [];
        result[session.clientId].push({
          sessionId: session.id,
          carId: session.carId,
          clientId: session.clientId,
          days,
          rate: dailyRate,
          amount: owing,
          prepaid: alreadyCovered,
          serviceType: session.serviceType,
        });
      }
    } else if (session.serviceType === 'monthly') {
      const sub = subscriptions.find(s => s.carId === session.carId && s.clientId === session.clientId);
      if (!sub || isExpired(sub.paidUntil)) {
        const monthlyAmount = getMonthlyAmount(tariffs.monthlyCash);
        if (!result[session.clientId]) result[session.clientId] = [];
        result[session.clientId].push({
          sessionId: session.id,
          carId: session.carId,
          clientId: session.clientId,
          days: 0,
          rate: tariffs.monthlyCash,
          amount: monthlyAmount,
          prepaid: 0,
          serviceType: session.serviceType,
        });
      }
    }
  }
  return result;
}

export function calculateClientDebtBreakdown(
  state: ClientDebtState,
  clientId: string,
  precomputedActiveSessions?: ParkingSession[],
  precomputedOverstay?: Record<string, number>,
): ClientDebtBreakdown {
  const activeDebts = state.debts.filter(d => d.remainingAmount > 0);
  const oldDebtsTotal = roundMoney(
    activeDebts.filter(d => d.clientId === clientId).reduce((sum, d) => sum + d.remainingAmount, 0)
  );

  const cd = state.clientDebts.find(c => c.clientId === clientId);
  const clientDebtTotal = cd ? cd.totalAmount : 0;

  let overstayTotal: number;
  if (precomputedOverstay) {
    overstayTotal = precomputedOverstay[clientId] ?? 0;
  } else {
    const activeSessions = precomputedActiveSessions ?? getActiveSessionsForDebt(state.sessions);
    const clientActiveSessions = activeSessions.filter(s => s.clientId === clientId);
    const overstayMap = calculateOverstayedSessionDebts(
      clientActiveSessions, state.debts, state.subscriptions, state.tariffs,
    );
    overstayTotal = overstayMap[clientId] ?? 0;
  }

  const total = roundMoney(oldDebtsTotal + clientDebtTotal + overstayTotal);

  return { oldDebtsTotal, clientDebtTotal, overstayTotal, total };
}

export function calculateClientDebt(
  state: ClientDebtState,
  clientId: string,
  precomputedActiveSessions?: ParkingSession[],
  precomputedOverstay?: Record<string, number>,
): number {
  return calculateClientDebtBreakdown(state, clientId, precomputedActiveSessions, precomputedOverstay).total;
}

export function calculateTotalDebtAllClients(
  state: ClientDebtState,
  precomputedActiveSessions?: ParkingSession[],
): { oldDebtTotal: number; clientDebtTotal: number; overstayTotal: number; total: number } {
  const activeDebts = state.debts.filter(d => d.remainingAmount > 0);
  const oldDebtTotal = roundMoney(activeDebts.reduce((s, d) => s + d.remainingAmount, 0));
  const clientDebtTotal = roundMoney(state.clientDebts.reduce((s, cd) => s + cd.totalAmount, 0));

  const activeSessions = precomputedActiveSessions ?? getActiveSessionsForDebt(state.sessions);
  const overstayMap = calculateOverstayedSessionDebts(
    activeSessions, state.debts, state.subscriptions, state.tariffs,
  );
  const overstayTotal = roundMoney(Object.values(overstayMap).reduce((s, v) => s + v, 0));

  const total = roundMoney(oldDebtTotal + clientDebtTotal + overstayTotal);
  return { oldDebtTotal, clientDebtTotal, overstayTotal, total };
}

export function calculateCashBalance(state: AdminCashBalanceState): { cash: number; card: number; total: number } {
  const allCardIncome = roundMoney(
    state.transactions.filter(t =>
      (t.type === 'payment' || t.type === 'debt_payment') && t.amount > 0 && t.method === 'card'
    ).reduce((s, t) => s + t.amount, 0)
    - state.transactions.filter(t => t.type === 'cancel_payment' && t.method === 'card').reduce((s, t) => s + t.amount, 0)
    - state.transactions.filter(t => t.type === 'refund' && t.method === 'card').reduce((s, t) => s + t.amount, 0)
  );

  const cashFromManagers = roundMoney(state.withdrawals.reduce((s, w) => s + w.amount, 0));

  const adminSourcedAdvances = state.salaryAdvances.filter(a => !a.source || a.source === 'admin');
  const salaryAdvanceCash = roundMoney(
    adminSourcedAdvances.filter(a => !a.method || a.method === 'cash').reduce((s, a) => s + a.amount, 0)
  );
  const salaryAdvanceCard = roundMoney(
    adminSourcedAdvances.filter(a => a.method === 'card').reduce((s, a) => s + a.amount, 0)
  );

  const adminSourcedPayments = state.salaryPayments.filter(p => !p.source || p.source === 'admin');
  const salaryPayCash = roundMoney(
    adminSourcedPayments.filter(p => p.netPaid > 0 && p.method === 'cash').reduce((s, p) => s + p.netPaid, 0)
  );
  const salaryPayCard = roundMoney(
    adminSourcedPayments.filter(p => p.netPaid > 0 && p.method === 'card').reduce((s, p) => s + p.netPaid, 0)
  );

  const cashBalance = roundMoney(
    cashFromManagers
    - state.adminExpenses.filter(e => e.method === 'cash').reduce((s, e) => s + e.amount, 0)
    - salaryAdvanceCash
    - salaryPayCash
  );
  const cardBalance = roundMoney(
    allCardIncome
    - state.adminExpenses.filter(e => e.method === 'card').reduce((s, e) => s + e.amount, 0)
    - salaryAdvanceCard
    - salaryPayCard
  );

  return { cash: cashBalance, card: cardBalance, total: roundMoney(cashBalance + cardBalance) };
}

export function calculateStoredDebtTotal(
  debts: Debt[],
  clientDebts: ClientDebt[],
): { oldDebtTotal: number; clientDebtTotal: number; total: number } {
  const oldDebtTotal = roundMoney(
    debts.filter(d => d.remainingAmount > 0).reduce((s, d) => s + d.remainingAmount, 0)
  );
  const clientDebtTotal = roundMoney(
    clientDebts.reduce((s, cd) => s + cd.totalAmount, 0)
  );
  return { oldDebtTotal, clientDebtTotal, total: roundMoney(oldDebtTotal + clientDebtTotal) };
}

export function calculateShiftCashBalance(
  shift: CashShift,
  state: ShiftCashBalanceState,
): number {
  const openTime = new Date(shift.openedAt).getTime();
  const closeTime = shift.closedAt ? new Date(shift.closedAt).getTime() : Date.now();
  const isInShift = (t: { date: string; shiftId?: string | null }) => {
    if (t.shiftId === shift.id) return true;
    if (t.shiftId && t.shiftId !== shift.id) return false;
    const tTime = new Date(t.date).getTime();
    return tTime >= openTime && tTime <= closeTime;
  };

  const cashIncome = state.transactions.filter(t =>
    (t.type === 'payment' || t.type === 'debt_payment') &&
    t.method === 'cash' && t.amount > 0 && isInShift(t)
  ).reduce((s, t) => s + t.amount, 0);

  const cancelled = state.transactions.filter(t =>
    t.type === 'cancel_payment' && t.method === 'cash' && isInShift(t)
  ).reduce((s, t) => s + t.amount, 0);

  const refunded = state.transactions.filter(t =>
    t.type === 'refund' && t.method === 'cash' && isInShift(t)
  ).reduce((s, t) => s + t.amount, 0);

  const expenseTotal = state.expenses.filter(e => e.shiftId === shift.id).reduce((s, e) => s + e.amount, 0);
  const withdrawalTotal = state.withdrawals.filter(w => w.shiftId === shift.id).reduce((s, w) => s + w.amount, 0);

  return roundMoney(shift.carryOver + cashIncome - cancelled - refunded - expenseTotal - withdrawalTotal);
}
