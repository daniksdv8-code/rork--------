import { Platform, Alert } from 'react-native';

export interface FileSaveOptions {
  content: string;
  fileName: string;
  mimeType: string;
  dialogTitle?: string;
  UTI?: string;
}

async function saveNative(options: FileSaveOptions): Promise<boolean> {
  const { content, fileName, mimeType, dialogTitle, UTI } = options;
  const errors: string[] = [];

  try {
    const FSLegacy = await import('expo-file-system/legacy');
    const cacheDir = FSLegacy.cacheDirectory;
    if (!cacheDir) {
      errors.push('cacheDirectory is null');
      throw new Error('cacheDirectory is null');
    }

    const fileUri = cacheDir + fileName;
    console.log(`[FileSave] Writing to: ${fileUri}, content length: ${content.length}`);

    await FSLegacy.writeAsStringAsync(fileUri, content, {
      encoding: FSLegacy.EncodingType.UTF8,
    });

    const info = await FSLegacy.getInfoAsync(fileUri);
    if (!info.exists) {
      console.log('[FileSave] File not found after write');
      errors.push('File not found after writeAsStringAsync');
      throw new Error('File not found after write');
    }
    console.log(`[FileSave] File written OK, size: ${info.size} bytes`);

    const SharingModule = await import('expo-sharing');
    const available = await SharingModule.isAvailableAsync();
    if (!available) {
      console.log('[FileSave] Sharing not available on this device');
      Alert.alert(
        'Файл сохранён',
        `Файл сохранён во временное хранилище:\n${fileUri}\n\nФункция «Поделиться» недоступна на этом устройстве.`
      );
      return true;
    }

    await SharingModule.shareAsync(fileUri, {
      mimeType,
      dialogTitle: dialogTitle ?? `Сохранить ${fileName}`,
      UTI: UTI ?? (mimeType === 'application/json' ? 'public.json' : 'public.comma-separated-values-text'),
    });

    console.log('[FileSave] Share dialog completed');

    try {
      await FSLegacy.deleteAsync(fileUri, { idempotent: true });
    } catch {}

    return true;
  } catch (legacyErr) {
    const msg = legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
    console.log('[FileSave] Legacy API failed:', msg);
    errors.push(`legacy: ${msg}`);
  }

  try {
    const { File, Paths } = await import('expo-file-system');
    const SharingModule = await import('expo-sharing');

    const file = new File(Paths.cache, fileName);
    if (file.exists) {
      try { file.delete(); } catch {}
    }
    file.create({ overwrite: true });
    file.write(content);
    console.log(`[FileSave] New API: file written to ${file.uri}, size: ${file.size}`);

    const available = await SharingModule.isAvailableAsync();
    if (available) {
      await SharingModule.shareAsync(file.uri, {
        mimeType,
        dialogTitle: dialogTitle ?? `Сохранить ${fileName}`,
        UTI: UTI ?? (mimeType === 'application/json' ? 'public.json' : 'public.comma-separated-values-text'),
      });
    }

    try { file.delete(); } catch {}
    return true;
  } catch (newApiErr) {
    const msg = newApiErr instanceof Error ? newApiErr.message : String(newApiErr);
    console.log('[FileSave] New API failed:', msg);
    errors.push(`new API: ${msg}`);
  }

  console.log('[FileSave] All native methods failed:', errors.join('; '));
  Alert.alert(
    'Ошибка сохранения',
    `Не удалось сохранить файл.\n\n${errors.map(e => `• ${e}`).join('\n')}`
  );
  return false;
}

function saveWeb(options: FileSaveOptions): boolean {
  const { content, fileName, mimeType } = options;
  console.log(`[FileSave] Web save: ${fileName}, ${content.length} chars`);

  try {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const blobUrl = URL.createObjectURL(blob);

    const targets = [
      () => { try { return window.top; } catch { return null; } },
      () => { try { return window.parent; } catch { return null; } },
      () => window,
    ];

    for (const getTarget of targets) {
      try {
        const w = getTarget();
        if (!w || !w.document) continue;
        const link = w.document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        link.style.display = 'none';
        w.document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          try { w.document.body.removeChild(link); } catch {}
          try { URL.revokeObjectURL(blobUrl); } catch {}
        }, 10000);
        console.log('[FileSave] Web blob download triggered');
        return true;
      } catch (e) {
        console.log('[FileSave] Web target failed:', e);
      }
    }
  } catch (blobErr) {
    console.log('[FileSave] Blob creation failed:', blobErr);
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

  try {
    const w = window.open('', '_blank');
    if (w && w.document) {
      w.document.open();
      w.document.write(
        '<html><head><meta charset="utf-8"><title>' +
        fileName +
        '</title></head><body><pre>' +
        content.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
        '</pre></body></html>'
      );
      w.document.close();
      console.log('[FileSave] Opened content in new window');
      return true;
    }
  } catch (winErr) {
    console.log('[FileSave] window.open failed:', winErr);
  }

  return false;
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
