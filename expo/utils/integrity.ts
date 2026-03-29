import {
  Client, Car, ParkingSession, MonthlySubscription, Payment, Debt,
  Transaction, CashShift, Expense, CashWithdrawal, ClientDebt,
  DailyDebtAccrual, SalaryAdvance, SalaryPayment, AdminExpense,
} from '@/types';
import { roundMoney } from '@/utils/money';
import { logAnomaly } from '@/utils/anomaly-logger';

export interface IntegrityIssue {
  severity: 'error' | 'warning';
  category: string;
  message: string;
  entityId?: string;
}

export interface SelfHealResult {
  healed: boolean;
  description: string;
  category: string;
}

export interface FullDiagnosticData {
  clients: Client[];
  cars: Car[];
  sessions: ParkingSession[];
  subscriptions: MonthlySubscription[];
  payments: Payment[];
  debts: Debt[];
  transactions: Transaction[];
  shifts: CashShift[];
  expenses: Expense[];
  withdrawals: CashWithdrawal[];
  clientDebts: ClientDebt[];
  dailyDebtAccruals: DailyDebtAccrual[];
  salaryAdvances: SalaryAdvance[];
  salaryPayments: SalaryPayment[];
  adminExpenses: AdminExpense[];
}

export function validateDataIntegrity(data: {
  clients: Client[];
  cars: Car[];
  sessions: ParkingSession[];
  subscriptions: MonthlySubscription[];
  payments: Payment[];
  debts: Debt[];
  transactions: Transaction[];
  shifts: CashShift[];
  expenses: Expense[];
  withdrawals: CashWithdrawal[];
}): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const clientIds = new Set(data.clients.map(c => c.id));
  const carIds = new Set(data.cars.map(c => c.id));

  for (const car of data.cars) {
    if (!clientIds.has(car.clientId) && !car.deleted) {
      issues.push({
        severity: 'error',
        category: 'orphan_car',
        message: `Машина ${car.plateNumber} (${car.id}) привязана к несуществующему клиенту ${car.clientId}`,
        entityId: car.id,
      });
    }
  }

  for (const session of data.sessions) {
    if (!carIds.has(session.carId)) {
      issues.push({
        severity: 'warning',
        category: 'orphan_session',
        message: `Сессия ${session.id} ссылается на несуществующую машину ${session.carId}`,
        entityId: session.id,
      });
    }
    if (!clientIds.has(session.clientId)) {
      issues.push({
        severity: 'warning',
        category: 'orphan_session',
        message: `Сессия ${session.id} ссылается на несуществующего клиента ${session.clientId}`,
        entityId: session.id,
      });
    }
    if (session.status === 'active' && session.exitTime) {
      issues.push({
        severity: 'error',
        category: 'invalid_session',
        message: `Сессия ${session.id} в статусе active, но имеет exitTime`,
        entityId: session.id,
      });
    }
    if (session.status === 'completed' && !session.exitTime && !session.cancelled) {
      issues.push({
        severity: 'error',
        category: 'invalid_session',
        message: `Сессия ${session.id} в статусе completed, но без exitTime и не отменена`,
        entityId: session.id,
      });
    }
  }

  for (const debt of data.debts) {
    if (debt.remainingAmount < 0) {
      issues.push({
        severity: 'error',
        category: 'negative_debt',
        message: `Долг ${debt.id} имеет отрицательный остаток: ${debt.remainingAmount}`,
        entityId: debt.id,
      });
    }
    if (debt.remainingAmount > debt.totalAmount) {
      issues.push({
        severity: 'error',
        category: 'invalid_debt',
        message: `Долг ${debt.id}: остаток (${debt.remainingAmount}) больше общей суммы (${debt.totalAmount})`,
        entityId: debt.id,
      });
    }
    if (debt.totalAmount <= 0) {
      issues.push({
        severity: 'warning',
        category: 'zero_debt',
        message: `Долг ${debt.id} имеет нулевую/отрицательную сумму: ${debt.totalAmount}`,
        entityId: debt.id,
      });
    }
  }

  for (const payment of data.payments) {
    if (payment.amount <= 0 && !payment.cancelled) {
      issues.push({
        severity: 'warning',
        category: 'zero_payment',
        message: `Оплата ${payment.id} с нулевой/отрицательной суммой: ${payment.amount}`,
        entityId: payment.id,
      });
    }
  }

  for (const sub of data.subscriptions) {
    if (!carIds.has(sub.carId)) {
      issues.push({
        severity: 'warning',
        category: 'orphan_subscription',
        message: `Подписка ${sub.id} ссылается на несуществующую машину ${sub.carId}`,
        entityId: sub.id,
      });
    }
    if (!clientIds.has(sub.clientId)) {
      issues.push({
        severity: 'warning',
        category: 'orphan_subscription',
        message: `Подписка ${sub.id} ссылается на несуществующего клиента ${sub.clientId}`,
        entityId: sub.id,
      });
    }
  }

  const openShifts = data.shifts.filter(s => s.status === 'open');
  if (openShifts.length > 2) {
    issues.push({
      severity: 'error',
      category: 'multiple_shifts',
      message: `Найдено ${openShifts.length} открытых смен одновременно (IDs: ${openShifts.map(s => s.id).join(', ')})`,
    });
  }

  for (const shift of data.shifts) {
    if (shift.expectedCash < 0) {
      issues.push({
        severity: 'warning',
        category: 'negative_cash',
        message: `Смена ${shift.id}: отрицательный расчётный остаток в кассе (${shift.expectedCash})`,
        entityId: shift.id,
      });
    }
  }

  for (const expense of data.expenses) {
    if (expense.amount <= 0) {
      issues.push({
        severity: 'warning',
        category: 'zero_expense',
        message: `Расход ${expense.id} с нулевой/отрицательной суммой: ${expense.amount}`,
        entityId: expense.id,
      });
    }
  }

  for (const w of data.withdrawals) {
    if (w.amount <= 0) {
      issues.push({
        severity: 'warning',
        category: 'zero_withdrawal',
        message: `Снятие ${w.id} с нулевой/отрицательной суммой: ${w.amount}`,
        entityId: w.id,
      });
    }
  }

  const duplicatePlates = new Map<string, Car[]>();
  for (const car of data.cars) {
    if (car.deleted) continue;
    const existing = duplicatePlates.get(car.plateNumber) || [];
    existing.push(car);
    duplicatePlates.set(car.plateNumber, existing);
  }
  for (const [plate, carsList] of duplicatePlates) {
    if (carsList.length > 1) {
      issues.push({
        severity: 'error',
        category: 'duplicate_plate',
        message: `Дублированный номер ${plate}: ${carsList.length} машин (IDs: ${carsList.map(c => c.id).join(', ')})`,
      });
    }
  }

  console.log(`[Integrity] Validation complete: ${issues.filter(i => i.severity === 'error').length} errors, ${issues.filter(i => i.severity === 'warning').length} warnings`);
  return issues;
}

