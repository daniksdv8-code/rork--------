import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Check, Banknote, CreditCard, Info } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { useAuth } from '@/providers/AuthProvider';
import { PaymentMethod } from '@/types';
import { roundMoney } from '@/utils/money';


export default function PayDebtModal() {
  const router = useRouter();
  const { debtId, clientId, clientName, totalDebt, mode } = useLocalSearchParams<{
    debtId: string;
    clientId: string;
    clientName: string;
    totalDebt: string;
    mode: string;
  }>();
  const { payDebt, payClientDebt, debts, needsShiftCheck, calculateDebtByMethod, getClientTotalDebt } = useParking();
  const { isAdmin } = useAuth();
  const shiftRequired = needsShiftCheck();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState<string>('');
  const [amountManuallyEdited, setAmountManuallyEdited] = useState<boolean>(false);

  const isClientDebtMode = mode === 'client_debt';
  const debt = !isClientDebtMode ? debts.find(d => d.id === debtId) : null;

  const storedClientDebt = useMemo(() => {
    if (!isClientDebtMode || !clientId) return 0;
    return getClientTotalDebt(clientId);
  }, [isClientDebtMode, clientId, getClientTotalDebt]);

  const calculatedDebt = useMemo(() => {
    if (!isClientDebtMode || !clientId) return null;
    return calculateDebtByMethod(clientId, method);
  }, [isClientDebtMode, clientId, method, calculateDebtByMethod]);

  const displayDebt = useMemo(() => {
    if (isClientDebtMode) {
      return storedClientDebt;
    }
    if (debt) return debt.remainingAmount;
    return Number(totalDebt) || 0;
  }, [isClientDebtMode, storedClientDebt, debt, totalDebt]);

  useEffect(() => {
    if (!amountManuallyEdited) {
      setAmount(String(displayDebt));
    }
  }, [displayDebt, amountManuallyEdited]);

  const handleMethodChange = useCallback((newMethod: PaymentMethod) => {
    setMethod(newMethod);
  }, []);

  const handleAmountChange = useCallback((text: string) => {
    setAmount(text);
    setAmountManuallyEdited(true);
  }, []);

  const handleSetFullAmount = useCallback(() => {
    setAmount(String(displayDebt));
    setAmountManuallyEdited(false);
  }, [displayDebt]);

  const handlePay = useCallback(() => {
    if (!isAdmin && shiftRequired) {
      Alert.alert('Смена не открыта', 'Откройте смену, чтобы принять оплату.');
      return;
    }
    const numAmount = roundMoney(Number(amount) || 0);
    if (!numAmount || numAmount <= 0) {
      Alert.alert('Ошибка', 'Введите сумму');
      return;
    }

    if (numAmount > displayDebt && displayDebt > 0) {
      Alert.alert('Ошибка', `Сумма не может превышать текущий долг: ${displayDebt} ₽`);
      return;
    }

    if (isClientDebtMode && clientId) {
      payClientDebt(clientId, numAmount, method);
      const remaining = roundMoney(displayDebt - numAmount);
      if (remaining <= 0) {
        Alert.alert('Готово', 'Долг полностью погашен');
      } else {
        Alert.alert('Готово', `Оплачено ${numAmount} ₽. Остаток: ${remaining} ₽`);
      }
    } else if (debtId) {
      payDebt(debtId, numAmount, method);
      const remaining = (debt?.remainingAmount ?? 0) - numAmount;
      if (remaining <= 0) {
        Alert.alert('Готово', 'Долг полностью погашен');
      } else {
        Alert.alert('Готово', `Оплачено ${numAmount} ₽. Остаток: ${remaining} ₽`);
      }
    }
    router.back();
  }, [amount, method, debtId, clientId, isClientDebtMode, payDebt, payClientDebt, debt, displayDebt, router, shiftRequired, isAdmin]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{clientName ?? 'Клиент'}</Text>
        <View style={styles.debtBadge}>
          <Text style={styles.debtBadgeText}>Текущий долг: {displayDebt} ₽</Text>
        </View>
      </View>

      <Text style={styles.label}>Способ оплаты</Text>
      <View style={styles.methodRow}>
        <TouchableOpacity
          style={[styles.methodBtn, method === 'cash' && styles.methodBtnActive]}
          onPress={() => handleMethodChange('cash')}
          testID="method-cash"
        >
          <Banknote size={18} color={method === 'cash' ? Colors.white : Colors.textSecondary} />
          <Text style={[styles.methodBtnText, method === 'cash' && styles.methodBtnTextActive]}>Наличные</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.methodBtn, method === 'card' && styles.methodBtnActive]}
          onPress={() => handleMethodChange('card')}
          testID="method-card"
        >
          <CreditCard size={18} color={method === 'card' ? Colors.white : Colors.textSecondary} />
          <Text style={[styles.methodBtnText, method === 'card' && styles.methodBtnTextActive]}>Безнал</Text>
        </TouchableOpacity>
      </View>

      {isClientDebtMode && calculatedDebt && calculatedDebt.details.length > 0 && (
        <View style={styles.detailsBlock}>
          <View style={styles.detailsHeader}>
            <Info size={14} color={Colors.textSecondary} />
            <Text style={styles.detailsTitle}>Детализация долга</Text>
          </View>
          {calculatedDebt.details.map((d, i) => (
            <View key={d.sessionId + i} style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {d.serviceType === 'lombard' ? 'Ломбард' : d.serviceType === 'monthly' ? 'Месячный' : 'Дневной'}:
              </Text>
              <Text style={styles.detailValue}>
                {d.days} сут.
              </Text>
            </View>
          ))}
          {calculatedDebt.oldDebtsTotal > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Ручные/старые долги:</Text>
              <Text style={styles.detailValue}>{calculatedDebt.oldDebtsTotal} ₽</Text>
            </View>
          )}
        </View>
      )}

      <Text style={styles.label}>Сумма оплаты (₽)</Text>
      <TextInput
        style={styles.amountInput}
        value={amount}
        onChangeText={handleAmountChange}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={Colors.textMuted}
        testID="debt-amount-input"
      />

      <View style={styles.quickAmounts}>
        {displayDebt > 0 && [
          Math.min(100, displayDebt),
          Math.min(Math.round(displayDebt / 2), displayDebt),
          displayDebt,
        ].filter((v, i, arr) => arr.indexOf(v) === i && v > 0).map(v => (
          <TouchableOpacity
            key={v}
            style={[styles.quickBtn, v === displayDebt && styles.quickBtnFull]}
            onPress={() => {
              setAmount(String(v));
              setAmountManuallyEdited(v !== displayDebt);
            }}
          >
            <Text style={[styles.quickBtnText, v === displayDebt && styles.quickBtnTextFull]}>
              {v === displayDebt ? 'Полностью' : `${v} ₽`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {amountManuallyEdited && Number(amount) !== displayDebt && (
        <TouchableOpacity style={styles.resetAmountBtn} onPress={handleSetFullAmount}>
          <Text style={styles.resetAmountText}>Погасить полностью: {displayDebt} ₽</Text>
        </TouchableOpacity>
      )}

      {Number(amount) > 0 && Number(amount) <= displayDebt && displayDebt > 0 && (
        <View style={styles.distributionCard}>
          <View style={styles.distributionRow}>
            <Text style={styles.distributionLabel}>Долг до оплаты:</Text>
            <Text style={styles.distributionValue}>{displayDebt} ₽</Text>
          </View>
          <View style={styles.distributionRow}>
            <Text style={[styles.distributionLabel, { color: Colors.success }]}>Оплата:</Text>
            <Text style={[styles.distributionValue, { color: Colors.success }]}>−{Number(amount)} ₽</Text>
          </View>
          <View style={[styles.distributionRow, styles.detailRowTotal]}>
            <Text style={styles.detailTotalLabel}>Остаток после оплаты:</Text>
            <Text style={[styles.detailTotalValue, { color: roundMoney(displayDebt - Number(amount)) <= 0 ? Colors.success : Colors.danger }]}>
              {roundMoney(displayDebt - Number(amount))} ₽
            </Text>
          </View>
        </View>
      )}

      {Number(amount) > displayDebt && displayDebt > 0 && (
        <View style={styles.overpayNotice}>
          <Info size={14} color={Colors.danger} />
          <Text style={[styles.overpayNoticeText, { color: Colors.danger }]}>
            Сумма превышает долг. Максимум: {displayDebt} ₽
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.payBtn} onPress={handlePay} activeOpacity={0.7} testID="pay-debt-btn">
        <Check size={20} color={Colors.white} />
        <Text style={styles.payBtnText}>
          Погасить {Number(amount) > 0 ? `${amount} ₽` : ''}
        </Text>
      </TouchableOpacity>
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
  },
  header: {
    alignItems: 'center' as const,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  debtBadge: {
    backgroundColor: Colors.dangerLight,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 10,
  },
  debtBadgeText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
  label: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },
  amountInput: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    height: 56,
    paddingHorizontal: 18,
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    textAlign: 'center' as const,
  },
  quickAmounts: {
    flexDirection: 'row' as const,
    gap: 8,
    marginTop: 10,
    justifyContent: 'center' as const,
  },
  quickBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  quickBtnFull: {
    backgroundColor: Colors.primary + '15',
    borderColor: Colors.primary + '40',
  },
  quickBtnText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.primary,
  },
  quickBtnTextFull: {
    fontWeight: '600' as const,
  },
  methodRow: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
  rateCompare: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: Colors.primary + '10',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  rateCompareText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.primary,
    flex: 1,
  },
  detailsBlock: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  detailsHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginBottom: 10,
  },
  detailsTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  detailRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 4,
  },
  detailRowTotal: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 6,
    paddingTop: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  detailTotalLabel: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  detailTotalValue: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  recalcNotice: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 8,
    backgroundColor: Colors.warningLight,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  recalcNoticeText: {
    fontSize: 12,
    color: Colors.warning,
    flex: 1,
    lineHeight: 17,
  },
  resetAmountBtn: {
    alignItems: 'center' as const,
    marginTop: 8,
    paddingVertical: 6,
  },
  resetAmountText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '500' as const,
  },
  overpayNotice: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: Colors.successLight,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  overpayNoticeText: {
    fontSize: 13,
    color: Colors.success,
    fontWeight: '500' as const,
    flex: 1,
    lineHeight: 18,
  },
  distributionCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 8,
  },
  distributionTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  distributionRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  distributionLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  distributionValue: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  payBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.success,
    height: 52,
    borderRadius: 14,
    gap: 8,
    marginTop: 28,
  },
  payBtnText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '600' as const,
  },
});
