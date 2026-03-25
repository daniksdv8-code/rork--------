import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Search, Car, ChevronRight, Inbox } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatDateTime, calculateDays } from '@/utils/date';
import { ParkingSession } from '@/types';

export default function ParkedNowScreen() {
  const router = useRouter();
  const { activeSessions, cars, clients, subscriptions, tariffs } = useParking();
  const [search, setSearch] = useState<string>('');

  const enrichedSessions = useMemo(() => {
    return activeSessions.map(session => {
      const car = cars.find(c => c.id === session.carId);
      const client = clients.find(c => c.id === session.clientId);
      const sub = subscriptions.find(s => s.carId === session.carId);
      const days = calculateDays(session.entryTime);
      const isLombard = session.tariffType === 'lombard' || session.serviceType === 'lombard';
      const lombardRate = session.lombardRateApplied ?? tariffs.lombardRate;
      const isDebt = session.status === 'active_debt';
      let expectedAmount = 0;
      let tariffLabel = '';
      if (isLombard) {
        expectedAmount = days * lombardRate;
        tariffLabel = `ломбард ${days} дн. × ${lombardRate} ₽`;
      } else if (session.serviceType === 'monthly') {
        expectedAmount = days * tariffs.monthlyCash;
        tariffLabel = `месяц ${days} дн. × ${tariffs.monthlyCash} ₽`;
      } else {
        expectedAmount = days * tariffs.onetimeCash;
        tariffLabel = `${days} дн. × ${tariffs.onetimeCash} ₽`;
      }
      const isPaid = !isDebt && !isLombard && session.prepaidAmount != null && session.prepaidAmount > 0;
      const paymentStatus = isLombard ? 'Ломбард' : isDebt ? 'В долг' : (isPaid ? 'Оплачено' : (session.serviceType === 'monthly' ? 'Абонемент' : 'Активен'));
      return {
        ...session,
        car,
        client,
        sub,
        days,
        expectedAmount,
        tariffLabel,
        paymentStatus,
        isPaid,
        isLombard,
      };
    });
  }, [activeSessions, cars, clients, subscriptions, tariffs]);

  const filtered = useMemo(() => {
    if (!search.trim()) return enrichedSessions;
    const q = search.toLowerCase();
    return enrichedSessions.filter(s =>
      (s.car?.plateNumber ?? '').toLowerCase().includes(q) ||
      (s.car?.carModel ?? '').toLowerCase().includes(q) ||
      (s.client?.name ?? '').toLowerCase().includes(q)
    );
  }, [enrichedSessions, search]);

  const handlePress = useCallback((session: ParkingSession & { client?: { id: string } | null }) => {
    if (session.client?.id) {
      router.push({ pathname: '/client-card', params: { clientId: session.client.id } });
    }
  }, [router]);

  const renderItem = useCallback(({ item, index }: { item: typeof filtered[0]; index: number }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => handlePress(item)}
    >
      <View style={styles.rowNum}>
        <Text style={styles.rowNumText}>{index + 1}</Text>
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={styles.plateText}>{item.car?.plateNumber ?? '—'}</Text>
          <Text style={[
            styles.statusBadge,
            item.isLombard ? styles.statusLombard
              : item.paymentStatus === 'В долг' ? styles.statusDebt
              : item.paymentStatus === 'Оплачено' ? styles.statusPaid
              : item.paymentStatus === 'Абонемент' ? styles.statusActive
              : styles.statusActive,
          ]}>{item.paymentStatus}</Text>
        </View>
        <Text style={styles.clientText}>{item.client?.name ?? '—'}</Text>
        <View style={styles.rowBottom}>
          <Text style={styles.metaText}>{formatDateTime(item.entryTime)}</Text>
          <Text style={styles.amountText}>{item.expectedAmount} ₽ ({item.tariffLabel})</Text>
        </View>
      </View>
      <ChevronRight size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  ), [handlePress]);

  return (
    <>
      <Stack.Screen options={{ title: 'На парковке' }} />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerBadge}>
            <Car size={18} color={Colors.info} />
            <Text style={styles.headerTitle}>АКТИВНЫЕ ЗАЕЗДЫ ({filtered.length} шт.)</Text>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Search size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск по номеру, ФИО..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="characters"
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
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.infoLight,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  rowNumText: { fontSize: 12, fontWeight: '600' as const, color: Colors.info },
  rowContent: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  plateText: { fontSize: 15, fontWeight: '700' as const, color: Colors.text },
  clientText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontSize: 12, color: Colors.textMuted },
  amountText: { fontSize: 13, fontWeight: '600' as const, color: Colors.text },
  statusBadge: { fontSize: 11, fontWeight: '600' as const, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  statusPaid: { backgroundColor: Colors.successLight, color: Colors.success },
  statusDebt: { backgroundColor: Colors.dangerLight, color: Colors.danger },
  statusActive: { backgroundColor: Colors.infoLight, color: Colors.info },
  statusLombard: { backgroundColor: '#fef3c7', color: '#b45309' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 12 },
});
