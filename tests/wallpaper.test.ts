import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WALLPAPERS, applyPreset, clampFrame, defaultAppearance, matchesPreset, restoreAppearance, savePreset, wallpaperScheme } from '../src/domain/appearance.ts';

test('colour wallpapers pick the text palette by brightness; files follow the chosen tone', () => {
  const dark = WALLPAPERS.find(item => item.id === 'starry')!;
  const light = WALLPAPERS.find(item => item.id === 'paper')!;
  assert.equal(dark.dark, true);
  assert.equal(light.dark, false);
  const base = defaultAppearance();
  assert.equal(wallpaperScheme(base), null);
  assert.equal(wallpaperScheme({ ...base, backdrop: 'starry' }), 'dark');
  assert.equal(wallpaperScheme({ ...base, backdrop: 'paper' }), 'light');
  // A file wins over the colour wallpaper and follows the system unless the user picked a tone.
  assert.equal(wallpaperScheme({ ...base, backdrop: 'starry', background: 'file:///a.jpg' }), null);
  assert.equal(wallpaperScheme({ ...base, background: 'file:///a.jpg', wallpaperTone: 'dark' }), 'dark');
});

test('stored frames stay inside the picture and never shrink below a fifth', () => {
  assert.equal(clampFrame(null), null);
  assert.deepEqual(clampFrame({ x: 0.9, y: -1, w: 0.01, h: 2 }), { x: 0.8, y: 0, w: 0.2, h: 1 });
  assert.deepEqual(clampFrame({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 }), { x: 0.1, y: 0.2, w: 0.5, h: 0.4 });
});

test('wallpaper settings restore safely and older saves default to no wallpaper', () => {
  const old = restoreAppearance(JSON.stringify({ version: 1, background: 'file:///photo.jpg' }));
  assert.equal(old.background, 'file:///photo.jpg');
  assert.equal(old.backgroundKind, 'image');
  assert.equal(old.backgroundFrame, null);
  assert.equal(old.backdrop, null);
  assert.equal(old.wallpaperTone, 'system');
  const bad = restoreAppearance(JSON.stringify({ backgroundKind: 'exe', backdrop: 'nope', wallpaperTone: 'neon', backgroundFrame: 'x' }));
  assert.equal(bad.backgroundKind, 'image');
  assert.equal(bad.backdrop, null);
  assert.equal(bad.wallpaperTone, 'system');
  assert.equal(bad.backgroundFrame, null);
  const video = restoreAppearance(JSON.stringify({ background: 'file:///loop.mp4', backgroundKind: 'video', backdrop: 'hainnu' }));
  assert.equal(video.backgroundKind, 'video');
  assert.equal(video.backdrop, 'hainnu');
});

test('a saved preset carries the whole wallpaper and survives a restore', () => {
  const look = { ...defaultAppearance(), background: 'file:///loop.gif', backgroundKind: 'gif' as const, backgroundFrame: { x: 0.1, y: 0, w: 0.5, h: 0.6 }, wallpaperTone: 'dark' as const };
  const saved = savePreset(look, '动图', 'custom:gif');
  const restored = restoreAppearance(JSON.stringify(saved));
  const preset = restored.presets[0];
  const plain = applyPreset({ ...defaultAppearance(), backdrop: 'ink' }, preset);
  assert.equal(plain.background, 'file:///loop.gif');
  assert.equal(plain.backgroundKind, 'gif');
  assert.deepEqual(plain.backgroundFrame, { x: 0.1, y: 0, w: 0.5, h: 0.6 });
  assert.equal(plain.backdrop, null);
  assert.equal(plain.wallpaperTone, 'dark');
  assert.equal(matchesPreset(plain, preset), true);
});
