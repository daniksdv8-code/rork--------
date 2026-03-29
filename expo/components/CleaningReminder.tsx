import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Sparkles, ClipboardList, CheckCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import CleaningChecklist from './CleaningChecklist';

const DEEP_CLEANING_COLOR = '#10B981';
const DEEP_CLEANING_BG = '#ECFDF5';
const DEEP_CLEANING_BORDER = '#A7F3D0';

export default function CleaningReminder() {
  const { getTodayCleaningShift } = useParking();
  const [checklistVisible, setChecklistVisible] = useState<boolean>(false);

  const cleaningShift = getTodayCleaningShift();

  const openChecklist = useCallback(() => {
    setChecklistVisible(true);
  }, []);

  const closeChecklist = useCallback(() => {
    setChecklistVisible(false);
  }, []);

  if (!cleaningShift) return null;

  return (
    <>
      <View style={styles.banner} testID="cleaning-reminder-banner">
        <View style={styles.bannerTop}>
          <View style={styles.iconWrap}>
            <Sparkles size={22} color={DEEP_CLEANING_COLOR} />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.title}>Сегодня генеральная уборка!</Text>
            <Text style={styles.subtitle}>Выполнить по чек-листу до закрытия смены</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.checklistBtn}
            onPress={openChecklist}
            activeOpacity={0.7}
            testID="cleaning-open-checklist"
          >
            <ClipboardList size={16} color={DEEP_CLEANING_COLOR} />
            <Text style={styles.checklistBtnText}>Чек-лист уборки</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.completeQuickBtn}
            onPress={openChecklist}
            activeOpacity={0.7}
            testID="cleaning-mark-done"
          >
            <CheckCircle size={16} color={Colors.white} />
            <Text style={styles.completeQuickBtnText}>Отметить выполнено</Text>
          </TouchableOpacity>
        </View>
      </View>

      <CleaningChecklist
        shiftId={cleaningShift.id}
        visible={checklistVisible}
        onClose={closeChecklist}
      />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: DEEP_CLEANING_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: DEEP_CLEANING_BORDER,
    borderLeftWidth: 4,
    borderLeftColor: DEEP_CLEANING_COLOR,
  },
  bannerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: DEEP_CLEANING_COLOR + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#065F46',
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 13,
    color: '#047857',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  checklistBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: DEEP_CLEANING_COLOR,
    backgroundColor: Colors.white,
  },
  checklistBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: DEEP_CLEANING_COLOR,
  },
  completeQuickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: DEEP_CLEANING_COLOR,
  },
  completeQuickBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.white,
  },
});
