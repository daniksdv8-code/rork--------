import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Linking, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Phone, Car, Calendar, CreditCard, AlertTriangle, Trash2, Plus, Check, X, LogIn, LogOut, XCircle, RotateCcw, Ban, Pencil, Banknote, Wallet, Clock } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { formatDate, formatDateTime, isExpired, getMonthlyAmount, toDateString, daysUntil } from '@/utils/date';
import { roundMoney } from '@/utils/money';
import { formatPlateNumber } from '@/utils/plate';
import { ServiceType, PaymentMethod, TariffType } from '@/types';

export default function ClientCardScreen() {
  const router = useRouter();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const { isAdmin } = useAuth();
  const {
    clients, cars, sessions, subscriptions, debts, transactions, payments,
    getCarsByClient, getClientTotalDebt, deleteCar, deleteClient, addCarToClient,
    checkIn, checkOut, getSubscription, cancelCheckIn, cancelCheckOut, cancelPayment,
    needsShiftCheck, updateClient, updateCar, tariffs, logAction,
    addManualDebt, deleteManualDebt, getClientDebtInfo,
  } = useParking();

  const [showAddCar, setShowAddCar] = useState<boolean>(false);
  const [newPlate, setNewPlate] = useState<string>('');
  const [newCarModel, setNewCarModel] = useState<string>('');
  const [showCheckInForm, setShowCheckInForm] = useState<boolean>(false);
  const [checkInCarId, setCheckInCarId] = useState<string>('');
  const [checkInServiceType, setCheckInServiceType] = useState<ServiceType>('onetime');
  const [checkInTariffType, setCheckInTariffType] = useState<TariffType>('standard');
  const [checkInPlannedDeparture, setCheckInPlannedDeparture] = useState<string>('');

  const [customAmountEnabled, setCustomAmountEnabled] = useState<boolean>(false);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [adjustmentReason, setAdjustmentReason] = useState<string>('');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentStatus, setPaymentStatus] = useState<'pay_now' | 'in_debt'>('pay_now');
  const [payDays, setPayDays] = useState<string>('1');
  const [monthlyMonths, setMonthlyMonths] = useState<string>('1');
  const [monthlyStartDate, setMonthlyStartDate] = useState<string>(toDateString(new Date()));

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editPhone2, setEditPhone2] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editingCarId, setEditingCarId] = useState<string | null>(null);
  const [editCarPlate, setEditCarPlate] = useState<string>('');
  const [editCarModel, setEditCarModel] = useState<string>('');

  const [showAddDebt, setShowAddDebt] = useState<boolean>(false);
  const [newDebtAmount, setNewDebtAmount] = useState<string>('');
  const [newDebtDate, setNewDebtDate] = useState<string>(toDateString(new Date()));
  const [newDebtComment, setNewDebtComment] = useState<string>('');

  const shiftRequired = needsShiftCheck();

  const client = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId]);
  const isDeleted = !!client?.deleted;
  const clientCars = useMemo(() => clientId ? getCarsByClient(clientId) : [], [clientId, getCarsByClient]);
  const totalDebt = useMemo(() => clientId ? getClientTotalDebt(clientId) : 0, [clientId, getClientTotalDebt]);
  const clientDebts = useMemo(() => debts.filter(d => d.clientId === clientId && d.remainingAmount > 0), [debts, clientId]);
  const clientDebtInfo = useMemo(() => clientId ? getClientDebtInfo(clientId) : null, [clientId, getClientDebtInfo]);

  const clientActiveSessions = useMemo(() =>
    sessions.filter(s => s.clientId === clientId && (s.status === 'active' || s.status === 'active_debt') && !s.cancelled),
  [sessions, clientId]);

  const recentCompletedSessions = useMemo(() =>
    sessions.filter(s => s.clientId === clientId && (s.status === 'completed' || s.status === 'released' || s.status === 'released_debt') && !s.cancelled)
      .sort((a, b) => new Date(b.exitTime ?? b.entryTime).getTime() - new Date(a.exitTime ?? a.entryTime).getTime())
      .slice(0, 5),
  [sessions, clientId]);

  const clientPayments = useMemo(() =>
    payments.filter(p => p.clientId === clientId && !p.cancelled)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10),
  [payments, clientId]);

  const carsWithoutActiveSession = useMemo(() =>
    clientCars.filter(car => !clientActiveSessions.some(s => s.carId === car.id)),
  [clientCars, clientActiveSessions]);

  const hasActiveSubscription = useCallback((carId: string): boolean => {
    if (!clientId) return false;
    const sub = getSubscription(carId, clientId);
    return !!sub && !isExpired(sub.paidUntil);
  }, [clientId, getSubscription]);

  const clientSubscriptions = useMemo(() =>
    subscriptions.filter(s => s.clientId === clientId)
      .sort((a, b) => new Date(b.paidUntil).getTime() - new Date(a.paidUntil).getTime()),
  [subscriptions, clientId]);

  const clientTx = useMemo(() =>
    transactions.filter(t => t.clientId === clientId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20),
    [transactions, clientId]
  );

  const handleCall = useCallback((phoneNumber?: string) => {
    const num = phoneNumber || client?.phone;
    if (num) {
      const phone = num.replace(/\D/g, '');
      void Linking.openURL(`tel:+${phone}`);
    }
  }, [client]);

  const startEditClient = useCallback(() => {
    if (!client) return;
    setEditName(client.name);
    setEditPhone(client.phone);
    setEditPhone2(client.phone2 ?? '');
    setEditNotes(client.notes);
    setIsEditing(true);
  }, [client]);

  const saveEditClient = useCallback(() => {
    if (!clientId || !client) return;
    if (!editName.trim()) {
      Alert.alert('Ошибка', 'Имя клиента не может быть пустым');
      return;
    }
    if (!editPhone.trim()) {
      Alert.alert('Ошибка', 'Телефон не может быть пустым');
      return;
    }
    if (isAdmin) {
      const changes: string[] = [];
      if (editName.trim() !== client.name) changes.push(`имя: ${client.name} → ${editName.trim()}`);
      if (editPhone.trim() !== client.phone) changes.push(`тел: ${client.phone} → ${editPhone.trim()}`);
      if ((editPhone2.trim() || '') !== (client.phone2 || '')) changes.push(`тел2: ${client.phone2 || '—'} → ${editPhone2.trim() || '—'}`);
      if (editNotes.trim() !== client.notes) changes.push(`заметки изменены`);
      if (changes.length > 0) {
        logAction('admin_edit', '[ADMIN] Редактирование клиента', `Клиент ${client.name} | ${changes.join(', ')}`, clientId, 'client');
      }
    }
    updateClient(clientId, {
      name: editName.trim(),
      phone: editPhone.trim(),
      phone2: editPhone2.trim() || undefined,
      notes: editNotes.trim(),
    });
    setIsEditing(false);
    Alert.alert('Готово', 'Данные клиента обновлены');
  }, [clientId, client, editName, editPhone, editPhone2, editNotes, updateClient, isAdmin, logAction]);

  const startEditCar = useCallback((carId: string) => {
    const car = clientCars.find(c => c.id === carId);
    if (!car) return;
    setEditingCarId(carId);
    setEditCarPlate(car.plateNumber);
    setEditCarModel(car.carModel ?? '');
  }, [clientCars]);

  const saveEditCar = useCallback(() => {
    if (!editingCarId) return;
    if (!editCarPlate.trim()) {
      Alert.alert('Ошибка', 'Номер автомобиля не может быть пустым');
      return;
    }
    const formatted = formatPlateNumber(editCarPlate);
    const existingCar = cars.find(c => c.plateNumber === formatted && c.id !== editingCarId);
    if (existingCar) {
      Alert.alert('Ошибка', `Автомобиль ${formatted} уже зарегистрирован`);
      return;
    }
    if (isAdmin) {
      const oldCar = clientCars.find(c => c.id === editingCarId);
      if (oldCar) {
        const changes: string[] = [];
        if (formatted !== oldCar.plateNumber) changes.push(`номер: ${oldCar.plateNumber} → ${formatted}`);
        if (editCarModel.trim() !== (oldCar.carModel ?? '')) changes.push(`модель: ${oldCar.carModel || '—'} → ${editCarModel.trim() || '—'}`);
        if (changes.length > 0) {
          logAction('admin_edit', '[ADMIN] Редактирование авто', `Клиент ${client?.name ?? '—'} | ${changes.join(', ')}`, editingCarId, 'car');
        }
      }
    }
    updateCar(editingCarId, {
      plateNumber: editCarPlate.trim(),
      carModel: editCarModel.trim(),
    });
    setEditingCarId(null);
    Alert.alert('Готово', 'Данные автомобиля обновлены');
  }, [editingCarId, editCarPlate, editCarModel, cars, updateCar, isAdmin, clientCars, client, logAction]);

  const handleDeleteCar = useCallback((carId: string) => {
    const car = clientCars.find(c => c.id === carId);
    if (!car) return;
    const hasActiveSession = clientActiveSessions.some(s => s.carId === carId);
    const warningText = hasActiveSession
      ? `\n\n❗ У этого авто есть активная стоянка, она будет отменена.`
      : '';
    Alert.alert(
      'Удаление автомобиля',
      `Вы уверены, что хотите удалить автомобиль ${car.plateNumber}${car.carModel ? ` (${car.carModel})` : ''}? Это действие нельзя отменить.${warningText}`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            deleteCar(carId);
            Alert.alert('Готово', `Автомобиль ${car.plateNumber} удалён`);
          },
        },
      ]
    );
  }, [clientCars, clientActiveSessions, deleteCar]);

  const handleDelete = useCallback(() => {
    if (!clientId || !client) return;
    Alert.alert(
      'Удаление клиента',
      `Вы уверены, что хотите удалить клиента ${client.name} и все его автомобили? Это действие нельзя отменить.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            deleteClient(clientId);
            router.back();
          },
        },
      ]
    );
  }, [clientId, client, deleteClient, router]);

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

  const baseCheckInPaymentAmount = useMemo(() => {
    if (checkInCarId && hasActiveSubscription(checkInCarId)) return 0;
    if (checkInTariffType === 'lombard') {
      const d = Math.max(1, parseInt(payDays, 10) || 1);
      return tariffs.lombardRate * d;
    }
    if (checkInServiceType === 'onetime') {
      const d = Math.max(1, parseInt(payDays, 10) || 1);
      return paymentMethod === 'cash' ? tariffs.onetimeCash * d : tariffs.onetimeCard * d;
    }
    return monthlyCalc.totalPrice;
  }, [checkInCarId, checkInServiceType, checkInTariffType, payDays, paymentMethod, tariffs, monthlyCalc, hasActiveSubscription]);

  const checkInPaymentAmount = useMemo(() => {
    if (customAmountEnabled && customAmount.trim()) {
      const parsed = Number(customAmount);
      if (!isNaN(parsed) && parsed >= 0) return roundMoney(parsed);
    }
    return baseCheckInPaymentAmount;
  }, [customAmountEnabled, customAmount, baseCheckInPaymentAmount]);

  const checkInAdjustmentDiff = useMemo(() => {
    if (!customAmountEnabled || checkInPaymentAmount === baseCheckInPaymentAmount) return 0;
    return roundMoney(baseCheckInPaymentAmount - checkInPaymentAmount);
  }, [customAmountEnabled, checkInPaymentAmount, baseCheckInPaymentAmount]);

  const buildCheckInPayment = useCallback((): { method: PaymentMethod; amount: number; days?: number; paidUntilDate?: string; baseAmount?: number; adjustmentReason?: string } | undefined => {
    if (checkInTariffType === 'lombard') return undefined;
    if (paymentStatus !== 'pay_now' || checkInPaymentAmount <= 0) return undefined;
    const hasAdjustment = customAmountEnabled && checkInAdjustmentDiff !== 0;
    const base: any = { method: paymentMethod, amount: checkInPaymentAmount };
    if (hasAdjustment) {
      base.baseAmount = baseCheckInPaymentAmount;
      base.adjustmentReason = adjustmentReason.trim() || 'Договорная сумма';
    }
    if (checkInServiceType === 'onetime') {
      const d = Math.max(1, parseInt(payDays, 10) || 1);
      return { ...base, days: d };
    }
    return { ...base, paidUntilDate: monthlyCalc.paidUntil };
  }, [paymentStatus, checkInPaymentAmount, paymentMethod, checkInServiceType, checkInTariffType, payDays, monthlyCalc, customAmountEnabled, checkInAdjustmentDiff, baseCheckInPaymentAmount, adjustmentReason]);

  const buildCheckInDebt = useCallback((): { amount: number; description?: string } | undefined => {
    if (checkInTariffType === 'lombard') {
      return { amount: tariffs.lombardRate, description: `Ломбард: ${tariffs.lombardRate} ₽/сут.` };
    }
    if (paymentStatus !== 'in_debt' || checkInPaymentAmount <= 0) return undefined;
    const desc = checkInServiceType === 'onetime'
      ? `Вторичная постановка без оплаты: ${Math.max(1, parseInt(payDays, 10) || 1)} сут. × ${paymentMethod === 'cash' ? tariffs.onetimeCash : tariffs.onetimeCard} ₽`
      : `Вторичная постановка, месяц без оплаты: ${checkInPaymentAmount} ₽`;
    return { amount: checkInPaymentAmount, description: desc };
  }, [paymentStatus, checkInPaymentAmount, checkInServiceType, checkInTariffType, payDays, paymentMethod, tariffs]);

  const resetCheckInForm = useCallback(() => {
    setShowCheckInForm(false);
    setCheckInCarId('');
    setCheckInServiceType('onetime');
    setCheckInTariffType('standard');
    setCheckInPlannedDeparture('');
    setPaymentMethod('cash');
    setPaymentStatus('pay_now');
    setPayDays('1');
    setMonthlyMonths('1');
    setMonthlyStartDate(toDateString(new Date()));
    setCustomAmountEnabled(false);
    setCustomAmount('');
    setAdjustmentReason('');
  }, []);

  const handleCheckIn = useCallback(() => {
    if (!isAdmin && shiftRequired) {
      Alert.alert('Смена не открыта', 'Откройте смену, чтобы начать работу.');
      return;
    }
    if (!checkInCarId) {
      Alert.alert('Ошибка', 'Выберите автомобиль');
      return;
    }
    if (!clientId) return;
    const car = clientCars.find(c => c.id === checkInCarId);
    const carHasActiveSub = hasActiveSubscription(checkInCarId);
    const isLombard = checkInTariffType === 'lombard';
    const finalServiceType: ServiceType = isLombard ? 'lombard' : (carHasActiveSub ? 'monthly' : checkInServiceType);
    const payment = (carHasActiveSub || isLombard) ? undefined : buildCheckInPayment();
    const debt = carHasActiveSub ? undefined : buildCheckInDebt();
    checkIn(checkInCarId, clientId, finalServiceType, checkInPlannedDeparture.trim() || undefined, payment, debt, true, isLombard);
    const label = isLombard ? 'ломбард' : (carHasActiveSub ? 'месяц, абонемент активен' : (finalServiceType === 'monthly' ? 'месяц' : 'разово'));
    const payLabel = payment ? `\nОплата: ${payment.amount} ₽` : '';
    const debtLabel = isLombard ? `\nЛомбард: ${tariffs.lombardRate} ₽/сут.` : (debt ? `\nВ долг: ${debt.amount} ₽` : '');
    Alert.alert('Готово', `Въезд зафиксирован: ${car?.plateNumber ?? ''} (${label})${payLabel}${debtLabel}`);
    resetCheckInForm();
    console.log(`[ClientCard] Secondary check-in: ${car?.plateNumber}, lombard=${isLombard}, payment=${payment?.amount ?? 0}, debt=${debt?.amount ?? 0}`);
  }, [checkInCarId, clientId, clientCars, checkInServiceType, checkInTariffType, checkIn, hasActiveSubscription, shiftRequired, checkInPlannedDeparture, buildCheckInPayment, buildCheckInDebt, resetCheckInForm, isAdmin, tariffs]);

  const handleCheckOut = useCallback((sessionId: string) => {
    if (!isAdmin && shiftRequired) {
      Alert.alert('Смена не открыта', 'Откройте смену, чтобы оформить выезд.');
      return;
    }
    const session = clientActiveSessions.find(s => s.id === sessionId);
    if (!session) return;
    const car = cars.find(c => c.id === session.carId);
    const sub = session.serviceType === 'monthly' && clientId
      ? getSubscription(session.carId, clientId)
      : undefined;
    const hasActiveSub = sub && !isExpired(sub.paidUntil);

    if (totalDebt > 0) {
      Alert.alert(
        '⚠️ У ВЛАДЕЛЬЦА ДОЛГ',
        `Долг клиента: ${totalDebt} ₽\nАвто: ${car?.plateNumber ?? ''}\n\nВыберите действие:`,
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: '💳 Сначала оплатить',
            onPress: () => {
              router.push({
                pathname: '/exit-modal',
                params: { sessionId },
              });
            },
          },
          {
            text: '⚠️ Выпустить в ДОЛГ',
            style: 'destructive',
            onPress: () => {
              const result = checkOut(sessionId);
              logAction('checkout', 'Выпуск авто С ДОЛГОМ (подтверждено)', `${car?.plateNumber ?? ''} (${client?.name ?? ''}), долг клиента: ${totalDebt} ₽`, sessionId, 'session');
              if (result.debtId) {
                Alert.alert('Начислен долг', `Сумма: ${result.amount} ₽ (${result.days} сут.)`);
              } else {
                Alert.alert('Готово', 'Выезд зафиксирован (долг не погашен)');
              }
            },
          },
        ]
      );
      return;
    }

    const message = session.serviceType === 'monthly' && hasActiveSub
      ? `Зафиксировать выезд ${car?.plateNumber ?? ''}?\nМесячная аренда оплачена, долг не создается.`
      : `Зафиксировать выезд ${car?.plateNumber ?? ''}?\nБудет рассчитана сумма по тарифу.`;

    Alert.alert('Выезд', message, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Подтвердить',
        onPress: () => {
          const result = checkOut(sessionId);
          if (result.debtId) {
            Alert.alert('Начислен долг', `Сумма: ${result.amount} ₽ (${result.days} сут.)`);
          } else {
            Alert.alert('Готово', 'Выезд зафиксирован');
          }
        },
      },
    ]);
  }, [clientActiveSessions, cars, clientId, getSubscription, checkOut, shiftRequired, isAdmin, totalDebt, client, router, logAction]);

  const handleCancelCheckIn = useCallback((sessionId: string) => {
    const session = clientActiveSessions.find(s => s.id === sessionId);
    if (!session) return;
    const car = cars.find(c => c.id === session.carId);
    Alert.alert('Отмена заезда', `Отменить заезд ${car?.plateNumber ?? ''}?`, [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Да, отменить',
        style: 'destructive',
        onPress: () => {
          cancelCheckIn(sessionId);
          Alert.alert('Готово', 'Заезд отменён');
        },
      },
    ]);
  }, [clientActiveSessions, cars, cancelCheckIn]);

  const handleCancelCheckOut = useCallback((sessionId: string) => {
    const session = recentCompletedSessions.find(s => s.id === sessionId);
    if (!session) return;
    const car = cars.find(c => c.id === session.carId);
    Alert.alert('Отмена выезда', `Вернуть ${car?.plateNumber ?? ''} на парковку?`, [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Да, вернуть',
        onPress: () => {
          cancelCheckOut(sessionId);
          Alert.alert('Готово', 'Выезд отменён, авто возвращено на парковку');
        },
      },
    ]);
  }, [recentCompletedSessions, cars, cancelCheckOut]);

  const handleCancelPayment = useCallback((paymentId: string) => {
    const payment = clientPayments.find(p => p.id === paymentId);
    if (!payment) return;
    Alert.alert('Отмена оплаты', `Отменить оплату ${payment.amount} ₽?\n${payment.description}`, [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Да, отменить',
        style: 'destructive',
        onPress: () => {
          cancelPayment(paymentId);
          Alert.alert('Готово', 'Оплата отменена');
        },
      },
    ]);
  }, [clientPayments, cancelPayment]);

  const handleAddManualDebt = useCallback(() => {
    if (!clientId) return;
    const amount = Number(newDebtAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Ошибка', 'Введите корректную сумму долга');
      return;
    }
    addManualDebt(clientId, amount, newDebtDate, newDebtComment.trim());
    Alert.alert('Готово', `Долг ${amount} ₽ добавлен`);
    setShowAddDebt(false);
    setNewDebtAmount('');
    setNewDebtDate(toDateString(new Date()));
    setNewDebtComment('');
    console.log(`[ClientCard] Manual debt added: ${amount} for client ${clientId}`);
  }, [clientId, newDebtAmount, newDebtDate, newDebtComment, addManualDebt]);

  const handleDeleteDebt = useCallback((debtId: string) => {
    const debt = clientDebts.find(d => d.id === debtId);
    if (!debt) return;
    Alert.alert(
      'Удаление долга',
      `Удалить долг ${debt.remainingAmount} ₽?\n${debt.description}`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            deleteManualDebt(debtId);
            Alert.alert('Готово', 'Долг удалён');
          },
        },
      ]
    );
  }, [clientDebts, deleteManualDebt]);

  const handlePayClientDebt = useCallback(() => {
    if (!clientId) return;
    router.push({
      pathname: '/pay-debt-modal',
      params: {
        clientId,
        clientName: client?.name ?? '',
        totalDebt: String(totalDebt),
        mode: 'client_debt',
      },
    });
  }, [clientId, client, totalDebt, router]);

  const handleAddCar = useCallback(() => {
    if (!newPlate.trim()) {
      Alert.alert('Ошибка', 'Введите номер автомобиля');
      return;
    }
    if (!clientId) return;
    const formatted = formatPlateNumber(newPlate);
    const existingCar = cars.find(c => c.plateNumber === formatted);
    if (existingCar) {
      Alert.alert('Ошибка', `Автомобиль ${formatted} уже зарегистрирован`);
      return;
    }
    addCarToClient(clientId, formatted, newCarModel.trim());
    Alert.alert('Готово', `Автомобиль ${formatted} добавлен`);
    setNewPlate('');
    setNewCarModel('');
    setShowAddCar(false);
  }, [newPlate, newCarModel, clientId, cars, addCarToClient]);

  if (!client) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Клиент не найден</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.profileBlock}>
        {isDeleted && (
          <View style={styles.deletedBanner}>
            <Ban size={16} color={Colors.danger} />
            <Text style={styles.deletedBannerText}>Клиент удалён (ошибочно введён)</Text>
          </View>
        )}
        {isEditing ? (
          <View style={styles.editForm}>
            <Text style={styles.editLabel}>ФИО</Text>
            <TextInput
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Имя клиента"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
            <Text style={styles.editLabel}>Телефон</Text>
            <TextInput
              style={styles.editInput}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="Номер телефона"
              placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad"
            />
            <Text style={styles.editLabel}>Доп. телефон</Text>
            <TextInput
              style={styles.editInput}
              value={editPhone2}
              onChangeText={setEditPhone2}
              placeholder="Второй номер (необязательно)"
              placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad"
            />
            <Text style={styles.editLabel}>Заметки</Text>
            <TextInput
              style={[styles.editInput, styles.editInputMultiline]}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="Заметки"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
            />
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.editSaveBtn} onPress={saveEditClient} activeOpacity={0.7}>
                <Check size={16} color={Colors.white} />
                <Text style={styles.editSaveBtnText}>Сохранить</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editCancelBtn} onPress={() => setIsEditing(false)} activeOpacity={0.7}>
                <X size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.profileNameRow}>
              <Text style={styles.profileName}>{client.name}</Text>
              {isAdmin && !isDeleted && (
                <TouchableOpacity style={styles.editIconBtn} onPress={startEditClient} activeOpacity={0.7}>
                  <Pencil size={15} color={Colors.primary} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={styles.phoneRow} onPress={() => handleCall(client.phone)}>
              <Phone size={16} color={Colors.info} />
              <Text style={styles.phoneText}>{client.phone}</Text>
            </TouchableOpacity>
            {client.phone2 ? (
              <TouchableOpacity style={styles.phoneRow} onPress={() => handleCall(client.phone2)}>
                <Phone size={14} color={Colors.textSecondary} />
                <Text style={styles.phone2Text}>{client.phone2}</Text>
                <Text style={styles.phone2Label}>доп.</Text>
              </TouchableOpacity>
            ) : null}
            {client.notes ? <Text style={styles.notesText}>{client.notes}</Text> : null}
          </>
        )}

        <View style={styles.statusRow}>
          {totalDebt > 0 ? (
            <View style={styles.debtBadge}>
              <AlertTriangle size={14} color={Colors.danger} />
              <Text style={styles.debtBadgeText}>Долг: {totalDebt} ₽</Text>
            </View>
          ) : (
            <View style={styles.paidBadge}>
              <Text style={styles.paidBadgeText}>Нет задолженности</Text>
            </View>
          )}
        </View>

        {clientSubscriptions.length > 0 && (
          <View style={styles.subscriptionBlock}>
            {clientSubscriptions.map(sub => {
              const car = cars.find(c => c.id === sub.carId);
              const expired = isExpired(sub.paidUntil);
              const remaining = daysUntil(sub.paidUntil);
              return (
                <View key={sub.id} style={[styles.subscriptionRow, expired ? styles.subscriptionRowExpired : styles.subscriptionRowActive]}>
                  <Calendar size={15} color={expired ? Colors.danger : Colors.success} />
                  <View style={styles.subscriptionInfo}>
                    <Text style={[styles.subscriptionStatus, { color: expired ? Colors.danger : Colors.success }]}>
                      {expired ? 'Абонемент истёк' : 'Абонемент активен'}
                    </Text>
                    <Text style={styles.subscriptionDate}>
                      {expired ? `до ${formatDate(sub.paidUntil)}` : `до ${formatDate(sub.paidUntil)} (${remaining} дн.)`}
                    </Text>
                    {car && <Text style={styles.subscriptionCar}>{car.plateNumber}{car.carModel ? ` (${car.carModel})` : ''}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {totalDebt > 0 && !isDeleted && (
          <TouchableOpacity
            style={styles.payDebtFirstBtn}
            onPress={handlePayClientDebt}
            activeOpacity={0.7}
          >
            <CreditCard size={16} color={Colors.white} />
            <Text style={styles.payDebtFirstBtnText}>Оплатить ДОЛГ {totalDebt} ₽ сначала</Text>
          </TouchableOpacity>
        )}
      </View>

      {!isDeleted && <View style={styles.actionsBlock}>
        <TouchableOpacity
          style={[
            styles.actionBtn,
            styles.checkInBtn,
            (carsWithoutActiveSession.length === 0 || (!isAdmin && shiftRequired)) && styles.actionBtnDisabled,
          ]}
          onPress={() => {
            if (!isAdmin && shiftRequired) {
              Alert.alert('Смена не открыта', 'Откройте смену, чтобы начать работу.');
              return;
            }
            if (carsWithoutActiveSession.length === 0) {
              Alert.alert('Все авто на парковке', 'У клиента нет автомобилей, которые можно заехать.');
              return;
            }
            const firstCar = carsWithoutActiveSession[0];
            if (!firstCar) return;
            const allHaveActiveSub = carsWithoutActiveSession.every(c => hasActiveSubscription(c.id));
            setCheckInCarId(firstCar.id);
            if (allHaveActiveSub) {
              setCheckInServiceType('monthly');
            } else {
              setCheckInServiceType('onetime');
            }
            setCheckInPlannedDeparture('');
            setShowCheckInForm(true);
          }}
          activeOpacity={0.7}
        >
          <LogIn size={18} color={Colors.white} />
          <Text style={styles.actionBtnText}>Заехал на парковку</Text>
        </TouchableOpacity>

        {clientActiveSessions.length > 0 && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.checkOutBtn, (!isAdmin && shiftRequired) && styles.actionBtnDisabled]}
            onPress={() => {
              if (!isAdmin && shiftRequired) {
                Alert.alert('Смена не открыта', 'Откройте смену, чтобы оформить выезд.');
                return;
              }
              if (clientActiveSessions.length === 1) {
                handleCheckOut(clientActiveSessions[0].id);
              } else {
                const buttons = clientActiveSessions.map(session => {
                  const car = cars.find(c => c.id === session.carId);
                  return {
                    text: car?.plateNumber ?? session.carId,
                    onPress: () => handleCheckOut(session.id),
                  };
                });
                buttons.push({ text: 'Отмена', onPress: () => {} });
                Alert.alert('Выберите авто', 'Какой автомобиль выезжает?', buttons);
              }
            }}
            activeOpacity={0.7}
          >
            <LogOut size={18} color={Colors.white} />
            <Text style={styles.actionBtnText}>Выехал с парковки</Text>
          </TouchableOpacity>
        )}
      </View>}

      {showCheckInForm && (
        <View style={styles.checkInFormCard}>
          <Text style={styles.checkInFormTitle}>Оформление въезда</Text>

          {totalDebt > 0 && (
            <View style={styles.existingDebtBanner}>
              <AlertTriangle size={15} color={Colors.danger} />
              <Text style={styles.existingDebtText}>Текущий долг клиента: {totalDebt} ₽</Text>
            </View>
          )}

          <Text style={styles.checkInLabel}>Автомобиль</Text>
          <View style={styles.carPickerRow}>
            {carsWithoutActiveSession.map(car => (
              <TouchableOpacity
                key={car.id}
                style={[
                  styles.carPickerItem,
                  checkInCarId === car.id && styles.carPickerItemActive,
                ]}
                onPress={() => {
                  setCheckInCarId(car.id);
                  if (hasActiveSubscription(car.id)) {
                    setCheckInServiceType('monthly');
                  }
                }}
                activeOpacity={0.7}
              >
                <Car size={14} color={checkInCarId === car.id ? Colors.white : Colors.text} />
                <Text style={[
                  styles.carPickerText,
                  checkInCarId === car.id && styles.carPickerTextActive,
                ]}>{car.plateNumber}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {hasActiveSubscription(checkInCarId) ? (
            <View style={styles.activeSubNotice}>
              <Check size={14} color={Colors.success} />
              <Text style={styles.activeSubNoticeText}>Месячный абонемент активен — заезд по абонементу</Text>
            </View>
          ) : (
            <>
              <Text style={styles.checkInLabel}>Тип заезда</Text>
              <View style={styles.serviceTypeRow}>
                <TouchableOpacity
                  style={[
                    styles.serviceTypeItem,
                    checkInTariffType === 'standard' && checkInServiceType === 'onetime' && styles.serviceTypeItemActiveOnetime,
                  ]}
                  onPress={() => { setCheckInTariffType('standard'); setCheckInServiceType('onetime'); setPaymentStatus('pay_now'); }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.serviceTypeText,
                    checkInTariffType === 'standard' && checkInServiceType === 'onetime' && styles.serviceTypeTextActive,
                  ]}>Разово</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.serviceTypeItem,
                    checkInTariffType === 'standard' && checkInServiceType === 'monthly' && styles.serviceTypeItemActiveMonthly,
                  ]}
                  onPress={() => { setCheckInTariffType('standard'); setCheckInServiceType('monthly'); setPaymentStatus('pay_now'); }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.serviceTypeText,
                    checkInTariffType === 'standard' && checkInServiceType === 'monthly' && styles.serviceTypeTextActive,
                  ]}>Месяц</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.serviceTypeItem,
                    checkInTariffType === 'lombard' && styles.serviceTypeItemActiveLombard,
                  ]}
                  onPress={() => { setCheckInTariffType('lombard'); setCheckInServiceType('lombard'); setPaymentStatus('in_debt'); }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.serviceTypeText,
                    checkInTariffType === 'lombard' && styles.serviceTypeTextActiveLombard,
                  ]}>Ломбард</Text>
                </TouchableOpacity>
              </View>

              <View style={checkInTariffType === 'lombard' ? styles.tariffHintBlockLombard : styles.tariffHintBlock}>
                <Text style={checkInTariffType === 'lombard' ? styles.tariffHintTextLombard : styles.tariffHintText}>
                  {checkInTariffType === 'lombard'
                    ? `Ломбард: ${tariffs.lombardRate} ₽/сутки, начисление с первого дня`
                    : checkInServiceType === 'onetime'
                    ? `Тариф: ${tariffs.onetimeCash} ₽/сут. (нал.) / ${tariffs.onetimeCard} ₽/сут. (безнал.)`
                    : `Тариф: ${tariffs.monthlyCash} ₽/день (нал.) / ${tariffs.monthlyCard} ₽/день (безнал.) — мес. ${getMonthlyAmount(tariffs.monthlyCash)} / ${getMonthlyAmount(tariffs.monthlyCard)} ₽`
                  }
                </Text>
                {checkInTariffType === 'lombard' && (
                  <Text style={styles.tariffHintSubLombard}>
                    Оплата только при выезде или отдельной оплатой долга. Долг формируется автоматически.
                  </Text>
                )}
              </View>

              {checkInTariffType === 'lombard' ? (
                <View style={styles.lombardNoticeBlock}>
                  <AlertTriangle size={16} color="#b45309" />
                  <View style={styles.lombardNoticeContent}>
                    <Text style={styles.lombardNoticeTitle}>Тариф «Ломбард»</Text>
                    <Text style={styles.lombardNoticeText}>
                      Долг начисляется автоматически: {tariffs.lombardRate} ₽/сутки с первого дня.
                      Оплата недоступна при постановке.
                    </Text>
                  </View>
                </View>
              ) : (
              <View style={styles.paymentBlock}>
                <Text style={styles.payBlockLabel}>Способ оплаты</Text>
                <View style={styles.methodRow}>
                  <TouchableOpacity
                    style={[styles.methodBtn, paymentMethod === 'cash' && styles.methodBtnActive]}
                    onPress={() => setPaymentMethod('cash')}
                    activeOpacity={0.7}
                  >
                    <Banknote size={15} color={paymentMethod === 'cash' ? Colors.white : Colors.textSecondary} />
                    <Text style={[styles.methodBtnText, paymentMethod === 'cash' && styles.methodBtnTextActive]}>Наличные</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.methodBtn, paymentMethod === 'card' && styles.methodBtnActive]}
                    onPress={() => setPaymentMethod('card')}
                    activeOpacity={0.7}
                  >
                    <CreditCard size={15} color={paymentMethod === 'card' ? Colors.white : Colors.textSecondary} />
                    <Text style={[styles.methodBtnText, paymentMethod === 'card' && styles.methodBtnTextActive]}>Безнал</Text>
                  </TouchableOpacity>
                </View>

                {checkInServiceType === 'onetime' && (
                  <>
                    <Text style={styles.payBlockLabel}>Количество суток</Text>
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

                {checkInServiceType === 'monthly' && (
                  <>
                    <Text style={styles.payBlockLabel}>Дата начала (ГГГГ-ММ-ДД)</Text>
                    <TextInput
                      style={styles.payBlockInput}
                      value={monthlyStartDate}
                      onChangeText={setMonthlyStartDate}
                      placeholder="2025-03-01"
                      placeholderTextColor={Colors.textMuted}
                    />
                    <Text style={styles.payBlockLabel}>Количество месяцев</Text>
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
                    {checkInServiceType === 'onetime'
                      ? `${Math.max(1, parseInt(payDays, 10) || 1)} сут. × ${paymentMethod === 'cash' ? tariffs.onetimeCash : tariffs.onetimeCard} ₽`
                      : `${monthlyCalc.totalDays} дн. × ${monthlyCalc.dailyRate} ₽/день`
                    }
                  </Text>
                  <Text style={styles.payAmountValue}>{checkInPaymentAmount} ₽</Text>
                </View>

                <Text style={[styles.payBlockLabel, { marginTop: 14 }]}>Статус оплаты</Text>
                <View style={styles.payStatusRow}>
                  <TouchableOpacity
                    style={[styles.statusBtn, paymentStatus === 'pay_now' && styles.statusBtnPayActive]}
                    onPress={() => setPaymentStatus('pay_now')}
                    activeOpacity={0.7}
                  >
                    <Wallet size={15} color={paymentStatus === 'pay_now' ? Colors.white : Colors.success} />
                    <Text style={[styles.statusBtnText, paymentStatus === 'pay_now' && styles.statusBtnTextActive]}>Оплатить сейчас</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.statusBtn, paymentStatus === 'in_debt' && styles.statusBtnDebtActive]}
                    onPress={() => setPaymentStatus('in_debt')}
                    activeOpacity={0.7}
                  >
                    <AlertTriangle size={15} color={paymentStatus === 'in_debt' ? Colors.white : Colors.danger} />
                    <Text style={[styles.statusBtnText, paymentStatus === 'in_debt' && styles.statusBtnDebtTextActive]}>В долг</Text>
                  </TouchableOpacity>
                </View>

                {paymentStatus === 'in_debt' && (
                  <View style={styles.debtNotice}>
                    <AlertTriangle size={13} color={Colors.danger} />
                    <Text style={styles.debtNoticeText}>
                      Сумма {checkInPaymentAmount} ₽ будет записана как долг клиента. Оплата не принимается.
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.adjustToggleRow}
                  onPress={() => {
                    setCustomAmountEnabled(!customAmountEnabled);
                    if (!customAmountEnabled) {
                      setCustomAmount(String(baseCheckInPaymentAmount));
                    } else {
                      setCustomAmount('');
                      setAdjustmentReason('');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.adjustCheckbox, customAmountEnabled && styles.adjustCheckboxActive]}>
                    {customAmountEnabled && <Check size={12} color={Colors.white} />}
                  </View>
                  <Text style={styles.adjustToggleText}>Скорректировать сумму</Text>
                </TouchableOpacity>

                {customAmountEnabled && (
                  <View style={styles.adjustBlock}>
                    <Text style={styles.payBlockLabel}>Итоговая сумма (₽)</Text>
                    <TextInput
                      style={styles.adjustInput}
                      value={customAmount}
                      onChangeText={(t) => setCustomAmount(t.replace(/[^0-9.,]/g, ''))}
                      keyboardType="numeric"
                      placeholder={String(baseCheckInPaymentAmount)}
                      placeholderTextColor={Colors.textMuted}
                      testID="client-custom-amount-input"
                    />
                    {checkInAdjustmentDiff !== 0 && (
                      <View style={[styles.adjustDiffBadge, checkInAdjustmentDiff > 0 ? styles.adjustDiffDiscount : styles.adjustDiffSurcharge]}>
                        <Text style={[styles.adjustDiffText, checkInAdjustmentDiff > 0 ? styles.adjustDiffTextDiscount : styles.adjustDiffTextSurcharge]}>
                          {checkInAdjustmentDiff > 0 ? `Скидка: −${checkInAdjustmentDiff} ₽` : `Наценка: +${Math.abs(checkInAdjustmentDiff)} ₽`}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.payBlockLabel}>Причина корректировки</Text>
                    <TextInput
                      style={styles.adjustInput}
                      value={adjustmentReason}
                      onChangeText={setAdjustmentReason}
                      placeholder="Напр.: договорная цена, скидка постоянному клиенту..."
                      placeholderTextColor={Colors.textMuted}
                      testID="client-adjustment-reason-input"
                    />
                  </View>
                )}

                {checkInServiceType === 'onetime' && paymentStatus === 'pay_now' && (
                  <Text style={styles.payHint}>
                    Если клиент задержится дольше, разница будет начислена как долг при выезде.
                  </Text>
                )}
                {checkInServiceType === 'monthly' && paymentStatus === 'pay_now' && (
                  <Text style={styles.payHint}>
                    Будет оформлена подписка на {monthlyCalc.totalDays} дней.
                  </Text>
                )}
              </View>
              )}
            </>
          )}

          <Text style={[styles.checkInLabel, { marginTop: 14 }]}>Планируемый выезд</Text>
          <View style={styles.departureRow}>
            <Clock size={16} color={Colors.textMuted} />
            <TextInput
              style={styles.departureInput}
              placeholder="Напр. 18:00, завтра 10:00..."
              placeholderTextColor={Colors.textMuted}
              value={checkInPlannedDeparture}
              onChangeText={setCheckInPlannedDeparture}
            />
          </View>

          <View style={styles.checkInActions}>
            <TouchableOpacity
              style={[styles.checkInConfirmBtn, (!isAdmin && shiftRequired) && styles.actionBtnDisabled]}
              onPress={handleCheckIn}
              activeOpacity={0.7}
            >
              <Check size={16} color={Colors.white} />
              <Text style={styles.checkInConfirmText}>
                {hasActiveSubscription(checkInCarId)
                  ? 'Зафиксировать въезд'
                  : checkInTariffType === 'lombard'
                  ? `Заезд (ломбард ${tariffs.lombardRate} ₽/сут.)`
                  : paymentStatus === 'pay_now' && checkInPaymentAmount > 0
                  ? `Заезд + оплата ${checkInPaymentAmount} ₽`
                  : paymentStatus === 'in_debt' && checkInPaymentAmount > 0
                  ? `Заезд (в долг ${checkInPaymentAmount} ₽)`
                  : 'Зафиксировать въезд'
                }
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.checkInCancelBtn}
              onPress={resetCheckInForm}
              activeOpacity={0.7}
            >
              <X size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {totalDebt > 0 && clientActiveSessions.length > 0 && !isDeleted && (
        <View style={styles.debtWarningBanner}>
          <AlertTriangle size={16} color={Colors.danger} />
          <View style={styles.debtWarningContent}>
            <Text style={styles.debtWarningTitle}>Долг клиента: {totalDebt} ₽</Text>
            <Text style={styles.debtWarningText}>
              Любой платёж сначала пойдёт на погашение долга. Остаток — на оплату заездов.
            </Text>
          </View>
        </View>
      )}

      {clientActiveSessions.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>На парковке сейчас</Text>
          <View style={styles.card}>
            {clientActiveSessions.map(session => {
              const car = cars.find(c => c.id === session.carId);
              const sub = clientId ? getSubscription(session.carId, clientId) : undefined;
              const hasActiveSub = sub && !isExpired(sub.paidUntil);
              return (
                <View key={session.id} style={styles.activeSessionRow}>
                  <View style={styles.activeSessionInfo}>
                    <View style={styles.activeSessionPlate}>
                      <Car size={14} color={Colors.primary} />
                      <Text style={styles.carPlate}>{car?.plateNumber ?? '—'}</Text>
                      {car?.carModel ? <Text style={styles.carModelSmall}>{car.carModel}</Text> : null}
                    </View>
                    <Text style={styles.activeSessionMeta}>
                      Въезд: {formatDateTime(session.entryTime)}
                    </Text>
                    {session.plannedDepartureTime ? (
                      <Text style={styles.plannedMeta}>
                        План. выезд: {session.plannedDepartureTime}
                      </Text>
                    ) : null}
                    {session.managerName ? (
                      <Text style={styles.managerMeta}>Оформил: {session.managerName}</Text>
                    ) : null}
                    <View style={[
                      styles.sessionTypeBadge,
                      (session.tariffType === 'lombard' || session.serviceType === 'lombard')
                        ? styles.sessionTypeBadgeLombard
                        : session.serviceType === 'monthly' ? styles.sessionTypeBadgeMonthly : styles.sessionTypeBadgeOnetime,
                    ]}>
                      <Text style={[
                        styles.sessionTypeBadgeText,
                        (session.tariffType === 'lombard' || session.serviceType === 'lombard')
                          ? styles.sessionTypeBadgeTextLombard
                          : session.serviceType === 'monthly' ? styles.sessionTypeBadgeTextMonthly : styles.sessionTypeBadgeTextOnetime,
                      ]}>
                        {(session.tariffType === 'lombard' || session.serviceType === 'lombard')
                          ? `Ломбард (${session.lombardRateApplied ?? tariffs.lombardRate} ₽/сут.)`
                          : session.serviceType === 'monthly'
                            ? `Месяц (${tariffs.monthlyCash} ₽/сут.)`
                            : `Разово (${tariffs.onetimeCash} ₽/сут.)`}
                        {session.serviceType === 'monthly' && hasActiveSub ? ' — оплачено' : ''}
                        {session.status === 'active_debt' && !(session.tariffType === 'lombard' || session.serviceType === 'lombard') ? ' — в долг' : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.sessionActions}>
                    <TouchableOpacity
                      style={styles.sessionExitBtn}
                      onPress={() => handleCheckOut(session.id)}
                      activeOpacity={0.7}
                    >
                      <LogOut size={14} color={Colors.warning} />
                      <Text style={styles.sessionExitBtnText}>Выезд</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.sessionCancelBtn}
                      onPress={() => handleCancelCheckIn(session.id)}
                      activeOpacity={0.7}
                    >
                      <XCircle size={14} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      {isAdmin && recentCompletedSessions.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Недавние выезды (отмена)</Text>
          <View style={styles.card}>
            {recentCompletedSessions.map(session => {
              const car = cars.find(c => c.id === session.carId);
              return (
                <View key={session.id} style={styles.recentExitRow}>
                  <View style={styles.recentExitInfo}>
                    <Text style={styles.recentExitPlate}>{car?.plateNumber ?? '—'}</Text>
                    <Text style={styles.recentExitDate}>Выезд: {formatDateTime(session.exitTime ?? session.entryTime)}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.undoBtn}
                    onPress={() => handleCancelCheckOut(session.id)}
                    activeOpacity={0.7}
                  >
                    <RotateCcw size={14} color={Colors.info} />
                    <Text style={styles.undoBtnText}>Вернуть</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Автомобили ({clientCars.length})</Text>
        {!showAddCar && (
          <TouchableOpacity
            style={styles.addCarHeaderBtn}
            onPress={() => setShowAddCar(true)}
            activeOpacity={0.7}
          >
            <Plus size={14} color={Colors.primary} />
            <Text style={styles.addCarHeaderBtnText}>Добавить</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.card}>
        {clientCars.map(car => {
          const sub = subscriptions.find(s => s.carId === car.id && s.clientId === clientId);
          if (editingCarId === car.id) {
            return (
              <View key={car.id} style={styles.editCarForm}>
                <TextInput
                  style={styles.editCarInput}
                  value={editCarPlate}
                  onChangeText={setEditCarPlate}
                  placeholder="Номер авто"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                  autoFocus
                />
                <TextInput
                  style={styles.editCarModelInput}
                  value={editCarModel}
                  onChangeText={setEditCarModel}
                  placeholder="Модель"
                  placeholderTextColor={Colors.textMuted}
                />
                <View style={styles.editCarActions}>
                  <TouchableOpacity style={styles.editCarSaveBtn} onPress={saveEditCar} activeOpacity={0.7}>
                    <Check size={14} color={Colors.white} />
                    <Text style={styles.editCarSaveBtnText}>Сохранить</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editCarCancelBtn} onPress={() => setEditingCarId(null)} activeOpacity={0.7}>
                    <X size={14} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }
          return (
            <View key={car.id} style={styles.carRow}>
              <View style={styles.carPlateBlock}>
                <Car size={16} color={Colors.primary} />
                <View>
                  <Text style={styles.carPlate}>{car.plateNumber}</Text>
                  {car.carModel ? <Text style={styles.carModelText}>{car.carModel}</Text> : null}
                </View>
                {isAdmin && !isDeleted && (
                  <View style={styles.carAdminActions}>
                    <TouchableOpacity style={styles.editCarIconBtn} onPress={() => startEditCar(car.id)} activeOpacity={0.7}>
                      <Pencil size={12} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteCarIconBtn} onPress={() => handleDeleteCar(car.id)} activeOpacity={0.7}>
                      <Trash2 size={12} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              {sub && (
                <View style={styles.subInfo}>
                  <Calendar size={13} color={isExpired(sub.paidUntil) ? Colors.danger : Colors.success} />
                  <Text style={[
                    styles.subText,
                    { color: isExpired(sub.paidUntil) ? Colors.danger : Colors.success },
                  ]}>
                    {isExpired(sub.paidUntil) ? 'Просрочено' : `до ${formatDate(sub.paidUntil)}`}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.payMonthBtn}
                onPress={() => router.push({
                  pathname: '/pay-monthly-modal',
                  params: { clientId: clientId!, carId: car.id },
                })}
              >
                <CreditCard size={14} color={Colors.primary} />
                <Text style={styles.payMonthBtnText}>Оплата</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {showAddCar && (
          <View style={styles.addCarForm}>
            <TextInput
              style={styles.addCarInput}
              placeholder="Номер авто (А123ВС777)"
              placeholderTextColor={Colors.textMuted}
              value={newPlate}
              onChangeText={setNewPlate}
              autoCapitalize="characters"
              autoFocus
            />
            <TextInput
              style={styles.addCarModelInput}
              placeholder="Модель (Toyota Camry...)"
              placeholderTextColor={Colors.textMuted}
              value={newCarModel}
              onChangeText={setNewCarModel}
            />
            <View style={styles.addCarActions}>
              <TouchableOpacity
                style={styles.addCarConfirmBtn}
                onPress={handleAddCar}
                activeOpacity={0.7}
              >
                <Check size={16} color={Colors.white} />
                <Text style={styles.addCarConfirmText}>Добавить</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addCarCancelBtn}
                onPress={() => { setShowAddCar(false); setNewPlate(''); setNewCarModel(''); }}
                activeOpacity={0.7}
              >
                <X size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {(clientDebts.length > 0 || (clientDebtInfo && clientDebtInfo.totalAmount > 0)) && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Задолженности</Text>
            {totalDebt > 0 && (
              <TouchableOpacity
                style={styles.payAllDebtBtn}
                onPress={handlePayClientDebt}
                activeOpacity={0.7}
              >
                <Wallet size={13} color={Colors.danger} />
                <Text style={styles.payAllDebtBtnText}>Погасить ({totalDebt} ₽)</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.card}>
            {clientDebts.map(debt => (
              <View key={debt.id} style={styles.debtRow}>
                <View style={styles.debtInfo}>
                  <Text style={styles.debtDesc}>{debt.description}</Text>
                  <Text style={styles.debtDate}>{formatDate(debt.createdAt)}</Text>
                </View>
                <Text style={styles.debtAmount}>{debt.remainingAmount} ₽</Text>
                <TouchableOpacity
                  style={styles.payDebtBtn}
                  onPress={() => router.push({
                    pathname: '/pay-debt-modal',
                    params: {
                      debtId: debt.id,
                      clientName: client.name,
                      totalDebt: String(debt.remainingAmount),
                    },
                  })}
                >
                  <Text style={styles.payDebtBtnText}>Погасить</Text>
                </TouchableOpacity>
                {isAdmin && (
                  <TouchableOpacity
                    style={styles.deleteDebtBtn}
                    onPress={() => handleDeleteDebt(debt.id)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={13} color={Colors.danger} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {clientDebtInfo && clientDebtInfo.totalAmount > 0 && (
              <View style={styles.debtRow}>
                <View style={styles.debtInfo}>
                  <Text style={styles.debtDesc}>Начисленный долг (ежедневный)</Text>
                  <Text style={styles.debtDate}>{formatDate(clientDebtInfo.lastUpdate)}</Text>
                </View>
                <Text style={styles.debtAmount}>{clientDebtInfo.totalAmount} ₽</Text>
              </View>
            )}
          </View>
        </>
      )}

      {isAdmin && !isDeleted && (
        <>
          {!showAddDebt ? (
            <TouchableOpacity
              style={styles.addDebtBtn}
              onPress={() => setShowAddDebt(true)}
              activeOpacity={0.7}
            >
              <Plus size={16} color={Colors.danger} />
              <Text style={styles.addDebtBtnText}>Добавить долг</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.addDebtCard}>
              <Text style={styles.addDebtTitle}>Добавить долг вручную</Text>
              <Text style={styles.addDebtLabel}>Сумма (₽)</Text>
              <TextInput
                style={styles.addDebtInput}
                value={newDebtAmount}
                onChangeText={(t) => setNewDebtAmount(t.replace(/[^0-9.]/g, ''))}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                autoFocus
              />
              <Text style={styles.addDebtLabel}>Дата возникновения (ГГГГ-ММ-ДД)</Text>
              <TextInput
                style={styles.addDebtInput}
                value={newDebtDate}
                onChangeText={setNewDebtDate}
                placeholder="2026-03-19"
                placeholderTextColor={Colors.textMuted}
              />
              <Text style={styles.addDebtLabel}>Комментарий</Text>
              <TextInput
                style={[styles.addDebtInput, styles.addDebtInputMultiline]}
                value={newDebtComment}
                onChangeText={setNewDebtComment}
                placeholder="Причина долга (необязательно)"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={2}
              />
              <View style={styles.addDebtActions}>
                <TouchableOpacity
                  style={styles.addDebtConfirmBtn}
                  onPress={handleAddManualDebt}
                  activeOpacity={0.7}
                >
                  <Check size={16} color={Colors.white} />
                  <Text style={styles.addDebtConfirmText}>Добавить долг{newDebtAmount ? ` ${newDebtAmount} ₽` : ''}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addDebtCancelBtn}
                  onPress={() => { setShowAddDebt(false); setNewDebtAmount(''); setNewDebtComment(''); }}
                  activeOpacity={0.7}
                >
                  <X size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}

      {isAdmin && clientPayments.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Оплаты (отмена)</Text>
          <View style={styles.card}>
            {clientPayments.map(p => (
              <View key={p.id} style={styles.paymentCancelRow}>
                <View style={styles.paymentCancelInfo}>
                  <Text style={styles.paymentCancelDesc}>{p.description}</Text>
                  <Text style={styles.paymentCancelDate}>{formatDateTime(p.date)} • {p.operatorName}</Text>
                </View>
                <Text style={styles.paymentCancelAmount}>{p.amount} ₽</Text>
                <TouchableOpacity
                  style={styles.paymentCancelBtn}
                  onPress={() => handleCancelPayment(p.id)}
                  activeOpacity={0.7}
                >
                  <XCircle size={14} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>История операций</Text>
      <View style={styles.card}>
        {clientTx.length === 0 ? (
          <Text style={styles.noTx}>Нет операций</Text>
        ) : (
          clientTx.map(tx => {
            const car = cars.find(c => c.id === tx.carId);
            return (
              <View key={tx.id} style={styles.txRow}>
                <View style={styles.txInfo}>
                  <Text style={styles.txDesc}>{tx.description}</Text>
                  <Text style={styles.txMeta}>
                    {car?.plateNumber ?? '—'} • {formatDateTime(tx.date)} • {tx.operatorName}
                  </Text>
                </View>
                {tx.amount > 0 && (
                  <Text style={[
                    styles.txAmount,
                    { color: tx.type === 'debt' || tx.type === 'cancel_payment' ? Colors.danger : Colors.success },
                  ]}>
                    {tx.type === 'debt' || tx.type === 'cancel_payment' ? '-' : '+'}{tx.amount} ₽
                  </Text>
                )}
              </View>
            );
          })
        )}
      </View>

      {isAdmin && !isDeleted && (
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Trash2 size={18} color={Colors.danger} />
          <Text style={styles.deleteBtnText}>Удалить клиента</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
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
    backgroundColor: Colors.background,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  profileBlock: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 20,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    flex: 1,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  phoneText: {
    fontSize: 15,
    color: Colors.info,
    fontWeight: '500' as const,
  },
  notesText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  statusRow: {
    marginTop: 12,
  },
  debtBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dangerLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  debtBadgeText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  payDebtFirstBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.danger,
    height: 44,
    borderRadius: 10,
    gap: 8,
    marginTop: 12,
  },
  payDebtFirstBtnText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  debtWarningBanner: {
    flexDirection: 'row' as const,
    backgroundColor: Colors.dangerLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
    borderWidth: 2,
    borderColor: Colors.danger + '40',
  },
  debtWarningContent: {
    flex: 1,
    gap: 4,
  },
  debtWarningTitle: {
    fontSize: 15,
    fontWeight: '800' as const,
    color: Colors.danger,
  },
  debtWarningText: {
    fontSize: 12,
    color: Colors.danger,
    opacity: 0.8,
    lineHeight: 17,
  },
  paidBadge: {
    backgroundColor: Colors.successLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  paidBadgeText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.success,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  addCarHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Colors.infoLight,
  },
  addCarHeaderBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 20,
  },
  carRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
    flexWrap: 'wrap',
  },
  carPlateBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  carPlate: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    letterSpacing: 1,
  },
  carModelText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  carModelSmall: {
    fontSize: 11,
    color: Colors.textMuted,
    marginLeft: 4,
  },
  subInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  subText: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
  payMonthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.infoLight,
  },
  payMonthBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  addCarForm: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  addCarInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addCarModelInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addCarActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  addCarConfirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    gap: 6,
  },
  addCarConfirmText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  addCarCancelBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  debtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  debtInfo: {
    flex: 1,
  },
  debtDesc: {
    fontSize: 13,
    color: Colors.text,
  },
  debtDate: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  debtAmount: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  payDebtBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.dangerLight,
  },
  payDebtBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  recentExitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  recentExitInfo: {
    flex: 1,
  },
  recentExitPlate: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  recentExitDate: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.infoLight,
  },
  undoBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.info,
  },
  paymentCancelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  paymentCancelInfo: {
    flex: 1,
  },
  paymentCancelDesc: {
    fontSize: 13,
    color: Colors.text,
  },
  paymentCancelDate: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  paymentCancelAmount: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.success,
  },
  paymentCancelBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  txInfo: {
    flex: 1,
  },
  txDesc: {
    fontSize: 13,
    color: Colors.text,
  },
  txMeta: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  noTx: {
    padding: 16,
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.dangerLight,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.danger,
  },
  deletedBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: Colors.dangerLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  deletedBannerText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.danger,
    flex: 1,
  },
  actionsBlock: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  checkInBtn: {
    backgroundColor: Colors.success,
  },
  checkOutBtn: {
    backgroundColor: Colors.warning,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  checkInFormCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.success + '40',
    marginBottom: 20,
  },
  checkInFormTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 14,
  },
  checkInLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  carPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  carPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  carPickerItemActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  carPickerText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
    letterSpacing: 1,
  },
  carPickerTextActive: {
    color: Colors.white,
  },
  plannedInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  existingDebtBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: Colors.dangerLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.danger + '25',
  },
  existingDebtText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.danger,
    flex: 1,
  },
  tariffHintBlock: {
    backgroundColor: Colors.warningLight,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  tariffHintBlockLombard: {
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#b4530930',
  },
  tariffHintText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.warning,
  },
  tariffHintTextLombard: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#b45309',
  },
  tariffHintSubLombard: {
    fontSize: 11,
    color: '#b45309',
    marginTop: 4,
    opacity: 0.8,
  },
  lombardNoticeBlock: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
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
  adjustToggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginTop: 14,
    paddingVertical: 6,
  },
  adjustCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.inputBg,
  },
  adjustCheckboxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  adjustToggleText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  adjustBlock: {
    marginTop: 8,
  },
  adjustInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 14,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  adjustDiffBadge: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
    marginBottom: 6,
  },
  adjustDiffDiscount: {
    backgroundColor: Colors.successLight,
  },
  adjustDiffSurcharge: {
    backgroundColor: Colors.dangerLight,
  },
  adjustDiffText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  adjustDiffTextDiscount: {
    color: Colors.success,
  },
  adjustDiffTextSurcharge: {
    color: Colors.danger,
  },
  paymentBlock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
    padding: 14,
    marginBottom: 12,
  },
  payBlockLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 6,
  },
  payBlockInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 14,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  methodRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  methodBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row' as const,
    gap: 6,
  },
  methodBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  methodBtnText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  methodBtnTextActive: {
    color: Colors.white,
  },
  daysRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  dayAdjustBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  dayAdjustText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  daysInput: {
    flex: 1,
    height: 38,
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    paddingHorizontal: 12,
  },
  payAmountCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  payAmountLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  payAmountValue: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.success,
  },
  payStatusRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  statusBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 5,
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
    fontSize: 12,
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
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 7,
    backgroundColor: Colors.dangerLight,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.danger + '20',
  },
  debtNoticeText: {
    fontSize: 11,
    color: Colors.danger,
    flex: 1,
    lineHeight: 15,
  },
  payHint: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 8,
    lineHeight: 15,
  },
  departureRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    gap: 8,
    marginBottom: 14,
  },
  departureInput: {
    flex: 1,
    height: 42,
    fontSize: 14,
    color: Colors.text,
  },
  serviceTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  serviceTypeItem: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  serviceTypeItemActiveOnetime: {
    backgroundColor: Colors.warningLight,
    borderColor: Colors.warning,
  },
  serviceTypeItemActiveMonthly: {
    backgroundColor: Colors.successLight,
    borderColor: Colors.success,
  },
  serviceTypeItemActiveLombard: {
    backgroundColor: '#fef3c7',
    borderColor: '#b45309',
  },
  serviceTypeText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  serviceTypeTextActive: {
    color: Colors.text,
  },
  serviceTypeTextActiveLombard: {
    color: '#b45309',
    fontWeight: '700' as const,
  },
  checkInActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  checkInConfirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.success,
    gap: 6,
  },
  checkInConfirmText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  checkInCancelBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeSessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  activeSessionInfo: {
    flex: 1,
    gap: 4,
  },
  activeSessionPlate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeSessionMeta: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  plannedMeta: {
    fontSize: 12,
    color: Colors.info,
    fontWeight: '500' as const,
  },
  managerMeta: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  sessionTypeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 2,
  },
  sessionTypeBadgeMonthly: {
    backgroundColor: Colors.successLight,
  },
  sessionTypeBadgeOnetime: {
    backgroundColor: Colors.warningLight,
  },
  sessionTypeBadgeLombard: {
    backgroundColor: '#fef3c7',
  },
  sessionTypeBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  sessionTypeBadgeTextMonthly: {
    color: Colors.success,
  },
  sessionTypeBadgeTextOnetime: {
    color: Colors.warning,
  },
  sessionTypeBadgeTextLombard: {
    color: '#b45309',
  },
  sessionActions: {
    gap: 6,
    alignItems: 'center',
  },
  sessionExitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.warningLight,
  },
  sessionExitBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.warning,
  },
  sessionCancelBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSubNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.successLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  activeSubNoticeText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.success,
    flex: 1,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  editIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Colors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phone2Text: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  phone2Label: {
    fontSize: 11,
    color: Colors.textMuted,
    marginLeft: 2,
  },
  editForm: {
    gap: 8,
  },
  editLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  editInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editInputMultiline: {
    height: 70,
    paddingTop: 10,
    textAlignVertical: 'top' as const,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  editSaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    gap: 6,
  },
  editSaveBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  editCancelBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  carAdminActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 4,
  },
  editCarIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: Colors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteCarIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: Colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCarForm: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  editCarInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editCarModelInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 12,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editCarActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  editCarSaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    gap: 5,
  },
  editCarSaveBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  editCarCancelBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  payAllDebtBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Colors.dangerLight,
  },
  payAllDebtBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  deleteDebtBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDebtBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.dangerLight,
    borderWidth: 1,
    borderColor: Colors.danger + '25',
    marginBottom: 20,
  },
  addDebtBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  addDebtCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
    marginBottom: 20,
    gap: 8,
  },
  addDebtTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  addDebtLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  addDebtInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addDebtInputMultiline: {
    height: 60,
    paddingTop: 10,
    textAlignVertical: 'top' as const,
  },
  addDebtActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  addDebtConfirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: 10,
    backgroundColor: Colors.danger,
    gap: 6,
  },
  addDebtConfirmText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  addDebtCancelBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subscriptionBlock: {
    marginTop: 12,
    gap: 8,
  },
  subscriptionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  subscriptionRowActive: {
    backgroundColor: Colors.successLight,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  subscriptionRowExpired: {
    backgroundColor: Colors.dangerLight,
    borderWidth: 1,
    borderColor: Colors.danger + '25',
  },
  subscriptionInfo: {
    flex: 1,
    gap: 2,
  },
  subscriptionStatus: {
    fontSize: 13,
    fontWeight: '700' as const,
  },
  subscriptionDate: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  subscriptionCar: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
});
