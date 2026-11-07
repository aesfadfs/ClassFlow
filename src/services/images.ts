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
  return (await storePicked(result.assets[0], purpose, 'image')).uri;
}

const MAX_VIDEO_BYTES = 60_000_000;
/** Video wallpapers need a file that survives restarts, which the web cannot keep. */
export const videoWallpaperSupported = Platform.OS !== 'web';

/**
 * Picks a wallpaper file and keeps a private copy inside the app (same folder as
 * other pictures, so unused ones are cleaned up). GIFs are detected from the file
 * itself; on the web they stay animated only while small enough for browser storage.
 * Returns null when the user cancels.
 */
export async function pickWallpaper(request: 'image' | 'video'): Promise<{ uri: string; kind: 'image' | 'gif' | 'video' } | null> {
  if (request === 'image') {
    const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return null;
    const asset = result.assets[0];
    const gif = asset.mimeType === 'image/gif' || /\.gif$/i.test(asset.name);
    if (!gif || Platform.OS !== 'web') {
      // Same checks and copy as any other picture.
      return await storePicked(asset, 'background', gif ? 'gif' : 'image');
    }
    const blob = asset.file ?? await (await fetch(asset.uri)).blob();
    if (blob.size > 2_000_000) return { uri: await webDataUrl(blob, 1600), kind: 'image' };
    return { uri: await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('无法读取这张动图'));
      reader.readAsDataURL(blob);
    }), kind: 'gif' };
  }
  if (!videoWallpaperSupported) throw new Error('网页版不支持视频壁纸，请在手机 App 中设置');
  const result = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if ((asset.size ?? 0) > MAX_VIDEO_BYTES) throw new Error('视频太大，请选择 60 MB 以内的视频');
  if (asset.mimeType && !asset.mimeType.startsWith('video/')) throw new Error('请选择视频文件');
  const { Directory, File, Paths } = await import('expo-file-system');
  const folder = new Directory(Paths.document, 'images');
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  const extension = /\.(mp4|m4v|mov|webm|3gp)$/i.exec(asset.name)?.[1]?.toLowerCase() ?? 'mp4';
  const target = new File(folder, `wallpaper-${uid()}.${extension}`);
  new File(asset.uri).copySync(target);
  return { uri: target.uri, kind: 'video' };
}

async function storePicked(asset: DocumentPicker.DocumentPickerAsset, purpose: 'background' | 'card', kind: 'image' | 'gif') {
  if ((asset.size ?? 0) > MAX_BYTES) throw new Error('图片太大，请选择 20 MB 以内的图片');
  if (asset.mimeType && !asset.mimeType.startsWith('image/')) throw new Error('请选择图片文件');
  if (Platform.OS === 'web') {
    try {
      const blob = asset.file ?? await (await fetch(asset.uri)).blob();
      return { uri: await webDataUrl(blob, purpose === 'background' ? 1600 : 900), kind };
    } finally { if (asset.uri.startsWith('blob:')) URL.revokeObjectURL(asset.uri); }
  }
  const { Directory, File, Paths } = await import('expo-file-system');
  const folder = new Directory(Paths.document, 'images');
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  const extension = /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.exec(asset.name)?.[1]?.toLowerCase() ?? 'jpg';
  const target = new File(folder, `${purpose}-${uid()}.${extension}`);
  new File(asset.uri).copySync(target);
  return { uri: target.uri, kind };
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
