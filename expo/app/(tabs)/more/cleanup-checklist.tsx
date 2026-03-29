import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Alert, Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import { Plus, Trash2, GripVertical, Pencil, Check, X, Sparkles, ChevronUp, ChevronDown } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { useAuth } from '@/providers/AuthProvider';
import { CleanupTemplateItem } from '@/types';
import { generateId } from '@/utils/id';

const DEEP_CLEANING_COLOR = '#10B981';

export default function CleanupChecklistEditorScreen() {
  const { getCleanupTemplate, updateCleanupTemplate } = useParking();
  const { isAdmin } = useAuth();

  const currentTemplate = useMemo(() => getCleanupTemplate(), [getCleanupTemplate]);
  const [items, setItems] = useState<CleanupTemplateItem[]>(currentTemplate);
  const [newItemText, setNewItemText] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [hasChanges, setHasChanges] = useState<boolean>(false);

  const markChanged = useCallback(() => {
    setHasChanges(true);
  }, []);

  const handleAddItem = useCallback(() => {
    const text = newItemText.trim();
    if (!text) {
      Alert.alert('Ошибка', 'Введите текст задачи');
      return;
    }
    const newItem: CleanupTemplateItem = {
      id: generateId(),
      label: text,
      order: items.length,
    };
    setItems(prev => [...prev, newItem]);
    setNewItemText('');
    markChanged();
    console.log(`[CleanupEditor] Added item: ${text}`);
  }, [newItemText, items.length, markChanged]);

  const handleDeleteItem = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    Alert.alert(
      'Удалить пункт?',
      `«${item.label}» будет удалён из шаблона чек-листа.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            setItems(prev => prev.filter(i => i.id !== itemId).map((i, idx) => ({ ...i, order: idx })));
            markChanged();
            console.log(`[CleanupEditor] Deleted item: ${itemId}`);
          },
        },
      ],
    );
  }, [items, markChanged]);

  const handleStartEdit = useCallback((item: CleanupTemplateItem) => {
    setEditingId(item.id);
    setEditingText(item.label);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId) return;
    const text = editingText.trim();
    if (!text) {
      Alert.alert('Ошибка', 'Текст задачи не может быть пустым');
      return;
    }
    setItems(prev => prev.map(i => i.id === editingId ? { ...i, label: text } : i));
    setEditingId(null);
    setEditingText('');
    markChanged();
    console.log(`[CleanupEditor] Edited item: ${editingId}`);
  }, [editingId, editingText, markChanged]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingText('');
  }, []);

  const handleMoveUp = useCallback((index: number) => {
    if (index <= 0) return;
    setItems(prev => {
      const newItems = [...prev];
      const temp = newItems[index];
      newItems[index] = newItems[index - 1];
      newItems[index - 1] = temp;
      return newItems.map((i, idx) => ({ ...i, order: idx }));
    });
    markChanged();
  }, [markChanged]);

  const handleMoveDown = useCallback((index: number) => {
    if (index >= items.length - 1) return;
    setItems(prev => {
      const newItems = [...prev];
      const temp = newItems[index];
      newItems[index] = newItems[index + 1];
      newItems[index + 1] = temp;
      return newItems.map((i, idx) => ({ ...i, order: idx }));
    });
    markChanged();
  }, [items.length, markChanged]);

  const handleSaveTemplate = useCallback(() => {
    if (items.length === 0) {
      Alert.alert('Ошибка', 'Чек-лист не может быть пустым. Добавьте хотя бы один пункт.');
      return;
    }
    updateCleanupTemplate(items);
    setHasChanges(false);
    Alert.alert('Сохранено', 'Шаблон чек-листа обновлён. Изменения будут применены в новых сменах с генуборкой.');
    console.log(`[CleanupEditor] Template saved: ${items.length} items`);
  }, [items, updateCleanupTemplate]);

  if (!isAdmin) {
    return (
      <View style={styles.blockedContainer}>
        <Stack.Screen options={{ title: 'Чек-лист уборки' }} />
        <View style={styles.blockedCard}>
          <Sparkles size={40} color={Colors.textMuted} />
          <Text style={styles.blockedTitle}>Доступ ограничен</Text>
          <Text style={styles.blockedText}>Редактировать чек-лист может только администратор</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Чек-лист уборки' }} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerIconWrap}>
              <Sparkles size={20} color={DEEP_CLEANING_COLOR} />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>Шаблон чек-листа</Text>
              <Text style={styles.headerSubtitle}>
                Пункты применяются ко всем новым сменам с генеральной уборкой
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.addSection}>
          <Text style={styles.sectionLabel}>Добавить пункт</Text>
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              value={newItemText}
              onChangeText={setNewItemText}
              placeholder="Например: Проверить освещение"
              placeholderTextColor={Colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={handleAddItem}
              testID="cleanup-template-add-input"
            />
            <TouchableOpacity
              style={[styles.addBtn, !newItemText.trim() && styles.addBtnDisabled]}
              onPress={handleAddItem}
              activeOpacity={0.7}
              disabled={!newItemText.trim()}
              testID="cleanup-template-add-btn"
            >
              <Plus size={20} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.listSection}>
          <Text style={styles.sectionLabel}>
            Текущие пункты ({items.length})
          </Text>

          {items.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                Нет пунктов. Добавьте первый выше.
              </Text>
            </View>
          ) : (
            items.map((item, index) => (
              <View key={item.id} style={styles.itemCard} testID={`cleanup-template-item-${item.id}`}>
                {editingId === item.id ? (
                  <View style={styles.editRow}>
                    <TextInput
                      style={styles.editInput}
                      value={editingText}
                      onChangeText={setEditingText}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleSaveEdit}
                      testID="cleanup-template-edit-input"
                    />
                    <TouchableOpacity
                      style={styles.editConfirmBtn}
                      onPress={handleSaveEdit}
                      activeOpacity={0.7}
                    >
                      <Check size={18} color={Colors.white} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.editCancelBtn}
                      onPress={handleCancelEdit}
                      activeOpacity={0.7}
                    >
                      <X size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.itemRow}>
                    <View style={styles.itemOrderWrap}>
                      <GripVertical size={16} color={Colors.textMuted} />
                    </View>

                    <View style={styles.itemNumberWrap}>
                      <Text style={styles.itemNumber}>{index + 1}</Text>
                    </View>

                    <Text style={styles.itemLabel} numberOfLines={2}>
                      {item.label}
                    </Text>

                    <View style={styles.itemActions}>
                      <TouchableOpacity
                        style={[styles.moveBtn, index === 0 && styles.moveBtnDisabled]}
                        onPress={() => handleMoveUp(index)}
                        disabled={index === 0}
                        activeOpacity={0.7}
                      >
                        <ChevronUp size={16} color={index === 0 ? Colors.border : Colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.moveBtn, index === items.length - 1 && styles.moveBtnDisabled]}
                        onPress={() => handleMoveDown(index)}
                        disabled={index === items.length - 1}
                        activeOpacity={0.7}
                      >
                        <ChevronDown size={16} color={index === items.length - 1 ? Colors.border : Colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => handleStartEdit(item)}
                        activeOpacity={0.7}
                      >
                        <Pencil size={14} color={Colors.info} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDeleteItem(item.id)}
                        activeOpacity={0.7}
                      >
                        <Trash2 size={14} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        {hasChanges && (
          <View style={styles.saveSection}>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSaveTemplate}
              activeOpacity={0.7}
              testID="cleanup-template-save-btn"
            >
              <Check size={18} color={Colors.white} />
              <Text style={styles.saveBtnText}>Сохранить шаблон</Text>
            </TouchableOpacity>
            <Text style={styles.saveHint}>
              Изменения ещё не сохранены
            </Text>
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Как это работает</Text>
          <Text style={styles.infoText}>
            {'\u2022'} Этот шаблон используется при каждой генеральной уборке{'\n'}
            {'\u2022'} Менеджер видит готовый список и отмечает пункты{'\n'}
            {'\u2022'} Менеджер не может менять структуру чек-листа{'\n'}
            {'\u2022'} Изменения применяются к новым сменам с генуборкой
          </Text>
        </View>
      </ScrollView>
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
  blockedContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  blockedCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  blockedTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  blockedText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center' as const,
  },
  headerCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 16,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: DEEP_CLEANING_COLOR + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#065F46',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#047857',
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  addSection: {
    marginBottom: 20,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addInput: {
    flex: 1,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 12 : 14,
    fontSize: 15,
    color: Colors.text,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: DEEP_CLEANING_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    backgroundColor: Colors.border,
  },
  listSection: {
    marginBottom: 16,
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
  itemCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 6,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 6,
  },
  itemOrderWrap: {
    padding: 4,
    opacity: 0.4,
  },
  itemNumberWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: DEEP_CLEANING_COLOR + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemNumber: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: DEEP_CLEANING_COLOR,
  },
  itemLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.text,
    marginHorizontal: 4,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  moveBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  moveBtnDisabled: {
    opacity: 0.4,
  },
  editBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.infoLight,
  },
  deleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dangerLight,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 6,
  },
  editInput: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.info,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    fontSize: 14,
    color: Colors.text,
  },
  editConfirmBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: DEEP_CLEANING_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCancelBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveSection: {
    marginBottom: 16,
    alignItems: 'center',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: DEEP_CLEANING_COLOR,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  saveHint: {
    fontSize: 12,
    color: Colors.warning,
    marginTop: 6,
    fontWeight: '500' as const,
  },
  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
