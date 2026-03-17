import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Clock, Wallet, Check, AlertTriangle, Calendar, CreditCard, Banknote, RotateCcw } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { useAuth } from '@/providers/AuthProvider';
import { formatDateTime, calculateDays, formatDate, isExpired, getMonthlyAmount } from '@/utils/date';
import { roundMoney } from '@/utils/money';
import { PaymentMethod } from '@/types';

export default function ExitModal() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { sessions, cars, clients, tariffs, subscriptions, payments, checkOut, needsShiftCheck, earlyExitWithRefund, getClientTotalDebt } = useParking();
  const { isAdmin } = useAuth();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('cash');
  const [partialAmount, setPartialAmount] = useState<string>('');

  const shiftRequired = needsShiftCheck();

  const session = useMemo(() => sessions.find(s => s.id === sessionId), [sessions, sessionId]);
  const car = useMemo(() => session ? cars.find(c => c.id === session.carId) : null, [session, cars]);
  const client = useMemo(() => session ? clients.find(c => c.id === session.clientId) : null, [session, clients]);

  const now = new Date().toISOString();
  const isMonthly = session?.serviceType === 'monthly';
  const days = session ? calculateDays(session.entryTime, now) : 0;
  const prepaid = session?.prepaidAmount ?? 0;

  const sub = useMemo(() => {
    if (!session) return null;
    return subscriptions.find(s => s.carId === session.carId && s.clientId === session.clientId) ?? null;
  }, [session, subscriptions]);

  const hasActiveSub = sub ? !isExpired(sub.paidUntil) : false;

  const existingDebt = useMemo(() => {
    if (!session) return 0;
    return getClientTotalDebt(session.clientId);
  }, [session, getClientTotalDebt]);

  const onetimeAmountCash = tariffs.onetimeCash * days;
  const onetimeAmountCard = tariffs.onetimeCard * days;
  const onetimeAmount = method === 'cash' ? onetimeAmountCash : onetimeAmountCard;
  const dailyRate = method === 'cash' ? tariffs.onetimeCash : tariffs.onetimeCard;
  const remainingAmount = Math.max(0, onetimeAmount - prepaid);

  const monthlyAmountCash = getMonthlyAmount(tariffs.monthlyCash);
  const monthlyAmountCard = getMonthlyAmount(tariffs.monthlyCard);
  const monthlyAmount = method === 'cash' ? monthlyAmountCash : monthlyAmountCard;
  const monthlyDailyRate = method === 'cash' ? tariffs.monthlyCash : tariffs.monthlyCard;

  const refundCalc = useMemo(() => {
    if (!session || !isMonthly || !hasActiveSub || !sub) return null;

    const activePayments = payments.filter(p =>
      p.clientId === session.clientId &&
      p.carId === session.carId &&
      p.serviceType === 'monthly' &&
      !p.cancelled &&
      p.amount > 0
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const lastPayment = activePayments[0];
    if (!lastPayment) return null;

    const paidAmount = lastPayment.amount;
    const paymentMethodUsed = lastPayment.method;
    const rate = paymentMethodUsed === 'cash' ? tariffs.monthlyCash : tariffs.monthlyCard;

    const periodStart = new Date(lastPayment.date);
    periodStart.setHours(0, 0, 0, 0);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const diffMs = todayDate.getTime() - periodStart.getTime();
    const daysUsed = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);
    const usedAmount = daysUsed * rate;
    const refundAmount = Math.max(0, paidAmount - usedAmount);

    const paidUntilDate = new Date(sub.paidUntil);
    paidUntilDate.setHours(0, 0, 0, 0);
    const totalPaidDays = Math.max(1, Math.ceil((paidUntilDate.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const unusedDays = Math.max(0, totalPaidDays - daysUsed);

    return {
      paidAmount,
      paymentMethod: paymentMethodUsed,
      dailyRate: rate,
      daysUsed,
      totalPaidDays,
      unusedDays,
      usedAmount,
      refundAmount,
      paymentDate: lastPayment.date,
      paidUntil: sub.paidUntil,
    };
  }, [session, isMonthly, hasActiveSub, sub, payments, tariffs]);

  const handlePayAndExit = useCallback(() => {
    if (!isAdmin && shiftRequired) {
      Alert.alert('Смена не открыта', 'Откройте смену, чтобы оформить выезд.');
      return;
    }
    if (!session) return;

    if (isMonthly && !hasActiveSub) {
      checkOut(session.id, { method, amount: monthlyAmount });
      Alert.alert('Готово', `Выезд зафиксирован, оплата ${monthlyAmount} ₽ принята`);
      router.back();
    } else {
      const exitResult = checkOut(session.id, { method, amount: remainingAmount });
      if (exitResult.paid > 0) {
        Alert.alert('Готово', `Выезд зафиксирован, оплата ${exitResult.paid} ₽ принята`);
      } else {
        Alert.alert('Готово', 'Выезд зафиксирован');
      }
      router.back();
    }
  }, [session, checkOut, method, remainingAmount, monthlyAmount, isMonthly, hasActiveSub, router, shiftRequired, isAdmin]);

  const handleExitWithDebt = useCallback(() => {
    if (!isAdmin && shiftRequired) {
      Alert.alert('Смена не открыта', 'Откройте смену, чтобы оформить выезд.');
      return;
    }
    if (!session) return;
    const result = checkOut(session.id);
    if (result.amount > 0) {
      Alert.alert('Готово', `Выезд зафиксирован. Начислен долг: ${result.amount} ₽`);
    } else {
      Alert.alert('Готово', 'Выезд зафиксирован');
    }
    router.back();
  }, [session, checkOut, router, shiftRequired, isAdmin]);

  const handlePartialPayAndExit = useCallback(() => {
    if (!isAdmin && shiftRequired) {
      Alert.alert('Смена не открыта', 'Откройте смену, чтобы оформить выезд.');
      return;
    }
    if (!session) return;
    const partial = roundMoney(Number(partialAmount) || 0);
    if (partial <= 0) {
      Alert.alert('Ошибка', 'Укажите сумму оплаты');
      return;
    }
    const totalRequired = isMonthly && !hasActiveSub ? monthlyAmount : remainingAmount;
    const actualPay = Math.min(partial, totalRequired);
    const exitResult = checkOut(session.id, { method, amount: actualPay });
    const debtAmount = exitResult.amount;
    let msg = `Выезд зафиксирован.\nОплачено: ${actualPay} ₽`;
    if (debtAmount > 0) {
      msg += `\nДолг: ${debtAmount} ₽`;
    }
    Alert.alert('Готово', msg);
    router.back();
  }, [session, partialAmount, method, checkOut, router, shiftRequired, isMonthly, hasActiveSub, monthlyAmount, remainingAmount, isAdmin]);

  const handleExitFree = useCallback(() => {
    if (!isAdmin && shiftRequired) {
      Alert.alert('Смена не открыта', 'Откройте смену, чтобы оформить выезд.');
      return;
    }
    if (!session) return;
    checkOut(session.id);
    Alert.alert('Готово', 'Выезд зафиксирован');
    router.back();
  }, [session, checkOut, router, shiftRequired, isAdmin]);

  const handlePayMonthlyAtExit = useCallback(() => {
    if (!session) return;
    if (!isAdmin && shiftRequired) {
      Alert.alert('Смена не открыта', 'Откройте смену, чтобы принять оплату.');
      return;
    }
    router.push(`/pay-monthly-modal?clientId=${session.clientId}&carId=${session.carId}`);
  }, [session, router, shiftRequired, isAdmin]);

  const handleEarlyExitWithRefund = useCallback(() => {
    if (!isAdmin && shiftRequired) {
      Alert.alert('Смена не открыта', 'Откройте смену, чтобы оформить возврат.');
      return;
    }
    if (!session || !refundCalc || refundCalc.refundAmount <= 0) return;

    Alert.alert(
      'Досрочный выезд с возвратом',
      `Клиент простоял ${refundCalc.daysUsed} дн. из ${refundCalc.totalPaidDays}.\n\nИспользовано: ${refundCalc.usedAmount} ₽\nВозврат: ${refundCalc.refundAmount} ₽ (${refundMethod === 'cash' ? 'наличные' : 'безнал'})\n\nОформить возврат?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Оформить возврат',
          style: 'destructive',
          onPress: () => {
            const result = earlyExitWithRefund(session.id, refundMethod);
            Alert.alert(
              'Готово',
              `Досрочный выезд оформлен.\n\nИспользовано: ${result.daysUsed} дн. × ${result.dailyRate} ₽\nВозвращено: ${result.refundAmount} ₽`
            );
            router.back();
          },
        },
      ]
    );
  }, [session, refundCalc, refundMethod, earlyExitWithRefund, router, shiftRequired, isAdmin]);

  if (!session || !car || !client) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Сессия не найдена</Text>
      </View>
    );
  }

  const fullyPrepaid = !isMonthly && prepaid > 0 && remainingAmount === 0;
  const monthlyPaid = isMonthly && hasActiveSub;
  const noPaymentNeeded = fullyPrepaid || monthlyPaid;
  const canRefund = isAdmin && monthlyPaid && refundCalc && refundCalc.refundAmount > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.plateBlock}>
        <Text style={styles.plateNumber}>{car.plateNumber}</Text>
        {car.carModel ? <Text style={styles.carModelLabel}>{car.carModel}</Text> : null}
        <Text style={styles.clientName}>{client.name}</Text>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Clock size={16} color={Colors.textMuted} />
          <Text style={styles.infoLabel}>Въезд:</Text>
          <Text style={styles.infoValue}>{formatDateTime(session.entryTime)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Clock size={16} color={Colors.textMuted} />
          <Text style={styles.infoLabel}>Выезд:</Text>
          <Text style={styles.infoValue}>{formatDateTime(now)}</Text>
        </View>

        {session.plannedDepartureTime ? (
          <View style={styles.infoRow}>
            <Clock size={16} color={Colors.info} />
            <Text style={styles.infoLabel}>Планировал:</Text>
            <Text style={[styles.infoValue, { color: Colors.info }]}>{session.plannedDepartureTime}</Text>
          </View>
        ) : null}

        {session.managerName ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Оформил:</Text>
            <Text style={styles.infoValue}>{session.managerName}</Text>
          </View>
        ) : null}

        {!isMonthly && (
          <>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Суток:</Text>
              <Text style={styles.infoValueBold}>{days}</Text>
            </View>

            {prepaid > 0 && (
              <View style={styles.prepaidRow}>
                <Check size={14} color={Colors.success} />
                <Text style={styles.prepaidLabel}>Предоплата при постановке:</Text>
                <Text style={styles.prepaidValue}>{prepaid} ₽</Text>
              </View>
            )}
          </>
        )}

        {isMonthly && (
          <>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Calendar size={16} color={hasActiveSub ? Colors.success : Colors.danger} />
              <Text style={styles.infoLabel}>Подписка:</Text>
              <Text style={[styles.infoValue, { color: hasActiveSub ? Colors.success : Colors.danger }]}>
                {hasActiveSub
                  ? `Оплачено до ${formatDate(sub!.paidUntil)}`
                  : 'Истекла'
                }
              </Text>
            </View>
          </>
        )}
      </View>

      {!isAdmin && shiftRequired && (
        <View style={styles.shiftWarning}>
          <AlertTriangle size={16} color={Colors.danger} />
          <Text style={styles.shiftWarningText}>Откройте смену, чтобы оформить выезд</Text>
        </View>
      )}

      {noPaymentNeeded ? (
        <>
          <View style={styles.paidNotice}>
            <Check size={18} color={Colors.success} />
            <Text style={styles.paidNoticeText}>
              {fullyPrepaid
                ? `Полностью оплачено при постановке (${prepaid} ₽). Дополнительная оплата не требуется.`
                : 'Месячная аренда оплачена. Дополнительная оплата не требуется.'
              }
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.exitBtn, (!isAdmin && shiftRequired) && styles.exitBtnDisabled]}
            onPress={handleExitFree}
            activeOpacity={0.7}
          >
            <Check size={20} color={Colors.white} />
            <Text style={styles.exitBtnText}>Зафиксировать выезд</Text>
          </TouchableOpacity>

          {canRefund && (
            <>
              <View style={styles.refundSeparator}>
                <View style={styles.refundSeparatorLine} />
                <Text style={styles.refundSeparatorText}>Досрочный выезд</Text>
                <View style={styles.refundSeparatorLine} />
              </View>

              <View style={styles.refundCard}>
                <View style={styles.refundHeader}>
                  <RotateCcw size={18} color={Colors.warning} />
                  <Text style={styles.refundTitle}>Перерасчёт и возврат</Text>
                </View>

                <View style={styles.refundCalcBlock}>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Оплата:</Text>
                    <Text style={styles.calcValue}>{refundCalc!.paidAmount} ₽ ({formatDate(refundCalc!.paymentDate)})</Text>
                  </View>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Оплачено до:</Text>
                    <Text style={styles.calcValue}>{formatDate(refundCalc!.paidUntil)}</Text>
                  </View>
                  <View style={styles.calcDivider} />
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Тариф:</Text>
                    <Text style={styles.calcValue}>{refundCalc!.dailyRate} ₽/день ({refundCalc!.paymentMethod === 'cash' ? 'нал.' : 'безнал.'})</Text>
                  </View>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Фактически использовано:</Text>
                    <Text style={styles.calcValueBold}>{refundCalc!.daysUsed} дн.</Text>
                  </View>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Стоимость использования:</Text>
                    <Text style={styles.calcValueBold}>{refundCalc!.usedAmount} ₽</Text>
                  </View>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Неиспользовано:</Text>
                    <Text style={[styles.calcValue, { color: Colors.warning }]}>{refundCalc!.unusedDays} дн.</Text>
                  </View>
                  <View style={styles.calcDivider} />
                  <View style={styles.calcRow}>
                    <Text style={styles.refundTotalLabel}>К возврату:</Text>
                    <Text style={styles.refundTotalValue}>{refundCalc!.refundAmount} ₽</Text>
                  </View>
                </View>

                <Text style={styles.refundMethodLabel}>Способ возврата</Text>
                <View style={styles.methodRow}>
                  <TouchableOpacity
                    style={[styles.methodBtn, refundMethod === 'cash' && styles.refundMethodBtnActive]}
                    onPress={() => setRefundMethod('cash')}
                  >
                    <Banknote size={18} color={refundMethod === 'cash' ? Colors.white : Colors.textSecondary} />
                    <Text style={[styles.methodBtnText, refundMethod === 'cash' && styles.methodBtnTextActive]}>
                      Наличные
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.methodBtn, refundMethod === 'card' && styles.refundMethodBtnActive]}
                    onPress={() => setRefundMethod('card')}
                  >
                    <CreditCard size={18} color={refundMethod === 'card' ? Colors.white : Colors.textSecondary} />
                    <Text style={[styles.methodBtnText, refundMethod === 'card' && styles.methodBtnTextActive]}>
                      Безнал
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.refundBtn, (!isAdmin && shiftRequired) && styles.exitBtnDisabled]}
                  onPress={handleEarlyExitWithRefund}
                  activeOpacity={0.7}
                >
                  <RotateCcw size={18} color={Colors.white} />
                  <Text style={styles.refundBtnText}>
                    Досрочный выезд — возврат {refundCalc!.refundAmount} ₽
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </>
      ) : (
        <>
          {!isMonthly && (
            <>
              <Text style={styles.sectionLabel}>Способ оплаты</Text>
              <View style={styles.methodRow}>
                <TouchableOpacity
                  style={[styles.methodBtn, method === 'cash' && styles.methodBtnActive]}
                  onPress={() => setMethod('cash')}
                >
                  <Banknote size={18} color={method === 'cash' ? Colors.white : Colors.textSecondary} />
                  <Text style={[styles.methodBtnText, method === 'cash' && styles.methodBtnTextActive]}>
                    Наличные
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.methodBtn, method === 'card' && styles.methodBtnActive]}
                  onPress={() => setMethod('card')}
                >
                  <CreditCard size={18} color={method === 'card' ? Colors.white : Colors.textSecondary} />
                  <Text style={[styles.methodBtnText, method === 'card' && styles.methodBtnTextActive]}>
                    Безнал
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.calcCard}>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Тариф:</Text>
                  <Text style={styles.calcValue}>{dailyRate} ₽/сутки ({method === 'cash' ? 'нал.' : 'безнал.'})</Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Суток:</Text>
                  <Text style={styles.calcValue}>{days}</Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Начислено:</Text>
                  <Text style={styles.calcValueBold}>{onetimeAmount} ₽</Text>
                </View>
                {prepaid > 0 && (
                  <>
                    <View style={styles.calcDivider} />
                    <View style={styles.calcRow}>
                      <Text style={[styles.calcLabel, { color: Colors.success }]}>Предоплата:</Text>
                      <Text style={[styles.calcValue, { color: Colors.success }]}>−{prepaid} ₽</Text>
                    </View>
                  </>
                )}
                <View style={styles.calcDivider} />
                <View style={styles.calcRow}>
                  <Text style={styles.calcTotalLabel}>К оплате:</Text>
                  <Text style={styles.calcTotalValue}>{remainingAmount} ₽</Text>
                </View>
              </View>

              {existingDebt > 0 && (
                <View style={styles.existingDebtNotice}>
                  <AlertTriangle size={14} color={Colors.warning} />
                  <Text style={styles.existingDebtText}>Текущий долг клиента: {existingDebt} ₽</Text>
                </View>
              )}

              {remainingAmount > 0 && (
                <View style={styles.scenarioCard}>
                  <Text style={styles.scenarioTitle}>Итого к оплате</Text>
                  <Text style={styles.scenarioTotal}>{remainingAmount + existingDebt} ₽</Text>
                  {existingDebt > 0 && (
                    <Text style={styles.scenarioBreakdown}>Парковка: {remainingAmount} ₽ + Долг: {existingDebt} ₽</Text>
                  )}
                </View>
              )}

              {remainingAmount > 0 && (
                <TouchableOpacity
                  style={[styles.payExitBtn, (!isAdmin && shiftRequired) && styles.exitBtnDisabled]}
                  onPress={handlePayAndExit}
                  activeOpacity={0.7}
                >
                  <Wallet size={20} color={Colors.white} />
                  <Text style={styles.payExitBtnText}>Оплатить {remainingAmount} ₽ и выезд</Text>
                </TouchableOpacity>
              )}

              {remainingAmount === 0 && (
                <TouchableOpacity
                  style={[styles.exitBtn, (!isAdmin && shiftRequired) && styles.exitBtnDisabled]}
                  onPress={handlePayAndExit}
                  activeOpacity={0.7}
                >
                  <Check size={20} color={Colors.white} />
                  <Text style={styles.exitBtnText}>Зафиксировать выезд</Text>
                </TouchableOpacity>
              )}

              {remainingAmount > 0 && (
                <>
                  <View style={styles.partialPaySection}>
                    <Text style={styles.partialPayLabel}>Частичная оплата</Text>
                    <View style={styles.partialPayRow}>
                      <TextInput
                        style={styles.partialPayInput}
                        value={partialAmount}
                        onChangeText={setPartialAmount}
                        keyboardType="numeric"
                        placeholder="Сумма"
                        placeholderTextColor={Colors.textMuted}
                        testID="partial-amount-input"
                      />
                      <TouchableOpacity
                        style={[styles.partialPayBtn, (!isAdmin && shiftRequired) && styles.exitBtnDisabled]}
                        onPress={handlePartialPayAndExit}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.partialPayBtnText}>Оплатить часть + выезд</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.partialPayHint}>Остаток будет записан как долг</Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.debtExitBtn, (!isAdmin && shiftRequired) && styles.exitBtnDisabled]}
                    onPress={handleExitWithDebt}
                    activeOpacity={0.7}
                  >
                    <AlertTriangle size={18} color={Colors.danger} />
                    <Text style={styles.debtExitBtnText}>Выезд полностью в долг ({remainingAmount} ₽)</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          {isMonthly && !hasActiveSub && (
            <>
              <View style={styles.expiredNotice}>
                <AlertTriangle size={18} color={Colors.danger} />
                <View style={styles.expiredNoticeContent}>
                  <Text style={styles.expiredNoticeTitle}>Подписка истекла</Text>
                  <Text style={styles.expiredNoticeText}>
                    Клиент может оплатить месяц сейчас или выехать с начислением долга.
                  </Text>
                </View>
              </View>

              <Text style={styles.sectionLabel}>Способ оплаты</Text>
              <View style={styles.methodRow}>
                <TouchableOpacity
                  style={[styles.methodBtn, method === 'cash' && styles.methodBtnActive]}
                  onPress={() => setMethod('cash')}
                >
                  <Banknote size={18} color={method === 'cash' ? Colors.white : Colors.textSecondary} />
                  <Text style={[styles.methodBtnText, method === 'cash' && styles.methodBtnTextActive]}>
                    Наличные
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.methodBtn, method === 'card' && styles.methodBtnActive]}
                  onPress={() => setMethod('card')}
                >
                  <CreditCard size={18} color={method === 'card' ? Colors.white : Colors.textSecondary} />
                  <Text style={[styles.methodBtnText, method === 'card' && styles.methodBtnTextActive]}>
                    Безнал
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.calcCard}>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Тариф:</Text>
                  <Text style={styles.calcValue}>{monthlyDailyRate} ₽/день ({method === 'cash' ? 'нал.' : 'безнал.'})</Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>За месяц:</Text>
                  <Text style={styles.calcValueBold}>{monthlyAmount} ₽</Text>
                </View>
              </View>

              {existingDebt > 0 && (
                <View style={styles.existingDebtNotice}>
                  <AlertTriangle size={14} color={Colors.warning} />
                  <Text style={styles.existingDebtText}>Текущий долг клиента: {existingDebt} ₽</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.payExitBtn, (!isAdmin && shiftRequired) && styles.exitBtnDisabled]}
                onPress={handlePayAndExit}
                activeOpacity={0.7}
              >
                <Wallet size={20} color={Colors.white} />
                <Text style={styles.payExitBtnText}>Оплатить {monthlyAmount} ₽ и выезд</Text>
              </TouchableOpacity>

              <View style={styles.partialPaySection}>
                <Text style={styles.partialPayLabel}>Частичная оплата</Text>
                <View style={styles.partialPayRow}>
                  <TextInput
                    style={styles.partialPayInput}
                    value={partialAmount}
                    onChangeText={setPartialAmount}
                    keyboardType="numeric"
                    placeholder="Сумма"
                    placeholderTextColor={Colors.textMuted}
                    testID="partial-amount-monthly-input"
                  />
                  <TouchableOpacity
                    style={[styles.partialPayBtn, (!isAdmin && shiftRequired) && styles.exitBtnDisabled]}
                    onPress={handlePartialPayAndExit}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.partialPayBtnText}>Оплатить часть + выезд</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.partialPayHint}>Остаток будет записан как долг</Text>
              </View>

              <TouchableOpacity
                style={styles.payMonthlyCustomBtn}
                onPress={handlePayMonthlyAtExit}
                activeOpacity={0.7}
              >
                <Calendar size={18} color={Colors.primary} />
                <Text style={styles.payMonthlyCustomBtnText}>Оплатить за произвольный период</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.debtExitBtn, (!isAdmin && shiftRequired) && styles.exitBtnDisabled]}
                onPress={handleExitWithDebt}
                activeOpacity={0.7}
              >
                <AlertTriangle size={18} color={Colors.danger} />
                <Text style={styles.debtExitBtnText}>Выезд полностью в долг ({monthlyAmountCash} ₽)</Text>
              </TouchableOpacity>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
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
  plateBlock: {
    alignItems: 'center',
    marginBottom: 20,
  },
  plateNumber: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.text,
    letterSpacing: 2,
    backgroundColor: Colors.card,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  carModelLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  clientName: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 10,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500' as const,
  },
  infoValueBold: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  prepaidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  prepaidLabel: {
    fontSize: 13,
    color: Colors.success,
    fontWeight: '500' as const,
  },
  prepaidValue: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.success,
  },
  shiftWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.dangerLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  shiftWarningText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.danger,
    flex: 1,
  },
  paidNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.successLight,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  paidNoticeText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.success,
    flex: 1,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 8,
  },
  methodBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  methodBtnText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  methodBtnTextActive: {
    color: Colors.white,
  },
  calcCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 10,
    marginBottom: 20,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calcLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  calcValue: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  calcValueBold: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  calcDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  calcTotalLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  calcTotalValue: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  payExitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    height: 52,
    borderRadius: 14,
    gap: 8,
    marginBottom: 10,
  },
  payExitBtnText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '600' as const,
  },
  exitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    height: 52,
    borderRadius: 14,
    gap: 8,
    marginBottom: 10,
  },
  exitBtnDisabled: {
    opacity: 0.5,
  },
  exitBtnText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '600' as const,
  },
  debtExitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.dangerLight,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
    gap: 8,
    marginBottom: 10,
  },
  debtExitBtnText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.danger,
  },
  payMonthlyCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    gap: 8,
    marginBottom: 10,
  },
  payMonthlyCustomBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  expiredNotice: {
    flexDirection: 'row',
    backgroundColor: Colors.dangerLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  expiredNoticeContent: {
    flex: 1,
    gap: 4,
  },
  expiredNoticeTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
  expiredNoticeText: {
    fontSize: 13,
    color: Colors.danger,
    opacity: 0.8,
    lineHeight: 18,
  },
  refundSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    gap: 12,
  },
  refundSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.warning + '40',
  },
  refundSeparatorText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.warning,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  refundCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.warning + '40',
    marginBottom: 10,
  },
  refundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  refundTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  refundCalcBlock: {
    gap: 8,
    marginBottom: 16,
  },
  refundMethodLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  refundMethodBtnActive: {
    backgroundColor: Colors.warning,
    borderColor: Colors.warning,
  },
  refundTotalLabel: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.warning,
  },
  refundTotalValue: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.warning,
  },
  refundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.warning,
    height: 52,
    borderRadius: 14,
    gap: 8,
    marginTop: 4,
  },
  refundBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  existingDebtNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warningLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  existingDebtText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.warning,
    flex: 1,
  },
  scenarioCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 16,
    alignItems: 'center',
  },
  scenarioTitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  scenarioTotal: {
    fontSize: 26,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  scenarioBreakdown: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  partialPaySection: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 10,
  },
  partialPayLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  partialPayRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  partialPayInput: {
    flex: 1,
    height: 44,
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  partialPayBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.info,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partialPayBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  partialPayHint: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 6,
  },
});
