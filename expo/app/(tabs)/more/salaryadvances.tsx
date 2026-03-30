import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, Alert, Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import {
  Briefcase, Plus, CreditCard, ChevronDown, ChevronUp,
  X, Users, Banknote, ArrowDownCircle, ArrowUpCircle,
  Clock, AlertTriangle, Wallet, Building2,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { useAuth } from '@/providers/AuthProvider';
import { formatDateTime } from '@/utils/date';
import { PaymentMethod } from '@/types';

type SalaryTab = 'debts' | 'issue' | 'pay' | 'history';
type CashSource = 'admin' | 'manager_shift';

export default function SalaryAdvancesScreen() {
  const { isAdmin } = useAuth();
  const {
    users, salaryAdvances, salaryPayments,
    issueSalaryAdvance, paySalary, getEmployeeSalaryDebt, employeeSalaryDebts,
    getAdminFinanceBalance, getActiveManagerShift, getShiftCashBalance,
  } = useParking();

  const [tab, setTab] = useState<SalaryTab>('debts');

  const [issueEmployeeId, setIssueEmployeeId] = useState<string>('');
  const [issueAmount, setIssueAmount] = useState<string>('');
  const [issueComment, setIssueComment] = useState<string>('');
  const [issueMethod, setIssueMethod] = useState<PaymentMethod>('cash');
  const [issueSource, setIssueSource] = useState<CashSource>('admin');
  const [showEmployeePicker, setShowEmployeePicker] = useState<boolean>(false);

  const [payEmployeeId, setPayEmployeeId] = useState<string>('');
  const [payGrossAmount, setPayGrossAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [paySource, setPaySource] = useState<CashSource>('admin');
  const [payComment, setPayComment] = useState<string>('');
  const [showPayEmployeePicker, setShowPayEmployeePicker] = useState<boolean>(false);

  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  const activeUsers = useMemo(() =>
    users.filter(u => u.active && !u.deleted),
  [users]);

  const selectedIssueEmployee = useMemo(() =>
    activeUsers.find(u => u.id === issueEmployeeId),
  [activeUsers, issueEmployeeId]);

  const selectedPayEmployee = useMemo(() =>
    activeUsers.find(u => u.id === payEmployeeId),
  [activeUsers, payEmployeeId]);

  const payEmployeeDebt = useMemo(() => {
    if (!payEmployeeId) return 0;
    return getEmployeeSalaryDebt(payEmployeeId);
  }, [payEmployeeId, getEmployeeSalaryDebt]);

  const payDeduction = useMemo(() => {
    const gross = Number(payGrossAmount) || 0;
    return Math.min(gross, payEmployeeDebt);
  }, [payGrossAmount, payEmployeeDebt]);

  const payNet = useMemo(() => {
    const gross = Number(payGrossAmount) || 0;
    return Math.max(0, gross - payDeduction);
  }, [payGrossAmount, payDeduction]);

  const debtsWithBalance = useMemo(() =>
    employeeSalaryDebts.filter(e => e.remaining > 0),
  [employeeSalaryDebts]);

  const adminFinBal = useMemo(() => getAdminFinanceBalance(), [getAdminFinanceBalance]);

  const managerShift = useMemo(() => getActiveManagerShift(), [getActiveManagerShift]);

  const managerShiftBalance = useMemo(() => {
    if (!managerShift) return 0;
    return getShiftCashBalance(managerShift);
  }, [managerShift, getShiftCashBalance]);

  const getSourceBalance = useCallback((source: CashSource, method: PaymentMethod): number => {
    if (source === 'manager_shift') {
      return managerShiftBalance;
    }
    return method === 'cash' ? adminFinBal.cash : adminFinBal.card;
  }, [adminFinBal, managerShiftBalance]);

  const getSourceLabel = useCallback((source: CashSource, method: PaymentMethod): string => {
    if (source === 'manager_shift') {
      return `Касса менеджера${managerShift ? ` (${managerShift.operatorName})` : ''}`;
    }
    return method === 'cash' ? 'Финансы админа (наличные)' : 'Финансы админа (безнал)';
  }, [managerShift]);

  const handleIssue = useCallback((forceNegative?: boolean) => {
    const amount = Math.round(Number(issueAmount) || 0);
    if (!issueEmployeeId) {
      Alert.alert('Ошибка', 'Выберите сотрудника');
      return;
    }
    if (!amount || amount <= 0) {
      Alert.alert('Ошибка', 'Укажите сумму');
      return;
    }
    if (issueSource === 'manager_shift' && !managerShift) {
      Alert.alert('Ошибка', 'Нет открытой смены менеджера для списания');
      return;
    }
    const employee = activeUsers.find(u => u.id === issueEmployeeId);
    if (!employee) {
      Alert.alert('Ошибка', 'Сотрудник не найден');
      return;
    }
    const result = issueSalaryAdvance(employee.id, employee.name, amount, issueComment.trim(), forceNegative, issueMethod, issueSource);
    if (result && !result.success) {
      if (result.wouldGoNegative) {
        const balAfter = (result.currentBalance ?? 0) - amount;
        Alert.alert(
          '⚠️ КАССА УЙДЁТ В МИНУС!',
          `Источник: ${getSourceLabel(issueSource, issueMethod)}\nТекущий остаток: ${result.currentBalance} ₽\nВыдаёте: ${amount} ₽\nБудет: ${balAfter} ₽`,
          [
            { text: 'Отмена', style: 'cancel' },
            { text: '⚠️ Разрешить минус', style: 'destructive', onPress: () => handleIssue(true) },
          ]
        );
        return;
      }
      Alert.alert('Ошибка', result.error ?? 'Не удалось выдать');
      return;
    }
    setIssueEmployeeId('');
    setIssueAmount('');
    setIssueComment('');
    Alert.alert('Готово', `Выдано в долг под ЗП: ${amount} ₽ — ${employee.name}\nИсточник: ${getSourceLabel(issueSource, issueMethod)}`);
    setTab('debts');
  }, [issueEmployeeId, issueAmount, issueComment, issueMethod, issueSource, activeUsers, issueSalaryAdvance, managerShift, getSourceLabel]);

  const handlePay = useCallback((forceNegative?: boolean) => {
    const gross = Math.round(Number(payGrossAmount) || 0);
    if (!payEmployeeId) {
      Alert.alert('Ошибка', 'Выберите сотрудника');
      return;
    }
    if (!gross || gross <= 0) {
      Alert.alert('Ошибка', 'Укажите начисленную сумму');
      return;
    }
    if (paySource === 'manager_shift' && !managerShift && payNet > 0) {
      Alert.alert('Ошибка', 'Нет открытой смены менеджера для списания');
      return;
    }
    const employee = activeUsers.find(u => u.id === payEmployeeId);
    if (!employee) {
      Alert.alert('Ошибка', 'Сотрудник не найден');
      return;
    }

    const sourceInfo = payNet > 0 ? `\nИсточник: ${getSourceLabel(paySource, payMethod)}` : '';
    const confirmMsg = payDeduction > 0
      ? `Начислено: ${gross} ₽\nЗачтено долга: ${payDeduction} ₽\nК выдаче: ${payNet} ₽ (${payMethod === 'cash' ? 'наличные' : 'безнал'})${sourceInfo}`
      : `К выдаче: ${gross} ₽ (${payMethod === 'cash' ? 'наличные' : 'безнал'})${sourceInfo}`;

    Alert.alert('Подтверждение', `Выплата зарплаты: ${employee.name}\n\n${confirmMsg}`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выплатить',
        onPress: () => {
          const result = paySalary(employee.id, employee.name, gross, payMethod, payComment.trim(), forceNegative, paySource);
          if (result && !result.success) {
            if (result.wouldGoNegative) {
              const balAfter = (result.currentBalance ?? 0) - (result.netPaid ?? payNet);
              Alert.alert(
                '⚠️ КАССА УЙДЁТ В МИНУС!',
                `Источник: ${getSourceLabel(paySource, payMethod)}\nТекущий остаток: ${result.currentBalance} ₽\nК выдаче: ${result.netPaid ?? payNet} ₽\nБудет: ${balAfter} ₽`,
                [
                  { text: 'Отмена', style: 'cancel' },
                  { text: '⚠️ Разрешить минус', style: 'destructive', onPress: () => handlePay(true) },
                ]
              );
              return;
            }
            Alert.alert('Ошибка', result.error ?? 'Не удалось выплатить');
            return;
          }
          setPayEmployeeId('');
          setPayGrossAmount('');
          setPayComment('');
          setPayMethod('cash');
          Alert.alert('Готово', payNet > 0
            ? `Выплачено ${payNet} ₽ — ${employee.name}${payDeduction > 0 ? `\nДолг зачтён: ${payDeduction} ₽` : ''}`
            : `Вся сумма ${gross} ₽ зачтена в погашение долга — ${employee.name}`
          );
        },
      },
    ]);
  }, [payEmployeeId, payGrossAmount, payMethod, paySource, payComment, payDeduction, payNet, activeUsers, paySalary, managerShift, getSourceLabel]);

  const tabs: { key: SalaryTab; label: string }[] = [
    { key: 'debts', label: 'Долги' },
    { key: 'issue', label: 'Выдать' },
    { key: 'pay', label: 'ЗП' },
    { key: 'history', label: 'История' },
  ];

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <AlertTriangle size={40} color={Colors.warning} />
          <Text style={styles.emptyText}>Доступно только администратору</Text>
        </View>
      </View>
    );
  }

  const renderEmployeePicker = (
    visible: boolean,
    onClose: () => void,
    onSelect: (id: string) => void,
  ) => (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.pickerContent}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Выберите сотрудника</Text>
                <TouchableOpacity onPress={onClose}>
                  <X size={22} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.pickerList}>
                {activeUsers.map(u => (
                  <TouchableOpacity
                    key={u.id}
                    style={styles.pickerItem}
                    onPress={() => {
                      onSelect(u.id);
                      onClose();
                    }}
                  >
                    <View style={styles.pickerItemIcon}>
                      <Users size={16} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerItemName}>{u.name}</Text>
                      <Text style={styles.pickerItemRole}>
                        {u.role === 'admin' ? 'Администратор' : 'Менеджер'}
                      </Text>
                    </View>
                    {getEmployeeSalaryDebt(u.id) > 0 && (
                      <Text style={styles.pickerItemDebt}>
                        Долг: {getEmployeeSalaryDebt(u.id)} ₽
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
                {activeUsers.length === 0 && (
                  <Text style={styles.pickerEmpty}>Нет активных сотрудников</Text>
                )}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  const renderSourceSelector = (
    source: CashSource,
    setSource: (s: CashSource) => void,
    method: PaymentMethod,
  ) => (
    <View>
      <Text style={styles.inputLabel}>Источник списания</Text>
      <View style={styles.sourceRow}>
        <TouchableOpacity
          style={[styles.sourceBtn, source === 'admin' && styles.sourceBtnActive]}
          onPress={() => setSource('admin')}
          activeOpacity={0.7}
        >
          <Building2 size={16} color={source === 'admin' ? Colors.white : Colors.text} />
          <View style={styles.sourceBtnContent}>
            <Text style={[styles.sourceBtnText, source === 'admin' && styles.sourceBtnTextActive]}>
              Финансы админа
            </Text>
            <Text style={[styles.sourceBtnBalance, source === 'admin' && styles.sourceBtnBalanceActive]}>
              {method === 'cash' ? adminFinBal.cash : adminFinBal.card} ₽
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sourceBtn,
            source === 'manager_shift' && styles.sourceBtnActive,
            !managerShift && styles.sourceBtnDisabled,
          ]}
          onPress={() => {
            if (managerShift) setSource('manager_shift');
            else Alert.alert('Недоступно', 'Нет открытой смены менеджера');
          }}
          activeOpacity={managerShift ? 0.7 : 1}
        >
          <Wallet size={16} color={source === 'manager_shift' ? Colors.white : (!managerShift ? Colors.textMuted : Colors.text)} />
          <View style={styles.sourceBtnContent}>
            <Text style={[
              styles.sourceBtnText,
              source === 'manager_shift' && styles.sourceBtnTextActive,
              !managerShift && styles.sourceBtnTextDisabled,
            ]}>
              Касса менеджера
            </Text>
            <Text style={[
              styles.sourceBtnBalance,
              source === 'manager_shift' && styles.sourceBtnBalanceActive,
              !managerShift && styles.sourceBtnTextDisabled,
            ]}>
              {managerShift ? `${managerShiftBalance} ₽` : 'нет смены'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {source === 'admin' && (
        <View style={styles.sourceInfoBanner}>
          <Building2 size={14} color={Colors.info} />
          <Text style={styles.sourceInfoText}>
            Остаток ({method === 'cash' ? 'нал' : 'безнал'}): {method === 'cash' ? adminFinBal.cash : adminFinBal.card} ₽
          </Text>
        </View>
      )}
      {source === 'manager_shift' && managerShift && (
        <View style={styles.sourceInfoBanner}>
          <Wallet size={14} color={Colors.info} />
          <Text style={styles.sourceInfoText}>
            Касса {managerShift.operatorName}: {managerShiftBalance} ₽
          </Text>
        </View>
      )}
    </View>
  );

  const renderMethodSelector = (
    method: PaymentMethod,
    setMethod: (m: PaymentMethod) => void,
    source: CashSource,
  ) => (
    <View>
      <Text style={styles.inputLabel}>Способ оплаты</Text>
      <View style={styles.methodRow}>
        <TouchableOpacity
          style={[styles.methodBtn, method === 'cash' && styles.methodBtnActive]}
          onPress={() => setMethod('cash')}
        >
          <Banknote size={16} color={method === 'cash' ? Colors.white : Colors.text} />
          <Text style={[styles.methodBtnText, method === 'cash' && styles.methodBtnTextActive]}>
            Наличные
          </Text>
        </TouchableOpacity>
        {source !== 'manager_shift' && (
          <TouchableOpacity
            style={[styles.methodBtn, method === 'card' && styles.methodBtnActive]}
            onPress={() => setMethod('card')}
          >
            <CreditCard size={16} color={method === 'card' ? Colors.white : Colors.text} />
            <Text style={[styles.methodBtnText, method === 'card' && styles.methodBtnTextActive]}>
              Безнал
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabsRow}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabBtnText, tab === t.key && styles.tabBtnTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {tab === 'debts' && (
          <View>
            <View style={styles.summaryCard}>
              <Briefcase size={24} color={Colors.primary} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.summaryLabel}>Всего долгов под ЗП</Text>
                <Text style={styles.summaryValue}>
                  {Math.round(debtsWithBalance.reduce((s, e) => s + e.remaining, 0))} ₽
                </Text>
              </View>
              <Text style={styles.summaryCount}>{debtsWithBalance.length} чел.</Text>
            </View>

            {debtsWithBalance.length === 0 ? (
              <View style={styles.emptyState}>
                <Briefcase size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Нет долгов сотрудников под ЗП</Text>
              </View>
            ) : (
              debtsWithBalance.map(emp => {
                const isExpanded = expandedEmployeeId === emp.employeeId;
                const advances = salaryAdvances.filter(
                  a => a.employeeId === emp.employeeId && a.remainingAmount > 0
                );
                return (
                  <TouchableOpacity
                    key={emp.employeeId}
                    style={styles.debtCard}
                    onPress={() => setExpandedEmployeeId(isExpanded ? null : emp.employeeId)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.debtCardHeader}>
                      <View style={styles.debtCardLeft}>
                        <View style={styles.debtCardIcon}>
                          <Users size={18} color={Colors.danger} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.debtCardName}>{emp.employeeName}</Text>
                          <Text style={styles.debtCardMeta}>
                            Выдано: {emp.totalIssued} ₽ • Погашено: {emp.totalRepaid} ₽
                          </Text>
                        </View>
                      </View>
                      <View style={styles.debtCardRight}>
                        <Text style={styles.debtCardAmount}>{emp.remaining} ₽</Text>
                        {isExpanded ? (
                          <ChevronUp size={16} color={Colors.textMuted} />
                        ) : (
                          <ChevronDown size={16} color={Colors.textMuted} />
                        )}
                      </View>
                    </View>

                    {isExpanded && advances.length > 0 && (
                      <View style={styles.debtDetails}>
                        {advances.map(a => (
                          <View key={a.id} style={styles.advanceRow}>
                            <View style={styles.advanceIconWrap}>
                              <ArrowDownCircle size={14} color={Colors.danger} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.advanceDesc}>
                                {a.amount} ₽ → осталось {a.remainingAmount} ₽
                              </Text>
                              <Text style={styles.advanceMeta}>
                                {formatDateTime(a.issuedAt)} • {a.issuedByName}
                                {a.comment ? ` • ${a.comment}` : ''}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setTab('issue')}
              activeOpacity={0.7}
            >
              <Plus size={18} color={Colors.white} />
              <Text style={styles.actionBtnText}>Выдать в долг под ЗП</Text>
            </TouchableOpacity>
          </View>
        )}

        {tab === 'issue' && (
          <View>
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Выдача в долг под зарплату</Text>
              <Text style={styles.formHint}>
                Сумма будет списана из выбранной кассы. Долг сотрудника увеличится.
              </Text>

              <Text style={styles.inputLabel}>Сотрудник</Text>
              <TouchableOpacity
                style={styles.selectField}
                onPress={() => setShowEmployeePicker(true)}
              >
                <Text style={selectedIssueEmployee ? styles.selectFieldText : styles.selectFieldPlaceholder}>
                  {selectedIssueEmployee?.name ?? 'Выберите сотрудника'}
                </Text>
                <ChevronDown size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {selectedIssueEmployee && getEmployeeSalaryDebt(selectedIssueEmployee.id) > 0 && (
                <View style={styles.currentDebtBanner}>
                  <AlertTriangle size={14} color={Colors.danger} />
                  <Text style={styles.currentDebtText}>
                    Текущий долг: {getEmployeeSalaryDebt(selectedIssueEmployee.id)} ₽
                  </Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Сумма</Text>
              <TextInput
                style={styles.input}
                value={issueAmount}
                onChangeText={setIssueAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
              />

              {renderSourceSelector(issueSource, (s) => {
                setIssueSource(s);
                if (s === 'manager_shift') setIssueMethod('cash');
              }, issueMethod)}

              {renderMethodSelector(issueMethod, setIssueMethod, issueSource)}

              {Number(issueAmount) > 0 && (
                <View style={styles.balanceCheckCard}>
                  <View style={styles.balanceCheckRow}>
                    <Text style={styles.balanceCheckLabel}>Остаток на кассе:</Text>
                    <Text style={styles.balanceCheckValue}>
                      {getSourceBalance(issueSource, issueMethod)} ₽
                    </Text>
                  </View>
                  <View style={styles.balanceCheckRow}>
                    <Text style={styles.balanceCheckLabel}>Выдаёте:</Text>
                    <Text style={[styles.balanceCheckValue, { color: Colors.danger }]}>
                      −{Number(issueAmount)} ₽
                    </Text>
                  </View>
                  <View style={[styles.balanceCheckRow, styles.balanceCheckRowTotal]}>
                    <Text style={styles.balanceCheckLabelBold}>После выдачи:</Text>
                    <Text style={[
                      styles.balanceCheckValueBold,
                      { color: getSourceBalance(issueSource, issueMethod) - Number(issueAmount) < 0 ? Colors.danger : Colors.success },
                    ]}>
                      {getSourceBalance(issueSource, issueMethod) - Number(issueAmount)} ₽
                    </Text>
                  </View>
                </View>
              )}

              <Text style={styles.inputLabel}>Комментарий</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={issueComment}
                onChangeText={setIssueComment}
                placeholder="Аванс до зарплаты..."
                placeholderTextColor={Colors.textMuted}
                multiline
              />

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={() => handleIssue()}
                activeOpacity={0.7}
              >
                <ArrowDownCircle size={18} color={Colors.white} />
                <Text style={styles.submitBtnText}>
                  Выдать в долг{Number(issueAmount) > 0 ? ` ${Number(issueAmount)} ₽` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {tab === 'pay' && (
          <View>
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Выплата зарплаты</Text>
              <Text style={styles.formHint}>
                Если у сотрудника есть долг под ЗП — он будет автоматически зачтён.
              </Text>

              <Text style={styles.inputLabel}>Сотрудник</Text>
              <TouchableOpacity
                style={styles.selectField}
                onPress={() => setShowPayEmployeePicker(true)}
              >
                <Text style={selectedPayEmployee ? styles.selectFieldText : styles.selectFieldPlaceholder}>
                  {selectedPayEmployee?.name ?? 'Выберите сотрудника'}
                </Text>
                <ChevronDown size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {selectedPayEmployee && payEmployeeDebt > 0 && (
                <View style={styles.currentDebtBanner}>
                  <AlertTriangle size={14} color={Colors.danger} />
                  <Text style={styles.currentDebtText}>
                    Долг под ЗП: {payEmployeeDebt} ₽ — будет зачтён первым
                  </Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Начисленная зарплата</Text>
              <TextInput
                style={styles.input}
                value={payGrossAmount}
                onChangeText={setPayGrossAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
              />

              {payEmployeeDebt > 0 && Number(payGrossAmount) > 0 && (
                <View style={styles.distributionCard}>
                  <Text style={styles.distributionTitle}>Распределение</Text>
                  <View style={styles.distributionRow}>
                    <Text style={styles.distributionLabel}>Зачтено долга:</Text>
                    <Text style={[styles.distributionValue, { color: Colors.danger }]}>
                      {payDeduction} ₽
                    </Text>
                  </View>
                  <View style={styles.distributionRow}>
                    <Text style={styles.distributionLabel}>К выдаче:</Text>
                    <Text style={[styles.distributionValue, { color: Colors.success, fontWeight: '700' as const }]}>
                      {payNet} ₽
                    </Text>
                  </View>
                  {payEmployeeDebt - payDeduction > 0 && (
                    <View style={styles.distributionRow}>
                      <Text style={styles.distributionLabel}>Остаток долга:</Text>
                      <Text style={[styles.distributionValue, { color: Colors.warning }]}>
                        {payEmployeeDebt - payDeduction} ₽
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {payNet > 0 && (
                <>
                  {renderSourceSelector(paySource, (s) => {
                    setPaySource(s);
                    if (s === 'manager_shift') setPayMethod('cash');
                  }, payMethod)}

                  {renderMethodSelector(payMethod, setPayMethod, paySource)}

                  {Number(payGrossAmount) > 0 && (
                    <View style={styles.balanceCheckCard}>
                      <View style={styles.balanceCheckRow}>
                        <Text style={styles.balanceCheckLabel}>Остаток на кассе:</Text>
                        <Text style={styles.balanceCheckValue}>
                          {getSourceBalance(paySource, payMethod)} ₽
                        </Text>
                      </View>
                      <View style={styles.balanceCheckRow}>
                        <Text style={styles.balanceCheckLabel}>К выдаче:</Text>
                        <Text style={[styles.balanceCheckValue, { color: Colors.danger }]}>
                          −{payNet} ₽
                        </Text>
                      </View>
                      <View style={[styles.balanceCheckRow, styles.balanceCheckRowTotal]}>
                        <Text style={styles.balanceCheckLabelBold}>После выдачи:</Text>
                        <Text style={[
                          styles.balanceCheckValueBold,
                          { color: getSourceBalance(paySource, payMethod) - payNet < 0 ? Colors.danger : Colors.success },
                        ]}>
                          {getSourceBalance(paySource, payMethod) - payNet} ₽
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              )}

              {payNet <= 0 && Number(payGrossAmount) > 0 && (
                <View style={styles.sourceInfoBanner}>
                  <Wallet size={14} color={Colors.info} />
                  <Text style={styles.sourceInfoText}>
                    Вся сумма зачтена в погашение долга — деньги из кассы не списываются
                  </Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Комментарий</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={payComment}
                onChangeText={setPayComment}
                placeholder="За март 2026..."
                placeholderTextColor={Colors.textMuted}
                multiline
              />

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: Colors.success }]}
                onPress={() => handlePay()}
                activeOpacity={0.7}
              >
                <ArrowUpCircle size={18} color={Colors.white} />
                <Text style={styles.submitBtnText}>
                  Выплатить зарплату{Number(payGrossAmount) > 0 ? ` ${Number(payGrossAmount)} ₽` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {tab === 'history' && (
          <View>
            <Text style={styles.sectionTitle}>Выплаты зарплат</Text>
            {salaryPayments.length === 0 ? (
              <View style={styles.emptyState}>
                <Clock size={32} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Нет истории выплат</Text>
              </View>
            ) : (
              salaryPayments.slice(0, 50).map(sp => (
                <View key={sp.id} style={styles.historyCard}>
                  <View style={styles.historyCardHeader}>
                    <View style={[styles.historyIcon, { backgroundColor: Colors.successLight }]}>
                      <ArrowUpCircle size={16} color={Colors.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyName}>{sp.employeeName}</Text>
                      <Text style={styles.historyDate}>{formatDateTime(sp.paidAt)}</Text>
                    </View>
                    <Text style={styles.historyAmount}>{sp.grossAmount} ₽</Text>
                  </View>
                  <View style={styles.historyDetails}>
                    {sp.debtDeducted > 0 && (
                      <Text style={styles.historyDetail}>
                        Зачтено долга: {sp.debtDeducted} ₽
                      </Text>
                    )}
                    <Text style={styles.historyDetail}>
                      К выдаче: {sp.netPaid} ₽ ({sp.method === 'cash' ? 'наличные' : 'безнал'})
                    </Text>
                    {sp.comment ? (
                      <Text style={styles.historyDetail}>{sp.comment}</Text>
                    ) : null}
                    <Text style={styles.historyMeta}>Провёл: {sp.paidByName}</Text>
                  </View>
                </View>
              ))
            )}

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Выдачи в долг под ЗП</Text>
            {salaryAdvances.length === 0 ? (
              <View style={styles.emptyState}>
                <Clock size={32} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Нет истории выдач</Text>
              </View>
            ) : (
              salaryAdvances.slice(0, 50).map(sa => (
                <View key={sa.id} style={styles.historyCard}>
                  <View style={styles.historyCardHeader}>
                    <View style={[styles.historyIcon, { backgroundColor: Colors.dangerLight }]}>
                      <ArrowDownCircle size={16} color={Colors.danger} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyName}>{sa.employeeName}</Text>
                      <Text style={styles.historyDate}>{formatDateTime(sa.issuedAt)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' as const }}>
                      <Text style={[styles.historyAmount, { color: Colors.danger }]}>
                        {sa.amount} ₽
                      </Text>
                      {sa.remainingAmount < sa.amount && (
                        <Text style={styles.historyRemaining}>
                          Осталось: {sa.remainingAmount} ₽
                        </Text>
                      )}
                    </View>
                  </View>
                  {sa.comment ? (
                    <View style={styles.historyDetails}>
                      <Text style={styles.historyDetail}>{sa.comment}</Text>
                      <Text style={styles.historyMeta}>Выдал: {sa.issuedByName}</Text>
                    </View>
                  ) : (
                    <View style={styles.historyDetails}>
                      <Text style={styles.historyMeta}>Выдал: {sa.issuedByName}</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {renderEmployeePicker(showEmployeePicker, () => setShowEmployeePicker(false), (id) => setIssueEmployeeId(id))}
      {renderEmployeePicker(showPayEmployeePicker, () => setShowPayEmployeePicker(false), (id) => setPayEmployeeId(id))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: Colors.primary,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.textMuted,
  },
  tabBtnTextActive: {
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.text,
    marginTop: 2,
  },
  summaryCount: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500' as const,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  debtCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 10,
    overflow: 'hidden',
  },
  debtCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    justifyContent: 'space-between',
  },
  debtCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  debtCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  debtCardName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  debtCardMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  debtCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  debtCardAmount: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
  debtDetails: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 12,
    gap: 8,
  },
  advanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  advanceIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: Colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  advanceDesc: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  advanceMeta: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginTop: 8,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  formCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  formHint: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 16,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputMultiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectFieldText: {
    fontSize: 15,
    color: Colors.text,
  },
  selectFieldPlaceholder: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  currentDebtBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dangerLight,
    borderRadius: 8,
    padding: 10,
    gap: 8,
    marginTop: 8,
  },
  currentDebtText: {
    fontSize: 13,
    color: Colors.danger,
    fontWeight: '600' as const,
  },
  distributionCard: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  distributionTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  distributionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  distributionLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  distributionValue: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  sourceRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sourceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBg,
  },
  sourceBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  sourceBtnDisabled: {
    opacity: 0.5,
  },
  sourceBtnContent: {
    flex: 1,
  },
  sourceBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  sourceBtnTextActive: {
    color: Colors.white,
  },
  sourceBtnTextDisabled: {
    color: Colors.textMuted,
  },
  sourceBtnBalance: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  sourceBtnBalanceActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  sourceInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.infoLight,
    borderRadius: 8,
    padding: 10,
    gap: 8,
    marginTop: 8,
  },
  sourceInfoText: {
    fontSize: 12,
    color: Colors.info,
    fontWeight: '500' as const,
    flex: 1,
  },
  balanceCheckCard: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  balanceCheckRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  balanceCheckRowTotal: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 4,
    paddingTop: 6,
  },
  balanceCheckLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  balanceCheckValue: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  balanceCheckLabelBold: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  balanceCheckValueBold: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
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
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBg,
  },
  methodBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  methodBtnText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  methodBtnTextActive: {
    color: Colors.white,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginTop: 20,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 10,
  },
  historyCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 8,
    overflow: 'hidden',
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  historyIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  historyDate: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  historyRemaining: {
    fontSize: 11,
    color: Colors.warning,
    fontWeight: '500' as const,
  },
  historyDetails: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  historyDetail: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  historyMeta: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  pickerContent: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  pickerList: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pickerItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerItemName: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  pickerItemRole: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  pickerItemDebt: {
    fontSize: 12,
    color: Colors.danger,
    fontWeight: '600' as const,
  },
  pickerEmpty: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
