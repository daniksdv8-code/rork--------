import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Search, Wallet, ChevronRight, Inbox, Clock } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatDate } from '@/utils/date';
import { roundMoney } from '@/utils/money';
import { Client, Car } from '@/types';
import { calculateStoredDebtTotal } from '@/utils/financeCalculations';

interface DebtRow {
  id: string;
  clientId: string;
  client: Client | undefined;
  car: Car | undefined;
  plateNumber: string;
  amount: number;
  description: string;
  date: string;
  source: 'old_debt' | 'accrual';
  status: string;
  isFrozen: boolean;
  days?: number;
  rate?: number;
  serviceType?: string;
}

export default function DebtsListScreen() {
  const router = useRouter();
  const {
    debts, clients, cars, sessions,
    dailyDebtAccruals, clientDebts, tariffs,
  } = useParking();
  const [search, setSearch] = useState<string>('');

  const allDebtRows = useMemo(() => {
    const rows: DebtRow[] = [];

    const activeOldDebts = debts.filter(d => d.remainingAmount > 0);
    for (const d of activeOldDebts) {
      const client = clients.find(c => c.id === d.clientId);
      const car = cars.find(c => c.id === d.carId);
      const isPartial = d.totalAmount > d.remainingAmount;
      rows.push({
        id: d.id,
        clientId: d.clientId,
        client,
        car,
        plateNumber: car?.plateNumber ?? '—',
        amount: d.remainingAmount,
        description: d.description || 'Долг',
        date: d.createdAt,
        source: 'old_debt',
        status: isPartial ? 'Частично' : 'Активен',
        isFrozen: false,
      });
    }

    const activeDebtIds = new Set(activeOldDebts.map(d => d.parkingEntryId).filter(Boolean));

    const debtSessions = sessions.filter(s =>
      s.status === 'active_debt' && !s.cancelled && !activeDebtIds.has(s.id)
    );

    for (const session of debtSessions) {
      const sessionAccruals = dailyDebtAccruals.filter(a => a.parkingEntryId === session.id);
      if (sessionAccruals.length === 0) continue;

      const client = clients.find(c => c.id === session.clientId);
      const car = cars.find(c => c.id === session.carId);
      const isLombard = session.serviceType === 'lombard';
      let rate: number;
      if (isLombard) {
        rate = session.lombardRateApplied ?? tariffs.lombardRate;
      } else if (session.serviceType === 'monthly') {
        rate = tariffs.monthlyCash;
      } else {
        rate = tariffs.onetimeCash;
      }

      const days = sessionAccruals.length;
      const amount = roundMoney(days * rate);
      const serviceLabel = isLombard ? 'ломбард' : session.serviceType === 'monthly' ? 'месяц' : 'разово';

      rows.push({
        id: `accrual_${session.id}`,
        clientId: session.clientId,
        client,
        car,
        plateNumber: car?.plateNumber ?? '—',
        amount,
        description: `${serviceLabel} · ${days} дн. × ${rate} ₽`,
        date: sessionAccruals[0]?.createdAt ?? session.entryTime,
        source: 'accrual',
        status: 'На парковке',
        isFrozen: false,
        days,
        rate,
        serviceType: serviceLabel,
      });
    }

    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return rows;
  }, [debts, clients, cars, sessions, dailyDebtAccruals, tariffs]);

  const totalDebt = useMemo(() => {
    return calculateStoredDebtTotal(debts, clientDebts).total;
  }, [debts, clientDebts]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allDebtRows;
    const q = search.toLowerCase();
    return allDebtRows.filter(d =>
      (d.client?.name ?? '').toLowerCase().includes(q) ||
      d.plateNumber.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q)
    );
  }, [allDebtRows, search]);

  const handlePress = useCallback((clientId: string) => {
    router.push({ pathname: '/client-card', params: { clientId } });
  }, [router]);

  const renderItem = useCallback(({ item, index }: { item: DebtRow; index: number }) => {
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => item.clientId && handlePress(item.clientId)}
      >
        <View style={[styles.rowNum, item.source === 'accrual' && styles.rowNumAccrual]}>
          <Text style={[styles.rowNumText, item.source === 'accrual' && styles.rowNumTextAccrual]}>{index + 1}</Text>
        </View>
        <View style={styles.rowContent}>
          <View style={styles.rowTop}>
            <Text style={styles.clientText} numberOfLines={1}>{item.client?.name ?? '—'}</Text>
            <Text style={styles.debtAmount}>{item.amount} ₽</Text>
          </View>
          <Text style={styles.plateText}>{item.plateNumber}</Text>
          <View style={styles.rowBottom}>
            <Text style={styles.metaText}>{formatDate(item.date)}</Text>
            <View style={[
              styles.statusBadgeWrap,
              item.status === 'Активен' || item.status === 'На парковке' ? styles.statusActiveBg :
              item.status === 'Частично' ? styles.statusPartialBg :
              item.isFrozen ? styles.statusFrozenBg : styles.statusActiveBg,
            ]}>
              {item.isFrozen && <Clock size={10} color={Colors.info} />}
              <Text style={[
                styles.statusBadgeText,
                item.status === 'Активен' || item.status === 'На парковке' ? styles.statusActiveColor :
                item.status === 'Частично' ? styles.statusPartialColor :
                item.isFrozen ? styles.statusFrozenColor : styles.statusActiveColor,
              ]}>{item.status}</Text>
            </View>
          </View>
          <Text style={styles.descText} numberOfLines={1}>{item.description}</Text>
        </View>
        <ChevronRight size={16} color={Colors.textMuted} />
      </TouchableOpacity>
    );
  }, [handlePress]);

  return (
    <>
      <Stack.Screen options={{ title: 'Все долги' }} />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerBadge}>
            <Wallet size={18} color={Colors.danger} />
            <Text style={styles.headerTitle}>ВСЕ ДОЛГИ (итого: {totalDebt} ₽)</Text>
          </View>
          <Text style={styles.headerSubtitle}>
            Записей: {filtered.length}
          </Text>
        </View>

        <View style={styles.searchWrap}>
          <Search size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск по ФИО, номеру, описанию..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Inbox size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Нет активных долгов</Text>
            </View>
          }
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 14, fontWeight: '700' as const, color: Colors.text, letterSpacing: 0.5 },
  headerSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card,
    marginHorizontal: 16, borderRadius: 10, paddingHorizontal: 12, height: 42,
    gap: 8, borderWidth: 1, borderColor: Colors.cardBorder, marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card,
    borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.cardBorder,
  },
  rowNum: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.dangerLight,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  rowNumAccrual: {
    backgroundColor: Colors.warningLight,
  },
  rowNumText: { fontSize: 12, fontWeight: '600' as const, color: Colors.danger },
  rowNumTextAccrual: { color: Colors.warning },
  rowContent: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  clientText: { fontSize: 15, fontWeight: '600' as const, color: Colors.text, flex: 1, marginRight: 8 },
  debtAmount: { fontSize: 15, fontWeight: '700' as const, color: Colors.danger },
  plateText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 2 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  metaText: { fontSize: 12, color: Colors.textMuted },
  descText: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' as const },
  statusBadgeWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '600' as const },
  statusActiveBg: { backgroundColor: Colors.dangerLight },
  statusActiveColor: { color: Colors.danger },
  statusPartialBg: { backgroundColor: Colors.warningLight },
  statusPartialColor: { color: Colors.warning },
  statusFrozenBg: { backgroundColor: Colors.infoLight },
  statusFrozenColor: { color: Colors.info },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 12 },
});