export function verifyClientDebtConsistency(
  clientId: string,
  debts: Debt[],
  clientDebts: ClientDebt[],
  dailyDebtAccruals: DailyDebtAccrual[],
  sessions: ParkingSession[],
): { isConsistent: boolean; calculatedTotal: number; storedTotal: number; details: string } {
  const activeOldDebts = debts.filter(d => d.clientId === clientId && d.remainingAmount > 0);
  const oldDebtsTotal = roundMoney(activeOldDebts.reduce((s, d) => s + d.remainingAmount, 0));

  const cd = clientDebts.find(c => c.clientId === clientId);
  const storedClientDebt = cd ? cd.totalAmount : 0;
  const storedTotal = roundMoney(oldDebtsTotal + storedClientDebt);

  const debtSessions = sessions.filter(s =>
    s.clientId === clientId &&
    (s.status === 'active_debt' || s.status === 'released_debt') &&
    !s.cancelled
  );

  let accrualTotal = 0;
  for (const session of debtSessions) {
    const sessionAccruals = dailyDebtAccruals.filter(a => a.parkingEntryId === session.id);
    accrualTotal += sessionAccruals.reduce((s, a) => s + a.amount, 0);
  }

  const debtPaymentTxReduction = 0;
  const calculatedTotal = roundMoney(accrualTotal + oldDebtsTotal - debtPaymentTxReduction);

  const diff = Math.abs(storedTotal - calculatedTotal);
  const isConsistent = diff < 1;

  return {
    isConsistent,
    calculatedTotal,
    storedTotal,
    details: isConsistent
      ? `OK: stored=${storedTotal}, calculated=${calculatedTotal}`
      : `MISMATCH: stored=${storedTotal}, calculated=${calculatedTotal}, diff=${diff}`,
  };
}

