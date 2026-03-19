import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Wallet, Check } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { useAuth } from '@/providers/AuthProvider';
import { PaymentMethod } from '@/types';

export default function PayDebtModal() {
  const router = useRouter();
  const { debtId, clientId, clientName, totalDebt, mode } = useLocalSearchParams<{
    debtId: string;
    clientId: string;
    clientName: string;
    totalDebt: string;
    mode: string;
  }>();
  const { payDebt, payClientDebt, debts, getClientDebtInfo, needsShiftCheck } = useParking();
  const { isAdmin } = useAuth();
  const shiftRequired = needsShiftCheck();
  const [amount, setAmount] = useState<string>(totalDebt ?? '0');
  const [method, setMethod] = useState<PaymentMethod>('cash');

  const isClientDebtMode = mode === 'client_debt';
  const debt = !isClientDebtMode ? debts.find(d => d.id === debtId) : null;
  const clientDebtInfo = isClientDebtMode && clientId ? getClientDebtInfo(clientId) : null;
  const displayDebt = isClientDebtMode ? (clientDebtInfo?.totalAmount ?? (Number(totalDebt) || 0)) : (debt?.remainingAmount ?? (Number(totalDebt) || 0));

  const handlePay = useCallback(() => {
    if (!isAdmin && shiftRequired) {
      Alert.alert('Смена не открыта', 'Откройте смену, чтобы принять оплату.');
      return;
    }
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      Alert.alert('Ошибка', 'Введите сумму');
      return;
    }

    if (isClientDebtMode && clientId) {
      payClientDebt(clientId, numAmount, method);
      const remaining = displayDebt - numAmount;
      if (remaining <= 0) {
        Alert.alert('Готово', 'Долг полностью погашен');
      } else {
        Alert.alert('Готово', `Оплачено ${numAmount} ₽. Остаток: ${Math.max(0, remaining)} ₽`);
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
          <Text style={styles.debtBadgeText}>Долг: {displayDebt} ₽</Text>
        </View>
      </View>

      <Text style={styles.label}>Сумма оплаты (₽)</Text>
      <TextInput
        style={styles.amountInput}
        value={amount}
        onChangeText={setAmount}
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
            style={styles.quickBtn}
            onPress={() => setAmount(String(v))}
          >
            <Text style={styles.quickBtnText}>{v} ₽</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Способ оплаты</Text>
      <View style={styles.methodRow}>
        <TouchableOpacity
          style={[styles.methodBtn, method === 'cash' && styles.methodBtnActive]}
          onPress={() => setMethod('cash')}
        >
          <Wallet size={18} color={method === 'cash' ? Colors.white : Colors.textSecondary} />
          <Text style={[styles.methodBtnText, method === 'cash' && styles.methodBtnTextActive]}>Наличные</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.methodBtn, method === 'card' && styles.methodBtnActive]}
          onPress={() => setMethod('card')}
        >
          <Wallet size={18} color={method === 'card' ? Colors.white : Colors.textSecondary} />
          <Text style={[styles.methodBtnText, method === 'card' && styles.methodBtnTextActive]}>Безнал</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.payBtn} onPress={handlePay} activeOpacity={0.7}>
        <Check size={20} color={Colors.white} />
        <Text style={styles.payBtnText}>Погасить</Text>
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
    alignItems: 'center',
    marginBottom: 24,
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
    textAlign: 'center',
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    justifyContent: 'center',
  },
  quickBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  quickBtnText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.primary,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 10,
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
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
