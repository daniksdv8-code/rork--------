import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Modal, Platform, ActivityIndicator } from 'react-native';
import { Save, UserPlus, Trash2, Bell, Lock, Eye, EyeOff, UserCheck, UserX, User, KeyRound, Pencil, AlertTriangle, X, Download, Upload, Database, ShieldCheck } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { Tariffs } from '@/types';

export default function SettingsScreen() {
  const { isAdmin, currentUser, updateCurrentUser } = useAuth();
  const {
    tariffs, updateTariffs, users,
    addManagedUser, removeManagedUser, updateManagedUserPassword, toggleManagedUserActive,
    updateAdminProfile, resetAllData, createBackup, restoreBackup,
  } = useParking();

  const [backupLoading, setBackupLoading] = useState<boolean>(false);
  const [restoreLoading, setRestoreLoading] = useState<boolean>(false);
  const [showRestoreModal, setShowRestoreModal] = useState<boolean>(false);

  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [resetConfirmText, setResetConfirmText] = useState<string>('');

  const [editTariffs, setEditTariffs] = useState<Tariffs>(tariffs);

  useEffect(() => {
    setEditTariffs(tariffs);
  }, [tariffs]);
  const [newLogin, setNewLogin] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [editingPasswordId, setEditingPasswordId] = useState<string | null>(null);
  const [editPasswordValue, setEditPasswordValue] = useState<string>('');


  const [profileName, setProfileName] = useState<string>(currentUser?.name ?? '');
  const [profileLogin, setProfileLogin] = useState<string>(currentUser?.login ?? '');
  const [profileCurrentPassword, setProfileCurrentPassword] = useState<string>('');
  const [profileNewPassword, setProfileNewPassword] = useState<string>('');
  const [profileConfirmPassword, setProfileConfirmPassword] = useState<string>('');
  const [showProfileCurrentPass, setShowProfileCurrentPass] = useState<boolean>(false);
  const [showProfileNewPass, setShowProfileNewPass] = useState<boolean>(false);

  const [profileSaving, setProfileSaving] = useState<boolean>(false);

  const handleSaveProfile = useCallback(async () => {
    if (!currentUser) return;
    if (!profileCurrentPassword.trim()) {
      Alert.alert('Ошибка', 'Введите текущий пароль для подтверждения');
      return;
    }

    const updates: { login?: string; password?: string; name?: string } = {};
    let hasChanges = false;

    if (profileName.trim() && profileName.trim() !== currentUser.name) {
      updates.name = profileName.trim();
      hasChanges = true;
    }
    if (profileLogin.trim() && profileLogin.trim() !== currentUser.login) {
      if (profileLogin.trim().length < 3) {
        Alert.alert('Ошибка', 'Логин должен быть не менее 3 символов');
        return;
      }
      updates.login = profileLogin.trim();
      hasChanges = true;
    }
    if (profileNewPassword.trim()) {
      if (profileNewPassword.trim().length < 4) {
        Alert.alert('Ошибка', 'Новый пароль должен быть не менее 4 символов');
        return;
      }
      if (profileNewPassword !== profileConfirmPassword) {
        Alert.alert('Ошибка', 'Новый пароль и подтверждение не совпадают');
        return;
      }
      updates.password = profileNewPassword.trim();
      hasChanges = true;
    }

    if (!hasChanges) {
      Alert.alert('Внимание', 'Вы не внесли изменений');
      return;
    }

    setProfileSaving(true);
    try {
      const result = await updateAdminProfile(currentUser.id, profileCurrentPassword.trim(), updates);
      if (result.success) {
        const { password: _pw, ...safeUpdates } = updates as any;
        void updateCurrentUser(safeUpdates);
        setProfileCurrentPassword('');
        setProfileNewPassword('');
        setProfileConfirmPassword('');
        Alert.alert('Готово', 'Профиль обновлен');
      } else {
        Alert.alert('Ошибка', result.error ?? 'Не удалось обновить профиль');
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось связаться с сервером');
    } finally {
      setProfileSaving(false);
    }
  }, [currentUser, profileName, profileLogin, profileCurrentPassword, profileNewPassword, profileConfirmPassword, updateAdminProfile, updateCurrentUser]);

  const triggerWebDownload = useCallback((jsonString: string, fileName: string): boolean => {
    try {
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch {}
      }, 300);
      console.log(`[Backup] Web Blob download triggered: ${fileName}, blob size: ${blob.size}`);
      return true;
    } catch (blobErr) {
      console.log('[Backup] Blob download failed:', blobErr);
    }

    try {
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
      const a = document.createElement('a');
      a.href = dataUri;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { document.body.removeChild(a); } catch {}
      }, 300);
      console.log(`[Backup] Web data:URI download triggered: ${fileName}`);
      return true;
    } catch (dataUriErr) {
      console.log('[Backup] data:URI download failed:', dataUriErr);
    }

    try {
      const w = window.open('', '_blank');
      if (w) {
        w.document.write('<pre>' + jsonString.replace(/</g, '&lt;') + '</pre>');
        w.document.title = fileName;
        w.document.close();
        console.log('[Backup] Web window.open fallback triggered');
        return true;
      }
    } catch (winErr) {
      console.log('[Backup] window.open fallback failed:', winErr);
    }

    return false;
  }, []);

  const handleCreateBackup = useCallback(async () => {
    setBackupLoading(true);
    console.log('[Backup] === EXPORT STARTED ===' );
    try {
      let jsonString: string;
      try {
        jsonString = createBackup();
        console.log(`[Backup] Backup JSON created successfully, length: ${jsonString.length}`);
      } catch (readErr) {
        const errMsg = readErr instanceof Error ? readErr.message : String(readErr);
        console.log('[Backup] FAILED to create backup data:', errMsg);
        Alert.alert('Ошибка создания бэкапа', `Не удалось сформировать резервную копию.\n\nПричина: ${errMsg}\n\nДанные не затронуты.`);
        setBackupLoading(false);
        return;
      }

      if (!jsonString || jsonString.length < 10) {
        console.log('[Backup] Backup data empty or too short:', jsonString?.length);
        Alert.alert('Ошибка', 'Резервная копия пустая или содержит слишком мало данных. Данные не затронуты.');
        setBackupLoading(false);
        return;
      }

      const date = new Date();
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
      const fileName = `parking_backup_${dateStr}.json`;
      const sizeKB = (jsonString.length / 1024).toFixed(1);

      if (Platform.OS === 'web') {
        const downloadOk = triggerWebDownload(jsonString, fileName);
        if (downloadOk) {
          console.log(`[Backup] Web download OK: ${fileName}, size: ${sizeKB} KB`);
          Alert.alert('Готово', `Резервная копия скачана (${fileName}).\nРазмер: ${sizeKB} КБ`);
        } else {
          console.log('[Backup] All web download methods failed');
          Alert.alert('Ошибка скачивания', 'Не удалось скачать файл ни одним способом.\n\nПопробуйте использовать другой браузер (Chrome, Firefox).\n\nДанные не затронуты.');
        }
      } else {
        let nativeSuccess = false;
        try {
          const { File: FSFile, Paths: FSPaths } = await import('expo-file-system');
          const SharingModule = await import('expo-sharing');
          console.log('[Backup] Native: creating file in cache...');
          const file = new FSFile(FSPaths.cache, fileName);
          file.write(jsonString);
          console.log(`[Backup] Native: file written, uri: ${file.uri}, exists: ${file.exists}`);
          await SharingModule.shareAsync(file.uri, {
            mimeType: 'application/json',
            dialogTitle: 'Сохранить резервную копию',
            UTI: 'public.json',
          });
          try { file.delete(); } catch {}
          nativeSuccess = true;
          console.log('[Backup] Native: share completed successfully');
        } catch (nativeErr) {
          const errMsg = nativeErr instanceof Error ? nativeErr.message : String(nativeErr);
          console.log('[Backup] Native new API failed, trying legacy:', errMsg);
        }

        if (!nativeSuccess) {
          try {
            const FSLegacy = await import('expo-file-system/legacy');
            const SharingModule = await import('expo-sharing');
            const fileUri = FSLegacy.cacheDirectory + fileName;
            console.log(`[Backup] Native legacy: writing to ${fileUri}`);
            await FSLegacy.writeAsStringAsync(fileUri, jsonString, { encoding: FSLegacy.EncodingType.UTF8 });
            const fileInfo = await FSLegacy.getInfoAsync(fileUri);
            console.log(`[Backup] Native legacy: file info:`, fileInfo);
            await SharingModule.shareAsync(fileUri, {
              mimeType: 'application/json',
              dialogTitle: 'Сохранить резервную копию',
              UTI: 'public.json',
            });
            try { await FSLegacy.deleteAsync(fileUri, { idempotent: true }); } catch {}
            nativeSuccess = true;
            console.log('[Backup] Native legacy: share completed successfully');
          } catch (legacyErr) {
            const errMsg = legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
            console.log('[Backup] Native legacy also failed:', errMsg);
            Alert.alert('Ошибка сохранения', `Не удалось сохранить файл бэкапа.\n\nПричина: ${errMsg}\n\nДанные не затронуты.`);
          }
        }
      }
      console.log('[Backup] === EXPORT COMPLETED ===');
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.log('[Backup] UNEXPECTED error:', errMsg);
      Alert.alert('Ошибка', `Непредвиденная ошибка при создании бэкапа.\n\nПричина: ${errMsg}\n\nДанные не затронуты.`);
    } finally {
      setBackupLoading(false);
    }
  }, [createBackup, triggerWebDownload]);

  const stripBOM = useCallback((text: string): string => {
    if (text.charCodeAt(0) === 0xFEFF) return text.slice(1);
    if (text.startsWith('\uFEFF')) return text.slice(1);
    return text;
  }, []);

  const validateJsonContent = useCallback((text: string): { clean: string | null; error: string | null } => {
    if (!text || text.trim().length === 0) {
      return { clean: null, error: 'Файл пустой.' };
    }
    const cleaned = stripBOM(text).trim();
    if (cleaned.startsWith('<!') || cleaned.startsWith('<html') || cleaned.startsWith('<HTML')) {
      return { clean: null, error: 'Файл содержит HTML вместо JSON. Возможно, ссылка на бэкап ведёт на страницу ошибки или авторизации, а не на сам файл.' };
    }
    if (cleaned.startsWith('<')) {
      return { clean: null, error: 'Файл содержит XML/HTML вместо JSON. Убедитесь, что вы загружаете именно файл бэкапа (.json).' };
    }
    if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
      const snippet = cleaned.substring(0, 60);
      return { clean: null, error: `Файл не начинается с { или [.\n\nНачало файла: «${snippet}…»\n\nОжидается JSON-файл бэкапа ПаркМенеджера.` };
    }
    return { clean: cleaned, error: null };
  }, [stripBOM]);

  const readFileContent = useCallback(async (asset: { uri: string; name?: string | null; size?: number | null }): Promise<{ content: string | null; error: string | null }> => {
    console.log(`[Restore] Reading file: name=${asset.name}, size=${asset.size}, uri=${asset.uri?.substring(0, 120)}...`);
    const errors: string[] = [];

    if (Platform.OS === 'web') {
      try {
        const response = await fetch(asset.uri);
        if (!response.ok) {
          return { content: null, error: `HTTP ошибка при чтении: ${response.status} ${response.statusText}` };
        }
        const text = await response.text();
        console.log(`[Restore] Web: read ${text.length} chars, first 40: ${text.substring(0, 40)}`);
        const { clean, error } = validateJsonContent(text);
        if (error) return { content: null, error };
        return { content: clean, error: null };
      } catch (err) {
        console.log('[Restore] Web read failed:', err);
        return { content: null, error: `Ошибка чтения в браузере: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    try {
      const { File: FSFile } = await import('expo-file-system');
      const file = new FSFile(asset.uri);
      if (file.exists) {
        const text = file.textSync();
        console.log(`[Restore] Native (new API): read ${text.length} chars, first 40: ${text.substring(0, 40)}`);
        const { clean, error } = validateJsonContent(text);
        if (error) return { content: null, error };
        return { content: clean, error: null };
      } else {
        console.log('[Restore] File does not exist via new API:', asset.uri);
        errors.push('new API: файл не найден');
      }
    } catch (primaryErr) {
      const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      console.log('[Restore] Native primary read failed:', msg);
      errors.push(`new API: ${msg}`);
    }

    try {
      const FSLegacy = await import('expo-file-system/legacy');
      const text = await FSLegacy.readAsStringAsync(asset.uri);
      console.log(`[Restore] Native (legacy text): read ${text.length} chars, first 40: ${text.substring(0, 40)}`);
      const { clean, error } = validateJsonContent(text);
      if (error) return { content: null, error };
      return { content: clean, error: null };
    } catch (legacyErr) {
      const msg = legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
      console.log('[Restore] Native legacy text read failed:', msg);
      errors.push(`legacy text: ${msg}`);
    }

    try {
      const FSLegacy = await import('expo-file-system/legacy');
      const base64 = await FSLegacy.readAsStringAsync(asset.uri, { encoding: FSLegacy.EncodingType.Base64 });
      console.log(`[Restore] Native (legacy base64): read ${base64.length} base64 chars`);
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(bytes);
      console.log(`[Restore] Decoded base64 → ${text.length} chars, first 40: ${text.substring(0, 40)}`);
      const { clean, error } = validateJsonContent(text);
      if (error) return { content: null, error };
      return { content: clean, error: null };
    } catch (base64Err) {
      const msg = base64Err instanceof Error ? base64Err.message : String(base64Err);
      console.log('[Restore] Native base64 read failed:', msg);
      errors.push(`legacy base64: ${msg}`);
    }

    try {
      const response = await fetch(asset.uri);
      if (response.ok) {
        const text = await response.text();
        console.log(`[Restore] Fetch fallback: read ${text.length} chars, first 40: ${text.substring(0, 40)}`);
        const { clean, error } = validateJsonContent(text);
        if (error) return { content: null, error };
        return { content: clean, error: null };
      } else {
        errors.push(`fetch: HTTP ${response.status}`);
      }
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.log('[Restore] Fetch fallback failed:', msg);
      errors.push(`fetch: ${msg}`);
    }

    return {
      content: null,
      error: `Не удалось прочитать файл ни одним способом.\n\nПробовали:\n${errors.map(e => `• ${e}`).join('\n')}\n\nПопробуйте:\n• Убедиться, что файл имеет расширение .json\n• Загрузить файл повторно\n• Если бэкап с сайта — скачайте его вручную и затем выберите локальный файл`,
    };
  }, [validateJsonContent]);

  const handleRestoreBackup = useCallback(async () => {
    setRestoreLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        console.log('[Restore] User cancelled file picker');
        setRestoreLoading(false);
        return;
      }

      const asset = result.assets[0];

      const { content: jsonString, error: readError } = await readFileContent(asset);

      if (readError || !jsonString) {
        Alert.alert('Ошибка чтения файла', `${readError ?? 'Файл пустой или недоступен.'}\n\nДанные НЕ затронуты.`);
        setRestoreLoading(false);
        return;
      }

      if (jsonString.trim().length === 0) {
        Alert.alert('Ошибка', 'Файл бэкапа пустой. Выберите корректный файл.\n\nДанные НЕ затронуты.');
        setRestoreLoading(false);
        return;
      }

      console.log(`[Restore] File content ready, length=${jsonString.length}, passing to restoreBackup`);
      const restoreResult = await restoreBackup(jsonString);
      setShowRestoreModal(false);

      if (restoreResult.success) {
        const msgs = ['Данные успешно восстановлены из резервной копии.'];
        msgs.push('Авто-бэкап предыдущих данных сохранён на случай отката.');
        if (restoreResult.error) {
          msgs.push(`\nПредупреждение: ${restoreResult.error}`);
        }
        Alert.alert('Готово', msgs.join('\n'));
      } else {
        Alert.alert('Ошибка восстановления', `${restoreResult.error ?? 'Не удалось восстановить данные.'}\n\nДанные НЕ затронуты.`);
      }
    } catch (e) {
      console.log('[Restore] Unexpected error:', e);
      Alert.alert('Ошибка', `Непредвиденная ошибка при восстановлении.\n\n${e instanceof Error ? e.message : String(e)}\n\nДанные НЕ затронуты.`);
    } finally {
      setRestoreLoading(false);
    }
  }, [restoreBackup, readFileContent]);

  const handleSaveTariffs = useCallback(() => {
    updateTariffs(editTariffs);
    Alert.alert('Готово', 'Тарифы обновлены');
  }, [editTariffs, updateTariffs]);

  const [addingUser, setAddingUser] = useState<boolean>(false);

  const handleAddUser = useCallback(async () => {
    if (!newLogin.trim() || !newPassword.trim() || !newName.trim()) {
      Alert.alert('Ошибка', 'Заполните все поля');
      return;
    }
    if (newLogin.trim().length < 3) {
      Alert.alert('Ошибка', 'Логин должен быть не менее 3 символов');
      return;
    }
    if (newPassword.trim().length < 4) {
      Alert.alert('Ошибка', 'Пароль должен быть не менее 4 символов');
      return;
    }
    setAddingUser(true);
    try {
      const success = await addManagedUser(newLogin.trim(), newPassword.trim(), newName.trim());
      if (success) {
        setNewLogin('');
        setNewPassword('');
        setNewName('');
        Alert.alert('Готово', 'Менеджер добавлен');
      } else {
        Alert.alert('Ошибка', 'Пользователь с таким логином уже существует');
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось добавить менеджера');
    } finally {
      setAddingUser(false);
    }
  }, [newLogin, newPassword, newName, addManagedUser]);

  const handleRemoveUser = useCallback((userId: string, userName: string) => {
    Alert.alert('Удаление', `Удалить пользователя «${userName}»?\nОн больше не сможет войти в систему.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        const success = await removeManagedUser(userId);
        if (!success) {
          Alert.alert('Ошибка', 'Не удалось удалить пользователя');
        }
      } },
    ]);
  }, [removeManagedUser]);

  const handleToggleActive = useCallback((userId: string, userName: string, currentlyActive: boolean) => {
    const action = currentlyActive ? 'Заблокировать' : 'Разблокировать';
    Alert.alert(action, `${action} пользователя «${userName}»?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: action, onPress: async () => {
        const success = await toggleManagedUserActive(userId);
        if (!success) {
          Alert.alert('Ошибка', 'Не удалось изменить статус пользователя');
        }
      } },
    ]);
  }, [toggleManagedUserActive]);

  const [savingPassword, setSavingPassword] = useState<boolean>(false);

  const handleSavePassword = useCallback(async (userId: string) => {
    if (!editPasswordValue.trim() || editPasswordValue.trim().length < 4) {
      Alert.alert('Ошибка', 'Пароль должен быть не менее 4 символов');
      return;
    }
    setSavingPassword(true);
    try {
      const success = await updateManagedUserPassword(userId, editPasswordValue.trim());
      if (success) {
        setEditingPasswordId(null);
        setEditPasswordValue('');
        Alert.alert('Готово', 'Пароль изменен');
      } else {
        Alert.alert('Ошибка', 'Не удалось изменить пароль');
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось связаться с сервером');
    } finally {
      setSavingPassword(false);
    }
  }, [editPasswordValue, updateManagedUserPassword]);

  if (!isAdmin) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Доступ только для администратора</Text>
      </View>
    );
  }

  const managers = users.filter(u => u.role === 'manager' && !u.deleted);
  const admins = users.filter(u => u.role === 'admin');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Мой профиль</Text>
      </View>
      <View style={styles.card}>
        <View style={styles.profileHeader}>
          <View style={styles.profileAvatar}>
            <User size={24} color={Colors.white} />
          </View>
          <View style={styles.profileHeaderInfo}>
            <Text style={styles.profileHeaderName}>{currentUser?.name}</Text>
            <Text style={styles.profileHeaderRole}>Администратор</Text>
          </View>
        </View>

        <View style={styles.profileDivider} />

        <Text style={styles.fieldLabel}>Имя</Text>
        <View style={styles.profileInputRow}>
          <Pencil size={16} color={Colors.textMuted} style={styles.profileInputIcon} />
          <TextInput
            style={styles.profileInput}
            value={profileName}
            onChangeText={setProfileName}
            placeholder="Имя администратора"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        <Text style={styles.fieldLabel}>Логин</Text>
        <View style={styles.profileInputRow}>
          <User size={16} color={Colors.textMuted} style={styles.profileInputIcon} />
          <TextInput
            style={styles.profileInput}
            value={profileLogin}
            onChangeText={setProfileLogin}
            placeholder="Логин"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.profileDivider} />

        <Text style={styles.fieldLabel}>Текущий пароль *</Text>
        <View style={styles.profileInputRow}>
          <Lock size={16} color={Colors.textMuted} style={styles.profileInputIcon} />
          <TextInput
            style={styles.profileInput}
            value={profileCurrentPassword}
            onChangeText={setProfileCurrentPassword}
            placeholder="Введите текущий пароль"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry={!showProfileCurrentPass}
          />
          <TouchableOpacity onPress={() => setShowProfileCurrentPass(p => !p)} style={styles.profileEyeBtn}>
            {showProfileCurrentPass ? <EyeOff size={16} color={Colors.textMuted} /> : <Eye size={16} color={Colors.textMuted} />}
          </TouchableOpacity>
        </View>

        <Text style={styles.fieldLabel}>Новый пароль</Text>
        <View style={styles.profileInputRow}>
          <KeyRound size={16} color={Colors.textMuted} style={styles.profileInputIcon} />
          <TextInput
            style={styles.profileInput}
            value={profileNewPassword}
            onChangeText={setProfileNewPassword}
            placeholder="Новый пароль (от 4 символов)"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry={!showProfileNewPass}
          />
          <TouchableOpacity onPress={() => setShowProfileNewPass(p => !p)} style={styles.profileEyeBtn}>
            {showProfileNewPass ? <EyeOff size={16} color={Colors.textMuted} /> : <Eye size={16} color={Colors.textMuted} />}
          </TouchableOpacity>
        </View>

        <Text style={styles.fieldLabel}>Подтверждение нового пароля</Text>
        <View style={styles.profileInputRow}>
          <KeyRound size={16} color={Colors.textMuted} style={styles.profileInputIcon} />
          <TextInput
            style={styles.profileInput}
            value={profileConfirmPassword}
            onChangeText={setProfileConfirmPassword}
            placeholder="Повторите новый пароль"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry={!showProfileNewPass}
          />
        </View>

        <TouchableOpacity style={[styles.profileSaveBtn, profileSaving && { opacity: 0.6 }]} onPress={handleSaveProfile} activeOpacity={0.7} disabled={profileSaving}>
          <Save size={18} color={Colors.white} />
          <Text style={styles.saveBtnText}>Сохранить изменения</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Тарифы</Text>
      <View style={styles.card}>
        <View style={styles.tariffRow}>
          <Text style={styles.tariffLabel}>Месяц, наличные (₽/день)</Text>
          <TextInput
            style={styles.tariffInput}
            value={String(editTariffs.monthlyCash)}
            onChangeText={v => setEditTariffs(prev => ({ ...prev, monthlyCash: Number(v) || 0 }))}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.tariffRow}>
          <Text style={styles.tariffLabel}>Месяц, безнал (₽/день)</Text>
          <TextInput
            style={styles.tariffInput}
            value={String(editTariffs.monthlyCard)}
            onChangeText={v => setEditTariffs(prev => ({ ...prev, monthlyCard: Number(v) || 0 }))}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.tariffRow}>
          <Text style={styles.tariffLabel}>Разово, наличные (₽)</Text>
          <TextInput
            style={styles.tariffInput}
            value={String(editTariffs.onetimeCash)}
            onChangeText={v => setEditTariffs(prev => ({ ...prev, onetimeCash: Number(v) || 0 }))}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.tariffRow}>
          <Text style={styles.tariffLabel}>Разово, безнал (₽)</Text>
          <TextInput
            style={styles.tariffInput}
            value={String(editTariffs.onetimeCard)}
            onChangeText={v => setEditTariffs(prev => ({ ...prev, onetimeCard: Number(v) || 0 }))}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.lombardDivider} />
        <View style={styles.lombardHeader}>
          <Text style={styles.lombardHeaderText}>Ломбард</Text>
        </View>
        <View style={styles.tariffRow}>
          <Text style={styles.tariffLabel}>Ломбард (₽/сутки)</Text>
          <TextInput
            style={styles.tariffInput}
            value={String(editTariffs.lombardRate ?? 150)}
            onChangeText={v => setEditTariffs(prev => ({ ...prev, lombardRate: Number(v) || 0 }))}
            keyboardType="numeric"
          />
        </View>
        <Text style={styles.lombardNote}>Ставка применяется к новым ломбард-заездам. Действующие заезды сохраняют ставку на момент постановки.</Text>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveTariffs} activeOpacity={0.7}>
          <Save size={18} color={Colors.white} />
          <Text style={styles.saveBtnText}>Сохранить тарифы</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Администраторы</Text>
      </View>
      <View style={styles.card}>
        {admins.map(u => (
          <View key={u.id} style={styles.userRow}>
            <View style={styles.userBadge}>
              <Text style={styles.userBadgeText}>{u.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{u.name}</Text>
              <Text style={styles.userRole}>Администратор • {u.login}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Менеджеры ({managers.length})</Text>
      </View>
      <View style={styles.card}>
        {managers.length === 0 && (
          <Text style={styles.emptyListText}>Нет менеджеров. Добавьте первого ниже.</Text>
        )}
        {managers.map(u => (
          <View key={u.id} style={[styles.userRow, !u.active && styles.userRowInactive]}>
            <View style={[styles.userBadge, !u.active && styles.userBadgeInactive]}>
              <Text style={styles.userBadgeText}>{u.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.userInfo}>
              <View style={styles.userNameRow}>
                <Text style={[styles.userName, !u.active && styles.userNameInactive]}>{u.name}</Text>
                {!u.active && (
                  <View style={styles.blockedBadge}>
                    <Text style={styles.blockedBadgeText}>Заблокирован</Text>
                  </View>
                )}
              </View>
              <Text style={styles.userRole}>
                {u.login}
              </Text>
              {editingPasswordId === u.id && (
                <View style={styles.editPasswordRow}>
                  <TextInput
                    style={styles.editPasswordInput}
                    placeholder="Новый пароль"
                    placeholderTextColor={Colors.textMuted}
                    value={editPasswordValue}
                    onChangeText={setEditPasswordValue}
                    autoFocus
                  />
                  <TouchableOpacity style={[styles.editPasswordSave, savingPassword && { opacity: 0.6 }]} onPress={() => handleSavePassword(u.id)} disabled={savingPassword}>
                    <Save size={16} color={Colors.white} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editPasswordCancel} onPress={() => { setEditingPasswordId(null); setEditPasswordValue(''); }}>
                    <Text style={styles.editPasswordCancelText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <View style={styles.userActions}>
              <TouchableOpacity
                onPress={() => handleToggleActive(u.id, u.name, u.active !== false)}
                style={styles.userActionBtn}
              >
                {u.active !== false
                  ? <UserCheck size={18} color={Colors.success} />
                  : <UserX size={18} color={Colors.textMuted} />
                }
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setEditingPasswordId(u.id); setEditPasswordValue(''); }}
                style={styles.userActionBtn}
              >
                <Lock size={18} color={Colors.info} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleRemoveUser(u.id, u.name)} style={styles.userActionBtn}>
                <Trash2 size={18} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Добавить менеджера</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.formInput}
          placeholder="ФИО"
          placeholderTextColor={Colors.textMuted}
          value={newName}
          onChangeText={setNewName}
        />
        <TextInput
          style={styles.formInput}
          placeholder="Логин (от 3 символов)"
          placeholderTextColor={Colors.textMuted}
          value={newLogin}
          onChangeText={setNewLogin}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.formInput}
          placeholder="Пароль (от 4 символов)"
          placeholderTextColor={Colors.textMuted}
          value={newPassword}
          onChangeText={setNewPassword}
        />
        <TouchableOpacity style={[styles.addBtn, addingUser && { opacity: 0.6 }]} onPress={handleAddUser} activeOpacity={0.7} disabled={addingUser}>
          <UserPlus size={18} color={Colors.white} />
          <Text style={styles.addBtnText}>Добавить менеджера</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Уведомления</Text>
      <View style={styles.card}>
        <View style={styles.notifRow}>
          <Bell size={20} color={Colors.textMuted} />
          <Text style={styles.notifText}>SMS и WhatsApp уведомления будут доступны в следующей версии</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Резервное копирование</Text>
      <View style={[styles.card, styles.backupCard]}>
        <View style={styles.backupInfo}>
          <Database size={20} color={Colors.info} />
          <View style={styles.backupTextBlock}>
            <Text style={styles.backupTitle}>Создать резервную копию</Text>
            <Text style={styles.backupDesc}>Сохраните все данные системы в файл. Можно будет восстановить при сбое.</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.backupBtn}
          onPress={handleCreateBackup}
          activeOpacity={0.7}
          disabled={backupLoading}
        >
          {backupLoading ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Download size={18} color={Colors.white} />
          )}
          <Text style={styles.backupBtnText}>{backupLoading ? 'Создание...' : 'Скачать бэкап'}</Text>
        </TouchableOpacity>

        <View style={styles.backupDivider} />

        <View style={styles.backupInfo}>
          <ShieldCheck size={20} color={Colors.success} />
          <View style={styles.backupTextBlock}>
            <Text style={styles.backupTitle}>Восстановить из копии</Text>
            <Text style={styles.backupDesc}>Загрузите ранее сохранённый файл бэкапа для восстановления данных.</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.restoreBtn}
          onPress={() => setShowRestoreModal(true)}
          activeOpacity={0.7}
          disabled={restoreLoading}
        >
          {restoreLoading ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Upload size={18} color={Colors.white} />
          )}
          <Text style={styles.restoreBtnText}>{restoreLoading ? 'Восстановление...' : 'Загрузить бэкап'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Опасная зона</Text>
      <View style={[styles.card, styles.dangerCard]}>
        <View style={styles.dangerInfo}>
          <AlertTriangle size={20} color={Colors.danger} />
          <View style={styles.dangerTextBlock}>
            <Text style={styles.dangerTitle}>Сброс всех данных</Text>
            <Text style={styles.dangerDesc}>Удаляет всех клиентов, машины, заезды, оплаты, долги, смены, отчёты. Сохраняется только учётная запись администратора.</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.resetBtn}
          onPress={() => { setShowResetModal(true); setResetConfirmText(''); }}
          activeOpacity={0.7}
        >
          <Trash2 size={18} color={Colors.white} />
          <Text style={styles.resetBtnText}>Сбросить все данные</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showResetModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalWarningIcon}>
                <AlertTriangle size={28} color={Colors.danger} />
              </View>
              <TouchableOpacity onPress={() => setShowResetModal(false)} style={styles.modalCloseBtn}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalTitle}>Полный сброс данных</Text>
            <Text style={styles.modalDesc}>
              Это действие необратимо. Будут удалены все клиенты, машины, заезды, оплаты, долги, смены и отчёты.
            </Text>
            <Text style={styles.modalDesc}>
              Сохранится только ваш логин и пароль администратора.
            </Text>
            <Text style={styles.modalConfirmLabel}>
              Для подтверждения введите слово <Text style={styles.modalConfirmWord}>СБРОС</Text>
            </Text>
            <TextInput
              style={styles.modalInput}
              value={resetConfirmText}
              onChangeText={setResetConfirmText}
              placeholder="Введите СБРОС"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowResetModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  resetConfirmText.trim() !== 'СБРОС' && styles.modalConfirmBtnDisabled,
                ]}
                onPress={() => {
                  if (resetConfirmText.trim() === 'СБРОС') {
                    void resetAllData();
                    setShowResetModal(false);
                    setResetConfirmText('');
                    Alert.alert('Готово', 'Все данные системы были сброшены.');
                  }
                }}
                activeOpacity={0.7}
                disabled={resetConfirmText.trim() !== 'СБРОС'}
              >
                <Trash2 size={16} color={Colors.white} />
                <Text style={styles.modalConfirmText}>Сбросить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showRestoreModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRestoreModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalWarningIcon, { backgroundColor: Colors.warningLight }]}>
                <Upload size={28} color={Colors.warning} />
              </View>
              <TouchableOpacity onPress={() => setShowRestoreModal(false)} style={styles.modalCloseBtn}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalTitle}>Восстановление из бэкапа</Text>
            <Text style={styles.modalDesc}>
              Все текущие данные будут заменены данными из резервной копии.
            </Text>
            <Text style={[styles.modalDesc, { color: Colors.success }]}>
              Перед загрузкой автоматически создаётся бэкап текущих данных — при необходимости можно откатить.
            </Text>
            <Text style={styles.modalDesc}>
              Убедитесь, что вы выбираете правильный файл бэкапа.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowRestoreModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: Colors.warning }]}
                onPress={handleRestoreBackup}
                activeOpacity={0.7}
                disabled={restoreLoading}
              >
                {restoreLoading ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Upload size={16} color={Colors.white} />
                )}
                <Text style={styles.modalConfirmText}>Выбрать файл</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={{ height: 32 }} />
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
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  togglePassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  togglePassText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 16,
    gap: 12,
  },
  tariffRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tariffLabel: {
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  tariffInput: {
    width: 80,
    height: 40,
    backgroundColor: Colors.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlign: 'center' as const,
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    height: 44,
    borderRadius: 10,
    gap: 8,
    marginTop: 4,
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  userRowInactive: {
    opacity: 0.6,
  },
  userBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  userBadgeInactive: {
    backgroundColor: Colors.textMuted,
  },
  userBadgeText: {
    color: Colors.white,
    fontWeight: '700' as const,
    fontSize: 15,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  userNameInactive: {
    color: Colors.textMuted,
  },
  blockedBadge: {
    backgroundColor: Colors.dangerLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  blockedBadgeText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  userRole: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  userActions: {
    flexDirection: 'row',
    gap: 10,
  },
  userActionBtn: {
    padding: 4,
  },
  editPasswordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  editPasswordInput: {
    flex: 1,
    height: 36,
    backgroundColor: Colors.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    fontSize: 13,
    color: Colors.text,
  },
  editPasswordSave: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPasswordCancel: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPasswordCancelText: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  emptyListText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center' as const,
    paddingVertical: 12,
  },
  formInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    height: 44,
    borderRadius: 10,
    gap: 8,
  },
  addBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notifText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  backupCard: {
    borderColor: Colors.infoLight,
    backgroundColor: '#FAFCFF',
  },
  backupInfo: {
    flexDirection: 'row',
    gap: 12,
  },
  backupTextBlock: {
    flex: 1,
  },
  backupTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  backupDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  backupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.info,
    height: 44,
    borderRadius: 10,
    gap: 8,
    marginTop: 4,
  },
  backupBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  backupDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    height: 44,
    borderRadius: 10,
    gap: 8,
    marginTop: 4,
  },
  restoreBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  dangerCard: {
    borderColor: Colors.dangerLight,
    backgroundColor: '#FFFBFB',
  },
  dangerInfo: {
    flexDirection: 'row',
    gap: 12,
  },
  dangerTextBlock: {
    flex: 1,
  },
  dangerTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.danger,
    marginBottom: 4,
  },
  dangerDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.danger,
    height: 44,
    borderRadius: 10,
    gap: 8,
    marginTop: 4,
  },
  resetBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalWarningIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  modalConfirmLabel: {
    fontSize: 14,
    color: Colors.text,
    marginTop: 8,
    marginBottom: 8,
  },
  modalConfirmWord: {
    fontWeight: '700' as const,
    color: Colors.danger,
  },
  modalInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlign: 'center' as const,
    letterSpacing: 2,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  modalConfirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalConfirmBtnDisabled: {
    opacity: 0.4,
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeaderInfo: {
    flex: 1,
  },
  profileHeaderName: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  profileHeaderRole: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  profileDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 4,
    marginTop: 4,
  },
  profileInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 44,
    paddingHorizontal: 12,
  },
  profileInputIcon: {
    marginRight: 8,
  },
  profileInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    height: 44,
  },
  profileEyeBtn: {
    padding: 6,
  },
  profileSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    height: 44,
    borderRadius: 10,
    gap: 8,
    marginTop: 4,
  },
  lombardDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  lombardHeader: {
    marginTop: 4,
  },
  lombardHeaderText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#b45309',
  },
  lombardNote: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginTop: -4,
  },
});