export function verifyShiftCashBalance(
  shift: CashShift,
  transactions: Transaction[],
  expenses: Expense[],
  withdrawals: CashWithdrawal[],
): { isConsistent: boolean; calculatedBalance: number; expectedCash: number; diff: number } {
  const openTime = new Date(shift.openedAt).getTime();
  const closeTime = shift.closedAt ? new Date(shift.closedAt).getTime() : Date.now();

  const cashIncome = transactions.filter(t =>
    (t.type === 'payment' || t.type === 'debt_payment') &&
    t.method === 'cash' && t.amount > 0 &&
    new Date(t.date).getTime() >= openTime &&
    new Date(t.date).getTime() <= closeTime
  ).reduce((s, t) => s + t.amount, 0);

  const cancelled = transactions.filter(t =>
    t.type === 'cancel_payment' && t.method === 'cash' &&
    new Date(t.date).getTime() >= openTime &&
    new Date(t.date).getTime() <= closeTime
  ).reduce((s, t) => s + t.amount, 0);

  const refunded = transactions.filter(t =>
    t.type === 'refund' && t.method === 'cash' &&
    new Date(t.date).getTime() >= openTime &&
    new Date(t.date).getTime() <= closeTime
  ).reduce((s, t) => s + t.amount, 0);

  const expenseTotal = expenses.filter(e => e.shiftId === shift.id).reduce((s, e) => s + e.amount, 0);
  const withdrawalTotal = withdrawals.filter(w => w.shiftId === shift.id).reduce((s, w) => s + w.amount, 0);

  const calculatedBalance = roundMoney(shift.carryOver + cashIncome - cancelled - refunded - expenseTotal - withdrawalTotal);
  const diff = roundMoney(Math.abs(calculatedBalance - shift.expectedCash));
  const isConsistent = diff < 1;

  return { isConsistent, calculatedBalance, expectedCash: shift.expectedCash, diff };
}

export function verifySalaryAdvanceConsistency(
  salaryAdvances: SalaryAdvance[],
  _salaryPayments: SalaryPayment[],
): { issues: string[] } {
  const issues: string[] = [];

  for (const adv of salaryAdvances) {
    if (adv.remainingAmount < 0) {
      issues.push(`Аванс ${adv.id} (${adv.employeeName}): остаток отрицательный (${adv.remainingAmount})`);
    }
    if (adv.remainingAmount > adv.amount) {
      issues.push(`Аванс ${adv.id} (${adv.employeeName}): остаток (${adv.remainingAmount}) > выданного (${adv.amount})`);
    }
  }

  return { issues };
}

export function normalizeRoundingArtifact(value: number): number {
  if (Math.abs(value) < 0.005) return 0;
  return roundMoney(value);
}

