import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Search, Wallet, ChevronRight, Inbox } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { isToday, formatTime } from '@/utils/date';

export default function CashTodayScreen() {
  const router = useRouter();
  const { transactions, clients, cars } = useParking();
  const [search, setSearch] = useState<string>('');

  const cashPayments = useMemo(() => {
    return transactions
      .filter(t => isToday(t.date) && (t.type === 'payment' || t.type === 'debt_payment') && t.amount > 0 && t.method === 'cash')
      .map(t => {
        const client = clients.find(c => c.id === t.clientId);
        const car = cars.find(c => c.id === t.carId);
        return { ...t, client, car };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, clients, cars]);

  const totalCash = useMemo(() => cashPayments.reduce((s, t) => s + t.amount, 0), [cashPayments]);

  const filtered = useMemo(() => {
    if (!search.trim()) return cashPayments;
    const q = search.toLowerCase();
    return cashPayments.filter(t =>
      (t.client?.name ?? '').toLowerCase().includes(q) ||
      (t.car?.plateNumber ?? '').toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    );
  }, [cashPayments, search]);

  const handlePress = useCallback((clientId: string) => {
    router.push({ pathname: '/client-card', params: { clientId } });
  }, [router]);

  const renderItem = useCallback(({ item, index }: { item: typeof filtered[0]; index: number }) => (
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
          <Text style={styles.timeText}>{formatTime(item.date)}</Text>
          <Text style={styles.amountText}>+{item.amount} ₽</Text>
        </View>
        <Text style={styles.clientText}>{item.client?.name ?? '—'}</Text>
        {item.car && <Text style={styles.metaText}>{item.car.plateNumber}</Text>}
        {item.description ? <Text style={styles.descText} numberOfLines={1}>{item.description}</Text> : null}
      </View>
      <ChevronRight size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  ), [handlePress]);

  return (
    <>
      <Stack.Screen options={{ title: 'Наличные сегодня' }} />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerBadge}>
            <Wallet size={18} color={Colors.success} />
            <Text style={styles.headerTitle}>НАЛИЧНЫЕ ПЛАТЕЖИ (итого: {totalCash} ₽)</Text>
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
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.successLight,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  rowNumText: { fontSize: 12, fontWeight: '600' as const, color: Colors.success },
  rowContent: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  timeText: { fontSize: 14, fontWeight: '600' as const, color: Colors.text },
  amountText: { fontSize: 15, fontWeight: '700' as const, color: Colors.success },
  clientText: { fontSize: 13, color: Colors.textSecondary },
  metaText: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  descText: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontStyle: 'italic' as const },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 12 },
});
