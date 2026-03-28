import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal,
  TextInput, Alert, Platform, Switch,
} from 'react-native';
import { Stack } from 'expo-router';
import { Plus, ChevronLeft, ChevronRight, Clock, User, Trash2, Edit3, X, Calendar, Sparkles } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { useAuth } from '@/providers/AuthProvider';
import { ScheduledShift } from '@/types';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  let startDow = firstDay.getDay();
  if (startDow === 0) startDow = 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 1; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

const DEEP_CLEANING_COLOR = '#10B981';
const DEEP_CLEANING_BG = '#ECFDF5';

export default function ScheduleScreen() {
  const { scheduledShifts, users, addScheduledShift, updateScheduledShift, deleteScheduledShift, toggleDeepCleaning } = useParking();
  const { currentUser, isAdmin } = useAuth();

  const today = new Date();
  const [viewYear, setViewYear] = useState<number>(today.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingShift, setEditingShift] = useState<ScheduledShift | null>(null);

  const [formOperatorId, setFormOperatorId] = useState<string>('');
  const [formStartTime, setFormStartTime] = useState<string>('08:00');
  const [formEndTime, setFormEndTime] = useState<string>('20:00');
  const [formComment, setFormComment] = useState<string>('');
  const [formDeepCleaning, setFormDeepCleaning] = useState<boolean>(false);

  const cells = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, ScheduledShift[]>();
    for (const s of scheduledShifts) {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    }
    return map;
  }, [scheduledShifts]);

  const deepCleaningDates = useMemo(() => {
    const dates = new Set<string>();
    for (const s of scheduledShifts) {
      if (s.isDeepCleaning) {
        dates.add(s.date);
      }
    }
    return dates;
  }, [scheduledShifts]);

  const selectedShifts = useMemo(() => {
    if (!selectedDate) return [];
    return shiftsByDate.get(selectedDate) ?? [];
  }, [selectedDate, shiftsByDate]);

  const activeUsers = useMemo(() => users.filter(u => u.active !== false && !u.deleted), [users]);

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  }, [viewMonth]);

  const openAddModal = useCallback(() => {
    if (!selectedDate) return;
    setEditingShift(null);
    setFormOperatorId(activeUsers[0]?.id ?? '');
    setFormStartTime('08:00');
    setFormEndTime('20:00');
    setFormComment('');
    setFormDeepCleaning(false);
    setModalVisible(true);
  }, [selectedDate, activeUsers]);

  const openEditModal = useCallback((shift: ScheduledShift) => {
    setEditingShift(shift);
    setFormOperatorId(shift.operatorId);
    setFormStartTime(shift.startTime);
    setFormEndTime(shift.endTime);
    setFormComment(shift.comment);
    setFormDeepCleaning(shift.isDeepCleaning ?? false);
    setModalVisible(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!formOperatorId) {
      Alert.alert('Ошибка', 'Выберите сотрудника');
      return;
    }
    if (!formStartTime || !formEndTime) {
      Alert.alert('Ошибка', 'Укажите время начала и окончания');
      return;
    }

    const operator = activeUsers.find(u => u.id === formOperatorId);
    const operatorName = operator?.name ?? 'Неизвестно';

    if (editingShift) {
      updateScheduledShift(editingShift.id, {
        operatorId: formOperatorId,
        operatorName,
        startTime: formStartTime,
        endTime: formEndTime,
        comment: formComment,
      });
      if ((editingShift.isDeepCleaning ?? false) !== formDeepCleaning) {
        toggleDeepCleaning(editingShift.id, formDeepCleaning);
      }
    } else if (selectedDate) {
      const newShift = addScheduledShift(selectedDate, formStartTime, formEndTime, formOperatorId, operatorName, formComment);
      if (formDeepCleaning && newShift) {
        toggleDeepCleaning(newShift.id, true);
      }
    }
    setModalVisible(false);
  }, [formOperatorId, formStartTime, formEndTime, formComment, formDeepCleaning, editingShift, selectedDate, activeUsers, addScheduledShift, updateScheduledShift, toggleDeepCleaning]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Удалить смену?', 'Эта запись из календаря будет удалена.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteScheduledShift(id) },
    ]);
  }, [deleteScheduledShift]);

  const handleToggleDeepCleaning = useCallback((shift: ScheduledShift) => {
    const isOwn = shift.operatorId === currentUser?.id;
    if (!isOwn && !isAdmin) {
      Alert.alert('Нет доступа', 'Только администратор может менять отметку генуборки у чужих смен.');
      return;
    }
    const newValue = !(shift.isDeepCleaning ?? false);
    toggleDeepCleaning(shift.id, newValue);
  }, [currentUser, isAdmin, toggleDeepCleaning]);

  const canToggleDeepCleaning = useCallback((shift: ScheduledShift): boolean => {
    if (isAdmin) return true;
    return shift.operatorId === currentUser?.id;
  }, [currentUser, isAdmin]);

  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Календарь смен' }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.calendarCard}>
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.navBtn} activeOpacity={0.7}>
              <ChevronLeft size={22} color={Colors.primary} />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{MONTHS[viewMonth]} {viewYear}</Text>
            <TouchableOpacity onPress={nextMonth} style={styles.navBtn} activeOpacity={0.7}>
              <ChevronRight size={22} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map(d => (
              <View key={d} style={styles.weekCell}>
                <Text style={styles.weekText}>{d}</Text>
              </View>
            ))}
          </View>

          {Array.from({ length: Math.ceil(cells.length / 7) }, (_, rowIdx) => (
            <View key={rowIdx} style={styles.weekRow}>
              {cells.slice(rowIdx * 7, rowIdx * 7 + 7).map((day, colIdx) => {
                const key = day ? dateKey(viewYear, viewMonth, day) : `empty-${rowIdx}-${colIdx}`;
                const isToday = key === todayKey;
                const isSelected = key === selectedDate;
                const hasShifts = day ? (shiftsByDate.get(key)?.length ?? 0) > 0 : false;
                const hasDeepCleaning = day ? deepCleaningDates.has(key) : false;

                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.dayCell,
                      isToday && styles.dayCellToday,
                      isSelected && styles.dayCellSelected,
                      hasDeepCleaning && !isSelected && styles.dayCellDeepCleaning,
                    ]}
                    disabled={!day}
                    activeOpacity={0.6}
                    onPress={() => day && setSelectedDate(dateKey(viewYear, viewMonth, day))}
                  >
                    {day ? (
                      <>
                        <Text style={[
                          styles.dayText,
                          isToday && styles.dayTextToday,
                          isSelected && styles.dayTextSelected,
                          hasDeepCleaning && !isSelected && !isToday && styles.dayTextDeepCleaning,
                        ]}>
                          {day}
                        </Text>
                        <View style={styles.dotRow}>
                          {hasShifts && (
                            <View style={[styles.dot, isSelected && styles.dotSelected]} />
                          )}
                          {hasDeepCleaning && (
                            <View style={[styles.dotDeepCleaning, isSelected && styles.dotSelected]} />
                          )}
                        </View>
                      </>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.info }]} />
              <Text style={styles.legendText}>Смена</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: DEEP_CLEANING_COLOR }]} />
              <Text style={styles.legendText}>Генуборка</Text>
            </View>
          </View>
        </View>

        {selectedDate && (
          <View style={styles.detailSection}>
            <View style={styles.detailHeader}>
              <View style={styles.detailTitleRow}>
                <Calendar size={18} color={Colors.primary} />
                <Text style={styles.detailTitle}>
                  {selectedDate.split('-').reverse().join('.')}
                </Text>
              </View>
              <TouchableOpacity onPress={openAddModal} style={styles.addBtn} activeOpacity={0.7}>
                <Plus size={18} color={Colors.white} />
                <Text style={styles.addBtnText}>Добавить</Text>
              </TouchableOpacity>
            </View>

            {selectedShifts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Нет запланированных смен</Text>
              </View>
            ) : (
              selectedShifts.map(shift => {
                const isDC = shift.isDeepCleaning ?? false;
                const canToggle = canToggleDeepCleaning(shift);

                return (
                  <View key={shift.id} style={[styles.shiftCard, isDC && styles.shiftCardDeepCleaning]}>
                    {isDC && (
                      <View style={styles.dcBadge}>
                        <Sparkles size={12} color={Colors.white} />
                        <Text style={styles.dcBadgeText}>Генуборка</Text>
                      </View>
                    )}
                    <View style={styles.shiftTop}>
                      <View style={styles.shiftInfo}>
                        <View style={styles.shiftRow}>
                          <User size={15} color={isDC ? DEEP_CLEANING_COLOR : Colors.primary} />
                          <Text style={styles.shiftName}>{shift.operatorName}</Text>
                        </View>
                        <View style={styles.shiftRow}>
                          <Clock size={14} color={Colors.textSecondary} />
                          <Text style={styles.shiftTime}>{shift.startTime} — {shift.endTime}</Text>
                        </View>
                        {shift.comment ? (
                          <Text style={styles.shiftComment}>{shift.comment}</Text>
                        ) : null}
                      </View>
                      <View style={styles.shiftActions}>
                        <TouchableOpacity onPress={() => openEditModal(shift)} style={styles.actionBtn} activeOpacity={0.7}>
                          <Edit3 size={16} color={Colors.info} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(shift.id)} style={styles.actionBtn} activeOpacity={0.7}>
                          <Trash2 size={16} color={Colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.dcToggleRow}>
                      <View style={styles.dcToggleLabel}>
                        <Sparkles size={14} color={isDC ? DEEP_CLEANING_COLOR : Colors.textMuted} />
                        <Text style={[styles.dcToggleText, isDC && styles.dcToggleTextActive]}>
                          Генеральная уборка
                        </Text>
                      </View>
                      {canToggle ? (
                        <Switch
                          value={isDC}
                          onValueChange={() => handleToggleDeepCleaning(shift)}
                          trackColor={{ false: Colors.border, true: DEEP_CLEANING_COLOR + '60' }}
                          thumbColor={isDC ? DEEP_CLEANING_COLOR : '#f4f3f4'}
                        />
                      ) : (
                        <View style={[styles.dcStatusBadge, isDC && styles.dcStatusBadgeActive]}>
                          <Text style={[styles.dcStatusText, isDC && styles.dcStatusTextActive]}>
                            {isDC ? 'Да' : 'Нет'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )}

            <View style={styles.hintNote}>
              <Text style={styles.hintNoteText}>
                💡 Рекомендуется минимум 1 смена с генеральной уборкой в неделю
              </Text>
            </View>
          </View>
        )}

        {!selectedDate && (
          <View style={styles.hintCard}>
            <Text style={styles.hintText}>Нажмите на дату, чтобы просмотреть или добавить смены</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingShift ? 'Редактировать смену' : 'Новая смена'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} activeOpacity={0.7}>
                <X size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Сотрудник</Text>
            <View style={styles.operatorList}>
              {activeUsers.map(u => (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.operatorChip, formOperatorId === u.id && styles.operatorChipActive]}
                  onPress={() => setFormOperatorId(u.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.operatorChipText, formOperatorId === u.id && styles.operatorChipTextActive]}>
                    {u.name}
                  </Text>
                  <Text style={[styles.operatorRole, formOperatorId === u.id && styles.operatorRoleActive]}>
                    {u.role === 'admin' ? 'Админ' : 'Менеджер'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.label}>Начало</Text>
                <TextInput
                  style={styles.input}
                  value={formStartTime}
                  onChangeText={setFormStartTime}
                  placeholder="08:00"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
                />
              </View>
              <View style={styles.timeSeparator}>
                <Text style={styles.timeSeparatorText}>—</Text>
              </View>
              <View style={styles.timeField}>
                <Text style={styles.label}>Конец</Text>
                <TextInput
                  style={styles.input}
                  value={formEndTime}
                  onChangeText={setFormEndTime}
                  placeholder="20:00"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
                />
              </View>
            </View>

            <Text style={styles.label}>Комментарий</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={formComment}
              onChangeText={setFormComment}
              placeholder="Необязательно"
              placeholderTextColor={Colors.textMuted}
              multiline
            />

            <View style={styles.dcFormRow}>
              <View style={styles.dcFormLabel}>
                <Sparkles size={16} color={formDeepCleaning ? DEEP_CLEANING_COLOR : Colors.textMuted} />
                <Text style={[styles.dcFormText, formDeepCleaning && styles.dcFormTextActive]}>
                  Генеральная уборка
                </Text>
              </View>
              <Switch
                value={formDeepCleaning}
                onValueChange={setFormDeepCleaning}
                trackColor={{ false: Colors.border, true: DEEP_CLEANING_COLOR + '60' }}
                thumbColor={formDeepCleaning ? DEEP_CLEANING_COLOR : '#f4f3f4'}
              />
            </View>

            <TouchableOpacity onPress={handleSave} style={styles.saveBtn} activeOpacity={0.7}>
              <Text style={styles.saveBtnText}>
                {editingShift ? 'Сохранить' : 'Добавить смену'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  calendarCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  weekText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textMuted,
    textTransform: 'uppercase' as const,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    minHeight: 42,
    borderRadius: 10,
    margin: 1,
  },
  dayCellToday: {
    backgroundColor: Colors.primaryLight + '18',
  },
  dayCellSelected: {
    backgroundColor: Colors.primary,
  },
  dayCellDeepCleaning: {
    backgroundColor: DEEP_CLEANING_BG,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  dayTextToday: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
  dayTextSelected: {
    color: Colors.white,
    fontWeight: '700' as const,
  },
  dayTextDeepCleaning: {
    color: DEEP_CLEANING_COLOR,
    fontWeight: '600' as const,
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
    height: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.info,
  },
  dotSelected: {
    backgroundColor: Colors.white,
  },
  dotDeepCleaning: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: DEEP_CLEANING_COLOR,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  detailSection: {
    marginTop: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  addBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  shiftCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
    marginBottom: 8,
  },
  shiftCardDeepCleaning: {
    borderColor: DEEP_CLEANING_COLOR + '50',
    borderLeftWidth: 3,
    borderLeftColor: DEEP_CLEANING_COLOR,
  },
  dcBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: DEEP_CLEANING_COLOR,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    marginBottom: 8,
  },
  dcBadgeText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.white,
    textTransform: 'uppercase' as const,
  },
  shiftTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  shiftInfo: {
    flex: 1,
    gap: 6,
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shiftName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  shiftTime: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  shiftComment: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
    fontStyle: 'italic' as const,
  },
  shiftActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dcToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  dcToggleLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dcToggleText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  dcToggleTextActive: {
    color: DEEP_CLEANING_COLOR,
    fontWeight: '600' as const,
  },
  dcStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.background,
  },
  dcStatusBadgeActive: {
    backgroundColor: DEEP_CLEANING_BG,
  },
  dcStatusText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textMuted,
  },
  dcStatusTextActive: {
    color: DEEP_CLEANING_COLOR,
  },
  hintNote: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  hintNoteText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center' as const,
  },
  hintCard: {
    marginTop: 20,
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 20,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  label: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 8,
  },
  operatorList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  operatorChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  operatorChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  operatorChipText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  operatorChipTextActive: {
    color: Colors.white,
  },
  operatorRole: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  operatorRoleActive: {
    color: 'rgba(255,255,255,0.7)',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  timeField: {
    flex: 1,
  },
  timeSeparator: {
    paddingBottom: 12,
  },
  timeSeparatorText: {
    fontSize: 18,
    color: Colors.textMuted,
  },
  input: {
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
  },
  inputMultiline: {
    minHeight: 60,
    textAlignVertical: 'top' as const,
  },
  dcFormRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  dcFormLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dcFormText: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  dcFormTextActive: {
    color: DEEP_CLEANING_COLOR,
    fontWeight: '600' as const,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700' as const,
  },
});
