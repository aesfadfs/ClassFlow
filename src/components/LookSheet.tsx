import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BUILTIN_PRESETS, FONTS, matchesPreset, type Appearance, type LookPreset } from '../domain/appearance';
import { Button, Icon, PressSurface, haptic, useUI } from '../ui/primitives';
import { fontFamily } from '../ui/glass';
import { metrics, useTheme } from '../ui/theme';
import { Field, Sheet } from './Sheets';

// Small picture of how a preset looks: a glass card over colour, or a pixel block over tiles.
function Swatch({ preset }: { preset: LookPreset }) {
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
  const theme = useTheme();
  const ui = useUI();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const presets = [...BUILTIN_PRESETS, ...appearance.presets];

  return <Sheet closingRequested={closingRequested} title="界面风格" subtitle="一键切换预设，也可以保存自己的搭配。" notice={error} onClose={onClose}>
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
      <Text style={ui.label}>透明度、雾化、光晕和背景图在「偏好设置 → 外观与操作」中调整，也会一起存进预设。</Text>
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

const styles = StyleSheet.create({
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
  fontChoice: { flex: 1, minWidth: 90, borderWidth: 1.5, borderRadius: metrics.radius.md, paddingVertical: 10, gap: 4 },
});
