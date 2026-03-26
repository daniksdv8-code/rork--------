import { DEFAULT_TARIFFS } from '@/constants/tariffs';
import { Tariffs } from '@/types';

export interface MigrationResult {
  data: Record<string, any>;
  detectedVersion: number;
  migratedTo: number;
  warnings: string[];
}

const CURRENT_BACKUP_VERSION = 2;

export function detectBackupVersion(parsed: Record<string, any>): number {
  if (parsed.version === 2 && parsed.formatId === 'park_manager_backup') {
    return 2;
  }

  if (parsed.version === 1) {
    return 1;
  }

  if (parsed.formatId === 'park_manager_backup') {
    return parsed.version ?? 1;
  }

  if (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
    const d = parsed.data;
    if (Array.isArray(d.clients) || Array.isArray(d.cars) || Array.isArray(d.sessions) || Array.isArray(d.parking_entries)) {
      return 1;
    }
  }

  if (Array.isArray(parsed.clients) || Array.isArray(parsed.cars)) {
    return 0;
  }

  if (Array.isArray(parsed.parking_entries) || Array.isArray(parsed.entries)) {
    return 0;
  }

  if (parsed.backup && typeof parsed.backup === 'object') {
    return 0;
  }

  const keys = Object.keys(parsed);
  const knownKeys = ['clients', 'cars', 'sessions', 'parking_entries', 'entries', 'debts', 'payments', 'shifts', 'tariffs', 'transactions', 'data', 'backup', 'expenses', 'users', 'subscriptions'];
  const matchCount = keys.filter(k => knownKeys.includes(k)).length;
  if (matchCount >= 2) {
    return 0;
  }

  return -1;
}

function extractDataObject(parsed: Record<string, any>, version: number): Record<string, any> | null {
  if (version >= 1 && parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
    return parsed.data;
  }

  if (version === 0 && Array.isArray(parsed.clients)) {
    return parsed;
  }

  if (Array.isArray(parsed.clients)) {
    return parsed;
  }

  if (parsed.data && typeof parsed.data === 'object' && Array.isArray(parsed.data.clients)) {
    return parsed.data;
  }

  if (parsed.backup && typeof parsed.backup === 'object') {
    return parsed.backup;
  }

  if (Array.isArray(parsed.cars) || Array.isArray(parsed.parking_entries) || Array.isArray(parsed.entries)) {
    return parsed;
  }

  return null;
}

function migrateTariffs(raw: any): Tariffs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_TARIFFS };
  }

  const t = raw as Record<string, any>;

  const monthlyCash = typeof t.monthlyCash === 'number' ? t.monthlyCash
    : typeof t.monthly_cash === 'number' ? t.monthly_cash
    : typeof t.monthlyRate === 'number' ? t.monthlyRate
    : DEFAULT_TARIFFS.monthlyCash;

  const monthlyCard = typeof t.monthlyCard === 'number' ? t.monthlyCard
    : typeof t.monthly_card === 'number' ? t.monthly_card
    : DEFAULT_TARIFFS.monthlyCard;

  const onetimeCash = typeof t.onetimeCash === 'number' ? t.onetimeCash
    : typeof t.onetime_cash === 'number' ? t.onetime_cash
    : typeof t.dailyCash === 'number' ? t.dailyCash
    : typeof t.daily_cash === 'number' ? t.daily_cash
    : typeof t.dailyRate === 'number' ? t.dailyRate
    : DEFAULT_TARIFFS.onetimeCash;

  const onetimeCard = typeof t.onetimeCard === 'number' ? t.onetimeCard
    : typeof t.onetime_card === 'number' ? t.onetime_card
    : typeof t.dailyCard === 'number' ? t.dailyCard
    : typeof t.daily_card === 'number' ? t.daily_card
    : DEFAULT_TARIFFS.onetimeCard;

  const lombardRate = typeof t.lombardRate === 'number' ? t.lombardRate
    : typeof t.lombard_rate === 'number' ? t.lombard_rate
    : typeof t.lombardRatePerDay === 'number' ? t.lombardRatePerDay
    : typeof t.rate_per_day === 'number' ? t.rate_per_day
    : DEFAULT_TARIFFS.lombardRate;

  return { monthlyCash, monthlyCard, onetimeCash, onetimeCard, lombardRate };
}

