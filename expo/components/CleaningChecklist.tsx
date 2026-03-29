import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, Alert,
} from 'react-native';
import { X, CheckCircle, Circle, Sparkles, ClipboardCheck } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { CleanupChecklistItem } from '@/types';

interface CleaningChecklistProps {
  shiftId: string;
  visible: boolean;
  onClose: () => void;
}

const DEEP_CLEANING_COLOR = '#10B981';

export default function CleaningChecklist({ shiftId, visible, onClose }: CleaningChecklistProps) {
  const { getCleanupChecklist, saveCleanupChecklist, completeCleanup } = useParking();

  const initialChecklist = useMemo(() => getCleanupChecklist(shiftId), [shiftId, getCleanupChecklist]);
  const [checklist, setChecklist] = useState<CleanupChecklistItem[]>(initialChecklist);

  const completedCount = useMemo(() => checklist.filter(i => i.completed).length, [checklist]);
  const totalCount = checklist.length;

  const toggleItem = useCallback((itemId: string) => {
    setChecklist(prev => prev.map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    ));
  }, []);

  const handleSave = useCallback(() => {
    saveCleanupChecklist(shiftId, checklist);
    Alert.alert('Сохранено', 'Прогресс чек-листа сохранён.');
  }, [shiftId, checklist, saveCleanupChecklist]);

  const handleComplete = useCallback(() => {
    Alert.alert(
      'Завершить уборку?',
      'После подтверждения уборка будет отмечена как выполненная. Напоминание исчезнет.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Завершить',
          style: 'default',
          onPress: () => {
            saveCleanupChecklist(shiftId, checklist);
            completeCleanup(shiftId);
            onClose();
          },
        },
      ],
    );
  }, [shiftId, checklist, saveCleanupChecklist, completeCleanup, onClose]);

  React.useEffect(() => {
    if (visible) {
      setChecklist(getCleanupChecklist(shiftId));
    }
  }, [visible, shiftId, getCleanupChecklist]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Sparkles size={20} color={DEEP_CLEANING_COLOR} />
              <Text style={styles.headerTitle}>Генеральная уборка</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.progressRow}>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : '0%' },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {completedCount}/{totalCount}
            </Text>
          </View>

          <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
            {checklist.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.checkItem, item.completed && styles.checkItemDone]}
                onPress={() => toggleItem(item.id)}
                activeOpacity={0.6}
                testID={`cleanup-item-${item.id}`}
              >
                {item.completed ? (
                  <CheckCircle size={22} color={DEEP_CLEANING_COLOR} />
                ) : (
                  <Circle size={22} color={Colors.textMuted} />
                )}
                <Text style={[styles.checkLabel, item.completed && styles.checkLabelDone]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSave}
              activeOpacity={0.7}
              testID="cleanup-save-btn"
            >
              <ClipboardCheck size={18} color={Colors.primary} />
              <Text style={styles.saveBtnText}>Сохранить</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.completeBtn}
              onPress={handleComplete}
              activeOpacity={0.7}
              testID="cleanup-complete-btn"
            >
              <CheckCircle size={18} color={Colors.white} />
              <Text style={styles.completeBtnText}>Завершить уборку</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 36,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 12,
  },
  progressBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: DEEP_CLEANING_COLOR,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: DEEP_CLEANING_COLOR,
    minWidth: 36,
    textAlign: 'right' as const,
  },
  listScroll: {
    paddingHorizontal: 20,
    maxHeight: 340,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.background,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  checkItemDone: {
    backgroundColor: '#ECFDF5',
    borderColor: DEEP_CLEANING_COLOR + '30',
  },
  checkLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  checkLabelDone: {
    color: DEEP_CLEANING_COLOR,
    textDecorationLine: 'line-through',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 10,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.card,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  completeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: DEEP_CLEANING_COLOR,
  },
  completeBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.white,
  },
});