export function runFullDiagnostic(data: FullDiagnosticData): {
  issues: IntegrityIssue[];
  healActions: SelfHealResult[];
  debtMismatches: Array<{ clientId: string; stored: number; calculated: number }>;
  shiftMismatches: Array<{ shiftId: string; expected: number; calculated: number }>;
  salaryIssues: string[];
  negativeDebts: Array<{ debtId: string; remaining: number }>;
  roundingArtifacts: Array<{ entityType: string; entityId: string; field: string; value: number }>;
} {
  const issues = validateDataIntegrity(data);
  const healActions: SelfHealResult[] = [];
  const debtMismatches: Array<{ clientId: string; stored: number; calculated: number }> = [];
  const shiftMismatches: Array<{ shiftId: string; expected: number; calculated: number }> = [];
  const negativeDebts: Array<{ debtId: string; remaining: number }> = [];
  const roundingArtifacts: Array<{ entityType: string; entityId: string; field: string; value: number }> = [];

  const clientsWithDebts = new Set<string>();
  for (const d of data.debts) {
    if (d.remainingAmount > 0) clientsWithDebts.add(d.clientId);
  }
  for (const cd of data.clientDebts) {
    if (cd.totalAmount > 0) clientsWithDebts.add(cd.clientId);
  }

  for (const clientId of clientsWithDebts) {
    const result = verifyClientDebtConsistency(
      clientId, data.debts, data.clientDebts, data.dailyDebtAccruals, data.sessions
    );
    if (!result.isConsistent) {
      debtMismatches.push({ clientId, stored: result.storedTotal, calculated: result.calculatedTotal });
      logAnomaly({
        severity: 'warning',
        category: 'debt_mismatch',
        message: `Расхождение долга клиента ${clientId}: хранится ${result.storedTotal}, рассчитано ${result.calculatedTotal}`,
        expected: String(result.calculatedTotal),
        actual: String(result.storedTotal),
        action: 'logged_only',
        entityId: clientId,
        entityType: 'client',
      });
    }
  }

  const openShifts = data.shifts.filter(s => s.status === 'open');
  for (const shift of openShifts) {
    const result = verifyShiftCashBalance(shift, data.transactions, data.expenses, data.withdrawals);
    if (!result.isConsistent) {
      shiftMismatches.push({ shiftId: shift.id, expected: result.expectedCash, calculated: result.calculatedBalance });
      logAnomaly({
        severity: 'warning',
        category: 'cash_balance',
        message: `Расхождение кассы смены ${shift.operatorName}: ожидается ${result.expectedCash}, рассчитано ${result.calculatedBalance} (разница ${result.diff})`,
        expected: String(result.calculatedBalance),
        actual: String(result.expectedCash),
        action: 'logged_only',
        entityId: shift.id,
        entityType: 'shift',
      });
    }
  }

  for (const debt of data.debts) {
    if (debt.remainingAmount < 0) {
      negativeDebts.push({ debtId: debt.id, remaining: debt.remainingAmount });
      logAnomaly({
        severity: 'error',
        category: 'debt_mismatch',
        message: `Долг ${debt.id} имеет отрицательный остаток: ${debt.remainingAmount} ₽`,
        expected: '≥ 0',
        actual: String(debt.remainingAmount),
        action: 'logged_only',
        entityId: debt.id,
        entityType: 'debt',
      });
    }

    if (Math.abs(debt.remainingAmount) < 0.005 && debt.remainingAmount !== 0) {
      roundingArtifacts.push({ entityType: 'debt', entityId: debt.id, field: 'remainingAmount', value: debt.remainingAmount });
    }
  }

  for (const cd of data.clientDebts) {
    if (cd.totalAmount < 0) {
      logAnomaly({
        severity: 'error',
        category: 'debt_mismatch',
        message: `ClientDebt ${cd.clientId}: totalAmount отрицательный (${cd.totalAmount})`,
        expected: '≥ 0',
        actual: String(cd.totalAmount),
        action: 'logged_only',
        entityId: cd.clientId,
        entityType: 'client_debt',
      });
    }
    if (cd.activeAmount < 0) {
      logAnomaly({
        severity: 'warning',
        category: 'debt_mismatch',
        message: `ClientDebt ${cd.clientId}: activeAmount отрицательный (${cd.activeAmount})`,
        expected: '≥ 0',
        actual: String(cd.activeAmount),
        action: 'logged_only',
        entityId: cd.clientId,
        entityType: 'client_debt',
      });
    }

    if (Math.abs(cd.totalAmount) < 0.005 && cd.totalAmount !== 0) {
      roundingArtifacts.push({ entityType: 'client_debt', entityId: cd.clientId, field: 'totalAmount', value: cd.totalAmount });
    }
  }

  const salaryResult = verifySalaryAdvanceConsistency(data.salaryAdvances, data.salaryPayments);
  for (const issue of salaryResult.issues) {
    logAnomaly({
      severity: 'warning',
      category: 'salary_mismatch',
      message: issue,
      action: 'logged_only',
    });
  }

  if (roundingArtifacts.length > 0) {
    logAnomaly({
      severity: 'info',
      category: 'rounding_artifact',
      message: `Обнаружено ${roundingArtifacts.length} артефактов округления`,
      action: 'logged_only',
      actionDetail: roundingArtifacts.map(a => `${a.entityType}/${a.entityId}.${a.field}=${a.value}`).join(', '),
    });
  }

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  console.log(`[Diagnostic] Full diagnostic complete: ${errorCount} errors, ${warningCount} warnings, ${debtMismatches.length} debt mismatches, ${shiftMismatches.length} shift mismatches, ${roundingArtifacts.length} rounding artifacts`);

  return {
    issues,
    healActions,
    debtMismatches,
    shiftMismatches,
    salaryIssues: salaryResult.issues,
    negativeDebts,
    roundingArtifacts,
  };
}

export interface HealableData {
  debts: Debt[];
  clientDebts: ClientDebt[];
  salaryAdvances: SalaryAdvance[];
}