function migrateSessionStatus(status: any): string {
  if (!status || typeof status !== 'string') return 'draft';
  const s = status.toLowerCase().trim();

  const statusMap: Record<string, string> = {
    'draft': 'draft',
    'active': 'active',
    'active_debt': 'active_debt',
    'activedebt': 'active_debt',
    'completed': 'completed',
    'released': 'released',
    'released_debt': 'released_debt',
    'releaseddebt': 'released_debt',
    'closed': 'released',
    'closed_debt': 'released_debt',
    'in_progress': 'active',
    'pending': 'draft',
    'debt': 'active_debt',
    'finished': 'released',
  };

  return statusMap[s] ?? 'active';
}

function migrateSession(s: any): any {
  if (!s || typeof s !== 'object') return null;

  return {
    id: s.id ?? '',
    carId: s.carId ?? s.car_id ?? '',
    clientId: s.clientId ?? s.client_id ?? '',
    entryTime: s.entryTime ?? s.entry_time ?? s.startDate ?? s.start_date ?? new Date().toISOString(),
    exitTime: s.exitTime ?? s.exit_time ?? s.endDate ?? s.end_date ?? null,
    serviceType: s.serviceType ?? s.service_type ?? s.type ?? 'onetime',
    status: migrateSessionStatus(s.status),
    plannedDepartureTime: s.plannedDepartureTime ?? s.planned_departure ?? null,
    managerId: s.managerId ?? s.manager_id ?? s.operatorId ?? '',
    managerName: s.managerName ?? s.manager_name ?? s.operatorName ?? '',
    shiftId: s.shiftId ?? s.shift_id ?? null,
    cancelled: s.cancelled ?? false,
    updatedAt: s.updatedAt ?? s.updated_at ?? undefined,
    prepaidAmount: s.prepaidAmount ?? s.prepaid_amount ?? undefined,
    prepaidMethod: s.prepaidMethod ?? s.prepaid_method ?? undefined,
    tariffType: s.tariffType ?? s.tariff_type ?? (s.serviceType === 'lombard' || s.type === 'lombard' ? 'lombard' : 'standard'),
    lombardRateApplied: s.lombardRateApplied ?? s.lombard_rate_applied ?? s.lombard_rate ?? undefined,
  };
}

function migrateClient(c: any): any {
  if (!c || typeof c !== 'object') return null;
  return {
    id: c.id ?? '',
    name: c.name ?? '',
    phone: c.phone ?? '',
    phone2: c.phone2 ?? undefined,
    notes: c.notes ?? c.comment ?? '',
    createdAt: c.createdAt ?? c.created_at ?? new Date().toISOString(),
    updatedAt: c.updatedAt ?? c.updated_at ?? undefined,
    deleted: c.deleted ?? false,
    deletedAt: c.deletedAt ?? c.deleted_at ?? undefined,
  };
}

function migrateCar(c: any): any {
  if (!c || typeof c !== 'object') return null;
  return {
    id: c.id ?? '',
    plateNumber: c.plateNumber ?? c.plate_number ?? c.plate ?? c.number ?? '',
    carModel: c.carModel ?? c.car_model ?? c.model ?? undefined,
    clientId: c.clientId ?? c.client_id ?? '',
    updatedAt: c.updatedAt ?? c.updated_at ?? undefined,
    deleted: c.deleted ?? false,
    deletedAt: c.deletedAt ?? c.deleted_at ?? undefined,
  };
}

function migrateDebt(d: any): any {
  if (!d || typeof d !== 'object') return null;
  return {
    id: d.id ?? '',
    clientId: d.clientId ?? d.client_id ?? '',
    carId: d.carId ?? d.car_id ?? '',
    totalAmount: d.totalAmount ?? d.total_amount ?? d.amount ?? 0,
    remainingAmount: d.remainingAmount ?? d.remaining_amount ?? d.totalAmount ?? d.total_amount ?? d.amount ?? 0,
    createdAt: d.createdAt ?? d.created_at ?? new Date().toISOString(),
    description: d.description ?? '',
    updatedAt: d.updatedAt ?? d.updated_at ?? undefined,
    parkingEntryId: d.parkingEntryId ?? d.parking_entry_id ?? d.sessionId ?? d.session_id ?? undefined,
    status: d.status ?? 'active',
  };
}

