import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Search, AlertTriangle, ChevronRight, Inbox } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney } from '@/utils/money';

export default function DebtorsListScreen() {
  const router = useRouter();
  const { debtors, sessions, dailyDebtAccruals, cars, getClientTotalDebt } = useParking() as any;
  const [search, setSearch] = useState<string>('');

  const enrichedDebtors = useMemo(() => {
    return debtors.map((d: any) => {
      const liveDebt = d.client ? getClientTotalDebt(d.client.id) : d.totalDebt;
      const debtCarIds = new Set<string>();
      if (d.debts) {
        for (const debt of d.debts) {
          if (debt.carId) debtCarIds.add(debt.carId);
        }
      }
      if (d.client) {
        const debtSessions = sessions.filter((s: any) =>
          s.clientId === d.client.id &&
          (s.status === 'active_debt' || s.status === 'released_debt') &&
          !s.cancelled
        );
        for (const s of debtSessions) {
          if (s.carId) debtCarIds.add(s.carId);
        }
        const overstaySessionsForClient = sessions.filter((s: any) =>
          s.clientId === d.client.id &&
          s.status === 'active' &&
          !s.cancelled &&
          s.serviceType !== 'lombard' &&
          s.tariffType !== 'lombard'
        );
        if ((d.overstayDebt ?? 0) > 0) {
          for (const s of overstaySessionsForClient) {
            if (s.carId) debtCarIds.add(s.carId);
          }
        }
      }
      const debtCars = debtCarIds.size > 0
        ? Array.from(debtCarIds).map((carId: string) => {
            const car = (d.cars as any[])?.find((c: any) => c.id === carId)
              ?? cars.find((c: any) => c.id === carId);
            return car ? car.plateNumber : null;
          }).filter(Boolean)
        : d.cars.map((c: any) => c.plateNumber);
      return { ...d, liveDebt: liveDebt > 0 ? liveDebt : d.totalDebt, debtCarPlates: debtCars };
    }).filter((d: any) => d.client && d.liveDebt > 0);
  }, [debtors, sessions, cars, getClientTotalDebt]);

  const totalDebt = useMemo(() => enrichedDebtors.reduce((s: number, d: any) => s + d.liveDebt, 0), [enrichedDebtors]);

  const filtered = useMemo(() => {
    if (!search.trim()) return enrichedDebtors;
    const q = search.toLowerCase();
    return enrichedDebtors.filter((d: any) =>
      (d.client?.name ?? '').toLowerCase().includes(q) ||
      d.cars.some((c: any) => c.plateNumber.toLowerCase().includes(q)) ||
      (d.debtCarPlates as string[]).some((p: string) => p.toLowerCase().includes(q))
    );
  }, [enrichedDebtors, search]);

  const handlePress = useCallback((clientId: string) => {
    router.push({ pathname: '/client-card', params: { clientId } });
  }, [router]);

  const renderItem = useCallback(({ item, index }: { item: typeof filtered[0]; index: number }) => {
    const hasLombardSession = item.client ? (
      sessions.some((s: any) =>
        s.clientId === item.client!.id &&
        (s.tariffType === 'lombard' || s.serviceType === 'lombard') &&
        s.status === 'active_debt'
      ) ||
      item.debts.some((d: any) => d.description?.includes('Ломбард'))
    ) : false;

    const activeAccrualCount = item.client ? sessions.filter((s: any) =>
      s.clientId === item.client!.id &&
      s.status === 'active_debt' &&
      !s.cancelled &&
      dailyDebtAccruals.some((a: any) => a.parkingEntryId === s.id)
    ).length : 0;

    const hasOverstay = (item as any).overstayDebt > 0;
    const totalDebtSources = item.debts.length + activeAccrualCount + (hasOverstay ? 1 : 0);

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => item.client && handlePress(item.client.id)}
      >
        <View style={styles.rowNum}>
          <Text style={styles.rowNumText}>{index + 1}</Text>
        </View>
        <View style={styles.rowContent}>
          <View style={styles.rowTop}>
            <View style={styles.clientRow}>
              <Text style={styles.clientText}>{item.client?.name ?? '—'}</Text>
              {hasLombardSession && (
                <View style={styles.lombardTag}>
                  <Text style={styles.lombardTagText}>Ломбард</Text>
                </View>
              )}
              {hasOverstay && (
                <View style={styles.overstayTag}>
                  <Text style={styles.overstayTagText}>Просрочка</Text>
                </View>
              )}
            </View>
            <Text style={styles.debtAmount}>{formatMoney(item.liveDebt)} ₽</Text>
          </View>
          <Text style={styles.carsText}>
            {(item.debtCarPlates as string[]).length > 0
              ? (item.debtCarPlates as string[]).join(', ')
              : item.cars.map((c: any) => c.plateNumber).join(', ') || '—'}
          </Text>
          <Text style={styles.metaText}>Записей долга: {totalDebtSources}</Text>
        </View>
        <ChevronRight size={16} color={Colors.textMuted} />
      </TouchableOpacity>
    );
  }, [handlePress, sessions, dailyDebtAccruals]);

  return (
    <>
      <Stack.Screen options={{ title: 'Должники' }} />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerBadge}>
            <AlertTriangle size={18} color={Colors.danger} />
            <Text style={styles.headerTitle}>ДОЛЖНИКИ ({filtered.length} чел., общий долг: {formatMoney(totalDebt)} ₽)</Text>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Search size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск по ФИО, номеру авто..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={item => item.client?.id ?? Math.random().toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Inbox size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Нет должников</Text>
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
  headerTitle: { fontSize: 13, fontWeight: '700' as const, color: Colors.text, letterSpacing: 0.5, flex: 1 },
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
  rowNumText: { fontSize: 12, fontWeight: '600' as const, color: Colors.danger },
  rowContent: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  clientRow: { flexDirection: 'row' as const, alignItems: 'center' as const, flex: 1, gap: 6 },
  clientText: { fontSize: 15, fontWeight: '600' as const, color: Colors.text },
  lombardTag: { backgroundColor: '#fef3c7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  lombardTagText: { fontSize: 10, fontWeight: '700' as const, color: '#b45309' },
  overstayTag: { backgroundColor: '#fee2e2', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  overstayTagText: { fontSize: 10, fontWeight: '700' as const, color: '#dc2626' },
  debtAmount: { fontSize: 15, fontWeight: '700' as const, color: Colors.danger },
  carsText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 2 },
  metaText: { fontSize: 12, color: Colors.textMuted },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 12 },
});
