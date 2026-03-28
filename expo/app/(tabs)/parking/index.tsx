import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { LogOut as LogOutIcon, Clock, Wallet, XCircle, User, Search, X, Calendar } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { useAuth } from '@/providers/AuthProvider';
import ShiftGuard from '@/components/ShiftGuard';
import { formatDateTime, calculateDays, formatDate } from '@/utils/date';
import { ParkingSession } from '@/types';

export default function ParkingScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { activeSessions, cars, clients, tariffs, cancelCheckIn, needsShiftCheck, subscriptions } = useParking();
  const [searchQuery, setSearchQuery] = useState<string>('');

  const shiftRequired = needsShiftCheck();

  const sessionData = useMemo(() => {
    const now = new Date().toISOString();
    return activeSessions.map(session => {
      const car = cars.find(c => c.id === session.carId);
      const client = clients.find(c => c.id === session.clientId);
      const days = calculateDays(session.entryTime, now);
      const runningCostCash = tariffs.onetimeCash * days;
      const runningCostCard = tariffs.onetimeCard * days;
      const sub = subscriptions.find(s => s.carId === session.carId && s.clientId === session.clientId);
      const subscriptionExpired = sub ? new Date(sub.paidUntil) < new Date() : false;
      return { session, car, client, days, runningCostCash, runningCostCard, subscription: sub ?? null, subscriptionExpired };
    }).sort((a, b) => new Date(b.session.entryTime).getTime() - new Date(a.session.entryTime).getTime());
  }, [activeSessions, cars, clients, tariffs, subscriptions]);

  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return sessionData;
    return sessionData.filter(item => {
      const plate = (item.car?.plateNumber ?? '').toLowerCase();
      const model = (item.car?.carModel ?? '').toLowerCase();
      const name = (item.client?.name ?? '').toLowerCase();
      const phone = (item.client?.phone ?? '').replace(/\D/g, '');
      const queryDigits = q.replace(/\D/g, '');
      return plate.includes(q) ||
        model.includes(q) ||
        name.includes(q) ||
        (queryDigits.length >= 3 && phone.includes(queryDigits));
    });
  }, [sessionData, searchQuery]);

  const handleExit = useCallback((session: ParkingSession) => {
    if (!isAdmin && shiftRequired) {
      Alert.alert('Смена не открыта', 'Откройте смену, чтобы оформить выезд.');
      return;
    }
    router.push({
      pathname: '/exit-modal',
      params: { sessionId: session.id },
    });
  }, [router, shiftRequired, isAdmin]);

  const handleCancelCheckIn = useCallback((session: ParkingSession) => {
    const car = cars.find(c => c.id === session.carId);
    Alert.alert(
      'Отмена заезда',
      `Отменить заезд ${car?.plateNumber ?? ''}? Авто будет убрано с парковки.`,
      [
        { text: 'Нет', style: 'cancel' },
        {
          text: 'Да, отменить',
          style: 'destructive',
          onPress: () => {
            cancelCheckIn(session.id);
            Alert.alert('Готово', 'Заезд отменён');
          },
        },
      ]
    );
  }, [cars, cancelCheckIn]);

  const handleCardPress = useCallback((clientId: string) => {
    router.push({ pathname: '/client-card', params: { clientId } });
  }, [router]);

  const renderItem = useCallback(({ item }: { item: typeof sessionData[0] }) => {
    const isMonthly = item.session.serviceType === 'monthly';
    const isOnetime = item.session.serviceType === 'onetime';
    const isLombard = item.session.tariffType === 'lombard' || item.session.serviceType === 'lombard';
    const isDebt = item.session.status === 'active_debt';
    const badgeLabel = isLombard ? 'Ломбард' : isMonthly ? 'Месяц' : 'Разово';
    const badgeStyle = isLombard ? styles.typeBadgeLombard : isMonthly ? styles.typeBadgeMonthly : styles.typeBadgeOnetime;
    const badgeTextStyle = isLombard ? styles.typeBadgeTextLombard : isMonthly ? styles.typeBadgeTextMonthly : styles.typeBadgeTextOnetime;
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => handleCardPress(item.session.clientId)}>
        <View style={styles.cardHeader}>
          <View style={styles.plateContainer}>
            <Text style={styles.plateText}>{item.car?.plateNumber ?? '—'}</Text>
            {item.car?.carModel ? <Text style={styles.carModelText}>{item.car.carModel}</Text> : null}
          </View>
          <View style={styles.badgeRow}>
            {isDebt && !isLombard && (
              <View style={styles.typeBadgeDebt}>
                <Text style={styles.typeBadgeTextDebt}>В долг</Text>
              </View>
            )}
            <View style={[styles.typeBadge, badgeStyle]}>
              <Text style={[styles.typeBadgeText, badgeTextStyle]}>
                {badgeLabel}
              </Text>
            </View>
          </View>
        </View>
        <Text style={styles.clientName}>{item.client?.name ?? '—'}</Text>

        {item.session.managerName ? (
          <View style={styles.managerRow}>
            <User size={12} color={Colors.textMuted} />
            <Text style={styles.managerText}>{item.session.managerName}</Text>
          </View>
        ) : null}

        <View style={styles.timeRow}>
          <Clock size={14} color={Colors.textMuted} />
          <Text style={styles.timeText}>Въезд: {formatDateTime(item.session.entryTime)}</Text>
        </View>

        {item.session.plannedDepartureTime ? (
          <View style={styles.plannedRow}>
            <Clock size={14} color={Colors.info} />
            <Text style={styles.plannedText}>План. выезд: {item.session.plannedDepartureTime}</Text>
          </View>
        ) : null}

        {isLombard && (
          <View style={[styles.costRow, { backgroundColor: '#fef3c7' }]}>
            <Wallet size={14} color="#b45309" />
            <Text style={[styles.costLabel, { color: '#b45309' }]}>
              {item.days} сут. × {item.session.lombardRateApplied ?? tariffs.lombardRate} ₽
            </Text>
            <Text style={[styles.costValue, { color: '#b45309' }]}>
              {item.days * (item.session.lombardRateApplied ?? tariffs.lombardRate)} ₽
            </Text>
          </View>
        )}

        {isOnetime && !isLombard && (
          <View style={styles.costRow}>
            <Wallet size={14} color={Colors.warning} />
            <Text style={styles.costLabel}>
              {item.days} сут. × {tariffs.onetimeCash}–{tariffs.onetimeCard} ₽
            </Text>
            <Text style={styles.costValue}>
              {item.runningCostCash}–{item.runningCostCard} ₽
            </Text>
          </View>
        )}

        {isMonthly && isDebt && !isLombard && (
          <View style={[styles.costRow, { backgroundColor: Colors.dangerLight }]}>
            <Wallet size={14} color={Colors.danger} />
            <Text style={[styles.costLabel, { color: Colors.danger }]}>
              {item.days} сут. × {tariffs.monthlyCash}–{tariffs.monthlyCard} ₽
            </Text>
            <Text style={[styles.costValue, { color: Colors.danger }]}>
              {tariffs.monthlyCash * item.days}–{tariffs.monthlyCard * item.days} ₽
            </Text>
          </View>
        )}

        {item.subscription !== null && (
          <View style={[
            styles.subRow,
            item.subscriptionExpired ? styles.subRowExpired : styles.subRowActive,
          ]}>
            <Calendar size={13} color={item.subscriptionExpired ? Colors.danger : Colors.success} />
            <Text style={[
              styles.subText,
              { color: item.subscriptionExpired ? Colors.danger : Colors.success },
            ]}>
              {item.subscriptionExpired
                ? `Абонемент истёк ${formatDate(item.subscription.paidUntil)}`
                : `Абонемент до ${formatDate(item.subscription.paidUntil)}`
              }
            </Text>
          </View>
        )}

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.exitBtn}
            onPress={() => handleExit(item.session)}
            activeOpacity={0.7}
          >
            <LogOutIcon size={18} color={Colors.white} />
            <Text style={styles.exitBtnText}>Выезд</Text>
          </TouchableOpacity>

          {isAdmin && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => handleCancelCheckIn(item.session)}
              activeOpacity={0.7}
            >
              <XCircle size={16} color={Colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [handleExit, handleCancelCheckIn, handleCardPress, tariffs, isAdmin]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  if (sessionData.length === 0) {
    return (
      <ShiftGuard allowView>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Парковка пуста</Text>
          <Text style={styles.emptyText}>Нет активных заездов</Text>
        </View>
      </ShiftGuard>
    );
  }

  return (
    <ShiftGuard allowView>
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <View style={styles.searchInputContainer}>
          <Search size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск: номер, ФИО, телефон..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            testID="parking-search-input"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.countBar}>
        <Text style={styles.countText}>
          На парковке: <Text style={styles.countValue}>{sessionData.length}</Text>
          {searchQuery.trim().length > 0 && filteredData.length !== sessionData.length ? (
            <Text style={styles.countFiltered}> (найдено: {filteredData.length})</Text>
          ) : null}
        </Text>
      </View>
      <FlatList
        data={filteredData}
        renderItem={renderItem}
        keyExtractor={item => item.session.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.noResults}>
            <Text style={styles.noResultsText}>Ничего не найдено</Text>
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
  searchBar: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    height: 40,
  },
  countBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  countText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  countValue: {
    fontWeight: '700' as const,
    color: Colors.text,
  },
  countFiltered: {
    fontWeight: '500' as const,
    color: Colors.info,
  },
  noResults: {
    padding: 40,
    alignItems: 'center' as const,
  },
  noResultsText: {
    fontSize: 15,
    color: Colors.textSecondary,
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
    borderColor: Colors.cardBorder,
    marginBottom: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  plateContainer: {
    backgroundColor: Colors.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  plateText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.text,
    letterSpacing: 1,
  },
  carModelText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeBadgeMonthly: {
    backgroundColor: Colors.successLight,
  },
  typeBadgeOnetime: {
    backgroundColor: Colors.warningLight,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  typeBadgeTextMonthly: {
    color: Colors.success,
  },
  typeBadgeTextOnetime: {
    color: Colors.warning,
  },
  typeBadgeLombard: {
    backgroundColor: '#fef3c7',
  },
  typeBadgeTextLombard: {
    color: '#b45309',
  },
  typeBadgeDebt: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.dangerLight,
  },
  typeBadgeTextDebt: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  badgeRow: {
    flexDirection: 'row' as const,
    gap: 6,
    alignItems: 'center' as const,
  },
  clientName: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  managerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  managerText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  timeText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  plannedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.infoLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 6,
  },
  plannedText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.info,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.warningLight,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 6,
  },
  costLabel: {
    fontSize: 13,
    color: Colors.warning,
    fontWeight: '500' as const,
    flex: 1,
  },
  costValue: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.warning,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  exitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    height: 42,
    borderRadius: 10,
    gap: 6,
  },
  exitBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  cancelBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: Colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  subRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginBottom: 6,
  },
  subRowActive: {
    backgroundColor: Colors.successLight,
  },
  subRowExpired: {
    backgroundColor: Colors.dangerLight,
  },
  subText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
});
