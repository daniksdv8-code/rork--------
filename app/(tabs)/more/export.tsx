import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { Download, Users, Receipt, Calendar, Check } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import {
  buildClientsCsv, buildPaymentsCsv, shareCsv,
  ExportClientsData, ExportPaymentsData,
} from '@/utils/csv-export';
import { formatDate } from '@/utils/date';

type PeriodPreset = '7d' | '30d' | '90d' | 'year' | 'all';

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  '7d': '7 дней',
  '30d': '30 дней',
  '90d': '3 месяца',
  'year': 'Год',
  'all': 'Всё время',
};

function getDateRange(preset: PeriodPreset): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setHours(0, 0, 0, 0);

  switch (preset) {
    case '7d':
      from.setDate(from.getDate() - 7);
      break;
    case '30d':
      from.setDate(from.getDate() - 30);
      break;
    case '90d':
      from.setDate(from.getDate() - 90);
      break;
    case 'year':
      from.setFullYear(from.getFullYear() - 1);
      break;
    case 'all':
      from.setFullYear(2020, 0, 1);
      break;
  }
  return { from, to };
}

export default function ExportScreen() {
  const { isAdmin } = useAuth();
  const { clients, cars, sessions, debts, payments, transactions } = useParking();

  const [exportingClients, setExportingClients] = useState<boolean>(false);
  const [exportingPayments, setExportingPayments] = useState<boolean>(false);
  const [period, setPeriod] = useState<PeriodPreset>('30d');
  const [doneClients, setDoneClients] = useState<boolean>(false);
  const [donePayments, setDonePayments] = useState<boolean>(false);

  const activeClients = useMemo(() => clients.filter(c => !c.deleted), [clients]);
  const activeCars = useMemo(() => cars.filter(c => !c.deleted), [cars]);

  const { from: dateFrom, to: dateTo } = useMemo(() => getDateRange(period), [period]);

  const filteredTransactionsCount = useMemo(() => {
    const from = new Date(dateFrom);
    from.setHours(0, 0, 0, 0);
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    return transactions.filter(t => {
      const d = new Date(t.date);
      return d >= from && d <= to;
    }).length;
  }, [transactions, dateFrom, dateTo]);

  const handleExportClients = useCallback(async () => {
    setExportingClients(true);
    setDoneClients(false);
    try {
      const data: ExportClientsData = {
        clients: activeClients,
        cars: activeCars,
        sessions,
        debts,
      };
      const csv = buildClientsCsv(data);
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      await shareCsv(csv, `clients_${dateStr}.csv`);
      setDoneClients(true);
      setTimeout(() => setDoneClients(false), 3000);
    } catch (e) {
      console.log('[Export] Clients export error:', e);
    } finally {
      setExportingClients(false);
    }
  }, [activeClients, activeCars, sessions, debts]);

  const handleExportPayments = useCallback(async () => {
    setExportingPayments(true);
    setDonePayments(false);
    try {
      const data: ExportPaymentsData = {
        payments,
        transactions,
        clients: activeClients,
        cars: activeCars,
        sessions,
        dateFrom,
        dateTo,
      };
      const csv = buildPaymentsCsv(data);
      const fromStr = formatDate(dateFrom.toISOString()).replace(/\./g, '-');
      const toStr = formatDate(dateTo.toISOString()).replace(/\./g, '-');
      await shareCsv(csv, `operations_${fromStr}_${toStr}.csv`);
      setDonePayments(true);
      setTimeout(() => setDonePayments(false), 3000);
    } catch (e) {
      console.log('[Export] Payments export error:', e);
    } finally {
      setExportingPayments(false);
    }
  }, [payments, transactions, activeClients, activeCars, sessions, dateFrom, dateTo]);

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Экспорт' }} />
        <View style={styles.restricted}>
          <Text style={styles.restrictedText}>Экспорт доступен только администратору</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Экспорт данных' }} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIcon, { backgroundColor: Colors.info + '15' }]}>
            <Users size={20} color={Colors.info} />
          </View>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>Список клиентов</Text>
            <Text style={styles.sectionSubtitle}>
              {activeClients.length} клиентов · {activeCars.length} машин
            </Text>
          </View>
        </View>

        <Text style={styles.sectionDesc}>
          ФИО, телефоны, автомобили, гос. номера, статус парковки, долги, заметки, дата регистрации
        </Text>

        <TouchableOpacity
          style={[styles.exportBtn, doneClients && styles.exportBtnDone]}
          onPress={handleExportClients}
          disabled={exportingClients}
          activeOpacity={0.7}
          testID="export-clients-btn"
        >
          {exportingClients ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : doneClients ? (
            <Check size={18} color={Colors.white} />
          ) : (
            <Download size={18} color={Colors.white} />
          )}
          <Text style={styles.exportBtnText}>
            {exportingClients ? 'Экспорт...' : doneClients ? 'Готово!' : 'Скачать CSV'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIcon, { backgroundColor: Colors.success + '15' }]}>
            <Receipt size={20} color={Colors.success} />
          </View>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>Операции и оплаты</Text>
            <Text style={styles.sectionSubtitle}>
              {filteredTransactionsCount} операций за период
            </Text>
          </View>
        </View>

        <Text style={styles.sectionDesc}>
          Дата, тип, клиент, гос. номер, сумма, способ оплаты, описание, оператор
        </Text>

        <View style={styles.periodRow}>
          <View style={styles.periodLabelRow}>
            <Calendar size={14} color={Colors.textSecondary} />
            <Text style={styles.periodLabel}>Период:</Text>
          </View>
          <View style={styles.periodChips}>
            {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map(key => (
              <TouchableOpacity
                key={key}
                style={[styles.chip, period === key && styles.chipActive]}
                onPress={() => setPeriod(key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, period === key && styles.chipTextActive]}>
                  {PERIOD_LABELS[key]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={styles.periodRange}>
          {formatDate(dateFrom.toISOString())} — {formatDate(dateTo.toISOString())}
        </Text>

        <TouchableOpacity
          style={[styles.exportBtn, donePayments && styles.exportBtnDone]}
          onPress={handleExportPayments}
          disabled={exportingPayments}
          activeOpacity={0.7}
          testID="export-payments-btn"
        >
          {exportingPayments ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : donePayments ? (
            <Check size={18} color={Colors.white} />
          ) : (
            <Download size={18} color={Colors.white} />
          )}
          <Text style={styles.exportBtnText}>
            {exportingPayments ? 'Экспорт...' : donePayments ? 'Готово!' : 'Скачать CSV'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.hint}>
        <Text style={styles.hintText}>
          Файлы экспортируются в формате CSV (разделитель — точка с запятой).{'\n'}
          Откройте в Excel, Google Sheets или Numbers.
        </Text>
      </View>
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
    paddingBottom: 40,
  },
  restricted: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  restrictedText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  section: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  sectionDesc: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: 14,
  },
  periodRow: {
    marginBottom: 8,
  },
  periodLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  periodLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  periodChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500' as const,
  },
  chipTextActive: {
    color: Colors.white,
  },
  periodRange: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 14,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
  },
  exportBtnDone: {
    backgroundColor: Colors.success,
  },
  exportBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  hint: {
    backgroundColor: Colors.infoLight,
    borderRadius: 10,
    padding: 14,
  },
  hintText: {
    fontSize: 13,
    color: Colors.info,
    lineHeight: 19,
  },
});
