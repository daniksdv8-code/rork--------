import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, Alert, Modal, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, MinusCircle,
  Plus, X, CreditCard, Banknote, Trash2, Edit3,
  Briefcase,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { useAuth } from '@/providers/AuthProvider';
import { formatDateTime } from '@/utils/date';
import { formatMoney } from '@/utils/money';
import { PaymentMethod } from '@/types';

type FinanceTab = 'dashboard' | 'admin_register' | 'manager_register';
type PeriodKey = 'today' | 'week' | 'month' | 'all';

function getPeriodDates(period: PeriodKey): { from?: Date; to?: Date } {
  const now = new Date();
  if (period === 'today') {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from };
  } else if (period === 'week') {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from };
  } else if (period === 'month') {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 1);
    return { from };
  }
  return {};
}

export default function FinanceScreen() {
  const { isAdmin } = useAuth();
  const {
    withdrawals, expenses, transactions, adminExpenses,
    withdrawCash, addAdminExpense,
    addExpenseCategory, updateExpenseCategory, deleteExpenseCategory,
    getManagerCategories, getAdminCategories,
    getManagerCashRegister, getAdminCashRegister,
    getAdminFinanceBalance, salaryAdvances, salaryPayments,
  } = useParking();

  const [tab, setTab] = useState<FinanceTab>('dashboard');
  const [period, setPeriod] = useState<PeriodKey>('today');

  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [withdrawNotes, setWithdrawNotes] = useState<string>('');

  const [showAdminExpenseModal, setShowAdminExpenseModal] = useState<boolean>(false);
  const [adminExpAmount, setAdminExpAmount] = useState<string>('');
  const [adminExpCategory, setAdminExpCategory] = useState<string>('');
  const [adminExpDesc, setAdminExpDesc] = useState<string>('');
  const [adminExpMethod, setAdminExpMethod] = useState<PaymentMethod>('cash');

  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
  const [categoryName, setCategoryName] = useState<string>('');
  const [categoryOwner, setCategoryOwner] = useState<'admin' | 'manager'>('admin');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const periodDates = useMemo(() => getPeriodDates(period), [period]);
  const managerReg = useMemo(
    () => getManagerCashRegister(periodDates.from, periodDates.to),
    [getManagerCashRegister, periodDates]
  );
  const adminReg = useMemo(
    () => getAdminCashRegister(periodDates.from, periodDates.to),
    [getAdminCashRegister, periodDates]
  );
  const adminFinBal = useMemo(() => getAdminFinanceBalance(), [getAdminFinanceBalance]);

  const salaryStats = useMemo(() => {
    const totalAdvances = salaryAdvances.reduce((s, a) => s + a.amount, 0);
    const totalRemaining = salaryAdvances.filter(a => a.remainingAmount > 0).reduce((s, a) => s + a.remainingAmount, 0);
    const totalSalaryPaid = salaryPayments.reduce((s, p) => s + p.netPaid, 0);
    return { totalAdvances, totalRemaining, totalSalaryPaid };
  }, [salaryAdvances, salaryPayments]);

  const handleWithdraw = useCallback(() => {
    const amount = Number(withdrawAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Ошибка', 'Укажите сумму');
      return;
    }
    withdrawCash(amount, withdrawNotes.trim());
    setShowWithdrawModal(false);
    setWithdrawAmount('');
    setWithdrawNotes('');
    Alert.alert('Готово', `Снято с кассы менеджера: ${amount} ₽`);
  }, [withdrawAmount, withdrawNotes, withdrawCash]);

  const handleAddAdminExpense = useCallback(() => {
    const amount = Number(adminExpAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Ошибка', 'Укажите сумму расхода');
      return;
    }
    if (!adminExpDesc.trim()) {
      Alert.alert('Ошибка', 'Укажите описание расхода');
      return;
    }
    addAdminExpense(amount, adminExpCategory.trim() || 'Прочее', adminExpDesc.trim(), adminExpMethod);
    setShowAdminExpenseModal(false);
    setAdminExpAmount('');
    setAdminExpCategory('');
    setAdminExpDesc('');
    setAdminExpMethod('cash');
    Alert.alert('Готово', `Расход добавлен: ${amount} ₽`);
  }, [adminExpAmount, adminExpCategory, adminExpDesc, adminExpMethod, addAdminExpense]);

  const handleSaveCategory = useCallback(() => {
    if (!categoryName.trim()) {
      Alert.alert('Ошибка', 'Укажите название категории');
      return;
    }
    if (editingCategoryId) {
      updateExpenseCategory(editingCategoryId, categoryName.trim());
    } else {
      addExpenseCategory(categoryName.trim(), categoryOwner);
    }
    setShowCategoryModal(false);
    setCategoryName('');
    setEditingCategoryId(null);
  }, [categoryName, categoryOwner, editingCategoryId, addExpenseCategory, updateExpenseCategory]);

  const handleDeleteCategory = useCallback((id: string, name: string) => {
    Alert.alert('Удалить категорию?', `«${name}» будет удалена.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteExpenseCategory(id) },
    ]);
  }, [deleteExpenseCategory]);

  const allManagerOps = useMemo(() => {
    const { from, to } = periodDates;
    const filterDate = (d: string) => {
      const date = new Date(d);
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    };

    type OpItem = {
      id: string;
      date: string;
      type: 'income_cash' | 'income_card' | 'expense' | 'withdrawal' | 'refund';
      amount: number;
      description: string;
      operator: string;
      status?: string;
    };

    const ops: OpItem[] = [];

    const periodTx = transactions.filter(t => filterDate(t.date));

    periodTx.filter(t =>
      (t.type === 'payment' || t.type === 'debt_payment') && t.amount > 0 && t.method === 'cash'
    ).forEach(t => {
      ops.push({
        id: t.id,
        date: t.date,
        type: 'income_cash',
        amount: t.amount,
        description: t.description,
        operator: t.operatorName,
        status: 'Активно в кассе',
      });
    });

    periodTx.filter(t =>
      (t.type === 'payment' || t.type === 'debt_payment') && t.amount > 0 && t.method === 'card'
    ).forEach(t => {
      ops.push({
        id: t.id,
        date: t.date,
        type: 'income_card',
        amount: t.amount,
        description: t.description,
        operator: t.operatorName,
        status: 'Передано Администратору',
      });
    });

    periodTx.filter(t => t.type === 'refund' && t.method === 'cash').forEach(t => {
      ops.push({
        id: t.id + '_refund',
        date: t.date,
        type: 'refund',
        amount: t.amount,
        description: t.description,
        operator: t.operatorName,
      });
    });

    expenses.filter(e => filterDate(e.date)).forEach(e => {
      ops.push({
        id: e.id,
        date: e.date,
        type: 'expense',
        amount: e.amount,
        description: `${e.category}: ${e.description}`,
        operator: e.operatorName,
      });
    });

    withdrawals.filter(w => filterDate(w.date)).forEach(w => {
      ops.push({
        id: w.id,
        date: w.date,
        type: 'withdrawal',
        amount: w.amount,
        description: w.notes || 'Снятие администратором',
        operator: w.operatorName,
      });
    });

    return ops.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, expenses, withdrawals, periodDates]);

  const allAdminOps = useMemo(() => {
    const { from, to } = periodDates;
    const filterDate = (d: string) => {
      const date = new Date(d);
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    };

    type OpItem = {
      id: string;
      date: string;
      type: 'card_income' | 'cash_from_manager' | 'admin_expense' | 'salary_advance' | 'salary_payment';
      amount: number;
      method: string;
      description: string;
      operator: string;
    };

    const ops: OpItem[] = [];

    const periodTx = transactions.filter(t => filterDate(t.date));

    periodTx.filter(t =>
      (t.type === 'payment' || t.type === 'debt_payment') && t.amount > 0 && t.method === 'card'
    ).forEach(t => {
      ops.push({
        id: t.id,
        date: t.date,
        type: 'card_income',
        amount: t.amount,
        method: 'безнал',
        description: t.description,
        operator: t.operatorName,
      });
    });

    periodTx.filter(t => t.type === 'cancel_payment' && t.method === 'card').forEach(t => {
      ops.push({
        id: t.id + '_cancel',
        date: t.date,
        type: 'card_income',
        amount: -t.amount,
        method: 'безнал',
        description: `Отмена: ${t.description}`,
        operator: t.operatorName,
      });
    });

    periodTx.filter(t => t.type === 'refund' && t.method === 'card').forEach(t => {
      ops.push({
        id: t.id + '_refund',
        date: t.date,
        type: 'card_income',
        amount: -t.amount,
        method: 'безнал',
        description: `Возврат: ${t.description}`,
        operator: t.operatorName,
      });
    });

    withdrawals.filter(w => filterDate(w.date)).forEach(w => {
      ops.push({
        id: w.id + '_admin',
        date: w.date,
        type: 'cash_from_manager',
        amount: w.amount,
        method: 'наличные',
        description: w.notes || 'Снятие наличных с кассы менеджера',
        operator: w.operatorName,
      });
    });

    adminExpenses.filter(e => filterDate(e.date)).forEach(e => {
      ops.push({
        id: e.id,
        date: e.date,
        type: 'admin_expense',
        amount: e.amount,
        method: e.method === 'cash' ? 'наличные' : 'безнал',
        description: `${e.category}: ${e.description}`,
        operator: e.operatorName,
      });
    });

    salaryAdvances.filter(a => filterDate(a.issuedAt)).forEach(a => {
      ops.push({
        id: a.id + '_sal_adv',
        date: a.issuedAt,
        type: 'salary_advance',
        amount: a.amount,
        method: 'наличные',
        description: `Аванс (долг под ЗП): ${a.employeeName} — ${a.amount} ₽${a.comment ? ` (${a.comment})` : ''}`,
        operator: a.issuedByName,
      });
    });

    salaryPayments.filter(p => filterDate(p.paidAt) && p.netPaid > 0).forEach(p => {
      ops.push({
        id: p.id + '_sal_pay',
        date: p.paidAt,
        type: 'salary_payment',
        amount: p.netPaid,
        method: p.method === 'cash' ? 'наличные' : 'безнал',
        description: `Зарплата: ${p.employeeName} — ${p.netPaid} ₽ к выдаче (начислено ${p.grossAmount} ₽${p.debtDeducted > 0 ? `, зачтено долга ${p.debtDeducted} ₽` : ''})`,
        operator: p.paidByName,
      });
    });

    return ops.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, withdrawals, adminExpenses, salaryAdvances, salaryPayments, periodDates]);

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.accessDenied}>
          <Text style={styles.accessDeniedText}>Доступ только для администратора</Text>
        </View>
      </View>
    );
  }

  const tabs: { key: FinanceTab; label: string }[] = [
    { key: 'dashboard', label: 'Обзор' },
    { key: 'admin_register', label: 'Касса Админа' },
    { key: 'manager_register', label: 'Касса Менеджера' },
  ];

  const periods: { key: PeriodKey; label: string }[] = [
    { key: 'today', label: 'Сегодня' },
    { key: 'week', label: 'Неделя' },
    { key: 'month', label: 'Месяц' },
    { key: 'all', label: 'Всё' },
  ];

  const fmtAmount = (n: number) => formatMoney(n);

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

      <View style={styles.periodRow}>
        {periods.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={[styles.periodBtnText, period === p.key && styles.periodBtnTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {tab === 'dashboard' && (
          <View>
            <View style={styles.registerCard}>
              <View style={styles.registerCardHeader}>
                <View style={[styles.registerIcon, { backgroundColor: '#EBF2FC' }]}>
                  <Wallet size={20} color={Colors.info} />
                </View>
                <Text style={styles.registerCardTitle}>Финансы администратора</Text>
              </View>
              <Text style={styles.registerBalance}>{fmtAmount(adminFinBal.total)} ₽</Text>
              <View style={styles.finSplitRow}>
                <View style={styles.finSplitItem}>
                  <Banknote size={14} color={Colors.success} />
                  <Text style={styles.finSplitLabel}>Наличные</Text>
                  <Text style={[styles.finSplitValue, { color: Colors.success }]}>{fmtAmount(adminFinBal.cash)} ₽</Text>
                </View>
                <View style={styles.finSplitItem}>
                  <CreditCard size={14} color={Colors.info} />
                  <Text style={styles.finSplitLabel}>Безнал</Text>
                  <Text style={[styles.finSplitValue, { color: Colors.info }]}>{fmtAmount(adminFinBal.card)} ₽</Text>
                </View>
              </View>
              <View style={styles.finDivider} />
              <View style={styles.registerBreakdown}>
                <View style={styles.registerBreakdownItem}>
                  <ArrowDownCircle size={14} color={Colors.success} />
                  <Text style={styles.registerBreakdownLabel}>Безнал от клиентов</Text>
                  <Text style={[styles.registerBreakdownValue, { color: Colors.success }]}>+{fmtAmount(adminReg.cardIncome)}</Text>
                </View>
                <View style={styles.registerBreakdownItem}>
                  <ArrowDownCircle size={14} color={Colors.info} />
                  <Text style={styles.registerBreakdownLabel}>Нал (снятия менеджеров)</Text>
                  <Text style={[styles.registerBreakdownValue, { color: Colors.info }]}>+{fmtAmount(adminReg.cashFromManager)}</Text>
                </View>
                <View style={styles.registerBreakdownItem}>
                  <ArrowUpCircle size={14} color={Colors.danger} />
                  <Text style={styles.registerBreakdownLabel}>Расходы админа</Text>
                  <Text style={[styles.registerBreakdownValue, { color: Colors.danger }]}>-{fmtAmount(adminReg.totalAdminExpenses)}</Text>
                </View>
                {salaryStats.totalAdvances > 0 && (
                  <View style={styles.registerBreakdownItem}>
                    <ArrowUpCircle size={14} color="#7C3AED" />
                    <Text style={styles.registerBreakdownLabel}>Долги под ЗП</Text>
                    <Text style={[styles.registerBreakdownValue, { color: '#7C3AED' }]}>-{fmtAmount(salaryStats.totalAdvances)}</Text>
                  </View>
                )}
                {salaryStats.totalSalaryPaid > 0 && (
                  <View style={styles.registerBreakdownItem}>
                    <ArrowUpCircle size={14} color="#7C3AED" />
                    <Text style={styles.registerBreakdownLabel}>Выплаты ЗП</Text>
                    <Text style={[styles.registerBreakdownValue, { color: '#7C3AED' }]}>-{fmtAmount(salaryStats.totalSalaryPaid)}</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.registerCard}>
              <View style={styles.registerCardHeader}>
                <View style={[styles.registerIcon, { backgroundColor: Colors.successLight }]}>
                  <Banknote size={20} color={Colors.success} />
                </View>
                <Text style={styles.registerCardTitle}>Касса менеджера (наличные)</Text>
              </View>
              <Text style={styles.registerBalance}>{fmtAmount(managerReg.balance)} ₽</Text>
              <View style={styles.registerBreakdown}>
                <View style={styles.registerBreakdownItem}>
                  <ArrowDownCircle size={14} color={Colors.success} />
                  <Text style={styles.registerBreakdownLabel}>Наличные от клиентов</Text>
                  <Text style={[styles.registerBreakdownValue, { color: Colors.success }]}>+{fmtAmount(managerReg.cashIncome)}</Text>
                </View>
                <View style={styles.registerBreakdownItem}>
                  <ArrowUpCircle size={14} color={Colors.danger} />
                  <Text style={styles.registerBreakdownLabel}>Расходы менеджера</Text>
                  <Text style={[styles.registerBreakdownValue, { color: Colors.danger }]}>-{fmtAmount(managerReg.totalExpenses)}</Text>
                </View>
                <View style={styles.registerBreakdownItem}>
                  <ArrowUpCircle size={14} color={Colors.warning} />
                  <Text style={styles.registerBreakdownLabel}>Снято админом → финансы</Text>
                  <Text style={[styles.registerBreakdownValue, { color: Colors.warning }]}>-{fmtAmount(managerReg.totalWithdrawals)}</Text>
                </View>
              </View>
              {managerReg.cardIncome > 0 && (
                <View style={styles.transitNote}>
                  <CreditCard size={12} color={Colors.info} />
                  <Text style={styles.transitNoteText}>Безнал {fmtAmount(managerReg.cardIncome)} ₽ → финансы администратора</Text>
                </View>
              )}
            </View>

            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Общий оборот за период</Text>
              <Text style={styles.totalValue}>
                {fmtAmount(managerReg.cashIncome + managerReg.cardIncome)} ₽
              </Text>
              <View style={styles.totalBreakdownRow}>
                <Text style={[styles.totalBreakdownText, { color: Colors.success }]}>
                  Нал: {fmtAmount(managerReg.cashIncome)} ₽
                </Text>
                <Text style={[styles.totalBreakdownText, { color: Colors.info }]}>
                  Безнал: {fmtAmount(managerReg.cardIncome)} ₽
                </Text>
              </View>
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: Colors.info }]}
                onPress={() => setShowWithdrawModal(true)}
                activeOpacity={0.7}
              >
                <ArrowDownCircle size={18} color={Colors.white} />
                <Text style={styles.actionBtnText}>Снять наличные</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: Colors.danger }]}
                onPress={() => setShowAdminExpenseModal(true)}
                activeOpacity={0.7}
              >
                <MinusCircle size={18} color={Colors.white} />
                <Text style={styles.actionBtnText}>Расход</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Категории расходов</Text>
            <View style={styles.categorySection}>
              <Text style={styles.categoryGroupTitle}>Категории админа</Text>
              {getAdminCategories.length === 0 ? (
                <Text style={styles.emptySmall}>Нет категорий</Text>
              ) : (
                getAdminCategories.map(c => (
                  <View key={c.id} style={styles.categoryRow}>
                    <Text style={styles.categoryName}>{c.name}</Text>
                    <View style={styles.categoryActions}>
                      <TouchableOpacity onPress={() => {
                        setCategoryName(c.name);
                        setCategoryOwner('admin');
                        setEditingCategoryId(c.id);
                        setShowCategoryModal(true);
                      }}>
                        <Edit3 size={16} color={Colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteCategory(c.id, c.name)}>
                        <Trash2 size={16} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}

              <Text style={[styles.categoryGroupTitle, { marginTop: 12 }]}>Категории менеджера</Text>
              {getManagerCategories.length === 0 ? (
                <Text style={styles.emptySmall}>Нет категорий</Text>
              ) : (
                getManagerCategories.map(c => (
                  <View key={c.id} style={styles.categoryRow}>
                    <Text style={styles.categoryName}>{c.name}</Text>
                    <View style={styles.categoryActions}>
                      <TouchableOpacity onPress={() => {
                        setCategoryName(c.name);
                        setCategoryOwner('manager');
                        setEditingCategoryId(c.id);
                        setShowCategoryModal(true);
                      }}>
                        <Edit3 size={16} color={Colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteCategory(c.id, c.name)}>
                        <Trash2 size={16} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}

              <TouchableOpacity
                style={styles.addCategoryBtn}
                onPress={() => {
                  setCategoryName('');
                  setEditingCategoryId(null);
                  setShowCategoryModal(true);
                }}
                activeOpacity={0.7}
              >
                <Plus size={16} color={Colors.primary} />
                <Text style={styles.addCategoryBtnText}>Добавить категорию</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {tab === 'admin_register' && (
          <View>
            <View style={styles.regSummaryCard}>
              <View style={styles.regSummaryRow}>
                <Text style={styles.regSummaryLabel}>Баланс</Text>
                <Text style={[styles.regSummaryValue, { color: Colors.primary }]}>{fmtAmount(adminReg.balance)} ₽</Text>
              </View>
              <View style={styles.regSummaryDivider} />
              <View style={styles.regSummaryRow}>
                <Text style={styles.regSummaryLabel}>Безнал (приход)</Text>
                <Text style={[styles.regSummaryValue, { color: Colors.success }]}>+{fmtAmount(adminReg.cardIncome)} ₽</Text>
              </View>
              <View style={styles.regSummaryRow}>
                <Text style={styles.regSummaryLabel}>Наличные со снятий</Text>
                <Text style={[styles.regSummaryValue, { color: Colors.info }]}>+{fmtAmount(adminReg.cashFromManager)} ₽</Text>
              </View>
              <View style={styles.regSummaryRow}>
                <Text style={styles.regSummaryLabel}>Расходы админа</Text>
                <Text style={[styles.regSummaryValue, { color: Colors.danger }]}>-{fmtAmount(adminReg.totalAdminExpenses)} ₽</Text>
              </View>
              {adminReg.totalSalaryAdvances > 0 && (
                <View style={styles.regSummaryRow}>
                  <Text style={styles.regSummaryLabel}>Долги под ЗП</Text>
                  <Text style={[styles.regSummaryValue, { color: '#7C3AED' }]}>-{fmtAmount(adminReg.totalSalaryAdvances)} ₽</Text>
                </View>
              )}
              {adminReg.totalSalaryPaid > 0 && (
                <View style={styles.regSummaryRow}>
                  <Text style={styles.regSummaryLabel}>Выплаты ЗП</Text>
                  <Text style={[styles.regSummaryValue, { color: '#7C3AED' }]}>-{fmtAmount(adminReg.totalSalaryPaid)} ₽</Text>
                </View>
              )}
            </View>

            <Text style={styles.sectionTitle}>Операции</Text>
            {allAdminOps.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Нет операций за выбранный период</Text>
              </View>
            ) : (
              allAdminOps.map(op => {
                const isIncome = op.type === 'card_income' || op.type === 'cash_from_manager';
                const isExpense = op.type === 'admin_expense';
                const isSalary = op.type === 'salary_advance' || op.type === 'salary_payment';
                const isNegative = op.amount < 0;
                const salaryColor = '#7C3AED';
                return (
                  <View
                    key={op.id}
                    style={[
                      styles.opRow,
                      isExpense && styles.opRowExpense,
                      isNegative && styles.opRowExpense,
                      isSalary && styles.opRowSalary,
                    ]}
                  >
                    <View style={[
                      styles.opIcon,
                      isSalary
                        ? { backgroundColor: '#F3EEFF' }
                        : isIncome && !isNegative
                          ? { backgroundColor: Colors.successLight }
                          : { backgroundColor: Colors.dangerLight },
                    ]}>
                      {isSalary ? (
                        <Briefcase size={16} color={salaryColor} />
                      ) : isExpense ? (
                        <ArrowUpCircle size={16} color={Colors.danger} />
                      ) : isNegative ? (
                        <ArrowUpCircle size={16} color={Colors.danger} />
                      ) : op.type === 'card_income' ? (
                        <CreditCard size={16} color={Colors.success} />
                      ) : (
                        <Banknote size={16} color={Colors.success} />
                      )}
                    </View>
                    <View style={styles.opInfo}>
                      <Text style={styles.opDesc} numberOfLines={2}>{op.description}</Text>
                      <Text style={styles.opMeta}>{op.operator} • {op.method} • {formatDateTime(op.date)}</Text>
                    </View>
                    <Text style={[
                      styles.opAmount,
                      isSalary
                        ? { color: salaryColor }
                        : isIncome && !isNegative
                          ? { color: Colors.success }
                          : { color: Colors.danger },
                    ]}>
                      {isIncome && !isNegative ? '+' : '-'}{fmtAmount(Math.abs(op.amount))} ₽
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        )}

        {tab === 'manager_register' && (
          <View>
            <View style={styles.regSummaryCard}>
              <View style={styles.regSummaryRow}>
                <Text style={styles.regSummaryLabel}>Баланс (наличные)</Text>
                <Text style={[styles.regSummaryValue, { color: Colors.primary }]}>{fmtAmount(managerReg.balance)} ₽</Text>
              </View>
              <View style={styles.regSummaryDivider} />
              <View style={styles.regSummaryRow}>
                <Text style={styles.regSummaryLabel}>Наличные (приход)</Text>
                <Text style={[styles.regSummaryValue, { color: Colors.success }]}>+{fmtAmount(managerReg.cashIncome)} ₽</Text>
              </View>
              <View style={styles.regSummaryRow}>
                <Text style={styles.regSummaryLabel}>Безнал (передано админу)</Text>
                <Text style={[styles.regSummaryValue, { color: Colors.info }]}>{fmtAmount(managerReg.cardIncome)} ₽</Text>
              </View>
              <View style={styles.regSummaryRow}>
                <Text style={styles.regSummaryLabel}>Расходы менеджера</Text>
                <Text style={[styles.regSummaryValue, { color: Colors.danger }]}>-{fmtAmount(managerReg.totalExpenses)} ₽</Text>
              </View>
              <View style={styles.regSummaryRow}>
                <Text style={styles.regSummaryLabel}>Снято администратором</Text>
                <Text style={[styles.regSummaryValue, { color: Colors.warning }]}>-{fmtAmount(managerReg.totalWithdrawals)} ₽</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Операции</Text>
            {allManagerOps.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Нет операций за выбранный период</Text>
              </View>
            ) : (
              allManagerOps.map(op => {
                const isIncome = op.type === 'income_cash';
                const isCard = op.type === 'income_card';
                const isExpenseOp = op.type === 'expense';
                const isWithdrawal = op.type === 'withdrawal';
                const isRefund = op.type === 'refund';

                let iconBg = Colors.successLight;
                let iconColor = Colors.success;
                let amountColor = Colors.success;
                let prefix = '+';

                if (isCard) {
                  iconBg = Colors.infoLight;
                  iconColor = Colors.info;
                  amountColor = Colors.info;
                } else if (isExpenseOp) {
                  iconBg = Colors.dangerLight;
                  iconColor = Colors.danger;
                  amountColor = Colors.danger;
                  prefix = '-';
                } else if (isWithdrawal) {
                  iconBg = Colors.warningLight;
                  iconColor = Colors.warning;
                  amountColor = Colors.warning;
                  prefix = '-';
                } else if (isRefund) {
                  iconBg = Colors.dangerLight;
                  iconColor = Colors.danger;
                  amountColor = Colors.danger;
                  prefix = '-';
                }

                return (
                  <View key={op.id} style={[
                    styles.opRow,
                    isCard && styles.opRowTransit,
                  ]}>
                    <View style={[styles.opIcon, { backgroundColor: iconBg }]}>
                      {isIncome && <Banknote size={16} color={iconColor} />}
                      {isCard && <CreditCard size={16} color={iconColor} />}
                      {isExpenseOp && <MinusCircle size={16} color={iconColor} />}
                      {isWithdrawal && <ArrowDownCircle size={16} color={iconColor} />}
                      {isRefund && <ArrowUpCircle size={16} color={iconColor} />}
                    </View>
                    <View style={styles.opInfo}>
                      <Text style={styles.opDesc} numberOfLines={2}>{op.description}</Text>
                      <View style={styles.opMetaRow}>
                        <Text style={styles.opMeta}>{op.operator} • {formatDateTime(op.date)}</Text>
                        {op.status && (
                          <View style={[
                            styles.opStatusBadge,
                            op.status === 'Передано Администратору'
                              ? { backgroundColor: Colors.infoLight }
                              : { backgroundColor: Colors.successLight },
                          ]}>
                            <Text style={[
                              styles.opStatusText,
                              op.status === 'Передано Администратору'
                                ? { color: Colors.info }
                                : { color: Colors.success },
                            ]}>{op.status}</Text>
                          </View>
                        )}
                      </View>
                      {isCard && (
                        <Text style={styles.transitHint}>Безнал, передан Администратору, не влияет на наличный остаток</Text>
                      )}
                    </View>
                    <Text style={[styles.opAmount, { color: amountColor }]}>
                      {prefix}{fmtAmount(op.amount)} ₽
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <Modal visible={showWithdrawModal} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalKeyboardView}
            >
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.modalCard}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Снять наличные с кассы менеджера</Text>
                    <TouchableOpacity onPress={() => setShowWithdrawModal(false)}>
                      <X size={22} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.modalFieldLabel}>Сумма (₽)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={withdrawAmount}
                    onChangeText={setWithdrawAmount}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={Colors.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={styles.modalFieldLabel}>Комментарий (необязательно)</Text>
                  <TextInput
                    style={[styles.modalInput, { height: 60 }]}
                    value={withdrawNotes}
                    onChangeText={setWithdrawNotes}
                    placeholder="Причина снятия..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    blurOnSubmit
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleWithdraw} activeOpacity={0.7}>
                    <Text style={styles.modalSubmitText}>Снять из кассы</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={showAdminExpenseModal} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalKeyboardView}
            >
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.modalCard}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Расход администратора</Text>
                    <TouchableOpacity onPress={() => setShowAdminExpenseModal(false)}>
                      <X size={22} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.modalFieldLabel}>Сумма (₽)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={adminExpAmount}
                    onChangeText={setAdminExpAmount}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={Colors.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={styles.modalFieldLabel}>Категория</Text>
                  {getAdminCategories.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
                      {getAdminCategories.map(c => (
                        <TouchableOpacity
                          key={c.id}
                          style={[
                            styles.categoryChip,
                            adminExpCategory === c.name && styles.categoryChipActive,
                          ]}
                          onPress={() => setAdminExpCategory(c.name)}
                        >
                          <Text style={[
                            styles.categoryChipText,
                            adminExpCategory === c.name && styles.categoryChipTextActive,
                          ]}>{c.name}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[
                          styles.categoryChip,
                          adminExpCategory === 'Другое' && styles.categoryChipActive,
                        ]}
                        onPress={() => setAdminExpCategory('Другое')}
                      >
                        <Text style={[
                          styles.categoryChipText,
                          adminExpCategory === 'Другое' && styles.categoryChipTextActive,
                        ]}>Другое</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  ) : (
                    <TextInput
                      style={styles.modalInput}
                      value={adminExpCategory}
                      onChangeText={setAdminExpCategory}
                      placeholder="Хозтовары, транспорт, и т.д."
                      placeholderTextColor={Colors.textMuted}
                    />
                  )}
                  <Text style={styles.modalFieldLabel}>Описание</Text>
                  <TextInput
                    style={[styles.modalInput, { height: 60 }]}
                    value={adminExpDesc}
                    onChangeText={setAdminExpDesc}
                    placeholder="За что платим..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    blurOnSubmit
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={styles.modalFieldLabel}>Способ оплаты</Text>
                  <View style={styles.methodRow}>
                    <TouchableOpacity
                      style={[styles.methodBtn, adminExpMethod === 'cash' && styles.methodBtnActive]}
                      onPress={() => setAdminExpMethod('cash')}
                    >
                      <Banknote size={16} color={adminExpMethod === 'cash' ? Colors.white : Colors.textSecondary} />
                      <Text style={[styles.methodBtnText, adminExpMethod === 'cash' && styles.methodBtnTextActive]}>Наличные</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.methodBtn, adminExpMethod === 'card' && styles.methodBtnActive]}
                      onPress={() => setAdminExpMethod('card')}
                    >
                      <CreditCard size={16} color={adminExpMethod === 'card' ? Colors.white : Colors.textSecondary} />
                      <Text style={[styles.methodBtnText, adminExpMethod === 'card' && styles.methodBtnTextActive]}>Безнал</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={[styles.modalSubmitBtn, { backgroundColor: Colors.danger }]} onPress={handleAddAdminExpense} activeOpacity={0.7}>
                    <Text style={styles.modalSubmitText}>Добавить расход</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={showCategoryModal} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalKeyboardView}
            >
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.modalCard}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {editingCategoryId ? 'Редактировать категорию' : 'Новая категория расходов'}
                    </Text>
                    <TouchableOpacity onPress={() => { setShowCategoryModal(false); setEditingCategoryId(null); }}>
                      <X size={22} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.modalFieldLabel}>Название</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={categoryName}
                    onChangeText={setCategoryName}
                    placeholder="Название категории"
                    placeholderTextColor={Colors.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  {!editingCategoryId && (
                    <>
                      <Text style={styles.modalFieldLabel}>Для кого</Text>
                      <View style={styles.methodRow}>
                        <TouchableOpacity
                          style={[styles.methodBtn, categoryOwner === 'admin' && styles.methodBtnActive]}
                          onPress={() => setCategoryOwner('admin')}
                        >
                          <Text style={[styles.methodBtnText, categoryOwner === 'admin' && styles.methodBtnTextActive]}>Админ</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.methodBtn, categoryOwner === 'manager' && styles.methodBtnActive]}
                          onPress={() => setCategoryOwner('manager')}
                        >
                          <Text style={[styles.methodBtnText, categoryOwner === 'manager' && styles.methodBtnTextActive]}>Менеджер</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                  <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleSaveCategory} activeOpacity={0.7}>
                    <Text style={styles.modalSubmitText}>{editingCategoryId ? 'Сохранить' : 'Добавить'}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  accessDeniedText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  tabBtnTextActive: {
    color: Colors.white,
  },
  periodRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    gap: 6,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
  },
  periodBtnActive: {
    backgroundColor: Colors.primaryLight,
  },
  periodBtnText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  periodBtnTextActive: {
    color: Colors.white,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  registerCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
  },
  registerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  registerIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerCardTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  registerBalance: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  registerBreakdown: {
    gap: 6,
  },
  registerBreakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  registerBreakdownLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  registerBreakdownValue: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  finSplitRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  finSplitItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  finSplitLabel: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  finSplitValue: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  finDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },
  transitNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  transitNoteText: {
    fontSize: 12,
    color: Colors.info,
    fontStyle: 'italic' as const,
  },
  totalCard: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 26,
    fontWeight: '800' as const,
    color: Colors.white,
  },
  totalBreakdownRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  totalBreakdownText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 10,
  },
  categorySection: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  categoryGroupTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  categoryName: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  categoryActions: {
    flexDirection: 'row',
    gap: 14,
  },
  addCategoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  addCategoryBtnText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  emptySmall: {
    fontSize: 13,
    color: Colors.textMuted,
    paddingVertical: 4,
  },
  regSummaryCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 16,
  },
  regSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  regSummaryLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  regSummaryValue: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  regSummaryDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  opRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 6,
    gap: 10,
  },
  opRowExpense: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
  },
  opRowSalary: {
    borderLeftWidth: 3,
    borderLeftColor: '#7C3AED',
  },
  opRowTransit: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.info,
    backgroundColor: Colors.infoLight + '40',
  },
  transitHint: {
    fontSize: 10,
    color: Colors.info,
    marginTop: 2,
    fontStyle: 'italic' as const,
  },
  opIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opInfo: {
    flex: 1,
  },
  opDesc: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500' as const,
  },
  opMeta: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  opMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  opStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  opStatusText: {
    fontSize: 10,
    fontWeight: '600' as const,
  },
  opAmount: {
    fontSize: 14,
    fontWeight: '700' as const,
    minWidth: 60,
    textAlign: 'right' as const,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalKeyboardView: {
    justifyContent: 'center',
    flex: 1,
  },
  modalCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 22,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    flex: 1,
    marginRight: 12,
  },
  modalFieldLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 10,
  },
  modalInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalSubmitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  modalSubmitText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  methodBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  methodBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  methodBtnTextActive: {
    color: Colors.white,
  },
  categoriesScroll: {
    marginBottom: 4,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 6,
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  categoryChipTextActive: {
    color: Colors.white,
  },
});
