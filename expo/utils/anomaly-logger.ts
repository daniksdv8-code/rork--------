import AsyncStorage from '@react-native-async-storage/async-storage';

const ANOMALY_STORAGE_KEY = 'park_anomaly_log';
const MAX_ANOMALY_ENTRIES = 500;

export type AnomalySeverity = 'info' | 'warning' | 'error' | 'critical';
export type AnomalyCategory =
  | 'cash_balance'
  | 'debt_mismatch'
  | 'report_aggregate'
  | 'orphan_entity'
  | 'sync_protection'
  | 'session_state'
  | 'rounding_artifact'
  | 'salary_mismatch'
  | 'shift_anomaly'
  | 'general';

export type AnomalyAction =
  | 'logged_only'
  | 'recalculated'
  | 'normalized'
  | 'blocked'
  | 'admin_alert';

export interface AnomalyEntry {
  id: string;
  timestamp: string;
  severity: AnomalySeverity;
  category: AnomalyCategory;
  message: string;
  expected?: string;
  actual?: string;
  action: AnomalyAction;
  actionDetail?: string;
  entityId?: string;
  entityType?: string;
}

let memoryLog: AnomalyEntry[] = [];
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let idCounter = 0;

function generateAnomalyId(): string {
  idCounter++;
  return `anom_${Date.now()}_${idCounter}`;
}

export function logAnomaly(params: {
  severity: AnomalySeverity;
  category: AnomalyCategory;
  message: string;
  expected?: string;
  actual?: string;
  action: AnomalyAction;
  actionDetail?: string;
  entityId?: string;
  entityType?: string;
}): AnomalyEntry {
  const entry: AnomalyEntry = {
    id: generateAnomalyId(),
    timestamp: new Date().toISOString(),
    ...params,
  };

  memoryLog = [entry, ...memoryLog].slice(0, MAX_ANOMALY_ENTRIES);

  const severityEmoji = params.severity === 'critical' ? '🔴' :
    params.severity === 'error' ? '🟠' :
    params.severity === 'warning' ? '🟡' : '🔵';
  console.log(`[Anomaly] ${severityEmoji} [${params.category}] ${params.message} | action: ${params.action}${params.actionDetail ? ` (${params.actionDetail})` : ''}`);

  scheduleSave();
  return entry;
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveToStorage();
  }, 2000);
}

async function saveToStorage(): Promise<void> {
  try {
    await AsyncStorage.setItem(ANOMALY_STORAGE_KEY, JSON.stringify(memoryLog));
  } catch (e) {
    console.log('[AnomalyLog] Failed to save:', e);
  }
}

export async function loadAnomalyLog(): Promise<AnomalyEntry[]> {
  try {
    const stored = await AsyncStorage.getItem(ANOMALY_STORAGE_KEY);
    if (stored) {
      memoryLog = JSON.parse(stored);
    }
  } catch (e) {
    console.log('[AnomalyLog] Failed to load:', e);
  }
  return memoryLog;
}

export function getAnomalyLog(): AnomalyEntry[] {
  return memoryLog;
}

export async function clearAnomalyLog(): Promise<void> {
  memoryLog = [];
  try {
    await AsyncStorage.removeItem(ANOMALY_STORAGE_KEY);
  } catch (e) {
    console.log('[AnomalyLog] Failed to clear:', e);
  }
}

export function getAnomalySummary(): {
  total: number;
  critical: number;
  errors: number;
  warnings: number;
  recentCount: number;
} {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  return {
    total: memoryLog.length,
    critical: memoryLog.filter(e => e.severity === 'critical').length,
    errors: memoryLog.filter(e => e.severity === 'error').length,
    warnings: memoryLog.filter(e => e.severity === 'warning').length,
    recentCount: memoryLog.filter(e => new Date(e.timestamp).getTime() > oneDayAgo).length,
  };
}
