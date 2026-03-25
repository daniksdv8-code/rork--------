import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, Phone, CreditCard } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import ShiftGuard from '@/components/ShiftGuard';
import { formatDate } from '@/utils/date';

export default function DebtorsScreen() {
  const router = useRouter();
  const { debtors } = useParking();

  const renderItem = useCallback(({ item }: { item: typeof debtors[0] }) => {
    if (!item.client) return null;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.debtBadge}>
            <AlertTriangle size={14} color={Colors.danger} />
            <Text style={styles.debtAmount}>{item.totalDebt} ₽</Text>
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
        {item.debts.map(debt => (
          <View key={debt.id} style={styles.debtRow}>
            <View style={styles.debtInfo}>
              <Text style={styles.debtDesc}>{debt.description}</Text>
              <Text style={styles.debtDate}>{formatDate(debt.createdAt)}</Text>
            </View>
            <Text style={styles.debtRowAmount}>{debt.remainingAmount} ₽</Text>
          </View>
        ))}
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
  }, [router]);

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
        <Text style={styles.totalValue}>{debtors.reduce((s, d) => s + d.totalDebt, 0)} ₽</Text>
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
