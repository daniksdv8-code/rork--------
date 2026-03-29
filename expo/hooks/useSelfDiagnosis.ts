import { useEffect, useRef, useCallback } from 'react';
import { runFullDiagnostic, performSafeHealing, FullDiagnosticData } from '@/utils/integrity';
import { loadAnomalyLog, logAnomaly, getAnomalySummary } from '@/utils/anomaly-logger';

const DIAGNOSTIC_INTERVAL_MS = 120000;
const INITIAL_DELAY_MS = 10000;

export function useSelfDiagnosis(
  isLoaded: boolean,
  isServerSynced: boolean,
  getData: () => FullDiagnosticData,
  onHeal?: (healed: {
    debts?: FullDiagnosticData['debts'];
    clientDebts?: FullDiagnosticData['clientDebts'];
    salaryAdvances?: FullDiagnosticData['salaryAdvances'];
  }) => void,
) {
  const lastRunRef = useRef<number>(0);
  const initializedRef = useRef<boolean>(false);

  const runDiagnostic = useCallback(() => {
    const now = Date.now();
    if (now - lastRunRef.current < 30000) return;
    lastRunRef.current = now;

    try {
      const data = getData();
      const result = runFullDiagnostic(data);

      const healResult = performSafeHealing({
        debts: data.debts,
        clientDebts: data.clientDebts,
        salaryAdvances: data.salaryAdvances,
      });

      if (healResult.actions.length > 0 && onHeal) {
        const healPayload: {
          debts?: FullDiagnosticData['debts'];
          clientDebts?: FullDiagnosticData['clientDebts'];
          salaryAdvances?: FullDiagnosticData['salaryAdvances'];
        } = {};

        if (healResult.healedDebts !== data.debts) {
          healPayload.debts = healResult.healedDebts;
        }
        if (healResult.healedClientDebts !== data.clientDebts) {
          healPayload.clientDebts = healResult.healedClientDebts;
        }
        if (healResult.healedSalaryAdvances !== data.salaryAdvances) {
          healPayload.salaryAdvances = healResult.healedSalaryAdvances;
        }

        if (Object.keys(healPayload).length > 0) {
          onHeal(healPayload);
          logAnomaly({
            severity: 'info',
            category: 'general',
            message: `Самоисправление: выполнено ${healResult.actions.length} действий`,
            action: 'recalculated',
            actionDetail: healResult.actions.map(a => a.description).join('; '),
          });
        }
      }

      const summary = getAnomalySummary();
      if (result.issues.length > 0 || result.debtMismatches.length > 0 || result.shiftMismatches.length > 0) {
        console.log(`[SelfDiagnosis] Run complete: ${result.issues.length} issues, ${result.debtMismatches.length} debt mismatches, ${result.shiftMismatches.length} shift mismatches, ${result.negativeDebts.length} negative debts, anomaly log: ${summary.total} total (${summary.recentCount} last 24h)`);
      } else {
        console.log(`[SelfDiagnosis] Run complete: all OK, anomaly log: ${summary.total} entries`);
      }
    } catch (err) {
      console.log('[SelfDiagnosis] Error during diagnostic run:', err);
    }
  }, [getData, onHeal]);

  useEffect(() => {
    if (!isLoaded || !isServerSynced) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    void loadAnomalyLog();

    const initialTimer = setTimeout(() => {
      runDiagnostic();
    }, INITIAL_DELAY_MS);

    return () => clearTimeout(initialTimer);
  }, [isLoaded, isServerSynced, runDiagnostic]);

  useEffect(() => {
    if (!isLoaded || !isServerSynced) return;

    const interval = setInterval(() => {
      runDiagnostic();
    }, DIAGNOSTIC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isLoaded, isServerSynced, runDiagnostic]);

  return { runDiagnostic };
}
