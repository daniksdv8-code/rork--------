import React, { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, Phone, CreditCard, Clock } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import ShiftGuard from '@/components/ShiftGuard';
import { formatDate } from '@/utils/date';
import { roundMoney, formatMoney } from '@/utils/money';
import { ParkingSession, Car, Debt, ClientDebt, DailyDebtAccrual } from '@/types';

interface DebtorItem {
  client: { id: string; name: string; phone: string } | undefined;
  debts: Debt[];
  totalDebt: number;
  cars: Car[];
  clientDebt: ClientDebt | null;
  overstayDebt?: number;
}

export default function DebtorsScreen() {
  const router = useRouter();
  const { debtors, dailyDebtAccruals, sessions, cars } = useParking() as any as {
    debtors: DebtorItem[];
    dailyDebtAccruals: DailyDebtAccrual[];
    sessions: ParkingSession[];
    cars: Car[];
  };

  const accrualDetailsByClient = useMemo(() => {
    const map: Record<string, Array<{
      sessionId: string;
      carId: string;
      plateNumber: string;
      days: number;
      rate: number;
      amount: number;
      serviceType: string;
      isFrozen: boolean;
    }>> = {};

    const clientIds = new Set(debtors.map(d => d.client?.id).filter(Boolean) as string[]);

    for (const clientId of clientIds) {
      const clientSessions = sessions.filter(s =>
        s.clientId === clientId &&
        s.status === 'active_debt' &&
        !s.cancelled
      );

      const details: typeof map[string] = [];

      for (const session of clientSessions) {
        const sessionAccruals = dailyDebtAccruals.filter(a => a.parkingEntryId === session.id);
        if (sessionAccruals.length === 0) continue;

        const days = sessionAccruals.length;
        const car = cars.find(c => c.id === session.carId);
        const isLombard = session.serviceType === 'lombard';
        const accrualSum = roundMoney(sessionAccruals.reduce((s, a) => s + a.amount, 0));
        const avgRate = days > 0 ? roundMoney(accrualSum / days) : 0;

        details.push({
          sessionId: session.id,
          carId: session.carId,
          plateNumber: car?.plateNumber ?? '—',
          days,
          rate: avgRate,
          amount: accrualSum,
          serviceType: isLombard ? 'ломбард' : session.serviceType === 'monthly' ? 'месяц' : 'разово',
          isFrozen: session.status === 'released_debt',
        });
      }

      if (details.length > 0) {
        map[clientId] = details;
      }
    }

    return map;
  }, [debtors, dailyDebtAccruals, sessions, cars]);

  const renderItem = useCallback(({ item }: { item: DebtorItem }) => {
    if (!item.client) return null;

    const accrualDetails = accrualDetailsByClient[item.client.id] ?? [];
    const accrualTotal = roundMoney(accrualDetails.reduce((s, d) => s + d.amount, 0));
    const _oldDebtsTotal = roundMoney(item.debts.reduce((s, d) => s + d.remainingAmount, 0));
    const clientDebtAmount = item.clientDebt ? item.clientDebt.totalAmount : 0;
    const unaccountedClientDebt = roundMoney(Math.max(0, clientDebtAmount - accrualTotal));

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.debtBadge}>
            <AlertTriangle size={14} color={Colors.danger} />
            <Text style={styles.debtAmount}>{formatMoney(item.totalDebt)} ₽</Text>
          </View>
        </View>
        <Text style={styles.clientName}>{item.client.name}</Text>
        <View style={styles.infoRow}>
          <Phone size={13} color={Colors.textMuted} />
          <Text style={styles.infoText}>{item.client.phone}</Text>
        </View>
        <Text style={styles.carsText}>
          {item.cars.map(c => c.carModel ? `${c.plateNumber} (${c.carModel})` : c.plateNumber).join(', ')}
        </Text>

        {accrualDetails.map(detail => (
          <View key={detail.sessionId} style={styles.debtRow}>
            <View style={styles.debtInfo}>
              <Text style={styles.debtDesc}>
                {detail.plateNumber} · {detail.serviceType} · {detail.days} дн. × {detail.rate} ₽
              </Text>
              <View style={styles.statusRow}>
                <Clock size={11} color={Colors.textMuted} />
                <Text style={styles.debtDate}>
                  {detail.isFrozen ? 'Выпущен в долг (заморожен)' : 'На парковке'}
                </Text>
              </View>
            </View>
            <Text style={styles.debtRowAmount}>{formatMoney(detail.amount)} ₽</Text>
          </View>
        ))}

        {item.debts.map((debt: Debt) => (
          <View key={debt.id} style={styles.debtRow}>
            <View style={styles.debtInfo}>
              <Text style={styles.debtDesc}>{debt.description}</Text>
              <Text style={styles.debtDate}>{formatDate(debt.createdAt)}</Text>
            </View>
            <Text style={styles.debtRowAmount}>{formatMoney(debt.remainingAmount)} ₽</Text>
          </View>
        ))}

        {(item.overstayDebt ?? 0) > 0 && (
          <View style={styles.debtRow}>
            <View style={styles.debtInfo}>
              <Text style={styles.debtDesc}>Просрочка по активным заездам</Text>
              <View style={styles.statusRow}>
                <Clock size={11} color={Colors.warning} />
                <Text style={[styles.debtDate, { color: Colors.warning }]}>На парковке (не оплачено)</Text>
              </View>
            </View>
            <Text style={styles.debtRowAmount}>{formatMoney(item.overstayDebt ?? 0)} ₽</Text>
          </View>
        )}

        {unaccountedClientDebt > 0 && (
          <View style={styles.debtRow}>
            <View style={styles.debtInfo}>
              <Text style={styles.debtDesc}>Начисленный долг</Text>
              <Text style={styles.debtDate}>
                {item.clientDebt && item.clientDebt.frozenAmount > 0
                  ? `Активный: ${roundMoney(item.clientDebt.activeAmount)} ₽ · Заморожен: ${roundMoney(item.clientDebt.frozenAmount)} ₽`
                  : `Обновлено: ${item.clientDebt?.lastUpdate ? formatDate(item.clientDebt.lastUpdate) : '—'}`
                }
              </Text>
            </View>
            <Text style={styles.debtRowAmount}>{formatMoney(unaccountedClientDebt)} ₽</Text>
          </View>
        )}

        {accrualDetails.length === 0 && item.debts.length === 0 && unaccountedClientDebt === 0 && (item.overstayDebt ?? 0) === 0 && item.totalDebt > 0 && (
          <View style={styles.debtRow}>
            <View style={styles.debtInfo}>
              <Text style={styles.debtDesc}>Задолженность</Text>
              <Text style={styles.debtDate}>Детали недоступны</Text>
            </View>
            <Text style={styles.debtRowAmount}>{formatMoney(item.totalDebt)} ₽</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.payBtn}
          onPress={() => {
            if ((item.clientDebt && item.clientDebt.totalAmount > 0) || item.debts.length > 1) {
              router.push({
                pathname: '/pay-debt-modal',
                params: { clientId: item.client!.id, clientName: item.client!.name, totalDebt: String(item.totalDebt), mode: 'client_debt' },
              });
            } else {
              const firstDebt = item.debts[0];
              if (firstDebt) {
                router.push({
                  pathname: '/pay-debt-modal',
                  params: { debtId: firstDebt.id, clientId: item.client!.id, clientName: item.client!.name, totalDebt: String(item.totalDebt) },
                });
              } else {
                router.push({
                  pathname: '/pay-debt-modal',
                  params: { clientId: item.client!.id, clientName: item.client!.name, totalDebt: String(item.totalDebt), mode: 'client_debt' },
                });
              }
            }
          }}
          activeOpacity={0.7}
        >
          <CreditCard size={18} color={Colors.white} />
          <Text style={styles.payBtnText}>Погасить долг</Text>
        </TouchableOpacity>
      </View>
    );
  }, [router, accrualDetailsByClient]);

  if (debtors.length === 0) {
    return (
      <ShiftGuard allowView>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Нет должников</Text>
          <Text style={styles.emptyText}>Все клиенты оплатили вовремя</Text>
        </View>
      </ShiftGuard>
    );
  }

  return (
    <ShiftGuard allowView>
    <View style={styles.container}>
      <View style={styles.totalBar}>
        <Text style={styles.totalLabel}>Общий долг:</Text>
        <Text style={styles.totalValue}>{formatMoney(debtors.reduce((s, d) => s + d.totalDebt, 0))} ₽</Text>
      </View>
      <FlatList
        data={debtors}
        renderItem={renderItem}
        keyExtractor={item => item.client?.id ?? Math.random().toString()}
        contentContainerStyle={styles.list}
      />
    </View>
    </ShiftGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  totalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.dangerLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.danger,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
    borderLeftWidth: 4,
    borderLeftColor: Colors.danger,
    marginBottom: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  debtBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dangerLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  debtAmount: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  carsText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
    marginBottom: 10,
  },
  debtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  debtInfo: {
    flex: 1,
  },
  debtDesc: {
    fontSize: 13,
    color: Colors.text,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  debtDate: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  debtRowAmount: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    height: 44,
    borderRadius: 10,
    gap: 8,
    marginTop: 12,
  },
  payBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600' as const,
  },
});
