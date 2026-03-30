import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import {
  Client, Car, ParkingSession, MonthlySubscription,
  Payment, Debt, Transaction, Tariffs,
  PaymentMethod, ServiceType, CashShift, Expense, User, CashWithdrawal, ScheduledShift,
  ActionLog, ActionType, AdminExpense, AdminCashOperation, ExpenseCategory,
  DailyDebtAccrual, ClientDebt, CashOperation, TeamViolationMonth,
  SalaryAdvance, SalaryPayment, CleanupChecklistItem, CleanupTemplateItem
} from '@/types';
import { EMPTY_DATA } from '@/mocks/initialData';
import { generateId } from '@/utils/id';
import { roundMoney, normalizeMoneyData } from '@/utils/money';
import { calculateDays, addMonths, isExpired, isToday, daysUntil, getMonthlyAmount } from '@/utils/date';
import { formatPlateNumber } from '@/utils/plate';
import { useAuth } from './AuthProvider';
import { trpc, vanillaTrpc } from '@/lib/trpc';
import { migrateBackupData, detectBackupVersion } from '@/utils/backup-migration';
import { useSelfDiagnosis } from '@/hooks/useSelfDiagnosis';
import { FullDiagnosticData } from '@/utils/integrity';
import { logAnomaly, getAnomalySummary } from '@/utils/anomaly-logger';

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
  const [salaryAdvances, setSalaryAdvances] = useState<SalaryAdvance[]>([]);
  const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([]);
  const [cleanupChecklistTemplate, setCleanupChecklistTemplate] = useState<CleanupTemplateItem[]>([]);
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
  const debtsDirtyUntilRef = useRef<number>(0);
  const shiftsDirtyUntilRef = useRef<number>(0);
  const salaryDirtyUntilRef = useRef<number>(0);
  const cashOpsDirtyUntilRef = useRef<number>(0);
  const COLLECTION_DIRTY_MS = 45000;
  const restoreEpochRef = useRef<number>(-1);
  const restoreInProgressRef = useRef<boolean>(false);
  const restoreServerOkRef = useRef<boolean>(false);
  const restoreFinishedAtRef = useRef<number>(0);
  const lastPushCompletedRef = useRef<number>(0);
  const RESTORE_GRACE_MS = 300000;
  const POST_PUSH_GRACE_MS = 15000;

  const latestDataRef = useRef({
    clients, cars, sessions, subscriptions, payments, debts, transactions, tariffs, shifts, expenses, withdrawals, users, deletedClientIds, scheduledShifts, actionLogs, adminExpenses, adminCashOperations, expenseCategories, dailyDebtAccruals, clientDebts, cashOperations, teamViolations, salaryAdvances, salaryPayments, cleanupChecklistTemplate,
  });
  useEffect(() => {
    latestDataRef.current = { clients, cars, sessions, subscriptions, payments, debts, transactions, tariffs, shifts, expenses, withdrawals, users, deletedClientIds, scheduledShifts, actionLogs, adminExpenses, adminCashOperations, expenseCategories, dailyDebtAccruals, clientDebts, cashOperations, teamViolations, salaryAdvances, salaryPayments, cleanupChecklistTemplate };
  }, [clients, cars, sessions, subscriptions, payments, debts, transactions, tariffs, shifts, expenses, withdrawals, users, deletedClientIds, scheduledShifts, actionLogs, adminExpenses, adminCashOperations, expenseCategories, dailyDebtAccruals, clientDebts, cashOperations, teamViolations, salaryAdvances, salaryPayments, cleanupChecklistTemplate]);

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
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    staleTime: 0,
    retry: 2,
    retryDelay: 1000,
    throwOnError: false,
  });

  const applyServerData = useCallback((rawD: Record<string, any>, source?: string) => {
    const d = normalizeMoneyData(rawD) as Record<string, any>;
    const serverClients = d.clients || [];
    const localData = latestDataRef.current;
    const localClientCount = localData.clients?.length ?? 0;
    const serverClientCount = serverClients.length;

    const isRestoreGrace = restoreFinishedAtRef.current > 0 && (Date.now() - restoreFinishedAtRef.current) < RESTORE_GRACE_MS;
    if (isRestoreGrace && serverClientCount === 0 && localClientCount > 0) {
      console.log(`[Sync] BLOCKED applyServerData(${source ?? '?'}): server has 0 clients but local has ${localClientCount} during restore grace. Refusing to wipe.`);
      return;
    }

    if (serverClientCount === 0 && localClientCount > 3) {
      console.log(`[Sync] WARNING applyServerData(${source ?? '?'}): server has 0 clients but local has ${localClientCount}. Refusing to apply empty data.`);
      return;
    }

    const deleted = new Set<string>(d.deletedClientIds || []);
    setDeletedClientIds(d.deletedClientIds || []);
    setClients(deleted.size > 0 ? serverClients.filter((c: any) => !deleted.has(c.id)) : serverClients);
    setCars(deleted.size > 0 ? (d.cars || []).filter((c: any) => !deleted.has(c.clientId)) : (d.cars || []));
    setSessions(deleted.size > 0 ? (d.sessions || []).filter((s: any) => !deleted.has(s.clientId)) : (d.sessions || []));
    setSubscriptions(deleted.size > 0 ? (d.subscriptions || []).filter((s: any) => !deleted.has(s.clientId)) : (d.subscriptions || []));
    const now = Date.now();
    const isDebtsDirty = debtsDirtyUntilRef.current > now;
    const isCashOpsDirty = cashOpsDirtyUntilRef.current > now;
    const isShiftsDirty = shiftsDirtyUntilRef.current > now;
    const isSalaryDirty = salaryDirtyUntilRef.current > now;
    const isPaymentsDirty = isDebtsDirty || isCashOpsDirty;
    const isTxDirty = isDebtsDirty || isCashOpsDirty || isSalaryDirty;
    const isExpensesDirty = isCashOpsDirty || isSalaryDirty;

    if (isPaymentsDirty) {
      console.log(`[Sync] SKIPPING payments overwrite — financial ops dirty (source=${source ?? '?'})`);
    } else {
      setPayments(d.payments || []);
    }
    if (isDebtsDirty) {
      console.log(`[Sync] SKIPPING debts/clientDebts overwrite — local debts dirty for ${debtsDirtyUntilRef.current - now}ms more (source=${source ?? '?'})`);
    } else {
      setDebts(deleted.size > 0 ? (d.debts || []).filter((dd: any) => !deleted.has(dd.clientId)) : (d.debts || []));
    }
    if (isTxDirty) {
      console.log(`[Sync] SKIPPING transactions overwrite — financial ops dirty (source=${source ?? '?'})`);
    } else {
      setTransactions((d.transactions || []).slice(0, MAX_TRANSACTIONS));
    }
    if (d.tariffs) setTariffs(d.tariffs);
    if (isShiftsDirty) {
      console.log(`[Sync] SKIPPING shifts overwrite — local shifts dirty for ${shiftsDirtyUntilRef.current - now}ms more (source=${source ?? '?'})`);
    } else {
      setShifts(d.shifts ?? []);
    }
    if (isExpensesDirty) {
      console.log(`[Sync] SKIPPING expenses overwrite — financial ops dirty (source=${source ?? '?'})`);
    } else {
      setExpenses(d.expenses ?? []);
    }
    if (isCashOpsDirty) {
      console.log(`[Sync] SKIPPING withdrawals overwrite — cashOps dirty (source=${source ?? '?'})`);
    } else {
      setWithdrawals(d.withdrawals ?? []);
    }
    const serverUsers = d.users;
    if (serverUsers && Array.isArray(serverUsers) && serverUsers.length > 0) {
      setUsers(serverUsers.filter((u: any) => !u.deleted));
    }
    setScheduledShifts((d.scheduledShifts ?? []).filter((s: any) => !s.deleted));
    if (!isTxDirty) {
      setActionLogs((d.actionLogs ?? []).slice(0, MAX_ACTION_LOGS));
    }
    if (isExpensesDirty || isSalaryDirty) {
      console.log(`[Sync] SKIPPING adminExpenses/adminCashOperations overwrite — financial ops dirty (source=${source ?? '?'})`);
    } else {
      setAdminExpenses(d.adminExpenses ?? []);
      setAdminCashOperations(d.adminCashOperations ?? []);
    }
    setExpenseCategories((d.expenseCategories ?? []).filter((c: any) => !c.deleted));
    if (!isDebtsDirty) {
      setDailyDebtAccruals(d.dailyDebtAccruals ?? []);
    }
    if (!isDebtsDirty) {
      setClientDebts(deleted.size > 0 ? (d.clientDebts ?? []).filter((cd: any) => !deleted.has(cd.clientId)) : (d.clientDebts ?? []));
    }
    if (isCashOpsDirty) {
      console.log(`[Sync] SKIPPING cashOperations overwrite — local cashOps dirty for ${cashOpsDirtyUntilRef.current - now}ms more (source=${source ?? '?'})`);
    } else {
      setCashOperations(d.cashOperations ?? []);
    }
    setTeamViolations(d.teamViolations ?? []);
    if (isSalaryDirty) {
      console.log(`[Sync] SKIPPING salaryAdvances/salaryPayments overwrite — local salary dirty for ${salaryDirtyUntilRef.current - now}ms more (source=${source ?? '?'})`);
    } else {
      setSalaryAdvances(d.salaryAdvances ?? localData.salaryAdvances ?? []);
      setSalaryPayments(d.salaryPayments ?? localData.salaryPayments ?? []);
    }
    setCleanupChecklistTemplate(d.cleanupChecklistTemplate ?? localData.cleanupChecklistTemplate ?? []);
    console.log(`[Sync] Applied server data (${source ?? '?'}): clients=${serverClientCount}, sessions=${(d.sessions||[]).length}, shifts=${(d.shifts||[]).length}, users=${(serverUsers||[]).length}`);
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
          const data = normalizeMoneyData(JSON.parse(stored)) as Record<string, any>;
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
          if (data.salaryAdvances) setSalaryAdvances(data.salaryAdvances);
          if (data.salaryPayments) setSalaryPayments(data.salaryPayments);
          if (data.cleanupChecklistTemplate) setCleanupChecklistTemplate(data.cleanupChecklistTemplate);
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
      const epochGracePeriod = restoreFinishedAtRef.current > 0 && (Date.now() - restoreFinishedAtRef.current) < RESTORE_GRACE_MS;
      if (restoreInProgressRef.current || epochGracePeriod) {
        console.log(`[Sync] EPOCH CHANGE detected (local=${restoreEpochRef.current}, server=${serverEpoch}), but restore in progress/grace — skipping resync`);
        return;
      }
      console.log(`[Sync] EPOCH CHANGE detected: local=${restoreEpochRef.current}, server=${serverEpoch}. Forcing full resync.`);
      restoreEpochRef.current = serverEpoch;
      localDirtyRef.current = false;
      if (pushTimerRef.current) { clearTimeout(pushTimerRef.current); pushTimerRef.current = null; }
      if (pushRetryTimerRef.current) { clearTimeout(pushRetryTimerRef.current); pushRetryTimerRef.current = null; }
      if (data) {
        applyServerData(data as Record<string, any>, 'epoch_change');
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

      const restoreGracePeriod = restoreFinishedAtRef.current > 0 && (Date.now() - restoreFinishedAtRef.current) < RESTORE_GRACE_MS;
      if (restoreInProgressRef.current || restoreGracePeriod) {
        if (restoreGracePeriod && !restoreInProgressRef.current) {
          lastSyncedVersionRef.current = version;
          console.log(`[Sync] Restore grace period active (${Date.now() - restoreFinishedAtRef.current}ms since restore), accepting version v${version} without applying data`);
        } else {
          console.log(`[Sync] Restore in progress, skipping server data v${version}`);
        }
      } else if (pushingRef.current) {
        if (skipLogVersionRef.current !== version) {
          console.log(`[Sync] Server v${version} available, push in progress — will apply after push completes`);
          skipLogVersionRef.current = version;
        }
      } else {
        const serverClients = (data as Record<string, any>).clients;
        const localClients = latestDataRef.current.clients;
        const serverEmpty = !Array.isArray(serverClients) || serverClients.length === 0;
        const localHasData = Array.isArray(localClients) && localClients.length > 3;
        const recentRestore = restoreFinishedAtRef.current > 0 && (Date.now() - restoreFinishedAtRef.current) < RESTORE_GRACE_MS;
        if (serverEmpty && localHasData && !recentRestore) {
          console.log(`[Sync] WARNING: Server has 0 clients but local has ${localClients.length}. Refusing to apply empty server data. Pushing local data instead.`);
          lastSyncedVersionRef.current = version;
          skipLogVersionRef.current = -1;
          localDirtyRef.current = true;
          schedulePushImmediate();
        } else if (localDirtyRef.current) {
          console.log(`[Sync] Server v${version} available but localDirty=true — skipping apply to preserve local changes, pushing local data first`);
          lastSyncedVersionRef.current = version;
          skipLogVersionRef.current = -1;
          schedulePushImmediate();
        } else {
          const postPushGrace = lastPushCompletedRef.current > 0 && (Date.now() - lastPushCompletedRef.current) < POST_PUSH_GRACE_MS;
          if (postPushGrace) {
            console.log(`[Sync] Server v${version} available but within post-push grace period (${Date.now() - lastPushCompletedRef.current}ms) — skipping to prevent stale data overwrite`);
            lastSyncedVersionRef.current = version;
            skipLogVersionRef.current = -1;
          } else {
            console.log(`[Sync] Applying server data v${version} (was v${lastSyncedVersionRef.current})`);
            applyServerData(data as Record<string, any>, 'poll');
            lastSyncedVersionRef.current = version;
            skipLogVersionRef.current = -1;
            void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
          }
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
    if (restoreInProgressRef.current) {
      console.log('[Sync] Push blocked: restore in progress');
      return;
    }
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

      const isGracePeriod = restoreFinishedAtRef.current > 0 && (Date.now() - restoreFinishedAtRef.current) < RESTORE_GRACE_MS;

      if (result.epochConflict) {
        if (isGracePeriod) {
          console.log(`[Sync] Epoch conflict on push during grace period — ignoring server data, keeping local. Server epoch=${result.restoreEpoch}`);
          restoreEpochRef.current = result.restoreEpoch;
          lastSyncedVersionRef.current = result.version;
          localDirtyRef.current = true;
          if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
          pushTimerRef.current = setTimeout(() => { pushTimerRef.current = null; void pushToServer(); }, 500);
          return;
        }
        console.log(`[Sync] Epoch conflict on push! Server epoch=${result.restoreEpoch}. Discarding local, applying server.`);
        restoreEpochRef.current = result.restoreEpoch;
        lastSyncedVersionRef.current = result.version;
        localDirtyRef.current = false;
        if (result.data) {
          applyServerData(result.data as Record<string, any>, 'epoch_conflict');
          void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(result.data)).catch(() => {});
        }
        void utils.parking.getData.invalidate();
        return;
      }

      lastSyncedVersionRef.current = result.version;
      restoreEpochRef.current = result.restoreEpoch ?? restoreEpochRef.current;
      lastPushCompletedRef.current = Date.now();

      const hasNewLocalChanges = localChangeCounterRef.current !== changeCountBefore;

      if (result.data) {
        if (isGracePeriod) {
          console.log(`[Sync] Push OK during grace period v${result.version} — NOT applying server response to preserve local restored data`);
          void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(localData)).catch(() => {});
        } else if (hasNewLocalChanges) {
          console.log(`[Sync] Push OK v${result.version}, but local changes during push — skipping applyServerData, will re-push`);
          void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(localData)).catch(() => {});
        } else {
          applyServerData(result.data as Record<string, any>, 'push_response');
          void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(result.data)).catch(() => {});
          console.log(`[Sync] Pushed & applied merged data, version: ${result.version}, epoch: ${result.restoreEpoch}`);
        }
      } else {
        console.log(`[Sync] Pushed to server, version: ${result.version}`);
        void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(localData)).catch(() => {});
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
    if (restoreInProgressRef.current) {
      console.log('[Sync] schedulePush blocked: restore in progress, marking dirty for later');
      localDirtyRef.current = true;
      localChangeCounterRef.current++;
      return;
    }
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
    setTransactions(prev => {
      const next = [newTx, ...prev].slice(0, MAX_TRANSACTIONS);
      latestDataRef.current = { ...latestDataRef.current, transactions: next };
      return next;
    });
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
      const isLombardSession = session.tariffType === 'lombard' || session.serviceType === 'lombard';
      let dailyRate: number;
      if (isLombardSession) {
        dailyRate = session.lombardRateApplied ?? currentTariffs.lombardRate;
      } else if (session.serviceType === 'monthly') {
        dailyRate = currentTariffs.monthlyCash;
      } else {
        dailyRate = currentTariffs.onetimeCash;
      }

      const entryDate = new Date(session.entryTime);
      entryDate.setHours(0, 0, 0, 0);
      const maxBackfillDate = new Date(now);
      maxBackfillDate.setDate(maxBackfillDate.getDate() - 90);
      const startDate = entryDate > maxBackfillDate ? entryDate : maxBackfillDate;
      const checkDate = new Date(startDate);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      while (checkDate <= todayEnd) {
        const dayStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        const alreadyAccrued = currentAccruals.some(
          a => a.parkingEntryId === session.id && a.accrualDate === dayStr
        ) || newAccruals.some(a => a.parkingEntryId === session.id && a.accrualDate === dayStr);
        if (!alreadyAccrued) {
          const accrual: DailyDebtAccrual = {
            id: generateId(),
            parkingEntryId: session.id,
            clientId: session.clientId,
            carId: session.carId,
            accrualDate: dayStr,
            amount: dailyRate,
            tariffRate: dailyRate,
            createdAt: now.toISOString(),
          };
          newAccruals.push(accrual);
          clientDeltas[session.clientId] = (clientDeltas[session.clientId] ?? 0) + dailyRate;
        }
        checkDate.setDate(checkDate.getDate() + 1);
      }
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

    const todayAccruals = newAccruals.filter(a => a.accrualDate === todayStr);
    const backfilledCount = newAccruals.length - todayAccruals.length;
    for (const accrual of todayAccruals) {
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
    if (backfilledCount > 0) {
      console.log(`[DebtAccrual] Backfilled ${backfilledCount} missing accruals for past days`);
    }

    logAction('debt_accrual', 'Ежедневное начисление долга', `Начислено ${newAccruals.length} записей${backfilledCount > 0 ? ` (${backfilledCount} за прошлые дни)` : ''}, клиентов: ${Object.keys(clientDeltas).length}`);
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
    const isInShift = (t: { date: string; shiftId?: string | null }) => {
      if (t.shiftId === shift.id) return true;
      if (t.shiftId && t.shiftId !== shift.id) return false;
      const tTime = new Date(t.date).getTime();
      return tTime >= openTime && tTime <= closeTime;
    };
    const cashIncome = transactions.filter(t =>
      (t.type === 'payment' || t.type === 'debt_payment') &&
      t.method === 'cash' && t.amount > 0 && isInShift(t)
    ).reduce((s, t) => s + t.amount, 0);
    const cancelled = transactions.filter(t =>
      t.type === 'cancel_payment' && t.method === 'cash' && isInShift(t)
    ).reduce((s, t) => s + t.amount, 0);
    const refunded = transactions.filter(t =>
      t.type === 'refund' && t.method === 'cash' && isInShift(t)
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
    setCashOperations(prev => {
      const next = [op, ...prev];
      latestDataRef.current = { ...latestDataRef.current, cashOperations: next };
      return next;
    });
    console.log(`[CashOp] ${params.type}: ${params.amount} ₽, balance: ${params.balanceBefore} → ${params.balanceAfter}`);
    return op;
  }, [currentUser]);

  const checkIn = useCallback((carId: string, clientId: string, serviceType: ServiceType, plannedDepartureTime?: string, paymentAtEntry?: { method: PaymentMethod; amount: number; days?: number; paidUntilDate?: string; baseAmount?: number; adjustmentReason?: string }, debtAtEntry?: { amount: number; description?: string; paidUntilDate?: string }, isSecondary?: boolean, lombardEntry?: boolean) => {
    if (paymentAtEntry && paymentAtEntry.amount > 0) {
      cashOpsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    }
    const isLombardPre = lombardEntry === true || serviceType === 'lombard';
    const isDebtEntryPre = isLombardPre || (!!debtAtEntry && debtAtEntry.amount > 0);
    if (isDebtEntryPre) {
      debtsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    }
    const activeShift = shifts.find(s => s.status === 'open');
    const sessionNow = new Date().toISOString();
    const isLombard = lombardEntry === true || serviceType === 'lombard';
    const isDebtEntry = isLombard || (!!debtAtEntry && debtAtEntry.amount > 0);
    const isStandardDebt = isDebtEntry && !isLombard;
    const sessionStatus = isLombard ? 'active_debt' : 'active';
    const lombardRate = isLombard ? tariffs.lombardRate : undefined;
    const debtPrepaidAmount = isStandardDebt ? (debtAtEntry?.amount ?? 0) : 0;
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
      prepaidAmount: paymentAtEntry?.amount ?? debtPrepaidAmount,
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

      const hasAdjustment = paymentAtEntry.baseAmount !== undefined && paymentAtEntry.baseAmount !== paymentAtEntry.amount;
      const adjustDesc = hasAdjustment
        ? ` [Корректировка: базовая ${paymentAtEntry.baseAmount} ₽ → ${paymentAtEntry.amount} ₽, ${paymentAtEntry.adjustmentReason ?? 'Договорная сумма'}]`
        : '';

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
        description: payDesc + adjustDesc,
        shiftId: activeShift?.id ?? null,
        updatedAt: sessionNow,
        baseAmount: hasAdjustment ? paymentAtEntry.baseAmount : undefined,
        adjustedAmount: hasAdjustment ? paymentAtEntry.amount : undefined,
        adjustmentReason: hasAdjustment ? (paymentAtEntry.adjustmentReason ?? 'Договорная сумма') : undefined,
      };
      setPayments(prev => [...prev, newPayment]);

      addTransaction({
        clientId,
        carId,
        type: 'payment',
        amount: paymentAtEntry.amount,
        method: paymentAtEntry.method,
        date: sessionNow,
        description: payDesc + adjustDesc,
      });

      if (hasAdjustment) {
        const diff = roundMoney((paymentAtEntry.baseAmount ?? 0) - paymentAtEntry.amount);
        const adjCar = cars.find(c => c.id === carId);
        logAction('payment', 'Корректировка суммы при постановке', `${adjCar?.plateNumber ?? carId}: базовая ${paymentAtEntry.baseAmount} ₽ → итого ${paymentAtEntry.amount} ₽ (${diff > 0 ? 'скидка' : 'наценка'} ${Math.abs(diff)} ₽), причина: ${paymentAtEntry.adjustmentReason ?? 'Договорная сумма'}`, newPayment.id, 'payment');
        console.log(`[CheckIn] Price adjustment: base=${paymentAtEntry.baseAmount}, final=${paymentAtEntry.amount}, reason=${paymentAtEntry.adjustmentReason}`);
      }

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
      if (isLombard) {
        const todayNow = new Date();
        const todayStr = `${todayNow.getFullYear()}-${String(todayNow.getMonth() + 1).padStart(2, '0')}-${String(todayNow.getDate()).padStart(2, '0')}`;
        const dailyRate = lombardRate ?? tariffs.lombardRate;
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
          description: `Ломбард: первое начисление ${dailyRate} ₽/сут.`,
        });
        console.log(`[CheckIn] Lombard entry: first accrual ${dailyRate} ₽, session ${session.id}`);
      } else {
        const debtAmount = debtAtEntry?.amount ?? 0;
        if (debtAmount > 0) {
          const newDebt: Debt = {
            id: generateId(),
            clientId,
            carId,
            totalAmount: debtAmount,
            remainingAmount: debtAmount,
            createdAt: sessionNow,
            updatedAt: sessionNow,
            description: debtAtEntry?.description ?? `Постановка в долг: ${debtAmount} ₽`,
            parkingEntryId: session.id,
            status: 'active',
          };
          setDebts(prev => [...prev, newDebt]);
          addTransaction({
            clientId,
            carId,
            type: 'debt',
            amount: debtAmount,
            method: null,
            date: sessionNow,
            description: debtAtEntry?.description ?? `Постановка в долг: ${debtAmount} ₽`,
          });

          if (serviceType === 'monthly' && debtAtEntry?.paidUntilDate) {
            const paidUntil = debtAtEntry.paidUntilDate;
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

          console.log(`[CheckIn] Standard debt entry: ${debtAmount} ₽, session ${session.id}, parkingEntryId set`);
        }
      }
    }

    const car = cars.find(c => c.id === carId);
    const client = clients.find(c => c.id === clientId);
    const payInfo = paymentAtEntry && paymentAtEntry.amount > 0 ? `, оплата ${paymentAtEntry.amount} ₽` : '';
    const debtInfo = isDebtEntry ? (isLombard ? `, ломбард ${lombardRate ?? tariffs.lombardRate} ₽/сут.` : `, в долг ${debtAtEntry?.amount ?? 0} ₽`) : '';
    const typeLabel = isLombard ? 'ломбард' : (serviceType === 'monthly' ? 'месяц' : 'разово');
    const entryLabel = isSecondary ? 'Вторичная постановка авто' : 'Заезд';
    logAction('checkin', entryLabel, `${car?.plateNumber ?? carId} (${client?.name ?? clientId}), ${typeLabel}${payInfo}${debtInfo}`, session.id, 'session');
    if (isSecondary && isDebtEntry) {
      const debtLabel = isLombard
        ? `начисление: ${lombardRate ?? tariffs.lombardRate} ₽/сут.`
        : `долг: ${debtAtEntry?.amount ?? 0} ₽`;
      logAction('checkin', 'Создан долг по вторичной постановке', `${car?.plateNumber ?? carId} (${client?.name ?? clientId}), ${debtLabel}`, session.id, 'session');
    }
    schedulePush();
    console.log(`[CheckIn] Session created for car ${carId}, status=${sessionStatus}, planned departure: ${plannedDepartureTime ?? 'not set'}`);
    return session;
  }, [addTransaction, schedulePush, currentUser, shifts, cars, clients, logAction, updateShiftExpected, subscriptions, tariffs, updateClientDebt, addCashOperation, getShiftCashBalance]);

  const checkOut = useCallback((sessionId: string, paymentAtExit?: { method: PaymentMethod; amount: number }, releaseInDebt?: boolean): { debtId: string | null; amount: number; days: number; paid: number } => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return { debtId: null, amount: 0, days: 0, paid: 0 };

    debtsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    cashOpsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    const now = new Date().toISOString();
    const activeShift = shifts.find(s => s.status === 'open');
    const isDebtSession = session.status === 'active_debt';

    if (isDebtSession && !paymentAtExit) {
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, exitTime: now, status: 'released_debt' as any, updatedAt: now } : s
      ));

      const entryAccruals = dailyDebtAccruals.filter(a => a.parkingEntryId === sessionId);
      const accrualTotal = roundMoney(entryAccruals.reduce((s, a) => s + a.amount, 0));

      const cd = clientDebts.find(c => c.clientId === session.clientId);
      const currentCdTotal = cd ? cd.totalAmount : 0;
      const actualDebtRemaining = roundMoney(Math.min(accrualTotal, currentCdTotal));
      const removalFromCd = roundMoney(Math.min(accrualTotal, currentCdTotal));

      let newDebtId: string | null = null;
      if (actualDebtRemaining > 0) {
        const isLombardSession = session.tariffType === 'lombard' || session.serviceType === 'lombard';
        const rate = isLombardSession ? (session.lombardRateApplied ?? tariffs.lombardRate) : (session.serviceType === 'monthly' ? tariffs.monthlyCash : tariffs.onetimeCash);
        const debtId = generateId();
        newDebtId = debtId;
        const serviceLabel = isLombardSession ? 'ломбард' : (session.serviceType === 'monthly' ? 'месяц' : 'разово');
        const priorPaid = roundMoney(accrualTotal - actualDebtRemaining);
        const descPaid = priorPaid > 0 ? `, оплачено ранее ${priorPaid} ₽` : '';
        const newDebt: Debt = {
          id: debtId,
          clientId: session.clientId,
          carId: session.carId,
          totalAmount: actualDebtRemaining,
          remainingAmount: actualDebtRemaining,
          createdAt: now,
          updatedAt: now,
          description: `${isLombardSession ? 'Ломбард' : 'Стоянка'}: ${entryAccruals.length} сут. × ${rate} ₽ (${serviceLabel})${descPaid}`,
          parkingEntryId: sessionId,
          status: 'active',
        };
        setDebts(prev => [...prev, newDebt]);
        console.log(`[CheckOut] Created Debt record ${debtId} for released session ${sessionId}: ${actualDebtRemaining} ₽ (accrual=${accrualTotal}, priorPaid=${priorPaid})`);
      }

      updateClientDebt(session.clientId, -removalFromCd);

      addTransaction({
        clientId: session.clientId,
        carId: session.carId,
        type: 'debt_freeze',
        amount: actualDebtRemaining,
        method: null,
        date: now,
        description: `Выпуск в долг: ${actualDebtRemaining} ₽ (${entryAccruals.length} дн.)${accrualTotal !== actualDebtRemaining ? ` [начислено ${accrualTotal} ₽, оплачено ранее ${roundMoney(accrualTotal - actualDebtRemaining)} ₽]` : ''}`,
      });

      const carF = cars.find(c => c.id === session.carId);
      logAction('debt_freeze', 'Выпуск авто в долг', `${carF?.plateNumber ?? session.carId}, долг: ${actualDebtRemaining} ₽${accrualTotal !== actualDebtRemaining ? ` (начислено ${accrualTotal}, оплачено ранее ${roundMoney(accrualTotal - actualDebtRemaining)})` : ''}`, sessionId, 'session');
      schedulePush();
      console.log(`[CheckOut] Debt session released: ${sessionId}, debt record: ${actualDebtRemaining} ₽`);
      return { debtId: newDebtId, amount: actualDebtRemaining, days: entryAccruals.length, paid: 0 };
    }

    if (isDebtSession && paymentAtExit) {
      const entryAccruals = dailyDebtAccruals.filter(a => a.parkingEntryId === sessionId);
      const accrualTotal = roundMoney(entryAccruals.reduce((s, a) => s + a.amount, 0));
      const cdForExit = clientDebts.find(c => c.clientId === session.clientId);
      const currentCdTotalForExit = cdForExit ? cdForExit.totalAmount : 0;
      const actualSessionDebt = roundMoney(Math.min(accrualTotal, currentCdTotalForExit));
      const paidAmount = roundMoney(Math.min(paymentAtExit.amount, actualSessionDebt));
      const afterPay = roundMoney(actualSessionDebt - paidAmount);

      const isLombardSession = session.tariffType === 'lombard' || session.serviceType === 'lombard';
      const exitServiceType = isLombardSession ? 'lombard' as const : session.serviceType;

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
          serviceType: exitServiceType,
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
          category: isLombardSession ? 'Оплата ломбардного долга при выезде' : 'Оплата долга при выезде',
          description: payDesc,
          method: paymentAtExit.method,
          shiftId: activeShift?.id ?? null,
          balanceBefore: debtExitBalBefore,
          balanceAfter: paymentAtExit.method === 'cash' ? roundMoney(debtExitBalBefore + paidAmount) : debtExitBalBefore,
        });
      }

      const removalFromCdExit = roundMoney(Math.min(accrualTotal, currentCdTotalForExit));
      updateClientDebt(session.clientId, -removalFromCdExit);

      let newDebtId: string | null = null;
      if (afterPay > 0) {
        const rate = isLombardSession ? (session.lombardRateApplied ?? tariffs.lombardRate) : (session.serviceType === 'monthly' ? tariffs.monthlyCash : tariffs.onetimeCash);
        const debtId = generateId();
        newDebtId = debtId;
        const serviceLabel = isLombardSession ? 'ломбард' : (session.serviceType === 'monthly' ? 'месяц' : 'разово');
        const priorPaidExit = roundMoney(accrualTotal - actualSessionDebt);
        const priorPaidNote = priorPaidExit > 0 ? `, оплачено ранее ${priorPaidExit} ₽` : '';
        const newDebt: Debt = {
          id: debtId,
          clientId: session.clientId,
          carId: session.carId,
          totalAmount: afterPay,
          remainingAmount: afterPay,
          createdAt: now,
          updatedAt: now,
          description: `${isLombardSession ? 'Ломбард' : 'Стоянка'}: ${entryAccruals.length} сут. × ${rate} ₽, оплачено ${paidAmount} ₽, остаток ${afterPay} ₽ (${serviceLabel})${priorPaidNote}`,
          parkingEntryId: sessionId,
          status: 'active',
        };
        setDebts(prev => [...prev, newDebt]);
        addTransaction({
          clientId: session.clientId,
          carId: session.carId,
          type: 'debt',
          amount: afterPay,
          method: null,
          date: now,
          description: `Остаток долга после частичной оплаты при выезде: ${afterPay} ₽`,
        });
        console.log(`[CheckOut] Created Debt record ${debtId} for remaining: ${afterPay} ₽ (actualSessionDebt=${actualSessionDebt}, accrualTotal=${accrualTotal})`);
      }

      const carD = cars.find(c => c.id === session.carId);
      logAction('checkout', 'Выезд (долговая сессия)', `${carD?.plateNumber ?? session.carId}, начислено ${accrualTotal} ₽, долг к выезду ${actualSessionDebt} ₽, оплачено ${paidAmount} ₽${afterPay > 0 ? `, остаток долга ${afterPay} ₽` : ''}`, sessionId, 'session');
      schedulePush();
      console.log(`[CheckOut] Debt session exit: actualDebt=${actualSessionDebt}, paid=${paidAmount}, remaining=${afterPay}`);
      return { debtId: newDebtId, amount: afterPay, days: entryAccruals.length, paid: paidAmount };
    }

    const newStatus = releaseInDebt ? 'released_debt' : 'completed';
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, exitTime: now, status: newStatus as any, updatedAt: now } : s
    ));

    if (session.serviceType === 'onetime') {
      const days = calculateDays(session.entryTime, now);
      const exitMethod = paymentAtExit?.method ?? 'cash';
      const dailyRate = exitMethod === 'cash' ? tariffs.onetimeCash : tariffs.onetimeCard;
      const totalAmount = roundMoney(dailyRate * days);
      const prepaid = session.prepaidAmount ?? 0;
      const remaining = roundMoney(Math.max(0, totalAmount - prepaid));

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
        const paidAmount = roundMoney(Math.min(paymentAtExit.amount, remaining));
        const afterPay = roundMoney(remaining - paidAmount);

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
            parkingEntryId: sessionId,
            status: 'active',
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
          parkingEntryId: sessionId,
          status: 'active',
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
        const linkedDebtsForSession = debts.filter(d => d.parkingEntryId === sessionId && d.remainingAmount > 0);
        if (linkedDebtsForSession.length > 0 && totalAmount < prepaid) {
          setDebts(prev => prev.map(d => {
            if (d.parkingEntryId !== sessionId || d.remainingAmount <= 0) return d;
            const paidSoFar = roundMoney(d.totalAmount - d.remainingAmount);
            const adjustedTotal = roundMoney(Math.min(d.totalAmount, totalAmount));
            const adjustedRemaining = roundMoney(Math.max(0, adjustedTotal - paidSoFar));
            console.log(`[CheckOut] Adjusted linked debt ${d.id}: total ${d.totalAmount} → ${adjustedTotal}, remaining ${d.remainingAmount} → ${adjustedRemaining}`);
            return { ...d, totalAmount: adjustedTotal, remainingAmount: adjustedRemaining, updatedAt: now, status: adjustedRemaining <= 0 ? 'paid' as const : d.status };
          }));
          const carAdj = cars.find(c => c.id === session.carId);
          logAction('checkout', 'Корректировка долга при досрочном выезде', `${carAdj?.plateNumber ?? session.carId}, долг скорректирован: ${prepaid} ₽ → ${totalAmount} ₽ (фактически ${days} сут.)`, sessionId, 'session');
        }
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
          parkingEntryId: sessionId,
          status: 'active',
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
  }, [sessions, tariffs, subscriptions, addTransaction, schedulePush, cars, logAction, currentUser, shifts, updateShiftExpected, dailyDebtAccruals, updateClientDebt, addCashOperation, getShiftCashBalance, clientDebts, debts]);

  const earlyExitWithRefund = useCallback((sessionId: string, refundMethod: PaymentMethod): { refundAmount: number; daysUsed: number; dailyRate: number; paidAmount: number } => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return { refundAmount: 0, daysUsed: 0, dailyRate: 0, paidAmount: 0 };

    cashOpsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
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

    const paidAmount = roundMoney(lastPayment.originalAmount ?? lastPayment.amount);
    const paymentMethod = lastPayment.method;
    const dailyRate = paymentMethod === 'cash' ? tariffs.monthlyCash : tariffs.monthlyCard;

    const periodStart = new Date(lastPayment.date);
    periodStart.setHours(0, 0, 0, 0);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const diffMs = todayDate.getTime() - periodStart.getTime();
    const daysUsed = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);
    const usedAmount = roundMoney(daysUsed * dailyRate);
    const refundAmount = roundMoney(Math.max(0, paidAmount - usedAmount));

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

    if (session.status === 'active_debt') {
      debtsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    }

    const cancelNow = new Date().toISOString();
    const isLombardCancel = session.tariffType === 'lombard' || session.serviceType === 'lombard';
    const isDebtCancel = session.status === 'active_debt';

    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, status: 'completed' as const, exitTime: cancelNow, cancelled: true, updatedAt: cancelNow } : s
    ));

    if (isDebtCancel) {
      const cancelAccruals = dailyDebtAccruals.filter(a => a.parkingEntryId === sessionId);
      const cancelAccrualTotal = roundMoney(cancelAccruals.reduce((s, a) => s + a.amount, 0));
      if (cancelAccrualTotal > 0) {
        updateClientDebt(session.clientId, -cancelAccrualTotal);
        console.log(`[Cancel] Reversed ${cancelAccrualTotal} ₽ from clientDebts for cancelled debt entry ${sessionId}`);
      }
      setDailyDebtAccruals(prev => prev.filter(a => a.parkingEntryId !== sessionId));

      const cancelEntryDebts = debts.filter(d => d.parkingEntryId === sessionId && d.remainingAmount > 0);
      if (cancelEntryDebts.length > 0) {
        const debtIds = new Set(cancelEntryDebts.map(d => d.id));
        setDebts(prev => prev.map(d =>
          debtIds.has(d.id) ? { ...d, remainingAmount: 0, status: 'paid' as const, updatedAt: cancelNow } : d
        ));
        console.log(`[Cancel] Zeroed ${cancelEntryDebts.length} linked debts for cancelled entry ${sessionId}`);
      }
    }

    addTransaction({
      clientId: session.clientId,
      carId: session.carId,
      type: 'cancel_entry',
      amount: 0,
      method: null,
      date: cancelNow,
      description: `Отмена заезда (${currentUser?.name ?? 'Неизвестно'})${isLombardCancel ? ' [ломбард]' : ''}`,
    });

    const cancelCar = cars.find(c => c.id === session.carId);
    logAction('cancel_checkin', 'Отмена заезда', `${cancelCar?.plateNumber ?? session.carId}${isDebtCancel ? ', долги аннулированы' : ''}`, sessionId, 'session');
    schedulePush();
    console.log(`[Cancel] Check-in cancelled: ${sessionId}, debtReversed=${isDebtCancel}`);
  }, [sessions, currentUser, addTransaction, schedulePush, cars, logAction, dailyDebtAccruals, debts, updateClientDebt]);

  const cancelCheckOut = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId && (s.status === 'completed' || s.status === 'released' || s.status === 'released_debt') && !s.cancelled);
    if (!session || !session.exitTime) return;
    debtsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;

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
      const debtRemainingToRestore = roundMoney(relatedDebts.reduce((s, d) => s + d.remainingAmount, 0));
      const debtIds = new Set(relatedDebts.map(d => d.id));
      setDebts(prev => prev.map(d =>
        debtIds.has(d.id) ? { ...d, remainingAmount: 0, status: 'paid' as const, updatedAt: now } : d
      ));

      if (restoreStatus === 'active_debt' && debtRemainingToRestore > 0) {
        updateClientDebt(session.clientId, debtRemainingToRestore);
        console.log(`[Cancel] Restored ${debtRemainingToRestore} ₽ to clientDebts for ${session.clientId} (debt session cancel)`);
      }
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
    logAction('cancel_checkout', 'Отмена выезда', `${cancelExitCar?.plateNumber ?? session.carId}, долгов снято: ${relatedDebts.length}${restoreStatus === 'active_debt' ? `, восстановлено в clientDebts` : ''}`, sessionId, 'session');
    schedulePush();
    console.log(`[Cancel] Check-out cancelled: ${sessionId}, debts zeroed: ${relatedDebts.length}, restored to clientDebts: ${restoreStatus === 'active_debt'}`);
  }, [sessions, debts, currentUser, addTransaction, schedulePush, cars, logAction, updateClientDebt]);

  const cancelPayment = useCallback((paymentId: string) => {
    const payment = payments.find(p => p.id === paymentId && !p.cancelled);
    if (!payment) return;

    debtsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    cashOpsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    console.log(`[CancelPayment] Marked debts+cashOps dirty for ${COLLECTION_DIRTY_MS}ms`);
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
        status: 'active',
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
    cashOpsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    console.log(`[PayMonthly] Marked cashOps dirty for ${COLLECTION_DIRTY_MS}ms`);
    const dailyRate = method === 'cash' ? tariffs.monthlyCash : tariffs.monthlyCard;
    const amount = customAmount ?? roundMoney(getMonthlyAmount(dailyRate) * months);
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
    amount = roundMoney(amount);
    const debt = debts.find(d => d.id === debtId);
    if (!debt) return;

    debtsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    cashOpsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    console.log(`[payDebt] Marked debts+cashOps dirty for ${COLLECTION_DIRTY_MS}ms`);

    const now = new Date().toISOString();
    const actualAmount = roundMoney(Math.min(amount, debt.remainingAmount));
    const newRemaining = roundMoney(debt.remainingAmount - actualAmount);

    setDebts(prev => {
      const next = prev.map(d =>
        d.id === debtId ? { ...d, remainingAmount: newRemaining, status: newRemaining <= 0 ? 'paid' as const : d.status, updatedAt: now } : d
      );
      latestDataRef.current = { ...latestDataRef.current, debts: next };
      return next;
    });

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

  const payClientDebt = useCallback((clientId: string, amount: number, method: PaymentMethod, _calculatedTotal?: number) => {
    amount = roundMoney(amount);
    debtsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    cashOpsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    console.log(`[payClientDebt] Marked debts+cashOps dirty for ${COLLECTION_DIRTY_MS}ms`);

    const overstayAmount = overstayedSessionDebts[clientId] ?? 0;
    if (overstayAmount > 0) {
      console.log(`[payClientDebt] Materializing overstay debts for client ${clientId}: ${overstayAmount} ₽`);
      materializeOverstayDebts(clientId);
    }

    const now = new Date().toISOString();

    const clientOldDebts = latestDataRef.current.debts.filter(d => d.clientId === clientId && d.remainingAmount > 0)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const cd = clientDebts.find(c => c.clientId === clientId);
    const oldDebtsTotal = clientOldDebts.reduce((s, d) => s + d.remainingAmount, 0);
    const clientDebtTotal = cd ? cd.totalAmount : 0;
    const storedTotal = roundMoney(oldDebtsTotal + clientDebtTotal);

    if (storedTotal <= 0) return;

    const actualAmount = roundMoney(Math.min(amount, storedTotal));
    const isFullPayment = actualAmount >= storedTotal;

    let remaining = actualAmount;

    const updatedDebtIds: string[] = [];
    if (isFullPayment) {
      setDebts(prev => {
        const next = prev.map(d => {
          if (d.clientId !== clientId || d.remainingAmount <= 0) return d;
          updatedDebtIds.push(d.id);
          return { ...d, remainingAmount: 0, status: 'paid' as const, updatedAt: now };
        });
        latestDataRef.current = { ...latestDataRef.current, debts: next };
        return next;
      });
      setClientDebts(prev => {
        const next = prev.map(c => {
          if (c.clientId !== clientId) return c;
          return {
            ...c,
            totalAmount: 0,
            frozenAmount: 0,
            activeAmount: 0,
            lastUpdate: now,
          };
        });
        latestDataRef.current = { ...latestDataRef.current, clientDebts: next };
        return next;
      });
    } else {
      if (clientOldDebts.length > 0 && remaining > 0) {
        setDebts(prev => {
          const next = prev.map(d => {
            if (d.clientId !== clientId || d.remainingAmount <= 0 || remaining <= 0) return d;
            const idx = clientOldDebts.findIndex(od => od.id === d.id);
            if (idx === -1) return d;
            const payForThis = roundMoney(Math.min(remaining, d.remainingAmount));
            remaining = roundMoney(remaining - payForThis);
            updatedDebtIds.push(d.id);
            const newRem = roundMoney(d.remainingAmount - payForThis);
            return { ...d, remainingAmount: newRem, status: newRem <= 0 ? 'paid' as const : d.status, updatedAt: now };
          });
          latestDataRef.current = { ...latestDataRef.current, debts: next };
          return next;
        });
      }

      if (remaining > 0 && cd && cd.totalAmount > 0) {
        const payForCd = roundMoney(Math.min(remaining, cd.totalAmount));
        remaining = roundMoney(remaining - payForCd);
        setClientDebts(prev => {
          const next = prev.map(c => {
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
          });
          latestDataRef.current = { ...latestDataRef.current, clientDebts: next };
          return next;
        });
      }
    }

    const newRemainingTotal = isFullPayment ? 0 : roundMoney(storedTotal - actualAmount);

    const resolvedCarId = (clientOldDebts.length > 0 && clientOldDebts[0].carId)
      ? clientOldDebts[0].carId
      : (cars.find(c => c.clientId === clientId && !c.deleted)?.id ?? '');

    const newPayment: Payment = {
      id: generateId(),
      clientId,
      carId: resolvedCarId,
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
      carId: resolvedCarId,
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
  }, [debts, clientDebts, currentUser, shifts, addTransaction, updateShiftExpected, logAction, schedulePush, addCashOperation, getShiftCashBalance, cars, overstayedSessionDebts, materializeOverstayDebts]);

  const getUnshiftedCashBalance = useCallback((): number => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartTime = todayStart.getTime();

    const openShiftIds = new Set(shifts.filter(s => s.status === 'open').map(s => s.id));

    const todayTx = transactions.filter(t => {
      if (new Date(t.date).getTime() < todayStartTime) return false;
      if (t.shiftId && openShiftIds.has(t.shiftId)) return false;
      return true;
    });

    const cashIncome = todayTx.filter(t =>
      (t.type === 'payment' || t.type === 'debt_payment') && t.method === 'cash' && t.amount > 0
    ).reduce((s, t) => s + t.amount, 0);

    const cashCancelled = todayTx.filter(t =>
      t.type === 'cancel_payment' && t.method === 'cash'
    ).reduce((s, t) => s + t.amount, 0);

    const cashRefunded = todayTx.filter(t =>
      t.type === 'refund' && t.method === 'cash'
    ).reduce((s, t) => s + t.amount, 0);

    const todayWithdrawals = withdrawals.filter(w =>
      new Date(w.date).getTime() >= todayStartTime && (!w.shiftId || !openShiftIds.has(w.shiftId))
    ).reduce((s, w) => s + w.amount, 0);

    const todayExpenses = expenses.filter(e =>
      new Date(e.date).getTime() >= todayStartTime && (!e.shiftId || !openShiftIds.has(e.shiftId))
    ).reduce((s, e) => s + e.amount, 0);

    const todaySalaryAdvanceCash = salaryAdvances.filter(a =>
      new Date(a.issuedAt).getTime() >= todayStartTime && (!a.method || a.method === 'cash') && a.source === 'manager_shift'
    ).reduce((s, a) => s + a.amount, 0);

    const todaySalaryPayCash = salaryPayments.filter(p =>
      new Date(p.paidAt).getTime() >= todayStartTime && p.method === 'cash' && p.netPaid > 0 && p.source === 'manager_shift'
    ).reduce((s, p) => s + p.netPaid, 0);

    console.log(`[UnshiftedBalance] cashIn=${cashIncome}, cancelled=${cashCancelled}, refunded=${cashRefunded}, withdrawals=${todayWithdrawals}, expenses=${todayExpenses}, salAdvCash=${todaySalaryAdvanceCash}, salPayCash=${todaySalaryPayCash}`);
    return roundMoney(cashIncome - cashCancelled - cashRefunded - todayWithdrawals - todayExpenses - todaySalaryAdvanceCash - todaySalaryPayCash);
  }, [transactions, withdrawals, expenses, salaryAdvances, salaryPayments, shifts]);

  const getCashBalance = useCallback((): number => {
    const isUserAdmin = currentUser?.role === 'admin';
    let targetShift: CashShift | undefined;
    if (isUserAdmin) {
      targetShift = shifts.find(s => s.status === 'open' && s.operatorRole === 'admin')
        ?? shifts.find(s => s.status === 'open');
    } else {
      targetShift = shifts.find(s => s.status === 'open' && s.operatorRole !== 'admin')
        ?? shifts.find(s => s.status === 'open');
    }
    if (targetShift) {
      const shiftBal = getShiftCashBalance(targetShift);
      if (isUserAdmin) {
        const unshifted = getUnshiftedCashBalance();
        if (unshifted > 0) {
          console.log(`[getCashBalance] Admin with shift: shiftBal=${shiftBal}, unshifted=${unshifted}, combined=${shiftBal + unshifted}`);
          return roundMoney(shiftBal + unshifted);
        }
      }
      return shiftBal;
    }
    if (isUserAdmin) {
      const unshifted = getUnshiftedCashBalance();
      console.log(`[getCashBalance] No open shift, admin mode, using unshifted balance: ${unshifted}`);
      return unshifted;
    }
    return 0;
  }, [currentUser, shifts, getShiftCashBalance, getUnshiftedCashBalance]);

  const withdrawCash = useCallback((amount: number, notes: string, forceNegative?: boolean): { success: boolean; error?: string; withdrawal?: CashWithdrawal; wouldGoNegative?: boolean; currentBalance?: number } => {
    if (currentUser?.role !== 'admin') {
      console.log(`[Withdrawal] BLOCKED: user ${currentUser?.name} (role=${currentUser?.role}) attempted cash withdrawal`);
      return { success: false, error: 'Операцию может выполнить только администратор' };
    }
    const activeShift = shifts.find(s => s.status === 'open');
    if (!activeShift && currentUser?.role !== 'admin') {
      console.log(`[Withdrawal] BLOCKED: no open shift for non-admin`);
      return { success: false, error: 'Нет открытой смены. Откройте смену, чтобы снять наличные.' };
    }
    cashOpsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    console.log(`[Withdrawal] Marked cashOps dirty for ${COLLECTION_DIRTY_MS}ms`);
    const now = new Date().toISOString();
    const balanceBefore = activeShift ? getShiftCashBalance(activeShift) : getUnshiftedCashBalance();
    const balanceAfter = roundMoney(balanceBefore - amount);
    const isUserAdmin = currentUser?.role === 'admin';
    console.log(`[Withdrawal] Calculating balance: ${activeShift ? 'shiftBalance' : 'unshiftedBalance'}=${balanceBefore}, effective=${balanceBefore}`);

    if (balanceAfter < 0 && !isUserAdmin) {
      console.log(`[Withdrawal] BLOCKED for manager: balance=${balanceBefore}, withdraw=${amount}`);
      return { success: false, error: `Недостаточно средств в кассе. Остаток: ${balanceBefore} ₽, можно снять максимум: ${balanceBefore} ₽`, currentBalance: balanceBefore };
    }

    if (balanceAfter < 0 && isUserAdmin && !forceNegative) {
      console.log(`[Withdrawal] Admin warning: balance=${balanceBefore}, withdraw=${amount}, would go to ${balanceAfter}`);
      return { success: false, wouldGoNegative: true, currentBalance: balanceBefore, error: `Касса уйдёт в минус! Остаток: ${balanceBefore} ₽, после снятия: ${balanceAfter} ₽` };
    }

    const withdrawal: CashWithdrawal = {
      id: generateId(),
      amount,
      operatorId: currentUser?.id ?? 'unknown',
      operatorName: currentUser?.name ?? 'Неизвестно',
      date: now,
      shiftId: activeShift?.id ?? null,
      notes,
    };
    setWithdrawals(prev => {
      const next = [withdrawal, ...prev];
      latestDataRef.current = { ...latestDataRef.current, withdrawals: next };
      return next;
    });
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
      description: `Снятие из кассы: ${amount} ₽${notes ? ` — ${notes}` : ''}${balanceAfter < 0 ? ' [МИНУС РАЗРЕШЁН АДМИНОМ]' : ''}`,
    });

    addCashOperation({
      type: 'withdrawal',
      amount,
      category: 'Снятие',
      description: `Снятие из кассы${notes ? `: ${notes}` : ''}${balanceAfter < 0 ? ' [минус разрешён админом]' : ''}`,
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
      description: `Снятие наличных с кассы менеджера${notes ? `: ${notes}` : ''}${balanceAfter < 0 ? ' [минус разрешён]' : ''}`,
      sourceManagerId: activeShift?.operatorId,
      sourceManagerName: activeShift?.operatorName,
      operatorId: currentUser?.id ?? 'unknown',
      operatorName: currentUser?.name ?? 'Неизвестно',
      date: now,
      updatedAt: now,
    };
    setAdminCashOperations(prev => [adminOp, ...prev]);

    const negativeNote = balanceAfter < 0 ? ` ⚠️ РАЗРЕШЁН МИНУС (админ)` : '';
    logAction('admin_withdrawal', 'Снятие наличных с кассы менеджера', `${amount} ₽${notes ? ` — ${notes}` : ''}, менеджер: ${activeShift?.operatorName ?? '—'} (баланс: ${balanceBefore} → ${balanceAfter} ₽)${negativeNote}`, withdrawal.id, 'withdrawal');
    schedulePush();
    console.log(`[Withdrawal] ${amount} ₽ withdrawn by ${currentUser?.name}, balance: ${balanceBefore} → ${balanceAfter}${balanceAfter < 0 ? ' [NEGATIVE ALLOWED]' : ''}`);
    return { success: true, withdrawal };
  }, [shifts, currentUser, schedulePush, updateShiftExpected, addTransaction, addCashOperation, getShiftCashBalance, getUnshiftedCashBalance, logAction]);

  const addManualDebt = useCallback((clientId: string, amount: number, date: string, comment: string) => {
    amount = roundMoney(amount);
    if (amount <= 0) return;
    debtsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
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
    setDebts(prev => {
      const next = [...prev, newDebt];
      latestDataRef.current = { ...latestDataRef.current, debts: next };
      return next;
    });

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
    debtsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    const now = new Date().toISOString();

    setDebts(prev => {
      const next = prev.map(d =>
        d.id === debtId ? { ...d, remainingAmount: 0, status: 'paid' as const, updatedAt: now } : d
      );
      latestDataRef.current = { ...latestDataRef.current, debts: next };
      return next;
    });

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

  const deleteCashOperation = useCallback((operationId: string) => {
    const op = cashOperations.find(o => o.id === operationId);
    if (!op) return;
    debtsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    cashOpsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    const now = new Date().toISOString();

    setCashOperations(prev => {
      const next = prev.filter(o => o.id !== operationId);
      latestDataRef.current = { ...latestDataRef.current, cashOperations: next };
      return next;
    });

    if (op.relatedEntityId && op.relatedEntityType === 'debt') {
      setDebts(prev => {
        const next = prev.map(d => {
          if (d.id !== op.relatedEntityId) return d;
          return { ...d, remainingAmount: roundMoney(d.remainingAmount + op.amount), status: 'active' as const, updatedAt: now };
        });
        latestDataRef.current = { ...latestDataRef.current, debts: next };
        return next;
      });
      console.log(`[DeleteCashOp] Restored debt ${op.relatedEntityId} by +${op.amount}`);
    }

    if (op.type === 'debt_payment_income' && op.relatedEntityId) {
      setDebts(prev => {
        const next = prev.map(d => {
          if (d.id !== op.relatedEntityId) return d;
          const newRemaining = roundMoney(d.remainingAmount + op.amount);
          return { ...d, remainingAmount: newRemaining, status: newRemaining > 0 ? 'active' as const : d.status, updatedAt: now };
        });
        latestDataRef.current = { ...latestDataRef.current, debts: next };
        return next;
      });
    }

    if (op.type === 'income' || op.type === 'debt_payment_income') {
      const activeShift = shifts.find(s => s.status === 'open');
      if (activeShift && op.method === 'cash') {
        updateShiftExpected(activeShift.id, -op.amount);
      }
    } else if (op.type === 'expense' || op.type === 'withdrawal') {
      const activeShift = shifts.find(s => s.status === 'open');
      if (activeShift && op.method === 'cash') {
        updateShiftExpected(activeShift.id, op.amount);
      }
    }

    if (op.relatedEntityId && op.relatedEntityType === 'expense') {
      setExpenses(prev => prev.filter(e => e.id !== op.relatedEntityId));
    }
    if (op.relatedEntityId && op.relatedEntityType === 'withdrawal') {
      setWithdrawals(prev => {
        const next = prev.filter(w => w.id !== op.relatedEntityId);
        latestDataRef.current = { ...latestDataRef.current, withdrawals: next };
        return next;
      });
    }

    setTransactions(prev => {
      const next = prev.filter(t => {
        if (!op.relatedEntityId) return true;
        return !(t.date === op.date && Math.abs(t.amount - op.amount) < 0.01);
      });
      latestDataRef.current = { ...latestDataRef.current, transactions: next };
      return next;
    });

    logAction('admin_edit', '[ADMIN] Удаление операции', `${op.type}: ${op.amount} ₽ — ${op.description}`, operationId, 'cash_operation');
    schedulePush();
    console.log(`[DeleteCashOp] Deleted operation ${operationId}: ${op.type}, ${op.amount} ₽, cascaded to related entities`);
  }, [cashOperations, shifts, updateShiftExpected, logAction, schedulePush]);

  const activeSessions = useMemo(() =>
    sessions.filter(s => (s.status === 'active' || s.status === 'active_debt') && !s.cancelled && !isClientDeleted(s.clientId)),
  [sessions, isClientDeleted]);

  const overstayedSessionDebts = useMemo(() => {
    const result: Record<string, number> = {};
    const sessionIdsWithDebt = new Set(
      debts.filter(d => d.parkingEntryId && d.remainingAmount > 0).map(d => d.parkingEntryId!)
    );
    for (const session of activeSessions) {
      if (session.status === 'active_debt') continue;
      if (session.serviceType === 'lombard' || session.tariffType === 'lombard') continue;
      if (sessionIdsWithDebt.has(session.id)) continue;

      if (session.serviceType === 'onetime') {
        const days = calculateDays(session.entryTime);
        const dailyRate = tariffs.onetimeCash;
        const totalOwed = roundMoney(dailyRate * days);
        const prepaid = session.prepaidAmount ?? 0;
        const owing = roundMoney(Math.max(0, totalOwed - prepaid));
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
    console.log(`[Debtors] Overstayed session debts calculated for ${Object.keys(result).length} clients`);
    return result;
  }, [activeSessions, tariffs, subscriptions, debts]);

  const overstayedSessionDetails = useMemo(() => {
    const result: Record<string, Array<{ sessionId: string; carId: string; clientId: string; days: number; rate: number; amount: number; prepaid: number; serviceType: ServiceType }>> = {};
    const sessionIdsWithDebt = new Set(
      debts.filter(d => d.parkingEntryId && d.remainingAmount > 0).map(d => d.parkingEntryId!)
    );
    for (const session of activeSessions) {
      if (session.status === 'active_debt') continue;
      if (session.serviceType === 'lombard' || session.tariffType === 'lombard') continue;
      if (sessionIdsWithDebt.has(session.id)) continue;

      if (session.serviceType === 'onetime') {
        const days = calculateDays(session.entryTime);
        const dailyRate = tariffs.onetimeCash;
        const totalOwed = roundMoney(dailyRate * days);
        const prepaid = session.prepaidAmount ?? 0;
        const owing = roundMoney(Math.max(0, totalOwed - prepaid));
        if (owing > 0) {
          if (!result[session.clientId]) result[session.clientId] = [];
          result[session.clientId].push({ sessionId: session.id, carId: session.carId, clientId: session.clientId, days, rate: dailyRate, amount: owing, prepaid, serviceType: session.serviceType });
        }
      } else if (session.serviceType === 'monthly') {
        const sub = subscriptions.find(s => s.carId === session.carId && s.clientId === session.clientId);
        if (!sub || isExpired(sub.paidUntil)) {
          const monthlyAmount = getMonthlyAmount(tariffs.monthlyCash);
          if (!result[session.clientId]) result[session.clientId] = [];
          result[session.clientId].push({ sessionId: session.id, carId: session.carId, clientId: session.clientId, days: 0, rate: tariffs.monthlyCash, amount: monthlyAmount, prepaid: 0, serviceType: session.serviceType });
        }
      }
    }
    return result;
  }, [activeSessions, tariffs, subscriptions, debts]);

  const materializeOverstayDebts = useCallback((clientId: string): number => {
    const details = overstayedSessionDetails[clientId];
    if (!details || details.length === 0) return 0;
    debtsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    const now = new Date().toISOString();
    let totalMaterialized = 0;
    const newDebts: Debt[] = [];
    for (const d of details) {
      const desc = d.serviceType === 'onetime'
        ? `Парковка без оплаты: ${d.days} сут. × ${d.rate} ₽${d.prepaid > 0 ? ` − предоплата ${d.prepaid} ₽` : ''} = ${d.amount} ₽`
        : `Просроченная месячная аренда: ${d.amount} ₽`;
      const newDebt: Debt = {
        id: generateId(),
        clientId: d.clientId,
        carId: d.carId,
        totalAmount: d.amount,
        remainingAmount: d.amount,
        createdAt: now,
        updatedAt: now,
        description: desc,
        parkingEntryId: d.sessionId,
        status: 'active',
      };
      newDebts.push(newDebt);
      totalMaterialized = roundMoney(totalMaterialized + d.amount);
      console.log(`[MaterializeOverstay] Created Debt for session ${d.sessionId}: ${d.amount} ₽ (${d.days} days × ${d.rate})`);
    }
    if (newDebts.length > 0) {
      setDebts(prev => {
        const next = [...prev, ...newDebts];
        latestDataRef.current = { ...latestDataRef.current, debts: next };
        return next;
      });
      for (const nd of newDebts) {
        addTransaction({
          clientId: nd.clientId,
          carId: nd.carId,
          type: 'debt',
          amount: nd.totalAmount,
          method: null,
          date: now,
          description: nd.description,
        });
      }
      logAction('debt_accrual', 'Фиксация долга за просрочку', `Клиент ${clientId}: ${newDebts.length} записей, всего ${totalMaterialized} ₽`);
    }
    return totalMaterialized;
  }, [overstayedSessionDetails, addTransaction, logAction]);

  const activeDebts = useMemo(() => debts.filter(d => d.remainingAmount > 0), [debts]);

  const getClientDebts = useCallback((clientId: string): Debt[] => {
    return activeDebts.filter(d => d.clientId === clientId);
  }, [activeDebts]);

  const getClientTotalDebt = useCallback((clientId: string): number => {
    const oldDebtsTotal = activeDebts.filter(d => d.clientId === clientId).reduce((sum, d) => sum + d.remainingAmount, 0);
    const cd = clientDebts.find(c => c.clientId === clientId);
    const clientDebtTotal = cd ? cd.totalAmount : 0;
    const overstayTotal = overstayedSessionDebts[clientId] ?? 0;
    return roundMoney(oldDebtsTotal + clientDebtTotal + overstayTotal);
  }, [activeDebts, clientDebts, overstayedSessionDebts]);

  const payWithDebtPriority = useCallback((clientId: string, totalPayment: number, method: PaymentMethod, targetCarId?: string, serviceType?: ServiceType, months?: number, paidUntilDate?: string): { debtPaid: number; advancePaid: number; remainingDebt: number } => {
    const clientTotalDebt = getClientTotalDebt(clientId);

    if (clientTotalDebt <= 0) {
      if (targetCarId && serviceType === 'monthly') {
        payMonthly(clientId, targetCarId, method, months ?? 1, totalPayment, paidUntilDate);
      }
      console.log(`[PayWithDebtPriority] No debt for ${clientId}, full amount ${totalPayment} goes to advance/payment`);
      return { debtPaid: 0, advancePaid: totalPayment, remainingDebt: 0 };
    }

    const debtToPay = roundMoney(Math.min(totalPayment, clientTotalDebt));
    const advanceAmount = roundMoney(totalPayment - debtToPay);

    if (debtToPay > 0) {
      payClientDebt(clientId, debtToPay, method, clientTotalDebt);
    }

    if (advanceAmount > 0 && targetCarId) {
      if (serviceType === 'monthly') {
        payMonthly(clientId, targetCarId, method, months ?? 1, advanceAmount, paidUntilDate);
      } else {
        const advNow = new Date().toISOString();
        const advShift = shifts.find(s => s.status === 'open');
        const advDesc = `Аванс после погашения долга: ${advanceAmount} ₽ (${method === 'cash' ? 'наличные' : 'безнал'})`;
        const advPay: Payment = {
          id: generateId(),
          clientId,
          carId: targetCarId,
          amount: advanceAmount,
          method,
          date: advNow,
          serviceType: serviceType ?? 'onetime',
          operatorId: currentUser?.id ?? 'unknown',
          operatorName: currentUser?.name ?? 'Неизвестно',
          description: advDesc,
          shiftId: advShift?.id ?? null,
          updatedAt: advNow,
        };
        setPayments(prev => [...prev, advPay]);
        addTransaction({
          clientId,
          carId: targetCarId,
          type: 'payment',
          amount: advanceAmount,
          method,
          date: advNow,
          description: advDesc,
        });
        if (method === 'cash' && advShift) {
          updateShiftExpected(advShift.id, advanceAmount);
        }
        const advBal = advShift ? getShiftCashBalance(advShift) : 0;
        addCashOperation({
          type: 'income',
          amount: advanceAmount,
          category: 'Аванс (после долга)',
          description: advDesc,
          method,
          shiftId: advShift?.id ?? null,
          balanceBefore: advBal,
          balanceAfter: method === 'cash' ? roundMoney(advBal + advanceAmount) : advBal,
        });
        schedulePush();
        console.log(`[PayWithDebtPriority] Advance payment created: ${advanceAmount} for car ${targetCarId}`);
      }
    }

    const newRemainingDebt = roundMoney(Math.max(0, clientTotalDebt - debtToPay));
    const debtPayLabel = `\u041f\u043b\u0430\u0442\u0451\u0436 ${totalPayment} \u20bd: \u0434\u043e\u043b\u0433 ${debtToPay} \u20bd \u2192 \u043f\u043e\u0433\u0430\u0448\u0435\u043d${advanceAmount > 0 ? `, \u0430\u0432\u0430\u043d\u0441 ${advanceAmount} \u20bd` : ''}`;
    logAction('debt_payment', 'Платёж с приоритетом долга', debtPayLabel, clientId, 'client');
    console.log(`[PayWithDebtPriority] Client ${clientId}: total=${totalPayment}, debtPaid=${debtToPay}, advance=${advanceAmount}, remainingDebt=${newRemainingDebt}`);
    return { debtPaid: debtToPay, advancePaid: advanceAmount, remainingDebt: newRemainingDebt };
  }, [getClientTotalDebt, payMonthly, payClientDebt, logAction, shifts, currentUser, addTransaction, updateShiftExpected, addCashOperation, getShiftCashBalance, schedulePush]);

  const releaseWithDebtWarning = useCallback((sessionId: string): { hasDebt: boolean; clientDebt: number; clientName: string; sessionCarPlate: string } => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return { hasDebt: false, clientDebt: 0, clientName: '', sessionCarPlate: '' };
    const clientDebt = getClientTotalDebt(session.clientId);
    const client = clients.find(c => c.id === session.clientId);
    const car = cars.find(c => c.id === session.carId);
    return {
      hasDebt: clientDebt > 0,
      clientDebt,
      clientName: client?.name ?? '',
      sessionCarPlate: car?.plateNumber ?? '',
    };
  }, [sessions, clients, cars, getClientTotalDebt]);

  const getClientDebtInfo = useCallback((clientId: string): ClientDebt | null => {
    return clientDebts.find(c => c.clientId === clientId) ?? null;
  }, [clientDebts]);

  const calculateDebtByMethod = useCallback((clientId: string, _method: PaymentMethod): {
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
      s.status === 'active_debt' &&
      !s.cancelled
    );

    const details: Array<{ sessionId: string; days: number; rate: number; amount: number; serviceType: ServiceType }> = [];
    let accrualTotal = 0;

    for (const session of clientDebtSessions) {
      const sessionAccruals = dailyDebtAccruals.filter(a => a.parkingEntryId === session.id);
      if (sessionAccruals.length === 0) continue;

      const days = sessionAccruals.length;
      const storedAmount = roundMoney(sessionAccruals.reduce((s, a) => s + a.amount, 0));
      const rate = sessionAccruals[0]?.tariffRate ?? (session.lombardRateApplied ?? tariffs.lombardRate);

      accrualTotal += storedAmount;
      details.push({ sessionId: session.id, days, rate, amount: storedAmount, serviceType: session.serviceType });
    }

    const oldDebtsTotal = roundMoney(
      debts.filter(d => d.clientId === clientId && d.remainingAmount > 0)
        .reduce((s, d) => s + d.remainingAmount, 0)
    );

    const overstayTotal = overstayedSessionDebts[clientId] ?? 0;
    const overstayDetails = overstayedSessionDetails[clientId] ?? [];
    for (const od of overstayDetails) {
      details.push({ sessionId: od.sessionId, days: od.days, rate: od.rate, amount: od.amount, serviceType: od.serviceType });
    }

    return {
      total: roundMoney(accrualTotal + oldDebtsTotal + overstayTotal),
      details,
      oldDebtsTotal,
    };
  }, [sessions, dailyDebtAccruals, debts, tariffs, overstayedSessionDebts, overstayedSessionDetails]);

  const debtors = useMemo(() => {
    const oldDebtClientIds = new Set(activeDebts.map(d => d.clientId));
    const newDebtClientIds = new Set(clientDebts.filter(cd => cd.totalAmount > 0).map(cd => cd.clientId));
    const overstayClientIds = new Set(Object.keys(overstayedSessionDebts));
    const allClientIds = [...new Set([...oldDebtClientIds, ...newDebtClientIds, ...overstayClientIds])];

    return allClientIds.map(id => {
      const client = activeClients.find(c => c.id === id);
      const clientDebtsList = activeDebts.filter(d => d.clientId === id);
      const oldTotal = clientDebtsList.reduce((sum, d) => sum + d.remainingAmount, 0);
      const cd = clientDebts.find(c => c.clientId === id);
      const newTotal = cd ? cd.totalAmount : 0;
      const overstayTotal = overstayedSessionDebts[id] ?? 0;
      const totalDebt = roundMoney(oldTotal + newTotal + overstayTotal);
      const clientCars = activeCars.filter(c => c.clientId === id);
      return { client, debts: clientDebtsList, totalDebt, cars: clientCars, clientDebt: cd ?? null, overstayDebt: overstayTotal };
    }).filter(d => d.client && d.totalDebt > 0);
  }, [activeDebts, activeClients, activeCars, clientDebts, overstayedSessionDebts]);

  const todayStats = useMemo(() => {
    const todayTx = transactions.filter(t => isToday(t.date));
    const todayPaymentTx = todayTx.filter(t => (t.type === 'payment' || t.type === 'debt_payment') && t.amount > 0);
    const todayCancelTx = todayTx.filter(t => t.type === 'cancel_payment');
    const todayRefundTx = todayTx.filter(t => t.type === 'refund');
    const _cancelledAmount = todayCancelTx.reduce((s, t) => s + t.amount, 0);

    const cashToday = roundMoney(todayPaymentTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0));
    const cardToday = roundMoney(todayPaymentTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0));
    const cashCancelled = roundMoney(todayCancelTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0));
    const cardCancelled = roundMoney(todayCancelTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0));
    const cashRefunded = roundMoney(todayRefundTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0));
    const cardRefunded = roundMoney(todayRefundTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0));

    const netCash = roundMoney(cashToday - cashCancelled - cashRefunded);
    const netCard = roundMoney(cardToday - cardCancelled - cardRefunded);
    const oldDebtTotal = roundMoney(activeDebts.reduce((s, d) => s + d.remainingAmount, 0));
    const clientDebtTotal = roundMoney(clientDebts.reduce((s, cd) => s + cd.totalAmount, 0));
    const overstayTotal = roundMoney(Object.values(overstayedSessionDebts).reduce((s, v) => s + v, 0));
    const totalDebt = roundMoney(oldDebtTotal + clientDebtTotal + overstayTotal);
    const totalRefunds = roundMoney(cashRefunded + cardRefunded);

    return {
      carsOnParking: activeSessions.length,
      cashToday: netCash,
      cardToday: netCard,
      totalRevenue: roundMoney(netCash + netCard),
      debtorsCount: debtors.length,
      totalDebt,
      totalRefunds,
    };
  }, [transactions, activeDebts, activeSessions, debtors, clientDebts, overstayedSessionDebts]);

  const openShift = useCallback((operatorId: string, operatorName: string, carryOver: number = 0, role?: 'admin' | 'manager'): CashShift => {
    const operatorRole = role ?? (currentUser?.role === 'admin' ? 'admin' : 'manager');
    const existingOpen = shifts.find(s => s.status === 'open' && (s.operatorRole ?? 'manager') === operatorRole);
    if (existingOpen) {
      console.log(`[Shift] Already have open ${operatorRole} shift ${existingOpen.id}, returning existing`);
      return existingOpen;
    }
    shiftsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    console.log(`[Shift] Marked shifts dirty for ${COLLECTION_DIRTY_MS}ms`);
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
    const cashIncome = roundMoney(shiftTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0)
      - shiftCancelTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0)
      - shiftRefundTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0));
    const cardIncome = roundMoney(shiftTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0)
      - shiftCancelTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0)
      - shiftRefundTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0));
    const totalExpenses = roundMoney(expenses.filter(e => e.shiftId === shiftId).reduce((s, e) => s + e.amount, 0));
    const totalWithdrawals = roundMoney(withdrawals.filter(w => w.shiftId === shiftId).reduce((s, w) => s + w.amount, 0));
    const calculatedBalance = roundMoney(shift.carryOver + cashIncome - totalExpenses - totalWithdrawals);
    const discrepancy = roundMoney(actualCash - calculatedBalance);

    const closingSummary = {
      cashIncome,
      cardIncome,
      totalExpenses,
      totalWithdrawals,
      calculatedBalance,
      discrepancy,
    };

    const cashVariance = roundMoney(discrepancy);
    const cashVarianceType: 'none' | 'short' | 'over' = cashVariance < 0 ? 'short' : cashVariance > 0 ? 'over' : 'none';

    const closeNow = new Date().toISOString();
    setShifts(prev => prev.map(s =>
      s.id === shiftId ? {
        ...s,
        closedAt: closeNow,
        status: 'closed' as const,
        actualCash,
        notes,
        closingSummary,
        cashVariance,
        cashVarianceType,
        updatedAt: closeNow,
      } : s
    ));

    const varianceLabel = cashVarianceType === 'short'
      ? `Недостача ${Math.abs(cashVariance)} ₽`
      : cashVarianceType === 'over'
        ? `Излишек +${cashVariance} ₽`
        : 'Нет отклонения';
    shiftsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    console.log(`[Shift] Marked shifts dirty for ${COLLECTION_DIRTY_MS}ms (close)`);

    logAction('shift_close', 'Закрытие смены', `${shift.operatorName} (${shift.operatorRole === 'admin' ? 'админ' : 'менеджер'})\nОжидалось: ${calculatedBalance} ₽\nФакт: ${actualCash} ₽\nОтклонение: ${discrepancy} ₽ (${varianceLabel})`, shiftId, 'shift');
    schedulePush();
    console.log(`[Shift] Closed shift ${shiftId}, actual: ${actualCash}, calculated: ${calculatedBalance}, discrepancy: ${discrepancy}`);
  }, [shifts, transactions, expenses, withdrawals, schedulePush, logAction]);

  const addExpense = useCallback((amount: number, category: string, description: string, forceNegative?: boolean): { success: boolean; error?: string; expense?: Expense; wouldGoNegative?: boolean; currentBalance?: number } => {
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

      cashOpsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
      console.log(`[Expense] Marked cashOps dirty for ${COLLECTION_DIRTY_MS}ms`);
      const now = new Date().toISOString();
      const balanceBefore = targetShift ? getShiftCashBalance(targetShift) : (isUserAdmin ? getUnshiftedCashBalance() : 0);

      if (!isUserAdmin && targetShift && balanceBefore < amount) {
        console.log(`[Expense] Insufficient funds: balance=${balanceBefore}, expense=${amount}`);
        return { success: false, error: `Недостаточно средств в кассе. Остаток: ${balanceBefore} ₽, расход: ${amount} ₽. Можно провести максимум: ${balanceBefore} ₽`, currentBalance: balanceBefore };
      }

      const balanceAfter = roundMoney(balanceBefore - amount);

      if (isUserAdmin && balanceAfter < 0 && !forceNegative) {
        console.log(`[Expense] Admin warning: balance=${balanceBefore}, expense=${amount}, would go to ${balanceAfter}`);
        return { success: false, wouldGoNegative: true, currentBalance: balanceBefore, error: `Касса уйдёт в минус! Остаток: ${balanceBefore} ₽, после расхода: ${balanceAfter} ₽` };
      }

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
      const negativeNote = balanceAfter < 0 ? ' ⚠️ РАЗРЕШЁН МИНУС (админ)' : '';
      logAction('expense_add', `${roleLabel}Добавлен расход`, `${amount} ₽ — ${category}: ${description} (баланс: ${balanceBefore} → ${balanceAfter} ₽)${negativeNote}`, expense.id, 'expense');
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

    const filterByPeriodKey = <T>(items: T[], dateKey: keyof T): T[] => {
      if (!from && !to) return items;
      return items.filter(item => {
        const d = new Date(item[dateKey] as unknown as string);
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

    const periodSalaryAdvances = filterByPeriodKey(salaryAdvances, 'issuedAt').filter(a => !a.source || a.source === 'admin');
    const totalSalaryAdvances = roundMoney(periodSalaryAdvances.reduce((s, a) => s + a.amount, 0));

    const periodSalaryPayments = filterByPeriodKey(salaryPayments, 'paidAt').filter(p => !p.source || p.source === 'admin');
    const totalSalaryPaid = roundMoney(periodSalaryPayments.filter(p => p.netPaid > 0).reduce((s, p) => s + p.netPaid, 0));

    const totalSalaryExpenses = roundMoney(totalSalaryAdvances + totalSalaryPaid);

    const balance = roundMoney(cardIncome + cashFromManager - totalAdminExpenses - totalSalaryExpenses);

    const periodOps = filterByPeriod(adminCashOperations);

    return {
      cardIncome,
      cashFromManager,
      totalAdminExpenses,
      totalSalaryAdvances,
      totalSalaryPaid,
      totalSalaryExpenses,
      balance,
      adminExpenses: periodAdminExpenses,
      operations: periodOps,
      salaryAdvances: periodSalaryAdvances,
      salaryPayments: periodSalaryPayments,
    };
  }, [transactions, withdrawals, adminExpenses, adminCashOperations, salaryAdvances, salaryPayments]);

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

  const toggleDeepCleaning = useCallback((shiftId: string, value: boolean) => {
    const now = new Date().toISOString();
    const shift = scheduledShifts.find(s => s.id === shiftId);
    if (!shift) return;

    const isOwn = shift.operatorId === currentUser?.id;
    const isAdmin = currentUser?.role === 'admin';
    if (!isOwn && !isAdmin) {
      console.log('[ScheduledShift] Permission denied: only admin can toggle deep cleaning on other shifts');
      return;
    }

    setScheduledShifts(prev => prev.map(s =>
      s.id === shiftId ? { ...s, isDeepCleaning: value, updatedAt: now } : s
    ));

    const actionLabel = value ? 'пометил смену как \'генеральная уборка\'' : 'снял отметку \'генеральная уборка\' со смены';
    logAction('deep_cleaning_toggle', 'Генеральная уборка', `${currentUser?.name ?? 'Неизвестно'} ${actionLabel} ${shift.startTime}–${shift.endTime} (${shift.operatorName}, ${shift.date})`, shiftId, 'schedule');
    schedulePush();
    console.log(`[ScheduledShift] Deep cleaning toggled: ${shiftId} = ${value}`);
  }, [scheduledShifts, currentUser, logAction, schedulePush]);

  const FALLBACK_CLEANUP_CHECKLIST: CleanupChecklistItem[] = [
    { id: '1', label: 'Приёмная (столы, стулья, пол)', completed: false },
    { id: '2', label: 'Парковка (навес, разметка, мусор)', completed: false },
    { id: '3', label: 'Санузел (ванная, туалет, зеркала)', completed: false },
    { id: '4', label: 'Кухня (холодильник, плита, раковина)', completed: false },
    { id: '5', label: 'Окна и витрины', completed: false },
    { id: '6', label: 'Мусор на улице', completed: false },
    { id: '7', label: 'Финальная проверка', completed: false },
  ];

  const getChecklistFromTemplate = useCallback((): CleanupChecklistItem[] => {
    if (cleanupChecklistTemplate.length === 0) return FALLBACK_CLEANUP_CHECKLIST;
    const sorted = [...cleanupChecklistTemplate].sort((a, b) => a.order - b.order);
    return sorted.map(t => ({ id: t.id, label: t.label, completed: false }));
  }, [cleanupChecklistTemplate]);

  const getCleanupChecklist = useCallback((shiftId: string): CleanupChecklistItem[] => {
    const shift = scheduledShifts.find(s => s.id === shiftId);
    if (!shift) return getChecklistFromTemplate();
    return shift.cleanupChecklist ?? getChecklistFromTemplate();
  }, [scheduledShifts, getChecklistFromTemplate]);

  const getCleanupTemplate = useCallback((): CleanupTemplateItem[] => {
    if (cleanupChecklistTemplate.length === 0) {
      return FALLBACK_CLEANUP_CHECKLIST.map((item, idx) => ({
        id: item.id,
        label: item.label,
        order: idx,
      }));
    }
    return [...cleanupChecklistTemplate].sort((a, b) => a.order - b.order);
  }, [cleanupChecklistTemplate]);

  const updateCleanupTemplate = useCallback((items: CleanupTemplateItem[]) => {
    if (currentUser?.role !== 'admin') {
      console.log('[CleanupTemplate] BLOCKED: only admin can edit template');
      return;
    }
    const ordered = items.map((item, idx) => ({ ...item, order: idx }));
    setCleanupChecklistTemplate(ordered);
    logAction('deep_cleaning_toggle', 'Обновлён шаблон чек-листа уборки', `Пунктов: ${ordered.length}`);
    schedulePush();
    console.log(`[CleanupTemplate] Updated: ${ordered.length} items`);
  }, [currentUser, logAction, schedulePush]);

  const saveCleanupChecklist = useCallback((shiftId: string, checklist: CleanupChecklistItem[]) => {
    const now = new Date().toISOString();
    setScheduledShifts(prev => prev.map(s =>
      s.id === shiftId ? { ...s, cleanupChecklist: checklist, updatedAt: now } : s
    ));
    schedulePush();
    console.log(`[Cleanup] Checklist saved for shift ${shiftId}`);
  }, [schedulePush]);

  const completeCleanup = useCallback((shiftId: string) => {
    const now = new Date().toISOString();
    const shift = scheduledShifts.find(s => s.id === shiftId);
    if (!shift) return;

    setScheduledShifts(prev => prev.map(s =>
      s.id === shiftId ? {
        ...s,
        cleanupCompleted: true,
        cleanupCompletedAt: now,
        cleanupCompletedBy: currentUser?.id ?? 'unknown',
        cleanupCompletedByName: currentUser?.name ?? 'Неизвестно',
        updatedAt: now,
      } : s
    ));

    logAction('cleanup_complete', 'Уборка выполнена', `${currentUser?.name ?? 'Неизвестно'} отметил генеральную уборку выполненной (смена ${shift.date}, ${shift.startTime}–${shift.endTime}, ${shift.operatorName})`, shiftId, 'schedule');
    schedulePush();
    console.log(`[Cleanup] Completed for shift ${shiftId} by ${currentUser?.name}`);
  }, [scheduledShifts, currentUser, logAction, schedulePush]);

  const getTodayCleaningShift = useCallback((): ScheduledShift | null => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const hasOpenShift = shifts.some(s => s.status === 'open');
    if (!hasOpenShift) return null;

    const cleaningShift = scheduledShifts.find(s =>
      s.date === todayStr &&
      s.isDeepCleaning === true &&
      !(s as any).deleted &&
      !s.cleanupCompleted
    );
    return cleaningShift ?? null;
  }, [scheduledShifts, shifts]);

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
    if (isLoaded && currentUser && !restoreInProgressRef.current) {
      const restoreGrace = restoreFinishedAtRef.current > 0 && (Date.now() - restoreFinishedAtRef.current) < RESTORE_GRACE_MS;
      if (restoreGrace) {
        console.log('[Violations] Skipping ensureCurrentMonth during restore grace period');
        return;
      }
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
    console.log('[Backup] createBackup() called');
    const snapshot = latestDataRef.current;

    const safeArr = (val: any): any[] => {
      try {
        if (Array.isArray(val)) return val;
      } catch {}
      return [];
    };

    const safeObj = (val: any, fallback: any): any => {
      try {
        if (val && typeof val === 'object' && !Array.isArray(val)) return val;
      } catch {}
      return fallback;
    };

    const dataPayload: Record<string, any> = {
      clients: safeArr(snapshot?.clients ?? clients),
      cars: safeArr(snapshot?.cars ?? cars),
      sessions: safeArr(snapshot?.sessions ?? sessions),
      subscriptions: safeArr(snapshot?.subscriptions ?? subscriptions),
      payments: safeArr(snapshot?.payments ?? payments),
      debts: safeArr(snapshot?.debts ?? debts),
      transactions: safeArr(snapshot?.transactions ?? transactions),
      tariffs: safeObj(snapshot?.tariffs ?? tariffs, EMPTY_DATA.tariffs),
      shifts: safeArr(snapshot?.shifts ?? shifts),
      expenses: safeArr(snapshot?.expenses ?? expenses),
      withdrawals: safeArr(snapshot?.withdrawals ?? withdrawals),
      users: safeArr(snapshot?.users ?? users),
      deletedClientIds: safeArr(snapshot?.deletedClientIds ?? deletedClientIds),
      scheduledShifts: safeArr(snapshot?.scheduledShifts ?? scheduledShifts),
      actionLogs: safeArr(snapshot?.actionLogs ?? actionLogs),
      adminExpenses: safeArr(snapshot?.adminExpenses ?? adminExpenses),
      adminCashOperations: safeArr(snapshot?.adminCashOperations ?? adminCashOperations),
      expenseCategories: safeArr(snapshot?.expenseCategories ?? expenseCategories),
      dailyDebtAccruals: safeArr(snapshot?.dailyDebtAccruals ?? dailyDebtAccruals),
      clientDebts: safeArr(snapshot?.clientDebts ?? clientDebts),
      cashOperations: safeArr(snapshot?.cashOperations ?? cashOperations),
      teamViolations: safeArr(snapshot?.teamViolations ?? teamViolations),
      salaryAdvances: safeArr(snapshot?.salaryAdvances ?? salaryAdvances),
      salaryPayments: safeArr(snapshot?.salaryPayments ?? salaryPayments),
      cleanupChecklistTemplate: safeArr(snapshot?.cleanupChecklistTemplate ?? cleanupChecklistTemplate),
    };

    const backupData = {
      formatId: 'park_manager_backup',
      version: 2,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name ?? 'unknown',
      data: dataPayload,
    };

    console.log(`[Backup] Prepared backup: clients=${dataPayload.clients.length}, cars=${dataPayload.cars.length}, sessions=${dataPayload.sessions.length}`);

    const safeReplacer = (_key: string, value: any): any => {
      if (typeof value === 'bigint') return Number(value);
      if (value === undefined) return null;
      if (typeof value === 'function') return undefined;
      if (typeof value === 'number' && !isFinite(value)) return null;
      return value;
    };

    const jsonResult = JSON.stringify(backupData, safeReplacer);
    console.log(`[Backup] Created backup JSON: ${jsonResult.length} bytes`);
    return jsonResult;
  }, [currentUser, clients, cars, sessions, subscriptions, payments, debts, transactions, tariffs, shifts, expenses, withdrawals, users, deletedClientIds, scheduledShifts, actionLogs, adminExpenses, adminCashOperations, expenseCategories, dailyDebtAccruals, clientDebts, cashOperations, teamViolations, salaryAdvances, salaryPayments]);

  const getPreRestoreBackup = useCallback((): string => {
    const snapshot = latestDataRef.current;
    const backupData = {
      formatId: 'park_manager_backup',
      version: 2,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name ?? 'system',
      isPreRestore: true,
      data: {
        clients: snapshot.clients,
        cars: snapshot.cars,
        sessions: snapshot.sessions,
        subscriptions: snapshot.subscriptions,
        payments: snapshot.payments,
        debts: snapshot.debts,
        transactions: snapshot.transactions,
        tariffs: snapshot.tariffs,
        shifts: snapshot.shifts,
        expenses: snapshot.expenses,
        withdrawals: snapshot.withdrawals,
        users: snapshot.users,
        deletedClientIds: snapshot.deletedClientIds,
        scheduledShifts: snapshot.scheduledShifts,
        actionLogs: snapshot.actionLogs,
        adminExpenses: snapshot.adminExpenses,
        adminCashOperations: snapshot.adminCashOperations,
        expenseCategories: snapshot.expenseCategories,
        dailyDebtAccruals: snapshot.dailyDebtAccruals,
        clientDebts: snapshot.clientDebts,
        cashOperations: snapshot.cashOperations,
        teamViolations: snapshot.teamViolations,
        salaryAdvances: snapshot.salaryAdvances,
        salaryPayments: snapshot.salaryPayments,
        cleanupChecklistTemplate: snapshot.cleanupChecklistTemplate,
      },
    };
    return JSON.stringify(backupData);
  }, [currentUser]);

  const restoreBackup = useCallback(async (jsonString: string): Promise<{ success: boolean; error?: string; preRestoreBackup?: string }> => {
    restoreInProgressRef.current = true;
    console.log('[Restore] === RESTORE STARTED, sync blocked ===');
    console.log(`[Restore] Input JSON length: ${jsonString?.length ?? 0}`);

    if (!jsonString || typeof jsonString !== 'string' || jsonString.trim().length === 0) {
      restoreInProgressRef.current = false;
      return { success: false, error: 'Файл пустой или не содержит текста.' };
    }

    let cleanInput = jsonString.trim();
    if (cleanInput.charCodeAt(0) === 0xFEFF) cleanInput = cleanInput.slice(1);
    cleanInput = cleanInput.replace(/^\s+/, '');

    if (cleanInput.startsWith('<!') || cleanInput.startsWith('<html') || cleanInput.startsWith('<HTML')) {
      restoreInProgressRef.current = false;
      return { success: false, error: 'Файл содержит HTML вместо JSON.\n\nВозможно, ссылка на бэкап вела на страницу ошибки или авторизации, а не на сам файл.\n\nСкачайте файл бэкапа вручную и загрузите локальный .json файл.\n\nБаза данных НЕ затронута.' };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(cleanInput);
    } catch (parseErr1) {
      console.log('[Restore] First JSON.parse failed, trying to fix common issues...');
      try {
        if (cleanInput.startsWith('"') && cleanInput.endsWith('"')) {
          const unescaped = JSON.parse(cleanInput) as string;
          if (typeof unescaped === 'string') {
            parsed = JSON.parse(unescaped);
            console.log('[Restore] Successfully parsed double-encoded JSON');
          }
        } else {
          throw parseErr1;
        }
      } catch {
        restoreInProgressRef.current = false;
        const snippet = cleanInput.substring(0, 120);
        const errMsg = parseErr1 instanceof Error ? parseErr1.message : String(parseErr1);
        console.log('[Restore] JSON parse failed:', errMsg, 'snippet:', snippet);
        console.log('[Restore] First 20 char codes:', Array.from(cleanInput.substring(0, 20)).map(c => c.charCodeAt(0)).join(','));

        let hint = '';
        if (snippet.startsWith('<')) {
          hint = '\n\nФайл похож на XML/HTML — убедитесь, что загружаете именно .json файл бэкапа.';
        } else if (!snippet.startsWith('{') && !snippet.startsWith('[')) {
          hint = `\n\nФайл начинается с неожиданных символов.\nНачало: «${snippet.substring(0, 60)}…»\nКоды: ${Array.from(snippet.substring(0, 10)).map(c => c.charCodeAt(0)).join(',')}`;
        } else {
          hint = `\n\nНачало файла: «${snippet.substring(0, 80)}…»`;
        }

        return { success: false, error: `Не удалось разобрать файл как JSON.\n\nОшибка парсинга: ${errMsg}${hint}\n\nБаза данных НЕ затронута.` };
      }
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      restoreInProgressRef.current = false;
      return { success: false, error: `Файл содержит ${Array.isArray(parsed) ? 'массив' : typeof parsed}, а ожидается объект бэкапа ПаркМенеджера.\n\nБаза данных НЕ затронута.` };
    }

    const backupVersion = detectBackupVersion(parsed);
    console.log(`[Restore] Detected backup version: ${backupVersion}, keys: ${Object.keys(parsed).slice(0, 15).join(', ')}`);

    if (backupVersion === -1) {
      restoreInProgressRef.current = false;
      const topKeys = Object.keys(parsed).slice(0, 15).join(', ');
      console.log('[Restore] Unrecognized format, top keys:', topKeys);
      return { success: false, error: `Неизвестный формат файла.\n\nОжидается бэкап ПаркМенеджера (новый или старый формат) с полями: data, clients, cars и др.\n\nВаш файл содержит поля: ${topKeys}\n\nЕсли это старый бэкап — возможно, формат слишком отличается от поддерживаемых версий.\n\nБаза данных НЕ затронута.` };
    }

    const migration = migrateBackupData(parsed);

    if (migration.migratedTo === -1) {
      restoreInProgressRef.current = false;
      console.log('[Restore] Migration failed:', migration.warnings);
      return { success: false, error: `Не удалось обработать файл бэкапа.\n\n${migration.warnings.join('\n')}\n\nБаза данных НЕ затронута.` };
    }

    const d = migration.data;

    if (!Array.isArray(d.clients) || d.clients.length === 0) {
      const hasAnything = Array.isArray(d.cars) && d.cars.length > 0;
      if (!hasAnything) {
        restoreInProgressRef.current = false;
        return { success: false, error: 'Файл бэкапа не содержит данных (нет клиентов и машин).\n\nБаза данных НЕ затронута.' };
      }
    }

    if (migration.warnings.length > 0) {
      console.log(`[Restore] Migration warnings: ${migration.warnings.join('; ')}`);
    }

    console.log(`[Restore] Backup migrated: v${migration.detectedVersion} → v${migration.migratedTo}, clients=${(d.clients ?? []).length}, cars=${(d.cars ?? []).length}, sessions=${(d.sessions ?? []).length}, created=${parsed.createdAt ?? 'unknown'}`);

    let preRestoreBackupJson: string;
    try {
      preRestoreBackupJson = getPreRestoreBackup();
      console.log('[Restore] Pre-restore backup created');
    } catch (preErr) {
      console.log('[Restore] Failed to create pre-restore backup:', preErr);
      preRestoreBackupJson = '';
    }

    try {
      await AsyncStorage.setItem(STORAGE_KEY + '_pre_restore', preRestoreBackupJson);
      await AsyncStorage.setItem(STORAGE_KEY + '_pre_restore_date', new Date().toISOString());
      console.log('[Restore] Pre-restore backup saved to AsyncStorage');
    } catch (e) {
      console.log('[Restore] Failed to save pre-restore backup to AsyncStorage:', e);
    }

    if (pushTimerRef.current) { clearTimeout(pushTimerRef.current); pushTimerRef.current = null; }
    if (pushRetryTimerRef.current) { clearTimeout(pushRetryTimerRef.current); pushRetryTimerRef.current = null; }
    localDirtyRef.current = false;
    pushingRef.current = false;

    const restorePayload = {
      clients: Array.isArray(d.clients) ? d.clients : [],
      cars: Array.isArray(d.cars) ? d.cars : [],
      sessions: Array.isArray(d.sessions) ? d.sessions : [],
      subscriptions: Array.isArray(d.subscriptions) ? d.subscriptions : [],
      payments: Array.isArray(d.payments) ? d.payments : [],
      debts: Array.isArray(d.debts) ? d.debts : [],
      transactions: Array.isArray(d.transactions) ? d.transactions : [],
      tariffs: (d.tariffs && typeof d.tariffs === 'object' && !Array.isArray(d.tariffs)) ? d.tariffs : EMPTY_DATA.tariffs,
      shifts: Array.isArray(d.shifts) ? d.shifts : [],
      expenses: Array.isArray(d.expenses) ? d.expenses : [],
      withdrawals: Array.isArray(d.withdrawals) ? d.withdrawals : [],
      users: (Array.isArray(d.users) && d.users.length > 0) ? d.users : latestDataRef.current.users,
      deletedClientIds: Array.isArray(d.deletedClientIds) ? d.deletedClientIds : [],
      scheduledShifts: Array.isArray(d.scheduledShifts) ? d.scheduledShifts : [],
      actionLogs: Array.isArray(d.actionLogs) ? d.actionLogs : [],
      adminExpenses: Array.isArray(d.adminExpenses) ? d.adminExpenses : [],
      adminCashOperations: Array.isArray(d.adminCashOperations) ? d.adminCashOperations : [],
      expenseCategories: Array.isArray(d.expenseCategories) ? d.expenseCategories : [],
      dailyDebtAccruals: Array.isArray(d.dailyDebtAccruals) ? d.dailyDebtAccruals : [],
      clientDebts: Array.isArray(d.clientDebts) ? d.clientDebts : [],
      cashOperations: Array.isArray(d.cashOperations) ? d.cashOperations : [],
      teamViolations: Array.isArray(d.teamViolations) ? d.teamViolations : [],
      salaryAdvances: Array.isArray(d.salaryAdvances) ? d.salaryAdvances : [],
      salaryPayments: Array.isArray(d.salaryPayments) ? d.salaryPayments : [],
      cleanupChecklistTemplate: Array.isArray(d.cleanupChecklistTemplate) ? d.cleanupChecklistTemplate : [],
    };

    let serverResetSuccess = false;
    let serverError = '';
    restoreServerOkRef.current = false;
    try {
      const result = await vanillaTrpc.parking.resetData.mutate(restorePayload as any) as any;
      lastSyncedVersionRef.current = result.version;
      restoreEpochRef.current = result.restoreEpoch;
      localDirtyRef.current = false;
      serverResetSuccess = true;
      restoreServerOkRef.current = true;
      console.log(`[Restore] Server reset OK, version: ${result.version}, epoch: ${result.restoreEpoch}`);
    } catch (e) {
      serverError = e instanceof Error ? e.message : String(e);
      console.log('[Restore] Server reset failed, trying pushData fallback:', serverError);
      try {
        const fallbackResult = await vanillaTrpc.parking.pushData.mutate(restorePayload as any) as any;
        lastSyncedVersionRef.current = fallbackResult.version;
        restoreEpochRef.current = fallbackResult.restoreEpoch ?? restoreEpochRef.current;
        localDirtyRef.current = false;
        serverResetSuccess = true;
        restoreServerOkRef.current = true;
        console.log(`[Restore] Fallback push OK, version: ${fallbackResult.version}`);
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
    setSalaryAdvances(restorePayload.salaryAdvances);
    setSalaryPayments(restorePayload.salaryPayments);
    setCleanupChecklistTemplate(restorePayload.cleanupChecklistTemplate ?? []);

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(restorePayload));
      console.log('[Restore] AsyncStorage updated with restored data');
    } catch (e) {
      console.log('[Restore] AsyncStorage save failed:', e);
    }

    console.log('[Restore] === RESTORE COMPLETED ===');

    restoreInProgressRef.current = false;
    restoreFinishedAtRef.current = Date.now();

    setTimeout(() => {
      if (pushTimerRef.current) { clearTimeout(pushTimerRef.current); pushTimerRef.current = null; }
      if (pushRetryTimerRef.current) { clearTimeout(pushRetryTimerRef.current); pushRetryTimerRef.current = null; }

      if (restoreServerOkRef.current) {
        if (localDirtyRef.current) {
          console.log('[Restore] Sync unblocked after delay (5s), server was OK but local changes detected — pushing');
          void pushToServer();
        } else {
          console.log('[Restore] Sync unblocked after delay (5s), server was OK, no local changes');
          void utils.parking.getData.invalidate();
        }
      } else {
        console.log('[Restore] Sync unblocked after delay (5s), server push FAILED — forcing re-push of restored data');
        localDirtyRef.current = true;
        localChangeCounterRef.current++;
        void pushToServer();
      }
    }, 5000);

    void utils.parking.getData.invalidate();

    const stats = {
      clients: restorePayload.clients.length,
      cars: restorePayload.cars.length,
      sessions: restorePayload.sessions.length,
      payments: restorePayload.payments.length,
    };
    const migrationInfo = migration.detectedVersion < 2 ? `, миграция: v${migration.detectedVersion}→v${migration.migratedTo}` : '';
    const warningInfo = migration.warnings.length > 0 ? `, предупреждения: ${migration.warnings.length}` : '';
    logAction('backup_restore', 'Восстановление из резервной копии',
      `Дата бэкапа: ${parsed.createdAt ?? '—'}, автор: ${parsed.createdBy ?? '—'}, ` +
      `клиентов: ${stats.clients}, машин: ${stats.cars}, заездов: ${stats.sessions}, ` +
      `оплат: ${stats.payments}, сервер: ${serverResetSuccess ? 'ОК' : 'ОШИБКА'}${migrationInfo}${warningInfo}`);

    console.log(`[Restore] Stats: ${JSON.stringify(stats)}, serverOk: ${serverResetSuccess}`);

    const migrationWarningText = migration.warnings.length > 0
      ? `\n\nПримечания миграции:\n${migration.warnings.map(w => `• ${w}`).join('\n')}`
      : '';

    if (!serverResetSuccess) {
      localDirtyRef.current = true;
      schedulePush();
      return {
        success: true,
        error: `Данные восстановлены локально, но синхронизация с сервером не удалась (${serverError}). Будет повторная попытка.${migrationWarningText}`,
        preRestoreBackup: preRestoreBackupJson,
      };
    }

    if (migrationWarningText) {
      return { success: true, error: `Данные успешно восстановлены.${migrationWarningText}`, preRestoreBackup: preRestoreBackupJson };
    }

    return { success: true, preRestoreBackup: preRestoreBackupJson };
  }, [schedulePush, pushToServer, utils, logAction, getPreRestoreBackup]);

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
    setSalaryAdvances([]);
    setSalaryPayments([]);
    setCleanupChecklistTemplate([]);

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
      salaryAdvances: [] as any[],
      salaryPayments: [] as any[],
      cleanupChecklistTemplate: [] as any[],
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

  const getAdminFinanceBalance = useCallback((): { cash: number; card: number; total: number } => {
    const allCardIncome = roundMoney(
      transactions.filter(t => (t.type === 'payment' || t.type === 'debt_payment') && t.amount > 0 && t.method === 'card')
        .reduce((s, t) => s + t.amount, 0)
      - transactions.filter(t => t.type === 'cancel_payment' && t.method === 'card').reduce((s, t) => s + t.amount, 0)
      - transactions.filter(t => t.type === 'refund' && t.method === 'card').reduce((s, t) => s + t.amount, 0)
    );
    const cashFromManagers = roundMoney(withdrawals.reduce((s, w) => s + w.amount, 0));

    const adminSourcedAdvances = salaryAdvances.filter(a => !a.source || a.source === 'admin');
    const salaryAdvanceCash = roundMoney(
      adminSourcedAdvances.filter(a => !a.method || a.method === 'cash').reduce((s, a) => s + a.amount, 0)
    );
    const salaryAdvanceCard = roundMoney(
      adminSourcedAdvances.filter(a => a.method === 'card').reduce((s, a) => s + a.amount, 0)
    );

    const adminSourcedPayments = salaryPayments.filter(p => !p.source || p.source === 'admin');
    const salaryPayCash = roundMoney(
      adminSourcedPayments.filter(p => p.netPaid > 0 && p.method === 'cash').reduce((s, p) => s + p.netPaid, 0)
    );
    const salaryPayCard = roundMoney(
      adminSourcedPayments.filter(p => p.netPaid > 0 && p.method === 'card').reduce((s, p) => s + p.netPaid, 0)
    );

    const cashBalance = roundMoney(
      cashFromManagers
      - adminExpenses.filter(e => e.method === 'cash').reduce((s, e) => s + e.amount, 0)
      - salaryAdvanceCash
      - salaryPayCash
    );
    const cardBalance = roundMoney(
      allCardIncome
      - adminExpenses.filter(e => e.method === 'card').reduce((s, e) => s + e.amount, 0)
      - salaryAdvanceCard
      - salaryPayCard
    );
    return { cash: cashBalance, card: cardBalance, total: roundMoney(cashBalance + cardBalance) };
  }, [transactions, withdrawals, adminExpenses, salaryAdvances, salaryPayments]);

  const issueSalaryAdvance = useCallback((employeeId: string, employeeName: string, amount: number, comment: string, forceNegative?: boolean, method?: PaymentMethod, source?: 'admin' | 'manager_shift'): { success: boolean; error?: string; wouldGoNegative?: boolean; currentBalance?: number } => {
    if (currentUser?.role !== 'admin') {
      console.log(`[SalaryAdvance] BLOCKED: user ${currentUser?.name} (role=${currentUser?.role}) attempted salary advance`);
      return { success: false, error: 'Операцию может выполнить только администратор' };
    }
    amount = roundMoney(amount);
    if (amount <= 0) return { success: false, error: 'Сумма должна быть больше 0' };
    salaryDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    cashOpsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    console.log(`[SalaryAdvance] Marked salary+cashOps dirty for ${COLLECTION_DIRTY_MS}ms`);
    const effectiveMethod: PaymentMethod = method ?? 'cash';
    const effectiveSource = source ?? 'admin';
    const now = new Date().toISOString();

    let balanceBefore: number;
    let balanceAfter: number;
    let sourceLabel: string;
    let shiftIdForOp: string | null = null;

    if (effectiveSource === 'manager_shift') {
      const managerShift = shifts.find(s => s.status === 'open' && s.operatorRole !== 'admin') ?? shifts.find(s => s.status === 'open');
      if (!managerShift) {
        return { success: false, error: 'Нет открытой смены менеджера для списания' };
      }
      shiftIdForOp = managerShift.id;
      balanceBefore = getShiftCashBalance(managerShift);
      balanceAfter = roundMoney(balanceBefore - amount);
      sourceLabel = `касса менеджера (${managerShift.operatorName})`;

      if (balanceAfter < 0 && !forceNegative) {
        console.log(`[SalaryAdvance] Would go negative on manager shift: balance=${balanceBefore}, amount=${amount}`);
        return { success: false, wouldGoNegative: true, currentBalance: balanceBefore, error: `Недостаточно средств в кассе менеджера! Остаток: ${balanceBefore} ₽, после выдачи: ${balanceAfter} ₽` };
      }
    } else {
      const adminFinBal = getAdminFinanceBalance();
      balanceBefore = effectiveMethod === 'cash' ? adminFinBal.cash : adminFinBal.card;
      balanceAfter = roundMoney(balanceBefore - amount);
      sourceLabel = `финансы админа (${effectiveMethod === 'cash' ? 'наличные' : 'безнал'})`;

      if (balanceAfter < 0 && !forceNegative) {
        console.log(`[SalaryAdvance] Would go negative: adminBalance(${effectiveMethod})=${balanceBefore}, amount=${amount}`);
        return { success: false, wouldGoNegative: true, currentBalance: balanceBefore, error: `Недостаточно средств! Остаток (${effectiveMethod === 'cash' ? 'нал' : 'безнал'}): ${balanceBefore} ₽, после выдачи: ${balanceAfter} ₽` };
      }
    }

    const advance: SalaryAdvance = {
      id: generateId(),
      employeeId,
      employeeName,
      amount: roundMoney(amount),
      remainingAmount: roundMoney(amount),
      comment,
      issuedBy: currentUser?.id ?? 'unknown',
      issuedByName: currentUser?.name ?? 'Неизвестно',
      issuedAt: now,
      updatedAt: now,
      source: effectiveSource,
      method: effectiveMethod,
    };
    setSalaryAdvances(prev => [advance, ...prev]);

    if (effectiveSource === 'manager_shift') {
      const managerShift = shifts.find(s => s.id === shiftIdForOp);
      if (managerShift) {
        updateShiftExpected(managerShift.id, -amount);
      }
      const expenseEntry: Expense = {
        id: generateId(),
        amount,
        category: 'Долг под ЗП',
        description: `Долг под ЗП: ${employeeName} — ${amount} ₽${comment ? ` (${comment})` : ''}`,
        operatorId: currentUser?.id ?? 'unknown',
        operatorName: currentUser?.name ?? 'Неизвестно',
        date: now,
        shiftId: shiftIdForOp,
        method: 'cash',
      };
      setExpenses(prev => [expenseEntry, ...prev]);

      addTransaction({
        clientId: '',
        carId: '',
        type: 'manager_expense',
        amount,
        method: 'cash',
        date: now,
        description: `Долг под ЗП (касса менеджера): ${employeeName} — ${amount} ₽${comment ? ` (${comment})` : ''}`,
      });
    } else {
      const adminOp: AdminCashOperation = {
        id: generateId(),
        type: 'admin_expense',
        amount,
        method: effectiveMethod,
        description: `Долг под ЗП: ${employeeName} — ${amount} ₽${comment ? ` (${comment})` : ''}`,
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
        method: effectiveMethod,
        date: now,
        description: `Долг под ЗП (${sourceLabel}): ${employeeName} — ${amount} ₽${comment ? ` (${comment})` : ''}`,
      });
    }

    addCashOperation({
      type: 'salary_advance',
      amount,
      category: 'Долг под ЗП',
      description: `Выдано в долг под ЗП (${sourceLabel}): ${employeeName} — ${amount} ₽${comment ? ` (${comment})` : ''}`,
      method: effectiveMethod,
      shiftId: shiftIdForOp,
      balanceBefore,
      balanceAfter,
      relatedEntityId: advance.id,
      relatedEntityType: 'salary_advance',
    });

    const negativeNote = balanceAfter < 0 ? ' ⚠️ РАЗРЕШЁН МИНУС (админ)' : '';
    logAction('salary_advance_issue', 'Выдано в долг под ЗП', `${employeeName}: ${amount} ₽, ${sourceLabel}${comment ? `, комментарий: ${comment}` : ''} (${balanceBefore} → ${balanceAfter} ₽)${negativeNote}`, advance.id, 'salary_advance');
    schedulePush();
    console.log(`[SalaryAdvance] Issued ${amount} to ${employeeName} from ${sourceLabel}, method=${effectiveMethod}, id=${advance.id}, balance: ${balanceBefore} → ${balanceAfter}`);
    return { success: true };
  }, [currentUser, getAdminFinanceBalance, getShiftCashBalance, shifts, updateShiftExpected, addTransaction, addCashOperation, logAction, schedulePush]);

  const paySalary = useCallback((employeeId: string, employeeName: string, grossAmount: number, method: PaymentMethod, comment: string, forceNegative?: boolean, source?: 'admin' | 'manager_shift'): { success: boolean; error?: string; wouldGoNegative?: boolean; currentBalance?: number; netPaid?: number } => {
    if (currentUser?.role !== 'admin') {
      console.log(`[SalaryPayment] BLOCKED: user ${currentUser?.name} (role=${currentUser?.role}) attempted salary payment`);
      return { success: false, error: 'Операцию может выполнить только администратор' };
    }
    grossAmount = roundMoney(grossAmount);
    if (grossAmount <= 0) return { success: false, error: 'Сумма должна быть больше 0' };
    salaryDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    cashOpsDirtyUntilRef.current = Date.now() + COLLECTION_DIRTY_MS;
    console.log(`[SalaryPayment] Marked salary+cashOps dirty for ${COLLECTION_DIRTY_MS}ms`);
    const effectiveSource = source ?? 'admin';
    const now = new Date().toISOString();

    const employeeAdvances = salaryAdvances.filter(a => a.employeeId === employeeId && a.remainingAmount > 0)
      .sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime());
    const totalDebt = roundMoney(employeeAdvances.reduce((s, a) => s + a.remainingAmount, 0));

    const debtDeducted = roundMoney(Math.min(grossAmount, totalDebt));
    const netPaid = roundMoney(grossAmount - debtDeducted);

    let shiftIdForOp: string | null = null;
    let sourceLabel: string;

    if (effectiveSource === 'manager_shift') {
      const managerShift = shifts.find(s => s.status === 'open' && s.operatorRole !== 'admin') ?? shifts.find(s => s.status === 'open');
      if (!managerShift) {
        return { success: false, error: 'Нет открытой смены менеджера для списания' };
      }
      shiftIdForOp = managerShift.id;
      sourceLabel = `касса менеджера (${managerShift.operatorName})`;

      if (netPaid > 0) {
        const balanceBefore = getShiftCashBalance(managerShift);
        const balanceAfter = roundMoney(balanceBefore - netPaid);
        if (balanceAfter < 0 && !forceNegative) {
          console.log(`[SalaryPayment] Would go negative on manager shift: balance=${balanceBefore}, netPaid=${netPaid}`);
          return { success: false, wouldGoNegative: true, currentBalance: balanceBefore, netPaid, error: `Недостаточно средств в кассе менеджера! Остаток: ${balanceBefore} ₽, к выдаче: ${netPaid} ₽, будет: ${balanceAfter} ₽` };
        }
      }
    } else {
      sourceLabel = `финансы админа (${method === 'cash' ? 'наличные' : 'безнал'})`;

      if (netPaid > 0) {
        const adminFinBal = getAdminFinanceBalance();
        const balanceBefore = method === 'cash' ? adminFinBal.cash : adminFinBal.card;
        const balanceAfter = roundMoney(balanceBefore - netPaid);
        if (balanceAfter < 0 && !forceNegative) {
          console.log(`[SalaryPayment] Would go negative: adminBalance(${method})=${balanceBefore}, netPaid=${netPaid}`);
          return { success: false, wouldGoNegative: true, currentBalance: balanceBefore, netPaid, error: `Недостаточно средств! Остаток (${method === 'cash' ? 'нал' : 'безнал'}): ${balanceBefore} ₽, к выдаче: ${netPaid} ₽, будет: ${balanceAfter} ₽` };
        }
      }
    }

    if (debtDeducted > 0) {
      let remaining = debtDeducted;
      setSalaryAdvances(prev => prev.map(a => {
        if (a.employeeId !== employeeId || a.remainingAmount <= 0 || remaining <= 0) return a;
        const payForThis = roundMoney(Math.min(remaining, a.remainingAmount));
        remaining = roundMoney(remaining - payForThis);
        return { ...a, remainingAmount: roundMoney(a.remainingAmount - payForThis), updatedAt: now };
      }));
    }

    const salPayment: SalaryPayment = {
      id: generateId(),
      employeeId,
      employeeName,
      grossAmount: roundMoney(grossAmount),
      debtDeducted,
      netPaid,
      method,
      comment,
      paidBy: currentUser?.id ?? 'unknown',
      paidByName: currentUser?.name ?? 'Неизвестно',
      paidAt: now,
      source: effectiveSource,
    };
    setSalaryPayments(prev => [salPayment, ...prev]);

    if (netPaid > 0) {
      if (effectiveSource === 'manager_shift') {
        const managerShift = shifts.find(s => s.id === shiftIdForOp);
        if (managerShift) {
          updateShiftExpected(managerShift.id, -netPaid);
        }
        const balanceBefore = managerShift ? getShiftCashBalance(managerShift) : 0;
        const balanceAfter = roundMoney(balanceBefore - netPaid);

        const expenseEntry: Expense = {
          id: generateId(),
          amount: netPaid,
          category: 'Выплата зарплаты',
          description: `Выплата ЗП (касса менеджера): ${employeeName} — ${netPaid} ₽ (начислено ${grossAmount} ₽${debtDeducted > 0 ? `, зачтено долга ${debtDeducted} ₽` : ''})`,
          operatorId: currentUser?.id ?? 'unknown',
          operatorName: currentUser?.name ?? 'Неизвестно',
          date: now,
          shiftId: shiftIdForOp,
          method: 'cash',
        };
        setExpenses(prev => [expenseEntry, ...prev]);

        addTransaction({
          clientId: '',
          carId: '',
          type: 'manager_expense',
          amount: netPaid,
          method: 'cash',
          date: now,
          description: `Выплата ЗП (касса менеджера): ${employeeName} — ${netPaid} ₽ (начислено ${grossAmount} ₽${debtDeducted > 0 ? `, зачтено долга ${debtDeducted} ₽` : ''})`,
        });

        addCashOperation({
          type: 'salary_payment',
          amount: netPaid,
          category: 'Выплата зарплаты',
          description: `Выплата ЗП (${sourceLabel}): ${employeeName} — ${netPaid} ₽ к выдаче (начислено ${grossAmount} ₽${debtDeducted > 0 ? `, зачтено долга ${debtDeducted} ₽` : ''})`,
          method: 'cash',
          shiftId: shiftIdForOp,
          balanceBefore,
          balanceAfter,
          relatedEntityId: salPayment.id,
          relatedEntityType: 'salary_payment',
        });
      } else {
        const adminFinBal = getAdminFinanceBalance();
        const balanceBefore = method === 'cash' ? adminFinBal.cash : adminFinBal.card;
        const balanceAfter = roundMoney(balanceBefore - netPaid);

        const adminOp: AdminCashOperation = {
          id: generateId(),
          type: 'admin_expense',
          amount: netPaid,
          method,
          description: `Выплата ЗП (${sourceLabel}): ${employeeName} — ${netPaid} ₽ (начислено ${grossAmount} ₽${debtDeducted > 0 ? `, зачтено долга ${debtDeducted} ₽` : ''})`,
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
          amount: netPaid,
          method,
          date: now,
          description: `Выплата ЗП (${sourceLabel}): ${employeeName} — ${netPaid} ₽ (начислено ${grossAmount} ₽${debtDeducted > 0 ? `, зачтено долга ${debtDeducted} ₽` : ''})`,
        });

        addCashOperation({
          type: 'salary_payment',
          amount: netPaid,
          category: 'Выплата зарплаты',
          description: `Выплата ЗП (${sourceLabel}): ${employeeName} — ${netPaid} ₽ к выдаче (начислено ${grossAmount} ₽${debtDeducted > 0 ? `, зачтено долга ${debtDeducted} ₽` : ''})`,
          method,
          shiftId: null,
          balanceBefore,
          balanceAfter,
          relatedEntityId: salPayment.id,
          relatedEntityType: 'salary_payment',
        });
      }
    } else if (debtDeducted > 0) {
      const salarySourceLabel = effectiveSource === 'manager_shift'
        ? `касса менеджера`
        : `финансы админа (${method === 'cash' ? 'наличные' : 'безнал'})`;

      addTransaction({
        clientId: '',
        carId: '',
        type: 'admin_expense',
        amount: 0,
        method,
        date: now,
        description: `Выплата ЗП (зачёт долга): ${employeeName} — начислено ${grossAmount} ₽, полностью зачтено в погашение долга ${debtDeducted} ₽`,
      });

      const zeroPayBalSource = effectiveSource === 'manager_shift'
        ? (() => {
            const ms = shifts.find(s => s.id === shiftIdForOp);
            return ms ? getShiftCashBalance(ms) : 0;
          })()
        : (() => {
            const afb = getAdminFinanceBalance();
            return method === 'cash' ? afb.cash : afb.card;
          })();

      addCashOperation({
        type: 'salary_payment',
        amount: 0,
        category: 'Выплата зарплаты (зачёт долга)',
        description: `Выплата ЗП (зачёт долга, ${salarySourceLabel}): ${employeeName} — начислено ${grossAmount} ₽, зачтено долга ${debtDeducted} ₽, к выдаче 0 ₽`,
        method,
        shiftId: shiftIdForOp,
        balanceBefore: zeroPayBalSource,
        balanceAfter: zeroPayBalSource,
        relatedEntityId: salPayment.id,
        relatedEntityType: 'salary_payment',
      });
    }

    if (debtDeducted > 0) {
      logAction('salary_advance_repay', 'Погашение долга под ЗП', `${employeeName}: зачтено ${debtDeducted} ₽ при выплате зарплаты${totalDebt - debtDeducted > 0 ? `, остаток долга: ${roundMoney(totalDebt - debtDeducted)} ₽` : ', долг погашен полностью'}`, salPayment.id, 'salary_payment');
    }

    const payLabel = netPaid > 0
      ? `${employeeName}: начислено ${grossAmount} ₽${debtDeducted > 0 ? `, зачтено долга ${debtDeducted} ₽` : ''}, к выдаче ${netPaid} ₽ (${method === 'cash' ? 'нал' : 'безнал'}) — ${sourceLabel}`
      : `${employeeName}: начислено ${grossAmount} ₽, полностью зачтено в погашение долга ${debtDeducted} ₽`;
    logAction('salary_payment', 'Выплата зарплаты', payLabel, salPayment.id, 'salary_payment');
    schedulePush();
    console.log(`[SalaryPayment] ${employeeName}: gross=${grossAmount}, debtDeducted=${debtDeducted}, netPaid=${netPaid}, source=${sourceLabel}`);
    return { success: true, netPaid };
  }, [currentUser, salaryAdvances, getAdminFinanceBalance, getShiftCashBalance, shifts, updateShiftExpected, addTransaction, addCashOperation, logAction, schedulePush]);

  const getEmployeeSalaryDebt = useCallback((employeeId: string): number => {
    return roundMoney(salaryAdvances.filter(a => a.employeeId === employeeId && a.remainingAmount > 0).reduce((s, a) => s + a.remainingAmount, 0));
  }, [salaryAdvances]);

  const employeeSalaryDebts = useMemo(() => {
    const byEmployee: Record<string, { employeeId: string; employeeName: string; totalIssued: number; totalRepaid: number; remaining: number }> = {};
    for (const a of salaryAdvances) {
      if (!byEmployee[a.employeeId]) {
        byEmployee[a.employeeId] = { employeeId: a.employeeId, employeeName: a.employeeName, totalIssued: 0, totalRepaid: 0, remaining: 0 };
      }
      byEmployee[a.employeeId].totalIssued += a.amount;
      byEmployee[a.employeeId].totalRepaid += roundMoney(a.amount - a.remainingAmount);
      byEmployee[a.employeeId].remaining += a.remainingAmount;
    }
    return Object.values(byEmployee).map(e => ({
      ...e,
      totalIssued: roundMoney(e.totalIssued),
      totalRepaid: roundMoney(e.totalRepaid),
      remaining: roundMoney(e.remaining),
    }));
  }, [salaryAdvances]);

  const getDiagnosticData = useCallback((): FullDiagnosticData => ({
    clients,
    cars,
    sessions,
    subscriptions,
    payments,
    debts,
    transactions,
    shifts,
    expenses,
    withdrawals,
    clientDebts,
    dailyDebtAccruals,
    salaryAdvances,
    salaryPayments,
    adminExpenses,
  }), [clients, cars, sessions, subscriptions, payments, debts, transactions, shifts, expenses, withdrawals, clientDebts, dailyDebtAccruals, salaryAdvances, salaryPayments, adminExpenses]);

  const handleSelfHeal = useCallback((healed: {
    debts?: FullDiagnosticData['debts'];
    clientDebts?: FullDiagnosticData['clientDebts'];
    salaryAdvances?: FullDiagnosticData['salaryAdvances'];
  }) => {
    if (localDirtyRef.current) {
      console.log('[SelfHeal] SKIPPED: localDirty=true, local changes in progress');
      return;
    }
    const now = Date.now();
    if (debtsDirtyUntilRef.current > now || cashOpsDirtyUntilRef.current > now || salaryDirtyUntilRef.current > now) {
      console.log('[SelfHeal] SKIPPED: collection dirty flags active, user financial op in progress');
      return;
    }
    let changed = false;
    if (healed.debts) {
      setDebts(healed.debts);
      latestDataRef.current = { ...latestDataRef.current, debts: healed.debts };
      changed = true;
      console.log('[SelfHeal] Applied healed debts');
    }
    if (healed.clientDebts) {
      setClientDebts(healed.clientDebts);
      latestDataRef.current = { ...latestDataRef.current, clientDebts: healed.clientDebts };
      changed = true;
      console.log('[SelfHeal] Applied healed clientDebts');
    }
    if (healed.salaryAdvances) {
      setSalaryAdvances(healed.salaryAdvances);
      latestDataRef.current = { ...latestDataRef.current, salaryAdvances: healed.salaryAdvances };
      changed = true;
      console.log('[SelfHeal] Applied healed salaryAdvances');
    }
    if (changed) {
      schedulePush();
    }
  }, [schedulePush]);

  const { runDiagnostic } = useSelfDiagnosis(
    isLoaded,
    isServerSynced,
    getDiagnosticData,
    handleSelfHeal,
  );

  const getAnomalyStats = useCallback(() => getAnomalySummary(), []);

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
    toggleDeepCleaning,
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
    payWithDebtPriority,
    releaseWithDebtWarning,
    getClientDebtInfo,
    runDebtAccrual,
    cashOperations,
    getShiftCashBalance,
    addCashOperation,
    getCashBalance,
    teamViolations,
    getCurrentMonthViolations,
    addViolation,
    deleteViolation,
    addManualDebt,
    deleteManualDebt,
    calculateDebtByMethod,
    deleteCashOperation,
    materializeOverstayDebts,
    salaryAdvances,
    salaryPayments,
    issueSalaryAdvance,
    paySalary,
    getEmployeeSalaryDebt,
    employeeSalaryDebts,
    getAdminFinanceBalance,
    runDiagnostic,
    getAnomalyStats,
    getCleanupChecklist,
    saveCleanupChecklist,
    completeCleanup,
    getTodayCleaningShift,
    getCleanupTemplate,
    updateCleanupTemplate,
    cleanupChecklistTemplate,
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
    addScheduledShift, updateScheduledShift, deleteScheduledShift, toggleDeepCleaning, logAction,
    earlyExitWithRefund,
    adminExpenses, adminCashOperations, expenseCategories,
    addAdminExpense, addExpenseCategory, updateExpenseCategory, deleteExpenseCategory,
    getManagerCategories, getAdminCategories, getManagerCashRegister, getAdminCashRegister,
    dailyDebtAccruals, clientDebts, payClientDebt, payWithDebtPriority, releaseWithDebtWarning, getClientDebtInfo, runDebtAccrual,
    cashOperations, getShiftCashBalance, addCashOperation, getCashBalance,
    teamViolations, getCurrentMonthViolations, addViolation, deleteViolation,
    addManualDebt, deleteManualDebt,
    calculateDebtByMethod, deleteCashOperation, materializeOverstayDebts,
    salaryAdvances, salaryPayments, issueSalaryAdvance, paySalary, getEmployeeSalaryDebt, employeeSalaryDebts,
    getAdminFinanceBalance,
    runDiagnostic, getAnomalyStats,
    getCleanupChecklist, saveCleanupChecklist, completeCleanup, getTodayCleaningShift,
    getCleanupTemplate, updateCleanupTemplate, cleanupChecklistTemplate,
  ]);
});
