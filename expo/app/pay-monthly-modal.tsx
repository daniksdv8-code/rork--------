import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Wallet, Check, Calendar, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { useAuth } from '@/providers/AuthProvider';
import { PaymentMethod } from '@/types';
import { formatDate, isExpired, daysBetween, calculateProRataAmount, getMonthlyAmount } from '@/utils/date';

export default function PayMonthlyModal() {
  const router = useRouter();
  const { clientId, carId } = useLocalSearchParams<{ clientId: string; carId: string }>();
  const { clients, cars, tariffs, subscriptions, debts, payMonthly, payDebt, needsShiftCheck } = useParking();
  const { isAdmin } = useAuth();
  const shiftRequired = needsShiftCheck();
  const [method, setMethod] = useState<PaymentMethod>('cash');

  const client = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId]);
  const car = useMemo(() => cars.find(c => c.id === carId), [cars, carId]);
  const sub = useMemo(() => subscriptions.find(s => s.carId === carId && s.clientId === clientId), [subscriptions, carId, clientId]);

  const subExpired = useMemo(() => sub ? isExpired(sub.paidUntil) : false, [sub]);
  const subPaidUntilDate = useMemo(() => {
    if (!sub) return null;
    const d = new Date(sub.paidUntil);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [sub]);

  const clientDebts = useMemo(() => {
    if (!clientId || !carId) return [];
    return debts.filter(d => d.clientId === clientId && d.carId === carId && d.remainingAmount > 0);
  }, [debts, clientId, carId]);

  const totalDebtAmount = useMemo(() => clientDebts.reduce((s, d) => s + d.remainingAmount, 0), [clientDebts]);

  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [endDate, setEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [initialDatesSet, setInitialDatesSet] = useState<boolean>(false);

  useEffect(() => {
    if (initialDatesSet) return;
    if (subExpired && subPaidUntilDate) {
      setStartDate(subPaidUntilDate);
      const e = new Date(subPaidUntilDate);
      e.setMonth(e.getMonth() + 1);
      setEndDate(e);
      setCalendarMonth(new Date(subPaidUntilDate.getFullYear(), subPaidUntilDate.getMonth(), 1));
      setInitialDatesSet(true);
    } else {
      setInitialDatesSet(true);
    }
  }, [subExpired, subPaidUntilDate, initialDatesSet]);

  const debtDays = useMemo(() => {
    if (!subExpired || !subPaidUntilDate) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((today.getTime() - subPaidUntilDate.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [subExpired, subPaidUntilDate]);

  const [selectingField, setSelectingField] = useState<'start' | 'end'>('start');
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const days = useMemo(() => {
    return daysBetween(startDate.toISOString(), endDate.toISOString());
  }, [startDate, endDate]);

  const monthlyRate = method === 'cash' ? tariffs.monthlyCash : tariffs.monthlyCard;
  const amount = useMemo(() => calculateProRataAmount(startDate, endDate, monthlyRate), [startDate, endDate, monthlyRate]);

  const paidUntilStr = useMemo(() => {
    const d = new Date(endDate);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }, [endDate]);

  const handlePay = useCallback(() => {
    if (!isAdmin && shiftRequired) {
      Alert.alert('Смена не открыта', 'Откройте смену, чтобы принять оплату.');
      return;
    }
    if (!clientId || !carId) return;
    if (days <= 0) {
      Alert.alert('Ошибка', 'Выберите корректный период');
      return;
    }

    if (clientDebts.length > 0) {
      for (const debt of clientDebts) {
        payDebt(debt.id, debt.remainingAmount, method);
      }
      console.log(`[PayMonthly] Closed ${clientDebts.length} debts for client ${clientId}, total: ${totalDebtAmount} ₽`);
    }

    payMonthly(clientId, carId, method, 1, amount, paidUntilStr);

    const debtMsg = totalDebtAmount > 0 ? `\nДолг ${totalDebtAmount} ₽ закрыт.` : '';
    Alert.alert('Готово', `Оплата ${amount} ₽ за ${days} дн. принята.\nОплачено до ${formatDate(paidUntilStr)}${debtMsg}`);
    router.back();
  }, [clientId, carId, method, days, amount, payMonthly, payDebt, router, shiftRequired, paidUntilStr, clientDebts, totalDebtAmount, isAdmin]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    const cells: (Date | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      cells.push(new Date(year, month, d));
    }
    return cells;
  }, [calendarMonth]);

  const isSameDay = useCallback((a: Date, b: Date) => {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }, []);

  const isInRange = useCallback((day: Date) => {
    const dayTime = day.getTime();
    const sTime = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
    const eTime = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime();
    return dayTime >= sTime && dayTime <= eTime;
  }, [startDate, endDate]);

  const handleDayPress = useCallback((day: Date) => {
    if (selectingField === 'start') {
      const newStart = new Date(day);
      newStart.setHours(0, 0, 0, 0);
      setStartDate(newStart);
      if (newStart.getTime() > endDate.getTime()) {
        const newEnd = new Date(newStart);
        newEnd.setMonth(newEnd.getMonth() + 1);
        setEndDate(newEnd);
      }
      setSelectingField('end');
    } else {
      const newEnd = new Date(day);
      newEnd.setHours(0, 0, 0, 0);
      if (newEnd.getTime() < startDate.getTime()) {
        setStartDate(newEnd);
        setSelectingField('end');
      } else {
        setEndDate(newEnd);
      }
    }
  }, [selectingField, startDate, endDate]);

  const prevMonth = useCallback(() => {
    setCalendarMonth(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setCalendarMonth(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  }, []);

  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const quickPeriods = useMemo(() => {
    return [
      { label: '15 дн.', days: 15 },
      { label: '30 дн.', days: 30 },
      { label: '60 дн.', days: 60 },
      { label: '90 дн.', days: 90 },
    ];
  }, []);

  const handleQuickPeriod = useCallback((numDays: number) => {
    const s = subExpired && subPaidUntilDate ? new Date(subPaidUntilDate) : new Date();
    s.setHours(0, 0, 0, 0);
    const e = new Date(s);
    e.setDate(e.getDate() + numDays - 1);
    setStartDate(s);
    setEndDate(e);
    setCalendarMonth(new Date(s.getFullYear(), s.getMonth(), 1));
  }, [subExpired, subPaidUntilDate]);

  if (!client || !car) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Данные не найдены</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.plateNumber}>{car.plateNumber}</Text>
        <Text style={styles.clientName}>{client.name}</Text>
        {sub && (
          <View style={[styles.statusBadge, isExpired(sub.paidUntil) ? styles.statusExpired : styles.statusActive]}>
            <Text style={[styles.statusText, isExpired(sub.paidUntil) ? styles.statusTextExpired : styles.statusTextActive]}>
              {isExpired(sub.paidUntil) ? 'Просрочено' : `Оплачено до ${formatDate(sub.paidUntil)}`}
            </Text>
          </View>
        )}
      </View>

      {subExpired && debtDays > 0 && (
        <View style={styles.debtNotice}>
          <AlertTriangle size={16} color={Colors.danger} />
          <View style={styles.debtNoticeContent}>
            <Text style={styles.debtNoticeTitle}>Просрочка {debtDays} дн.</Text>
            <Text style={styles.debtNoticeText}>
              Оплата истекла {sub ? formatDate(sub.paidUntil) : ''}. Дата начала периода установлена на дату окончания предыдущей оплаты.
            </Text>
            {totalDebtAmount > 0 && (
              <Text style={styles.debtNoticeDebt}>Текущий долг: {totalDebtAmount} ₽ — будет закрыт при оплате</Text>
            )}
          </View>
        </View>
      )}

      <Text style={styles.label}>Способ оплаты</Text>
      <View style={styles.methodRow}>
        <TouchableOpacity
          style={[styles.methodBtn, method === 'cash' && styles.methodBtnActive]}
          onPress={() => setMethod('cash')}
        >
          <Wallet size={18} color={method === 'cash' ? Colors.white : Colors.textSecondary} />
          <Text style={[styles.methodBtnText, method === 'cash' && styles.methodBtnTextActive]}>Наличные</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.methodBtn, method === 'card' && styles.methodBtnActive]}
          onPress={() => setMethod('card')}
        >
          <Wallet size={18} color={method === 'card' ? Colors.white : Colors.textSecondary} />
          <Text style={[styles.methodBtnText, method === 'card' && styles.methodBtnTextActive]}>Безнал</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Период аренды</Text>
      <View style={styles.dateFieldsRow}>
        <TouchableOpacity
          style={[styles.dateField, selectingField === 'start' && styles.dateFieldActive]}
          onPress={() => setSelectingField('start')}
        >
          <Text style={styles.dateFieldLabel}>С</Text>
          <Text style={styles.dateFieldValue}>{formatDate(startDate.toISOString())}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dateField, selectingField === 'end' && styles.dateFieldActive]}
          onPress={() => setSelectingField('end')}
        >
          <Text style={styles.dateFieldLabel}>По</Text>
          <Text style={styles.dateFieldValue}>{formatDate(endDate.toISOString())}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.quickRow}>
        {quickPeriods.map(p => (
          <TouchableOpacity
            key={p.days}
            style={[styles.quickBtn, days === p.days && styles.quickBtnActive]}
            onPress={() => handleQuickPeriod(p.days)}
          >
            <Text style={[styles.quickBtnText, days === p.days && styles.quickBtnTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <TouchableOpacity onPress={prevMonth} style={styles.calendarArrow}>
            <ChevronLeft size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.calendarTitle}>
            {monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
          </Text>
          <TouchableOpacity onPress={nextMonth} style={styles.calendarArrow}>
            <ChevronRight size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekRow}>
          {weekDays.map(d => (
            <View key={d} style={styles.weekDayCell}>
              <Text style={styles.weekDayText}>{d}</Text>
            </View>
          ))}
        </View>

        <View style={styles.daysGrid}>
          {calendarDays.map((day, idx) => {
            if (!day) {
              return <View key={`empty-${idx}`} style={styles.dayCell} />;
            }
            const isStart = isSameDay(day, startDate);
            const isEnd = isSameDay(day, endDate);
            const inRange = isInRange(day);
            const isEdge = isStart || isEnd;

            return (
              <TouchableOpacity
                key={day.toISOString()}
                style={[
                  styles.dayCell,
                  inRange && !isEdge && styles.dayCellInRange,
                  isStart && styles.dayCellStart,
                  isEnd && styles.dayCellEnd,
                  isEdge && styles.dayCellEdge,
                ]}
                onPress={() => handleDayPress(day)}
                activeOpacity={0.6}
              >
                <Text style={[
                  styles.dayText,
                  inRange && !isEdge && styles.dayTextInRange,
                  isEdge && styles.dayTextEdge,
                ]}>
                  {day.getDate()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Тариф:</Text>
          <Text style={styles.summaryValue}>{monthlyRate} ₽/день ({getMonthlyAmount(monthlyRate)} ₽/мес)</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Период:</Text>
          <Text style={styles.summaryValue}>{days} дн.</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Расчёт:</Text>
          <Text style={styles.summaryValue}>{monthlyRate} ₽ × {days} дн.</Text>
        </View>
        {totalDebtAmount > 0 && (
          <>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: Colors.danger }]}>Закрытие долга:</Text>
              <Text style={[styles.summaryValue, { color: Colors.danger }]}>{totalDebtAmount} ₽</Text>
            </View>
          </>
        )}
        <View style={styles.divider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Итого за период:</Text>
          <Text style={styles.summaryTotal}>{amount} ₽</Text>
        </View>
        <View style={styles.summaryRow}>
          <Calendar size={14} color={Colors.success} />
          <Text style={styles.paidUntilText}>Оплачено до: {formatDate(paidUntilStr)}</Text>
        </View>
      </View>

      <TouchableOpacity style={[styles.payBtn, (!isAdmin && shiftRequired) && { opacity: 0.5 }]} onPress={handlePay} activeOpacity={0.7}>
        <Check size={20} color={Colors.white} />
        <Text style={styles.payBtnText}>Оплатить {amount} ₽</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  plateNumber: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: Colors.text,
    letterSpacing: 2,
    marginBottom: 4,
  },
  clientName: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusActive: {
    backgroundColor: Colors.successLight,
  },
  statusExpired: {
    backgroundColor: Colors.dangerLight,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  statusTextActive: {
    color: Colors.success,
  },
  statusTextExpired: {
    color: Colors.danger,
  },
  label: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 12,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 8,
  },
  methodBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  methodBtnText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  methodBtnTextActive: {
    color: Colors.white,
  },
  dateFieldsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  dateField: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  dateFieldActive: {
    borderColor: Colors.primary,
  },
  dateFieldLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dateFieldValue: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  quickBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  quickBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  quickBtnTextActive: {
    color: Colors.white,
  },
  calendarCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calendarArrow: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.inputBg,
  },
  calendarTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekDayText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textMuted,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%' as unknown as number,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellInRange: {
    backgroundColor: Colors.primary + '15',
  },
  dayCellStart: {
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  dayCellEnd: {
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  dayCellEdge: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  dayTextInRange: {
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  dayTextEdge: {
    color: Colors.white,
    fontWeight: '700' as const,
  },
  summaryCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 10,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  summaryTotal: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  paidUntilText: {
    fontSize: 13,
    color: Colors.success,
    fontWeight: '500' as const,
  },
  debtNotice: {
    flexDirection: 'row',
    backgroundColor: Colors.dangerLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  debtNoticeContent: {
    flex: 1,
    gap: 4,
  },
  debtNoticeTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
  debtNoticeText: {
    fontSize: 12,
    color: Colors.danger,
    opacity: 0.8,
    lineHeight: 17,
  },
  debtNoticeDebt: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.danger,
    marginTop: 4,
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    height: 52,
    borderRadius: 14,
    gap: 8,
  },
  payBtnText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '600' as const,
  },
});
