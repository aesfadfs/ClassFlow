import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

export async function pickScheduleFile() {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false, base64: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if ((asset.size ?? 0) > 2_000_000) throw new Error('请选择 2 MB 以内的课表文件');
  let text: string;
  if (Platform.OS === 'web') {
    try { text = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text(); }
    finally { if (asset.uri.startsWith('blob:')) URL.revokeObjectURL(asset.uri); }
  } else {
    const { File } = await import('expo-file-system');
    text = await new File(asset.uri).text();
  }
  return { name: asset.name, text };
}

export async function exportText(text: string, name: string, mimeType = 'application/json') {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }));
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    const [{ File, Paths }, Sharing] = await Promise.all([import('expo-file-system'), import('expo-sharing')]);
    if (!await Sharing.isAvailableAsync()) throw new Error('此设备暂不支持分享文件');
    const file = new File(Paths.cache, name);
    file.write(text);
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: '保存课表' });
  }
}
