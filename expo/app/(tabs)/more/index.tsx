import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, Clock, BarChart3, Settings, ChevronRight, Banknote, CalendarDays, FileText, Download, Wallet, Briefcase, ShieldCheck, Sparkles } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';

export default function MoreScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { debtors } = useParking();

  const menuItems: { label: string; icon: typeof AlertTriangle; route: string; color: string; badge?: string }[] = [
    {
      label: 'Должники',
      icon: AlertTriangle,
      route: '/(tabs)/more/debtors',
      color: Colors.danger,
      badge: debtors.length > 0 ? String(debtors.length) : undefined,
    },
    {
      label: 'История транзакций',
      icon: Clock,
      route: '/(tabs)/more/history',
      color: Colors.warning,
    },
    {
      label: 'Отчёты',
      icon: BarChart3,
      route: '/(tabs)/more/reports',
      color: Colors.info,
    },
    {
      label: 'Касса',
      icon: Banknote,
      route: '/(tabs)/more/cashregister',
      color: Colors.success,
    },
    {
      label: 'Календарь смен',
      icon: CalendarDays,
      route: '/(tabs)/more/schedule',
      color: Colors.info,
    },
    {
      label: 'Журнал действий',
      icon: FileText,
      route: '/(tabs)/more/actionlog',
      color: '#6366F1',
    },
  ];

  if (isAdmin) {
    menuItems.push({
      label: 'Зарплаты и авансы',
      icon: Briefcase,
      route: '/(tabs)/more/salaryadvances',
      color: '#7C3AED',
    });
    menuItems.push({
      label: 'Финансы',
      icon: Wallet,
      route: '/(tabs)/more/finance',
      color: '#0D9488',
    });
    menuItems.push({
      label: 'Экспорт данных',
      icon: Download,
      route: '/(tabs)/more/export',
      color: '#0EA5E9',
    });
    menuItems.push({
      label: 'Чек-лист уборки',
      icon: Sparkles,
      route: '/(tabs)/more/cleanup-checklist',
      color: '#10B981',
    });
    menuItems.push({
      label: 'Самодиагностика',
      icon: ShieldCheck,
      route: '/(tabs)/more/anomalylog',
      color: '#059669',
    });
    menuItems.push({
      label: 'Настройки',
      icon: Settings,
      route: '/(tabs)/more/settings',
      color: Colors.textSecondary,
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.menuList}>
        {menuItems.map((item, idx) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.menuItem, idx === menuItems.length - 1 && styles.menuItemLast]}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, { backgroundColor: item.color + '15' }]}>
              <item.icon size={22} color={item.color} />
            </View>
            <Text style={styles.menuLabel}>{item.label}</Text>
            {item.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.badge}</Text>
              </View>
            )}
            <ChevronRight size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
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
  menuList: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  badge: {
    backgroundColor: Colors.danger,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700' as const,
  },
});
