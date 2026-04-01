import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Search, Wallet, ChevronRight, Inbox, Clock } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney } from '@/utils/money';

interface DebtClientRow {
  clientId: string;
  clientName: string;
  totalDebt: number;
  plates: string[];
  debtSources: number;
  hasLombard: boolean;
  hasOverstay: boolean;
  hasFrozen: boolean;
}

export default function DebtsListScreen() {
  const router = useRouter();
  const {
    debtors, sessions, dailyDebtAccruals, cars, getClientTotalDebt,
  } = useParking() as any;
  const [search, setSearch] = useState<string>('');

  const clientRows = useMemo(() => {
    const rows: DebtClientRow[] = [];

    for (const d of debtors) {
      if (!d.client) continue;
      const clientId = d.client.id as string;
      const liveDebt = getClientTotalDebt(clientId);
      const displayDebt = liveDebt > 0 ? liveDebt : d.totalDebt;
      if (displayDebt <= 0) continue;

      const debtCarIds = new Set<string>();
      if (d.debts) {
        for (const debt of d.debts) {
          if (debt.carId) debtCarIds.add(debt.carId);
        }
      }

      const clientSessions = sessions.filter((s: any) =>
        s.clientId === clientId &&
        (s.status === 'active_debt' || s.status === 'released_debt') &&
        !s.cancelled
      );
      for (const s of clientSessions) {
        if (s.carId) debtCarIds.add(s.carId);
      }

      if ((d.overstayDebt ?? 0) > 0) {
        const overstaySessions = sessions.filter((s: any) =>
          s.clientId === clientId &&
          s.status === 'active' &&
          !s.cancelled &&
          s.serviceType !== 'lombard' &&
          s.tariffType !== 'lombard'
        );
        for (const s of overstaySessions) {
          if (s.carId) debtCarIds.add(s.carId);
        }
      }

      const plates = debtCarIds.size > 0
        ? Array.from(debtCarIds).map((carId: string) => {
            const car = (d.cars as any[])?.find((c: any) => c.id === carId)
              ?? cars.find((c: any) => c.id === carId);
            return car ? car.plateNumber : null;
          }).filter(Boolean) as string[]
        : (d.cars ?? []).map((c: any) => c.plateNumber).filter(Boolean) as string[];

      const hasLombard = sessions.some((s: any) =>
        s.clientId === clientId &&
        (s.tariffType === 'lombard' || s.serviceType === 'lombard') &&
        s.status === 'active_debt'
      ) || (d.debts ?? []).some((debt: any) => debt.description?.includes('Ломбард'));

      const activeAccrualCount = sessions.filter((s: any) =>
        s.clientId === clientId &&
        s.status === 'active_debt' &&
        !s.cancelled &&
        dailyDebtAccruals.some((a: any) => a.parkingEntryId === s.id)
      ).length;

      const hasOverstay = (d.overstayDebt ?? 0) > 0;
      const hasFrozen = clientSessions.some((s: any) => s.status === 'released_debt');
      const debtSources = (d.debts?.length ?? 0) + activeAccrualCount + (hasOverstay ? 1 : 0);

      rows.push({
        clientId,
        clientName: d.client.name ?? '—',
        totalDebt: displayDebt,
        plates,
        debtSources: Math.max(debtSources, 1),
        hasLombard,
        hasOverstay,
        hasFrozen,
      });
    }

    rows.sort((a, b) => b.totalDebt - a.totalDebt);
    return rows;
  }, [debtors, sessions, cars, dailyDebtAccruals, getClientTotalDebt]);

  const grandTotal = useMemo(() => clientRows.reduce((s, r) => s + r.totalDebt, 0), [clientRows]);

  const filtered = useMemo(() => {
    if (!search.trim()) return clientRows;
    const q = search.toLowerCase();
    return clientRows.filter(r =>
      r.clientName.toLowerCase().includes(q) ||
      r.plates.some(p => p.toLowerCase().includes(q))
    );
  }, [clientRows, search]);

  const handlePress = useCallback((clientId: string) => {
    router.push({ pathname: '/client-card', params: { clientId } });
  }, [router]);

  const renderItem = useCallback(({ item, index }: { item: DebtClientRow; index: number }) => {
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => handlePress(item.clientId)}
      >
        <View style={styles.rowNum}>
          <Text style={styles.rowNumText}>{index + 1}</Text>
        </View>
        <View style={styles.rowContent}>
          <View style={styles.rowTop}>
            <View style={styles.clientRow}>
              <Text style={styles.clientText} numberOfLines={1}>{item.clientName}</Text>
              {item.hasLombard && (
                <View style={styles.lombardTag}>
                  <Text style={styles.lombardTagText}>Ломбард</Text>
                </View>
              )}
              {item.hasOverstay && (
                <View style={styles.overstayTag}>
                  <Text style={styles.overstayTagText}>Просрочка</Text>
                </View>
              )}
              {item.hasFrozen && (
                <View style={styles.frozenTag}>
                  <Clock size={9} color={Colors.info} />
                  <Text style={styles.frozenTagText}>Выпущен</Text>
                </View>
              )}
            </View>
            <Text style={styles.debtAmount}>{formatMoney(item.totalDebt)} ₽</Text>
          </View>
          <Text style={styles.plateText}>
            {item.plates.length > 0 ? item.plates.join(', ') : '—'}
          </Text>
          <Text style={styles.metaText}>Записей долга: {item.debtSources}</Text>
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
            <Text style={styles.headerTitle}>ВСЕ ДОЛГИ (итого: {formatMoney(grandTotal)} ₽)</Text>
          </View>
          <Text style={styles.headerSubtitle}>
            Должников: {filtered.length}
          </Text>
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
          keyExtractor={item => item.clientId}
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
  rowNumText: { fontSize: 12, fontWeight: '600' as const, color: Colors.danger },
  rowContent: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  clientRow: { flexDirection: 'row' as const, alignItems: 'center' as const, flex: 1, gap: 6, flexWrap: 'wrap' as const },
  clientText: { fontSize: 15, fontWeight: '600' as const, color: Colors.text, flexShrink: 1 },
  lombardTag: { backgroundColor: '#fef3c7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  lombardTagText: { fontSize: 10, fontWeight: '700' as const, color: '#b45309' },
  overstayTag: { backgroundColor: '#fee2e2', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  overstayTagText: { fontSize: 10, fontWeight: '700' as const, color: '#dc2626' },
  frozenTag: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, backgroundColor: '#dbeafe', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  frozenTagText: { fontSize: 10, fontWeight: '700' as const, color: Colors.info },
  debtAmount: { fontSize: 15, fontWeight: '700' as const, color: Colors.danger },
  plateText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 2 },
  metaText: { fontSize: 12, color: Colors.textMuted },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 12 },
});
