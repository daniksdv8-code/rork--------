export function roundMoney(value: number): number {
  return Math.round(value);
}

export function formatMoney(value: number): string {
  return String(Math.round(value));
}

export function normalizeMoneyData(data: Record<string, any>): Record<string, any> {
  if (!data) return data;
  const result = { ...data };

  const normalizeArray = (arr: any[] | undefined, fields: string[]): any[] | undefined => {
    if (!Array.isArray(arr)) return arr;
    let changed = false;
    const out = arr.map(item => {
      let itemChanged = false;
      const copy = { ...item };
      for (const f of fields) {
        if (typeof copy[f] === 'number' && copy[f] !== Math.round(copy[f])) {
          copy[f] = Math.round(copy[f]);
          itemChanged = true;
        }
      }
      if (itemChanged) { changed = true; return copy; }
      return item;
    });
    return changed ? out : arr;
  };

  result.payments = normalizeArray(result.payments, ['amount', 'baseAmount', 'adjustedAmount', 'refundAmount', 'originalAmount']);
  result.debts = normalizeArray(result.debts, ['totalAmount', 'remainingAmount']);
  result.transactions = normalizeArray(result.transactions, ['amount']);
  result.expenses = normalizeArray(result.expenses, ['amount']);
  result.withdrawals = normalizeArray(result.withdrawals, ['amount']);
  result.adminExpenses = normalizeArray(result.adminExpenses, ['amount']);
  result.adminCashOperations = normalizeArray(result.adminCashOperations, ['amount']);
  result.clientDebts = normalizeArray(result.clientDebts, ['totalAmount', 'frozenAmount', 'activeAmount']);
  result.dailyDebtAccruals = normalizeArray(result.dailyDebtAccruals, ['amount', 'tariffRate']);
  result.cashOperations = normalizeArray(result.cashOperations, ['amount', 'balanceBefore', 'balanceAfter']);
  result.salaryAdvances = normalizeArray(result.salaryAdvances, ['amount', 'remainingAmount']);
  result.salaryPayments = normalizeArray(result.salaryPayments, ['grossAmount', 'debtDeducted', 'netPaid']);
  result.shifts = normalizeArray(result.shifts, ['expectedCash', 'actualCash', 'carryOver', 'cashVariance']);
  result.sessions = normalizeArray(result.sessions, ['prepaidAmount', 'lombardRateApplied']);

  if (result.shifts) {
    result.shifts = (result.shifts as any[]).map(s => {
      if (s.closingSummary) {
        const cs = { ...s.closingSummary };
        let csChanged = false;
        for (const f of ['cashIncome', 'cardIncome', 'totalExpenses', 'totalWithdrawals', 'calculatedBalance', 'discrepancy']) {
          if (typeof cs[f] === 'number' && cs[f] !== Math.round(cs[f])) {
            cs[f] = Math.round(cs[f]);
            csChanged = true;
          }
        }
        if (csChanged) return { ...s, closingSummary: cs };
      }
      return s;
    });
  }

  console.log('[Money] Data normalized to whole rubles');
  return result;
}
