import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, TextInput } from 'react-native';
import {
  UserPlus, CarFront, LogIn, LogOut, XCircle, RotateCcw,
  Wallet, Banknote, Clock, Settings, Trash2, Shield,
  CalendarDays, Search, ChevronDown, ChevronUp, CircleDot
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { ActionLog, ActionType } from '@/types';

type FilterType = 'all' | 'clients' | 'parking' | 'payments' | 'shifts' | 'system';

const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'clients', label: 'Клиенты' },
  { key: 'parking', label: 'Парковка' },
  { key: 'payments', label: 'Оплаты' },
  { key: 'shifts', label: 'Смены' },
  { key: 'system', label: 'Система' },
];

const ACTION_GROUPS: Record<FilterType, ActionType[]> = {
  all: [],
  clients: ['client_add', 'client_edit', 'client_delete', 'car_add', 'car_delete'],
  parking: ['checkin', 'checkout', 'cancel_checkin', 'cancel_checkout'],
  payments: ['payment', 'cancel_payment', 'debt_payment', 'expense_add', 'withdrawal', 'refund'],
  shifts: ['shift_open', 'shift_close', 'schedule_add', 'schedule_edit', 'schedule_delete'],
  system: ['tariff_update', 'user_add', 'user_remove', 'user_toggle', 'user_password', 'admin_profile', 'data_reset'],
};

function getActionIcon(action: ActionType) {
  switch (action) {
    case 'client_add': return { Icon: UserPlus, color: Colors.success, bg: Colors.successLight };
    case 'client_edit': return { Icon: UserPlus, color: Colors.info, bg: Colors.infoLight };
    case 'client_delete': return { Icon: Trash2, color: Colors.danger, bg: Colors.dangerLight };
    case 'car_add': return { Icon: CarFront, color: Colors.success, bg: Colors.successLight };
    case 'car_delete': return { Icon: Trash2, color: Colors.danger, bg: Colors.dangerLight };
    case 'checkin': return { Icon: LogIn, color: Colors.info, bg: Colors.infoLight };
    case 'checkout': return { Icon: LogOut, color: Colors.warning, bg: Colors.warningLight };
    case 'cancel_checkin': return { Icon: XCircle, color: Colors.danger, bg: Colors.dangerLight };
    case 'cancel_checkout': return { Icon: RotateCcw, color: Colors.info, bg: Colors.infoLight };
    case 'payment': return { Icon: Wallet, color: Colors.success, bg: Colors.successLight };
    case 'cancel_payment': return { Icon: XCircle, color: Colors.danger, bg: Colors.dangerLight };
    case 'debt_payment': return { Icon: Banknote, color: Colors.info, bg: Colors.infoLight };
    case 'shift_open': return { Icon: Clock, color: Colors.success, bg: Colors.successLight };
    case 'shift_close': return { Icon: Clock, color: Colors.warning, bg: Colors.warningLight };
    case 'expense_add': return { Icon: Banknote, color: Colors.danger, bg: Colors.dangerLight };
    case 'withdrawal': return { Icon: Banknote, color: Colors.warning, bg: Colors.warningLight };
    case 'tariff_update': return { Icon: Settings, color: Colors.info, bg: Colors.infoLight };
    case 'user_add': return { Icon: UserPlus, color: Colors.success, bg: Colors.successLight };
    case 'user_remove': return { Icon: Trash2, color: Colors.danger, bg: Colors.dangerLight };
    case 'user_toggle': return { Icon: Shield, color: Colors.warning, bg: Colors.warningLight };
    case 'user_password': return { Icon: Shield, color: Colors.info, bg: Colors.infoLight };
    case 'admin_profile': return { Icon: Shield, color: Colors.info, bg: Colors.infoLight };
    case 'schedule_add': return { Icon: CalendarDays, color: Colors.success, bg: Colors.successLight };
    case 'schedule_edit': return { Icon: CalendarDays, color: Colors.info, bg: Colors.infoLight };
    case 'schedule_delete': return { Icon: CalendarDays, color: Colors.danger, bg: Colors.dangerLight };
    case 'data_reset': return { Icon: Trash2, color: Colors.danger, bg: Colors.dangerLight };
    case 'backup_create': return { Icon: Shield, color: Colors.info, bg: Colors.infoLight };
    case 'backup_restore': return { Icon: RotateCcw, color: Colors.warning, bg: Colors.warningLight };
    case 'refund': return { Icon: RotateCcw, color: Colors.warning, bg: Colors.warningLight };
    default: return { Icon: CircleDot, color: Colors.textSecondary, bg: Colors.inputBg };
  }
}

function formatLogTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${day}.${month} ${hours}:${minutes}:${seconds}`;
}

function formatLogDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export default function ActionLogScreen() {
  const { actionLogs } = useParking();
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = actionLogs;

    if (filter !== 'all') {
      const actions = ACTION_GROUPS[filter];
      result = result.filter(l => actions.includes(l.action));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(l =>
        l.label.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q) ||
        l.userName.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [actionLogs, filter, searchQuery]);

  const groupedByDate = useMemo(() => {
    const groups: { title: string; data: ActionLog[] }[] = [];
    let currentDate = '';

    for (const log of filtered) {
      const dateStr = formatLogDate(log.timestamp);
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        groups.push({ title: dateStr, data: [log] });
      } else {
        groups[groups.length - 1].data.push(log);
      }
    }

    return groups;
  }, [filtered]);

  const flatList = useMemo(() => {
    const items: ({ type: 'header'; title: string; id: string } | { type: 'log'; log: ActionLog; id: string })[] = [];
    for (const group of groupedByDate) {
      items.push({ type: 'header', title: group.title, id: `h_${group.title}` });
      for (const log of group.data) {
        items.push({ type: 'log', log, id: log.id });
      }
    }
    return items;
  }, [groupedByDate]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const renderItem = useCallback(({ item }: { item: typeof flatList[number] }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.dateHeader}>
          <View style={styles.dateHeaderLine} />
          <Text style={styles.dateHeaderText}>{item.title}</Text>
          <View style={styles.dateHeaderLine} />
        </View>
      );
    }

    const log = item.log;
    const { Icon, color, bg } = getActionIcon(log.action);
    const isExpanded = expandedId === log.id;

    return (
      <TouchableOpacity
        style={styles.logCard}
        onPress={() => toggleExpand(log.id)}
        activeOpacity={0.7}
      >
        <View style={styles.logRow}>
          <View style={[styles.logIcon, { backgroundColor: bg }]}>
            <Icon size={18} color={color} />
          </View>
          <View style={styles.logContent}>
            <View style={styles.logTopRow}>
              <Text style={styles.logLabel} numberOfLines={1}>{log.label}</Text>
              <Text style={styles.logTime}>{formatLogTime(log.timestamp)}</Text>
            </View>
            <Text style={styles.logDetails} numberOfLines={isExpanded ? undefined : 1}>{log.details}</Text>
            <View style={styles.logMeta}>
              <View style={styles.userBadge}>
                <Text style={styles.userBadgeText}>{log.userName}</Text>
              </View>
              {isExpanded && log.entityType && (
                <Text style={styles.entityInfo}>{log.entityType}: {log.entityId?.slice(0, 8)}…</Text>
              )}
              {isExpanded ? (
                <ChevronUp size={14} color={Colors.textMuted} />
              ) : (
                <ChevronDown size={14} color={Colors.textMuted} />
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [expandedId, toggleExpand]);

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Search size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск по действиям…"
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <XCircle size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterBtnText, filter === f.key && styles.filterBtnTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.statsText}>
          Записей: {filtered.length}
        </Text>
      </View>

      <FlatList
        data={flatList}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Clock size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Нет записей</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery ? 'Ничего не найдено по запросу' : 'Журнал действий пока пуст'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    paddingVertical: 2,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6,
    flexWrap: 'wrap',
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  filterBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  filterBtnTextActive: {
    color: Colors.white,
  },
  statsRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  statsText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  dateHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dateHeaderText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  logCard: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  logRow: {
    flexDirection: 'row',
    gap: 10,
  },
  logIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logContent: {
    flex: 1,
  },
  logTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  logTime: {
    fontSize: 11,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  logDetails: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  logMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  userBadge: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  userBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  entityInfo: {
    fontSize: 11,
    color: Colors.textMuted,
    flex: 1,
  },
  emptyState: {
    padding: 60,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
