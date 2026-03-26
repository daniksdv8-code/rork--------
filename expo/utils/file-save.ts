import { Platform, Alert, Linking } from 'react-native';

export interface FileSaveOptions {
  content: string;
  fileName: string;
  mimeType: string;
  dialogTitle?: string;
  UTI?: string;
}

async function saveNative(options: FileSaveOptions): Promise<boolean> {
  const { content, fileName, mimeType, dialogTitle, UTI } = options;

  try {
    const FSLegacy = await import('expo-file-system/legacy');
    const cacheDir = FSLegacy.cacheDirectory;
    if (!cacheDir) {
      console.log('[FileSave] cacheDirectory is null');
      Alert.alert('Ошибка', 'Не удалось получить директорию кэша устройства.');
      return false;
    }

    const fileUri = cacheDir + fileName;
    console.log(`[FileSave] Writing to: ${fileUri}, content length: ${content.length}`);

    await FSLegacy.writeAsStringAsync(fileUri, content, {
      encoding: FSLegacy.EncodingType.UTF8,
    });

    const info = await FSLegacy.getInfoAsync(fileUri);
    if (!info.exists) {
      console.log('[FileSave] File not found after write');
      Alert.alert('Ошибка', 'Файл не найден после записи.');
      return false;
    }
    console.log(`[FileSave] File written OK, size: ${info.size} bytes`);

    let shared = false;
    try {
      const SharingModule = await import('expo-sharing');
      const available = await SharingModule.isAvailableAsync();
      if (available) {
        await SharingModule.shareAsync(fileUri, {
          mimeType,
          dialogTitle: dialogTitle ?? `Сохранить ${fileName}`,
          UTI: UTI ?? (mimeType === 'application/json' ? 'public.json' : 'public.comma-separated-values-text'),
        });
        shared = true;
        console.log('[FileSave] Share dialog completed');
      }
    } catch (shareErr) {
      console.log('[FileSave] Sharing failed:', shareErr instanceof Error ? shareErr.message : String(shareErr));
    }

    if (!shared) {
      Alert.alert(
        'Файл сохранён',
        `Файл сохранён во временное хранилище:\n${fileUri}\n\nФункция «Поделиться» недоступна на этом устройстве.`
      );
    }

    try {
      await FSLegacy.deleteAsync(fileUri, { idempotent: true });
    } catch {}

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[FileSave] Native save failed:', msg);
    Alert.alert(
      'Ошибка сохранения',
      `Не удалось сохранить файл на устройство.\n\nОшибка: ${msg}\n\nПопробуйте скачать бэкап через браузер, открыв ссылку на бэкап вручную.`
    );
    return false;
  }
}

function saveWeb(options: FileSaveOptions): boolean {
  const { content, fileName, mimeType } = options;
  console.log(`[FileSave] Web save: ${fileName}, ${content.length} chars`);

  try {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try { document.body.removeChild(link); } catch {}
      try { URL.revokeObjectURL(blobUrl); } catch {}
    }, 10000);
    console.log('[FileSave] Web blob download triggered via document');
    return true;
  } catch (blobErr) {
    console.log('[FileSave] Blob creation/click failed:', blobErr);
  }

  try {
    const dataUri = `data:${mimeType};charset=utf-8,` + encodeURIComponent(content);
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { try { document.body.removeChild(link); } catch {} }, 10000);
    console.log('[FileSave] Web data URI download triggered');
    return true;
  } catch (dataErr) {
    console.log('[FileSave] Data URI failed:', dataErr);
  }

  return false;
}

export function openBackupUrl(url: string): void {
  console.log(`[FileSave] Opening backup URL: ${url}`);
  if (Platform.OS === 'web') {
    try {
      window.open(url, '_blank');
      return;
    } catch (e) {
      console.log('[FileSave] window.open failed:', e);
    }
  }
  Linking.openURL(url).catch(err => {
    console.log('[FileSave] Linking.openURL failed:', err);
    Alert.alert('Ошибка', `Не удалось открыть ссылку:\n${url}`);
  });
}

async function copyToClipboardFallback(content: string, fileName: string): Promise<boolean> {
  try {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(content);
    Alert.alert(
      'Скопировано в буфер',
      `Скачивание не сработало в текущем окружении.\n\nДанные скопированы в буфер обмена.\nВставьте в текстовый файл и сохраните как ${fileName}`
    );
    return true;
  } catch {
    return false;
  }
}

export async function saveFile(options: FileSaveOptions): Promise<boolean> {
  console.log(`[FileSave] saveFile called: platform=${Platform.OS}, file=${options.fileName}, size=${options.content.length}`);

  if (Platform.OS !== 'web') {
    return saveNative(options);
  }

  const webOk = saveWeb(options);
  if (webOk) return true;

  const clipOk = await copyToClipboardFallback(options.content, options.fileName);
  if (clipOk) return true;

  Alert.alert('Ошибка', 'Не удалось скачать или скопировать файл. Попробуйте другой браузер.');
  return false;
}
