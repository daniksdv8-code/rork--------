import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, Alert, Modal, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import {
  PlayCircle, StopCircle, MinusCircle, DollarSign,
  Clock, User, ChevronDown, ChevronUp, X, ArrowDownCircle,
  AlertTriangle, TrendingDown, TrendingUp,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { useAuth } from '@/providers/AuthProvider';
import { formatDateTime, isToday } from '@/utils/date';
import { formatMoney } from '@/utils/money';
import { CashShift } from '@/types';

const fm = (n: number) => formatMoney(n);

type CashTab = 'current' | 'report' | 'history';
type ReportPeriod = 'day' | 'week' | 'month' | 'all';

export default function CashRegisterScreen() {
  const { currentUser, isAdmin, logout } = useAuth();
  const {
    shifts, expenses, transactions, withdrawals, cashOperations,
    openShift, closeShift, getActiveShift, getActiveManagerShift, getActiveAdminShift, addExpense, withdrawCash,
    getShiftCashBalance, getLastClosedShiftCarryOver, getManagerRegisterBalance,
  } = useParking();

  const [tab, setTab] = useState<CashTab>('current');
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('day');

  const [showCloseModal, setShowCloseModal] = useState<boolean>(false);
  const [actualCash, setActualCash] = useState<string>('');
  const [closeNotes, setCloseNotes] = useState<string>('');

  const [showExpenseModal, setShowExpenseModal] = useState<boolean>(false);
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseCategory, setExpenseCategory] = useState<string>('');
  const [expenseDesc, setExpenseDesc] = useState<string>('');

  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [withdrawNotes, setWithdrawNotes] = useState<string>('');

  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);

  const activeShift = useMemo(() => {
    if (isAdmin) {
      return getActiveAdminShift();
    }
    return getActiveManagerShift() ?? getActiveShift();
  }, [isAdmin, getActiveAdminShift, getActiveManagerShift, getActiveShift]);

  const _managerShiftActive = useMemo(() => {
    if (!isAdmin) return false;
    return !!getActiveManagerShift();
  }, [isAdmin, getActiveManagerShift]);

  const managerRegisterBalance = useMemo(() => {
    return getManagerRegisterBalance();
  }, [getManagerRegisterBalance]);

  const handleOpenShift = useCallback(() => {
    if (!currentUser) return;
    if (currentUser.role === 'manager') {
      const activeManagerShift = getActiveManagerShift();
      if (activeManagerShift && activeManagerShift.operatorId !== currentUser.id) {
        Alert.alert(
          'Доступ ограничен',
          `Сейчас уже идёт смена другого менеджера (${activeManagerShift.operatorName}). Дождитесь закрытия текущей смены.`
        );
        return;
      }
    }
    const operatorRole = currentUser.role === 'admin' ? 'admin' as const : 'manager' as const;
    const carryOver = getLastClosedShiftCarryOver(operatorRole);
    openShift(currentUser.id, currentUser.name, carryOver, operatorRole);
    console.log(`[CashRegister] ${operatorRole} shift opened with carryOver=${carryOver}`);
  }, [currentUser, openShift, getActiveManagerShift, getLastClosedShiftCarryOver]);

  const handleCloseShift = useCallback(async () => {
    if (!activeShift) return;
    const amount = Number(actualCash) || 0;
    closeShift(activeShift.id, amount, closeNotes);
    setShowCloseModal(false);
    setActualCash('');
    setCloseNotes('');
    if (isAdmin) {
      Alert.alert('Смена закрыта', 'Смена администратора закрыта.');
      console.log('[CashRegister] Admin shift closed');
    } else {
      Alert.alert('Смена закрыта', 'Вы будете перенаправлены на экран входа.', [
        {
          text: 'OK',
          onPress: async () => {
            await logout();
            console.log('[CashRegister] Shift closed, user logged out');
          },
        },
      ]);
    }
  }, [activeShift, actualCash, closeNotes, closeShift, logout, isAdmin]);

  const currentCashBalance = useMemo(() => {
    if (!activeShift) return 0;
    return getShiftCashBalance(activeShift);
  }, [activeShift, getShiftCashBalance]);

  const recentExpenses = useMemo(() => {
    return expenses
      .filter(e => isToday(e.date))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);
  }, [expenses]);

  const reportExpensesByCategory = useMemo(() => {
    const now = new Date();
    let cutoff: Date | null = null;
    if (reportPeriod === 'day') {
      cutoff = new Date(now);
      cutoff.setHours(0, 0, 0, 0);
    } else if (reportPeriod === 'week') {
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 7);
    } else if (reportPeriod === 'month') {
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 1);
    }
    const filtered = expenses.filter(e => !cutoff || new Date(e.date) >= cutoff);
    const byCategory: Record<string, { total: number; count: number }> = {};
    for (const e of filtered) {
      const cat = e.category || 'Прочее';
      if (!byCategory[cat]) byCategory[cat] = { total: 0, count: 0 };
      byCategory[cat].total += e.amount;
      byCategory[cat].count++;
    }
    return Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total);
  }, [expenses, reportPeriod]);

  const reportCashOps = useMemo(() => {
    const now = new Date();
    let cutoff: Date | null = null;
    if (reportPeriod === 'day') {
      cutoff = new Date(now);
      cutoff.setHours(0, 0, 0, 0);
    } else if (reportPeriod === 'week') {
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 7);
    } else if (reportPeriod === 'month') {
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 1);
    }
    return cashOperations
      .filter(op => !cutoff || new Date(op.date) >= cutoff)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 50);
  }, [cashOperations, reportPeriod]);

  const handleAddExpense = useCallback((forceNegative?: boolean) => {
    try {
      const amount = Math.round(Number(expenseAmount) || 0);
      if (!amount || amount <= 0) {
        Alert.alert('Ошибка', 'Укажите сумму расхода');
        return;
      }
      if (!expenseDesc.trim()) {
        Alert.alert('Ошибка', 'Укажите описание расхода');
        return;
      }
      console.log(`[CashRegister] Adding expense: ${amount} ₽, category=${expenseCategory}, desc=${expenseDesc}, force=${forceNegative}`);
      const result = addExpense(amount, expenseCategory.trim() || 'Прочее', expenseDesc.trim(), forceNegative);
      console.log(`[CashRegister] addExpense result:`, JSON.stringify(result));
      if (!result.success) {
        if (result.wouldGoNegative && isAdmin) {
          const balAfter = (result.currentBalance ?? 0) - amount;
          Alert.alert(
            '⚠️ КАССА УЙДЁТ В МИНУС!',
            `Текущий остаток: ${result.currentBalance} ₽\nРасход: ${amount} ₽\nБудет: ${balAfter} ₽`,
            [
              { text: 'Отмена', style: 'cancel' },
              { text: '⚠️ Разрешить минус', style: 'destructive', onPress: () => handleAddExpense(true) },
            ]
          );
          return;
        }
        Alert.alert('Ошибка', result.error ?? 'Не удалось провести расход');
        return;
      }
      setShowExpenseModal(false);
      setExpenseAmount('');
      setExpenseCategory('');
      setExpenseDesc('');
      Alert.alert('Готово', `Расход ${amount} ₽ успешно проведён`);
    } catch (err) {
      console.log('[CashRegister] handleAddExpense error:', err);
      Alert.alert('Ошибка', `Не удалось добавить расход: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [expenseAmount, expenseCategory, expenseDesc, addExpense, isAdmin]);

  const handleWithdraw = useCallback((forceNegative?: boolean) => {
    if (!isAdmin) {
      Alert.alert('Доступ запрещён', 'Операцию может выполнить только администратор');
      return;
    }
    const amount = Math.round(Number(withdrawAmount) || 0);
    if (!amount || amount <= 0) {
      Alert.alert('Ошибка', 'Укажите сумму');
      return;
    }
    const result = withdrawCash(amount, withdrawNotes.trim(), forceNegative);
    if (!result.success) {
      if (result.wouldGoNegative && isAdmin) {
        const balAfter = (result.currentBalance ?? 0) - amount;
        Alert.alert(
          '⚠️ КАССА УЙДЁТ В МИНУС!',
          `Текущий остаток: ${result.currentBalance} ₽\nСнимаете: ${amount} ₽\nБудет: ${balAfter} ₽`,
          [
            { text: 'Отмена', style: 'cancel' },
            { text: '⚠️ Разрешить минус', style: 'destructive', onPress: () => handleWithdraw(true) },
          ]
        );
        return;
      }
      Alert.alert('Недостаточно средств', result.error ?? 'Не удалось провести операцию');
      return;
    }
    setShowWithdrawModal(false);
    setWithdrawAmount('');
    setWithdrawNotes('');
    Alert.alert('Готово', `Снято из кассы: ${amount} ₽`);
  }, [withdrawAmount, withdrawNotes, withdrawCash, isAdmin]);

  const shiftCashIncome = useCallback((shift: CashShift) => {
    if (shift.closingSummary) return shift.closingSummary.cashIncome;
    const openTime = new Date(shift.openedAt).getTime();
    const closeTime = shift.closedAt ? new Date(shift.closedAt).getTime() : Date.now();
    const income = transactions.filter(t =>
      (t.type === 'payment' || t.type === 'debt_payment') &&
      t.method === 'cash' &&
      t.amount > 0 &&
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
    return Math.round(income - cancelled - refunded);
  }, [transactions]);

  const shiftCardIncome = useCallback((shift: CashShift) => {
    if (shift.closingSummary) return shift.closingSummary.cardIncome;
    const openTime = new Date(shift.openedAt).getTime();
    const closeTime = shift.closedAt ? new Date(shift.closedAt).getTime() : Date.now();
    const income = transactions.filter(t =>
      (t.type === 'payment' || t.type === 'debt_payment') &&
      t.method === 'card' &&
      t.amount > 0 &&
      new Date(t.date).getTime() >= openTime &&
      new Date(t.date).getTime() <= closeTime
    ).reduce((s, t) => s + t.amount, 0);
    const cancelled = transactions.filter(t =>
      t.type === 'cancel_payment' && t.method === 'card' &&
      new Date(t.date).getTime() >= openTime &&
      new Date(t.date).getTime() <= closeTime
    ).reduce((s, t) => s + t.amount, 0);
    const refunded = transactions.filter(t =>
      t.type === 'refund' && t.method === 'card' &&
      new Date(t.date).getTime() >= openTime &&
      new Date(t.date).getTime() <= closeTime
    ).reduce((s, t) => s + t.amount, 0);
    return Math.round(income - cancelled - refunded);
  }, [transactions]);

  const shiftExpenses = useCallback((shiftId: string) => {
    return expenses.filter(e => e.shiftId === shiftId);
  }, [expenses]);

  const shiftExpenseTotal = useCallback((shiftId: string) => {
    return expenses.filter(e => e.shiftId === shiftId).reduce((s, e) => s + e.amount, 0);
  }, [expenses]);

  const shiftWithdrawals = useCallback((shiftId: string) => {
    return withdrawals.filter(w => w.shiftId === shiftId);
  }, [withdrawals]);

  const shiftWithdrawalTotal = useCallback((shiftId: string) => {
    return withdrawals.filter(w => w.shiftId === shiftId).reduce((s, w) => s + w.amount, 0);
  }, [withdrawals]);

  const operatorBreakdown = useCallback((shift: CashShift) => {
    const openTime = new Date(shift.openedAt).getTime();
    const closeTime = shift.closedAt ? new Date(shift.closedAt).getTime() : Date.now();
    const shiftTx = transactions.filter(t =>
      (t.type === 'payment' || t.type === 'debt_payment') &&
      t.amount > 0 &&
      new Date(t.date).getTime() >= openTime &&
      new Date(t.date).getTime() <= closeTime
    );
    const cancelTx = transactions.filter(t =>
      t.type === 'cancel_payment' &&
      new Date(t.date).getTime() >= openTime &&
      new Date(t.date).getTime() <= closeTime
    );
    const refundTx = transactions.filter(t =>
      t.type === 'refund' &&
      new Date(t.date).getTime() >= openTime &&
      new Date(t.date).getTime() <= closeTime
    );
    const byOp: Record<string, { name: string; cash: number; card: number }> = {};
    shiftTx.forEach(t => {
      if (!byOp[t.operatorId]) {
        byOp[t.operatorId] = { name: t.operatorName, cash: 0, card: 0 };
      }
      if (t.method === 'cash') byOp[t.operatorId].cash += t.amount;
      else if (t.method === 'card') byOp[t.operatorId].card += t.amount;
    });
    [...cancelTx, ...refundTx].forEach(t => {
      if (!byOp[t.operatorId]) {
        byOp[t.operatorId] = { name: t.operatorName, cash: 0, card: 0 };
      }
      if (t.method === 'cash') byOp[t.operatorId].cash -= t.amount;
      else if (t.method === 'card') byOp[t.operatorId].card -= t.amount;
    });
    return Object.values(byOp);
  }, [transactions]);

  const reportData = useMemo(() => {
    const now = new Date();
    let cutoff: Date | null = null;
    if (reportPeriod === 'day') {
      cutoff = new Date(now);
      cutoff.setHours(0, 0, 0, 0);
    } else if (reportPeriod === 'week') {
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 7);
    } else if (reportPeriod === 'month') {
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 1);
    }

    const filteredTx = transactions.filter(t =>
      (t.type === 'payment' || t.type === 'debt_payment') &&
      t.amount > 0 &&
      (!cutoff || new Date(t.date) >= cutoff)
    );

    const cancelTx = transactions.filter(t =>
      t.type === 'cancel_payment' &&
      (!cutoff || new Date(t.date) >= cutoff)
    );

    const refundTx = transactions.filter(t =>
      t.type === 'refund' &&
      (!cutoff || new Date(t.date) >= cutoff)
    );

    const cashCancelled = Math.round(cancelTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0));
    const cardCancelled = Math.round(cancelTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0));
    const cashRefunded = Math.round(refundTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0));
    const cardRefunded = Math.round(refundTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0));

    const totalCash = Math.round(filteredTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0) - cashCancelled - cashRefunded);
    const totalCard = Math.round(filteredTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0) - cardCancelled - cardRefunded);

    const filteredExpenses = expenses.filter(e => !cutoff || new Date(e.date) >= cutoff);
    const totalExpenses = Math.round(filteredExpenses.reduce((s, e) => s + e.amount, 0));

    const filteredWithdrawals = withdrawals.filter(w => !cutoff || new Date(w.date) >= cutoff);
    const totalWithdrawals = Math.round(filteredWithdrawals.reduce((s, w) => s + w.amount, 0));

    const byOperator: Record<string, { name: string; cash: number; card: number }> = {};
    filteredTx.forEach(t => {
      if (!byOperator[t.operatorId]) {
        byOperator[t.operatorId] = { name: t.operatorName, cash: 0, card: 0 };
      }
      if (t.method === 'cash') byOperator[t.operatorId].cash += t.amount;
      else if (t.method === 'card') byOperator[t.operatorId].card += t.amount;
    });

    const filteredShifts = shifts.filter(s => !cutoff || new Date(s.openedAt) >= cutoff);

    return {
      totalCash, totalCard, total: Math.round(totalCash + totalCard),
      totalExpenses, totalWithdrawals,
      totalRefunds: Math.round(cashRefunded + cardRefunded),
      netCash: Math.round(totalCash - totalExpenses - totalWithdrawals),
      operators: Object.values(byOperator),
      periodExpenses: filteredExpenses,
      periodWithdrawals: filteredWithdrawals,
      periodShifts: filteredShifts,
    };
  }, [transactions, expenses, withdrawals, shifts, reportPeriod]);

  const tabs: { key: CashTab; label: string }[] = [
    { key: 'current', label: 'Текущая смена' },
    { key: 'report', label: 'Кассовый отчёт' },
    { key: 'history', label: 'Смены' },
  ];

  const reportPeriods: { key: ReportPeriod; label: string }[] = [
    { key: 'day', label: 'День' },
    { key: 'week', label: 'Неделя' },
    { key: 'month', label: 'Месяц' },
    { key: 'all', label: 'Все' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.tabsRow}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabBtnText, tab === t.key && styles.tabBtnTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {tab === 'current' && (
          <View>
            {!activeShift ? (
              <View>
                {!isAdmin && managerRegisterBalance > 0 && (
                  <View style={styles.registerBalanceCard}>
                    <Text style={styles.registerBalanceLabel}>Касса менеджера (накоплено)</Text>
                    <Text style={styles.registerBalanceValue}>{fm(managerRegisterBalance)} ₽</Text>
                    <Text style={styles.registerBalanceHint}>
                      Эти средства перейдут вам при открытии смены
                    </Text>
                  </View>
                )}
                <View style={styles.noShiftCard}>
                  <StopCircle size={40} color={Colors.textMuted} />
                  <Text style={styles.noShiftTitle}>
                    {isAdmin ? 'Смена администратора не открыта' : 'Смена не открыта'}
                  </Text>
                  <Text style={styles.noShiftDesc}>
                    {isAdmin
                      ? 'Вы можете работать без смены или открыть свою смену для учёта'
                      : 'Откройте смену для работы с кассой. Касса менеджера — единая. При открытии смены вы принимаете все накопленные наличные.'}
                  </Text>
                  <TouchableOpacity style={styles.openShiftBtn} onPress={handleOpenShift} activeOpacity={0.7}>
                    <PlayCircle size={20} color={Colors.white} />
                    <Text style={styles.openShiftBtnText}>
                      {!isAdmin && managerRegisterBalance > 0
                        ? `Принять кассу (${fm(managerRegisterBalance)} ₽)`
                        : 'Открыть смену'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {isAdmin && (
                  <View style={styles.shiftActions}>
                    <TouchableOpacity
                      style={styles.expenseBtn}
                      onPress={() => setShowExpenseModal(true)}
                      activeOpacity={0.7}
                    >
                      <MinusCircle size={18} color={Colors.white} />
                      <Text style={styles.expenseBtnText}>Добавить расход</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.withdrawBtn}
                      onPress={() => setShowWithdrawModal(true)}
                      activeOpacity={0.7}
                    >
                      <DollarSign size={18} color={Colors.white} />
                      <Text style={styles.withdrawBtnText}>Снять наличные → админ</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {isAdmin && recentExpenses.length > 0 && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={styles.subsectionTitle}>Расходы за сегодня (без смены)</Text>
                    {recentExpenses.map(exp => (
                      <View key={exp.id} style={styles.expenseRow}>
                        <View style={styles.expenseIconWrap}>
                          <MinusCircle size={16} color={Colors.danger} />
                        </View>
                        <View style={styles.expenseInfo}>
                          <Text style={styles.expenseDesc}>{exp.description}</Text>
                          <Text style={styles.expenseMeta}>{exp.category} • {formatDateTime(exp.date)}</Text>
                        </View>
                        <Text style={styles.expenseAmount}>-{fm(exp.amount)} ₽</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <View>
                <View style={styles.activeShiftCard}>
                  <View style={styles.shiftStatusRow}>
                    <View style={styles.shiftStatusBadge}>
                      <View style={styles.shiftStatusDot} />
                      <Text style={styles.shiftStatusText}>
                        {isAdmin ? 'Смена администратора' : 'Касса менеджера (наличные)'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.shiftInfoRow}>
                    <User size={14} color={Colors.textSecondary} />
                    <Text style={styles.shiftInfoText}>{activeShift.operatorName}</Text>
                  </View>
                  <View style={styles.shiftInfoRow}>
                    <Clock size={14} color={Colors.textSecondary} />
                    <Text style={styles.shiftInfoText}>С {formatDateTime(activeShift.openedAt)}</Text>
                  </View>
                  {activeShift.carryOver > 0 && (
                    <Text style={styles.carryOverText}>Принято из кассы (накоплено ранее): {fm(activeShift.carryOver)} ₽</Text>
                  )}
                </View>

                <View style={styles.shiftStatsRow}>
                  <View style={[styles.shiftStatCard, { borderLeftColor: Colors.success }]}>
                    <Text style={styles.shiftStatLabel}>Наличные (в кассе)</Text>
                    <Text style={[styles.shiftStatValue, { color: Colors.success }]}>
                      {fm(shiftCashIncome(activeShift))} ₽
                    </Text>
                  </View>
                  <View style={[styles.shiftStatCard, { borderLeftColor: Colors.info }]}>
                    <Text style={styles.shiftStatLabel}>Безнал → админ</Text>
                    <Text style={[styles.shiftStatValue, { color: Colors.info }]}>
                      {fm(shiftCardIncome(activeShift))} ₽
                    </Text>
                  </View>
                </View>

                <View style={styles.shiftStatsRow}>
                  <View style={[styles.shiftStatCard, { borderLeftColor: Colors.danger }]}>
                    <Text style={styles.shiftStatLabel}>Расходы (нал)</Text>
                    <Text style={[styles.shiftStatValue, { color: Colors.danger }]}>
                      {fm(shiftExpenseTotal(activeShift.id))} ₽
                    </Text>
                  </View>
                  <View style={[styles.shiftStatCard, { borderLeftColor: Colors.warning }]}>
                    <Text style={styles.shiftStatLabel}>Снято → админ</Text>
                    <Text style={[styles.shiftStatValue, { color: Colors.warning }]}>
                      {fm(shiftWithdrawalTotal(activeShift.id))} ₽
                    </Text>
                  </View>
                </View>

                <View style={[styles.shiftStatCard, { borderLeftColor: Colors.primary, marginBottom: 12 }]}>
                  <Text style={styles.shiftStatLabel}>Остаток наличных в кассе</Text>
                  <Text style={[styles.shiftStatValue, { color: Colors.primary }]}>
                    {fm(activeShift.carryOver + shiftCashIncome(activeShift) - shiftExpenseTotal(activeShift.id) - shiftWithdrawalTotal(activeShift.id))} ₽
                  </Text>
                </View>

                {shiftCardIncome(activeShift) > 0 && (
                  <View style={styles.transitInfoCard}>
                    <Text style={styles.transitInfoText}>
                      💳 Безнал {fm(shiftCardIncome(activeShift))} ₽ принят за смену и автоматически зачислен в финансы администратора
                    </Text>
                  </View>
                )}

                {shiftExpenses(activeShift.id).length > 0 && (
                  <>
                    <Text style={styles.subsectionTitle}>Расходы за смену</Text>
                    {shiftExpenses(activeShift.id).map(exp => (
                      <View key={exp.id} style={styles.expenseRow}>
                        <View style={styles.expenseIconWrap}>
                          <MinusCircle size={16} color={Colors.danger} />
                        </View>
                        <View style={styles.expenseInfo}>
                          <Text style={styles.expenseDesc}>{exp.description}</Text>
                          <Text style={styles.expenseMeta}>{exp.category} • {formatDateTime(exp.date)}</Text>
                        </View>
                        <Text style={styles.expenseAmount}>-{fm(exp.amount)} ₽</Text>
                      </View>
                    ))}
                  </>
                )}

                {shiftWithdrawals(activeShift.id).length > 0 && (
                  <>
                    <Text style={styles.subsectionTitle}>Снятие из кассы</Text>
                    {shiftWithdrawals(activeShift.id).map(w => (
                      <View key={w.id} style={styles.expenseRow}>
                        <View style={[styles.expenseIconWrap, { backgroundColor: Colors.warningLight }]}>
                          <ArrowDownCircle size={16} color={Colors.warning} />
                        </View>
                        <View style={styles.expenseInfo}>
                          <Text style={styles.expenseDesc}>{w.notes || 'Снятие'}</Text>
                          <Text style={styles.expenseMeta}>{w.operatorName} • {formatDateTime(w.date)}</Text>
                        </View>
                        <Text style={[styles.expenseAmount, { color: Colors.warning }]}>-{fm(w.amount)} ₽</Text>
                      </View>
                    ))}
                  </>
                )}

                <View style={styles.shiftActions}>
                  <TouchableOpacity
                    style={styles.expenseBtn}
                    onPress={() => setShowExpenseModal(true)}
                    activeOpacity={0.7}
                  >
                    <MinusCircle size={18} color={Colors.white} />
                    <Text style={styles.expenseBtnText}>Добавить расход</Text>
                  </TouchableOpacity>

                  {isAdmin && (
                    <TouchableOpacity
                      style={styles.withdrawBtn}
                      onPress={() => setShowWithdrawModal(true)}
                      activeOpacity={0.7}
                    >
                      <DollarSign size={18} color={Colors.white} />
                      <Text style={styles.withdrawBtnText}>Снять наличные → админ</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.closeShiftBtn}
                    onPress={() => setShowCloseModal(true)}
                    activeOpacity={0.7}
                  >
                    <StopCircle size={18} color={Colors.white} />
                    <Text style={styles.closeShiftBtnText}>Закрыть смену</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {tab === 'report' && (
          <View>
            <View style={styles.periodRow}>
              {reportPeriods.map(p => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.periodBtn, reportPeriod === p.key && styles.periodBtnActive]}
                  onPress={() => setReportPeriod(p.key)}
                >
                  <Text style={[styles.periodBtnText, reportPeriod === p.key && styles.periodBtnTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.reportTotalCard}>
              <Text style={styles.reportTotalLabel}>Приход за период</Text>
              <Text style={styles.reportTotalValue}>{fm(reportData.total)} ₽</Text>
            </View>

            <View style={styles.shiftStatsRow}>
              <View style={[styles.shiftStatCard, { borderLeftColor: Colors.success }]}>
                <Text style={styles.shiftStatLabel}>Наличные</Text>
                <Text style={[styles.shiftStatValue, { color: Colors.success }]}>{fm(reportData.totalCash)} ₽</Text>
              </View>
              <View style={[styles.shiftStatCard, { borderLeftColor: Colors.info }]}>
                <Text style={styles.shiftStatLabel}>Безнал</Text>
                <Text style={[styles.shiftStatValue, { color: Colors.info }]}>{fm(reportData.totalCard)} ₽</Text>
              </View>
            </View>

            <View style={styles.shiftStatsRow}>
              <View style={[styles.shiftStatCard, { borderLeftColor: Colors.danger }]}>
                <Text style={styles.shiftStatLabel}>Расходы</Text>
                <Text style={[styles.shiftStatValue, { color: Colors.danger }]}>{fm(reportData.totalExpenses)} ₽</Text>
              </View>
              <View style={[styles.shiftStatCard, { borderLeftColor: Colors.warning }]}>
                <Text style={styles.shiftStatLabel}>Снято</Text>
                <Text style={[styles.shiftStatValue, { color: Colors.warning }]}>{fm(reportData.totalWithdrawals)} ₽</Text>
              </View>
            </View>

            {reportData.totalRefunds > 0 && (
              <View style={[styles.shiftStatCard, { borderLeftColor: '#e67e22', marginBottom: 10 }]}>
                <Text style={styles.shiftStatLabel}>Возвраты (уже вычтены из прихода)</Text>
                <Text style={[styles.shiftStatValue, { color: '#e67e22' }]}>−{fm(reportData.totalRefunds)} ₽</Text>
              </View>
            )}

            <View style={[styles.shiftStatCard, { borderLeftColor: Colors.primary, marginBottom: 12 }]}>
              <Text style={styles.shiftStatLabel}>Нал. итого (приход − расходы − снятия)</Text>
              <Text style={[styles.shiftStatValue, { color: Colors.primary }]}>{fm(reportData.netCash)} ₽</Text>
            </View>

            {reportData.operators.length > 0 && (
              <>
                <Text style={styles.subsectionTitle}>По операторам</Text>
                {reportData.operators.map(op => (
                  <View key={op.name} style={styles.operatorRow}>
                    <View style={styles.operatorIconWrap}>
                      <User size={16} color={Colors.primary} />
                    </View>
                    <View style={styles.operatorInfo}>
                      <Text style={styles.operatorName}>{op.name}</Text>
                      <Text style={styles.operatorMeta}>
                        Нал: {fm(op.cash)} ₽ • Безнал: {fm(op.card)} ₽
                      </Text>
                    </View>
                    <Text style={styles.operatorTotal}>{fm(op.cash + op.card)} ₽</Text>
                  </View>
                ))}
              </>
            )}

            {reportData.periodWithdrawals.length > 0 && (
              <>
                <Text style={styles.subsectionTitle}>Снятия из кассы</Text>
                {reportData.periodWithdrawals.map(w => (
                  <View key={w.id} style={styles.expenseRow}>
                    <View style={[styles.expenseIconWrap, { backgroundColor: Colors.warningLight }]}>
                      <ArrowDownCircle size={16} color={Colors.warning} />
                    </View>
                    <View style={styles.expenseInfo}>
                      <Text style={styles.expenseDesc}>{w.notes || 'Снятие'}</Text>
                      <Text style={styles.expenseMeta}>{w.operatorName} • {formatDateTime(w.date)}</Text>
                    </View>
                    <Text style={[styles.expenseAmount, { color: Colors.warning }]}>-{fm(w.amount)} ₽</Text>
                  </View>
                ))}
              </>
            )}

            {reportExpensesByCategory.length > 0 && (
              <>
                <Text style={styles.subsectionTitle}>Расходы по категориям</Text>
                {reportExpensesByCategory.map(([cat, info]) => (
                  <View key={cat} style={styles.expenseRow}>
                    <View style={styles.expenseIconWrap}>
                      <MinusCircle size={16} color={Colors.danger} />
                    </View>
                    <View style={styles.expenseInfo}>
                      <Text style={styles.expenseDesc}>{cat}</Text>
                      <Text style={styles.expenseMeta}>Операций: {info.count}</Text>
                    </View>
                    <Text style={styles.expenseAmount}>-{fm(info.total)} ₽</Text>
                  </View>
                ))}
              </>
            )}

            {reportData.periodExpenses.length > 0 && (
              <>
                <Text style={styles.subsectionTitle}>Расходы за период</Text>
                {reportData.periodExpenses.map(exp => (
                  <View key={exp.id} style={styles.expenseRow}>
                    <View style={styles.expenseIconWrap}>
                      <MinusCircle size={16} color={Colors.danger} />
                    </View>
                    <View style={styles.expenseInfo}>
                      <Text style={styles.expenseDesc}>{exp.description}</Text>
                      <Text style={styles.expenseMeta}>
                        {exp.category} • {exp.operatorName} • {formatDateTime(exp.date)}
                      </Text>
                    </View>
                    <Text style={styles.expenseAmount}>-{fm(exp.amount)} ₽</Text>
                  </View>
                ))}
              </>
            )}

            {reportCashOps.length > 0 && (
              <>
                <Text style={styles.subsectionTitle}>Кассовые операции за период</Text>
                {reportCashOps.map(op => {
                  const isExpenseOp = op.type === 'expense' || op.type === 'withdrawal';
                  return (
                    <View key={op.id} style={styles.expenseRow}>
                      <View style={[styles.expenseIconWrap, {
                        backgroundColor: isExpenseOp ? Colors.dangerLight : Colors.successLight,
                      }]}>
                        {isExpenseOp ? (
                          <MinusCircle size={16} color={Colors.danger} />
                        ) : (
                          <DollarSign size={16} color={Colors.success} />
                        )}
                      </View>
                      <View style={styles.expenseInfo}>
                        <Text style={styles.expenseDesc}>{op.description}</Text>
                        <Text style={styles.expenseMeta}>
                          {op.userName} ({op.userRole === 'admin' ? 'админ' : 'менеджер'}) • {op.category} • {formatDateTime(op.date)}
                        </Text>
                        <Text style={styles.expenseMeta}>
                          Баланс: {fm(op.balanceBefore)} → {fm(op.balanceAfter)} ₽
                        </Text>
                      </View>
                      <Text style={[styles.expenseAmount, {
                        color: isExpenseOp ? Colors.danger : Colors.success,
                      }]}>
                        {isExpenseOp ? '-' : '+'}{fm(op.amount)} ₽
                      </Text>
                    </View>
                  );
                })}
              </>
            )}
          </View>
        )}

        {tab === 'history' && (
          <View>
            {shifts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Нет истории смен</Text>
              </View>
            ) : (
              shifts.map(shift => {
                const isExpanded = expandedShiftId === shift.id;
                const cashIn = shiftCashIncome(shift);
                const cardIn = shiftCardIncome(shift);
                const expTotal = shiftExpenseTotal(shift.id);
                const wTotal = shiftWithdrawalTotal(shift.id);
                const ops = operatorBreakdown(shift);
                const shiftExps = shiftExpenses(shift.id);
                const shiftWds = shiftWithdrawals(shift.id);

                const calcBalance = Math.round(shift.carryOver + cashIn - expTotal - wTotal);
                const variance = shift.cashVariance ?? ((shift.actualCash ?? 0) - calcBalance);
                const varType = shift.cashVarianceType ?? (variance < 0 ? 'short' : variance > 0 ? 'over' : 'none');
                const hasVariance = shift.status === 'closed' && varType !== 'none';
                const isShortage = varType === 'short';
                const isOverage = varType === 'over';

                return (
                  <TouchableOpacity
                    key={shift.id}
                    style={[
                      styles.shiftHistoryCard,
                      hasVariance && isShortage && styles.shiftCardShortage,
                      hasVariance && isOverage && styles.shiftCardOverage,
                    ]}
                    onPress={() => setExpandedShiftId(isExpanded ? null : shift.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.shiftHistoryHeader}>
                      <View style={styles.shiftHistoryLeft}>
                        <View style={[
                          styles.shiftHistoryDot,
                          { backgroundColor: shift.status === 'open' ? Colors.success : Colors.textMuted }
                        ]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.shiftHistoryName}>{shift.operatorName}</Text>
                          <Text style={styles.shiftHistoryDate}>
                            {formatDateTime(shift.openedAt)}
                            {shift.closedAt ? ` — ${formatDateTime(shift.closedAt)}` : ' (открыта)'}
                          </Text>
                          {hasVariance && (
                            <View style={[
                              styles.varianceBadge,
                              isShortage ? styles.varianceBadgeShort : styles.varianceBadgeOver,
                            ]}>
                              {isShortage ? (
                                <TrendingDown size={12} color={Colors.white} />
                              ) : (
                                <TrendingUp size={12} color="#78350F" />
                              )}
                              <Text style={[
                                styles.varianceBadgeText,
                                isShortage ? styles.varianceBadgeTextShort : styles.varianceBadgeTextOver,
                              ]}>
                                {isShortage ? `Недостача ${fm(Math.abs(variance))} ₽` : `Излишек +${fm(variance)} ₽`}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={styles.shiftHistoryRight}>
                        <Text style={styles.shiftHistoryAmount}>{fm(cashIn + cardIn)} ₽</Text>
                        {isExpanded ? (
                          <ChevronUp size={16} color={Colors.textMuted} />
                        ) : (
                          <ChevronDown size={16} color={Colors.textMuted} />
                        )}
                      </View>
                    </View>

                    {isExpanded && (
                      <View style={styles.shiftHistoryDetails}>
                        <View style={styles.shiftDetailRow}>
                          <Text style={styles.shiftDetailLabel}>Наличные:</Text>
                          <Text style={[styles.shiftDetailValue, { color: Colors.success }]}>{fm(cashIn)} ₽</Text>
                        </View>
                        <View style={styles.shiftDetailRow}>
                          <Text style={styles.shiftDetailLabel}>Безнал:</Text>
                          <Text style={[styles.shiftDetailValue, { color: Colors.info }]}>{fm(cardIn)} ₽</Text>
                        </View>
                        <View style={styles.shiftDetailRow}>
                          <Text style={styles.shiftDetailLabel}>Расходы:</Text>
                          <Text style={[styles.shiftDetailValue, { color: Colors.danger }]}>{fm(expTotal)} ₽</Text>
                        </View>
                        <View style={styles.shiftDetailRow}>
                          <Text style={styles.shiftDetailLabel}>Снято админом:</Text>
                          <Text style={[styles.shiftDetailValue, { color: Colors.warning }]}>{fm(wTotal)} ₽</Text>
                        </View>
                        <View style={styles.shiftDetailRow}>
                          <Text style={styles.shiftDetailLabel}>Остаток с пред. смены:</Text>
                          <Text style={styles.shiftDetailValue}>{fm(shift.carryOver)} ₽</Text>
                        </View>
                        {shift.status === 'closed' && (
                          <>
                            <View style={styles.shiftDetailDivider} />

                            <View style={[
                              styles.varianceBlock,
                              isShortage && styles.varianceBlockShort,
                              isOverage && styles.varianceBlockOver,
                              !hasVariance && styles.varianceBlockNone,
                            ]}>
                              <View style={styles.varianceBlockHeader}>
                                {hasVariance ? (
                                  <AlertTriangle size={16} color={isShortage ? Colors.danger : Colors.warning} />
                                ) : null}
                                <Text style={[
                                  styles.varianceBlockTitle,
                                  isShortage && { color: Colors.danger },
                                  isOverage && { color: Colors.warning },
                                  !hasVariance && { color: Colors.success },
                                ]}>
                                  {isShortage ? 'Недостача' : isOverage ? 'Излишек' : 'Нет отклонения'}
                                </Text>
                              </View>
                              <View style={styles.varianceBlockRow}>
                                <Text style={styles.varianceBlockLabel}>Ожидалось:</Text>
                                <Text style={styles.varianceBlockValue}>{fm(calcBalance)} ₽</Text>
                              </View>
                              <View style={styles.varianceBlockRow}>
                                <Text style={styles.varianceBlockLabel}>Факт:</Text>
                                <Text style={[styles.varianceBlockValue, { fontWeight: '700' as const }]}>
                                  {fm(shift.actualCash ?? 0)} ₽
                                </Text>
                              </View>
                              <View style={styles.varianceBlockRow}>
                                <Text style={styles.varianceBlockLabel}>Разница:</Text>
                                <Text style={[
                                  styles.varianceBlockValue,
                                  { fontWeight: '700' as const },
                                  isShortage && { color: Colors.danger },
                                  isOverage && { color: Colors.warning },
                                  !hasVariance && { color: Colors.success },
                                ]}>
                                  {variance > 0 ? '+' : ''}{fm(variance)} ₽
                                </Text>
                              </View>
                            </View>
                          </>
                        )}
                        {shift.notes ? (
                          <Text style={styles.shiftNotes}>Заметка: {shift.notes}</Text>
                        ) : null}

                        {ops.length > 0 && (
                          <>
                            <View style={styles.shiftDetailDivider} />
                            <Text style={styles.shiftDetailSubtitle}>Операторы:</Text>
                            {ops.map(op => (
                              <View key={op.name} style={styles.shiftDetailRow}>
                                <Text style={styles.shiftDetailLabel}>{op.name}</Text>
                                <Text style={styles.shiftDetailValue}>
                                  {fm(op.cash)} + {fm(op.card)} = {fm(op.cash + op.card)} ₽
                                </Text>
                              </View>
                            ))}
                          </>
                        )}

                        {shiftExps.length > 0 && (
                          <>
                            <View style={styles.shiftDetailDivider} />
                            <Text style={styles.shiftDetailSubtitle}>Расходы:</Text>
                            {shiftExps.map(exp => (
                              <View key={exp.id} style={styles.shiftDetailRow}>
                                <Text style={styles.shiftDetailLabel}>{exp.description}</Text>
                                <Text style={[styles.shiftDetailValue, { color: Colors.danger }]}>-{fm(exp.amount)} ₽</Text>
                              </View>
                            ))}
                          </>
                        )}

                        {shiftWds.length > 0 && (
                          <>
                            <View style={styles.shiftDetailDivider} />
                            <Text style={styles.shiftDetailSubtitle}>Снятия:</Text>
                            {shiftWds.map(w => (
                              <View key={w.id} style={styles.shiftDetailRow}>
                                <Text style={styles.shiftDetailLabel}>{w.operatorName}: {w.notes || 'Снятие'}</Text>
                                <Text style={[styles.shiftDetailValue, { color: Colors.warning }]}>-{fm(w.amount)} ₽</Text>
                              </View>
                            ))}
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <Modal visible={showCloseModal} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setShowCloseModal(false); }}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalKeyboardView}
            >
              <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Закрытие смены</Text>
                    <TouchableOpacity onPress={() => setShowCloseModal(false)}>
                      <X size={22} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  {!isAdmin && (
                    <View style={styles.logoutNotice}>
                      <Text style={styles.logoutNoticeText}>После закрытия смены произойдёт выход из аккаунта</Text>
                    </View>
                  )}
                  {!isAdmin && activeShift && (
                    <View style={styles.handoverNotice}>
                      <Text style={styles.handoverNoticeText}>
                        📦 Касса менеджера единая — все наличные останутся в кассе и перейдут следующему менеджеру, пока администратор их не снимет
                      </Text>
                    </View>
                  )}
                  {activeShift && (
                    <View style={styles.modalExpectedRow}>
                      <Text style={styles.modalExpectedLabel}>Расчёт в кассе:</Text>
                      <Text style={styles.modalExpectedValue}>
                        {fm(activeShift.carryOver + shiftCashIncome(activeShift) - shiftExpenseTotal(activeShift.id) - shiftWithdrawalTotal(activeShift.id))} ₽
                      </Text>
                    </View>
                  )}
                  <Text style={styles.modalFieldLabel}>Фактически в кассе (₽)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={actualCash}
                    onChangeText={setActualCash}
                    keyboardType="numeric"
                    placeholder="Сумма"
                    placeholderTextColor={Colors.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={styles.modalFieldLabel}>Заметка (необязательно)</Text>
                  <TextInput
                    style={[styles.modalInput, { height: 60 }]}
                    value={closeNotes}
                    onChangeText={setCloseNotes}
                    placeholder="Комментарий..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    blurOnSubmit
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleCloseShift} activeOpacity={0.7}>
                    <Text style={styles.modalSubmitText}>Закрыть смену и выйти</Text>
                  </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={showExpenseModal} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setShowExpenseModal(false); }}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalKeyboardView}
            >
              <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Новый расход</Text>
              <TouchableOpacity onPress={() => setShowExpenseModal(false)}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalExpectedRow}>
              <Text style={styles.modalExpectedLabel}>Остаток кассы:</Text>
              <Text style={[styles.modalExpectedValue, currentCashBalance < 0 ? { color: Colors.danger } : undefined]}>
                {fm(currentCashBalance)} ₽
              </Text>
            </View>
            {Number(expenseAmount) > 0 && Number(expenseAmount) > currentCashBalance && (
              <View style={styles.negativeWarningBanner}>
                <AlertTriangle size={16} color={Colors.danger} />
                <Text style={styles.negativeWarningText}>
                  {isAdmin
                    ? `Внимание: касса уйдёт в минус (${fm(currentCashBalance - Number(expenseAmount))} ₽)`
                    : `Недостаточно средств! Максимум: ${fm(currentCashBalance)} ₽`}
                </Text>
              </View>
            )}
            <Text style={styles.modalFieldLabel}>Сумма (₽)</Text>
            <TextInput
              style={styles.modalInput}
              value={expenseAmount}
              onChangeText={setExpenseAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={styles.modalFieldLabel}>Категория</Text>
            <TextInput
              style={styles.modalInput}
              value={expenseCategory}
              onChangeText={setExpenseCategory}
              placeholder="Хозтовары, уборка, и т.д."
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={styles.modalFieldLabel}>Описание</Text>
            <TextInput
              style={[styles.modalInput, { height: 60 }]}
              value={expenseDesc}
              onChangeText={setExpenseDesc}
              placeholder="Что купили / за что заплатили"
              placeholderTextColor={Colors.textMuted}
              multiline
            />
                  <TouchableOpacity style={styles.modalSubmitBtn} onPress={() => handleAddExpense()} activeOpacity={0.7}>
                    <Text style={styles.modalSubmitText}>Добавить расход</Text>
                  </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={showWithdrawModal} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setShowWithdrawModal(false); }}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalKeyboardView}
            >
              <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Снятие из кассы</Text>
              <TouchableOpacity onPress={() => setShowWithdrawModal(false)}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalExpectedRow}>
              <Text style={styles.modalExpectedLabel}>Остаток кассы:</Text>
              <Text style={[styles.modalExpectedValue, currentCashBalance < 0 ? { color: Colors.danger } : undefined]}>
                {fm(currentCashBalance)} ₽
              </Text>
            </View>
            {Number(withdrawAmount) > 0 && Number(withdrawAmount) > currentCashBalance && (
              <View style={styles.negativeWarningBanner}>
                <AlertTriangle size={16} color={Colors.danger} />
                <Text style={styles.negativeWarningText}>
                  {isAdmin
                    ? `Внимание: касса уйдёт в минус (${fm(currentCashBalance - Number(withdrawAmount))} ₽)`
                    : `Недостаточно средств! Максимум: ${fm(currentCashBalance)} ₽`}
                </Text>
              </View>
            )}
            <Text style={styles.modalFieldLabel}>Сумма (₽)</Text>
            <TextInput
              style={styles.modalInput}
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={styles.modalFieldLabel}>Комментарий</Text>
            <TextInput
              style={[styles.modalInput, { height: 60 }]}
              value={withdrawNotes}
              onChangeText={setWithdrawNotes}
              placeholder="Причина снятия..."
              placeholderTextColor={Colors.textMuted}
              multiline
            />
                  <TouchableOpacity style={styles.modalSubmitBtn} onPress={() => handleWithdraw()} activeOpacity={0.7}>
                    <Text style={styles.modalSubmitText}>Снять из кассы</Text>
                  </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  tabBtnTextActive: {
    color: Colors.white,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  registerBalanceCard: {
    backgroundColor: Colors.successLight,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.success + '30',
    marginBottom: 12,
    gap: 4,
  },
  registerBalanceLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.success,
  },
  registerBalanceValue: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.success,
  },
  registerBalanceHint: {
    fontSize: 12,
    color: Colors.success,
    opacity: 0.8,
    textAlign: 'center',
    marginTop: 2,
  },
  noShiftCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 8,
  },
  noShiftTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
    marginTop: 8,
  },
  noShiftDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  openShiftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 12,
  },
  openShiftBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  activeShiftCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
    gap: 8,
  },
  shiftStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shiftStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  shiftStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  shiftStatusText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.success,
  },
  shiftInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shiftInfoText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  carryOverText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  shiftStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  shiftStatCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderLeftWidth: 4,
  },
  shiftStatLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  shiftStatValue: {
    fontSize: 18,
    fontWeight: '700' as const,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginTop: 8,
    marginBottom: 8,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 6,
    gap: 10,
  },
  expenseIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDesc: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  expenseMeta: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
  shiftActions: {
    gap: 10,
    marginTop: 12,
  },
  expenseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.warning,
    height: 48,
    borderRadius: 12,
    gap: 8,
  },
  expenseBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.info,
    height: 48,
    borderRadius: 12,
    gap: 8,
  },
  withdrawBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  closeShiftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.danger,
    height: 48,
    borderRadius: 12,
    gap: 8,
  },
  closeShiftBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  periodBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  periodBtnText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  periodBtnTextActive: {
    color: Colors.white,
  },
  reportTotalCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  reportTotalLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  reportTotalValue: {
    fontSize: 32,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  operatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 6,
    gap: 10,
  },
  operatorIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  operatorInfo: {
    flex: 1,
  },
  operatorName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  operatorMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  operatorTotal: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  shiftHistoryCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 8,
    overflow: 'hidden',
  },
  shiftCardShortage: {
    borderColor: Colors.danger + '60',
    borderLeftWidth: 4,
    borderLeftColor: Colors.danger,
  },
  shiftCardOverage: {
    borderColor: Colors.warning + '60',
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  varianceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    marginTop: 6,
  },
  varianceBadgeShort: {
    backgroundColor: Colors.danger,
  },
  varianceBadgeOver: {
    backgroundColor: Colors.warningLight,
  },
  varianceBadgeText: {
    fontSize: 11,
    fontWeight: '700' as const,
  },
  varianceBadgeTextShort: {
    color: Colors.white,
  },
  varianceBadgeTextOver: {
    color: '#78350F',
  },
  varianceBlock: {
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
    gap: 6,
  },
  varianceBlockShort: {
    backgroundColor: Colors.dangerLight,
  },
  varianceBlockOver: {
    backgroundColor: Colors.warningLight,
  },
  varianceBlockNone: {
    backgroundColor: Colors.successLight,
  },
  varianceBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  varianceBlockTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  varianceBlockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  varianceBlockLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  varianceBlockValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  shiftHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  shiftHistoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  shiftHistoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  shiftHistoryName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  shiftHistoryDate: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  shiftHistoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shiftHistoryAmount: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  shiftHistoryDetails: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 14,
    gap: 6,
  },
  shiftDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shiftDetailLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  shiftDetailValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  shiftDetailDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 6,
  },
  shiftDetailSubtitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
    marginTop: 2,
  },
  shiftNotes: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  handoverNotice: {
    backgroundColor: Colors.successLight,
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  handoverNoticeText: {
    fontSize: 12,
    color: Colors.success,
    fontWeight: '500' as const,
    lineHeight: 18,
  },
  transitInfoCard: {
    backgroundColor: Colors.infoLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.info + '30',
  },
  transitInfoText: {
    fontSize: 12,
    color: Colors.info,
    lineHeight: 18,
  },
  logoutNotice: {
    backgroundColor: Colors.warningLight,
    padding: 10,
    borderRadius: 8,
  },
  logoutNoticeText: {
    fontSize: 13,
    color: Colors.warning,
    fontWeight: '500' as const,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    padding: 24,
  },
  modalKeyboardView: {
    justifyContent: 'center' as const,
  },
  modalCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  modalExpectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.infoLight,
    padding: 12,
    borderRadius: 10,
  },
  modalExpectedLabel: {
    fontSize: 14,
    color: Colors.text,
  },
  modalExpectedValue: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.info,
  },
  modalFieldLabel: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  modalInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalSubmitBtn: {
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  modalSubmitText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  negativeWarningBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.dangerLight,
    borderRadius: 10,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.danger + '40',
  },
  negativeWarningText: {
    flex: 1,
    fontSize: 13,
    color: Colors.danger,
    fontWeight: '600' as const,
    lineHeight: 18,
  },
});
