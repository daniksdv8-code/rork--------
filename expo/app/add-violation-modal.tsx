import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { AlertTriangle, ChevronDown, Check } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';

const VIOLATION_TYPES = [
  'Опоздание на смену',
  'Некорректное обращение с клиентом',
  'Ошибка в кассе',
  'Невыполнение регламента',
  'Оставление рабочего места',
  'Нарушение дисциплины',
  'Другое',
];

export default function AddViolationModal() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { users, addViolation, getCurrentMonthViolations } = useParking();

  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [showManagerPicker, setShowManagerPicker] = useState<boolean>(false);
  const [showTypePicker, setShowTypePicker] = useState<boolean>(false);

  const managers = useMemo(() =>
    users.filter(u => u.role === 'manager' && u.active && !u.deleted),
  [users]);

  const selectedManager = useMemo(() =>
    managers.find(m => m.id === selectedManagerId),
  [managers, selectedManagerId]);

  const currentMonth = getCurrentMonthViolations();
  const canAdd = currentMonth.status !== 'bonus_denied' && currentMonth.violationCount < 3;

  const handleSubmit = useCallback(() => {
    if (!selectedManagerId) {
      Alert.alert('Ошибка', 'Выберите менеджера');
      return;
    }
    if (!selectedType) {
      Alert.alert('Ошибка', 'Выберите тип нарушения');
      return;
    }
    if (!canAdd) {
      Alert.alert('Ошибка', 'Достигнут лимит нарушений за этот месяц (3/3)');
      return;
    }

    const managerName = selectedManager?.name ?? 'Неизвестно';
    addViolation(selectedManagerId, managerName, selectedType, comment.trim());
    Alert.alert('Готово', `Нарушение зафиксировано для ${managerName}`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  }, [selectedManagerId, selectedType, comment, canAdd, selectedManager, addViolation, router]);

  if (!isAdmin) {
    return (
      <>
        <Stack.Screen options={{ title: 'Нарушение' }} />
        <View style={styles.container}>
          <Text style={styles.errorText}>Только администратор может фиксировать нарушения</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Новое нарушение' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.warningBanner}>
          <AlertTriangle size={20} color={Colors.warning} />
          <Text style={styles.warningText}>
            Текущий счётчик: {currentMonth.violationCount}/3
            {currentMonth.status === 'bonus_denied' ? ' — премия отменена' : ''}
          </Text>
        </View>

        <Text style={styles.label}>Менеджер</Text>
        <TouchableOpacity
          style={styles.picker}
          onPress={() => { setShowManagerPicker(!showManagerPicker); setShowTypePicker(false); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.pickerText, !selectedManagerId && styles.pickerPlaceholder]}>
            {selectedManager?.name ?? 'Выберите менеджера'}
          </Text>
          <ChevronDown size={18} color={Colors.textMuted} />
        </TouchableOpacity>

        {showManagerPicker && (
          <View style={styles.optionsList}>
            {managers.length === 0 ? (
              <View style={styles.optionItem}>
                <Text style={styles.optionTextMuted}>Нет доступных менеджеров</Text>
              </View>
            ) : (
              managers.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.optionItem, m.id === selectedManagerId && styles.optionItemSelected]}
                  onPress={() => { setSelectedManagerId(m.id); setShowManagerPicker(false); }}
                >
                  <Text style={[styles.optionText, m.id === selectedManagerId && styles.optionTextSelected]}>
                    {m.name}
                  </Text>
                  {m.id === selectedManagerId && <Check size={16} color={Colors.primary} />}
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <Text style={styles.label}>Тип нарушения</Text>
        <TouchableOpacity
          style={styles.picker}
          onPress={() => { setShowTypePicker(!showTypePicker); setShowManagerPicker(false); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.pickerText, !selectedType && styles.pickerPlaceholder]}>
            {selectedType || 'Выберите тип нарушения'}
          </Text>
          <ChevronDown size={18} color={Colors.textMuted} />
        </TouchableOpacity>

        {showTypePicker && (
          <View style={styles.optionsList}>
            {VIOLATION_TYPES.map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.optionItem, type === selectedType && styles.optionItemSelected]}
                onPress={() => { setSelectedType(type); setShowTypePicker(false); }}
              >
                <Text style={[styles.optionText, type === selectedType && styles.optionTextSelected]}>
                  {type}
                </Text>
                {type === selectedType && <Check size={16} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.label}>Комментарий (необязательно)</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Опишите детали нарушения..."
          placeholderTextColor={Colors.textMuted}
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.submitButton, (!canAdd || !selectedManagerId || !selectedType) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.7}
          disabled={!canAdd || !selectedManagerId || !selectedType}
        >
          <Text style={styles.submitButtonText}>Зафиксировать нарушение</Text>
        </TouchableOpacity>

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
  errorText: {
    fontSize: 16,
    color: Colors.danger,
    textAlign: 'center' as const,
    marginTop: 40,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center' as const,
    backgroundColor: Colors.warningLight,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  warningText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.warning,
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 8,
    marginTop: 4,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center' as const,
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 4,
  },
  pickerText: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
  },
  pickerPlaceholder: {
    color: Colors.textMuted,
  },
  optionsList: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
    marginBottom: 12,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center' as const,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  optionItemSelected: {
    backgroundColor: Colors.primary + '08',
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
  },
  optionTextSelected: {
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  optionTextMuted: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  textArea: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    fontSize: 15,
    color: Colors.text,
    minHeight: 100,
    marginBottom: 24,
  },
  submitButton: {
    backgroundColor: Colors.danger,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center' as const,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700' as const,
  },
});
