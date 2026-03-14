import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, Alert, Modal, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import {
  PlayCircle, StopCircle, MinusCircle, DollarSign,
  Clock, User, ChevronDown, ChevronUp, X, ArrowDownCircle,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { useAuth } from '@/providers/AuthProvider';
import { formatDateTime } from '@/utils/date';
import { CashShift } from '@/types';

type CashTab = 'current' | 'report' | 'history';
type ReportPeriod = 'day' | 'week' | 'month' | 'all';

export default function CashRegisterScreen() {
  const { currentUser, isAdmin, logout } = useAuth();
  const {
    shifts, expenses, transactions, withdrawals,
    openShift, closeShift, getActiveShift, getActiveManagerShift, addExpense, withdrawCash,
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

  const activeShift = getActiveShift();

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
    const closedShifts = shifts
      .filter(s => s.status === 'closed' && s.closedAt)
      .sort((a, b) => new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime());
    const lastClosed = closedShifts[0] ?? null;
    const carryOver = lastClosed?.actualCash ?? 0;
    openShift(currentUser.id, currentUser.name, carryOver);
    console.log('[CashRegister] Shift opened');
  }, [currentUser, shifts, openShift, getActiveManagerShift]);

  const handleCloseShift = useCallback(async () => {
    if (!activeShift) return;
    const amount = Number(actualCash) || 0;
    closeShift(activeShift.id, amount, closeNotes);
    setShowCloseModal(false);
    setActualCash('');
    setCloseNotes('');
    Alert.alert('Смена закрыта', 'Вы будете перенаправлены на экран входа.', [
      {
        text: 'OK',
        onPress: async () => {
          await logout();
          console.log('[CashRegister] Shift closed, user logged out');
        },
      },
    ]);
  }, [activeShift, actualCash, closeNotes, closeShift, logout]);

  const handleAddExpense = useCallback(() => {
    const amount = Number(expenseAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Ошибка', 'Укажите сумму расхода');
      return;
    }
    if (!expenseDesc.trim()) {
      Alert.alert('Ошибка', 'Укажите описание расхода');
      return;
    }
    addExpense(amount, expenseCategory.trim() || 'Прочее', expenseDesc.trim());
    setShowExpenseModal(false);
    setExpenseAmount('');
    setExpenseCategory('');
    setExpenseDesc('');
    Alert.alert('Готово', 'Расход добавлен');
  }, [expenseAmount, expenseCategory, expenseDesc, addExpense]);

  const handleWithdraw = useCallback(() => {
    const amount = Number(withdrawAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Ошибка', 'Укажите сумму');
      return;
    }
    withdrawCash(amount, withdrawNotes.trim());
    setShowWithdrawModal(false);
    setWithdrawAmount('');
    setWithdrawNotes('');
    Alert.alert('Готово', `Снято из кассы: ${amount} ₽`);
  }, [withdrawAmount, withdrawNotes, withdrawCash]);

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
    return income - cancelled - refunded;
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
    return income - cancelled - refunded;
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

    const cashCancelled = cancelTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0);
    const cardCancelled = cancelTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0);
    const cashRefunded = refundTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0);
    const cardRefunded = refundTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0);

    const totalCash = filteredTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0) - cashCancelled - cashRefunded;
    const totalCard = filteredTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0) - cardCancelled - cardRefunded;

    const filteredExpenses = expenses.filter(e => !cutoff || new Date(e.date) >= cutoff);
    const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);

    const filteredWithdrawals = withdrawals.filter(w => !cutoff || new Date(w.date) >= cutoff);
    const totalWithdrawals = filteredWithdrawals.reduce((s, w) => s + w.amount, 0);

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
      totalCash, totalCard, total: totalCash + totalCard,
      totalExpenses, totalWithdrawals,
      totalRefunds: cashRefunded + cardRefunded,
      netCash: totalCash - totalExpenses - totalWithdrawals,
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
              <View style={styles.noShiftCard}>
                <StopCircle size={40} color={Colors.textMuted} />
                <Text style={styles.noShiftTitle}>Смена не открыта</Text>
                <Text style={styles.noShiftDesc}>Откройте смену для начала работы с кассой</Text>
                <TouchableOpacity style={styles.openShiftBtn} onPress={handleOpenShift} activeOpacity={0.7}>
                  <PlayCircle size={20} color={Colors.white} />
                  <Text style={styles.openShiftBtnText}>Открыть смену</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <View style={styles.activeShiftCard}>
                  <View style={styles.shiftStatusRow}>
                    <View style={styles.shiftStatusBadge}>
                      <View style={styles.shiftStatusDot} />
                      <Text style={styles.shiftStatusText}>Смена открыта</Text>
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
                    <Text style={styles.carryOverText}>Остаток с прошлой смены: {activeShift.carryOver} ₽</Text>
                  )}
                </View>

                <View style={styles.shiftStatsRow}>
                  <View style={[styles.shiftStatCard, { borderLeftColor: Colors.success }]}>
                    <Text style={styles.shiftStatLabel}>Наличные</Text>
                    <Text style={[styles.shiftStatValue, { color: Colors.success }]}>
                      {shiftCashIncome(activeShift)} ₽
                    </Text>
                  </View>
                  <View style={[styles.shiftStatCard, { borderLeftColor: Colors.info }]}>
                    <Text style={styles.shiftStatLabel}>Безнал</Text>
                    <Text style={[styles.shiftStatValue, { color: Colors.info }]}>
                      {shiftCardIncome(activeShift)} ₽
                    </Text>
                  </View>
                </View>

                <View style={styles.shiftStatsRow}>
                  <View style={[styles.shiftStatCard, { borderLeftColor: Colors.danger }]}>
                    <Text style={styles.shiftStatLabel}>Расходы</Text>
                    <Text style={[styles.shiftStatValue, { color: Colors.danger }]}>
                      {shiftExpenseTotal(activeShift.id)} ₽
                    </Text>
                  </View>
                  <View style={[styles.shiftStatCard, { borderLeftColor: Colors.warning }]}>
                    <Text style={styles.shiftStatLabel}>Снято</Text>
                    <Text style={[styles.shiftStatValue, { color: Colors.warning }]}>
                      {shiftWithdrawalTotal(activeShift.id)} ₽
                    </Text>
                  </View>
                </View>

                <View style={[styles.shiftStatCard, { borderLeftColor: Colors.primary, marginBottom: 12 }]}>
                  <Text style={styles.shiftStatLabel}>В кассе (расч.)</Text>
                  <Text style={[styles.shiftStatValue, { color: Colors.primary }]}>
                    {activeShift.carryOver + shiftCashIncome(activeShift) - shiftExpenseTotal(activeShift.id) - shiftWithdrawalTotal(activeShift.id)} ₽
                  </Text>
                </View>

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
                        <Text style={styles.expenseAmount}>-{exp.amount} ₽</Text>
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
                        <Text style={[styles.expenseAmount, { color: Colors.warning }]}>-{w.amount} ₽</Text>
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
                      <Text style={styles.withdrawBtnText}>Снять деньги из кассы</Text>
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
              <Text style={styles.reportTotalValue}>{reportData.total} ₽</Text>
            </View>

            <View style={styles.shiftStatsRow}>
              <View style={[styles.shiftStatCard, { borderLeftColor: Colors.success }]}>
                <Text style={styles.shiftStatLabel}>Наличные</Text>
                <Text style={[styles.shiftStatValue, { color: Colors.success }]}>{reportData.totalCash} ₽</Text>
              </View>
              <View style={[styles.shiftStatCard, { borderLeftColor: Colors.info }]}>
                <Text style={styles.shiftStatLabel}>Безнал</Text>
                <Text style={[styles.shiftStatValue, { color: Colors.info }]}>{reportData.totalCard} ₽</Text>
              </View>
            </View>

            <View style={styles.shiftStatsRow}>
              <View style={[styles.shiftStatCard, { borderLeftColor: Colors.danger }]}>
                <Text style={styles.shiftStatLabel}>Расходы</Text>
                <Text style={[styles.shiftStatValue, { color: Colors.danger }]}>{reportData.totalExpenses} ₽</Text>
              </View>
              <View style={[styles.shiftStatCard, { borderLeftColor: Colors.warning }]}>
                <Text style={styles.shiftStatLabel}>Снято</Text>
                <Text style={[styles.shiftStatValue, { color: Colors.warning }]}>{reportData.totalWithdrawals} ₽</Text>
              </View>
            </View>

            {reportData.totalRefunds > 0 && (
              <View style={[styles.shiftStatCard, { borderLeftColor: '#e67e22', marginBottom: 10 }]}>
                <Text style={styles.shiftStatLabel}>Возвраты (уже вычтены из прихода)</Text>
                <Text style={[styles.shiftStatValue, { color: '#e67e22' }]}>−{reportData.totalRefunds} ₽</Text>
              </View>
            )}

            <View style={[styles.shiftStatCard, { borderLeftColor: Colors.primary, marginBottom: 12 }]}>
              <Text style={styles.shiftStatLabel}>Нал. итого (приход − расходы − снятия)</Text>
              <Text style={[styles.shiftStatValue, { color: Colors.primary }]}>{reportData.netCash} ₽</Text>
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
                        Нал: {op.cash} ₽ • Безнал: {op.card} ₽
                      </Text>
                    </View>
                    <Text style={styles.operatorTotal}>{op.cash + op.card} ₽</Text>
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
                    <Text style={[styles.expenseAmount, { color: Colors.warning }]}>-{w.amount} ₽</Text>
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
                    <Text style={styles.expenseAmount}>-{exp.amount} ₽</Text>
                  </View>
                ))}
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

                return (
                  <TouchableOpacity
                    key={shift.id}
                    style={styles.shiftHistoryCard}
                    onPress={() => setExpandedShiftId(isExpanded ? null : shift.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.shiftHistoryHeader}>
                      <View style={styles.shiftHistoryLeft}>
                        <View style={[
                          styles.shiftHistoryDot,
                          { backgroundColor: shift.status === 'open' ? Colors.success : Colors.textMuted }
                        ]} />
                        <View>
                          <Text style={styles.shiftHistoryName}>{shift.operatorName}</Text>
                          <Text style={styles.shiftHistoryDate}>
                            {formatDateTime(shift.openedAt)}
                            {shift.closedAt ? ` — ${formatDateTime(shift.closedAt)}` : ' (открыта)'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.shiftHistoryRight}>
                        <Text style={styles.shiftHistoryAmount}>{cashIn + cardIn} ₽</Text>
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
                          <Text style={[styles.shiftDetailValue, { color: Colors.success }]}>{cashIn} ₽</Text>
                        </View>
                        <View style={styles.shiftDetailRow}>
                          <Text style={styles.shiftDetailLabel}>Безнал:</Text>
                          <Text style={[styles.shiftDetailValue, { color: Colors.info }]}>{cardIn} ₽</Text>
                        </View>
                        <View style={styles.shiftDetailRow}>
                          <Text style={styles.shiftDetailLabel}>Расходы:</Text>
                          <Text style={[styles.shiftDetailValue, { color: Colors.danger }]}>{expTotal} ₽</Text>
                        </View>
                        <View style={styles.shiftDetailRow}>
                          <Text style={styles.shiftDetailLabel}>Снято админом:</Text>
                          <Text style={[styles.shiftDetailValue, { color: Colors.warning }]}>{wTotal} ₽</Text>
                        </View>
                        <View style={styles.shiftDetailRow}>
                          <Text style={styles.shiftDetailLabel}>Остаток с пред. смены:</Text>
                          <Text style={styles.shiftDetailValue}>{shift.carryOver} ₽</Text>
                        </View>
                        {shift.status === 'closed' && (
                          <>
                            <View style={styles.shiftDetailDivider} />
                            <View style={styles.shiftDetailRow}>
                              <Text style={styles.shiftDetailLabel}>Расчёт в кассе:</Text>
                              <Text style={styles.shiftDetailValue}>
                                {shift.carryOver + cashIn - expTotal - wTotal} ₽
                              </Text>
                            </View>
                            <View style={styles.shiftDetailRow}>
                              <Text style={styles.shiftDetailLabel}>Фактически сдано:</Text>
                              <Text style={[
                                styles.shiftDetailValue,
                                { fontWeight: '700' as const },
                                (shift.actualCash ?? 0) !== (shift.carryOver + cashIn - expTotal - wTotal)
                                  ? { color: Colors.danger }
                                  : { color: Colors.success }
                              ]}>
                                {shift.actualCash ?? 0} ₽
                              </Text>
                            </View>
                            {(shift.actualCash ?? 0) !== (shift.carryOver + cashIn - expTotal - wTotal) && (
                              <View style={styles.shiftDetailRow}>
                                <Text style={styles.shiftDetailLabel}>Расхождение:</Text>
                                <Text style={[styles.shiftDetailValue, { color: Colors.danger, fontWeight: '700' as const }]}>
                                  {(shift.actualCash ?? 0) - (shift.carryOver + cashIn - expTotal - wTotal)} ₽
                                </Text>
                              </View>
                            )}
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
                                  {op.cash} + {op.card} = {op.cash + op.card} ₽
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
                                <Text style={[styles.shiftDetailValue, { color: Colors.danger }]}>-{exp.amount} ₽</Text>
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
                                <Text style={[styles.shiftDetailValue, { color: Colors.warning }]}>-{w.amount} ₽</Text>
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
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalKeyboardView}
            >
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.modalCard}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Закрытие смены</Text>
                    <TouchableOpacity onPress={() => setShowCloseModal(false)}>
                      <X size={22} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.logoutNotice}>
                    <Text style={styles.logoutNoticeText}>После закрытия смены произойдёт выход из аккаунта</Text>
                  </View>
                  {activeShift && (
                    <View style={styles.modalExpectedRow}>
                      <Text style={styles.modalExpectedLabel}>Расчёт в кассе:</Text>
                      <Text style={styles.modalExpectedValue}>
                        {activeShift.carryOver + shiftCashIncome(activeShift) - shiftExpenseTotal(activeShift.id) - shiftWithdrawalTotal(activeShift.id)} ₽
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
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={showExpenseModal} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalKeyboardView}
            >
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Новый расход</Text>
              <TouchableOpacity onPress={() => setShowExpenseModal(false)}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
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
                  <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleAddExpense} activeOpacity={0.7}>
                    <Text style={styles.modalSubmitText}>Добавить расход</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={showWithdrawModal} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalKeyboardView}
            >
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Снятие из кассы</Text>
              <TouchableOpacity onPress={() => setShowWithdrawModal(false)}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
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
                  <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleWithdraw} activeOpacity={0.7}>
                    <Text style={styles.modalSubmitText}>Снять из кассы</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
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
});
