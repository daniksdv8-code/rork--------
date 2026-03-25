import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Search, UserPlus, LogIn as LogInIcon, AlertCircle, Car, Check, Clock, Plus, Wallet, AlertTriangle, Banknote, CreditCard } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import ShiftGuard from '@/components/ShiftGuard';
import { formatPlateNumber } from '@/utils/plate';
import { isExpired, getMonthlyAmount, toDateString } from '@/utils/date';
import { roundMoney } from '@/utils/money';
import { ServiceType, PaymentMethod, TariffType } from '@/types';

export default function CheckinScreen() {
  const { currentUser } = useAuth();
  const { getClientByCar, addClient, addCarToClient, checkIn, tariffs, activeClients, activeCars, getSubscription, needsShiftCheck } = useParking();
  const { isAdmin } = useAuth();
  const [plateInput, setPlateInput] = useState<string>('');
  const [foundClient, setFoundClient] = useState<{ name: string; phone: string; carId: string; clientId: string } | null>(null);
  const [showNewForm, setShowNewForm] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newPhone, setNewPhone] = useState<string>('+7');
  const [newNotes, setNewNotes] = useState<string>('');
  const [newCarModel, setNewCarModel] = useState<string>('');
  const [serviceType, setServiceType] = useState<ServiceType>('onetime');
  const [tariffType, setTariffType] = useState<TariffType>('standard');
  const [plannedDeparture, setPlannedDeparture] = useState<string>('');
  const [showDropdown, setShowDropdown] = useState<boolean>(false);

  const [paymentStatus, setPaymentStatus] = useState<'pay_now' | 'in_debt'>('pay_now');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [payDays, setPayDays] = useState<string>('1');
  const [monthlyMonths, setMonthlyMonths] = useState<string>('1');
  const [monthlyStartDate, setMonthlyStartDate] = useState<string>(toDateString(new Date()));

  const shiftRequired = needsShiftCheck();

  const plateSuggestions = useMemo(() => {
    const q = plateInput.trim().toUpperCase().replace(/\s+/g, '');
    if (q.length < 1 || foundClient || showNewForm) return [];
    return activeCars.filter(car => car.plateNumber.toUpperCase().includes(q)).slice(0, 8).map(car => {
      const client = activeClients.find(c => c.id === car.clientId);
      return { car, client: client ?? null };
    });
  }, [plateInput, activeCars, activeClients, foundClient, showNewForm]);

  const noMatchesForPlate = useMemo(() => {
    const q = plateInput.trim().toUpperCase().replace(/\s+/g, '');
    if (q.length < 2 || foundClient || showNewForm) return false;
    return plateSuggestions.length === 0;
  }, [plateInput, plateSuggestions, foundClient, showNewForm]);

  const matchingClients = useMemo(() => {
    if (!showNewForm) return [];
    const nameLower = newName.toLowerCase().trim();
    const phoneDigits = newPhone.replace(/\D/g, '');
    if (nameLower.length < 2 && phoneDigits.length < 7) return [];

    return activeClients.filter(c => {
      const clientPhoneDigits = c.phone.replace(/\D/g, '');
      return (nameLower.length >= 2 && c.name.toLowerCase().includes(nameLower)) ||
        (phoneDigits.length >= 7 && clientPhoneDigits.includes(phoneDigits));
    }).slice(0, 5);
  }, [showNewForm, activeClients, newName, newPhone]);

  const monthlyCalc = useMemo(() => {
    const months = Math.max(1, parseInt(monthlyMonths, 10) || 1);
    const dailyRate = paymentMethod === 'cash' ? tariffs.monthlyCash : tariffs.monthlyCard;
    const parts = monthlyStartDate.split('-').map(Number);
    const startDate = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date();
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);

    const totalDays = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const price30 = dailyRate * 30;
    const totalPrice = roundMoney((price30 / 30) * totalDays);
    const paidUntil = endDate.toISOString();

    return { months, dailyRate, startDate, endDate, totalDays, price30, totalPrice, paidUntil };
  }, [monthlyMonths, monthlyStartDate, paymentMethod, tariffs]);

  const paymentAmount = useMemo(() => {
    if (tariffType === 'lombard') {
      const d = Math.max(1, parseInt(payDays, 10) || 1);
      return tariffs.lombardRate * d;
    }
    if (serviceType === 'onetime') {
      const d = Math.max(1, parseInt(payDays, 10) || 1);
      return paymentMethod === 'cash' ? tariffs.onetimeCash * d : tariffs.onetimeCard * d;
    }
    return monthlyCalc.totalPrice;
  }, [serviceType, tariffType, payDays, paymentMethod, tariffs, monthlyCalc]);

  const resetForm = useCallback(() => {
    setPlateInput('');
    setFoundClient(null);
    setShowNewForm(false);
    setShowDropdown(false);
    setNewName('');
    setNewPhone('+7');
    setNewNotes('');
    setNewCarModel('');
    setServiceType('onetime');
    setTariffType('standard');
    setPlannedDeparture('');
    setPaymentStatus('pay_now');
    setPaymentMethod('cash');
    setPayDays('1');
    setMonthlyMonths('1');
    setMonthlyStartDate(toDateString(new Date()));
  }, []);

  const handlePlateChange = useCallback((text: string) => {
    setPlateInput(text);
    setFoundClient(null);
    setShowNewForm(false);
    if (text.trim().length >= 1) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  }, []);

  const handleSelectSuggestion = useCallback((carId: string, clientId: string, clientName: string, clientPhone: string, plateNumber: string) => {
    setPlateInput(plateNumber);
    setShowDropdown(false);
    setFoundClient({ name: clientName, phone: clientPhone, carId, clientId });
    const sub = getSubscription(carId, clientId);
    if (sub && !isExpired(sub.paidUntil)) {
      setServiceType('monthly');
    } else {
      setServiceType('onetime');
    }
    setShowNewForm(false);
    console.log(`[Checkin] Selected suggestion: ${plateNumber} -> ${clientName}`);
  }, [getSubscription]);

  const handleCreateNewFromPlate = useCallback(() => {
    const formatted = formatPlateNumber(plateInput);
    setPlateInput(formatted);
    setShowDropdown(false);
    setFoundClient(null);
    setShowNewForm(true);
  }, [plateInput]);

  const handleSearchPlate = useCallback(() => {
    if (!plateInput.trim()) return;
    const formatted = formatPlateNumber(plateInput);
    setPlateInput(formatted);
    setShowDropdown(false);
    const result = getClientByCar(formatted);
    if (result) {
      setFoundClient({
        name: result.client.name,
        phone: result.client.phone,
        carId: result.car.id,
        clientId: result.client.id,
      });
      const sub = getSubscription(result.car.id, result.client.id);
      if (sub && !isExpired(sub.paidUntil)) {
        setServiceType('monthly');
      } else {
        setServiceType('onetime');
      }
      setShowNewForm(false);
    } else {
      setFoundClient(null);
      setShowNewForm(true);
    }
  }, [plateInput, getClientByCar, getSubscription]);

  const foundClientHasActiveSub = useMemo(() => {
    if (!foundClient) return false;
    const sub = getSubscription(foundClient.carId, foundClient.clientId);
    return !!sub && !isExpired(sub.paidUntil);
  }, [foundClient, getSubscription]);

  const buildPaymentAtEntry = useCallback((): { method: PaymentMethod; amount: number; days?: number; paidUntilDate?: string } | undefined => {
    if (paymentStatus !== 'pay_now' || paymentAmount <= 0) return undefined;
    if (serviceType === 'onetime') {
      const d = Math.max(1, parseInt(payDays, 10) || 1);
      return { method: paymentMethod, amount: paymentAmount, days: d };
    }
    return { method: paymentMethod, amount: paymentAmount, paidUntilDate: monthlyCalc.paidUntil };
  }, [paymentStatus, paymentAmount, paymentMethod, serviceType, payDays, monthlyCalc]);

  const buildDebtAtEntry = useCallback((): { amount: number; description?: string } | undefined => {
    if (tariffType === 'lombard') {
      return { amount: tariffs.lombardRate, description: `Ломбард: ${tariffs.lombardRate} ₽/сут.` };
    }
    if (paymentStatus !== 'in_debt' || paymentAmount <= 0) return undefined;
    const desc = serviceType === 'onetime'
      ? `Парковка без оплаты: ${Math.max(1, parseInt(payDays, 10) || 1)} сут. × ${paymentMethod === 'cash' ? tariffs.onetimeCash : tariffs.onetimeCard} ₽`
      : `Месячный абонемент без оплаты: ${paymentAmount} ₽`;
    return { amount: paymentAmount, description: desc };
  }, [paymentStatus, paymentAmount, serviceType, tariffType, payDays, paymentMethod, tariffs]);

  const handleCheckin = useCallback(() => {
    if (!isAdmin && shiftRequired) {
      Alert.alert('Смена не открыта', 'Откройте смену, чтобы начать работу.');
      return;
    }
    if (!foundClient) return;
    const isLombard = tariffType === 'lombard';
    const finalServiceType: ServiceType = isLombard ? 'lombard' : (foundClientHasActiveSub ? 'monthly' : serviceType);
    const payment = isLombard ? undefined : buildPaymentAtEntry();
    const debt = buildDebtAtEntry();
    checkIn(foundClient.carId, foundClient.clientId, finalServiceType, plannedDeparture.trim() || undefined, payment, debt, false, isLombard);
    const typeLabel = isLombard ? 'ломбард' : (foundClientHasActiveSub ? 'месяц (абонемент)' : (finalServiceType === 'monthly' ? 'месяц' : 'разово'));
    const payLabel = payment ? `\nОплата: ${payment.amount} ₽` : '';
    const debtLabel = isLombard ? `\nЛомбард: ${tariffs.lombardRate} ₽/сут.` : (debt ? `\nВ долг: ${debt.amount} ₽` : '');
    Alert.alert('Готово', `Заезд зафиксирован (${typeLabel}): ${formatPlateNumber(plateInput)}${payLabel}${debtLabel}`);
    resetForm();
  }, [foundClient, foundClientHasActiveSub, serviceType, tariffType, tariffs, checkIn, plateInput, resetForm, shiftRequired, plannedDeparture, buildPaymentAtEntry, buildDebtAtEntry, isAdmin]);

  const handleAddAndCheckin = useCallback(() => {
    if (!isAdmin && shiftRequired) {
      Alert.alert('Смена не открыта', 'Откройте смену, чтобы начать работу.');
      return;
    }
    if (!newName.trim()) {
      Alert.alert('Ошибка', 'Введите ФИО клиента');
      return;
    }
    if (newPhone.length < 5) {
      Alert.alert('Ошибка', 'Введите телефон клиента');
      return;
    }
    const formatted = formatPlateNumber(plateInput);
    const { client, car } = addClient(newName.trim(), newPhone.trim(), formatted, newNotes.trim(), newCarModel.trim());
    const isLombard = tariffType === 'lombard';
    const finalServiceType: ServiceType = isLombard ? 'lombard' : serviceType;
    const payment = isLombard ? undefined : buildPaymentAtEntry();
    const debt = buildDebtAtEntry();
    checkIn(car.id, client.id, finalServiceType, plannedDeparture.trim() || undefined, payment, debt, false, isLombard);
    const typeLabel = isLombard ? 'ломбард' : (serviceType === 'monthly' ? 'месяц' : 'разово');
    const payLabel = payment ? `\nОплата: ${payment.amount} ₽` : '';
    const debtLabel = isLombard ? `\nЛомбард: ${tariffs.lombardRate} ₽/сут.` : (debt ? `\nВ долг: ${debt.amount} ₽` : '');
    Alert.alert('Готово', `Клиент добавлен, заезд зафиксирован (${typeLabel}): ${formatted}${payLabel}${debtLabel}`);
    resetForm();
  }, [newName, newPhone, newNotes, newCarModel, plateInput, addClient, checkIn, serviceType, tariffType, tariffs, resetForm, shiftRequired, plannedDeparture, buildPaymentAtEntry, buildDebtAtEntry, isAdmin]);

  const handleAddCarToExistingAndCheckin = useCallback((existingClientId: string, existingClientName: string) => {
    if (!isAdmin && shiftRequired) {
      Alert.alert('Смена не открыта', 'Откройте смену, чтобы начать работу.');
      return;
    }
    const formatted = formatPlateNumber(plateInput);
    const existingCar = activeCars.find(c => c.plateNumber === formatted);
    if (existingCar) {
      Alert.alert('Ошибка', `Автомобиль ${formatted} уже зарегистрирован`);
      return;
    }
    const car = addCarToClient(existingClientId, formatted, newCarModel.trim());
    const isLombard = tariffType === 'lombard';
    const finalServiceType: ServiceType = isLombard ? 'lombard' : serviceType;
    const payment = isLombard ? undefined : buildPaymentAtEntry();
    const debt = buildDebtAtEntry();
    checkIn(car.id, existingClientId, finalServiceType, plannedDeparture.trim() || undefined, payment, debt, false, isLombard);
    const typeLabel = isLombard ? 'ломбард' : (serviceType === 'monthly' ? 'месяц' : 'разово');
    const payLabel = payment ? `\nОплата: ${payment.amount} ₽` : '';
    const debtLabel = isLombard ? `\nЛомбард: ${tariffs.lombardRate} ₽/сут.` : (debt ? `\nВ долг: ${debt.amount} ₽` : '');
    Alert.alert('Готово', `Авто привязано к ${existingClientName}, заезд зафиксирован (${typeLabel})${payLabel}${debtLabel}`);
    resetForm();
  }, [plateInput, newCarModel, activeCars, addCarToClient, checkIn, serviceType, tariffType, tariffs, resetForm, shiftRequired, plannedDeparture, buildPaymentAtEntry, buildDebtAtEntry, isAdmin]);

  if (!currentUser) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Требуется авторизация</Text>
      </View>
    );
  }

  const renderPlannedDepartureInput = () => (
    <>
      <Text style={styles.label}>Планируемое время выезда</Text>
      <View style={styles.departureRow}>
        <Clock size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.departureInput}
          placeholder="Напр. 18:00, завтра 10:00..."
          placeholderTextColor={Colors.textMuted}
          value={plannedDeparture}
          onChangeText={setPlannedDeparture}
          testID="planned-departure-input"
        />
      </View>
    </>
  );

  const renderServiceTypeSelector = () => (
    <>
      <Text style={styles.label}>Тип заезда</Text>
      <View style={styles.typeRow}>
        <TouchableOpacity
          style={[styles.typeBtn, tariffType === 'standard' && serviceType === 'onetime' && styles.typeBtnActive]}
          onPress={() => { setTariffType('standard'); setServiceType('onetime'); setPaymentStatus('pay_now'); }}
        >
          <Text style={[styles.typeBtnText, tariffType === 'standard' && serviceType === 'onetime' && styles.typeBtnTextActive]}>Разово</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeBtn, tariffType === 'standard' && serviceType === 'monthly' && styles.typeBtnActiveGreen]}
          onPress={() => { setTariffType('standard'); setServiceType('monthly'); setPaymentStatus('pay_now'); }}
        >
          <Text style={[styles.typeBtnText, tariffType === 'standard' && serviceType === 'monthly' && styles.typeBtnTextActive]}>Месяц</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeBtn, tariffType === 'lombard' && styles.typeBtnActiveLombard]}
          onPress={() => { setTariffType('lombard'); setServiceType('lombard'); setPaymentStatus('in_debt'); }}
        >
          <Text style={[styles.typeBtnText, tariffType === 'lombard' && styles.typeBtnTextActive]}>Ломбард</Text>
        </TouchableOpacity>
      </View>

      <View style={tariffType === 'lombard' ? styles.tariffHintLombard : styles.tariffHint}>
        <Text style={tariffType === 'lombard' ? styles.tariffHintTextLombard : styles.tariffHintText}>
          {tariffType === 'lombard'
            ? `Ломбард: ${tariffs.lombardRate} ₽/сутки, начисление с первого дня`
            : serviceType === 'onetime'
            ? `Тариф: ${tariffs.onetimeCash} ₽/сутки (нал.) / ${tariffs.onetimeCard} ₽/сутки (безнал.)`
            : `Тариф: ${tariffs.monthlyCash} ₽/день (нал.) / ${tariffs.monthlyCard} ₽/день (безнал.) — за мес. ${getMonthlyAmount(tariffs.monthlyCash)} / ${getMonthlyAmount(tariffs.monthlyCard)} ₽`
          }
        </Text>
        <Text style={tariffType === 'lombard' ? styles.tariffHintSubLombard : styles.tariffHintSub}>
          {tariffType === 'lombard'
            ? 'Оплата только при выезде или отдельной оплатой долга. Долг формируется автоматически.'
            : serviceType === 'onetime'
            ? 'Можно оплатить сейчас или при выезде.'
            : 'Можно оплатить сейчас или позже.'
          }
        </Text>
      </View>
    </>
  );

  const renderPaymentAtEntry = (forActiveSub?: boolean) => {
    if (forActiveSub) return null;
    if (tariffType === 'lombard') {
      return (
        <View style={styles.lombardNotice}>
          <AlertTriangle size={16} color="#b45309" />
          <View style={styles.lombardNoticeContent}>
            <Text style={styles.lombardNoticeTitle}>Тариф «Ломбард»</Text>
            <Text style={styles.lombardNoticeText}>
              Долг начисляется автоматически: {tariffs.lombardRate} ₽/сутки с первого дня.
              Оплата недоступна при постановке.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.paymentSection}>
        <Text style={styles.payLabel}>Способ оплаты</Text>
        <View style={styles.methodRow}>
          <TouchableOpacity
            style={[styles.methodBtn, paymentMethod === 'cash' && styles.methodBtnActive]}
            onPress={() => setPaymentMethod('cash')}
          >
            <Banknote size={16} color={paymentMethod === 'cash' ? Colors.white : Colors.textSecondary} />
            <Text style={[styles.methodBtnText, paymentMethod === 'cash' && styles.methodBtnTextActive]}>Наличные</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.methodBtn, paymentMethod === 'card' && styles.methodBtnActive]}
            onPress={() => setPaymentMethod('card')}
          >
            <CreditCard size={16} color={paymentMethod === 'card' ? Colors.white : Colors.textSecondary} />
            <Text style={[styles.methodBtnText, paymentMethod === 'card' && styles.methodBtnTextActive]}>Безнал</Text>
          </TouchableOpacity>
        </View>

        {serviceType === 'onetime' && (
          <>
            <Text style={styles.payLabel}>Количество суток</Text>
            <View style={styles.daysRow}>
              <TouchableOpacity
                style={styles.dayAdjustBtn}
                onPress={() => {
                  const d = Math.max(1, (parseInt(payDays, 10) || 1) - 1);
                  setPayDays(String(d));
                }}
              >
                <Text style={styles.dayAdjustText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.daysInput}
                value={payDays}
                onChangeText={(t) => setPayDays(t.replace(/[^0-9]/g, '') || '1')}
                keyboardType="number-pad"
                textAlign="center"
                testID="pay-days-input"
              />
              <TouchableOpacity
                style={styles.dayAdjustBtn}
                onPress={() => {
                  const d = (parseInt(payDays, 10) || 1) + 1;
                  setPayDays(String(d));
                }}
              >
                <Text style={styles.dayAdjustText}>+</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {serviceType === 'monthly' && (
          <>
            <Text style={styles.payLabel}>Дата начала (ГГГГ-ММ-ДД)</Text>
            <TextInput
              style={styles.formInput}
              value={monthlyStartDate}
              onChangeText={setMonthlyStartDate}
              placeholder="2025-03-01"
              placeholderTextColor={Colors.textMuted}
              testID="monthly-start-date"
            />
            <Text style={styles.payLabel}>Количество месяцев</Text>
            <View style={styles.daysRow}>
              <TouchableOpacity
                style={styles.dayAdjustBtn}
                onPress={() => {
                  const m = Math.max(1, (parseInt(monthlyMonths, 10) || 1) - 1);
                  setMonthlyMonths(String(m));
                }}
              >
                <Text style={styles.dayAdjustText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.daysInput}
                value={monthlyMonths}
                onChangeText={(t) => setMonthlyMonths(t.replace(/[^0-9]/g, '') || '1')}
                keyboardType="number-pad"
                textAlign="center"
                testID="monthly-months-input"
              />
              <TouchableOpacity
                style={styles.dayAdjustBtn}
                onPress={() => {
                  const m = (parseInt(monthlyMonths, 10) || 1) + 1;
                  setMonthlyMonths(String(m));
                }}
              >
                <Text style={styles.dayAdjustText}>+</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={styles.payAmountCard}>
          <Text style={styles.payAmountLabel}>
            {serviceType === 'onetime'
              ? `${Math.max(1, parseInt(payDays, 10) || 1)} сут. × ${paymentMethod === 'cash' ? tariffs.onetimeCash : tariffs.onetimeCard} ₽`
              : `${monthlyCalc.totalDays} дн. × ${monthlyCalc.dailyRate} ₽/день`
            }
          </Text>
          <Text style={styles.payAmountValue}>{paymentAmount} ₽</Text>
        </View>

        <Text style={[styles.payLabel, { marginTop: 16 }]}>Статус оплаты</Text>
        <View style={styles.statusRow}>
          <TouchableOpacity
            style={[styles.statusBtn, paymentStatus === 'pay_now' && styles.statusBtnPayActive]}
            onPress={() => setPaymentStatus('pay_now')}
            activeOpacity={0.7}
          >
            <Wallet size={16} color={paymentStatus === 'pay_now' ? Colors.white : Colors.success} />
            <Text style={[styles.statusBtnText, paymentStatus === 'pay_now' && styles.statusBtnTextActive]}>Оплатить сейчас</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statusBtn, paymentStatus === 'in_debt' && styles.statusBtnDebtActive]}
            onPress={() => setPaymentStatus('in_debt')}
            activeOpacity={0.7}
          >
            <AlertTriangle size={16} color={paymentStatus === 'in_debt' ? Colors.white : Colors.danger} />
            <Text style={[styles.statusBtnText, paymentStatus === 'in_debt' && styles.statusBtnDebtTextActive]}>В долг</Text>
          </TouchableOpacity>
        </View>

        {paymentStatus === 'in_debt' && (
          <View style={styles.debtNotice}>
            <AlertTriangle size={14} color={Colors.danger} />
            <Text style={styles.debtNoticeText}>
              Ориентировочный долг: {paymentAmount} ₽ (по дневному тарифу {tariffs.onetimeCash} ₽/сут.).{"\n"}Итоговая сумма будет пересчитана при погашении в зависимости от способа оплаты.
            </Text>
          </View>
        )}

        {serviceType === 'onetime' && paymentStatus === 'pay_now' && (
          <Text style={styles.payHint}>
            Если клиент задержится дольше, разница будет начислена как долг при выезде.
          </Text>
        )}
        {serviceType === 'monthly' && paymentStatus === 'pay_now' && (
          <Text style={styles.payHint}>
            Будет оформлена подписка на {monthlyCalc.totalDays} дней.
          </Text>
        )}
      </View>
    );
  };

  return (
    <ShiftGuard>
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!isAdmin && shiftRequired && (
          <View style={styles.shiftWarning}>
            <AlertCircle size={18} color={Colors.danger} />
            <Text style={styles.shiftWarningText}>Откройте смену в кассе, чтобы начать принимать автомобили</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Номер автомобиля</Text>
        <View style={styles.plateRow}>
          <TextInput
            style={styles.plateInput}
            placeholder="А123ВС777"
            placeholderTextColor={Colors.textMuted}
            value={plateInput}
            onChangeText={handlePlateChange}
            autoCapitalize="characters"
            onSubmitEditing={handleSearchPlate}
            testID="plate-input"
          />
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearchPlate} activeOpacity={0.7}>
            <Search size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {showDropdown && plateSuggestions.length > 0 && (
          <View style={styles.dropdown}>
            {plateSuggestions.map(({ car, client }) => (
              <TouchableOpacity
                key={car.id}
                style={styles.dropdownItem}
                onPress={() => client && handleSelectSuggestion(car.id, client.id, client.name, client.phone, car.plateNumber)}
                activeOpacity={0.7}
              >
                <View style={styles.dropdownPlateTag}>
                  <Car size={13} color={Colors.white} />
                  <Text style={styles.dropdownPlateText}>{car.plateNumber}</Text>
                </View>
                <View style={styles.dropdownClientInfo}>
                  <Text style={styles.dropdownClientName} numberOfLines={1}>{client?.name ?? 'Без клиента'}</Text>
                  {client && <Text style={styles.dropdownClientPhone}>{client.phone}</Text>}
                  {car.carModel ? <Text style={styles.dropdownCarModel}>{car.carModel}</Text> : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {showDropdown && noMatchesForPlate && (
          <View style={styles.noMatchCard}>
            <View style={styles.noMatchInfo}>
              <AlertCircle size={18} color={Colors.warning} />
              <Text style={styles.noMatchText}>Клиента с номером «{formatPlateNumber(plateInput)}» нет в базе</Text>
            </View>
            <TouchableOpacity style={styles.createNewBtn} onPress={handleCreateNewFromPlate} activeOpacity={0.7}>
              <Plus size={16} color={Colors.white} />
              <Text style={styles.createNewBtnText}>Создать нового клиента</Text>
            </TouchableOpacity>
          </View>
        )}

        {foundClient && (
          <View style={styles.clientCard}>
            <Text style={styles.clientCardTitle}>Клиент найден</Text>
            <View style={styles.clientInfo}>
              <Text style={styles.clientName}>{foundClient.name}</Text>
              <Text style={styles.clientPhone}>{foundClient.phone}</Text>
            </View>

            {foundClientHasActiveSub ? (
              <View style={styles.activeSubNotice}>
                <Check size={14} color={Colors.success} />
                <Text style={styles.activeSubNoticeText}>Месячный абонемент активен — заезд по абонементу</Text>
              </View>
            ) : (
              <>
                {renderServiceTypeSelector()}
                {renderPaymentAtEntry()}
              </>
            )}

            {renderPlannedDepartureInput()}

            <TouchableOpacity style={[styles.checkinBtn, (!isAdmin && shiftRequired) && styles.checkinBtnDisabled]} onPress={handleCheckin} activeOpacity={0.7}>
              <LogInIcon size={20} color={Colors.white} />
              <Text style={styles.checkinBtnText}>
                {tariffType === 'lombard'
                  ? `Заезд (ломбард ${tariffs.lombardRate} ₽/сут.)`
                  : paymentStatus === 'pay_now' && paymentAmount > 0
                  ? `Заезд + оплата ${paymentAmount} ₽`
                  : paymentStatus === 'in_debt' && paymentAmount > 0
                  ? `Заезд (в долг ${paymentAmount} ₽)`
                  : 'Зафиксировать заезд'
                }
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {showNewForm && (
          <View style={styles.clientCard}>
            <View style={styles.newClientHeader}>
              <UserPlus size={20} color={Colors.primary} />
              <Text style={styles.clientCardTitle}>Новый клиент</Text>
            </View>
            <Text style={styles.newClientHint}>Номер «{formatPlateNumber(plateInput)}» не найден в базе</Text>

            <Text style={styles.label}>ФИО *</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Иванов Пётр Сергеевич"
              placeholderTextColor={Colors.textMuted}
              value={newName}
              onChangeText={setNewName}
              testID="new-name-input"
            />

            <Text style={styles.label}>Телефон *</Text>
            <TextInput
              style={styles.formInput}
              placeholder="+7 916 123-45-67"
              placeholderTextColor={Colors.textMuted}
              value={newPhone}
              onChangeText={setNewPhone}
              keyboardType="phone-pad"
              testID="new-phone-input"
            />

            <Text style={styles.label}>Модель автомобиля</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Toyota Camry, Hyundai Solaris..."
              placeholderTextColor={Colors.textMuted}
              value={newCarModel}
              onChangeText={setNewCarModel}
              testID="new-car-model-input"
            />

            <Text style={styles.label}>Примечание</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Необязательно"
              placeholderTextColor={Colors.textMuted}
              value={newNotes}
              onChangeText={setNewNotes}
            />

            {matchingClients.length > 0 && (
              <View style={styles.matchesBlock}>
                <View style={styles.matchesHeader}>
                  <AlertCircle size={16} color={Colors.warning} />
                  <Text style={styles.matchesTitle}>Похожий клиент найден</Text>
                </View>
                <Text style={styles.matchesHint}>Привяжите авто к существующему клиенту</Text>
                {matchingClients.map(client => {
                  const clientCars = activeCars.filter(c => c.clientId === client.id);
                  return (
                    <View key={client.id} style={styles.matchCard}>
                      <View style={styles.matchInfo}>
                        <Text style={styles.matchName}>{client.name}</Text>
                        <Text style={styles.matchPhone}>{client.phone}</Text>
                        {clientCars.length > 0 && (
                          <View style={styles.matchCarsRow}>
                            <Car size={12} color={Colors.textMuted} />
                            <Text style={styles.matchCarsText}>
                              {clientCars.map(c => c.carModel ? `${c.plateNumber} (${c.carModel})` : c.plateNumber).join(', ')}
                            </Text>
                          </View>
                        )}
                      </View>
                      <TouchableOpacity
                        style={styles.useClientBtn}
                        onPress={() => handleAddCarToExistingAndCheckin(client.id, client.name)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.useClientBtnText}>Привязать + заезд</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {renderServiceTypeSelector()}
            {renderPaymentAtEntry()}
            {renderPlannedDepartureInput()}

            <TouchableOpacity style={[styles.checkinBtn, (!isAdmin && shiftRequired) && styles.checkinBtnDisabled]} onPress={handleAddAndCheckin} activeOpacity={0.7}>
              <UserPlus size={20} color={Colors.white} />
              <Text style={styles.checkinBtnText}>
                {tariffType === 'lombard'
                  ? `Добавить + заезд (ломбард ${tariffs.lombardRate} ₽/сут.)`
                  : paymentStatus === 'pay_now' && paymentAmount > 0
                  ? `Добавить + заезд + оплата ${paymentAmount} ₽`
                  : paymentStatus === 'in_debt' && paymentAmount > 0
                  ? `Добавить + заезд (в долг ${paymentAmount} ₽)`
                  : 'Добавить и зафиксировать заезд'
                }
              </Text>
            </TouchableOpacity>
          </View>
        )}
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
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  shiftWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.dangerLight,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  shiftWarningText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.danger,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  plateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  plateInput: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    letterSpacing: 1,
  },
  searchBtn: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 16,
  },
  clientCardTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  newClientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  newClientHint: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  clientInfo: {
    marginTop: 8,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  clientName: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  clientPhone: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
  formInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  departureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    gap: 8,
  },
  departureInput: {
    flex: 1,
    height: 46,
    fontSize: 15,
    color: Colors.text,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  typeBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeBtnActive: {
    backgroundColor: Colors.warning,
    borderColor: Colors.warning,
  },
  typeBtnActiveGreen: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  typeBtnActiveLombard: {
    backgroundColor: '#b45309',
    borderColor: '#b45309',
  },
  typeBtnText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  typeBtnTextActive: {
    color: Colors.white,
  },
  checkinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    height: 50,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
  },
  checkinBtnDisabled: {
    opacity: 0.5,
  },
  checkinBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  tariffHint: {
    backgroundColor: Colors.warningLight,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  tariffHintText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.warning,
  },
  tariffHintSub: {
    fontSize: 12,
    color: Colors.warning,
    marginTop: 4,
    opacity: 0.8,
  },
  tariffHintLombard: {
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#b4530930',
  },
  tariffHintTextLombard: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#b45309',
  },
  tariffHintSubLombard: {
    fontSize: 12,
    color: '#b45309',
    marginTop: 4,
    opacity: 0.8,
  },
  lombardNotice: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#b4530930',
  },
  lombardNoticeContent: {
    flex: 1,
  },
  lombardNoticeTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#b45309',
    marginBottom: 4,
  },
  lombardNoticeText: {
    fontSize: 13,
    color: '#92400e',
    lineHeight: 18,
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
  matchCarsText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  useClientBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  useClientBtnText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  activeSubNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.successLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  activeSubNoticeText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.success,
    flex: 1,
  },
  dropdown: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginTop: -12,
    marginBottom: 16,
    overflow: 'hidden' as const,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  dropdownItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  dropdownPlateTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 5,
  },
  dropdownPlateText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.white,
    letterSpacing: 0.5,
  },
  dropdownClientInfo: {
    flex: 1,
  },
  dropdownClientName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  dropdownClientPhone: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  dropdownCarModel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  noMatchCard: {
    backgroundColor: Colors.warningLight,
    borderRadius: 12,
    padding: 16,
    marginTop: -12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  noMatchInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 12,
  },
  noMatchText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.warning,
    flex: 1,
  },
  createNewBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 44,
    gap: 8,
  },
  createNewBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  paymentSection: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
    padding: 14,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  statusBtnPayActive: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  statusBtnDebtActive: {
    backgroundColor: Colors.danger,
    borderColor: Colors.danger,
  },
  statusBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  statusBtnTextActive: {
    color: Colors.white,
  },
  statusBtnDebtTextActive: {
    color: Colors.white,
  },
  debtNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.dangerLight,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.danger + '20',
  },
  debtNoticeText: {
    fontSize: 12,
    color: Colors.danger,
    flex: 1,
    lineHeight: 16,
  },
  payLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  methodBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  methodBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  methodBtnText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  methodBtnTextActive: {
    color: Colors.white,
  },
  daysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayAdjustBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayAdjustText: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  daysInput: {
    flex: 1,
    height: 40,
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    paddingHorizontal: 12,
  },
  payAmountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  payAmountLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  payAmountValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.success,
  },
  payHint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 8,
    lineHeight: 16,
  },
});
