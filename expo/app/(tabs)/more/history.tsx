import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { ArrowUpCircle, ArrowDownCircle, MinusCircle, Wallet, LogIn, XCircle, RotateCcw, Trash2 } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatDateTime } from '@/utils/date';
import { Transaction } from '@/types';

type Period = 'day' | 'week' | 'month' | 'year' | 'all';

export default function HistoryScreen() {
  const { transactions, clients, cars, isClientDeleted } = useParking();
  const [period, setPeriod] = useState<Period>('all');

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    let cutoff: Date | null = null;

    if (period === 'day') {
      cutoff = new Date(now);
      cutoff.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 7);
    } else if (period === 'month') {
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 1);
    } else if (period === 'year') {
      cutoff = new Date(now);
      cutoff.setFullYear(cutoff.getFullYear() - 1);
    }

    let result = transactions;
    if (cutoff) {
      result = result.filter(t => new Date(t.date) >= cutoff!);
    }

    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, period]);

  const getTransactionIcon = (type: Transaction['type']) => {
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
  };

  const getTypeLabel = (type: Transaction['type']): string => {
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
  };

  const renderItem = ({ item }: { item: Transaction }) => {
    const client = clients.find(c => c.id === item.clientId);
    const car = cars.find(c => c.id === item.carId);
    const clientDeleted = item.clientId ? isClientDeleted(item.clientId) : false;
    const { Icon, color, bg } = getTransactionIcon(item.type);

    return (
      <View style={styles.txCard}>
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
  };

  const periods: { key: Period; label: string }[] = [
    { key: 'day', label: 'День' },
    { key: 'week', label: 'Неделя' },
    { key: 'month', label: 'Месяц' },
    { key: 'year', label: 'Год' },
    { key: 'all', label: 'Все' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.periodRow}>
        {periods.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={[styles.periodBtnText, period === p.key && styles.periodBtnTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredTransactions}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Нет транзакций за выбранный период</Text>
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
  periodRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    gap: 6,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
  },
  periodBtnActive: {
    backgroundColor: Colors.primary,
  },
  periodBtnText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  periodBtnTextActive: {
    color: Colors.white,
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
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
});
