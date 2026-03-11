import { Client, Car, ParkingSession, MonthlySubscription, Payment, Debt, Transaction, CashShift, Expense, CashWithdrawal } from '@/types';

export interface IntegrityIssue {
  severity: 'error' | 'warning';
  category: string;
  message: string;
  entityId?: string;
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
  if (openShifts.length > 1) {
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
  for (const [plate, cars] of duplicatePlates) {
    if (cars.length > 1) {
      issues.push({
        severity: 'error',
        category: 'duplicate_plate',
        message: `Дублированный номер ${plate}: ${cars.length} машин (IDs: ${cars.map(c => c.id).join(', ')})`,
      });
    }
  }

  console.log(`[Integrity] Validation complete: ${issues.filter(i => i.severity === 'error').length} errors, ${issues.filter(i => i.severity === 'warning').length} warnings`);
  return issues;
}
