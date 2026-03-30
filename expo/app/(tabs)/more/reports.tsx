import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import {
  BarChart3, AlertTriangle, Clock, TrendingUp, Car, User,
  ChevronDown, ChevronUp, Briefcase,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatDate, formatDateTime } from '@/utils/date';
import { formatMoney } from '@/utils/money';
import { CashShift } from '@/types';
import { calculateStoredDebtTotal } from '@/utils/financeCalculations';

const fm = (n: number) => formatMoney(n);

type ReportTab = 'revenue' | 'shifts' | 'vehicles' | 'debtors' | 'expiring';
type RevenuePeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all';

export default function ReportsScreen() {
  const {
    transactions, debtors, expiringSubscriptions, debts, sessions, cars, clients,
    shifts, expenses, withdrawals, clientDebts,
  } = useParking();
  const [tab, setTab] = useState<ReportTab>('revenue');
  const [revenuePeriod, setRevenuePeriod] = useState<RevenuePeriod>('month');
  const [vehiclePeriod, setVehiclePeriod] = useState<RevenuePeriod>('month');
  const [shiftsPeriod, setShiftsPeriod] = useState<RevenuePeriod>('week');
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);

  const getCutoff = (period: RevenuePeriod): Date | null => {
    const now = new Date();
    if (period === 'day') {
      const c = new Date(now);
      c.setHours(0, 0, 0, 0);
      return c;
    } else if (period === 'week') {
      const c = new Date(now);
      c.setDate(c.getDate() - 7);
      return c;
    } else if (period === 'month') {
      const c = new Date(now);
      c.setMonth(c.getMonth() - 1);
      return c;
    } else if (period === 'quarter') {
      const c = new Date(now);
      c.setMonth(c.getMonth() - 3);
      return c;
    } else if (period === 'year') {
      const c = new Date(now);
      c.setFullYear(c.getFullYear() - 1);
      return c;
    }
    return null;
  };

  const revenueData = useMemo(() => {
    const cutoff = getCutoff(revenuePeriod);

    const paymentTx = transactions.filter(t =>
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

    const cashGross = Math.round(paymentTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0));
    const cardGross = Math.round(paymentTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0));
    const adjustmentGross = Math.round(paymentTx.filter(t => t.method === 'adjustment').reduce((s, t) => s + t.amount, 0));
    const cashCancelled = Math.round(cancelTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0));
    const cardCancelled = Math.round(cancelTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0));
    const adjustmentCancelled = Math.round(cancelTx.filter(t => t.method === 'adjustment').reduce((s, t) => s + t.amount, 0));
    const cashRefunded = Math.round(refundTx.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0));
    const cardRefunded = Math.round(refundTx.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0));

    const filteredExpenses = expenses.filter(e => !cutoff || new Date(e.date) >= cutoff);
    const totalExpensesAmount = Math.round(filteredExpenses.reduce((s, e) => s + e.amount, 0));
    const expByCategory: Record<string, { total: number; count: number }> = {};
    for (const e of filteredExpenses) {
      const cat = e.category || 'Прочее';
      if (!expByCategory[cat]) expByCategory[cat] = { total: 0, count: 0 };
      expByCategory[cat].total += e.amount;
      expByCategory[cat].count++;
    }
    for (const key of Object.keys(expByCategory)) {
      expByCategory[key].total = Math.round(expByCategory[key].total);
    }
    const expenseCategories = Object.entries(expByCategory).sort((a, b) => b[1].total - a[1].total);

    const cash = Math.round(cashGross - cashCancelled - cashRefunded);
    const card = Math.round(cardGross - cardCancelled - cardRefunded);
    const adjustment = Math.round(adjustmentGross - adjustmentCancelled);
    const totalRefunds = Math.round(cashRefunded + cardRefunded);

    const storedDebt = calculateStoredDebtTotal(debts, clientDebts);
    const totalDebtAmount = storedDebt.total;
    const debtorsCount = debtors.length;
    const expenseCount = filteredExpenses.length;

    return { cash, card, adjustment, total: Math.round(cash + card + adjustment), totalDebtAmount, debtorsCount, totalRefunds, totalExpensesAmount, expenseCount, expenseCategories };
  }, [transactions, debts, clientDebts, debtors, revenuePeriod, expenses]);

  const vehicleData = useMemo(() => {
    const cutoff = getCutoff(vehiclePeriod);

    const filteredSessions = sessions.filter(s =>
      !cutoff || new Date(s.entryTime) >= cutoff
    );

    const totalEntries = filteredSessions.length;
    const uniqueCarIds = new Set(filteredSessions.map(s => s.carId));
    const uniqueCars = uniqueCarIds.size;

    const monthlyEntries = filteredSessions.filter(s => s.serviceType === 'monthly').length;
    const onetimeEntries = filteredSessions.filter(s => s.serviceType === 'onetime').length;

    const carStats = Array.from(uniqueCarIds).map(carId => {
      const car = cars.find(c => c.id === carId);
      const client = car ? clients.find(c => c.id === car.clientId) : null;
      const count = filteredSessions.filter(s => s.carId === carId).length;
      return { carId, plateNumber: car?.plateNumber ?? '—', clientName: client?.name ?? '—', count };
    }).sort((a, b) => b.count - a.count).slice(0, 10);

    return { totalEntries, uniqueCars, monthlyEntries, onetimeEntries, topCars: carStats };
  }, [sessions, cars, clients, vehiclePeriod]);

  const shiftCashIncome = useCallback((shift: CashShift) => {
    if (shift.closingSummary) return shift.closingSummary.cashIncome;
    const openTime = new Date(shift.openedAt).getTime();
    const closeTime = shift.closedAt ? new Date(shift.closedAt).getTime() : Date.now();
    const income = transactions.filter(t =>
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
    return Math.round(income - cancelled - refunded);
  }, [transactions]);

  const shiftCardIncome = useCallback((shift: CashShift) => {
    if (shift.closingSummary) return shift.closingSummary.cardIncome;
    const openTime = new Date(shift.openedAt).getTime();
    const closeTime = shift.closedAt ? new Date(shift.closedAt).getTime() : Date.now();
    const income = transactions.filter(t =>
      (t.type === 'payment' || t.type === 'debt_payment') &&
      t.method === 'card' && t.amount > 0 &&
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

  const shiftExpenseTotal = useCallback((shift: CashShift) => {
    if (shift.closingSummary) return shift.closingSummary.totalExpenses;
    return expenses.filter(e => e.shiftId === shift.id).reduce((s, e) => s + e.amount, 0);
  }, [expenses]);

  const shiftWithdrawalTotal = useCallback((shift: CashShift) => {
    if (shift.closingSummary) return shift.closingSummary.totalWithdrawals;
    return withdrawals.filter(w => w.shiftId === shift.id).reduce((s, w) => s + w.amount, 0);
  }, [withdrawals]);

  const formatDuration = useCallback((openedAt: string, closedAt: string | null): string => {
    if (!closedAt) return 'в процессе';
    const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours} ч ${minutes} мин`;
    return `${minutes} мин`;
  }, []);

  const filteredShifts = useMemo(() => {
    const cutoff = getCutoff(shiftsPeriod);
    return shifts
      .filter(s => !cutoff || new Date(s.openedAt) >= cutoff)
      .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
  }, [shifts, shiftsPeriod]);

  const shiftsSummary = useMemo(() => {
    const closed = filteredShifts.filter(s => s.status === 'closed');
    let totalCashIn = 0;
    let totalCardIn = 0;
    let totalExp = 0;
    let totalWd = 0;
    closed.forEach(s => {
      totalCashIn += shiftCashIncome(s);
      totalCardIn += shiftCardIncome(s);
      totalExp += shiftExpenseTotal(s);
      totalWd += shiftWithdrawalTotal(s);
    });
    return {
      count: closed.length,
      openCount: filteredShifts.filter(s => s.status === 'open').length,
      totalCashIn: Math.round(totalCashIn),
      totalCardIn: Math.round(totalCardIn),
      totalExp: Math.round(totalExp),
      totalWd: Math.round(totalWd),
    };
  }, [filteredShifts, shiftCashIncome, shiftCardIncome, shiftExpenseTotal, shiftWithdrawalTotal]);

  const tabs: { key: ReportTab; label: string; icon: typeof BarChart3 }[] = [
    { key: 'revenue', label: 'Выручка', icon: TrendingUp },
    { key: 'shifts', label: 'Смены', icon: Briefcase },
    { key: 'vehicles', label: 'Авто', icon: Car },
    { key: 'debtors', label: 'Долги', icon: AlertTriangle },
    { key: 'expiring', label: 'Истекают', icon: Clock },
  ];

  const periods: { key: RevenuePeriod; label: string }[] = [
    { key: 'day', label: 'День' },
    { key: 'week', label: 'Неделя' },
    { key: 'month', label: 'Месяц' },
    { key: 'quarter', label: 'Квартал' },
    { key: 'year', label: 'Год' },
    { key: 'all', label: 'Все' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.tabsRow}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <t.icon size={14} color={tab === t.key ? Colors.white : Colors.textSecondary} />
            <Text style={[styles.tabBtnText, tab === t.key && styles.tabBtnTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'revenue' && (
        <View>
          <View style={styles.periodRow}>
            {periods.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[styles.periodBtn, revenuePeriod === p.key && styles.periodBtnActive]}
                onPress={() => setRevenuePeriod(p.key)}
              >
                <Text style={[styles.periodBtnText, revenuePeriod === p.key && styles.periodBtnTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.revenueCard}>
            <Text style={styles.revenueLabel}>Общая выручка</Text>
            <Text style={styles.revenueTotal}>{fm(revenueData.total)} ₽</Text>
          </View>

          <View style={styles.breakdownRow}>
            <View style={[styles.breakdownCard, { borderLeftColor: Colors.success }]}>
              <Text style={styles.breakdownLabel}>Наличные</Text>
              <Text style={[styles.breakdownValue, { color: Colors.success }]}>{fm(revenueData.cash)} ₽</Text>
            </View>
            <View style={[styles.breakdownCard, { borderLeftColor: Colors.info }]}>
              <Text style={styles.breakdownLabel}>Безнал</Text>
              <Text style={[styles.breakdownValue, { color: Colors.info }]}>{fm(revenueData.card)} ₽</Text>
            </View>
          </View>

          {revenueData.adjustment > 0 && (
            <View style={[styles.breakdownCard, { borderLeftColor: Colors.warning, marginHorizontal: 0 }]}>
              <Text style={styles.breakdownLabel}>Корректировки</Text>
              <Text style={[styles.breakdownValue, { color: Colors.warning }]}>{fm(revenueData.adjustment)} ₽</Text>
            </View>
          )}

          {revenueData.totalRefunds > 0 && (
            <View style={[styles.breakdownCard, { borderLeftColor: Colors.warning, marginHorizontal: 0 }]}>
              <Text style={styles.breakdownLabel}>Возвраты</Text>
              <Text style={[styles.breakdownValue, { color: Colors.warning }]}>−{fm(revenueData.totalRefunds)} ₽</Text>
            </View>
          )}

          <View style={[styles.breakdownCard, { borderLeftColor: Colors.danger, marginHorizontal: 0 }]}>
            <Text style={styles.breakdownLabel}>Неоплаченные долги ({revenueData.debtorsCount} клиент.)</Text>
            <Text style={[styles.breakdownValue, { color: Colors.danger }]}>{fm(revenueData.totalDebtAmount)} ₽</Text>
          </View>

          {revenueData.totalExpensesAmount > 0 && (
            <View style={[styles.breakdownCard, { borderLeftColor: '#e74c3c', marginHorizontal: 0, marginTop: 8 }]}>
              <Text style={styles.breakdownLabel}>Расходы за период ({revenueData.expenseCount} опер.)</Text>
              <Text style={[styles.breakdownValue, { color: '#e74c3c' }]}>-{fm(revenueData.totalExpensesAmount)} ₽</Text>
            </View>
          )}

          {revenueData.expenseCategories.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.subsectionTitle}>Расходы по категориям</Text>
              {revenueData.expenseCategories.map(([cat, info]) => (
                <View key={cat} style={styles.debtorRow}>
                  <View style={styles.debtorInfo}>
                    <Text style={styles.debtorName}>{cat}</Text>
                    <Text style={styles.debtorCars}>Операций: {info.count}</Text>
                  </View>
                  <Text style={[styles.debtorAmount, { color: '#e74c3c' }]}>-{fm(info.total)} ₽</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {tab === 'shifts' && (
        <View>
          <View style={styles.periodRow}>
            {periods.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[styles.periodBtn, shiftsPeriod === p.key && styles.periodBtnActive]}
                onPress={() => setShiftsPeriod(p.key)}
              >
                <Text style={[styles.periodBtnText, shiftsPeriod === p.key && styles.periodBtnTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.shiftsSummaryCard}>
            <Text style={styles.shiftsSummaryTitle}>Итого за период</Text>
            <View style={styles.shiftsSummaryRow}>
              <View style={styles.shiftsSummaryItem}>
                <Text style={styles.shiftsSummaryNum}>{shiftsSummary.count}</Text>
                <Text style={styles.shiftsSummaryLabel}>Закрытых смен</Text>
              </View>
              {shiftsSummary.openCount > 0 && (
                <View style={styles.shiftsSummaryItem}>
                  <Text style={[styles.shiftsSummaryNum, { color: Colors.success }]}>{shiftsSummary.openCount}</Text>
                  <Text style={styles.shiftsSummaryLabel}>Открытых</Text>
                </View>
              )}
            </View>
            <View style={styles.shiftsSummaryDivider} />
            <View style={styles.shiftsSumRow}>
              <Text style={styles.shiftsSumLabel}>Наличные:</Text>
              <Text style={[styles.shiftsSumValue, { color: Colors.success }]}>{fm(shiftsSummary.totalCashIn)} ₽</Text>
            </View>
            <View style={styles.shiftsSumRow}>
              <Text style={styles.shiftsSumLabel}>Безнал:</Text>
              <Text style={[styles.shiftsSumValue, { color: Colors.info }]}>{fm(shiftsSummary.totalCardIn)} ₽</Text>
            </View>
            <View style={styles.shiftsSumRow}>
              <Text style={styles.shiftsSumLabel}>Расходы:</Text>
              <Text style={[styles.shiftsSumValue, { color: Colors.danger }]}>{fm(shiftsSummary.totalExp)} ₽</Text>
            </View>
            <View style={styles.shiftsSumRow}>
              <Text style={styles.shiftsSumLabel}>Снятия:</Text>
              <Text style={[styles.shiftsSumValue, { color: Colors.warning }]}>{fm(shiftsSummary.totalWd)} ₽</Text>
            </View>
          </View>

          {filteredShifts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Нет смен за выбранный период</Text>
            </View>
          ) : (
            filteredShifts.map(shift => {
              const isExpanded = expandedShiftId === shift.id;
              const cashIn = shiftCashIncome(shift);
              const cardIn = shiftCardIncome(shift);
              const expTotal = shiftExpenseTotal(shift);
              const wTotal = shiftWithdrawalTotal(shift);
              const calcBalance = Math.round(shift.carryOver + cashIn - expTotal - wTotal);
              const isClosed = shift.status === 'closed';

              return (
                <TouchableOpacity
                  key={shift.id}
                  style={styles.shiftCard}
                  onPress={() => setExpandedShiftId(isExpanded ? null : shift.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.shiftHeader}>
                    <View style={styles.shiftHeaderLeft}>
                      <View style={[
                        styles.shiftDot,
                        { backgroundColor: isClosed ? Colors.textMuted : Colors.success }
                      ]} />
                      <View style={{ flex: 1 }}>
                        <View style={styles.shiftNameRow}>
                          <User size={13} color={Colors.textSecondary} />
                          <Text style={styles.shiftName}>{shift.operatorName}</Text>
                          <View style={[styles.shiftBadge, isClosed ? styles.shiftBadgeClosed : styles.shiftBadgeOpen]}>
                            <Text style={[styles.shiftBadgeText, isClosed ? styles.shiftBadgeTextClosed : styles.shiftBadgeTextOpen]}>
                              {isClosed ? 'Закрыта' : 'Открыта'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.shiftDate}>
                          {formatDateTime(shift.openedAt)}
                          {shift.closedAt ? ` → ${formatDateTime(shift.closedAt)}` : ''}
                        </Text>
                        {isClosed && (
                          <Text style={styles.shiftDuration}>
                            Длительность: {formatDuration(shift.openedAt, shift.closedAt)}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.shiftHeaderRight}>
                      <Text style={styles.shiftTotal}>{fm(cashIn + cardIn)} ₽</Text>
                      {isExpanded ? (
                        <ChevronUp size={16} color={Colors.textMuted} />
                      ) : (
                        <ChevronDown size={16} color={Colors.textMuted} />
                      )}
                    </View>
                  </View>

                  {isExpanded && (
                    <View style={styles.shiftDetails}>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Остаток с пред. смены:</Text>
                        <Text style={styles.detailValue}>{fm(shift.carryOver)} ₽</Text>
                      </View>
                      <View style={styles.detailDivider} />
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Наличные за смену:</Text>
                        <Text style={[styles.detailValue, { color: Colors.success }]}>{fm(cashIn)} ₽</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Безнал за смену:</Text>
                        <Text style={[styles.detailValue, { color: Colors.info }]}>{fm(cardIn)} ₽</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Расходы:</Text>
                        <Text style={[styles.detailValue, { color: Colors.danger }]}>−{fm(expTotal)} ₽</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Снятия из кассы:</Text>
                        <Text style={[styles.detailValue, { color: Colors.warning }]}>−{fm(wTotal)} ₽</Text>
                      </View>
                      <View style={styles.detailDivider} />
                      <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { fontWeight: '600' as const }]}>Расчёт в кассе:</Text>
                        <Text style={[styles.detailValue, { fontWeight: '700' as const }]}>{fm(calcBalance)} ₽</Text>
                      </View>
                      {isClosed && (
                        <>
                          <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { fontWeight: '600' as const }]}>Фактически сдано:</Text>
                            <Text style={[
                              styles.detailValue,
                              { fontWeight: '700' as const },
                              (shift.actualCash ?? 0) !== calcBalance
                                ? { color: Colors.danger }
                                : { color: Colors.success },
                            ]}>
                              {fm(shift.actualCash ?? 0)} ₽
                            </Text>
                          </View>
                          {(shift.actualCash ?? 0) !== calcBalance && (
                            <View style={styles.discrepancyRow}>
                              <Text style={styles.discrepancyLabel}>Расхождение:</Text>
                              <Text style={styles.discrepancyValue}>
                                {fm((shift.actualCash ?? 0) - calcBalance)} ₽
                              </Text>
                            </View>
                          )}
                        </>
                      )}
                      {shift.notes ? (
                        <View style={styles.notesRow}>
                          <Text style={styles.notesLabel}>Заметка:</Text>
                          <Text style={styles.notesText}>{shift.notes}</Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}

      {tab === 'vehicles' && (
        <View>
          <View style={styles.periodRow}>
            {periods.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[styles.periodBtn, vehiclePeriod === p.key && styles.periodBtnActive]}
                onPress={() => setVehiclePeriod(p.key)}
              >
                <Text style={[styles.periodBtnText, vehiclePeriod === p.key && styles.periodBtnTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.vehicleStatsRow}>
            <View style={[styles.vehicleStatCard, { borderLeftColor: Colors.info }]}>
              <Text style={styles.vehicleStatNum}>{vehicleData.totalEntries}</Text>
              <Text style={styles.vehicleStatLabel}>Всего заездов</Text>
            </View>
            <View style={[styles.vehicleStatCard, { borderLeftColor: Colors.success }]}>
              <Text style={styles.vehicleStatNum}>{vehicleData.uniqueCars}</Text>
              <Text style={styles.vehicleStatLabel}>Уникальных авто</Text>
            </View>
          </View>

          <View style={styles.vehicleStatsRow}>
            <View style={[styles.vehicleStatCard, { borderLeftColor: Colors.primary }]}>
              <Text style={styles.vehicleStatNum}>{vehicleData.monthlyEntries}</Text>
              <Text style={styles.vehicleStatLabel}>Месячных</Text>
            </View>
            <View style={[styles.vehicleStatCard, { borderLeftColor: Colors.warning }]}>
              <Text style={styles.vehicleStatNum}>{vehicleData.onetimeEntries}</Text>
              <Text style={styles.vehicleStatLabel}>Разовых</Text>
            </View>
          </View>

          {vehicleData.topCars.length > 0 && (
            <>
              <Text style={styles.subsectionTitle}>Топ авто по заездам</Text>
              {vehicleData.topCars.map((item, idx) => (
                <View key={item.carId} style={styles.topCarRow}>
                  <View style={styles.topCarRank}>
                    <Text style={styles.topCarRankText}>{idx + 1}</Text>
                  </View>
                  <View style={styles.topCarInfo}>
                    <Text style={styles.topCarPlate}>{item.plateNumber}</Text>
                    <Text style={styles.topCarClient}>{item.clientName}</Text>
                  </View>
                  <View style={styles.topCarBadge}>
                    <Text style={styles.topCarBadgeText}>{item.count}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {vehicleData.topCars.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Нет данных за выбранный период</Text>
            </View>
          )}
        </View>
      )}

      {tab === 'debtors' && (
        <View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Всего должников</Text>
            <Text style={[styles.summaryValue, { color: Colors.danger }]}>{debtors.length}</Text>
            <Text style={styles.summaryLabel}>Общая задолженность</Text>
            <Text style={[styles.summaryValue, { color: Colors.danger }]}>
              {fm(debtors.reduce((s, d) => s + d.totalDebt, 0))} ₽
            </Text>
          </View>

          {debtors.map(d => (
            <View key={d.client?.id} style={styles.debtorRow}>
              <View style={styles.debtorInfo}>
                <Text style={styles.debtorName}>{d.client?.name ?? '—'}</Text>
                <Text style={styles.debtorCars}>{d.cars.map(c => c.plateNumber).join(', ')}</Text>
              </View>
              <Text style={styles.debtorAmount}>{fm(d.totalDebt)} ₽</Text>
            </View>
          ))}
        </View>
      )}

      {tab === 'expiring' && (
        <View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Истекают в ближайшие 3 дня</Text>
            <Text style={[styles.summaryValue, { color: Colors.warning }]}>{expiringSubscriptions.length}</Text>
          </View>

          {expiringSubscriptions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Нет истекающих подписок</Text>
            </View>
          ) : (
            expiringSubscriptions.map(item => (
              <View key={item.subscription.id} style={styles.expiringRow}>
                <View style={styles.expiringBadge}>
                  <Text style={styles.expiringBadgeText}>
                    {item.daysLeft === 0 ? 'Сегодня' : `${item.daysLeft} дн.`}
                  </Text>
                </View>
                <View style={styles.expiringInfo}>
                  <Text style={styles.expiringName}>{item.client?.name ?? '—'}</Text>
                  <Text style={styles.expiringPlate}>{item.car?.plateNumber ?? '—'}</Text>
                  <Text style={styles.expiringDate}>
                    До: {formatDate(item.subscription.paidUntil)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  tabBtnTextActive: {
    color: Colors.white,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  periodBtn: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  periodBtnActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primaryLight,
  },
  periodBtnText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  periodBtnTextActive: {
    color: Colors.white,
  },
  revenueCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  revenueLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  revenueTotal: {
    fontSize: 32,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  breakdownRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  breakdownCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderLeftWidth: 4,
    marginBottom: 10,
  },
  breakdownLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  breakdownValue: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  shiftsSummaryCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  shiftsSummaryTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 10,
  },
  shiftsSummaryRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 10,
  },
  shiftsSummaryItem: {
    alignItems: 'center',
  },
  shiftsSummaryNum: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  shiftsSummaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  shiftsSummaryDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  shiftsSumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  shiftsSumLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  shiftsSumValue: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  shiftCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 8,
    overflow: 'hidden',
  },
  shiftHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 14,
  },
  shiftHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
  },
  shiftDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  shiftNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  shiftName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  shiftBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  shiftBadgeClosed: {
    backgroundColor: Colors.border,
  },
  shiftBadgeOpen: {
    backgroundColor: Colors.successLight,
  },
  shiftBadgeText: {
    fontSize: 10,
    fontWeight: '600' as const,
  },
  shiftBadgeTextClosed: {
    color: Colors.textMuted,
  },
  shiftBadgeTextOpen: {
    color: Colors.success,
  },
  shiftDate: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  shiftDuration: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  shiftHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  shiftTotal: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  shiftDetails: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 14,
    gap: 5,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  detailDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  discrepancyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.dangerLight,
    padding: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  discrepancyLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  discrepancyValue: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
  notesRow: {
    marginTop: 6,
    backgroundColor: Colors.inputBg,
    padding: 8,
    borderRadius: 8,
  },
  notesLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  notesText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  vehicleStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  vehicleStatCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderLeftWidth: 4,
    alignItems: 'center',
  },
  vehicleStatNum: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  vehicleStatLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginTop: 12,
    marginBottom: 10,
  },
  topCarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 8,
    gap: 12,
  },
  topCarRank: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCarRankText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  topCarInfo: {
    flex: 1,
  },
  topCarPlate: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  topCarClient: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  topCarBadge: {
    backgroundColor: Colors.infoLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  topCarBadgeText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.info,
  },
  summaryCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  debtorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 8,
  },
  debtorInfo: {
    flex: 1,
  },
  debtorName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  debtorCars: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  debtorAmount: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
  expiringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 8,
    gap: 12,
  },
  expiringBadge: {
    backgroundColor: Colors.warningLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  expiringBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.warning,
  },
  expiringInfo: {
    flex: 1,
  },
  expiringName: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  expiringPlate: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  expiringDate: {
    fontSize: 12,
    color: Colors.warning,
    marginTop: 2,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
});
