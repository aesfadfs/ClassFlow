import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { uid } from '../domain/schedule';

const MAX_BYTES = 20_000_000;

// Shrinks a picked photo on the web so it fits in browser storage.
async function webDataUrl(file: Blob, maxSide: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('无法读取这张图片'));
      element.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

/**
 * Lets the user pick a photo and keeps a private copy inside the app, so the
 * picture keeps working after the original is moved or deleted.
 * Returns null when the user cancels.
 */
export async function pickImage(purpose: 'background' | 'card'): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if ((asset.size ?? 0) > MAX_BYTES) throw new Error('图片太大，请选择 20 MB 以内的图片');
  if (asset.mimeType && !asset.mimeType.startsWith('image/')) throw new Error('请选择图片文件');
  if (Platform.OS === 'web') {
    try {
      const blob = asset.file ?? await (await fetch(asset.uri)).blob();
      return await webDataUrl(blob, purpose === 'background' ? 1600 : 900);
    } finally { if (asset.uri.startsWith('blob:')) URL.revokeObjectURL(asset.uri); }
  }
  const { Directory, File, Paths } = await import('expo-file-system');
  const folder = new Directory(Paths.document, 'images');
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  const extension = /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.exec(asset.name)?.[1]?.toLowerCase() ?? 'jpg';
  const target = new File(folder, `${purpose}-${uid()}.${extension}`);
  new File(asset.uri).copySync(target);
  return target.uri;
}

/** Removes stored pictures no longer used by the background or any card. */
export async function cleanUpImages(keep: Set<string>) {
  if (Platform.OS === 'web') return;
  try {
    const { Directory, File, Paths } = await import('expo-file-system');
    const folder = new Directory(Paths.document, 'images');
    if (!folder.exists) return;
    const name = (uri: string) => decodeURIComponent(uri.split('/').pop() ?? '');
    const kept = new Set([...keep].map(name));
    for (const item of folder.list()) if (item instanceof File && !kept.has(name(item.uri))) item.delete();
  } catch { /* best effort */ }
}
