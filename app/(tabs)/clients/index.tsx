import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, ChevronRight, CircleDot } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import ShiftGuard from '@/components/ShiftGuard';
import { Client } from '@/types';

type FilterStatus = 'all' | 'paid' | 'debtors';

export default function ClientsScreen() {
  const router = useRouter();
  const { activeClients, activeCars, debts, subscriptions } = useParking();
  const [search, setSearch] = useState<string>('');
  const [filter, setFilter] = useState<FilterStatus>('all');

  const filteredClients = useMemo(() => {
    let result = activeClients;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(c => {
        const clientCars = activeCars.filter(car => car.clientId === c.id);
        return c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          clientCars.some(car => car.plateNumber.toLowerCase().includes(q));
      });
    }

    if (filter === 'debtors') {
      const debtorIds = new Set(debts.map(d => d.clientId));
      result = result.filter(c => debtorIds.has(c.id));
    } else if (filter === 'paid') {
      const debtorIds = new Set(debts.map(d => d.clientId));
      result = result.filter(c => !debtorIds.has(c.id));
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [activeClients, activeCars, debts, search, filter]);

  const renderClient = useCallback(({ item }: { item: Client }) => {
    const clientCars = activeCars.filter(c => c.clientId === item.id);
    const hasDebt = debts.some(d => d.clientId === item.id);
    const totalDebt = debts.filter(d => d.clientId === item.id).reduce((s, d) => s + d.remainingAmount, 0);
    const sub = subscriptions.find(s => s.clientId === item.id);

    return (
      <TouchableOpacity
        style={styles.clientCard}
        onPress={() => router.push({ pathname: '/client-card', params: { clientId: item.id } })}
        activeOpacity={0.7}
      >
        <View style={styles.clientRow}>
          <View style={[styles.statusDot, hasDebt ? styles.statusDebt : styles.statusPaid]}>
            <CircleDot size={10} color={hasDebt ? Colors.danger : Colors.success} />
          </View>
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>{item.name}</Text>
            <Text style={styles.clientPlates}>
              {clientCars.map(c => c.carModel ? `${c.plateNumber} (${c.carModel})` : c.plateNumber).join(', ') || '—'}
            </Text>
            {hasDebt && (
              <Text style={styles.debtText}>Долг: {totalDebt} ₽</Text>
            )}
            {sub && !hasDebt && (
              <Text style={styles.subText}>
                Оплачено до: {new Date(sub.paidUntil).toLocaleDateString('ru-RU')}
              </Text>
            )}
          </View>
          <ChevronRight size={18} color={Colors.textMuted} />
        </View>
      </TouchableOpacity>
    );
  }, [activeCars, debts, subscriptions, router]);

  return (
    <ShiftGuard allowView>
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchRow}>
          <Search size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск по ФИО, номеру, телефону..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <View style={styles.filterRow}>
          {(['all', 'paid', 'debtors'] as FilterStatus[]).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterBtnText, filter === f && styles.filterBtnTextActive]}>
                {f === 'all' ? 'Все' : f === 'paid' ? 'Оплачено' : 'Должники'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredClients}
        renderItem={renderClient}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Клиенты не найдены</Text>
          </View>
        }
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
  header: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.inputBg,
  },
  filterBtnActive: {
    backgroundColor: Colors.primary,
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  filterBtnTextActive: {
    color: Colors.white,
  },
  list: {
    padding: 16,
    gap: 8,
  },
  clientCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 2,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPaid: {
    backgroundColor: Colors.successLight,
  },
  statusDebt: {
    backgroundColor: Colors.dangerLight,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  clientPlates: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  debtText: {
    fontSize: 12,
    color: Colors.danger,
    fontWeight: '500' as const,
    marginTop: 2,
  },
  subText: {
    fontSize: 12,
    color: Colors.success,
    marginTop: 2,
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
