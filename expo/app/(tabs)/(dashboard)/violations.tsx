import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { Shield, ChevronLeft, ChevronRight, Trash2, Plus, AlertTriangle, CheckCircle, XCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';


export default function ViolationsScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { teamViolations, deleteViolation } = useParking();

  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(0);

  const sortedMonths = useMemo(() => {
    const sorted = [...teamViolations].sort((a, b) => b.month.localeCompare(a.month));
    if (sorted.length === 0) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      return [{
        id: 'empty',
        month: `${y}-${m}`,
        violationCount: 0,
        status: 'ok' as const,
        violations: [],
      }];
    }
    return sorted;
  }, [teamViolations]);

  const currentMonthData = sortedMonths[selectedMonthIndex] ?? sortedMonths[0];

  const formatMonth = useCallback((monthStr: string): string => {
    const [year, month] = monthStr.split('-');
    const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    const idx = parseInt(month, 10) - 1;
    return `${months[idx]} ${year}`;
  }, []);

  const formatDate = useCallback((dateStr: string): string => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }, []);

  const handlePrevMonth = useCallback(() => {
    if (selectedMonthIndex < sortedMonths.length - 1) {
      setSelectedMonthIndex(prev => prev + 1);
    }
  }, [selectedMonthIndex, sortedMonths.length]);

  const handleNextMonth = useCallback(() => {
    if (selectedMonthIndex > 0) {
      setSelectedMonthIndex(prev => prev - 1);
    }
  }, [selectedMonthIndex]);

  const handleDelete = useCallback((violationId: string) => {
    Alert.alert(
      'Удалить нарушение',
      'Вы уверены, что хотите удалить это нарушение?',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: () => deleteViolation(violationId) },
      ]
    );
  }, [deleteViolation]);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'ok': return Colors.success;
      case 'warning': return Colors.warning;
      case 'bonus_denied': return Colors.danger;
      default: return Colors.textMuted;
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'ok': return 'Премия сохраняется';
      case 'warning': return 'Предупреждение';
      case 'bonus_denied': return 'Премия отменена';
      default: return '—';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok': return CheckCircle;
      case 'warning': return AlertTriangle;
      case 'bonus_denied': return XCircle;
      default: return Shield;
    }
  };

  const StatusIcon = getStatusIcon(currentMonthData?.status ?? 'ok');
  const statusColor = getStatusColor(currentMonthData?.status ?? 'ok');
  const count = currentMonthData?.violationCount ?? 0;
  const canDelete = isAdmin && currentMonthData?.status !== 'bonus_denied';

  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return currentMonthData?.month === `${y}-${m}`;
  }, [currentMonthData]);

  return (
    <>
      <Stack.Screen options={{ title: 'Нарушения команды' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.monthSelector}>
          <TouchableOpacity
            onPress={handlePrevMonth}
            disabled={selectedMonthIndex >= sortedMonths.length - 1}
            style={styles.monthArrow}
          >
            <ChevronLeft size={24} color={selectedMonthIndex >= sortedMonths.length - 1 ? Colors.textMuted : Colors.text} />
          </TouchableOpacity>
          <Text style={styles.monthText}>{formatMonth(currentMonthData?.month ?? '')}</Text>
          <TouchableOpacity
            onPress={handleNextMonth}
            disabled={selectedMonthIndex <= 0}
            style={styles.monthArrow}
          >
            <ChevronRight size={24} color={selectedMonthIndex <= 0 ? Colors.textMuted : Colors.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.statusCard, { borderColor: statusColor + '40' }]}>
          <View style={[styles.statusIconWrap, { backgroundColor: statusColor + '15' }]}>
            <StatusIcon size={28} color={statusColor} />
          </View>
          <Text style={[styles.statusCount, { color: statusColor }]}>{count}/3</Text>
          <Text style={[styles.statusLabel, { color: statusColor }]}>{getStatusLabel(currentMonthData?.status ?? 'ok')}</Text>

          <View style={styles.progressBar}>
            {[0, 1, 2].map(i => (
              <View
                key={i}
                style={[
                  styles.progressSegment,
                  {
                    backgroundColor: i < count
                      ? (count >= 3 ? Colors.danger : count >= 2 ? Colors.warning : '#F59E0B')
                      : Colors.border,
                  },
                ]}
              />
            ))}
          </View>
        </View>

        {isAdmin && isCurrentMonth && count < 3 && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/add-violation-modal' as any)}
            activeOpacity={0.7}
          >
            <Plus size={20} color={Colors.white} />
            <Text style={styles.addButtonText}>Зафиксировать нарушение</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.sectionTitle}>
          История нарушений ({currentMonthData?.violations?.length ?? 0})
        </Text>

        {(!currentMonthData?.violations || currentMonthData.violations.length === 0) ? (
          <View style={styles.emptyState}>
            <Shield size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Нет нарушений за этот месяц</Text>
          </View>
        ) : (
          <View style={styles.violationsList}>
            {currentMonthData.violations.map((v, idx) => (
              <View
                key={v.id}
                style={[styles.violationItem, idx === currentMonthData.violations.length - 1 && styles.violationItemLast]}
              >
                <View style={styles.violationNumber}>
                  <Text style={styles.violationNumberText}>{idx + 1}</Text>
                </View>
                <View style={styles.violationInfo}>
                  <Text style={styles.violationManager}>{v.managerName}</Text>
                  <Text style={styles.violationType}>{v.type}</Text>
                  {v.comment ? <Text style={styles.violationComment}>{v.comment}</Text> : null}
                  <Text style={styles.violationDate}>{formatDate(v.date)}</Text>
                  <Text style={styles.violationAddedBy}>Добавил: {v.addedByName}</Text>
                </View>
                {canDelete && isCurrentMonth && (
                  <TouchableOpacity
                    onPress={() => handleDelete(v.id)}
                    style={styles.deleteBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Trash2 size={18} color={Colors.danger} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </>
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
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 16,
  },
  monthArrow: {
    padding: 8,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
    minWidth: 160,
    textAlign: 'center' as const,
  },
  statusCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center' as const,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  statusIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 12,
  },
  statusCount: {
    fontSize: 36,
    fontWeight: '800' as const,
    marginBottom: 4,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    marginBottom: 16,
  },
  progressBar: {
    flexDirection: 'row',
    gap: 6,
    width: '100%',
  },
  progressSegment: {
    flex: 1,
    height: 8,
    borderRadius: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.danger,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 24,
  },
  addButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 40,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  violationsList: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  violationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start' as const,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  violationItemLast: {
    borderBottomWidth: 0,
  },
  violationNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dangerLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 2,
  },
  violationNumberText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
  violationInfo: {
    flex: 1,
  },
  violationManager: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  violationType: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.primary,
    marginTop: 2,
  },
  violationComment: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic' as const,
  },
  violationDate: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  violationAddedBy: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 6,
    marginTop: 2,
  },
});
