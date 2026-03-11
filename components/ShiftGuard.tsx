import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldAlert, PlayCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';

interface ShiftGuardProps {
  children: React.ReactNode;
  allowView?: boolean;
}

export default function ShiftGuard({ children, allowView = false }: ShiftGuardProps) {
  const router = useRouter();
  const { needsShiftCheck } = useParking();
  const shiftRequired = needsShiftCheck();

  if (!shiftRequired) {
    return <>{children}</>;
  }

  if (allowView) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <ShieldAlert size={48} color={Colors.warning} />
        </View>
        <Text style={styles.title}>Смена не открыта</Text>
        <Text style={styles.desc}>
          Чтобы работать с системой, сначала откройте смену в кассе
        </Text>
        <TouchableOpacity
          style={styles.openBtn}
          onPress={() => router.push('/(tabs)/more/cashregister' as any)}
          activeOpacity={0.7}
        >
          <PlayCircle size={20} color={Colors.white} />
          <Text style={styles.openBtnText}>Открыть смену</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.warning + '30',
    width: '100%',
    maxWidth: 360,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  desc: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    height: 52,
    borderRadius: 14,
    gap: 10,
    paddingHorizontal: 32,
    width: '100%',
  },
  openBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
