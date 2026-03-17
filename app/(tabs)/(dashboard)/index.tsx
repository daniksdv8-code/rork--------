import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, Car, Wallet, AlertTriangle, Users, Clock, ChevronRight, LogOut, UserPlus, BarChart3, LogIn, Banknote, PlayCircle, HandCoins } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import ShiftGuard from '@/components/ShiftGuard';
import { Client } from '@/types';
import { isToday } from '@/utils/date';

export default function DashboardScreen() {
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const { todayStats, searchClients, cars, expiringSubscriptions, needsShiftCheck, transactions } = useParking();

  const debtPaymentsToday = useMemo(() => {
    return transactions.filter(t => isToday(t.date) && t.type === 'debt_payment' && t.amount > 0)
      .reduce((s, t) => s + t.amount, 0);
  }, [transactions]);
  const shiftRequired = needsShiftCheck();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
    if (text.trim().length > 0) {
      setSearchResults(searchClients(text));
    } else {
      setSearchResults([]);
    }
  }, [searchClients]);

  const handleSelectClient = useCallback((clientId: string) => {
    setSearchQuery('');
    setSearchResults([]);
    router.push({ pathname: '/client-card', params: { clientId } });
  }, [router]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    router.replace('/login');
  }, [logout, router]);

  if (!currentUser) {
    return (
      <View style={styles.container}>
        <View style={styles.authPrompt}>
          <Text style={styles.authTitle}>Требуется авторизация</Text>
          <TouchableOpacity style={styles.authButton} onPress={() => router.push('/login')}>
            <Text style={styles.authButtonText}>Войти</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ShiftGuard allowView>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.userRow}>
        <View>
          <Text style={styles.greeting}>Здравствуйте,</Text>
          <Text style={styles.userName}>{currentUser.name}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <LogOut size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Search size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Номер авто, ФИО или телефон..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={handleSearch}
          autoCapitalize="characters"
          testID="search-input"
        />
      </View>

      {searchResults.length > 0 && (
        <View style={styles.searchResults}>
          {searchResults.map(client => {
            const clientCars = cars.filter(c => c.clientId === client.id);
            return (
              <TouchableOpacity
                key={client.id}
                style={styles.searchResultItem}
                onPress={() => handleSelectClient(client.id)}
              >
                <View style={styles.searchResultInfo}>
                  <Text style={styles.searchResultName}>{client.name}</Text>
                  <Text style={styles.searchResultPlate}>
                    {clientCars.map(c => c.carModel ? `${c.plateNumber} (${c.carModel})` : c.plateNumber).join(', ')}
                  </Text>
                </View>
                <ChevronRight size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {(!currentUser || (currentUser.role !== 'admin' && shiftRequired)) && (
        <TouchableOpacity
          style={styles.shiftBanner}
          onPress={() => router.push('/(tabs)/more/cashregister' as any)}
          activeOpacity={0.7}
        >
          <View style={styles.shiftBannerIcon}>
            <PlayCircle size={24} color={Colors.warning} />
          </View>
          <View style={styles.shiftBannerInfo}>
            <Text style={styles.shiftBannerTitle}>Смена не открыта</Text>
            <Text style={styles.shiftBannerDesc}>Откройте смену, чтобы начать работу</Text>
          </View>
          <ChevronRight size={18} color={Colors.warning} />
        </TouchableOpacity>
      )}

      <View style={styles.statsGrid}>
        <TouchableOpacity
          style={[styles.statCard, styles.statCardWide]}
          activeOpacity={0.7}
          onPress={() => router.push('/(tabs)/(dashboard)/parked-now' as any)}
        >
          <View style={[styles.statIcon, { backgroundColor: Colors.infoLight }]}>
            <Car size={22} color={Colors.info} />
          </View>
          <View style={styles.statCardWideContent}>
            <Text style={styles.statValue}>{todayStats.carsOnParking}</Text>
            <Text style={styles.statLabel}>Сейчас на парковке</Text>
          </View>
          <ChevronRight size={18} color={Colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statCard}
          activeOpacity={0.7}
          onPress={() => router.push('/(tabs)/(dashboard)/cash-today' as any)}
        >
          <View style={[styles.statIcon, { backgroundColor: Colors.successLight }]}>
            <Wallet size={20} color={Colors.success} />
          </View>
          <Text style={styles.statValue}>{todayStats.cashToday} ₽</Text>
          <Text style={styles.statLabel}>Наличные сегодня</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statCard}
          activeOpacity={0.7}
          onPress={() => router.push('/(tabs)/(dashboard)/card-today' as any)}
        >
          <View style={[styles.statIcon, { backgroundColor: Colors.infoLight }]}>
            <Wallet size={20} color={Colors.info} />
          </View>
          <Text style={styles.statValue}>{todayStats.cardToday} ₽</Text>
          <Text style={styles.statLabel}>Безнал сегодня</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statCard}
          activeOpacity={0.7}
          onPress={() => router.push('/(tabs)/(dashboard)/debtors-list' as any)}
        >
          <View style={[styles.statIcon, { backgroundColor: Colors.dangerLight }]}>
            <AlertTriangle size={20} color={Colors.danger} />
          </View>
          <Text style={[styles.statValue, { color: Colors.danger }]}>{todayStats.debtorsCount}</Text>
          <Text style={styles.statLabel}>Должников</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statCard}
          activeOpacity={0.7}
          onPress={() => router.push('/(tabs)/(dashboard)/debts-list' as any)}
        >
          <View style={[styles.statIcon, { backgroundColor: Colors.dangerLight }]}>
            <Wallet size={20} color={Colors.danger} />
          </View>
          <Text style={[styles.statValue, { color: Colors.danger }]}>{todayStats.totalDebt} ₽</Text>
          <Text style={styles.statLabel}>Общий долг</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statCard}
          activeOpacity={0.7}
          onPress={() => router.push('/(tabs)/(dashboard)/debt-payments' as any)}
        >
          <View style={[styles.statIcon, { backgroundColor: Colors.successLight }]}>
            <HandCoins size={20} color={Colors.success} />
          </View>
          <Text style={[styles.statValue, { color: Colors.success }]}>{debtPaymentsToday} ₽</Text>
          <Text style={styles.statLabel}>Оплат по долгам</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Быстрый доступ</Text>
      <View style={styles.quickLinks}>
        {[
          { label: 'Новый заезд', icon: LogIn, route: '/(tabs)/checkin' as const, color: Colors.success },
          { label: 'Добавить клиента', icon: UserPlus, route: '/add-client-modal' as const, color: Colors.primary },
          { label: 'На парковке', icon: Car, route: '/(tabs)/parking' as const, color: Colors.info },
          { label: 'Клиенты', icon: Users, route: '/(tabs)/clients' as const, color: Colors.primary },
          { label: 'Должники', icon: AlertTriangle, route: '/(tabs)/more/debtors' as const, color: Colors.danger },
          { label: 'История', icon: Clock, route: '/(tabs)/more/history' as const, color: Colors.warning },
          { label: 'Отчёты', icon: BarChart3, route: '/(tabs)/more/reports' as const, color: Colors.info },
          { label: 'Касса', icon: Banknote, route: '/(tabs)/more/cashregister' as const, color: Colors.success },
        ].map((item) => (
          <TouchableOpacity
            key={item.label}
            style={styles.quickLink}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.quickLinkIcon, { backgroundColor: item.color + '15' }]}>
              <item.icon size={22} color={item.color} />
            </View>
            <Text style={styles.quickLinkLabel}>{item.label}</Text>
            <ChevronRight size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>

      {expiringSubscriptions.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Истекают оплаты</Text>
          <View style={styles.expiringList}>
            {expiringSubscriptions.map((item) => (
              <TouchableOpacity
                key={item.subscription.id}
                style={styles.expiringItem}
                onPress={() => item.client && handleSelectClient(item.client.id)}
              >
                <View style={styles.expiringBadge}>
                  <Text style={styles.expiringBadgeText}>
                    {item.daysLeft === 0 ? 'Сегодня' : `${item.daysLeft} дн.`}
                  </Text>
                </View>
                <View style={styles.expiringInfo}>
                  <Text style={styles.expiringName}>{item.client?.name ?? '—'}</Text>
                  <Text style={styles.expiringPlate}>
                    {item.car?.plateNumber ?? '—'}{item.car?.carModel ? ` (${item.car.carModel})` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
    </ShiftGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  logoutBtn: {
    padding: 8,
  },
  authPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  authTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 16,
  },
  authButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  authButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
  },
  searchResults: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchResultInfo: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  searchResultPlate: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    width: '48%' as unknown as number,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  statCardWide: {
    width: '100%' as unknown as number,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statCardWideContent: {
    flex: 1,
  },
  statIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  quickLinks: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
    marginBottom: 24,
  },
  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  quickLinkIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLinkLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  expiringList: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
    marginBottom: 24,
  },
  expiringItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  expiringBadge: {
    backgroundColor: Colors.warningLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  expiringBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.warning,
  },
  expiringInfo: {
    flex: 1,
  },
  expiringName: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  expiringPlate: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  shiftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warningLight,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
    gap: 12,
  },
  shiftBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.warning + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftBannerInfo: {
    flex: 1,
  },
  shiftBannerTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.warning,
  },
  shiftBannerDesc: {
    fontSize: 13,
    color: Colors.warning,
    opacity: 0.8,
    marginTop: 2,
  },
});