export function performSafeHealing(data: HealableData): {
  healedDebts: Debt[];
  healedClientDebts: ClientDebt[];
  healedSalaryAdvances: SalaryAdvance[];
  actions: SelfHealResult[];
} {
  const actions: SelfHealResult[] = [];
  let debtsChanged = false;
  let clientDebtsChanged = false;
  let advancesChanged = false;

  const healedDebts = data.debts.map(d => {
    if (d.remainingAmount < 0 && d.remainingAmount > -0.01) {
      logAnomaly({
        severity: 'info',
        category: 'rounding_artifact',
        message: `Долг ${d.id}: остаток ${d.remainingAmount} нормализован до 0`,
        expected: '0',
        actual: String(d.remainingAmount),
        action: 'normalized',
        entityId: d.id,
        entityType: 'debt',
      });
      actions.push({ healed: true, description: `Долг ${d.id}: остаток ${d.remainingAmount} → 0 (артефакт округления)`, category: 'rounding_artifact' });
      debtsChanged = true;
      return { ...d, remainingAmount: 0, updatedAt: new Date().toISOString() };
    }
    if (d.remainingAmount > d.totalAmount && d.remainingAmount - d.totalAmount < 0.01) {
      logAnomaly({
        severity: 'info',
        category: 'rounding_artifact',
        message: `Долг ${d.id}: остаток (${d.remainingAmount}) немного > суммы (${d.totalAmount}), нормализован`,
        expected: String(d.totalAmount),
        actual: String(d.remainingAmount),
        action: 'normalized',
        entityId: d.id,
        entityType: 'debt',
      });
      actions.push({ healed: true, description: `Долг ${d.id}: остаток ${d.remainingAmount} → ${d.totalAmount}`, category: 'rounding_artifact' });
      debtsChanged = true;
      return { ...d, remainingAmount: d.totalAmount, updatedAt: new Date().toISOString() };
    }
    return d;
  });

  const healedClientDebts = data.clientDebts.map(cd => {
    let changed = false;
    let newCd = { ...cd };

    if (cd.totalAmount < 0 && cd.totalAmount > -0.01) {
      newCd.totalAmount = 0;
      changed = true;
      logAnomaly({
        severity: 'info',
        category: 'rounding_artifact',
        message: `ClientDebt ${cd.clientId}: totalAmount ${cd.totalAmount} → 0`,
        action: 'normalized',
        entityId: cd.clientId,
        entityType: 'client_debt',
      });
    }
    if (cd.activeAmount < 0 && cd.activeAmount > -0.01) {
      newCd.activeAmount = 0;
      changed = true;
      logAnomaly({
        severity: 'info',
        category: 'rounding_artifact',
        message: `ClientDebt ${cd.clientId}: activeAmount ${cd.activeAmount} → 0`,
        action: 'normalized',
        entityId: cd.clientId,
        entityType: 'client_debt',
      });
    }
    if (cd.frozenAmount < 0 && cd.frozenAmount > -0.01) {
      newCd.frozenAmount = 0;
      changed = true;
    }

    if (changed) {
      clientDebtsChanged = true;
      newCd.lastUpdate = new Date().toISOString();
      actions.push({ healed: true, description: `ClientDebt ${cd.clientId}: нормализованы отрицательные артефакты`, category: 'rounding_artifact' });
    }
    return changed ? newCd : cd;
  });

  const healedSalaryAdvances = data.salaryAdvances.map(a => {
    if (a.remainingAmount < 0 && a.remainingAmount > -0.01) {
      logAnomaly({
        severity: 'info',
        category: 'rounding_artifact',
        message: `SalaryAdvance ${a.id} (${a.employeeName}): остаток ${a.remainingAmount} → 0`,
        action: 'normalized',
        entityId: a.id,
        entityType: 'salary_advance',
      });
      actions.push({ healed: true, description: `Аванс ${a.employeeName}: остаток ${a.remainingAmount} → 0`, category: 'rounding_artifact' });
      advancesChanged = true;
      return { ...a, remainingAmount: 0, updatedAt: new Date().toISOString() };
    }
    return a;
  });

  if (actions.length > 0) {
    console.log(`[SelfHeal] Performed ${actions.length} safe healing actions`);
  }

  return {
    healedDebts: debtsChanged ? healedDebts : data.debts,
    healedClientDebts: clientDebtsChanged ? healedClientDebts : data.clientDebts,
    healedSalaryAdvances: advancesChanged ? healedSalaryAdvances : data.salaryAdvances,
    actions,
  };
}
