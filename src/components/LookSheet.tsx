import React, { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BLUR_LEVELS, BUILTIN_PRESETS, CARD_LEVELS, DIM_LEVELS, FONTS, PANEL_LEVELS, WALLPAPERS, matchesPreset, type Appearance, type LookPreset, type WallpaperTone } from '../domain/appearance';
import { pickWallpaper, videoWallpaperSupported } from '../services/images';
import { Button, Icon, PressSurface, haptic, useUI } from '../ui/primitives';
import { AppBackground, fontFamily, usePixelStyles } from '../ui/glass';
import { metrics, useTheme } from '../ui/theme';
import { Choices, Field, Sheet, Toggle } from './Sheets';
import { WallpaperFramer } from './WallpaperFramer';

const wallpaperOf = (appearance: Appearance): Partial<Appearance> => ({
  background: appearance.background, backgroundKind: appearance.backgroundKind, backgroundFrame: appearance.backgroundFrame,
  backdrop: appearance.backdrop, wallpaperTone: appearance.wallpaperTone, backgroundDim: appearance.backgroundDim,
});

// Small picture of how a preset looks: a glass card over colour, or a pixel block over tiles.
function Swatch({ preset }: { preset: LookPreset }) {
  // The preview always shows the preset's own shape, whatever style is active now.
  const styles = baseStyles;
  if (preset.uiStyle === 'pixel') {
    return <View style={[styles.swatch, { backgroundColor: '#d2ccbe', borderRadius: 3 }]}>
      <View style={styles.pixelTiles}>{[0, 1, 2, 3, 4, 5].map(index => <View key={index} style={[styles.pixelTile, { backgroundColor: index % 3 ? '#d9d4c7' : '#c9c2b2' }]} />)}</View>
      <View style={styles.pixelCard}><View style={styles.pixelBand} /></View>
    </View>;
  }
  return <View style={styles.swatch}>
    <LinearGradient colors={['#86a8ff', '#c5b3ff', '#ffb0cf']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    <View style={[styles.glassCard, { backgroundColor: `rgba(255,255,255,${0.25 + preset.glassPanel})` }]} />
  </View>;
}

/**
 * 界面风格: switch between the built-in looks and the user's own saved looks,
 * pick the overall style and font, and save the current look as a new preset.
 */
export function LookSheet({ closingRequested = false, appearance, onApply, onAppearance, onSavePreset, onDeletePreset, onClose }: {
  closingRequested?: boolean; appearance: Appearance;
  onApply: (preset: LookPreset) => void; onAppearance: (patch: Partial<Appearance>) => void;
  onSavePreset: (name: string) => string | null; onDeletePreset: (id: string) => void; onClose: () => void;
}) {
  const styles = usePixelStyles(baseStyles);
  const theme = useTheme();
  const ui = useUI();
  const { width, height } = useWindowDimensions();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [picking, setPicking] = useState<'image' | 'video' | null>(null);
  const [framing, setFraming] = useState(false);
  // The wallpaper as it was when the sheet opened, so any change here can be walked back.
  const [original] = useState(() => wallpaperOf(appearance));
  const changed = JSON.stringify(original) !== JSON.stringify(wallpaperOf(appearance));
  const presets = [...BUILTIN_PRESETS, ...appearance.presets];
  const hasFile = !!appearance.background;

  async function choose(request: 'image' | 'video') {
    if (picking) return;
    setPicking(request); setError('');
    try {
      const picked = await pickWallpaper(request);
      if (!picked) return;
      haptic('success');
      onAppearance({ background: picked.uri, backgroundKind: picked.kind, backgroundFrame: null, backdrop: null });
      // Every wallpaper — photo, GIF or video — goes straight to choosing the part that fills the screen.
      setFraming(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法读取这个文件');
    } finally { setPicking(null); }
  }

  if (framing && appearance.background) {
    return <Sheet closingRequested={closingRequested} title="选择显示区域" subtitle="只记录显示哪一块，原文件不会被修改。" onClose={() => setFraming(false)}>
      <WallpaperFramer uri={appearance.background} kind={appearance.backgroundKind} initial={appearance.backgroundFrame} onCancel={() => setFraming(false)}
        onDone={frame => { haptic('success'); onAppearance({ backgroundFrame: frame }); setFraming(false); }} />
    </Sheet>;
  }

  return <Sheet closingRequested={closingRequested} title="外观与壁纸" subtitle="壁纸、玻璃质感、风格与字体；可以存成自己的预设。" notice={error} onClose={onClose}>
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={[ui.title, { fontSize: 17 }]}>壁纸</Text>
      <View style={styles.previewRow}>
        <View testID="background-preview" style={[styles.preview, { borderColor: theme.line, aspectRatio: width / Math.max(1, height) }]}>
          {/* A video plays once, behind the app; the thumbnail only names it. */}
          {hasFile && appearance.backgroundKind === 'video' ? <Icon name="file" size={22} color={theme.muted} /> : <AppBackground />}
        </View>
        <Text style={[ui.body, { flex: 1 }]}>{hasFile ? { image: '图片壁纸', gif: '动图壁纸', video: '视频壁纸（静音循环）' }[appearance.backgroundKind]
          : appearance.backdrop ? `渐变壁纸 · ${WALLPAPERS.find(item => item.id === appearance.backdrop)?.name ?? ''}` : '默认背景'}</Text>
      </View>
      <View style={styles.choices}>
        <Button small icon="image" disabled={!!picking} onPress={() => choose('image')}>{picking === 'image' ? '读取中…' : '图片或动图'}</Button>
        {videoWallpaperSupported && <Button small icon="file" disabled={!!picking} onPress={() => choose('video')}>{picking === 'video' ? '读取中…' : '视频'}</Button>}
        {hasFile && <Button small icon="edit" onPress={() => setFraming(true)}>调整区域</Button>}
        {(hasFile || !!appearance.backdrop) && <Button small variant="ghost" icon="close" onPress={() => { haptic('light'); onAppearance({ background: null, backgroundFrame: null, backdrop: null }); }}>恢复默认</Button>}
      </View>
      <Text style={ui.label}>图片和 GIF 不超过 20 MB，建议竖图约 1080×2400；视频不超过 60 MB，建议 30 秒以内的 MP4，静音循环播放，会更耗电。</Text>
      <Text style={ui.label}>纯色渐变</Text>
      <View style={styles.choices}>
        {WALLPAPERS.map(item => {
          const selected = !hasFile && appearance.backdrop === item.id;
          return <PressSurface key={item.id} accessibilityRole="radio" accessibilityLabel={`壁纸${item.name}`} accessibilityState={{ selected }} aria-checked={selected}
            onPress={() => { haptic(); onAppearance({ backdrop: item.id, background: null, backgroundFrame: null }); }}
            style={[styles.wallpaper, { borderColor: selected ? theme.blue : theme.line }]}>
            <LinearGradient colors={item.colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 0.35, y: 1 }} style={styles.wallpaperSwatch}>
              {selected && <Icon name="check" size={14} color={item.dark ? '#f4f6ff' : '#171d2c'} />}
            </LinearGradient>
            <Text numberOfLines={1} style={[ui.label, { fontSize: 11, textAlign: 'center' }]}>{item.name}</Text>
          </PressSurface>;
        })}
      </View>
      {hasFile && <>
        <Choices<string> label="背景遮罩" value={String(appearance.backgroundDim)} onChange={value => onAppearance({ backgroundDim: Number(value) })}
          items={DIM_LEVELS.map(level => ({ key: String(level.value), title: `遮罩${level.title}` }))} />
        <Text style={ui.label}>壁纸上的文字配色</Text>
        <Choices<WallpaperTone> label="壁纸上的文字配色" value={appearance.wallpaperTone} onChange={wallpaperTone => onAppearance({ wallpaperTone })}
          items={[{ key: 'system', title: '跟随系统' }, { key: 'light', title: '浅色' }, { key: 'dark', title: '深色' }]} />
      </>}
      {!hasFile && !!appearance.backdrop && <Text style={ui.label}>深色渐变自动使用浅色文字，浅色渐变使用深色文字。</Text>}
      {changed && <Button small variant="ghost" icon="refresh" onPress={() => { haptic('light'); onAppearance(original); }}>撤销壁纸更改</Button>}
    </View>
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={[ui.title, { fontSize: 17 }]}>玻璃质感</Text>
      <Choices<string> label="界面透明度" value={String(appearance.glassPanel)} onChange={value => onAppearance({ glassPanel: Number(value) })}
        items={PANEL_LEVELS.map(level => ({ key: String(level.value), title: level.title }))} />
      <Choices<string> label="雾化强度" value={String(appearance.glassBlur)} onChange={value => onAppearance({ glassBlur: Number(value) })}
        items={BLUR_LEVELS.map(level => ({ key: String(level.value), title: level.title }))} />
      <Choices<string> label="课程卡片" value={String(appearance.glassCard)} onChange={value => onAppearance({ glassCard: Number(value) })}
        items={CARD_LEVELS.map(level => ({ key: String(level.value), title: level.title }))} />
      <Toggle label="边缘光晕" detail="玻璃边缘带一圈柔和的光" value={appearance.glow} onChange={glow => onAppearance({ glow })} />
    </View>
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={[ui.title, { fontSize: 17 }]}>预设</Text>
      {presets.map((preset, index) => {
        const active = matchesPreset(appearance, preset);
        const custom = !preset.id.startsWith('builtin:');
        return <View key={preset.id} style={styles.row}>
          <PressSurface testID={`preset-${preset.id}`} accessibilityRole="radio" accessibilityState={{ selected: active }} aria-checked={active} accessibilityLabel={`套用预设：${preset.name}`}
            onPress={() => { haptic(active ? 'light' : 'success'); setConfirmDelete(null); onApply(preset); }}
            style={[styles.preset, { borderColor: active ? theme.blue : theme.line, backgroundColor: active ? theme.tint : theme.soft }]}>
            <View style={styles.presetInner}>
              <Swatch preset={preset} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text numberOfLines={1} style={[styles.presetName, { color: theme.ink, fontFamily: fontFamily(preset.font) }]}>{custom ? preset.name : `预设 ${index + 1} · ${preset.name}`}</Text>
                <Text numberOfLines={1} style={ui.label}>{[preset.uiStyle === 'pixel' ? '像素方块' : '液态玻璃', FONTS.find(font => font.key === preset.font)?.title + '字体', custom ? (preset.background ? '含背景图' : '无背景图') : '内置'].join(' · ')}</Text>
              </View>
              {active && <Icon name="check" size={18} color={theme.blue} />}
            </View>
          </PressSurface>
          {custom && <Button small variant={confirmDelete === preset.id ? 'danger' : 'ghost'} icon="trash" label={confirmDelete === preset.id ? `确认删除预设${preset.name}` : `删除预设${preset.name}`}
            onPress={() => { if (confirmDelete === preset.id) { onDeletePreset(preset.id); setConfirmDelete(null); } else { haptic('warning'); setConfirmDelete(preset.id); } }}>{confirmDelete === preset.id ? '确认' : undefined}</Button>}
        </View>;
      })}
    </View>
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={[ui.title, { fontSize: 17 }]}>细节</Text>
      <Text style={ui.label}>界面风格</Text>
      <View style={styles.choices}>
        {(['glass', 'pixel'] as const).map(style => <Button key={style} small variant="ghost" label={style === 'glass' ? '风格液态玻璃' : '风格像素方块'} selected={appearance.uiStyle === style}
          onPress={() => { haptic(); onAppearance({ uiStyle: style }); }}>{style === 'glass' ? '液态玻璃' : '像素方块'}</Button>)}
      </View>
      <Text style={ui.label}>字体（使用手机自带字体）</Text>
      <View style={styles.choices}>
        {FONTS.map(font => <PressSurface key={font.key} accessibilityRole="radio" accessibilityLabel={`字体${font.title}`} accessibilityState={{ selected: appearance.font === font.key }} aria-checked={appearance.font === font.key}
          onPress={() => { haptic(); onAppearance({ font: font.key }); }}
          style={[styles.fontChoice, { borderColor: appearance.font === font.key ? theme.blue : theme.line, backgroundColor: appearance.font === font.key ? theme.tint : theme.soft }]}>
          <Text style={{ fontSize: 18, color: theme.ink, fontFamily: fontFamily(font.key), textAlign: 'center' }}>课序 08:00</Text>
          <Text style={[ui.label, { textAlign: 'center' }]}>{font.title}</Text>
        </PressSurface>)}
      </View>
      <Text style={ui.label}>保存预设时，壁纸、透明度、雾化和光晕会一起存进去。</Text>
    </View>
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={[ui.title, { fontSize: 17 }]}>保存为我的预设</Text>
      <Field label="预设名称" value={name} onChange={value => { setName(value); setError(''); }} placeholder="例如：夜间像素" />
      <Button icon="check" onPress={() => {
        const problem = onSavePreset(name);
        if (problem) { setError(problem); return; }
        haptic('success'); setName(''); setError('');
      }}>保存当前外观</Button>
    </View>
  </Sheet>;
}

const baseStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  preset: { flex: 1, borderWidth: 1.5, borderRadius: metrics.radius.md },
  presetInner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  presetName: { fontSize: 15, fontWeight: '700' },
  swatch: { width: 64, height: 44, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  glassCard: { width: 42, height: 26, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  pixelTiles: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, flexDirection: 'row', flexWrap: 'wrap' },
  pixelTile: { width: '33.34%', height: '50%' },
  pixelCard: { width: 40, height: 26, backgroundColor: '#4f7cf0', borderWidth: 2, borderColor: '#2a2420', boxShadow: '2px 2px 0 rgba(0,0,0,0.3)' },
  pixelBand: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, backgroundColor: '#2a47ad' },
  choices: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  preview: { width: 64, borderRadius: 10, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  wallpaper: { width: 58, borderWidth: 1.5, borderRadius: metrics.radius.md, padding: 4, gap: 3 },
  wallpaperSwatch: { height: 38, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  fontChoice: { flex: 1, minWidth: 90, borderWidth: 1.5, borderRadius: metrics.radius.md, paddingVertical: 10, gap: 4 },
});
