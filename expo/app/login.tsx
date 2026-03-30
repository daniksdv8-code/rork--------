import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock, User } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';

export default function LoginScreen() {
  const router = useRouter();
  const { setSession } = useAuth();
  const { validateLogin, isLoaded, isServerSynced, getActiveManagerShift } = useParking();
  const [syncTimeout, setSyncTimeout] = useState<boolean>(false);

  useEffect(() => {
    if (isServerSynced) return;
    const timer = setTimeout(() => {
      console.log('[Login] Server sync timeout, allowing local login');
      setSyncTimeout(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [isServerSynced]);

  const isReady = isLoaded && (isServerSynced || syncTimeout);
  const [loginValue, setLoginValue] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleLogin = async () => {
    if (!loginValue.trim() || !password.trim()) {
      Alert.alert('Ошибка', 'Введите логин и пароль');
      return;
    }
    setIsSubmitting(true);
    try {
      const user = await validateLogin(loginValue.trim(), password);
      if (user) {
        if (user.role === 'manager') {
          const activeManagerShift = getActiveManagerShift();
          if (activeManagerShift && activeManagerShift.operatorId !== user.id) {
            Alert.alert(
              'Смена другого менеджера',
              `Сейчас идёт смена менеджера «${activeManagerShift.operatorName}».\n\nЧтобы войти, попросите администратора закрыть текущую смену через раздел «Касса».`,
              [{ text: 'Понятно' }]
            );
            setIsSubmitting(false);
            return;
          }
        }
        await setSession(user);
        router.replace('/(tabs)/(dashboard)');
      } else {
        Alert.alert(
          'Ошибка входа',
          'Неверный логин или пароль, либо аккаунт заблокирован.\n\nЕсли вы недавно восстанавливали данные из бэкапа, пароль менеджера мог сброситься на логин. Попробуйте ввести логин в качестве пароля или обратитесь к администратору.'
        );
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось выполнить вход. Проверьте подключение к сети.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isReady) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.white} />
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16, fontSize: 14 }}>
          Синхронизация данных...
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <View style={styles.logoBlock}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>P</Text>
          </View>
          <Text style={styles.title}>ПаркМенеджер</Text>
          <Text style={styles.subtitle}>Управление парковкой</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputRow}>
            <User size={20} color={Colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Логин"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={loginValue}
              onChangeText={setLoginValue}
              autoCapitalize="none"
              autoCorrect={false}
              testID="login-input"
            />
          </View>
          <View style={styles.inputRow}>
            <Lock size={20} color={Colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Пароль"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              testID="password-input"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, isSubmitting && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isSubmitting}
            activeOpacity={0.8}
            testID="login-button"
          >
            <Text style={styles.buttonText}>{isSubmitting ? 'Вход...' : 'Войти'}</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>Данные для входа выдает администратор</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoBlock: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.white,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
  },
  form: {
    gap: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    gap: 12,
  },
  input: {
    flex: 1,
    color: Colors.white,
    fontSize: 16,
  },
  button: {
    backgroundColor: Colors.white,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.primary,
    fontSize: 17,
    fontWeight: '600' as const,
  },
  hint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center' as const,
    marginTop: 8,
  },
});
