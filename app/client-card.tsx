import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Linking, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Phone, Car, Calendar, CreditCard, AlertTriangle, Trash2, Plus, Check, X, LogIn, LogOut, XCircle, RotateCcw, Ban } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { formatDate, formatDateTime, isExpired } from '@/utils/date';
import { formatPlateNumber } from '@/utils/plate';
import { ServiceType } from '@/types';

export default function ClientCardScreen() {
  const router = useRouter();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const { isAdmin } = useAuth();
  const {
    clients, cars, sessions, subscriptions, debts, transactions, payments,
    getCarsByClient, getClientTotalDebt, deleteClient, addCarToClient,
    checkIn, checkOut, getSubscription, cancelCheckIn, cancelCheckOut, cancelPayment,
    needsShiftCheck,
  } = useParking();

  const [showAddCar, setShowAddCar] = useState<boolean>(false);
  const [newPlate, setNewPlate] = useState<string>('');
  const [newCarModel, setNewCarModel] = useState<string>('');
  const [showCheckInForm, setShowCheckInForm] = useState<boolean>(false);
  const [checkInCarId, setCheckInCarId] = useState<string>('');
  const [checkInServiceType, setCheckInServiceType] = useState<ServiceType>('onetime');
  const [checkInPlannedDeparture, setCheckInPlannedDeparture] = useState<string>('');

  const shiftRequired = needsShiftCheck();

  const client = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId]);
  const isDeleted = !!client?.deleted;
  const clientCars = useMemo(() => clientId ? getCarsByClient(clientId) : [], [clientId, getCarsByClient]);
  const totalDebt = useMemo(() => clientId ? getClientTotalDebt(clientId) : 0, [clientId, getClientTotalDebt]);
  const clientDebts = useMemo(() => debts.filter(d => d.clientId === clientId), [debts, clientId]);

  const clientActiveSessions = useMemo(() =>
    sessions.filter(s => s.clientId === clientId && s.status === 'active'),
  [sessions, clientId]);

  const recentCompletedSessions = useMemo(() =>
    sessions.filter(s => s.clientId === clientId && s.status === 'completed' && !s.cancelled)
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

  const clientTx = useMemo(() =>
    transactions.filter(t => t.clientId === clientId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20),
    [transactions, clientId]
  );

  const handleCall = useCallback(() => {
    if (client?.phone) {
      const phone = client.phone.replace(/\D/g, '');
      void Linking.openURL(`tel:+${phone}`);
    }
  }, [client]);

  const handleDelete = useCallback(() => {
    if (!clientId || !client) return;
    Alert.alert('Удаление', `Удалить клиента ${client.name} и все связанные данные?`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          deleteClient(clientId);
          router.back();
        },
      },
    ]);
  }, [clientId, client, deleteClient, router]);

  const handleCheckIn = useCallback(() => {
    if (shiftRequired) {
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
    const finalServiceType: ServiceType = carHasActiveSub ? 'monthly' : checkInServiceType;
    checkIn(checkInCarId, clientId, finalServiceType, checkInPlannedDeparture.trim() || undefined);
    const label = carHasActiveSub ? 'месяц, абонемент активен' : (finalServiceType === 'monthly' ? 'месяц' : 'разово');
    Alert.alert('Готово', `Въезд зафиксирован: ${car?.plateNumber ?? ''} (${label})`);
    setShowCheckInForm(false);
    setCheckInCarId('');
    setCheckInServiceType('onetime');
    setCheckInPlannedDeparture('');
  }, [checkInCarId, clientId, clientCars, checkInServiceType, checkIn, hasActiveSubscription, shiftRequired, checkInPlannedDeparture]);

  const handleCheckOut = useCallback((sessionId: string) => {
    if (shiftRequired) {
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
  }, [clientActiveSessions, cars, clientId, getSubscription, checkOut, shiftRequired]);

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
        <Text style={styles.profileName}>{client.name}</Text>
        <TouchableOpacity style={styles.phoneRow} onPress={handleCall}>
          <Phone size={16} color={Colors.info} />
          <Text style={styles.phoneText}>{client.phone}</Text>
        </TouchableOpacity>
        {client.notes ? <Text style={styles.notesText}>{client.notes}</Text> : null}

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
      </View>

      {!isDeleted && <View style={styles.actionsBlock}>
        <TouchableOpacity
          style={[
            styles.actionBtn,
            styles.checkInBtn,
            (carsWithoutActiveSession.length === 0 || shiftRequired) && styles.actionBtnDisabled,
          ]}
          onPress={() => {
            if (shiftRequired) {
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
            style={[styles.actionBtn, styles.checkOutBtn, shiftRequired && styles.actionBtnDisabled]}
            onPress={() => {
              if (shiftRequired) {
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

          <Text style={styles.checkInLabel}>Автомобиль</Text>
          <View style={styles.carPickerRow}>
            {carsWithoutActiveSession.map(car => (
              <TouchableOpacity
                key={car.id}
                style={[
                  styles.carPickerItem,
                  checkInCarId === car.id && styles.carPickerItemActive,
                ]}
                onPress={() => setCheckInCarId(car.id)}
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
              <Text style={styles.checkInLabel}>Тип услуги</Text>
              <View style={styles.serviceTypeRow}>
                <TouchableOpacity
                  style={[
                    styles.serviceTypeItem,
                    checkInServiceType === 'onetime' && styles.serviceTypeItemActiveOnetime,
                  ]}
                  onPress={() => setCheckInServiceType('onetime')}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.serviceTypeText,
                    checkInServiceType === 'onetime' && styles.serviceTypeTextActive,
                  ]}>Разово</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.serviceTypeItem,
                    checkInServiceType === 'monthly' && styles.serviceTypeItemActiveMonthly,
                  ]}
                  onPress={() => setCheckInServiceType('monthly')}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.serviceTypeText,
                    checkInServiceType === 'monthly' && styles.serviceTypeTextActive,
                  ]}>Месяц</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <Text style={styles.checkInLabel}>Планируемый выезд</Text>
          <TextInput
            style={styles.plannedInput}
            placeholder="Напр. 18:00, завтра 10:00..."
            placeholderTextColor={Colors.textMuted}
            value={checkInPlannedDeparture}
            onChangeText={setCheckInPlannedDeparture}
          />

          <View style={styles.checkInActions}>
            <TouchableOpacity
              style={styles.checkInConfirmBtn}
              onPress={handleCheckIn}
              activeOpacity={0.7}
            >
              <Check size={16} color={Colors.white} />
              <Text style={styles.checkInConfirmText}>Зафиксировать въезд</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.checkInCancelBtn}
              onPress={() => { setShowCheckInForm(false); setCheckInCarId(''); setCheckInPlannedDeparture(''); }}
              activeOpacity={0.7}
            >
              <X size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
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
                      session.serviceType === 'monthly' ? styles.sessionTypeBadgeMonthly : styles.sessionTypeBadgeOnetime,
                    ]}>
                      <Text style={[
                        styles.sessionTypeBadgeText,
                        session.serviceType === 'monthly' ? styles.sessionTypeBadgeTextMonthly : styles.sessionTypeBadgeTextOnetime,
                      ]}>
                        {session.serviceType === 'monthly' ? 'Месяц' : 'Разово'}
                        {session.serviceType === 'monthly' && hasActiveSub ? ' (оплачено)' : ''}
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
          return (
            <View key={car.id} style={styles.carRow}>
              <View style={styles.carPlateBlock}>
                <Car size={16} color={Colors.primary} />
                <View>
                  <Text style={styles.carPlate}>{car.plateNumber}</Text>
                  {car.carModel ? <Text style={styles.carModelText}>{car.carModel}</Text> : null}
                </View>
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

      {clientDebts.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Задолженности</Text>
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
              </View>
            ))}
          </View>
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
    marginBottom: 6,
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
  serviceTypeText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  serviceTypeTextActive: {
    color: Colors.text,
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
});
