import { Client, Car, ParkingSession, Payment, Debt, Transaction } from '@/types';
import { formatDateTime, formatDate } from '@/utils/date';
import { saveFile } from '@/utils/file-save';

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes(';')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvString(headers: string[], rows: string[][]): string {
  const BOM = '\uFEFF';
  const headerLine = headers.map(escapeCsvField).join(';');
  const dataLines = rows.map(row => row.map(escapeCsvField).join(';'));
  return BOM + [headerLine, ...dataLines].join('\r\n');
}

export interface ExportClientsData {
  clients: Client[];
  cars: Car[];
  sessions: ParkingSession[];
  debts: Debt[];
}

export function buildClientsCsv(data: ExportClientsData): string {
  const headers = [
    'ФИО',
    'Телефон 1',
    'Телефон 2',
    'Автомобили',
    'Гос. номера',
    'На парковке',
    'Долг (руб.)',
    'Заметки',
    'Дата регистрации',
  ];

  const rows = data.clients
    .filter(c => !c.deleted)
    .map(client => {
      const clientCars = data.cars.filter(c => c.clientId === client.id && !c.deleted);
      const carModels = clientCars.map(c => c.carModel || '—').join(', ');
      const plates = clientCars.map(c => c.plateNumber).join(', ');

      const carIds = new Set(clientCars.map(c => c.id));
      const isParked = data.sessions.some(
        s => s.clientId === client.id && (s.status === 'active' || s.status === 'active_debt') && !s.cancelled && carIds.has(s.carId)
      );

      const totalDebt = data.debts
        .filter(d => d.clientId === client.id && d.remainingAmount > 0)
        .reduce((sum, d) => sum + d.remainingAmount, 0);

      return [
        client.name,
        client.phone,
        client.phone2 || '',
        carModels,
        plates,
        isParked ? 'Да' : 'Нет',
        totalDebt > 0 ? String(totalDebt) : '0',
        client.notes || '',
        formatDate(client.createdAt),
      ];
    });

  return buildCsvString(headers, rows);
}

export interface ExportPaymentsData {
  payments: Payment[];
  transactions: Transaction[];
  clients: Client[];
  cars: Car[];
  sessions: ParkingSession[];
  dateFrom: Date;
  dateTo: Date;
}

export function buildPaymentsCsv(data: ExportPaymentsData): string {
  const headers = [
    'Дата',
    'Тип операции',
    'Клиент',
    'Гос. номер',
    'Сумма (руб.)',
    'Способ оплаты',
    'Описание',
    'Оператор',
  ];

  const clientMap = new Map(data.clients.map(c => [c.id, c.name]));
  const carMap = new Map(data.cars.map(c => [c.id, c.plateNumber]));

  const typeLabels: Record<string, string> = {
    payment: 'Оплата',
    debt: 'Долг',
    debt_payment: 'Погашение долга',
    exit: 'Выезд',
    entry: 'Заезд',
    cancel_entry: 'Отмена заезда',
    cancel_exit: 'Отмена выезда',
    cancel_payment: 'Отмена оплаты',
    withdrawal: 'Изъятие',
    client_deleted: 'Удаление клиента',
    refund: 'Возврат',
  };

  const methodLabels: Record<string, string> = {
    cash: 'Наличные',
    card: 'Безнал',
  };

  const from = new Date(data.dateFrom);
  from.setHours(0, 0, 0, 0);
  const to = new Date(data.dateTo);
  to.setHours(23, 59, 59, 999);

  const filtered = data.transactions
    .filter(t => {
      const d = new Date(t.date);
      return d >= from && d <= to;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const rows = filtered.map(t => [
    formatDateTime(t.date),
    typeLabels[t.type] || t.type,
    clientMap.get(t.clientId) || '—',
    carMap.get(t.carId) || '—',
    String(t.amount),
    t.method ? (methodLabels[t.method] || t.method) : '—',
    t.description || '',
    t.operatorName || '—',
  ]);

  return buildCsvString(headers, rows);
}

export async function shareCsv(csvContent: string, fileName: string): Promise<void> {
  console.log(`[Export] Sharing CSV: ${fileName}, size: ${csvContent.length} chars`);
  await saveFile({
    content: csvContent,
    fileName,
    mimeType: 'text/csv',
    dialogTitle: `Экспорт: ${fileName}`,
    UTI: 'public.comma-separated-values-text',
  });
}
