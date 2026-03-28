import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { ArrowUpCircle, ArrowDownCircle, MinusCircle, Wallet, LogIn, XCircle, RotateCcw, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatDateTime } from '@/utils/date';
import { Transaction } from '@/types';

type FilterMode = 'day' | 'month' | 'year';

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const MONTH_NAMES_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function getLocalDate(dateStr: string): { year: number; month: number; day: number } {
  const d = new Date(dateStr);
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
}

function formatDayLabel(date: Date): string {
  const d = date.getDate();
  const m = MONTH_NAMES_GEN[date.getMonth()];
  const y = date.getFullYear();
  return `${d} ${m} ${y}`;
}

function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function HistoryScreen() {
  const { transactions, clients, cars, isClientDeleted } = useParking();
  const [mode, setMode] = useState<FilterMode>('day');

  const today = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<Date>(today);

  const filteredTransactions = useMemo(() => {
    let result: Transaction[];

    if (mode === 'day') {
      result = transactions.filter(t => {
        const td = new Date(t.date);
        return isSameDay(td, selectedDay);
      });
    } else if (mode === 'month') {
      result = transactions.filter(t => {
        const { year, month } = getLocalDate(t.date);
        return year === selectedYear && month === selectedMonth;
      });
    } else {
      result = transactions.filter(t => {
        const { year } = getLocalDate(t.date);
        return year === selectedYear;
      });
    }

    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, mode, selectedDay, selectedMonth, selectedYear]);

  const filterLabel = useMemo(() => {
    if (mode === 'day') {
      const now = new Date();
      if (isSameDay(selectedDay, now)) return `Транзакции за сегодня, ${formatDayLabel(selectedDay)}`;
      return `Транзакции за ${formatDayLabel(selectedDay)}`;
    }
    if (mode === 'month') return `Транзакции за ${formatMonthLabel(selectedYear, selectedMonth).toLowerCase()}`;
    return `Транзакции за ${selectedYear} год`;
  }, [mode, selectedDay, selectedMonth, selectedYear]);

  const navigatePrev = useCallback(() => {
    if (mode === 'day') {
      setSelectedDay(prev => {
        const d = new Date(prev);
        d.setDate(d.getDate() - 1);
        return d;
      });
    } else if (mode === 'month') {
      if (selectedMonth === 0) {
        setSelectedMonth(11);
        setSelectedYear(y => y - 1);
      } else {
        setSelectedMonth(m => m - 1);
      }
    } else {
      setSelectedYear(y => y - 1);
    }
  }, [mode, selectedMonth]);

  const navigateNext = useCallback(() => {
    if (mode === 'day') {
      setSelectedDay(prev => {
        const d = new Date(prev);
        d.setDate(d.getDate() + 1);
        return d;
      });
    } else if (mode === 'month') {
      if (selectedMonth === 11) {
        setSelectedMonth(0);
        setSelectedYear(y => y + 1);
      } else {
        setSelectedMonth(m => m + 1);
      }
    } else {
      setSelectedYear(y => y + 1);
    }
  }, [mode, selectedMonth]);

  const navLabel = useMemo(() => {
    if (mode === 'day') return formatDayLabel(selectedDay);
    if (mode === 'month') return formatMonthLabel(selectedYear, selectedMonth);
    return `${selectedYear}`;
  }, [mode, selectedDay, selectedMonth, selectedYear]);

  const resetFilter = useCallback(() => {
    const now = new Date();
    setSelectedDay(now);
    setSelectedMonth(now.getMonth());
    setSelectedYear(now.getFullYear());
  }, []);

  const handleModeChange = useCallback((newMode: FilterMode) => {
    setMode(newMode);
    const now = new Date();
    if (newMode === 'day') {
      setSelectedDay(now);
    } else if (newMode === 'month') {
      setSelectedMonth(now.getMonth());
      setSelectedYear(now.getFullYear());
    } else {
      setSelectedYear(now.getFullYear());
    }
  }, []);

  const isToday = useMemo(() => {
    const now = new Date();
    if (mode === 'day') return isSameDay(selectedDay, now);
    if (mode === 'month') return selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
    return selectedYear === now.getFullYear();
  }, [mode, selectedDay, selectedMonth, selectedYear]);

  const getTransactionIcon = useCallback((type: Transaction['type']) => {
    switch (type) {
      case 'payment': return { Icon: ArrowUpCircle, color: Colors.success, bg: Colors.successLight };
      case 'debt': return { Icon: ArrowDownCircle, color: Colors.danger, bg: Colors.dangerLight };
      case 'debt_payment': return { Icon: Wallet, color: Colors.info, bg: Colors.infoLight };
      case 'exit': return { Icon: MinusCircle, color: Colors.textSecondary, bg: Colors.inputBg };
      case 'entry': return { Icon: LogIn, color: Colors.info, bg: Colors.infoLight };
      case 'cancel_entry': return { Icon: XCircle, color: Colors.danger, bg: Colors.dangerLight };
      case 'cancel_exit': return { Icon: RotateCcw, color: Colors.info, bg: Colors.infoLight };
      case 'cancel_payment': return { Icon: XCircle, color: Colors.danger, bg: Colors.dangerLight };
      case 'withdrawal': return { Icon: ArrowDownCircle, color: Colors.warning, bg: Colors.warningLight };
      case 'client_deleted': return { Icon: Trash2, color: Colors.danger, bg: Colors.dangerLight };
      case 'refund': return { Icon: RotateCcw, color: Colors.warning, bg: Colors.warningLight };
      default: return { Icon: MinusCircle, color: Colors.textSecondary, bg: Colors.inputBg };
    }
  }, []);

  const getTypeLabel = useCallback((type: Transaction['type']): string => {
    switch (type) {
      case 'payment': return 'Оплата';
      case 'debt': return 'Долг';
      case 'debt_payment': return 'Погашение';
      case 'exit': return 'Выезд';
      case 'entry': return 'Въезд';
      case 'cancel_entry': return 'Отмена заезда';
      case 'cancel_exit': return 'Отмена выезда';
      case 'cancel_payment': return 'Отмена оплаты';
      case 'withdrawal': return 'Снятие';
      case 'client_deleted': return 'Удаление клиента';
      case 'refund': return 'Возврат';
      default: return 'Операция';
    }
  }, []);

  const renderItem = useCallback(({ item }: { item: Transaction }) => {
    const client = clients.find(c => c.id === item.clientId);
    const car = cars.find(c => c.id === item.carId);
    const clientDeleted = item.clientId ? isClientDeleted(item.clientId) : false;
    const { Icon, color, bg } = getTransactionIcon(item.type);

    return (
      <View style={styles.txCard} testID={`tx-${item.id}`}>
        <View style={[styles.txIcon, { backgroundColor: bg }]}>
          <Icon size={20} color={color} />
        </View>
        <View style={styles.txInfo}>
          <View style={styles.txHeader}>
            <Text style={styles.txType}>{getTypeLabel(item.type)}</Text>
            {item.amount > 0 && (
              <Text style={[styles.txAmount, { color }]}>
                {item.type === 'debt' ? '-' : '+'}{item.amount} ₽
              </Text>
            )}
          </View>
          <Text style={styles.txDesc}>{item.description}</Text>
          <Text style={styles.txMeta}>
            {client?.name ?? '—'}{clientDeleted ? ' (удалён)' : ''} • {car?.plateNumber ?? '—'}{car?.carModel ? ` (${car.carModel})` : ''}{car?.deleted ? ' (удалена)' : ''}
          </Text>
          <View style={styles.txFooter}>
            <Text style={styles.txDate}>{formatDateTime(item.date)}</Text>
            {item.method && (
              <Text style={styles.txMethod}>
                {item.method === 'cash' ? 'Наличные' : 'Безнал'}
              </Text>
            )}
            <Text style={styles.txOperator}>{item.operatorName}</Text>
          </View>
        </View>
      </View>
    );
  }, [clients, cars, isClientDeleted, getTransactionIcon, getTypeLabel]);

  const modes: { key: FilterMode; label: string }[] = [
    { key: 'day', label: 'День' },
    { key: 'month', label: 'Месяц' },
    { key: 'year', label: 'Год' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.filterSection}>
        <View style={styles.modeRow}>
          {modes.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[styles.modeBtn, mode === m.key && styles.modeBtnActive]}
              onPress={() => handleModeChange(m.key)}
              testID={`mode-${m.key}`}
            >
              <Text style={[styles.modeBtnText, mode === m.key && styles.modeBtnTextActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.navRow}>
          <TouchableOpacity onPress={navigatePrev} style={styles.navArrow} testID="nav-prev">
            <ChevronLeft size={22} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.navLabel}>{navLabel}</Text>
          <TouchableOpacity onPress={navigateNext} style={styles.navArrow} testID="nav-next">
            <ChevronRight size={22} color={Colors.primary} />
          </TouchableOpacity>
          {!isToday && (
            <TouchableOpacity onPress={resetFilter} style={styles.resetBtn} testID="reset-filter">
              <X size={14} color={Colors.white} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.filterLabel}>{filterLabel}</Text>
        <Text style={styles.countLabel}>
          {filteredTransactions.length > 0
            ? `${filteredTransactions.length} операц.`
            : ''}
        </Text>
      </View>

      <FlatList
        data={filteredTransactions}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>Нет транзакций</Text>
            <Text style={styles.emptyText}>За выбранный период транзакции не найдены</Text>
            {!isToday && (
              <TouchableOpacity onPress={resetFilter} style={styles.emptyResetBtn}>
                <Text style={styles.emptyResetText}>Перейти к сегодня</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  filterSection: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
  },
  modeBtnActive: {
    backgroundColor: Colors.primary,
  },
  modeBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  modeBtnTextActive: {
    color: Colors.white,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 6,
  },
  navArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.inputBg,
  },
  navLabel: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    minWidth: 160,
    textAlign: 'center' as const,
  },
  resetBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  filterLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
  },
  countLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center' as const,
    marginTop: 2,
  },
  list: {
    padding: 16,
    gap: 8,
  },
  txCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 12,
    marginBottom: 2,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: {
    flex: 1,
  },
  txHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txType: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  txDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  txMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  txFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  txDate: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  txMethod: {
    fontSize: 11,
    color: Colors.info,
    fontWeight: '500' as const,
  },
  txOperator: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  emptyState: {
    padding: 48,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
  },
  emptyResetBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  emptyResetText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.white,
  },
});
