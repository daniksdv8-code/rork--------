import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Search, AlertTriangle, ChevronRight, Inbox } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';

export default function DebtorsListScreen() {
  const router = useRouter();
  const { debtors } = useParking();
  const [search, setSearch] = useState<string>('');

  const totalDebt = useMemo(() => debtors.reduce((s, d) => s + d.totalDebt, 0), [debtors]);

  const filtered = useMemo(() => {
    if (!search.trim()) return debtors;
    const q = search.toLowerCase();
    return debtors.filter(d =>
      (d.client?.name ?? '').toLowerCase().includes(q) ||
      d.cars.some(c => c.plateNumber.toLowerCase().includes(q))
    );
  }, [debtors, search]);

  const handlePress = useCallback((clientId: string) => {
    router.push({ pathname: '/client-card', params: { clientId } });
  }, [router]);

  const renderItem = useCallback(({ item, index }: { item: typeof filtered[0]; index: number }) => (
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
          <Text style={styles.clientText}>{item.client?.name ?? '—'}</Text>
          <Text style={styles.debtAmount}>{item.totalDebt} ₽</Text>
        </View>
        <Text style={styles.carsText}>
          {item.cars.map(c => c.plateNumber).join(', ') || '—'}
        </Text>
        <Text style={styles.metaText}>Долгов: {item.debts.length}</Text>
      </View>
      <ChevronRight size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  ), [handlePress]);

  return (
    <>
      <Stack.Screen options={{ title: 'Должники' }} />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerBadge}>
            <AlertTriangle size={18} color={Colors.danger} />
            <Text style={styles.headerTitle}>ДОЛЖНИКИ ({filtered.length} чел., общий долг: {totalDebt} ₽)</Text>
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
  clientText: { fontSize: 15, fontWeight: '600' as const, color: Colors.text, flex: 1 },
  debtAmount: { fontSize: 15, fontWeight: '700' as const, color: Colors.danger },
  carsText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 2 },
  metaText: { fontSize: 12, color: Colors.textMuted },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 12 },
});
