import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import {
  Client, Car, ParkingSession, MonthlySubscription,
  Payment, Debt, Transaction, Tariffs,
  PaymentMethod, ServiceType, CashShift, Expense, User, CashWithdrawal, ScheduledShift,
  ActionLog, ActionType, AdminExpense, AdminCashOperation, ExpenseCategory,
  DailyDebtAccrual, ClientDebt, CashOperation, TeamViolationMonth
} from '@/types';
import { EMPTY_DATA } from '@/mocks/initialData';
import { generateId } from '@/utils/id';
import { roundMoney } from '@/utils/money';
import { calculateDays, addMonths, isExpired, isToday, daysUntil, getMonthlyAmount } from '@/utils/date';
import { formatPlateNumber } from '@/utils/plate';
import { useAuth } from './AuthProvider';
import { trpc, vanillaTrpc } from '@/lib/trpc';

const STORAGE_KEY = 'park_data';
const MAX_TRANSACTIONS = 10000;
const MAX_ACTION_LOGS = 5000;

export const [ParkingProvider, useParking] = createContextHook(() => {
  const { currentUser } = useAuth();

  const [clients, setClients] = useState<Client[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [sessions, setSessions] = useState<ParkingSession[]>([]);
  const [subscriptions, setSubscriptions] = useState<MonthlySubscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tariffs, setTariffs] = useState<Tariffs>(EMPTY_DATA.tariffs);
  const [shifts, setShifts] = useState<CashShift[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [withdrawals, setWithdrawals] = useState<CashWithdrawal[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [scheduledShifts, setScheduledShifts] = useState<ScheduledShift[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [adminExpenses, setAdminExpenses] = useState<AdminExpense[]>([]);
  const [adminCashOperations, setAdminCashOperations] = useState<AdminCashOperation[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [dailyDebtAccruals, setDailyDebtAccruals] = useState<DailyDebtAccrual[]>([]);
  const [clientDebts, setClientDebts] = useState<ClientDebt[]>([]);
  const [cashOperations, setCashOperations] = useState<CashOperation[]>([]);
  const [teamViolations, setTeamViolations] = useState<TeamViolationMonth[]>([]);
  const [deletedClientIds, setDeletedClientIds] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [isServerSynced, setIsServerSynced] = useState<boolean>(false);

  const lastSyncedVersionRef = useRef<number>(-1);
  const pushingRef = useRef<boolean>(false);
  const initialPushDoneRef = useRef<boolean>(false);
  const serverInitializedRef = useRef<boolean>(false);
  const serverDataAppliedRef = useRef<boolean>(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localDirtyRef = useRef<boolean>(false);
  const pushRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localChangeCounterRef = useRef<number>(0);
  const restoreEpochRef = useRef<number>(-1);
  const restoreInProgressRef = useRef<boolean>(false);

  const latestDataRef = useRef({
    clients, cars, sessions, subscriptions, payments, debts, transactions, tariffs, shifts, expenses, withdrawals, users, deletedClientIds, scheduledShifts, actionLogs, adminExpenses, adminCashOperations, expenseCategories, dailyDebtAccruals, clientDebts, cashOperations, teamViolations,
  });
  useEffect(() => {
    latestDataRef.current = { clients, cars, sessions, subscriptions, payments, debts, transactions, tariffs, shifts, expenses, withdrawals, users, deletedClientIds, scheduledShifts, actionLogs, adminExpenses, adminCashOperations, expenseCategories, dailyDebtAccruals, clientDebts, cashOperations, teamViolations };
  }, [clients, cars, sessions, subscriptions, payments, debts, transactions, tariffs, shifts, expenses, withdrawals, users, deletedClientIds, scheduledShifts, actionLogs, adminExpenses, adminCashOperations, expenseCategories, dailyDebtAccruals, clientDebts, cashOperations, teamViolations]);

  const logAction = useCallback((action: ActionType, label: string, details: string, entityId?: string, entityType?: string) => {
    const entry: ActionLog = {
      id: generateId(),
      action,
      label,
      details,
      userId: currentUser?.id ?? 'unknown',
      userName: currentUser?.name ?? 'Неизвестно',
      timestamp: new Date().toISOString(),
      entityId,
      entityType,
    };
    setActionLogs(prev => [entry, ...prev].slice(0, MAX_ACTION_LOGS));
    console.log(`[ActionLog] ${action}: ${label} — ${details} (by ${entry.userName})`);
  }, [currentUser]);

  const utils = trpc.useUtils();

  const dataQuery = trpc.parking.getData.useQuery(undefined, {
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    staleTime: 0,
  });

  const applyServerData = useCallback((d: Record<string, any>) => {
    const deleted = new Set<string>(d.deletedClientIds || []);
    setDeletedClientIds(d.deletedClientIds || []);
    setClients(deleted.size > 0 ? (d.clients || []).filter((c: any) => !deleted.has(c.id)) : (d.clients || []));
    setCars(deleted.size > 0 ? (d.cars || []).filter((c: any) => !deleted.has(c.clientId)) : (d.cars || []));
    setSessions(deleted.size > 0 ? (d.sessions || []).filter((s: any) => !deleted.has(s.clientId)) : (d.sessions || []));
    setSubscriptions(deleted.size > 0 ? (d.subscriptions || []).filter((s: any) => !deleted.has(s.clientId)) : (d.subscriptions || []));
    setPayments(d.payments || []);
    setDebts(deleted.size > 0 ? (d.debts || []).filter((dd: any) => !deleted.has(dd.clientId)) : (d.debts || []));
    setTransactions((d.transactions || []).slice(0, MAX_TRANSACTIONS));
    if (d.tariffs) setTariffs(d.tariffs);
    setShifts(d.shifts ?? []);
    setExpenses(d.expenses ?? []);
    setWithdrawals(d.withdrawals ?? []);
    const serverUsers = d.users;
    if (serverUsers && Array.isArray(serverUsers) && serverUsers.length > 0) {
      setUsers(serverUsers.filter((u: any) => !u.deleted));
    }
    setScheduledShifts((d.scheduledShifts ?? []).filter((s: any) => !s.deleted));
    setActionLogs((d.actionLogs ?? []).slice(0, MAX_ACTION_LOGS));
    setAdminExpenses(d.adminExpenses ?? []);
    setAdminCashOperations(d.adminCashOperations ?? []);
    setExpenseCategories((d.expenseCategories ?? []).filter((c: any) => !c.deleted));
    setDailyDebtAccruals(d.dailyDebtAccruals ?? []);
    setClientDebts(deleted.size > 0 ? (d.clientDebts ?? []).filter((cd: any) => !deleted.has(cd.clientId)) : (d.clientDebts ?? []));
    setCashOperations(d.cashOperations ?? []);
    setTeamViolations(d.teamViolations ?? []);
    console.log(`[Sync] Applied server data: clients=${(d.clients||[]).length}, sessions=${(d.sessions||[]).length}, shifts=${(d.shifts||[]).length}, users=${(serverUsers||[]).length}`);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        if (serverDataAppliedRef.current) {
          console.log('[Load] Server data already applied, skipping AsyncStorage load');
          return;
        }
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && !serverDataAppliedRef.current) {
          const data = JSON.parse(stored);
          if (data.clients) setClients(data.clients);
          if (data.cars) setCars(data.cars);
          if (data.sessions) setSessions(data.sessions);
          if (data.subscriptions) setSubscriptions(data.subscriptions);
          if (data.payments) setPayments(data.payments);
          if (data.debts) setDebts(data.debts);
          if (data.transactions) setTransactions(data.transactions);
          if (data.tariffs) setTariffs(data.tariffs);
          if (data.shifts) setShifts(data.shifts);
          if (data.expenses) setExpenses(data.expenses);
          if (data.withdrawals) setWithdrawals(data.withdrawals);
          if (data.deletedClientIds) setDeletedClientIds(data.deletedClientIds);
          if (data.scheduledShifts) setScheduledShifts(data.scheduledShifts);
          if (data.actionLogs) setActionLogs(data.actionLogs);
          if (data.adminExpenses) setAdminExpenses(data.adminExpenses);
          if (data.adminCashOperations) setAdminCashOperations(data.adminCashOperations);
          if (data.expenseCategories) setExpenseCategories(data.expenseCategories);
          if (data.dailyDebtAccruals) setDailyDebtAccruals(data.dailyDebtAccruals);
          if (data.clientDebts) setClientDebts(data.clientDebts);
          if (data.cashOperations) setCashOperations(data.cashOperations);
          if (data.teamViolations) setTeamViolations(data.teamViolations);
          if (data.users) {
            setUsers(data.users);
          }
          console.log('[Load] Loaded from AsyncStorage as fallback');
        }
      } catch (e) {
        console.log('Failed to load parking data:', e);
      } finally {
        setIsLoaded(true);
      }
    };
    void load();
  }, []);

  const skipLogVersionRef = useRef<number>(-1);

  useEffect(() => {
    if (!dataQuery.data) return;
    const { data, version, initialized, restoreEpoch: serverEpoch } = dataQuery.data as {
      data: Record<string, unknown> | null;
      version: number;
      initialized: boolean;
      restoreEpoch: number;
    };

    if (!initialized && isLoaded && !initialPushDoneRef.current && !pushingRef.current) {
      console.log('[Sync] Server empty, pushing local data as initial');
      initialPushDoneRef.current = true;
      pushingRef.current = true;
      const localData = latestDataRef.current;
      vanillaTrpc.parking.pushData.mutate(localData as any).then((result: any) => {
        lastSyncedVersionRef.current = result.version;
        restoreEpochRef.current = result.restoreEpoch ?? 0;
        serverInitializedRef.current = true;
        pushingRef.current = false;
        localDirtyRef.current = false;
        if (!isServerSynced) setIsServerSynced(true);
        console.log(`[Sync] Initial push done, version: ${result.version}, epoch: ${result.restoreEpoch}`);
      }).catch((e: any) => {
        initialPushDoneRef.current = false;
        pushingRef.current = false;
        console.log('[Sync] Initial push failed:', e);
      });
      return;
    }

    if (initialized && restoreEpochRef.current >= 0 && serverEpoch !== restoreEpochRef.current) {
      console.log(`[Sync] EPOCH CHANGE detected: local=${restoreEpochRef.current}, server=${serverEpoch}. Forcing full resync.`);
      restoreEpochRef.current = serverEpoch;
      localDirtyRef.current = false;
      if (pushTimerRef.current) { clearTimeout(pushTimerRef.current); pushTimerRef.current = null; }
      if (pushRetryTimerRef.current) { clearTimeout(pushRetryTimerRef.current); pushRetryTimerRef.current = null; }
      if (data) {
        applyServerData(data as Record<string, any>);
        lastSyncedVersionRef.current = version;
        void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
        console.log(`[Sync] Full resync applied after epoch change, v${version}`);
      }
      if (!isServerSynced) setIsServerSynced(true);
      return;
    }

    if (restoreEpochRef.current < 0 && initialized) {
      restoreEpochRef.current = serverEpoch;
      console.log(`[Sync] Initial epoch set to ${serverEpoch}`);
    }

    if (initialized && data && version > lastSyncedVersionRef.current) {
      serverInitializedRef.current = true;
      serverDataAppliedRef.current = true;

      if (restoreInProgressRef.current) {
        console.log(`[Sync] Restore in progress, skipping server data v${version}`);
      } else if (pushingRef.current) {
        if (skipLogVersionRef.current !== version) {
          console.log(`[Sync] Server v${version} available, push in progress — will apply after push completes`);
          skipLogVersionRef.current = version;
        }
      } else {
        console.log(`[Sync] Applying server data v${version} (was v${lastSyncedVersionRef.current}), localDirty=${localDirtyRef.current}`);
        applyServerData(data as Record<string, any>);
        lastSyncedVersionRef.current = version;
        skipLogVersionRef.current = -1;
        void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});

        if (localDirtyRef.current) {
          console.log(`[Sync] Server data applied, now pushing pending local changes`);
          schedulePushImmediate();
        }
      }

      if (!isServerSynced) {
        setIsServerSynced(true);
        console.log('[Sync] Server data applied, marking as synced');
      }
    } else if (initialized && !isServerSynced) {
      serverInitializedRef.current = true;
      setIsServerSynced(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataQuery.data, isLoaded, isServerSynced, applyServerData]);

  const pushToServer = useCallback(async () => {
    if (pushingRef.current) {
      console.log('[Sync] Push already in progress, will retry after');
      return;
    }
    pushingRef.current = true;

    try {
      const localData = latestDataRef.current;
      const changeCountBefore = localChangeCounterRef.current;

      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(localData)).catch(e => console.log('Save failed:', e));

      const result = await vanillaTrpc.parking.pushData.mutate({
        ...localData,
        expectedVersion: lastSyncedVersionRef.current,
        clientRestoreEpoch: restoreEpochRef.current >= 0 ? restoreEpochRef.current : undefined,
      } as any) as any;

      if (result.epochConflict) {
        console.log(`[Sync] Epoch conflict on push! Server epoch=${result.restoreEpoch}. Discarding local, applying server.`);
        restoreEpochRef.current = result.restoreEpoch;
        lastSyncedVersionRef.current = result.version;
        localDirtyRef.current = false;
        if (result.data) {
          applyServerData(result.data as Record<string, any>);
          void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(result.data)).catch(() => {});
        }
        void utils.parking.getData.invalidate();
        return;
      }

      lastSyncedVersionRef.current = result.version;
      restoreEpochRef.current = result.restoreEpoch ?? restoreEpochRef.current;

      const hasNewLocalChanges = localChangeCounterRef.current !== changeCountBefore;

      if (result.data) {
        applyServerData(result.data as Record<string, any>);
        void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(result.data)).catch(() => {});
        console.log(`[Sync] Pushed & applied merged data, version: ${result.version}, epoch: ${result.restoreEpoch}`);
      } else {
        console.log(`[Sync] Pushed to server, version: ${result.version}`);
      }

      if (hasNewLocalChanges) {
        console.log(`[Sync] Local changes during push detected, scheduling re-push`);
        localDirtyRef.current = true;
        if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
        pushTimerRef.current = setTimeout(() => {
          pushTimerRef.current = null;
          void pushToServer();
        }, 50);
      } else {
        localDirtyRef.current = false;
      }

      void utils.parking.getData.invalidate();
    } catch (e) {
      console.log('[Sync] Push failed, will retry:', e);
      localDirtyRef.current = true;
      if (pushRetryTimerRef.current) clearTimeout(pushRetryTimerRef.current);
      pushRetryTimerRef.current = setTimeout(() => {
        pushRetryTimerRef.current = null;
        void pushToServer();
      }, 1500);
    } finally {
      pushingRef.current = false;
    }
  }, [utils, applyServerData]);

  const schedulePush = useCallback(() => {
    localDirtyRef.current = true;
    localChangeCounterRef.current++;
    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
    }
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      void pushToServer();
    }, 150);
  }, [pushToServer]);

  const schedulePushImmediate = useCallback(() => {
    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
    }
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      void pushToServer();
    }, 50);
  }, [pushToServer]);

  const updateShiftExpected = useCallback((shiftId: string, amount: number) => {
    const now = new Date().toISOString();
    setShifts(prev => prev.map(s =>
      s.id === shiftId ? { ...s, expectedCash: s.expectedCash + amount, updatedAt: now } : s
    ));
  }, []);

  const getActiveShift = useCallback((): CashShift | null => {
    return shifts.find(s => s.status === 'open') ?? null;
  }, [shifts]);

  const getActiveManagerShift = useCallback((): CashShift | null => {
    const openManagerShifts = shifts.filter(s => s.status === 'open' && s.operatorRole !== 'admin');
    if (openManagerShifts.length === 0) {
      const openShiftItem = shifts.find(s => s.status === 'open');
      if (!openShiftItem) return null;
      const shiftUser = users.find(u => u.id === openShiftItem.operatorId);
      if (shiftUser && shiftUser.role === 'manager') return openShiftItem;
      return null;
    }
    return openManagerShifts[0];
  }, [shifts, users]);

  const getActiveAdminShift = useCallback((): CashShift | null => {
    const adminShift = shifts.find(s => s.status === 'open' && s.operatorRole === 'admin');
    if (adminShift) return adminShift;
    const openShiftItem = shifts.find(s => s.status === 'open');
    if (!openShiftItem) return null;
    const shiftUser = users.find(u => u.id === openShiftItem.operatorId);
    if (shiftUser && shiftUser.role === 'admin') return openShiftItem;
    return null;
  }, [shifts, users]);

  const isShiftOpen = useCallback((): boolean => {
    return shifts.some(s => s.status === 'open');
  }, [shifts]);

  const isAdminShiftOpen = useCallback((): boolean => {
    return !!getActiveAdminShift();
  }, [getActiveAdminShift]);

  const needsShiftCheck = useCallback((): boolean => {
    if (!currentUser) return true;
    if (currentUser.role === 'admin') return false;
    return !isShiftOpen();
  }, [currentUser, isShiftOpen]);

  const addTransaction = useCallback((
    tx: Omit<Transaction, 'id' | 'operatorId' | 'operatorName' | 'shiftId'>
  ): Transaction => {
    let activeShift: CashShift | undefined;
    if (currentUser?.role === 'admin') {
      activeShift = shifts.find(s => s.status === 'open' && s.operatorRole === 'admin')
        ?? shifts.find(s => s.status === 'open');
    } else {
      activeShift = shifts.find(s => s.status === 'open' && s.operatorRole !== 'admin')
        ?? shifts.find(s => s.status === 'open');
    }
    const newTx: Transaction = {
      ...tx,
      id: generateId(),
      operatorId: currentUser?.id ?? 'unknown',
      operatorName: currentUser?.name ?? 'Неизвестно',
      shiftId: activeShift?.id ?? null,
    };
    setTransactions(prev => [newTx, ...prev].slice(0, MAX_TRANSACTIONS));
    return newTx;
  }, [currentUser, shifts]);

  const activeClients = useMemo(() => clients.filter(c => !c.deleted), [clients]);
  const activeCars = useMemo(() => cars.filter(c => !c.deleted), [cars]);

  const isClientDeleted = useCallback((clientId: string): boolean => {
    const client = clients.find(c => c.id === clientId);
    return !!client?.deleted;
  }, [clients]);

  const getClientByCar = useCallback((plateNumber: string): { client: Client; car: Car } | null => {
    const formatted = formatPlateNumber(plateNumber);
    const car = activeCars.find(c => c.plateNumber === formatted);
    if (!car) return null;
    const client = activeClients.find(c => c.id === car.clientId);
    if (!client) return null;
    return { client, car };
  }, [activeCars, activeClients]);

  const getCarsByClient = useCallback((clientId: string): Car[] => {
    return activeCars.filter(c => c.clientId === clientId);
  }, [activeCars]);

  const getAllCarsByClient = useCallback((clientId: string): Car[] => {
    return cars.filter(c => c.clientId === clientId);
  }, [cars]);

  const addClient = useCallback((name: string, phone: string, plateNumber: string, notes: string, carModel?: string): { client: Client; car: Car } => {
    const clientId = generateId();
    const carId = generateId();
    const now = new Date().toISOString();
    const newClient: Client = {
      id: clientId, name, phone, notes, createdAt: now, updatedAt: now,
    };
    const newCar: Car = {
      id: carId, plateNumber: formatPlateNumber(plateNumber), carModel: carModel || undefined, clientId, updatedAt: now,
    };
    setClients(prev => [...prev, newClient]);
    setCars(prev => [...prev, newCar]);
    logAction('client_add', 'Добавлен клиент', `${name}, ${formatPlateNumber(plateNumber)}${carModel ? ` (${carModel})` : ''}`, clientId, 'client');
    schedulePush();
    return { client: newClient, car: newCar };
  }, [schedulePush, logAction]);

  const updateClient = useCallback((clientId: string, updates: { name?: string; phone?: string; phone2?: string; notes?: string }) => {
    const now = new Date().toISOString();
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    setClients(prev => prev.map(c =>
      c.id === clientId ? { ...c, ...updates, updatedAt: now } : c
    ));
    const changes: string[] = [];
    if (updates.name && updates.name !== client.name) changes.push(`имя: ${client.name} → ${updates.name}`);
    if (updates.phone && updates.phone !== client.phone) changes.push(`тел: ${client.phone} → ${updates.phone}`);
    if (updates.phone2 !== undefined && updates.phone2 !== client.phone2) changes.push(`тел2: ${updates.phone2 || '—'}`);
    if (updates.notes !== undefined && updates.notes !== client.notes) changes.push(`заметки`);
    logAction('client_edit', 'Редактирование клиента', `${client.name}: ${changes.join(', ') || 'без изменений'}`, clientId, 'client');
    schedulePush();
    console.log(`[Client] Updated client ${clientId}: ${changes.join(', ')}`);
  }, [clients, schedulePush, logAction]);

  const updateCar = useCallback((carId: string, updates: { plateNumber?: string; carModel?: string }) => {
    const now = new Date().toISOString();
    const car = cars.find(c => c.id === carId);
    if (!car) return;
    const finalUpdates: Partial<Car> = { updatedAt: now };
    if (updates.plateNumber) finalUpdates.plateNumber = formatPlateNumber(updates.plateNumber);
    if (updates.carModel !== undefined) finalUpdates.carModel = updates.carModel || undefined;
    setCars(prev => prev.map(c =>
      c.id === carId ? { ...c, ...finalUpdates } : c
    ));
    const changes: string[] = [];
    if (updates.plateNumber && formatPlateNumber(updates.plateNumber) !== car.plateNumber) changes.push(`номер: ${car.plateNumber} → ${formatPlateNumber(updates.plateNumber)}`);
    if (updates.carModel !== undefined && updates.carModel !== (car.carModel ?? '')) changes.push(`модель: ${updates.carModel || '—'}`);
    logAction('client_edit', 'Редактирование авто', `${car.plateNumber}: ${changes.join(', ') || 'без изменений'}`, carId, 'car');
    schedulePush();
    console.log(`[Car] Updated car ${carId}: ${changes.join(', ')}`);
  }, [cars, schedulePush, logAction]);

  const addCarToClient = useCallback((clientId: string, plateNumber: string, carModel?: string): Car => {
    const newCar: Car = {
      id: generateId(),
      plateNumber: formatPlateNumber(plateNumber),
      carModel: carModel || undefined,
      clientId,
      updatedAt: new Date().toISOString(),
    };
    setCars(prev => [...prev, newCar]);
    logAction('car_add', 'Добавлена машина', `${formatPlateNumber(plateNumber)}${carModel ? ` (${carModel})` : ''} клиенту ${clientId}`, newCar.id, 'car');
    schedulePush();
    return newCar;
  }, [schedulePush, logAction]);

  const updateClientDebt = useCallback((clientId: string, amountDelta: number) => {
    const now = new Date().toISOString();
    setClientDebts(prev => {
      const existing = prev.find(cd => cd.clientId === clientId);
      if (existing) {
        const newTotal = roundMoney(Math.max(0, existing.totalAmount + amountDelta));
        const newActive = roundMoney(Math.max(0, existing.activeAmount + amountDelta));
        return prev.map(cd => cd.clientId === clientId ? {
          ...cd,
          totalAmount: newTotal,
          activeAmount: newActive,
          lastUpdate: now,
        } : cd);
      } else if (amountDelta > 0) {
        const newCd: ClientDebt = {
          id: generateId(),
          clientId,
          totalAmount: roundMoney(amountDelta),
          frozenAmount: 0,
          activeAmount: roundMoney(amountDelta),
          lastUpdate: now,
        };
        return [...prev, newCd];
      }
      return prev;
    });
    console.log(`[ClientDebt] Updated for ${clientId}: delta=${amountDelta}`);
  }, []);

  const _freezeClientDebtForEntry = useCallback((clientId: string, parkingEntryId: string) => {
    const now = new Date().toISOString();
    const entryAccruals = dailyDebtAccruals.filter(a => a.parkingEntryId === parkingEntryId);
    const entryTotal = roundMoney(entryAccruals.reduce((s, a) => s + a.amount, 0));

    setClientDebts(prev => {
      const existing = prev.find(cd => cd.clientId === clientId);
      if (!existing) return prev;
      return prev.map(cd => cd.clientId === clientId ? {
        ...cd,
        frozenAmount: roundMoney(cd.frozenAmount + entryTotal),
        activeAmount: roundMoney(Math.max(0, cd.activeAmount - entryTotal)),
        frozenDate: now,
        lastUpdate: now,
      } : cd);
    });
    console.log(`[ClientDebt] Frozen ${entryTotal} ₽ for entry ${parkingEntryId}`);
  }, [dailyDebtAccruals]);

  const runDebtAccrual = useCallback(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentSessions = latestDataRef.current.sessions;
    const currentAccruals = latestDataRef.current.dailyDebtAccruals;
    const currentTariffs = latestDataRef.current.tariffs;

    const debtSessions = currentSessions.filter(s =>
      s.status === 'active_debt' && !s.exitTime
    );

    if (debtSessions.length === 0) {
      console.log('[DebtAccrual] No active_debt sessions, skipping');
      return;
    }

    let newAccruals: DailyDebtAccrual[] = [];
    let clientDeltas: Record<string, number> = {};

    for (const session of debtSessions) {
      const alreadyAccrued = currentAccruals.some(
        a => a.parkingEntryId === session.id && a.accrualDate === todayStr
      );
      if (alreadyAccrued) continue;

      const isLombardSession = session.tariffType === 'lombard' || session.serviceType === 'lombard';
      let dailyRate: number;
      if (isLombardSession) {
        dailyRate = session.lombardRateApplied ?? currentTariffs.lombardRate;
      } else if (session.serviceType === 'monthly') {
        dailyRate = currentTariffs.monthlyCash;
      } else {
        dailyRate = currentTariffs.onetimeCash;
      }
      const accrual: DailyDebtAccrual = {
        id: generateId(),
        parkingEntryId: session.id,
        clientId: session.clientId,
        carId: session.carId,
        accrualDate: todayStr,
        amount: dailyRate,
        tariffRate: dailyRate,
        createdAt: now.toISOString(),
      };
      newAccruals.push(accrual);
      clientDeltas[session.clientId] = (clientDeltas[session.clientId] ?? 0) + dailyRate;
    }

    if (newAccruals.length === 0) {
      console.log('[DebtAccrual] All sessions already accrued for today');
      return;
    }

    setDailyDebtAccruals(prev => [...prev, ...newAccruals]);

    const nowStr = now.toISOString();
    setClientDebts(prev => {
      let updated = [...prev];
      for (const [cId, delta] of Object.entries(clientDeltas)) {
        const existing = updated.find(cd => cd.clientId === cId);
        if (existing) {
          updated = updated.map(cd => cd.clientId === cId ? {
            ...cd,
            totalAmount: roundMoney(cd.totalAmount + delta),
            activeAmount: roundMoney(cd.activeAmount + delta),
            lastUpdate: nowStr,
          } : cd);
        } else {
          updated.push({
            id: generateId(),
            clientId: cId,
            totalAmount: roundMoney(delta),
            frozenAmount: 0,
            activeAmount: roundMoney(delta),
            lastUpdate: nowStr,
          });
        }
      }
      return updated;
    });

    for (const accrual of newAccruals) {
      addTransaction({
        clientId: accrual.clientId,
        carId: accrual.carId,
        type: 'debt_accrual',
        amount: accrual.amount,
        method: null,
        date: nowStr,
        description: `Ежедневное начисление долга: ${accrual.amount} ₽ (тариф ${accrual.tariffRate} ₽/сут.)`,
      });
    }

    logAction('debt_accrual', 'Ежедневное начисление долга', `Начислено ${newAccruals.length} записей, клиентов: ${Object.keys(clientDeltas).length}`);
    schedulePush();
    console.log(`[DebtAccrual] Created ${newAccruals.length} accruals for ${todayStr}`);
  }, [addTransaction, logAction, schedulePush]);

  const lastAccrualDateRef = useRef<string>('');
  useEffect(() => {
    if (!isLoaded || !isServerSynced) return;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (lastAccrualDateRef.current === todayStr) return;
    lastAccrualDateRef.current = todayStr;
    const timer = setTimeout(() => {
      runDebtAccrual();
    }, 3000);
    return () => clearTimeout(timer);
  }, [isLoaded, isServerSynced, runDebtAccrual]);

  useEffect(() => {
    if (!isLoaded || !isServerSynced) return;
    const interval = setInterval(() => {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (lastAccrualDateRef.current !== todayStr) {
        lastAccrualDateRef.current = todayStr;
        runDebtAccrual();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [isLoaded, isServerSynced, runDebtAccrual]);

  const getShiftCashBalance = useCallback((shift: CashShift): number => {
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
    return roundMoney(shift.carryOver + cashIncome - cancelled - refunded - expenseTotal - withdrawalTotal);
  }, [transactions, expenses, withdrawals]);

  const addCashOperation = useCallback((params: {
    type: CashOperation['type'];
    amount: number;
    category: string;
    description: string;
    method: PaymentMethod;
    shiftId: string | null;
    balanceBefore: number;
    balanceAfter: number;
    relatedEntityId?: string;
    relatedEntityType?: string;
  }): CashOperation => {
    const now = new Date().toISOString();
    const op: CashOperation = {
      id: generateId(),
      userId: currentUser?.id ?? 'unknown',
      userName: currentUser?.name ?? 'Неизвестно',
      userRole: currentUser?.role ?? 'manager',
      shiftId: params.shiftId,
      type: params.type,
      amount: params.amount,
      category: params.category,
      description: params.description,
      method: params.method,
      balanceBefore: params.balanceBefore,
      balanceAfter: params.balanceAfter,
      date: now,
      relatedEntityId: params.relatedEntityId,
      relatedEntityType: params.relatedEntityType,
    };
    setCashOperations(prev => [op, ...prev]);
    console.log(`[CashOp] ${params.type}: ${params.amount} ₽, balance: ${params.balanceBefore} → ${params.balanceAfter}`);
    return op;
  }, [currentUser]);

  const checkIn = useCallback((carId: string, clientId: string, serviceType: ServiceType, plannedDepartureTime?: string, paymentAtEntry?: { method: PaymentMethod; amount: number; days?: number; paidUntilDate?: string }, debtAtEntry?: { amount: number; description?: string }, isSecondary?: boolean, lombardEntry?: boolean) => {
    const activeShift = shifts.find(s => s.status === 'open');
    const sessionNow = new Date().toISOString();
    const isLombard = lombardEntry === true || serviceType === 'lombard';
    const isDebtEntry = isLombard || (!!debtAtEntry && debtAtEntry.amount > 0);
    const sessionStatus = isDebtEntry ? 'active_debt' : 'active';
    const lombardRate = isLombard ? tariffs.lombardRate : undefined;
    const session: ParkingSession = {
      id: generateId(),
      carId,
      clientId,
      entryTime: sessionNow,
      exitTime: null,
      serviceType: isLombard ? 'lombard' : serviceType,
      status: sessionStatus as any,
      plannedDepartureTime: plannedDepartureTime || null,
      managerId: currentUser?.id ?? 'unknown',
      managerName: currentUser?.name ?? 'Неизвестно',
      shiftId: activeShift?.id ?? null,
      updatedAt: sessionNow,
      prepaidAmount: paymentAtEntry?.amount ?? 0,
      prepaidMethod: paymentAtEntry?.method ?? null,
      tariffType: isLombard ? 'lombard' : 'standard',
      lombardRateApplied: lombardRate,
    };
    setSessions(prev => [...prev, session]);
    addTransaction({
      clientId,
      carId,
      type: 'entry',
      amount: 0,
      method: null,
      date: sessionNow,
      description: `Въезд (${serviceType === 'monthly' ? 'месяц' : 'разово'})${isDebtEntry ? ' [в долг]' : ''}${plannedDepartureTime ? `, план. выезд: ${plannedDepartureTime}` : ''}`,
    });

    if (paymentAtEntry && paymentAtEntry.amount > 0) {
      const payDesc = serviceType === 'onetime'
        ? `Оплата при постановке: ${paymentAtEntry.amount} ₽ (${paymentAtEntry.days ?? 1} сут., ${paymentAtEntry.method === 'cash' ? 'наличные' : 'безнал'})`
        : `Оплата месяца при постановке: ${paymentAtEntry.amount} ₽ (${paymentAtEntry.method === 'cash' ? 'наличные' : 'безнал'})`;

      const newPayment: Payment = {
        id: generateId(),
        clientId,
        carId,
        amount: paymentAtEntry.amount,
        method: paymentAtEntry.method,
        date: sessionNow,
        serviceType,
        operatorId: currentUser?.id ?? 'unknown',
        operatorName: currentUser?.name ?? 'Неизвестно',
        description: payDesc,
        shiftId: activeShift?.id ?? null,
        updatedAt: sessionNow,
      };
      setPayments(prev => [...prev, newPayment]);

      addTransaction({
        clientId,
        carId,
        type: 'payment',
        amount: paymentAtEntry.amount,
        method: paymentAtEntry.method,
        date: sessionNow,
        description: payDesc,
      });

      if (paymentAtEntry.method === 'cash' && activeShift) {
        updateShiftExpected(activeShift.id, paymentAtEntry.amount);
      }

      const entryBalanceBefore = activeShift ? getShiftCashBalance(activeShift) : 0;
      addCashOperation({
        type: 'income',
        amount: paymentAtEntry.amount,
        category: serviceType === 'monthly' ? 'Оплата месяца' : 'Оплата разовая',
        description: payDesc,
        method: paymentAtEntry.method,
        shiftId: activeShift?.id ?? null,
        balanceBefore: paymentAtEntry.method === 'cash' ? entryBalanceBefore : entryBalanceBefore,
        balanceAfter: paymentAtEntry.method === 'cash' ? roundMoney(entryBalanceBefore + paymentAtEntry.amount) : entryBalanceBefore,
      });

      if (serviceType === 'monthly') {
        const paidUntil = paymentAtEntry.paidUntilDate ?? ((() => {
          const existing = subscriptions.find(s => s.carId === carId && s.clientId === clientId);
          if (existing && !isExpired(existing.paidUntil)) return addMonths(existing.paidUntil, 1);
          return addMonths(sessionNow, 1);
        })());
        setSubscriptions(prev => {
          const existing = prev.find(s => s.carId === carId && s.clientId === clientId);
          if (existing) {
            return prev.map(s => s.id === existing.id ? { ...s, paidUntil, updatedAt: sessionNow } : s);
          } else {
            const newSub: MonthlySubscription = {
              id: generateId(),
              carId,
              clientId,
              paidUntil,
              updatedAt: sessionNow,
            };
            return [...prev, newSub];
          }
        });
      }

      console.log(`[CheckIn] Payment at entry: ${paymentAtEntry.amount} ₽ (${paymentAtEntry.method})`);
    }

    if (isDebtEntry) {
      const todayNow = new Date();
      const todayStr = `${todayNow.getFullYear()}-${String(todayNow.getMonth() + 1).padStart(2, '0')}-${String(todayNow.getDate()).padStart(2, '0')}`;
      let dailyRate: number;
      if (isLombard) {
        dailyRate = lombardRate ?? tariffs.lombardRate;
      } else if (serviceType === 'monthly') {
        dailyRate = tariffs.monthlyCash;
      } else {
        dailyRate = tariffs.onetimeCash;
      }
      const firstAccrual: DailyDebtAccrual = {
        id: generateId(),
        parkingEntryId: session.id,
        clientId,
        carId,
        accrualDate: todayStr,
        amount: dailyRate,
        tariffRate: dailyRate,
        createdAt: sessionNow,
      };
      setDailyDebtAccruals(prev => [...prev, firstAccrual]);
      updateClientDebt(clientId, dailyRate);

      addTransaction({
        clientId,
        carId,
        type: 'debt',
        amount: dailyRate,
        method: null,
        date: sessionNow,
        description: isLombard
          ? `Ломбард: первое начисление ${dailyRate} ₽/сут.`
          : `Постановка в долг: первое начисление ${dailyRate} ₽/сут.`,
      });
      console.log(`[CheckIn] ${isLombard ? 'Lombard' : 'Debt'} entry: first accrual ${dailyRate} ₽, session ${session.id}`);
    }

    const car = cars.find(c => c.id === carId);
    const client = clients.find(c => c.id === clientId);
    const payInfo = paymentAtEntry && paymentAtEntry.amount > 0 ? `, оплата ${paymentAtEntry.amount} ₽` : '';
    const debtInfo = isDebtEntry ? (isLombard ? `, ломбард ${lombardRate ?? tariffs.lombardRate} ₽/сут.` : `, в долг`) : '';
    const typeLabel = isLombard ? 'ломбард' : (serviceType === 'monthly' ? 'месяц' : 'разово');
    const entryLabel = isSecondary ? 'Вторичная постановка авто' : 'Заезд';
    logAction('checkin', entryLabel, `${car?.plateNumber ?? carId} (${client?.name ?? clientId}), ${typeLabel}${payInfo}${debtInfo}`, session.id, 'session');
    if (isSecondary && isDebtEntry) {
      const accrualRate = isLombard ? (lombardRate ?? tariffs.lombardRate) : tariffs.onetimeCash;
      logAction('checkin', 'Создан долг по вторичной постановке', `${car?.plateNumber ?? carId} (${client?.name ?? clientId}), начисление: ${accrualRate} ₽/сут.`, session.id, 'session');
    }
    schedulePush();
    console.log(`[CheckIn] Session created for car ${carId}, status=${sessionStatus}, planned departure: ${plannedDepartureTime ?? 'not set'}`);
    return session;
  }, [addTransaction, schedulePush, currentUser, shifts, cars, clients, logAction, updateShiftExpected, subscriptions, tariffs, updateClientDebt, addCashOperation, getShiftCashBalance]);

  const checkOut = useCallback((sessionId: string, paymentAtExit?: { method: PaymentMethod; amount: number }, releaseInDebt?: boolean): { debtId: string | null; amount: number; days: number; paid: number } => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return { debtId: null, amount: 0, days: 0, paid: 0 };

    const now = new Date().toISOString();
    const activeShift = shifts.find(s => s.status === 'open');
    const isDebtSession = session.status === 'active_debt';

    if (isDebtSession && !paymentAtExit) {
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, exitTime: now, status: 'released_debt' as any, updatedAt: now } : s
      ));

      const entryAccruals = dailyDebtAccruals.filter(a => a.parkingEntryId === sessionId);
      const accrualTotal = roundMoney(entryAccruals.reduce((s, a) => s + a.amount, 0));

      setClientDebts(prev => {
        const existing = prev.find(cd => cd.clientId === session.clientId);
        if (!existing) return prev;
        return prev.map(cd => cd.clientId === session.clientId ? {
          ...cd,
          frozenAmount: roundMoney(cd.frozenAmount + accrualTotal),
          activeAmount: roundMoney(Math.max(0, cd.activeAmount - accrualTotal)),
          frozenDate: now,
          lastUpdate: now,
        } : cd);
      });

      addTransaction({
        clientId: session.clientId,
        carId: session.carId,
        type: 'debt_freeze',
        amount: accrualTotal,
        method: null,
        date: now,
        description: `Выпуск в долг: заморожено ${accrualTotal} ₽ (${entryAccruals.length} дн.)`,
      });

      const carF = cars.find(c => c.id === session.carId);
      logAction('debt_freeze', 'Выпуск авто в долг', `${carF?.plateNumber ?? session.carId}, долг заморожен: ${accrualTotal} ₽`, sessionId, 'session');
      schedulePush();
      console.log(`[CheckOut] Debt session released: ${sessionId}, frozen: ${accrualTotal} ₽`);
      return { debtId: null, amount: accrualTotal, days: entryAccruals.length, paid: 0 };
    }

    if (isDebtSession && paymentAtExit) {
      const entryAccruals = dailyDebtAccruals.filter(a => a.parkingEntryId === sessionId);
      const accrualTotal = roundMoney(entryAccruals.reduce((s, a) => s + a.amount, 0));
      const paidAmount = Math.min(paymentAtExit.amount, accrualTotal);
      const afterPay = roundMoney(accrualTotal - paidAmount);

      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, exitTime: now, status: (afterPay > 0 ? 'released_debt' : 'completed') as any, updatedAt: now } : s
      ));

      if (paidAmount > 0) {
        const payDesc = `Оплата при выезде (долг): ${paidAmount} ₽ (${paymentAtExit.method === 'cash' ? 'наличные' : 'безнал'})`;
        const exitPayment: Payment = {
          id: generateId(),
          clientId: session.clientId,
          carId: session.carId,
          amount: paidAmount,
          method: paymentAtExit.method,
          date: now,
          serviceType: 'onetime',
          operatorId: currentUser?.id ?? 'unknown',
          operatorName: currentUser?.name ?? 'Неизвестно',
          description: payDesc,
          shiftId: activeShift?.id ?? null,
          updatedAt: now,
        };
        setPayments(prev => [...prev, exitPayment]);
        addTransaction({
          clientId: session.clientId,
          carId: session.carId,
          type: 'payment',
          amount: paidAmount,
          method: paymentAtExit.method,
          date: now,
          description: payDesc,
        });
        if (paymentAtExit.method === 'cash' && activeShift) {
          updateShiftExpected(activeShift.id, paidAmount);
        }

        const debtExitBalBefore = activeShift ? getShiftCashBalance(activeShift) : 0;
        addCashOperation({
          type: 'income',
          amount: paidAmount,
          category: 'Оплата долга при выезде',
          description: payDesc,
          method: paymentAtExit.method,
          shiftId: activeShift?.id ?? null,
          balanceBefore: debtExitBalBefore,
          balanceAfter: paymentAtExit.method === 'cash' ? roundMoney(debtExitBalBefore + paidAmount) : debtExitBalBefore,
        });

        updateClientDebt(session.clientId, -paidAmount);
      }

      if (afterPay > 0) {
        setClientDebts(prev => {
          const existing = prev.find(cd => cd.clientId === session.clientId);
          if (!existing) return prev;
          return prev.map(cd => cd.clientId === session.clientId ? {
            ...cd,
            frozenAmount: roundMoney(cd.frozenAmount + afterPay),
            activeAmount: roundMoney(Math.max(0, cd.activeAmount - afterPay)),
            frozenDate: now,
            lastUpdate: now,
          } : cd);
        });
      }

      const carD = cars.find(c => c.id === session.carId);
      logAction('checkout', 'Выезд (долговая сессия)', `${carD?.plateNumber ?? session.carId}, начислено ${accrualTotal} ₽, оплачено ${paidAmount} ₽${afterPay > 0 ? `, остаток долга ${afterPay} ₽` : ''}`, sessionId, 'session');
      schedulePush();
      console.log(`[CheckOut] Debt session exit: paid=${paidAmount}, remaining=${afterPay}`);
      return { debtId: null, amount: afterPay, days: entryAccruals.length, paid: paidAmount };
    }

    const newStatus = releaseInDebt ? 'released_debt' : 'completed';
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, exitTime: now, status: newStatus as any, updatedAt: now } : s
    ));

    if (session.serviceType === 'onetime') {
      const days = calculateDays(session.entryTime, now);
      const exitMethod = paymentAtExit?.method ?? 'cash';
      const dailyRate = exitMethod === 'cash' ? tariffs.onetimeCash : tariffs.onetimeCard;
      const totalAmount = dailyRate * days;
      const prepaid = session.prepaidAmount ?? 0;
      const remaining = Math.max(0, totalAmount - prepaid);

      addTransaction({
        clientId: session.clientId,
        carId: session.carId,
        type: 'exit',
        amount: 0,
        method: null,
        date: now,
        description: `Выезд (разово): ${days} сут., начислено ${totalAmount} ₽ (${dailyRate} ₽/сут.)${prepaid > 0 ? `, предоплата ${prepaid} ₽` : ''}`,
      });

      if (paymentAtExit && paymentAtExit.amount > 0 && remaining > 0) {
        const paidAmount = Math.min(paymentAtExit.amount, remaining);
        const afterPay = remaining - paidAmount;

        const payDesc = `Оплата при выезде: ${paidAmount} ₽ (${days} сут. × ${dailyRate} ₽, ${paymentAtExit.method === 'cash' ? 'наличные' : 'безнал'})${prepaid > 0 ? `, предоплата ${prepaid} ₽` : ''}`;
        const exitPayment: Payment = {
          id: generateId(),
          clientId: session.clientId,
          carId: session.carId,
          amount: paidAmount,
          method: paymentAtExit.method,
          date: now,
          serviceType: 'onetime',
          operatorId: currentUser?.id ?? 'unknown',
          operatorName: currentUser?.name ?? 'Неизвестно',
          description: payDesc,
          shiftId: activeShift?.id ?? null,
          updatedAt: now,
        };
        setPayments(prev => [...prev, exitPayment]);
        addTransaction({
          clientId: session.clientId,
          carId: session.carId,
          type: 'payment',
          amount: paidAmount,
          method: paymentAtExit.method,
          date: now,
          description: payDesc,
        });
        if (paymentAtExit.method === 'cash' && activeShift) {
          updateShiftExpected(activeShift.id, paidAmount);
        }

        const onetimeExitBalBefore = activeShift ? getShiftCashBalance(activeShift) : 0;
        addCashOperation({
          type: 'income',
          amount: paidAmount,
          category: 'Оплата при выезде (разово)',
          description: payDesc,
          method: paymentAtExit.method,
          shiftId: activeShift?.id ?? null,
          balanceBefore: onetimeExitBalBefore,
          balanceAfter: paymentAtExit.method === 'cash' ? roundMoney(onetimeExitBalBefore + paidAmount) : onetimeExitBalBefore,
        });

        if (afterPay > 0) {
          const debtId = generateId();
          const newDebt: Debt = {
            id: debtId,
            clientId: session.clientId,
            carId: session.carId,
            totalAmount: afterPay,
            remainingAmount: afterPay,
            createdAt: now,
            updatedAt: now,
            description: `Остаток долга после частичной оплаты при выезде: ${afterPay} ₽`,
          };
          setDebts(prev => [...prev, newDebt]);
          addTransaction({
            clientId: session.clientId,
            carId: session.carId,
            type: 'debt',
            amount: afterPay,
            method: null,
            date: now,
            description: `Начислен остаток долга: ${afterPay} ₽`,
          });
          const carO = cars.find(c => c.id === session.carId);
          logAction('checkout', 'Выезд (разово)', `${carO?.plateNumber ?? session.carId}, ${days} сут., оплата ${paidAmount} ₽, остаток долга ${afterPay} ₽`, sessionId, 'session');
          schedulePush();
          console.log(`[CheckOut] Onetime exit, partial pay: ${paidAmount}, remaining debt: ${afterPay}`);
          return { debtId, amount: afterPay, days, paid: paidAmount };
        } else {
          const carO = cars.find(c => c.id === session.carId);
          logAction('checkout', 'Выезд (разово)', `${carO?.plateNumber ?? session.carId}, ${days} сут., оплата ${paidAmount} ₽ при выезде`, sessionId, 'session');
          schedulePush();
          console.log(`[CheckOut] Onetime exit, fully paid at exit: ${paidAmount}`);
          return { debtId: null, amount: 0, days, paid: paidAmount };
        }
      }

      if (remaining > 0) {
        const debtId = generateId();
        const newDebt: Debt = {
          id: debtId,
          clientId: session.clientId,
          carId: session.carId,
          totalAmount: remaining,
          remainingAmount: remaining,
          createdAt: now,
          updatedAt: now,
          description: prepaid > 0
            ? `Разовый заезд: ${days} сут. × ${dailyRate} ₽ − предоплата ${prepaid} ₽ = ${remaining} ₽`
            : `Разовый заезд: ${days} сут. × ${dailyRate} ₽`,
        };
        setDebts(prev => [...prev, newDebt]);

        addTransaction({
          clientId: session.clientId,
          carId: session.carId,
          type: 'debt',
          amount: remaining,
          method: null,
          date: now,
          description: `Начислен долг: ${remaining} ₽${prepaid > 0 ? ` (всего ${totalAmount} ₽, предоплата ${prepaid} ₽)` : ''}`,
        });

        const carO = cars.find(c => c.id === session.carId);
        logAction('checkout', 'Выезд (разово)', `${carO?.plateNumber ?? session.carId}, ${days} сут., долг ${remaining} ₽${prepaid > 0 ? ` (предоплата ${prepaid} ₽)` : ''}`, sessionId, 'session');
        schedulePush();
        console.log(`[CheckOut] Onetime exit, debt created: ${debtId}, amount: ${remaining}, prepaid: ${prepaid}`);
        return { debtId, amount: remaining, days, paid: 0 };
      } else {
        const carO = cars.find(c => c.id === session.carId);
        logAction('checkout', 'Выезд (разово)', `${carO?.plateNumber ?? session.carId}, ${days} сут., полностью оплачено при постановке`, sessionId, 'session');
        schedulePush();
        console.log(`[CheckOut] Onetime exit, fully prepaid: ${prepaid} ₽, total: ${totalAmount} ₽`);
        return { debtId: null, amount: 0, days, paid: 0 };
      }
    } else {
      const sub = subscriptions.find(s => s.carId === session.carId && s.clientId === session.clientId);
      const hasActiveSub = sub && !isExpired(sub.paidUntil);

      addTransaction({
        clientId: session.clientId,
        carId: session.carId,
        type: 'exit',
        amount: 0,
        method: null,
        date: now,
        description: hasActiveSub ? 'Выезд (месячная аренда, оплачено)' : 'Выезд (месячная аренда, подписка истекла)',
      });

      if (!hasActiveSub) {
        if (paymentAtExit && paymentAtExit.amount > 0) {
          const payDesc = `Оплата месяца при выезде: ${paymentAtExit.amount} ₽ (${paymentAtExit.method === 'cash' ? 'наличные' : 'безнал'})`;
          const exitPayment: Payment = {
            id: generateId(),
            clientId: session.clientId,
            carId: session.carId,
            amount: paymentAtExit.amount,
            method: paymentAtExit.method,
            date: now,
            serviceType: 'monthly',
            operatorId: currentUser?.id ?? 'unknown',
            operatorName: currentUser?.name ?? 'Неизвестно',
            description: payDesc,
            shiftId: activeShift?.id ?? null,
            updatedAt: now,
          };
          setPayments(prev => [...prev, exitPayment]);
          addTransaction({
            clientId: session.clientId,
            carId: session.carId,
            type: 'payment',
            amount: paymentAtExit.amount,
            method: paymentAtExit.method,
            date: now,
            description: payDesc,
          });
          if (paymentAtExit.method === 'cash' && activeShift) {
            updateShiftExpected(activeShift.id, paymentAtExit.amount);
          }

          const monthlyExitBalBefore = activeShift ? getShiftCashBalance(activeShift) : 0;
          addCashOperation({
            type: 'income',
            amount: paymentAtExit.amount,
            category: 'Оплата месяца при выезде',
            description: payDesc,
            method: paymentAtExit.method,
            shiftId: activeShift?.id ?? null,
            balanceBefore: monthlyExitBalBefore,
            balanceAfter: paymentAtExit.method === 'cash' ? roundMoney(monthlyExitBalBefore + paymentAtExit.amount) : monthlyExitBalBefore,
          });

          setSubscriptions(prev => {
            const existing = prev.find(s => s.carId === session.carId && s.clientId === session.clientId);
            if (existing) {
              const newPaidUntil = isExpired(existing.paidUntil) ? addMonths(now, 1) : addMonths(existing.paidUntil, 1);
              return prev.map(s => s.id === existing.id ? { ...s, paidUntil: newPaidUntil, updatedAt: now } : s);
            } else {
              const newSub: MonthlySubscription = {
                id: generateId(),
                carId: session.carId,
                clientId: session.clientId,
                paidUntil: addMonths(now, 1),
                updatedAt: now,
              };
              return [...prev, newSub];
            }
          });

          const carM = cars.find(c => c.id === session.carId);
          logAction('checkout', 'Выезд (месяц)', `${carM?.plateNumber ?? session.carId}, оплата месяца ${paymentAtExit.amount} ₽ при выезде`, sessionId, 'session');
          schedulePush();
          console.log(`[CheckOut] Monthly exit, paid at exit: ${paymentAtExit.amount}`);
          return { debtId: null, amount: 0, days: 0, paid: paymentAtExit.amount };
        }

        const amount = getMonthlyAmount(tariffs.monthlyCash);
        const debtId = generateId();
        const newDebt: Debt = {
          id: debtId,
          clientId: session.clientId,
          carId: session.carId,
          totalAmount: amount,
          remainingAmount: amount,
          createdAt: now,
          updatedAt: now,
          description: 'Просроченная месячная аренда',
        };
        setDebts(prev => [...prev, newDebt]);

        addTransaction({
          clientId: session.clientId,
          carId: session.carId,
          type: 'debt',
          amount,
          method: null,
          date: now,
          description: `Начислен долг: просроченная месячная аренда ${amount} ₽`,
        });

        schedulePush();
        console.log(`[CheckOut] Monthly exit with expired sub, debt: ${debtId}`);
        return { debtId, amount, days: 0, paid: 0 };
      }

      const carM = cars.find(c => c.id === session.carId);
      logAction('checkout', 'Выезд (месяц)', `${carM?.plateNumber ?? session.carId}, подписка активна`, sessionId, 'session');
      schedulePush();
      console.log('[CheckOut] Monthly exit, subscription active');
      return { debtId: null, amount: 0, days: 0, paid: 0 };
    }
  }, [sessions, tariffs, subscriptions, addTransaction, schedulePush, cars, logAction, currentUser, shifts, updateShiftExpected, dailyDebtAccruals, updateClientDebt, addCashOperation, getShiftCashBalance]);

  const earlyExitWithRefund = useCallback((sessionId: string, refundMethod: PaymentMethod): { refundAmount: number; daysUsed: number; dailyRate: number; paidAmount: number } => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return { refundAmount: 0, daysUsed: 0, dailyRate: 0, paidAmount: 0 };

    const now = new Date().toISOString();
    const activeShift = shifts.find(s => s.status === 'open');
    const sub = subscriptions.find(s => s.carId === session.carId && s.clientId === session.clientId);

    const activePayments = payments.filter(p =>
      p.clientId === session.clientId &&
      p.carId === session.carId &&
      p.serviceType === 'monthly' &&
      !p.cancelled &&
      p.amount > 0
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const lastPayment = activePayments[0];
    if (!lastPayment || !sub) {
      return { refundAmount: 0, daysUsed: 0, dailyRate: 0, paidAmount: 0 };
    }

    const paidAmount = lastPayment.originalAmount ?? lastPayment.amount;
    const paymentMethod = lastPayment.method;
    const dailyRate = paymentMethod === 'cash' ? tariffs.monthlyCash : tariffs.monthlyCard;

    const periodStart = new Date(lastPayment.date);
    periodStart.setHours(0, 0, 0, 0);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const diffMs = todayDate.getTime() - periodStart.getTime();
    const daysUsed = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);
    const usedAmount = daysUsed * dailyRate;
    const refundAmount = Math.max(0, paidAmount - usedAmount);

    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, exitTime: now, status: 'completed' as const, updatedAt: now } : s
    ));

    addTransaction({
      clientId: session.clientId,
      carId: session.carId,
      type: 'exit',
      amount: 0,
      method: null,
      date: now,
      description: `Досрочный выезд (месяц): использовано ${daysUsed} дн. из оплаченного периода`,
    });

    if (refundAmount > 0) {
      addTransaction({
        clientId: session.clientId,
        carId: session.carId,
        type: 'refund',
        amount: refundAmount,
        method: refundMethod,
        date: now,
        description: `Возврат за досрочный выезд: ${refundAmount} ₽ (оплачено ${paidAmount} ₽, использовано ${daysUsed} дн. × ${dailyRate} ₽ = ${usedAmount} ₽, ${refundMethod === 'cash' ? 'наличные' : 'безнал'})`,
      });

      setPayments(prev => prev.map(p =>
        p.id === lastPayment.id ? {
          ...p,
          originalAmount: paidAmount,
          amount: usedAmount,
          refundAmount,
          refundDate: now,
          refundMethod,
          refundReason: `Досрочный выезд: ${daysUsed} дн. × ${dailyRate} ₽ = ${usedAmount} ₽, возврат ${refundAmount} ₽`,
          description: `${p.description} → Корректировка: ${usedAmount} ₽ (${daysUsed} дн.), возврат ${refundAmount} ₽`,
          updatedAt: now,
        } : p
      ));

      if (refundMethod === 'cash' && activeShift) {
        updateShiftExpected(activeShift.id, -refundAmount);
      }

      const refundBalBefore = activeShift ? getShiftCashBalance(activeShift) : 0;
      addCashOperation({
        type: 'refund',
        amount: refundAmount,
        category: 'Возврат за досрочный выезд',
        description: `Возврат ${refundAmount} ₽ (${daysUsed} дн. × ${dailyRate} ₽, ${refundMethod === 'cash' ? 'наличные' : 'безнал'})`,
        method: refundMethod,
        shiftId: activeShift?.id ?? null,
        balanceBefore: refundBalBefore,
        balanceAfter: refundMethod === 'cash' ? roundMoney(refundBalBefore - refundAmount) : refundBalBefore,
      });

      if (sub) {
        setSubscriptions(prev => prev.map(s =>
          s.id === sub.id ? { ...s, paidUntil: now, updatedAt: now } : s
        ));
      }
    }

    const carObj = cars.find(c => c.id === session.carId);
    logAction('refund', 'Досрочный выезд с возвратом', `${carObj?.plateNumber ?? session.carId}, ${daysUsed} дн., возврат ${refundAmount} ₽ (${refundMethod === 'cash' ? 'нал' : 'безнал'}), оплата скорректирована: ${paidAmount} → ${usedAmount} ₽`, sessionId, 'session');
    schedulePush();
    console.log(`[EarlyExit] Refund: ${refundAmount} ₽, days used: ${daysUsed}, original paid: ${paidAmount}, adjusted to: ${usedAmount}, daily: ${dailyRate}`);
    return { refundAmount, daysUsed, dailyRate, paidAmount };
  }, [sessions, subscriptions, payments, tariffs, shifts, cars, addTransaction, schedulePush, logAction, updateShiftExpected, addCashOperation, getShiftCashBalance]);

  const cancelCheckIn = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId && (s.status === 'active' || s.status === 'active_debt'));
    if (!session) return;

    const cancelNow = new Date().toISOString();
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, status: 'completed' as const, exitTime: cancelNow, cancelled: true, updatedAt: cancelNow } : s
    ));

    addTransaction({
      clientId: session.clientId,
      carId: session.carId,
      type: 'cancel_entry',
      amount: 0,
      method: null,
      date: new Date().toISOString(),
      description: `Отмена заезда (${currentUser?.name ?? 'Неизвестно'})`,
    });

    const cancelCar = cars.find(c => c.id === session.carId);
    logAction('cancel_checkin', 'Отмена заезда', `${cancelCar?.plateNumber ?? session.carId}`, sessionId, 'session');
    schedulePush();
    console.log(`[Cancel] Check-in cancelled: ${sessionId}`);
  }, [sessions, currentUser, addTransaction, schedulePush, cars, logAction]);

  const cancelCheckOut = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId && (s.status === 'completed' || s.status === 'released' || s.status === 'released_debt') && !s.cancelled);
    if (!session || !session.exitTime) return;

    const exitTime = new Date(session.exitTime).getTime();
    const relatedDebts = debts.filter(d =>
      d.carId === session.carId &&
      d.clientId === session.clientId &&
      Math.abs(new Date(d.createdAt).getTime() - exitTime) < 10000
    );

    const restoreStatus = session.status === 'released_debt' ? 'active_debt' : 'active';
    const now = new Date().toISOString();
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, status: restoreStatus as any, exitTime: null, updatedAt: now } : s
    ));

    if (relatedDebts.length > 0) {
      const debtIds = new Set(relatedDebts.map(d => d.id));
      setDebts(prev => prev.map(d =>
        debtIds.has(d.id) ? { ...d, remainingAmount: 0, updatedAt: now } : d
      ));
    }

    addTransaction({
      clientId: session.clientId,
      carId: session.carId,
      type: 'cancel_exit',
      amount: 0,
      method: null,
      date: now,
      description: `Отмена выезда, авто возвращено на парковку (${currentUser?.name ?? 'Неизвестно'})`,
    });

    const cancelExitCar = cars.find(c => c.id === session.carId);
    logAction('cancel_checkout', 'Отмена выезда', `${cancelExitCar?.plateNumber ?? session.carId}, долгов снято: ${relatedDebts.length}`, sessionId, 'session');
    schedulePush();
    console.log(`[Cancel] Check-out cancelled: ${sessionId}, debts zeroed: ${relatedDebts.length}`);
  }, [sessions, debts, currentUser, addTransaction, schedulePush, cars, logAction]);

  const cancelPayment = useCallback((paymentId: string) => {
    const payment = payments.find(p => p.id === paymentId && !p.cancelled);
    if (!payment) return;

    const now = new Date().toISOString();
    setPayments(prev => prev.map(p =>
      p.id === paymentId ? { ...p, cancelled: true, updatedAt: now } : p
    ));

    if (payment.serviceType === 'onetime' || payment.serviceType === 'monthly') {
      const newDebt: Debt = {
        id: generateId(),
        clientId: payment.clientId,
        carId: payment.carId,
        totalAmount: payment.amount,
        remainingAmount: payment.amount,
        createdAt: now,
        updatedAt: now,
        description: `Возврат за отменённую оплату: ${payment.description}`,
      };
      setDebts(prev => [...prev, newDebt]);
    }

    if (payment.serviceType === 'monthly') {
      setSubscriptions(prev => prev.map(s => {
        if (s.carId === payment.carId && s.clientId === payment.clientId) {
          const currentPaidUntil = new Date(s.paidUntil);
          currentPaidUntil.setMonth(currentPaidUntil.getMonth() - 1);
          const rolledBack = currentPaidUntil.toISOString();
          console.log(`[CancelPayment] Rolling back subscription paidUntil from ${s.paidUntil} to ${rolledBack}`);
          return { ...s, paidUntil: rolledBack, updatedAt: now };
        }
        return s;
      }));
    }

    addTransaction({
      clientId: payment.clientId,
      carId: payment.carId,
      type: 'cancel_payment',
      amount: payment.amount,
      method: payment.method,
      date: now,
      description: `Отмена оплаты ${payment.amount} ₽ (${currentUser?.name ?? 'Неизвестно'})`,
    });

    if (payment.method === 'cash') {
      const activeShift = shifts.find(s => s.status === 'open');
      if (activeShift) {
        updateShiftExpected(activeShift.id, -payment.amount);
      }
    }

    const cancelShift = shifts.find(s => s.status === 'open');
    const cancelBalBefore = cancelShift ? getShiftCashBalance(cancelShift) : 0;
    addCashOperation({
      type: 'refund',
      amount: payment.amount,
      category: 'Отмена оплаты',
      description: `Отмена оплаты: ${payment.amount} ₽ — ${payment.description}`,
      method: payment.method,
      shiftId: cancelShift?.id ?? null,
      balanceBefore: cancelBalBefore,
      balanceAfter: payment.method === 'cash' ? roundMoney(cancelBalBefore - payment.amount) : cancelBalBefore,
    });

    logAction('cancel_payment', 'Отмена оплаты', `${payment.amount} ₽, ${payment.description}`, paymentId, 'payment');
    schedulePush();
    console.log(`[Cancel] Payment cancelled: ${paymentId}, amount: ${payment.amount}`);
  }, [payments, currentUser, addTransaction, schedulePush, shifts, updateShiftExpected, logAction, addCashOperation, getShiftCashBalance]);

  const payMonthly = useCallback((clientId: string, carId: string, method: PaymentMethod, months: number = 1, customAmount?: number, paidUntilDate?: string) => {
    const dailyRate = method === 'cash' ? tariffs.monthlyCash : tariffs.monthlyCard;
    const amount = customAmount ?? (getMonthlyAmount(dailyRate) * months);
    const now = new Date().toISOString();
    const activeShift = shifts.find(s => s.status === 'open');

    setSubscriptions(prev => {
      const existing = prev.find(s => s.carId === carId && s.clientId === clientId);
      if (existing) {
        const newPaidUntil = paidUntilDate ?? (isExpired(existing.paidUntil) ? addMonths(now, months) : addMonths(existing.paidUntil, months));
        return prev.map(s =>
          s.id === existing.id ? { ...s, paidUntil: newPaidUntil, updatedAt: now } : s
        );
      } else {
        const newSub: MonthlySubscription = {
          id: generateId(),
          carId,
          clientId,
          paidUntil: paidUntilDate ?? addMonths(now, months),
          updatedAt: now,
        };
        return [...prev, newSub];
      }
    });

    const description = paidUntilDate
      ? `Месяц по календарю (${method === 'cash' ? 'наличные' : 'безнал'})`
      : `Месяц × ${months} (${method === 'cash' ? 'наличные' : 'безнал'})`;

    const newPayment: Payment = {
      id: generateId(),
      clientId,
      carId,
      amount,
      method,
      date: now,
      serviceType: 'monthly',
      operatorId: currentUser?.id ?? 'unknown',
      operatorName: currentUser?.name ?? 'Неизвестно',
      description,
      shiftId: activeShift?.id ?? null,
      updatedAt: now,
    };
    setPayments(prev => [...prev, newPayment]);

    addTransaction({
      clientId,
      carId,
      type: 'payment',
      amount,
      method,
      date: now,
      description: `Оплата месяца: ${amount} ₽`,
    });
    if (method === 'cash' && activeShift) {
      updateShiftExpected(activeShift.id, amount);
    }

    const pmBalBefore = activeShift ? getShiftCashBalance(activeShift) : 0;
    addCashOperation({
      type: 'income',
      amount,
      category: 'Оплата месяца',
      description: `Оплата месяца: ${amount} ₽ (${method === 'cash' ? 'наличные' : 'безнал'})`,
      method,
      shiftId: activeShift?.id ?? null,
      balanceBefore: pmBalBefore,
      balanceAfter: method === 'cash' ? roundMoney(pmBalBefore + amount) : pmBalBefore,
    });

    const pmCar = cars.find(c => c.id === carId);
    const pmClient = clients.find(c => c.id === clientId);
    logAction('payment', 'Оплата месяца', `${pmClient?.name ?? clientId}, ${pmCar?.plateNumber ?? carId}, ${amount} ₽ (${method === 'cash' ? 'нал' : 'безнал'})`, newPayment.id, 'payment');
    schedulePush();
  }, [tariffs, currentUser, addTransaction, schedulePush, shifts, updateShiftExpected, cars, clients, logAction, addCashOperation, getShiftCashBalance]);

  const payDebt = useCallback((debtId: string, amount: number, method: PaymentMethod) => {
    const debt = debts.find(d => d.id === debtId);
    if (!debt) return;

    const now = new Date().toISOString();
    const actualAmount = Math.min(amount, debt.remainingAmount);
    const newRemaining = debt.remainingAmount - actualAmount;

    setDebts(prev => prev.map(d =>
      d.id === debtId ? { ...d, remainingAmount: newRemaining, updatedAt: now } : d
    ));

    addTransaction({
      clientId: debt.clientId,
      carId: debt.carId,
      type: 'debt_payment',
      amount: actualAmount,
      method,
      date: now,
      description: `Погашение долга: ${actualAmount} ₽${newRemaining > 0 ? ` (остаток: ${newRemaining} ₽)` : ' (полностью)'}`,
    });
    const debtActiveShift = shifts.find(s => s.status === 'open');
    if (method === 'cash' && debtActiveShift) {
      updateShiftExpected(debtActiveShift.id, actualAmount);
    }

    const debtBalBefore = debtActiveShift ? getShiftCashBalance(debtActiveShift) : 0;
    addCashOperation({
      type: 'debt_payment_income',
      amount: actualAmount,
      category: 'Погашение долга',
      description: `Погашение долга: ${actualAmount} ₽${newRemaining > 0 ? ` (остаток: ${newRemaining} ₽)` : ' (полностью)'}`,
      method,
      shiftId: debtActiveShift?.id ?? null,
      balanceBefore: debtBalBefore,
      balanceAfter: method === 'cash' ? roundMoney(debtBalBefore + actualAmount) : debtBalBefore,
    });

    logAction('debt_payment', 'Погашение долга', `${actualAmount} ₽ (${method === 'cash' ? 'нал' : 'безнал'}), остаток: ${newRemaining > 0 ? newRemaining + ' ₽' : 'полностью'}`, debtId, 'debt');
    schedulePush();
  }, [debts, addTransaction, schedulePush, shifts, updateShiftExpected, logAction, addCashOperation, getShiftCashBalance]);

  const payClientDebt = useCallback((clientId: string, amount: number, method: PaymentMethod, calculatedTotal?: number) => {
    const now = new Date().toISOString();

    const clientOldDebts = debts.filter(d => d.clientId === clientId && d.remainingAmount > 0)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const cd = clientDebts.find(c => c.clientId === clientId);
    const oldDebtsTotal = clientOldDebts.reduce((s, d) => s + d.remainingAmount, 0);
    const clientDebtTotal = cd ? cd.totalAmount : 0;
    const storedTotal = roundMoney(oldDebtsTotal + clientDebtTotal);

    if (storedTotal <= 0) return;

    const effectiveTotal = calculatedTotal && calculatedTotal > 0 ? calculatedTotal : storedTotal;
    const actualAmount = roundMoney(Math.min(amount, effectiveTotal));
    const payRatio = effectiveTotal > 0 ? actualAmount / effectiveTotal : 1;
    const isFullPayment = actualAmount >= effectiveTotal;

    const storedReduction = isFullPayment ? storedTotal : roundMoney(storedTotal * payRatio);
    let remaining = storedReduction;

    const updatedDebtIds: string[] = [];
    if (clientOldDebts.length > 0 && remaining > 0) {
      setDebts(prev => prev.map(d => {
        if (d.clientId !== clientId || d.remainingAmount <= 0 || remaining <= 0) return d;
        const idx = clientOldDebts.findIndex(od => od.id === d.id);
        if (idx === -1) return d;
        const payForThis = roundMoney(Math.min(remaining, d.remainingAmount));
        remaining = roundMoney(remaining - payForThis);
        updatedDebtIds.push(d.id);
        return { ...d, remainingAmount: roundMoney(d.remainingAmount - payForThis), updatedAt: now };
      }));
    }

    if (remaining > 0 && cd && cd.totalAmount > 0) {
      const payForCd = roundMoney(Math.min(remaining, cd.totalAmount));
      remaining = roundMoney(remaining - payForCd);
      setClientDebts(prev => prev.map(c => {
        if (c.clientId !== clientId) return c;
        const newTotal = roundMoney(Math.max(0, c.totalAmount - payForCd));
        const frozenReduction = roundMoney(Math.min(payForCd, c.frozenAmount));
        const activeReduction = roundMoney(payForCd - frozenReduction);
        return {
          ...c,
          totalAmount: newTotal,
          frozenAmount: roundMoney(Math.max(0, c.frozenAmount - frozenReduction)),
          activeAmount: roundMoney(Math.max(0, c.activeAmount - activeReduction)),
          lastUpdate: now,
        };
      }));
    }

    const newRemainingTotal = isFullPayment ? 0 : roundMoney(effectiveTotal - actualAmount);

    const newPayment: Payment = {
      id: generateId(),
      clientId,
      carId: '',
      amount: actualAmount,
      method,
      date: now,
      serviceType: 'onetime',
      operatorId: currentUser?.id ?? 'unknown',
      operatorName: currentUser?.name ?? 'Неизвестно',
      description: `Погашение долга клиента: ${actualAmount} ₽${newRemainingTotal > 0 ? ` (остаток: ${newRemainingTotal} ₽)` : ' (полностью)'}`,
      shiftId: shifts.find(s => s.status === 'open')?.id ?? null,
      updatedAt: now,
    };
    setPayments(prev => [...prev, newPayment]);

    addTransaction({
      clientId,
      carId: '',
      type: 'debt_payment',
      amount: actualAmount,
      method,
      date: now,
      description: `Погашение долга клиента: ${actualAmount} ₽${newRemainingTotal > 0 ? ` (остаток: ${newRemainingTotal} ₽)` : ' (полностью)'}`,
    });

    const cdActiveShift = shifts.find(s => s.status === 'open');
    if (method === 'cash' && cdActiveShift) {
      updateShiftExpected(cdActiveShift.id, actualAmount);
    }

    const cdBalBefore = cdActiveShift ? getShiftCashBalance(cdActiveShift) : 0;
    addCashOperation({
      type: 'debt_payment_income',
      amount: actualAmount,
      category: 'Погашение долга клиента',
      description: `Погашение долга клиента: ${actualAmount} ₽${newRemainingTotal > 0 ? ` (остаток: ${newRemainingTotal} ₽)` : ' (полностью)'}`,
      method,
      shiftId: cdActiveShift?.id ?? null,
      balanceBefore: cdBalBefore,
      balanceAfter: method === 'cash' ? roundMoney(cdBalBefore + actualAmount) : cdBalBefore,
    });

    logAction('debt_payment', 'Погашение долга клиента', `${actualAmount} ₽ (${method === 'cash' ? 'нал' : 'безнал'}), остаток: ${newRemainingTotal > 0 ? newRemainingTotal + ' ₽' : 'полностью'}`, clientId, 'client_debt');
    schedulePush();
    console.log(`[PayClientDebt] FIFO paid ${actualAmount} for client ${clientId}, old debts touched: ${updatedDebtIds.length}, remaining: ${newRemainingTotal}`);
  }, [debts, clientDebts, currentUser, shifts, addTransaction, updateShiftExpected, logAction, schedulePush, addCashOperation, getShiftCashBalance]);

  const withdrawCash = useCallback((amount: number, notes: string): CashWithdrawal => {
    const activeShift = shifts.find(s => s.status === 'open');
    const now = new Date().toISOString();
    const balanceBefore = activeShift ? getShiftCashBalance(activeShift) : 0;
    const balanceAfter = roundMoney(balanceBefore - amount);

    const withdrawal: CashWithdrawal = {
      id: generateId(),
      amount,
      operatorId: currentUser?.id ?? 'unknown',
      operatorName: currentUser?.name ?? 'Неизвестно',
      date: now,
      shiftId: activeShift?.id ?? null,
      notes,
    };
    setWithdrawals(prev => [withdrawal, ...prev]);
    if (activeShift) {
      updateShiftExpected(activeShift.id, -amount);
    }

    addTransaction({
      clientId: '',
      carId: '',
      type: 'withdrawal',
      amount,
      method: 'cash',
      date: now,
      description: `Снятие из кассы: ${amount} ₽${notes ? ` — ${notes}` : ''}`,
    });

    addCashOperation({
      type: 'withdrawal',
      amount,
      category: 'Снятие',
      description: `Снятие из кассы${notes ? `: ${notes}` : ''}`,
      method: 'cash',
      shiftId: activeShift?.id ?? null,
      balanceBefore,
      balanceAfter,
      relatedEntityId: withdrawal.id,
      relatedEntityType: 'withdrawal',
    });

    const adminOp: AdminCashOperation = {
      id: generateId(),
      type: 'cash_withdrawal_from_manager',
      amount,
      method: 'cash',
      description: `Снятие наличных с кассы менеджера${notes ? `: ${notes}` : ''}`,
      sourceManagerId: activeShift?.operatorId,
      sourceManagerName: activeShift?.operatorName,
      operatorId: currentUser?.id ?? 'unknown',
      operatorName: currentUser?.name ?? 'Неизвестно',
      date: now,
      updatedAt: now,
    };
    setAdminCashOperations(prev => [adminOp, ...prev]);

    logAction('admin_withdrawal', 'Снятие наличных с кассы менеджера', `${amount} ₽${notes ? ` — ${notes}` : ''}, менеджер: ${activeShift?.operatorName ?? '—'} (баланс: ${balanceBefore} → ${balanceAfter} ₽)`, withdrawal.id, 'withdrawal');
    schedulePush();
    console.log(`[Withdrawal] ${amount} ₽ withdrawn by ${currentUser?.name}, balance: ${balanceBefore} → ${balanceAfter}`);
    return withdrawal;
  }, [shifts, currentUser, schedulePush, updateShiftExpected, addTransaction, addCashOperation, getShiftCashBalance, logAction]);

  const addManualDebt = useCallback((clientId: string, amount: number, date: string, comment: string) => {
    if (amount <= 0) return;
    const now = new Date().toISOString();
    const debtDate = date || now;

    const newDebt: Debt = {
      id: generateId(),
      clientId,
      carId: '',
      totalAmount: roundMoney(amount),
      remainingAmount: roundMoney(amount),
      createdAt: debtDate,
      updatedAt: now,
      description: comment || `Ручное добавление долга: ${amount} ₽`,
      status: 'active',
    };
    setDebts(prev => [...prev, newDebt]);

    addTransaction({
      clientId,
      carId: '',
      type: 'debt',
      amount: roundMoney(amount),
      method: null,
      date: now,
      description: `Ручное добавление долга: ${amount} ₽${comment ? ` — ${comment}` : ''}`,
    });

    const client = clients.find(c => c.id === clientId);
    logAction('manual_debt_add', '[ADMIN] Ручное добавление долга', `Клиент: ${client?.name ?? clientId}, сумма: ${amount} ₽, дата: ${debtDate.split('T')[0]}${comment ? `, комментарий: ${comment}` : ''}`, newDebt.id, 'debt');
    schedulePush();
    console.log(`[ManualDebt] Added ${amount} ₽ debt for client ${clientId}`);
  }, [clients, addTransaction, logAction, schedulePush]);

  const deleteManualDebt = useCallback((debtId: string) => {
    const debt = debts.find(d => d.id === debtId);
    if (!debt) return;
    const now = new Date().toISOString();

    setDebts(prev => prev.map(d =>
      d.id === debtId ? { ...d, remainingAmount: 0, status: 'paid' as const, updatedAt: now } : d
    ));

    addTransaction({
      clientId: debt.clientId,
      carId: debt.carId,
      type: 'debt_payment',
      amount: debt.remainingAmount,
      method: null,
      date: now,
      description: `Удаление долга администратором: ${debt.remainingAmount} ₽ — ${debt.description}`,
    });

    const client = clients.find(c => c.id === debt.clientId);
    logAction('manual_debt_delete', '[ADMIN] Удаление долга', `Клиент: ${client?.name ?? debt.clientId}, сумма: ${debt.remainingAmount} ₽, описание: ${debt.description}`, debtId, 'debt');
    schedulePush();
    console.log(`[ManualDebt] Deleted debt ${debtId}, amount: ${debt.remainingAmount}`);
  }, [debts, clients, addTransaction, logAction, schedulePush]);

  const activeDebts = useMemo(() => debts.filter(d => d.remainingAmount > 0), [debts]);

  const getClientDebts = useCallback((clientId: string): Debt[] => {
    return activeDebts.filter(d => d.clientId === clientId);
  }, [activeDebts]);

  const getClientTotalDebt = useCallback((clientId: string): number => {
    const oldDebtsTotal = activeDebts.filter(d => d.clientId === clientId).reduce((sum, d) => sum + d.remainingAmount, 0);
    const cd = clientDebts.find(c => c.clientId === clientId);
    const clientDebtTotal = cd ? cd.totalAmount : 0;
    return roundMoney(oldDebtsTotal + clientDebtTotal);
  }, [activeDebts, clientDebts]);

  const getClientDebtInfo = useCallback((clientId: string): ClientDebt | null => {
    return clientDebts.find(c => c.clientId === clientId) ?? null;
  }, [clientDebts]);

  const calculateDebtByMethod = useCallback((clientId: string, method: PaymentMethod): {
    total: number;
    details: Array<{
      sessionId: string;
      days: number;
      rate: number;
      amount: number;
      serviceType: ServiceType;
    }>;
    oldDebtsTotal: number;
  } => {
    const clientDebtSessions = sessions.filter(s =>
      s.clientId === clientId &&
      (s.status === 'active_debt' || s.status === 'released_debt') &&
      !s.cancelled
    );

    const details: Array<{ sessionId: string; days: number; rate: number; amount: number; serviceType: ServiceType }> = [];
    let accrualTotal = 0;

    for (const session of clientDebtSessions) {
      const sessionAccruals = dailyDebtAccruals.filter(a => a.parkingEntryId === session.id);
      if (sessionAccruals.length === 0) continue;

      const days = sessionAccruals.length;
      let rate: number;

      if (session.serviceType === 'lombard') {
        rate = session.lombardRateApplied ?? tariffs.lombardRate;
      } else if (session.serviceType === 'monthly') {
        rate = method === 'cash' ? tariffs.monthlyCash : tariffs.monthlyCard;
      } else {
        rate = method === 'cash' ? tariffs.onetimeCash : tariffs.onetimeCard;
      }

      const amount = roundMoney(days * rate);
      accrualTotal += amount;
      details.push({ sessionId: session.id, days, rate, amount, serviceType: session.serviceType });
    }

    const oldDebtsTotal = roundMoney(
      debts.filter(d => d.clientId === clientId && d.remainingAmount > 0)
        .reduce((s, d) => s + d.remainingAmount, 0)
    );

    return {
      total: roundMoney(accrualTotal + oldDebtsTotal),
      details,
      oldDebtsTotal,
    };
  }, [sessions, dailyDebtAccruals, debts, tariffs]);

  const activeSessions = useMemo(() =>
    sessions.filter(s => (s.status === 'active' || s.status === 'active_debt') && !s.cancelled && !isClientDeleted(s.clientId)),
  [sessions, isClientDeleted]);

  const debtors = useMemo(() => {
    const oldDebtClientIds = new Set(activeDebts.map(d => d.clientId));
    const newDebtClientIds = new Set(clientDebts.filter(cd => cd.totalAmount > 0).map(cd => cd.clientId));
    const allClientIds = [...new Set([...oldDebtClientIds, ...newDebtClientIds])];

    return allClientIds.map(id => {
      const client = activeClients.find(c => c.id === id);
      const clientDebtsList = activeDebts.filter(d => d.clientId === id);
      const oldTotal = clientDebtsList.reduce((sum, d) => sum + d.remainingAmount, 0);
      const cd = clientDebts.find(c => c.clientId === id);
      const newTotal = cd ? cd.totalAmount : 0;
      const totalDebt = roundMoney(oldTotal + newTotal);
      const clientCars = activeCars.filter(c => c.clientId === id);
      return { client, debts: clientDebtsList, totalDebt, cars: clientCars, clientDebt: cd ?? null };
    }).filter(d => d.client && d.totalDebt > 0);
  }, [activeDebts, activeClients, activeCars, clientDebts]);

  const todayStats = useMemo(() => {
    const todayTx = transactions.filter(t => isToday(t.date));
    const todayPaymentTx = todayTx.filter(t => (t.type === 'payment' || t.type === 'debt_payment') && t.amount > 0);
    const todayCancelTx = todayTx.filter(t => t.type === 'cancel_payment');
    const todayRefundTx = todayTx.filter(t => t.type === 'refund');
    const _cancelledAmount = todayCancelTx.reduce((s, t) => s + t.amount, 0);

    const cashToday = todayPaymentTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0);
    const cardToday = todayPaymentTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0);
    const cashCancelled = todayCancelTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0);
    const cardCancelled = todayCancelTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0);
    const cashRefunded = todayRefundTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0);
    const cardRefunded = todayRefundTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0);

    const netCash = cashToday - cashCancelled - cashRefunded;
    const netCard = cardToday - cardCancelled - cardRefunded;
    const oldDebtTotal = activeDebts.reduce((s, d) => s + d.remainingAmount, 0);
    const clientDebtTotal = clientDebts.reduce((s, cd) => s + cd.totalAmount, 0);
    const totalDebt = roundMoney(oldDebtTotal + clientDebtTotal);
    const totalRefunds = cashRefunded + cardRefunded;

    return {
      carsOnParking: activeSessions.length,
      cashToday: netCash,
      cardToday: netCard,
      totalRevenue: netCash + netCard,
      debtorsCount: debtors.length,
      totalDebt,
      totalRefunds,
    };
  }, [transactions, activeDebts, activeSessions, debtors, clientDebts]);

  const openShift = useCallback((operatorId: string, operatorName: string, carryOver: number = 0, role?: 'admin' | 'manager'): CashShift => {
    const operatorRole = role ?? (currentUser?.role === 'admin' ? 'admin' : 'manager');
    const existingOpen = shifts.find(s => s.status === 'open' && (s.operatorRole ?? 'manager') === operatorRole);
    if (existingOpen) {
      console.log(`[Shift] Already have open ${operatorRole} shift ${existingOpen.id}, returning existing`);
      return existingOpen;
    }
    const shiftNow = new Date().toISOString();
    const shift: CashShift = {
      id: generateId(),
      operatorId,
      operatorName,
      operatorRole,
      openedAt: shiftNow,
      closedAt: null,
      status: 'open',
      expectedCash: carryOver,
      actualCash: null,
      carryOver,
      notes: '',
      updatedAt: shiftNow,
    };
    setShifts(prev => [shift, ...prev]);
    logAction('shift_open', 'Открытие смены', `${operatorName} (${operatorRole === 'admin' ? 'админ' : 'менеджер'}), перенос: ${carryOver} ₽`, shift.id, 'shift');
    schedulePush();
    console.log(`[Shift] Opened ${operatorRole} shift ${shift.id} by ${operatorName}`);
    return shift;
  }, [shifts, schedulePush, logAction, currentUser]);

  const closeShift = useCallback((shiftId: string, actualCash: number, notes: string = '') => {
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return;

    const openTime = new Date(shift.openedAt).getTime();
    const closeTime = Date.now();

    const shiftTx = transactions.filter(t =>
      (t.type === 'payment' || t.type === 'debt_payment') &&
      t.amount > 0 &&
      new Date(t.date).getTime() >= openTime &&
      new Date(t.date).getTime() <= closeTime
    );
    const shiftCancelTx = transactions.filter(t =>
      t.type === 'cancel_payment' &&
      new Date(t.date).getTime() >= openTime &&
      new Date(t.date).getTime() <= closeTime
    );
    const shiftRefundTx = transactions.filter(t =>
      t.type === 'refund' &&
      new Date(t.date).getTime() >= openTime &&
      new Date(t.date).getTime() <= closeTime
    );
    const cashIncome = shiftTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0)
      - shiftCancelTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0)
      - shiftRefundTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0);
    const cardIncome = shiftTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0)
      - shiftCancelTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0)
      - shiftRefundTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0);
    const totalExpenses = expenses.filter(e => e.shiftId === shiftId).reduce((s, e) => s + e.amount, 0);
    const totalWithdrawals = withdrawals.filter(w => w.shiftId === shiftId).reduce((s, w) => s + w.amount, 0);
    const calculatedBalance = shift.carryOver + cashIncome - totalExpenses - totalWithdrawals;
    const discrepancy = actualCash - calculatedBalance;

    const closingSummary = {
      cashIncome,
      cardIncome,
      totalExpenses,
      totalWithdrawals,
      calculatedBalance,
      discrepancy,
    };

    const closeNow = new Date().toISOString();
    setShifts(prev => prev.map(s =>
      s.id === shiftId ? {
        ...s,
        closedAt: closeNow,
        status: 'closed' as const,
        actualCash,
        notes,
        closingSummary,
        updatedAt: closeNow,
      } : s
    ));
    logAction('shift_close', 'Закрытие смены', `Факт: ${actualCash} ₽, расчёт: ${calculatedBalance} ₽, расхождение: ${discrepancy} ₽`, shiftId, 'shift');
    schedulePush();
    console.log(`[Shift] Closed shift ${shiftId}, actual: ${actualCash}, calculated: ${calculatedBalance}, discrepancy: ${discrepancy}`);
  }, [shifts, transactions, expenses, withdrawals, schedulePush, logAction]);

  const addExpense = useCallback((amount: number, category: string, description: string): { success: boolean; error?: string; expense?: Expense } => {
    try {
      const isUserAdmin = currentUser?.role === 'admin';
      let targetShift: CashShift | undefined;

      if (isUserAdmin) {
        targetShift = shifts.find(s => s.status === 'open' && s.operatorRole === 'admin')
          ?? shifts.find(s => s.status === 'open');
        console.log(`[Expense] Admin mode, targetShift: ${targetShift?.id ?? 'none'}`);
      } else {
        targetShift = shifts.find(s => s.status === 'open' && s.operatorRole !== 'admin')
          ?? shifts.find(s => s.status === 'open');
        if (!targetShift) {
          console.log('[Expense] Manager tried to add expense without open shift');
          return { success: false, error: 'Нет открытой смены. Откройте смену для проведения расхода.' };
        }
      }

      const now = new Date().toISOString();
      const balanceBefore = targetShift ? getShiftCashBalance(targetShift) : 0;

      if (!isUserAdmin && targetShift && balanceBefore < amount) {
        console.log(`[Expense] Insufficient funds: balance=${balanceBefore}, expense=${amount}`);
        return { success: false, error: `Недостаточно средств в кассе. Баланс: ${balanceBefore} ₽, расход: ${amount} ₽` };
      }

      const balanceAfter = roundMoney(balanceBefore - amount);

      const expense: Expense = {
        id: generateId(),
        amount,
        category,
        description,
        operatorId: currentUser?.id ?? 'unknown',
        operatorName: currentUser?.name ?? 'Неизвестно',
        date: now,
        shiftId: targetShift?.id ?? null,
        method: 'cash',
      };
      setExpenses(prev => [expense, ...prev]);
      console.log(`[Expense] Created expense record: ${expense.id}, shiftId=${expense.shiftId}`);

      if (targetShift) {
        const shiftId = targetShift.id;
        setShifts(prev => prev.map(s =>
          s.id === shiftId ? { ...s, expectedCash: s.expectedCash - amount, updatedAt: now } : s
        ));
        console.log(`[Expense] Updated shift ${shiftId} expectedCash: -${amount}`);
      }

      addTransaction({
        clientId: '',
        carId: '',
        type: isUserAdmin ? 'admin_expense' : 'manager_expense',
        amount,
        method: 'cash',
        date: now,
        description: `Расход: ${amount} ₽ — ${category}: ${description}`,
      });

      addCashOperation({
        type: 'expense',
        amount,
        category,
        description,
        method: 'cash',
        shiftId: targetShift?.id ?? null,
        balanceBefore,
        balanceAfter,
        relatedEntityId: expense.id,
        relatedEntityType: 'expense',
      });

      const roleLabel = isUserAdmin ? '[ADMIN] ' : '';
      logAction('expense_add', `${roleLabel}Добавлен расход`, `${amount} ₽ — ${category}: ${description} (баланс: ${balanceBefore} → ${balanceAfter} ₽)`, expense.id, 'expense');
      schedulePush();
      console.log(`[Expense] SUCCESS: expense ${expense.id}: ${amount} ₽ - ${description}, balance: ${balanceBefore} → ${balanceAfter}`);
      return { success: true, expense };
    } catch (err) {
      console.log('[Expense] CRITICAL ERROR in addExpense:', err);
      return { success: false, error: `Системная ошибка: ${err instanceof Error ? err.message : String(err)}` };
    }
  }, [shifts, currentUser, schedulePush, logAction, addTransaction, addCashOperation, getShiftCashBalance]);

  const addAdminExpense = useCallback((amount: number, category: string, description: string, method: PaymentMethod): AdminExpense => {
    const now = new Date().toISOString();
    const expense: AdminExpense = {
      id: generateId(),
      amount,
      category,
      description,
      method,
      operatorId: currentUser?.id ?? 'unknown',
      operatorName: currentUser?.name ?? 'Неизвестно',
      date: now,
      updatedAt: now,
    };
    setAdminExpenses(prev => [expense, ...prev]);

    const adminOp: AdminCashOperation = {
      id: generateId(),
      type: 'admin_expense',
      amount,
      method,
      description: `Расход админа: ${category} — ${description}`,
      operatorId: currentUser?.id ?? 'unknown',
      operatorName: currentUser?.name ?? 'Неизвестно',
      date: now,
      updatedAt: now,
    };
    setAdminCashOperations(prev => [adminOp, ...prev]);

    addTransaction({
      clientId: '',
      carId: '',
      type: 'admin_expense',
      amount,
      method,
      date: now,
      description: `Расход админа: ${amount} ₽ — ${category}: ${description} (${method === 'cash' ? 'нал' : 'безнал'})`,
    });

    logAction('admin_expense_add', 'Расход администратора', `${amount} ₽ — ${category}: ${description} (${method === 'cash' ? 'нал' : 'безнал'})`, expense.id, 'admin_expense');
    schedulePush();
    console.log(`[AdminExpense] Added: ${amount} ₽ - ${category}: ${description}`);
    return expense;
  }, [currentUser, schedulePush, logAction, addTransaction]);

  const addExpenseCategory = useCallback((name: string, ownerType: 'admin' | 'manager'): ExpenseCategory => {
    const now = new Date().toISOString();
    const cat: ExpenseCategory = {
      id: generateId(),
      name,
      ownerType,
      updatedAt: now,
    };
    setExpenseCategories(prev => [...prev, cat]);
    logAction('expense_category_add', 'Добавлена категория расходов', `${name} (${ownerType === 'admin' ? 'админ' : 'менеджер'})`, cat.id, 'expense_category');
    schedulePush();
    console.log(`[ExpenseCategory] Added: ${name} for ${ownerType}`);
    return cat;
  }, [schedulePush, logAction]);

  const updateExpenseCategory = useCallback((id: string, name: string) => {
    const now = new Date().toISOString();
    setExpenseCategories(prev => prev.map(c =>
      c.id === id ? { ...c, name, updatedAt: now } : c
    ));
    logAction('expense_category_edit', 'Изменена категория расходов', `ID: ${id}, новое имя: ${name}`, id, 'expense_category');
    schedulePush();
  }, [schedulePush, logAction]);

  const deleteExpenseCategory = useCallback((id: string) => {
    const now = new Date().toISOString();
    setExpenseCategories(prev => prev.map(c =>
      c.id === id ? { ...c, deleted: true, updatedAt: now } : c
    ));
    logAction('expense_category_delete', 'Удалена категория расходов', `ID: ${id}`, id, 'expense_category');
    schedulePush();
  }, [schedulePush, logAction]);

  const getManagerCategories = useMemo(() =>
    expenseCategories.filter(c => c.ownerType === 'manager' && !c.deleted),
  [expenseCategories]);

  const getAdminCategories = useMemo(() =>
    expenseCategories.filter(c => c.ownerType === 'admin' && !c.deleted),
  [expenseCategories]);

  const getManagerCashRegister = useCallback((from?: Date, to?: Date) => {
    const filterByPeriod = <T extends { date: string }>(items: T[]): T[] => {
      if (!from && !to) return items;
      return items.filter(item => {
        const d = new Date(item.date);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    };

    const periodTx = filterByPeriod(transactions);
    const paymentTx = periodTx.filter(t =>
      (t.type === 'payment' || t.type === 'debt_payment') && t.amount > 0
    );
    const cancelTx = periodTx.filter(t => t.type === 'cancel_payment');
    const refundTx = periodTx.filter(t => t.type === 'refund');

    const cashIncome = roundMoney(
      paymentTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0)
      - cancelTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0)
      - refundTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0)
    );

    const cardIncome = roundMoney(
      paymentTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0)
      - cancelTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0)
      - refundTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0)
    );

    const periodExpenses = filterByPeriod(expenses);
    const totalExpenses = roundMoney(periodExpenses.reduce((s, e) => s + e.amount, 0));

    const periodWithdrawals = filterByPeriod(withdrawals);
    const totalWithdrawals = roundMoney(periodWithdrawals.reduce((s, w) => s + w.amount, 0));

    const balance = roundMoney(cashIncome - totalExpenses - totalWithdrawals);

    return {
      cashIncome,
      cardIncome,
      totalExpenses,
      totalWithdrawals,
      balance,
      expenses: periodExpenses,
      withdrawals: periodWithdrawals,
    };
  }, [transactions, expenses, withdrawals]);

  const getAdminCashRegister = useCallback((from?: Date, to?: Date) => {
    const filterByPeriod = <T extends { date: string }>(items: T[]): T[] => {
      if (!from && !to) return items;
      return items.filter(item => {
        const d = new Date(item.date);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    };

    const periodTx = filterByPeriod(transactions);
    const paymentTx = periodTx.filter(t =>
      (t.type === 'payment' || t.type === 'debt_payment') && t.amount > 0
    );
    const cancelTx = periodTx.filter(t => t.type === 'cancel_payment');
    const refundTx = periodTx.filter(t => t.type === 'refund');

    const cardIncome = roundMoney(
      paymentTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0)
      - cancelTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0)
      - refundTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0)
    );

    const periodWithdrawals = filterByPeriod(withdrawals);
    const cashFromManager = roundMoney(periodWithdrawals.reduce((s, w) => s + w.amount, 0));

    const periodAdminExpenses = filterByPeriod(adminExpenses);
    const totalAdminExpenses = roundMoney(periodAdminExpenses.reduce((s, e) => s + e.amount, 0));

    const balance = roundMoney(cardIncome + cashFromManager - totalAdminExpenses);

    const periodOps = filterByPeriod(adminCashOperations);

    return {
      cardIncome,
      cashFromManager,
      totalAdminExpenses,
      balance,
      adminExpenses: periodAdminExpenses,
      operations: periodOps,
    };
  }, [transactions, withdrawals, adminExpenses, adminCashOperations]);

  const expiringSubscriptions = useMemo(() => {
    return subscriptions.filter(s => {
      const days = daysUntil(s.paidUntil);
      return days >= 0 && days <= 3 && !isClientDeleted(s.clientId);
    }).map(s => {
      const client = activeClients.find(c => c.id === s.clientId);
      const car = activeCars.find(c => c.id === s.carId);
      return { subscription: s, client, car, daysLeft: daysUntil(s.paidUntil) };
    });
  }, [subscriptions, activeClients, activeCars, isClientDeleted]);

  const searchClients = useCallback((query: string) => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return activeClients.filter(c => {
      const clientCars = activeCars.filter(car => car.clientId === c.id);
      return c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        clientCars.some(car => car.plateNumber.toLowerCase().includes(q));
    }).slice(0, 10);
  }, [activeClients, activeCars]);

  const updateTariffs = useCallback((newTariffs: Tariffs) => {
    const tariffsWithTimestamp = { ...newTariffs, updatedAt: new Date().toISOString() };
    setTariffs(tariffsWithTimestamp);
    logAction('tariff_update', 'Обновление тарифов', `Нал.мес: ${newTariffs.monthlyCash}, Безнал.мес: ${newTariffs.monthlyCard}, Нал.раз: ${newTariffs.onetimeCash}, Безнал.раз: ${newTariffs.onetimeCard}, Ломбард: ${newTariffs.lombardRate}`);
    schedulePush();
  }, [schedulePush, logAction]);

  const deleteCar = useCallback((carId: string) => {
    const now = new Date().toISOString();
    const car = cars.find(c => c.id === carId);
    if (!car) return;

    setCars(prev => prev.map(c =>
      c.id === carId ? { ...c, deleted: true, deletedAt: now, updatedAt: now } : c
    ));

    setSessions(prev => prev.map(s =>
      s.carId === carId && (s.status === 'active' || s.status === 'active_debt')
        ? { ...s, status: 'completed' as const, exitTime: now, cancelled: true, updatedAt: now }
        : s
    ));

    logAction('car_delete', 'Удалена машина', `${car.plateNumber}${car.carModel ? ` (${car.carModel})` : ''}`, carId, 'car');
    schedulePush();
    console.log(`[Delete] Car ${carId} (${car.plateNumber}) soft-deleted, data preserved in history`);
  }, [cars, schedulePush, logAction]);

  const deleteClient = useCallback((clientId: string) => {
    const now = new Date().toISOString();
    const client = clients.find(c => c.id === clientId);
    const clientCarsList = cars.filter(c => c.clientId === clientId);

    setClients(prev => prev.map(c =>
      c.id === clientId ? { ...c, deleted: true, deletedAt: now, updatedAt: now } : c
    ));
    setCars(prev => prev.map(c =>
      c.clientId === clientId ? { ...c, deleted: true, deletedAt: now, updatedAt: now } : c
    ));
    setSessions(prev => prev.map(s =>
      s.clientId === clientId && (s.status === 'active' || s.status === 'active_debt')
        ? { ...s, status: 'completed' as const, exitTime: now, cancelled: true, updatedAt: now }
        : s
    ));

    setDeletedClientIds(prev => prev.includes(clientId) ? prev : [...prev, clientId]);

    const plateNumbers = clientCarsList.map(c => c.plateNumber).join(', ');
    addTransaction({
      clientId,
      carId: clientCarsList[0]?.id ?? '',
      type: 'client_deleted',
      amount: 0,
      method: null,
      date: now,
      description: `Клиент удалён: ${client?.name ?? '—'}, авто: ${plateNumbers || '—'}`,
    });

    logAction('client_delete', 'Удалён клиент', `${client?.name ?? '—'}, авто: ${plateNumbers || '—'}`, clientId, 'client');
    schedulePush();
    console.log(`[Delete] Client ${clientId} soft-deleted, data preserved in history`);
  }, [clients, cars, addTransaction, schedulePush, logAction]);

  const getSubscription = useCallback((carId: string, clientId: string): MonthlySubscription | undefined => {
    return subscriptions.find(s => s.carId === carId && s.clientId === clientId);
  }, [subscriptions]);

  const findMatchingClients = useCallback((name: string, phone: string): Client[] => {
    const nameLower = name.toLowerCase().trim();
    const phoneDigits = phone.replace(/\D/g, '');
    if (nameLower.length < 2 && phoneDigits.length < 7) return [];

    return activeClients.filter(c => {
      const clientPhoneDigits = c.phone.replace(/\D/g, '');
      return (nameLower.length >= 2 && c.name.toLowerCase().includes(nameLower)) ||
        (phoneDigits.length >= 7 && clientPhoneDigits.includes(phoneDigits));
    }).slice(0, 5);
  }, [activeClients]);

  const addManagedUser = useCallback(async (login: string, password: string, name: string): Promise<boolean> => {
    const userId = generateId();
    const now = new Date().toISOString();
    try {
      const result = await vanillaTrpc.parking.addUser.mutate({
        id: userId,
        login,
        password,
        name,
        role: 'manager',
        updatedAt: now,
      }) as any;
      if (!result.success) {
        console.log('[Users] Server rejected addUser:', result.error);
        return false;
      }
      const newUser: User = {
        id: userId,
        login,
        password: '***',
        name,
        role: 'manager',
        active: true,
        updatedAt: now,
      };
      setUsers(prev => {
        const updated = [...prev, newUser];
        latestDataRef.current = { ...latestDataRef.current, users: updated };
        return updated;
      });
      logAction('user_add', 'Добавлен менеджер', `${name} (${login})`, userId, 'user');
      void utils.parking.getData.invalidate();
      console.log('[Users] Added manager via server:', login, userId);
      return true;
    } catch (e) {
      console.log('[Users] Failed to add user via server:', e);
      return false;
    }
  }, [logAction, utils]);

  const removeManagedUser = useCallback(async (userId: string): Promise<boolean> => {
    const removedUser = users.find(u => u.id === userId);
    try {
      const result = await vanillaTrpc.parking.removeUser.mutate({ userId }) as any;
      if (!result.success) {
        console.log('[Users] Server rejected removeUser:', result.error);
        return false;
      }
      setUsers(prev => {
        const updated = prev.map(u =>
          u.id === userId && u.role !== 'admin'
            ? { ...u, deleted: true, active: false, updatedAt: new Date().toISOString() }
            : u
        );
        latestDataRef.current = { ...latestDataRef.current, users: updated };
        return updated;
      });
      logAction('user_remove', 'Удалён пользователь', `${removedUser?.name ?? userId}`, userId, 'user');
      void utils.parking.getData.invalidate();
      console.log('[Users] Soft-deleted user via server:', userId);
      return true;
    } catch (e) {
      console.log('[Users] Failed to remove user via server:', e);
      return false;
    }
  }, [users, logAction, utils]);

  const updateManagedUserPassword = useCallback(async (userId: string, newPassword: string): Promise<boolean> => {
    try {
      const result = await vanillaTrpc.parking.updateUserPassword.mutate({
        userId,
        newPassword,
      }) as any;
      if (!result.success) {
        console.log('[Users] Server rejected password update:', result.error);
        return false;
      }
      const pwUser = users.find(u => u.id === userId);
      logAction('user_password', 'Смена пароля', `Для ${pwUser?.name ?? userId}`, userId, 'user');
      void utils.parking.getData.invalidate();
      console.log('[Users] Password updated via server for:', userId);
      return true;
    } catch (e) {
      console.log('[Users] Failed to update password via server:', e);
      return false;
    }
  }, [users, logAction, utils]);

  const toggleManagedUserActive = useCallback(async (userId: string): Promise<boolean> => {
    const toggleUser = users.find(u => u.id === userId);
    try {
      const result = await vanillaTrpc.parking.toggleUserActive.mutate({ userId }) as any;
      if (!result.success) {
        console.log('[Users] Server rejected toggleUserActive:', result.error);
        return false;
      }
      setUsers(prev => {
        const updated = prev.map(u =>
          u.id === userId && u.role !== 'admin' ? { ...u, active: result.active, updatedAt: new Date().toISOString() } : u
        );
        latestDataRef.current = { ...latestDataRef.current, users: updated };
        return updated;
      });
      logAction('user_toggle', 'Переключение статуса', `${toggleUser?.name ?? userId}: ${result.active ? 'активирован' : 'деактивирован'}`, userId, 'user');
      void utils.parking.getData.invalidate();
      console.log('[Users] Toggled active via server for:', userId, 'now:', result.active);
      return true;
    } catch (e) {
      console.log('[Users] Failed to toggle user via server:', e);
      return false;
    }
  }, [users, logAction, utils]);

  const updateAdminProfile = useCallback(async (userId: string, currentPassword: string, updates: { login?: string; password?: string; name?: string }): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await vanillaTrpc.parking.updateAdminProfile.mutate({
        userId,
        currentPassword,
        updates,
      }) as any;
      if (!result.success) {
        return { success: false, error: result.error };
      }
      if (result.user) {
        const now = new Date().toISOString();
        setUsers(prev => prev.map(u =>
          u.id === userId ? { ...u, ...result.user, updatedAt: now } : u
        ));
      }
      logAction('admin_profile', 'Обновление профиля админа', `ID: ${userId}`, userId, 'user');
      void utils.parking.getData.invalidate();
      console.log('[Users] Admin profile updated via server:', userId);
      return { success: true };
    } catch (e) {
      console.log('[Users] Failed to update admin profile via server:', e);
      return { success: false, error: 'Ошибка связи с сервером' };
    }
  }, [logAction, utils]);

  const validateLogin = useCallback(async (login: string, password: string): Promise<User | null> => {
    try {
      const result = await vanillaTrpc.parking.login.mutate({ login, password }) as any;
      if (result.success && result.user) {
        return result.user as User;
      }
      console.log('[Auth] Server login failed:', result.error);
      return null;
    } catch (e) {
      console.log('[Auth] Server login request failed, falling back to local:', e);
      const user = users.find(u => u.login.toLowerCase() === login.toLowerCase() && u.active !== false && !u.deleted);
      if (user) {
        const { password: _pw, ...safeUser } = user;
        return safeUser as User;
      }
      return null;
    }
  }, [users]);

  const addScheduledShift = useCallback((date: string, startTime: string, endTime: string, operatorId: string, operatorName: string, comment: string): ScheduledShift => {
    const now = new Date().toISOString();
    const entry: ScheduledShift = {
      id: generateId(),
      date,
      startTime,
      endTime,
      operatorId,
      operatorName,
      comment,
      createdBy: currentUser?.id ?? 'unknown',
      createdAt: now,
      updatedAt: now,
    };
    setScheduledShifts(prev => [...prev, entry]);
    logAction('schedule_add', 'Добавлена смена в расписание', `${date}, ${startTime}–${endTime}, ${operatorName}`, entry.id, 'schedule');
    schedulePush();
    console.log(`[ScheduledShift] Added for ${date} by ${operatorName}`);
    return entry;
  }, [currentUser, schedulePush, logAction]);

  const updateScheduledShift = useCallback((id: string, updates: Partial<Pick<ScheduledShift, 'date' | 'startTime' | 'endTime' | 'operatorId' | 'operatorName' | 'comment'>>) => {
    const now = new Date().toISOString();
    setScheduledShifts(prev => prev.map(s =>
      s.id === id ? { ...s, ...updates, updatedAt: now } : s
    ));
    logAction('schedule_edit', 'Изменение расписания', `ID: ${id}`, id, 'schedule');
    schedulePush();
    console.log(`[ScheduledShift] Updated ${id}`);
  }, [schedulePush, logAction]);

  const deleteScheduledShift = useCallback((id: string) => {
    const now = new Date().toISOString();
    setScheduledShifts(prev => prev.map(s =>
      s.id === id ? { ...s, deleted: true, updatedAt: now } as ScheduledShift & { deleted: boolean } : s
    ));
    logAction('schedule_delete', 'Удалена смена из расписания', `ID: ${id}`, id, 'schedule');
    schedulePush();
    console.log(`[ScheduledShift] Soft-deleted ${id}`);
  }, [schedulePush, logAction]);

  const activeScheduledShifts = useMemo(() =>
    scheduledShifts.filter(s => !(s as any).deleted),
  [scheduledShifts]);

  const getCurrentMonth = useCallback((): string => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, []);

  const getCurrentMonthViolations = useCallback((): TeamViolationMonth => {
    const month = getCurrentMonth();
    const existing = teamViolations.find(v => v.month === month);
    if (existing) return existing;
    return {
      id: '',
      month,
      violationCount: 0,
      status: 'ok',
      violations: [],
    };
  }, [teamViolations, getCurrentMonth]);

  const ensureCurrentMonth = useCallback((): void => {
    const month = getCurrentMonth();
    const exists = teamViolations.some(v => v.month === month);
    if (!exists) {
      const newMonth: TeamViolationMonth = {
        id: generateId(),
        month,
        violationCount: 0,
        status: 'ok',
        violations: [],
      };
      setTeamViolations(prev => [...prev, newMonth]);
      schedulePush();
      console.log(`[Violations] Created new month record: ${month}`);
    }
  }, [teamViolations, getCurrentMonth, schedulePush]);

  useEffect(() => {
    if (isLoaded && currentUser) {
      ensureCurrentMonth();
    }
  }, [isLoaded, currentUser, ensureCurrentMonth]);

  const addViolation = useCallback((managerId: string, managerName: string, violationType: string, comment: string) => {
    if (currentUser?.role !== 'admin') {
      console.log('[Violations] Only admin can add violations');
      return;
    }
    const month = getCurrentMonth();
    const now = new Date().toISOString();
    const entry = {
      id: generateId(),
      managerId,
      managerName,
      type: violationType,
      comment,
      date: now,
      addedBy: currentUser.id,
      addedByName: currentUser.name,
    };

    setTeamViolations(prev => {
      const existing = prev.find(v => v.month === month);
      if (existing) {
        if (existing.status === 'bonus_denied') {
          console.log('[Violations] Month already at bonus_denied, cannot add more');
          return prev;
        }
        const newCount = Math.min(existing.violationCount + 1, 3);
        const newStatus = newCount >= 3 ? 'bonus_denied' as const : newCount >= 2 ? 'warning' as const : newCount >= 1 ? 'warning' as const : 'ok' as const;
        return prev.map(v => v.month === month ? {
          ...v,
          violationCount: newCount,
          status: newStatus,
          violations: [...v.violations, entry],
        } : v);
      } else {
        return [...prev, {
          id: generateId(),
          month,
          violationCount: 1,
          status: 'warning' as const,
          violations: [entry],
        }];
      }
    });

    logAction('violation_add', 'Зафиксировано нарушение', `Менеджер: ${managerName}, тип: ${violationType}${comment ? `, комментарий: ${comment}` : ''}`, managerId, 'violation');
    schedulePush();
    console.log(`[Violations] Added violation for ${managerName}: ${violationType}`);
  }, [currentUser, getCurrentMonth, logAction, schedulePush]);

  const deleteViolation = useCallback((violationEntryId: string) => {
    if (currentUser?.role !== 'admin') {
      console.log('[Violations] Only admin can delete violations');
      return;
    }
    const month = getCurrentMonth();

    setTeamViolations(prev => {
      const existing = prev.find(v => v.month === month);
      if (!existing) return prev;
      if (existing.status === 'bonus_denied') {
        console.log('[Violations] Cannot delete violations when bonus_denied');
        return prev;
      }
      const updatedViolations = existing.violations.filter(v => v.id !== violationEntryId);
      const newCount = updatedViolations.length;
      const newStatus = newCount >= 3 ? 'bonus_denied' as const : newCount >= 1 ? 'warning' as const : 'ok' as const;
      return prev.map(v => v.month === month ? {
        ...v,
        violationCount: newCount,
        status: newStatus,
        violations: updatedViolations,
      } : v);
    });

    logAction('violation_delete', 'Удалено нарушение', `ID: ${violationEntryId}`, violationEntryId, 'violation');
    schedulePush();
    console.log(`[Violations] Deleted violation ${violationEntryId}`);
  }, [currentUser, getCurrentMonth, logAction, schedulePush]);

  const createBackup = useCallback((): string => {
    const backupData = {
      version: 1,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name ?? 'unknown',
      data: {
        clients: latestDataRef.current.clients,
        cars: latestDataRef.current.cars,
        sessions: latestDataRef.current.sessions,
        subscriptions: latestDataRef.current.subscriptions,
        payments: latestDataRef.current.payments,
        debts: latestDataRef.current.debts,
        transactions: latestDataRef.current.transactions,
        tariffs: latestDataRef.current.tariffs,
        shifts: latestDataRef.current.shifts,
        expenses: latestDataRef.current.expenses,
        withdrawals: latestDataRef.current.withdrawals,
        users: latestDataRef.current.users,
        deletedClientIds: latestDataRef.current.deletedClientIds,
        scheduledShifts: latestDataRef.current.scheduledShifts,
        actionLogs: latestDataRef.current.actionLogs,
        adminExpenses: latestDataRef.current.adminExpenses,
        adminCashOperations: latestDataRef.current.adminCashOperations,
        expenseCategories: latestDataRef.current.expenseCategories,
        dailyDebtAccruals: latestDataRef.current.dailyDebtAccruals,
        clientDebts: latestDataRef.current.clientDebts,
        cashOperations: latestDataRef.current.cashOperations,
        teamViolations: latestDataRef.current.teamViolations,
      },
    };
    logAction('backup_create', 'Создана резервная копия', `Клиентов: ${backupData.data.clients.length}, машин: ${backupData.data.cars.length}`);
    console.log('[Backup] Created backup');
    return JSON.stringify(backupData);
  }, [currentUser, logAction]);

  const getPreRestoreBackup = useCallback((): string => {
    const backupData = {
      version: 1,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name ?? 'system',
      isPreRestore: true,
      data: { ...latestDataRef.current },
    };
    return JSON.stringify(backupData);
  }, [currentUser]);

  const restoreBackup = useCallback(async (jsonString: string): Promise<{ success: boolean; error?: string; preRestoreBackup?: string }> => {
    restoreInProgressRef.current = true;
    console.log('[Restore] === RESTORE STARTED, sync blocked ===');
    try {
      let parsed: any;
      try {
        parsed = JSON.parse(jsonString);
      } catch {
        restoreInProgressRef.current = false;
        return { success: false, error: 'Файл не является валидным JSON' };
      }

      if (!parsed.data || !parsed.version) {
        restoreInProgressRef.current = false;
        return { success: false, error: 'Неверный формат файла резервной копии (отсутствует data или version)' };
      }
      const d = parsed.data;

      if (!Array.isArray(d.clients)) {
        restoreInProgressRef.current = false;
        return { success: false, error: 'Файл повреждён: отсутствует массив clients' };
      }
      if (!Array.isArray(d.cars)) {
        restoreInProgressRef.current = false;
        return { success: false, error: 'Файл повреждён: отсутствует массив cars' };
      }
      if (!d.tariffs || typeof d.tariffs !== 'object') {
        restoreInProgressRef.current = false;
        return { success: false, error: 'Файл повреждён: отсутствуют тарифы' };
      }

      const preRestoreBackupJson = getPreRestoreBackup();
      console.log('[Restore] Pre-restore backup created');

      try {
        await AsyncStorage.setItem(STORAGE_KEY + '_pre_restore', preRestoreBackupJson);
        console.log('[Restore] Pre-restore backup saved to AsyncStorage');
      } catch (e) {
        console.log('[Restore] Failed to save pre-restore backup:', e);
      }

      if (pushTimerRef.current) { clearTimeout(pushTimerRef.current); pushTimerRef.current = null; }
      if (pushRetryTimerRef.current) { clearTimeout(pushRetryTimerRef.current); pushRetryTimerRef.current = null; }
      localDirtyRef.current = false;
      pushingRef.current = false;

      const restorePayload = {
        clients: d.clients ?? [],
        cars: d.cars ?? [],
        sessions: d.sessions ?? [],
        subscriptions: d.subscriptions ?? [],
        payments: d.payments ?? [],
        debts: d.debts ?? [],
        transactions: d.transactions ?? [],
        tariffs: d.tariffs ?? EMPTY_DATA.tariffs,
        shifts: d.shifts ?? [],
        expenses: d.expenses ?? [],
        withdrawals: d.withdrawals ?? [],
        users: (d.users && d.users.length > 0) ? d.users : latestDataRef.current.users,
        deletedClientIds: d.deletedClientIds ?? [],
        scheduledShifts: d.scheduledShifts ?? [],
        actionLogs: d.actionLogs ?? [],
        adminExpenses: d.adminExpenses ?? [],
        adminCashOperations: d.adminCashOperations ?? [],
        expenseCategories: d.expenseCategories ?? [],
        dailyDebtAccruals: d.dailyDebtAccruals ?? [],
        clientDebts: d.clientDebts ?? [],
        cashOperations: d.cashOperations ?? [],
        teamViolations: d.teamViolations ?? [],
      };

      let serverResetSuccess = false;
      try {
        const result = await vanillaTrpc.parking.resetData.mutate(restorePayload as any) as any;
        lastSyncedVersionRef.current = result.version;
        restoreEpochRef.current = result.restoreEpoch;
        localDirtyRef.current = false;
        serverResetSuccess = true;
        console.log(`[Restore] Server reset with backup data, version: ${result.version}, epoch: ${result.restoreEpoch}`);
      } catch (e) {
        console.log('[Restore] Server reset failed, trying pushData as fallback:', e);
        try {
          const fallbackResult = await vanillaTrpc.parking.pushData.mutate(restorePayload as any) as any;
          lastSyncedVersionRef.current = fallbackResult.version;
          restoreEpochRef.current = fallbackResult.restoreEpoch ?? restoreEpochRef.current;
          localDirtyRef.current = false;
          serverResetSuccess = true;
          console.log(`[Restore] Fallback push done, version: ${fallbackResult.version}`);
        } catch (e2) {
          console.log('[Restore] Fallback push also failed:', e2);
        }
      }

      setClients(restorePayload.clients);
      setCars(restorePayload.cars);
      setSessions(restorePayload.sessions);
      setSubscriptions(restorePayload.subscriptions);
      setPayments(restorePayload.payments);
      setDebts(restorePayload.debts);
      setTransactions(restorePayload.transactions);
      setTariffs(restorePayload.tariffs);
      setShifts(restorePayload.shifts);
      setExpenses(restorePayload.expenses);
      setWithdrawals(restorePayload.withdrawals);
      if (restorePayload.users.length > 0) setUsers(restorePayload.users.filter((u: any) => !u.deleted));
      setDeletedClientIds(restorePayload.deletedClientIds);
      setScheduledShifts(restorePayload.scheduledShifts);
      setActionLogs(restorePayload.actionLogs);
      setAdminExpenses(restorePayload.adminExpenses);
      setAdminCashOperations(restorePayload.adminCashOperations);
      setExpenseCategories(restorePayload.expenseCategories);
      setDailyDebtAccruals(restorePayload.dailyDebtAccruals);
      setClientDebts(restorePayload.clientDebts);
      setCashOperations(restorePayload.cashOperations);
      setTeamViolations(restorePayload.teamViolations);

      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(restorePayload));
        console.log('[Restore] AsyncStorage updated with restored data');
      } catch (e) {
        console.log('[Restore] AsyncStorage save failed:', e);
      }

      restoreInProgressRef.current = false;
      console.log('[Restore] === RESTORE COMPLETED, sync unblocked ===');

      void utils.parking.getData.invalidate();

      const stats = {
        clients: restorePayload.clients.length,
        cars: restorePayload.cars.length,
        sessions: restorePayload.sessions.length,
        payments: restorePayload.payments.length,
      };
      logAction('backup_restore', 'Восстановление из резервной копии',
        `Дата бэкапа: ${parsed.createdAt ?? '—'}, автор: ${parsed.createdBy ?? '—'}, ` +
        `клиентов: ${stats.clients}, машин: ${stats.cars}, заездов: ${stats.sessions}, ` +
        `оплат: ${stats.payments}, сервер: ${serverResetSuccess ? 'ОК' : 'ОШИБКА'}`);

      console.log(`[Restore] Backup restored successfully. Stats: ${JSON.stringify(stats)}, serverOk: ${serverResetSuccess}`);

      if (!serverResetSuccess) {
        localDirtyRef.current = true;
        schedulePush();
        return {
          success: true,
          error: 'Данные восстановлены локально, но синхронизация с сервером не удалась. Будет повторная попытка.',
          preRestoreBackup: preRestoreBackupJson,
        };
      }

      return { success: true, preRestoreBackup: preRestoreBackupJson };
    } catch (e) {
      restoreInProgressRef.current = false;
      console.log('[Restore] Failed:', e);
      return { success: false, error: 'Не удалось прочитать файл резервной копии' };
    }
  }, [schedulePush, utils, logAction, getPreRestoreBackup]);

  const resetAllData = useCallback(async () => {
    const adminUsers = users.filter(u => u.role === 'admin');
    const resetLog: ActionLog = {
      id: generateId(),
      action: 'data_reset',
      label: 'Полный сброс данных',
      details: 'Все данные очищены, сохранены только админ-аккаунты',
      userId: currentUser?.id ?? 'unknown',
      userName: currentUser?.name ?? 'Неизвестно',
      timestamp: new Date().toISOString(),
    };

    setClients([]);
    setCars([]);
    setSessions([]);
    setSubscriptions([]);
    setPayments([]);
    setDebts([]);
    setTransactions([]);
    setTariffs(EMPTY_DATA.tariffs);
    setShifts([]);
    setExpenses([]);
    setWithdrawals([]);
    setDeletedClientIds([]);
    setScheduledShifts([]);
    setActionLogs([resetLog]);
    setUsers(adminUsers);
    setAdminExpenses([]);
    setAdminCashOperations([]);
    setExpenseCategories([]);
    setDailyDebtAccruals([]);
    setClientDebts([]);
    setCashOperations([]);
    setTeamViolations([]);

    const resetPayload = {
      clients: [] as any[],
      cars: [] as any[],
      sessions: [] as any[],
      subscriptions: [] as any[],
      payments: [] as any[],
      debts: [] as any[],
      transactions: [] as any[],
      tariffs: EMPTY_DATA.tariffs,
      shifts: [] as any[],
      expenses: [] as any[],
      withdrawals: [] as any[],
      users: adminUsers,
      deletedClientIds: [] as string[],
      scheduledShifts: [] as any[],
      actionLogs: [resetLog],
      adminExpenses: [] as any[],
      adminCashOperations: [] as any[],
      expenseCategories: [] as any[],
      dailyDebtAccruals: [] as any[],
      clientDebts: [] as any[],
      cashOperations: [] as any[],
      teamViolations: [] as any[],
    };

    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(resetPayload));
      console.log('[Reset] AsyncStorage cleared and reset');
    } catch (e) {
      console.log('[Reset] AsyncStorage clear failed:', e);
    }

    if (pushTimerRef.current) { clearTimeout(pushTimerRef.current); pushTimerRef.current = null; }
    if (pushRetryTimerRef.current) { clearTimeout(pushRetryTimerRef.current); pushRetryTimerRef.current = null; }
    localDirtyRef.current = false;

    try {
      const result = await vanillaTrpc.parking.resetData.mutate(resetPayload as any) as any;
      lastSyncedVersionRef.current = result.version;
      restoreEpochRef.current = result.restoreEpoch;
      localDirtyRef.current = false;
      console.log(`[Reset] Server reset done, version: ${result.version}, epoch: ${result.restoreEpoch}`);
      void utils.parking.getData.invalidate();
    } catch (e) {
      console.log('[Reset] Server reset failed, will retry via push:', e);
      localDirtyRef.current = true;
      schedulePush();
    }

    console.log('[Reset] All data has been reset. Admin accounts preserved.');
  }, [users, currentUser, schedulePush, utils]);

  return useMemo(() => ({
    clients,
    cars,
    activeClients,
    activeCars,
    isClientDeleted,
    sessions,
    subscriptions,
    payments,
    debts,
    transactions,
    tariffs,
    shifts,
    expenses,
    withdrawals,
    users,
    scheduledShifts: activeScheduledShifts,
    isLoaded,
    isServerSynced,
    activeSessions,
    debtors,
    todayStats,
    expiringSubscriptions,
    getClientByCar,
    getCarsByClient,
    getAllCarsByClient,
    getClientDebts,
    getClientTotalDebt,
    getSubscription,
    updateClient,
    updateCar,
    addClient,
    addCarToClient,
    checkIn,
    checkOut,
    cancelCheckIn,
    cancelCheckOut,
    cancelPayment,
    payMonthly,
    payDebt,
    withdrawCash,
    searchClients,
    updateTariffs,
    deleteCar,
    deleteClient,
    findMatchingClients,
    openShift,
    closeShift,
    getActiveShift,
    getActiveManagerShift,
    getActiveAdminShift,
    isShiftOpen,
    isAdminShiftOpen,
    needsShiftCheck,
    addExpense,
    addManagedUser,
    removeManagedUser,
    updateManagedUserPassword,
    toggleManagedUserActive,
    updateAdminProfile,
    validateLogin,
    resetAllData,
    createBackup,
    restoreBackup,
    addScheduledShift,
    updateScheduledShift,
    actionLogs,
    logAction,
    deleteScheduledShift,
    earlyExitWithRefund,
    adminExpenses,
    adminCashOperations,
    expenseCategories,
    addAdminExpense,
    addExpenseCategory,
    updateExpenseCategory,
    deleteExpenseCategory,
    getManagerCategories,
    getAdminCategories,
    getManagerCashRegister,
    getAdminCashRegister,
    dailyDebtAccruals,
    clientDebts,
    payClientDebt,
    getClientDebtInfo,
    runDebtAccrual,
    cashOperations,
    getShiftCashBalance,
    addCashOperation,
    teamViolations,
    getCurrentMonthViolations,
    addViolation,
    deleteViolation,
    addManualDebt,
    deleteManualDebt,
    calculateDebtByMethod,
  }), [
    clients, cars, activeClients, activeCars, isClientDeleted,
    sessions, subscriptions, payments, debts, transactions, tariffs,
    shifts, expenses, withdrawals, users, activeScheduledShifts, actionLogs,
    isLoaded, isServerSynced, activeSessions, debtors, todayStats, expiringSubscriptions,
    getClientByCar, getCarsByClient, getAllCarsByClient, getClientDebts, getClientTotalDebt, getSubscription,
    updateClient, updateCar,
    addClient, addCarToClient, checkIn, checkOut,
    cancelCheckIn, cancelCheckOut, cancelPayment,
    payMonthly, payDebt, withdrawCash, searchClients, updateTariffs, deleteCar, deleteClient, findMatchingClients,
    openShift, closeShift, getActiveShift, getActiveManagerShift, getActiveAdminShift, isShiftOpen, isAdminShiftOpen, needsShiftCheck, addExpense,
    addManagedUser, removeManagedUser, updateManagedUserPassword, toggleManagedUserActive,
    updateAdminProfile, validateLogin, resetAllData, createBackup, restoreBackup,
    addScheduledShift, updateScheduledShift, deleteScheduledShift, logAction,
    earlyExitWithRefund,
    adminExpenses, adminCashOperations, expenseCategories,
    addAdminExpense, addExpenseCategory, updateExpenseCategory, deleteExpenseCategory,
    getManagerCategories, getAdminCategories, getManagerCashRegister, getAdminCashRegister,
    dailyDebtAccruals, clientDebts, payClientDebt, getClientDebtInfo, runDebtAccrual,
    cashOperations, getShiftCashBalance, addCashOperation,
    teamViolations, getCurrentMonthViolations, addViolation, deleteViolation,
    addManualDebt, deleteManualDebt,
    calculateDebtByMethod,
  ]);
});
