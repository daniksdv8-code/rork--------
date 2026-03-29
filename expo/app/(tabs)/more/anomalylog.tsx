import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, RefreshControl,
} from 'react-native';
import {
  Shield, ShieldAlert, ShieldCheck, Trash2, RefreshCw,
  ChevronDown, ChevronUp, AlertTriangle, Info, AlertCircle, XCircle,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import {
  getAnomalyLog, clearAnomalyLog, AnomalyEntry, AnomalySeverity,
} from '@/utils/anomaly-logger';
import { formatDateTime } from '@/utils/date';

type FilterKey = 'all' | 'critical' | 'error' | 'warning' | 'info';

const SEVERITY_CONFIG: Record<AnomalySeverity, { label: string; color: string; bg: string; Icon: typeof AlertCircle }> = {
  critical: { label: 'Критичн.', color: '#DC2626', bg: '#FEE2E2', Icon: XCircle },
  error: { label: 'Ошибка', color: Colors.danger, bg: Colors.dangerLight, Icon: AlertCircle },
  warning: { label: 'Внимание', color: Colors.warning, bg: Colors.warningLight, Icon: AlertTriangle },
  info: { label: 'Инфо', color: Colors.info, bg: Colors.infoLight, Icon: Info },
};

const CATEGORY_LABELS: Record<string, string> = {
  cash_balance: 'Касса',
  debt_mismatch: 'Долги',
  report_aggregate: 'Отчёты',
  orphan_entity: 'Сироты',
  sync_protection: 'Синхронизация',
  session_state: 'Сессии',
  rounding_artifact: 'Округление',
  salary_mismatch: 'Зарплаты',
  shift_anomaly: 'Смены',
  general: 'Общее',
};

const ACTION_LABELS: Record<string, string> = {
  logged_only: 'Только лог',
  recalculated: 'Пересчитано',
  normalized: 'Нормализовано',
  blocked: 'Заблокировано',
  admin_alert: 'Предупреждение',
};

export default function AnomalyLogScreen() {
  const { isAdmin } = useAuth();
  const { runDiagnostic, getAnomalyStats } = useParking() as any;
  const [entries, setEntries] = useState<AnomalyEntry[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const loadEntries = useCallback(() => {
    const log = getAnomalyLog();
    setEntries([...log]);
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    if (runDiagnostic) {
      runDiagnostic();
    }
    setTimeout(() => {
      loadEntries();
      setRefreshing(false);
    }, 1500);
  }, [runDiagnostic, loadEntries]);

  const handleClear = useCallback(() => {
    Alert.alert(
      'Очистить журнал аномалий?',
      'Все записи будут удалены. Это действие необратимо.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Очистить',
          style: 'destructive',
          onPress: async () => {
            await clearAnomalyLog();
            setEntries([]);
          },
        },
      ]
    );
  }, []);

  const handleRunDiagnostic = useCallback(() => {
    if (runDiagnostic) {
      runDiagnostic();
      setTimeout(() => {
        loadEntries();
        Alert.alert('Готово', 'Диагностика выполнена, журнал обновлён');
      }, 2000);
    }
  }, [runDiagnostic, loadEntries]);

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter(e => e.severity === filter);
  }, [entries, filter]);

  const stats = useMemo(() => {
    return {
      total: entries.length,
      critical: entries.filter(e => e.severity === 'critical').length,
      errors: entries.filter(e => e.severity === 'error').length,
      warnings: entries.filter(e => e.severity === 'warning').length,
      info: entries.filter(e => e.severity === 'info').length,
    };
  }, [entries]);

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.accessDenied}>
          <Text style={styles.accessDeniedText}>Доступ только для администратора</Text>
        </View>
      </View>
    );
  }

  const filters: { key: FilterKey; label: string; count: number; color: string }[] = [
    { key: 'all', label: 'Все', count: stats.total, color: Colors.text },
    { key: 'critical', label: 'Крит.', count: stats.critical, color: '#DC2626' },
    { key: 'error', label: 'Ошибки', count: stats.errors, color: Colors.danger },
    { key: 'warning', label: 'Внимание', count: stats.warnings, color: Colors.warning },
    { key: 'info', label: 'Инфо', count: stats.info, color: Colors.info },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerIconWrap}>
              {stats.critical > 0 || stats.errors > 0 ? (
                <ShieldAlert size={28} color={Colors.danger} />
              ) : stats.warnings > 0 ? (
                <Shield size={28} color={Colors.warning} />
              ) : (
                <ShieldCheck size={28} color={Colors.success} />
              )}
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>Самодиагностика</Text>
              <Text style={styles.headerSubtitle}>
                {stats.total === 0
                  ? 'Аномалий не обнаружено'
                  : `${stats.total} записей в журнале`}
              </Text>
            </View>
          </View>

          {stats.total > 0 && (
            <View style={styles.statsRow}>
              {stats.critical > 0 && (
                <View style={[styles.statChip, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={[styles.statChipText, { color: '#DC2626' }]}>{stats.critical} крит.</Text>
                </View>
              )}
              {stats.errors > 0 && (
                <View style={[styles.statChip, { backgroundColor: Colors.dangerLight }]}>
                  <Text style={[styles.statChipText, { color: Colors.danger }]}>{stats.errors} ошиб.</Text>
                </View>
              )}
              {stats.warnings > 0 && (
                <View style={[styles.statChip, { backgroundColor: Colors.warningLight }]}>
                  <Text style={[styles.statChipText, { color: Colors.warning }]}>{stats.warnings} вним.</Text>
                </View>
              )}
              {stats.info > 0 && (
                <View style={[styles.statChip, { backgroundColor: Colors.infoLight }]}>
                  <Text style={[styles.statChipText, { color: Colors.info }]}>{stats.info} инфо</Text>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: Colors.info }]}
            onPress={handleRunDiagnostic}
            activeOpacity={0.7}
          >
            <RefreshCw size={16} color={Colors.white} />
            <Text style={styles.actionBtnText}>Запустить проверку</Text>
          </TouchableOpacity>
          {stats.total > 0 && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: Colors.danger }]}
              onPress={handleClear}
              activeOpacity={0.7}
            >
              <Trash2 size={16} color={Colors.white} />
              <Text style={styles.actionBtnText}>Очистить</Text>
            </TouchableOpacity>
          )}
        </View>

        {stats.total > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterContent}
          >
            {filters.map(f => (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterChip,
                  filter === f.key && styles.filterChipActive,
                  filter === f.key && { borderColor: f.color },
                ]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.filterChipText,
                  filter === f.key && { color: f.color, fontWeight: '700' as const },
                ]}>
                  {f.label} ({f.count})
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {filteredEntries.length === 0 ? (
          <View style={styles.emptyState}>
            <ShieldCheck size={48} color={Colors.success} />
            <Text style={styles.emptyTitle}>Всё в порядке</Text>
            <Text style={styles.emptySubtitle}>
              {stats.total === 0
                ? 'Журнал аномалий пуст. Диагностика запускается автоматически.'
                : 'Нет записей по выбранному фильтру'}
            </Text>
          </View>
        ) : (
          filteredEntries.map(entry => {
            const config = SEVERITY_CONFIG[entry.severity];
            const isExpanded = expandedId === entry.id;
            const IconComp = config.Icon;

            return (
              <TouchableOpacity
                key={entry.id}
                style={[styles.entryCard, { borderLeftColor: config.color, borderLeftWidth: 3 }]}
                onPress={() => setExpandedId(isExpanded ? null : entry.id)}
                activeOpacity={0.7}
              >
                <View style={styles.entryHeader}>
                  <View style={[styles.entryIconWrap, { backgroundColor: config.bg }]}>
                    <IconComp size={16} color={config.color} />
                  </View>
                  <View style={styles.entryInfo}>
                    <View style={styles.entryTopRow}>
                      <View style={[styles.severityBadge, { backgroundColor: config.bg }]}>
                        <Text style={[styles.severityBadgeText, { color: config.color }]}>{config.label}</Text>
                      </View>
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryBadgeText}>{CATEGORY_LABELS[entry.category] ?? entry.category}</Text>
                      </View>
                    </View>
                    <Text style={styles.entryMessage} numberOfLines={isExpanded ? undefined : 2}>{entry.message}</Text>
                    <Text style={styles.entryDate}>{formatDateTime(entry.timestamp)}</Text>
                  </View>
                  {isExpanded ? (
                    <ChevronUp size={16} color={Colors.textMuted} />
                  ) : (
                    <ChevronDown size={16} color={Colors.textMuted} />
                  )}
                </View>

                {isExpanded && (
                  <View style={styles.entryDetails}>
                    {entry.expected && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Ожидалось:</Text>
                        <Text style={styles.detailValue}>{entry.expected}</Text>
                      </View>
                    )}
                    {entry.actual && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Фактически:</Text>
                        <Text style={[styles.detailValue, { color: Colors.danger }]}>{entry.actual}</Text>
                      </View>
                    )}
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Действие:</Text>
                      <View style={[
                        styles.actionBadge,
                        entry.action === 'recalculated' || entry.action === 'normalized'
                          ? { backgroundColor: Colors.successLight }
                          : entry.action === 'blocked'
                            ? { backgroundColor: Colors.dangerLight }
                            : { backgroundColor: Colors.inputBg },
                      ]}>
                        <Text style={[
                          styles.actionBadgeText,
                          entry.action === 'recalculated' || entry.action === 'normalized'
                            ? { color: Colors.success }
                            : entry.action === 'blocked'
                              ? { color: Colors.danger }
                              : { color: Colors.textSecondary },
                        ]}>{ACTION_LABELS[entry.action] ?? entry.action}</Text>
                      </View>
                    </View>
                    {entry.actionDetail && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Подробности:</Text>
                        <Text style={styles.detailValueSmall}>{entry.actionDetail}</Text>
                      </View>
                    )}
                    {entry.entityId && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Сущность:</Text>
                        <Text style={styles.detailValueSmall}>{entry.entityType ?? '?'}: {entry.entityId}</Text>
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  accessDenied: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  accessDeniedText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  headerCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  statChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statChipText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
  },
  actionBtnText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  filterScroll: {
    marginBottom: 12,
  },
  filterContent: {
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  filterChipActive: {
    backgroundColor: Colors.inputBg,
    borderWidth: 1.5,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.success,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  entryCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 8,
    overflow: 'hidden',
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 10,
  },
  entryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryInfo: {
    flex: 1,
  },
  entryTopRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  severityBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  severityBadgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  categoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: Colors.inputBg,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  entryMessage: {
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
  },
  entryDate: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  entryDetails: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 12,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    width: 90,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.text,
    flex: 1,
  },
  detailValueSmall: {
    fontSize: 11,
    color: Colors.textSecondary,
    flex: 1,
  },
  actionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  actionBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
});