function migratePayment(p: any): any {
  if (!p || typeof p !== 'object') return null;
  return {
    id: p.id ?? '',
    clientId: p.clientId ?? p.client_id ?? '',
    carId: p.carId ?? p.car_id ?? '',
    amount: p.amount ?? 0,
    method: p.method ?? p.paymentMethod ?? p.payment_method ?? 'cash',
    date: p.date ?? p.createdAt ?? new Date().toISOString(),
    serviceType: p.serviceType ?? p.service_type ?? 'onetime',
    operatorId: p.operatorId ?? p.operator_id ?? '',
    operatorName: p.operatorName ?? p.operator_name ?? '',
    description: p.description ?? '',
    shiftId: p.shiftId ?? p.shift_id ?? null,
    cancelled: p.cancelled ?? false,
    updatedAt: p.updatedAt ?? p.updated_at ?? undefined,
    originalAmount: p.originalAmount ?? undefined,
    refundAmount: p.refundAmount ?? undefined,
    refundDate: p.refundDate ?? undefined,
    refundMethod: p.refundMethod ?? undefined,
    refundReason: p.refundReason ?? undefined,
  };
}

function migrateShift(s: any): any {
  if (!s || typeof s !== 'object') return null;
  return {
    id: s.id ?? '',
    operatorId: s.operatorId ?? s.operator_id ?? '',
    operatorName: s.operatorName ?? s.operator_name ?? '',
    operatorRole: s.operatorRole ?? s.operator_role ?? undefined,
    openedAt: s.openedAt ?? s.opened_at ?? s.startTime ?? new Date().toISOString(),
    closedAt: s.closedAt ?? s.closed_at ?? s.endTime ?? null,
    status: s.status ?? 'closed',
    expectedCash: s.expectedCash ?? s.expected_cash ?? 0,
    actualCash: s.actualCash ?? s.actual_cash ?? null,
    carryOver: s.carryOver ?? s.carry_over ?? 0,
    notes: s.notes ?? '',
    updatedAt: s.updatedAt ?? s.updated_at ?? undefined,
    closingSummary: s.closingSummary ?? s.closing_summary ?? undefined,
  };
}

function safeArray(val: any): any[] {
  return Array.isArray(val) ? val : [];
}

function safeFilterNull(arr: any[]): any[] {
  return arr.filter((item: any) => item !== null && item !== undefined && typeof item === 'object' && item.id);
}

