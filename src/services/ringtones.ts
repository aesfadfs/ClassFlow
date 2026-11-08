import * as DocumentPicker from 'expo-document-picker';
import { uid } from '../domain/schedule';
import { MAX_RINGTONE_BYTES, RINGTONE_EXTENSIONS, type CustomSound } from '../domain/reminders';

const FOLDER = 'ringtones';

/**
 * Lets the user pick an audio file for class reminders and keeps a private copy
 * inside the app, so the tone keeps working after the original is moved or deleted.
 * The previous custom tone is removed. Returns null when the user cancels.
 */
export async function pickRingtone(): Promise<CustomSound | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const extension = /\.([a-z0-9]+)$/i.exec(asset.name)?.[1]?.toLowerCase() ?? '';
  if (!RINGTONE_EXTENSIONS.includes(extension)) throw new Error(`不支持这种格式，请选择 ${RINGTONE_EXTENSIONS.slice(0, 8).join(' / ')} 等音频文件`);
  if ((asset.size ?? 0) > MAX_RINGTONE_BYTES) throw new Error('铃声文件太大，请选择 20 MB 以内的音频');
  const { Directory, File, Paths } = await import('expo-file-system');
  const folder = new Directory(Paths.document, FOLDER);
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  const target = new File(folder, `ringtone-${uid()}.${extension}`);
  new File(asset.uri).copySync(target);
  // Only one custom tone is kept.
  for (const item of folder.list()) if (item instanceof File && item.uri !== target.uri) { try { item.delete(); } catch { /* still in use */ } }
  return { uri: target.uri, name: asset.name.replace(/\.[^.]+$/, '').slice(0, 80) || '自定义铃声' };
}
