import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { UserPlus, Check, AlertCircle, Car } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import ShiftGuard from '@/components/ShiftGuard';
import { formatPlateNumber } from '@/utils/plate';

export default function AddClientModal() {
  const router = useRouter();
  const { addClient, addCarToClient, clients, cars } = useParking();
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('+7');
  const [plateNumber, setPlateNumber] = useState<string>('');
  const [carModel, setCarModel] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string; plate?: string; carModel?: string }>({});

  const matchingClients = useMemo(() => {
    const nameLower = name.toLowerCase().trim();
    const phoneDigits = phone.replace(/\D/g, '');
    if (nameLower.length < 2 && phoneDigits.length < 7) return [];

    return clients.filter(c => {
      const clientPhoneDigits = c.phone.replace(/\D/g, '');
      return (nameLower.length >= 2 && c.name.toLowerCase().includes(nameLower)) ||
        (phoneDigits.length >= 7 && clientPhoneDigits.includes(phoneDigits));
    }).slice(0, 5);
  }, [clients, name, phone]);

  const validate = useCallback((): boolean => {
    const newErrors: { name?: string; phone?: string; plate?: string; carModel?: string } = {};
    if (!name.trim()) newErrors.name = 'Заполните ФИО';
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 7) newErrors.phone = 'Укажите номер телефона';
    if (!carModel.trim()) newErrors.carModel = 'Укажите марку автомобиля';
    if (!plateNumber.trim()) newErrors.plate = 'Укажите номер автомобиля';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, phone, plateNumber, carModel]);

  const handleAdd = useCallback(() => {
    if (!validate()) return;
    const formatted = formatPlateNumber(plateNumber);
    addClient(name.trim(), phone.trim(), formatted, notes.trim(), carModel.trim());
    Alert.alert('Готово', `Клиент ${name.trim()} добавлен`);
    router.back();
  }, [name, phone, plateNumber, notes, carModel, addClient, router, validate]);

  const handleAddCarToExisting = useCallback((clientId: string, clientName: string) => {
    if (!plateNumber.trim()) {
      Alert.alert('Ошибка', 'Сначала введите номер автомобиля');
      return;
    }
    const formatted = formatPlateNumber(plateNumber);
    const existingCar = cars.find(c => c.plateNumber === formatted);
    if (existingCar) {
      Alert.alert('Ошибка', `Автомобиль ${formatted} уже зарегистрирован`);
      return;
    }
    addCarToClient(clientId, formatted, carModel.trim());
    Alert.alert('Готово', `Автомобиль ${formatted} добавлен к клиенту ${clientName}`);
    router.back();
  }, [plateNumber, carModel, cars, addCarToClient, router]);

  return (
    <ShiftGuard>
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.iconBlock}>
          <View style={styles.iconCircle}>
            <UserPlus size={28} color={Colors.primary} />
          </View>
          <Text style={styles.title}>Новый клиент</Text>
          <Text style={styles.subtitle}>Заполните данные для добавления в базу</Text>
        </View>

        <Text style={styles.label}>ФИО *</Text>
        <TextInput
          style={[styles.input, errors.name ? styles.inputError : null]}
          placeholder="Иванов Пётр Сергеевич"
          placeholderTextColor={Colors.textMuted}
          value={name}
          onChangeText={(v) => { setName(v); if (errors.name) setErrors(e => ({ ...e, name: undefined })); }}
          autoFocus
          testID="add-client-name"
        />
        {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}

        <Text style={styles.label}>Телефон *</Text>
        <TextInput
          style={[styles.input, errors.phone ? styles.inputError : null]}
          placeholder="+7 916 123-45-67"
          placeholderTextColor={Colors.textMuted}
          value={phone}
          onChangeText={(v) => { setPhone(v); if (errors.phone) setErrors(e => ({ ...e, phone: undefined })); }}
          keyboardType="phone-pad"
          testID="add-client-phone"
        />
        {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}

        <Text style={styles.label}>Номер автомобиля *</Text>
        <TextInput
          style={[styles.input, styles.plateInput, errors.plate ? styles.inputError : null]}
          placeholder="А123ВС777"
          placeholderTextColor={Colors.textMuted}
          value={plateNumber}
          onChangeText={(v) => { setPlateNumber(v); if (errors.plate) setErrors(e => ({ ...e, plate: undefined })); }}
          autoCapitalize="characters"
          testID="add-client-plate"
        />
        {errors.plate ? <Text style={styles.errorText}>{errors.plate}</Text> : null}

        <Text style={styles.label}>Марка (модель) автомобиля *</Text>
        <TextInput
          style={[styles.input, errors.carModel ? styles.inputError : null]}
          placeholder="Toyota Camry, Hyundai Solaris..."
          placeholderTextColor={Colors.textMuted}
          value={carModel}
          onChangeText={(v) => { setCarModel(v); if (errors.carModel) setErrors(e => ({ ...e, carModel: undefined })); }}
          testID="add-client-car-model"
        />
        {errors.carModel ? <Text style={styles.errorText}>{errors.carModel}</Text> : null}

        {matchingClients.length > 0 && (
          <View style={styles.matchesBlock}>
            <View style={styles.matchesHeader}>
              <AlertCircle size={16} color={Colors.warning} />
              <Text style={styles.matchesTitle}>Похожие клиенты найдены</Text>
            </View>
            <Text style={styles.matchesHint}>
              Если клиент уже есть в базе, добавьте авто к нему
            </Text>
            {matchingClients.map(client => {
              const clientCars = cars.filter(c => c.clientId === client.id);
              return (
                <View key={client.id} style={styles.matchCard}>
                  <View style={styles.matchInfo}>
                    <Text style={styles.matchName}>{client.name}</Text>
                    <Text style={styles.matchPhone}>{client.phone}</Text>
                    {clientCars.length > 0 && (
                      <View style={styles.matchCarsRow}>
                        <Car size={12} color={Colors.textMuted} />
                        <Text style={styles.matchCars}>
                          {clientCars.map(c => c.carModel ? `${c.plateNumber} (${c.carModel})` : c.plateNumber).join(', ')}
                        </Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.addCarBtn}
                    onPress={() => handleAddCarToExisting(client.id, client.name)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.addCarBtnText}>Добавить авто</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.label}>Примечание</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="Необязательно"
          placeholderTextColor={Colors.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
          testID="add-client-notes"
        />

        <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.7} testID="add-client-submit">
          <Check size={20} color={Colors.white} />
          <Text style={styles.addBtnText}>
            {matchingClients.length > 0 ? 'Создать нового клиента' : 'Добавить клиента'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
    </ShiftGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
  },
  iconBlock: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  label: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  plateInput: {
    fontSize: 17,
    fontWeight: '600' as const,
    letterSpacing: 1,
  },
  notesInput: {
    height: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  matchesBlock: {
    backgroundColor: Colors.warningLight,
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  matchesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  matchesTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.warning,
  },
  matchesHint: {
    fontSize: 12,
    color: Colors.warning,
    marginBottom: 10,
    opacity: 0.8,
  },
  matchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  matchInfo: {
    flex: 1,
  },
  matchName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  matchPhone: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  matchCarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  matchCars: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  addCarBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  addCarBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  inputError: {
    borderColor: Colors.danger,
    borderWidth: 1.5,
  },
  errorText: {
    fontSize: 12,
    color: Colors.danger,
    marginTop: 4,
    marginLeft: 4,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    height: 52,
    borderRadius: 14,
    gap: 8,
    marginTop: 28,
  },
  addBtnText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '600' as const,
  },
});