export function migrateBackupData(parsed: Record<string, any>): MigrationResult {
  const warnings: string[] = [];
  const detectedVersion = detectBackupVersion(parsed);

  console.log(`[BackupMigration] Detected version: ${detectedVersion}`);

  if (detectedVersion === -1) {
    return {
      data: {},
      detectedVersion: -1,
      migratedTo: -1,
      warnings: ['Не удалось определить формат файла бэкапа'],
    };
  }

  const d = extractDataObject(parsed, detectedVersion);
  if (!d) {
    return {
      data: {},
      detectedVersion,
      migratedTo: -1,
      warnings: ['Не удалось извлечь данные из файла бэкапа'],
    };
  }

  const rawClients = safeArray(d.clients);
  const rawCars = safeArray(d.cars);
  const rawSessions = safeArray(d.sessions ?? d.parkingEntries ?? d.parking_entries ?? d.entries);
  const rawPayments = safeArray(d.payments);
  const rawDebts = safeArray(d.debts);
  const rawTransactions = safeArray(d.transactions);
  const rawShifts = safeArray(d.shifts ?? d.cashShifts ?? d.cash_shifts);
  const rawExpenses = safeArray(d.expenses);
  const rawWithdrawals = safeArray(d.withdrawals ?? d.cashWithdrawals ?? d.cash_withdrawals);
  const rawSubscriptions = safeArray(d.subscriptions ?? d.monthlySubscriptions ?? d.monthly_subscriptions);
  const rawUsers = safeArray(d.users);

  const clients = safeFilterNull(rawClients.map(migrateClient));
  const cars = safeFilterNull(rawCars.map(migrateCar));
  const sessions = safeFilterNull(rawSessions.map(migrateSession));
  const payments = safeFilterNull(rawPayments.map(migratePayment));
  const debts = safeFilterNull(rawDebts.map(migrateDebt));
  const shifts = safeFilterNull(rawShifts.map(migrateShift));
  const tariffs = migrateTariffs(d.tariffs);

  if (rawClients.length > 0 && clients.length < rawClients.length) {
    warnings.push(`${rawClients.length - clients.length} клиентов пропущено из-за некорректных данных`);
  }
  if (rawCars.length > 0 && cars.length < rawCars.length) {
    warnings.push(`${rawCars.length - cars.length} машин пропущено из-за некорректных данных`);
  }
  if (rawSessions.length > 0 && sessions.length < rawSessions.length) {
    warnings.push(`${rawSessions.length - sessions.length} заездов пропущено из-за некорректных данных`);
  }

  if (!d.tariffs) {
    warnings.push('Тарифы не найдены в бэкапе, применены значения по умолчанию');
  }

  const hasDailyDebtAccruals = Array.isArray(d.dailyDebtAccruals) && d.dailyDebtAccruals.length > 0;
  const hasClientDebts = Array.isArray(d.clientDebts) && d.clientDebts.length > 0;
  const hasCashOperations = Array.isArray(d.cashOperations) && d.cashOperations.length > 0;
  const hasTeamViolations = Array.isArray(d.teamViolations) && d.teamViolations.length > 0;
  const hasAdminExpenses = Array.isArray(d.adminExpenses) && d.adminExpenses.length > 0;
  const hasAdminCashOperations = Array.isArray(d.adminCashOperations) && d.adminCashOperations.length > 0;
  const hasExpenseCategories = Array.isArray(d.expenseCategories) && d.expenseCategories.length > 0;
  const hasScheduledShifts = Array.isArray(d.scheduledShifts) && d.scheduledShifts.length > 0;
  const hasActionLogs = Array.isArray(d.actionLogs) && d.actionLogs.length > 0;

  if (detectedVersion < 2) {
    const newFieldsMissing: string[] = [];
    if (!hasDailyDebtAccruals) newFieldsMissing.push('dailyDebtAccruals');
    if (!hasClientDebts) newFieldsMissing.push('clientDebts');
    if (!hasCashOperations) newFieldsMissing.push('cashOperations');
    if (!hasTeamViolations) newFieldsMissing.push('teamViolations');
    if (!hasAdminExpenses) newFieldsMissing.push('adminExpenses');
    if (!hasAdminCashOperations) newFieldsMissing.push('adminCashOperations');
    if (!hasExpenseCategories) newFieldsMissing.push('expenseCategories');
    if (newFieldsMissing.length > 0) {
      warnings.push(`Поля из новой версии (${newFieldsMissing.join(', ')}) отсутствуют — инициализированы пустыми массивами`);
    }
  }

  const migratedData: Record<string, any> = {
    clients,
    cars,
    sessions,
    subscriptions: safeArray(rawSubscriptions),
    payments,
    debts,
    transactions: safeArray(rawTransactions),
    tariffs,
    shifts,
    expenses: safeArray(rawExpenses),
    withdrawals: safeArray(rawWithdrawals),
    users: rawUsers,
    deletedClientIds: safeArray(d.deletedClientIds ?? d.deleted_client_ids),
    scheduledShifts: hasScheduledShifts ? d.scheduledShifts : safeArray(d.scheduled_shifts),
    actionLogs: hasActionLogs ? d.actionLogs : safeArray(d.action_logs),
    adminExpenses: hasAdminExpenses ? d.adminExpenses : safeArray(d.admin_expenses),
    adminCashOperations: hasAdminCashOperations ? d.adminCashOperations : safeArray(d.admin_cash_operations),
    expenseCategories: hasExpenseCategories ? d.expenseCategories : safeArray(d.expense_categories),
    dailyDebtAccruals: hasDailyDebtAccruals ? d.dailyDebtAccruals : safeArray(d.daily_debt_accruals),
    clientDebts: hasClientDebts ? d.clientDebts : safeArray(d.client_debts),
    cashOperations: hasCashOperations ? d.cashOperations : safeArray(d.cash_operations),
    teamViolations: hasTeamViolations ? d.teamViolations : safeArray(d.team_violations),
  };

  console.log(`[BackupMigration] Migration complete: v${detectedVersion} → v${CURRENT_BACKUP_VERSION}, ` +
    `clients=${clients.length}, cars=${cars.length}, sessions=${sessions.length}, warnings=${warnings.length}`);

  return {
    data: migratedData,
    detectedVersion,
    migratedTo: CURRENT_BACKUP_VERSION,
    warnings,
  };
}
