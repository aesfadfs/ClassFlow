import type { WallpaperFrame } from '../domain/appearance';

// The web build cannot keep a video file between visits, so video wallpapers are phone-only.
export function VideoWallpaper(_props: { uri: string; frame?: WallpaperFrame | null; fit?: 'cover' | 'contain'; onSize?: (ratio: number) => void }) {
  return null;
}
