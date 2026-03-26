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
    return false;
  }
}

function isInsideIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

function saveWebViaBlob(content: string, fileName: string, mimeType: string): boolean {
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

    console.log('[FileSave] Web blob download triggered');
    return true;
  } catch (err) {
    console.log('[FileSave] Blob download failed:', err);
    return false;
  }
}

function saveWebViaNewWindow(content: string, fileName: string, mimeType: string): boolean {
  try {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, '_blank');
    if (win) {
      setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch {} }, 30000);
      console.log('[FileSave] window.open with blob URL succeeded');
      return true;
    }
    URL.revokeObjectURL(blobUrl);
    console.log('[FileSave] window.open returned null (blocked)');
    return false;
  } catch (err) {
    console.log('[FileSave] window.open blob failed:', err);
    return false;
  }
}

function saveWebViaDataUri(content: string, fileName: string, mimeType: string): boolean {
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
  } catch (err) {
    console.log('[FileSave] Data URI failed:', err);
    return false;
  }
}

function saveWebViaPostMessage(content: string, fileName: string, mimeType: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.parent || window.parent === window) {
      return false;
    }
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const blobUrl = URL.createObjectURL(blob);
    window.parent.postMessage({
      type: 'download',
      url: blobUrl,
      fileName,
    }, '*');
    console.log('[FileSave] postMessage to parent sent for download');
    setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch {} }, 60000);
    return false;
  } catch {
    return false;
  }
}

function saveWeb(options: FileSaveOptions): boolean {
  const { content, fileName, mimeType } = options;
  console.log(`[FileSave] Web save: ${fileName}, ${content.length} chars, iframe=${isInsideIframe()}`);

  if (!isInsideIframe()) {
    if (saveWebViaBlob(content, fileName, mimeType)) return true;
    if (saveWebViaDataUri(content, fileName, mimeType)) return true;
    return false;
  }

  if (saveWebViaBlob(content, fileName, mimeType)) {
    console.log('[FileSave] Blob download attempted in iframe (may not work)');
  }

  saveWebViaPostMessage(content, fileName, mimeType);

  if (saveWebViaNewWindow(content, fileName, mimeType)) return true;

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

export async function saveFile(options: FileSaveOptions): Promise<boolean> {
  console.log(`[FileSave] saveFile called: platform=${Platform.OS}, file=${options.fileName}, size=${options.content.length}`);

  if (Platform.OS !== 'web') {
    return saveNative(options);
  }

  const webOk = saveWeb(options);
  if (webOk && !isInsideIframe()) return true;

  return false;
}
