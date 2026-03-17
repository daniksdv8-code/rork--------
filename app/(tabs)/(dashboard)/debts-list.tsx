import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Search, Wallet, ChevronRight, Inbox } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatDate } from '@/utils/date';
import { Debt } from '@/types';

export default function DebtsListScreen() {
  const router = useRouter();
  const { debts, clients, cars } = useParking();
  const [search, setSearch] = useState<string>('');

  const activeDebts = useMemo(() => debts.filter(d => d.remainingAmount > 0), [debts]);

  const enrichedDebts = useMemo(() => {
    return activeDebts.map(d => {
      const client = clients.find(c => c.id === d.clientId);
      const car = cars.find(c => c.id === d.carId);
      return { ...d, client, car };
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [activeDebts, clients, cars]);

  const totalDebt = useMemo(() => enrichedDebts.reduce((s, d) => s + d.remainingAmount, 0), [enrichedDebts]);

  const filtered = useMemo(() => {
    if (!search.trim()) return enrichedDebts;
    const q = search.toLowerCase();
    return enrichedDebts.filter(d =>
      (d.client?.name ?? '').toLowerCase().includes(q) ||
      (d.car?.plateNumber ?? '').toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q)
    );
  }, [enrichedDebts, search]);

  const getStatus = useCallback((debt: Debt) => {
    if (debt.remainingAmount <= 0) return 'Погашен';
    if (debt.totalAmount > debt.remainingAmount) return 'Частично';
    return 'Активен';
  }, []);

  const handlePress = useCallback((clientId: string) => {
    router.push({ pathname: '/client-card', params: { clientId } });
  }, [router]);

  const renderItem = useCallback(({ item, index }: { item: typeof filtered[0]; index: number }) => {
    const status = getStatus(item);
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => item.clientId && handlePress(item.clientId)}
      >
        <View style={styles.rowNum}>
          <Text style={styles.rowNumText}>{index + 1}</Text>
        </View>
        <View style={styles.rowContent}>
          <View style={styles.rowTop}>
            <Text style={styles.clientText}>{item.client?.name ?? '—'}</Text>
            <Text style={styles.debtAmount}>{item.remainingAmount} ₽</Text>
          </View>
          {item.car && <Text style={styles.plateText}>{item.car.plateNumber}</Text>}
          <View style={styles.rowBottom}>
            <Text style={styles.metaText}>{formatDate(item.createdAt)}</Text>
            <Text style={[
              styles.statusBadge,
              status === 'Активен' ? styles.statusActive :
              status === 'Частично' ? styles.statusPartial : styles.statusClosed,
            ]}>{status}</Text>
          </View>
          {item.description ? <Text style={styles.descText} numberOfLines={1}>{item.description}</Text> : null}
        </View>
        <ChevronRight size={16} color={Colors.textMuted} />
      </TouchableOpacity>
    );
  }, [getStatus, handlePress]);

  return (
    <>
      <Stack.Screen options={{ title: 'Все долги' }} />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerBadge}>
            <Wallet size={18} color={Colors.danger} />
            <Text style={styles.headerTitle}>ВСЕ ДОЛГИ (итого: {totalDebt} ₽)</Text>
          </View>
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
              <Text style={styles.emptyText}>Нет данных за выбранный период</Text>
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
  clientText: { fontSize: 15, fontWeight: '600' as const, color: Colors.text, flex: 1, marginRight: 8 },
  debtAmount: { fontSize: 15, fontWeight: '700' as const, color: Colors.danger },
  plateText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 2 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontSize: 12, color: Colors.textMuted },
  descText: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontStyle: 'italic' as const },
  statusBadge: { fontSize: 11, fontWeight: '600' as const, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  statusActive: { backgroundColor: Colors.dangerLight, color: Colors.danger },
  statusPartial: { backgroundColor: Colors.warningLight, color: Colors.warning },
  statusClosed: { backgroundColor: Colors.successLight, color: Colors.success },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 12 },
});
