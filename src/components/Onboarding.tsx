import React from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Reveal, haptic, useUI } from '../ui/primitives';
import { metrics, useTheme } from '../ui/theme';

/** Set once the guide is finished or skipped; also set silently for people who already have a timetable. */
export const ONBOARDING_KEY = 'classflow.onboarded.v1';
export const GUIDE_STEPS = 4;

/**
 * First-run guide: welcome → import → wallpaper → reminders. It only points at the
 * real sheets (which open above it) and never adds any timetable data itself.
 * The step lives in the app so the back button can walk through it.
 */
export function Onboarding({ step, remindersOn, onStep, onImport, onWallpaper, onReminders, onFinish }: {
  step: number; remindersOn: boolean;
  onStep: (step: number) => void; onImport: () => void; onWallpaper: () => void; onReminders: () => void; onFinish: () => void;
}) {
  const theme = useTheme();
  const ui = useUI();
  const next = () => { haptic(); onStep(step + 1); };
  const web = Platform.OS === 'web';
  return <View testID="onboarding" style={[styles.overlay, { backgroundColor: theme.bg }]}>
    <Reveal key={step} distance={10} style={styles.page}>
      {step === 0 && <>
        <Image source={require('../../assets/icon.png')} style={styles.icon} accessibilityIgnoresInvertColors />
        <Text accessibilityRole="header" style={[styles.title, { color: theme.ink }]}>欢迎使用课序</Text>
        <Text style={[styles.subtitle, { color: theme.secondary }]}>课表、空闲时间和个人安排放在一起。三步就能准备好。</Text>
        <View style={styles.actions}>
          <Button variant="primary" icon="right" onPress={next}>开始</Button>
          <Button variant="ghost" onPress={onFinish}>跳过引导</Button>
        </View>
      </>}
      {step === 1 && <>
        <Text accessibilityRole="header" style={[styles.heading, { color: theme.ink }]}>添加你的课表</Text>
        <Text style={[styles.subtitle, { color: theme.secondary }]}>登录学校教务自动识别，或导入课表文件；也可以之后在「工具箱」里导入。</Text>
        <View style={styles.actions}>
          <Button variant="primary" icon="import" onPress={onImport}>导入课表</Button>
          <Button onPress={next}>稍后再说</Button>
        </View>
      </>}
      {step === 2 && <>
        <Text accessibilityRole="header" style={[styles.heading, { color: theme.ink }]}>换一张喜欢的壁纸</Text>
        <Text style={[styles.subtitle, { color: theme.secondary }]}>{web ? '图片、动图或纯色渐变都可以；手机 App 还支持循环视频。' : '图片、动图、循环视频或纯色渐变都可以。'}</Text>
        <View style={styles.actions}>
          <Button variant="primary" icon="sparkles" onPress={onWallpaper}>选择壁纸</Button>
          <Button onPress={next}>稍后再说</Button>
        </View>
      </>}
      {step === 3 && <>
        <Text accessibilityRole="header" style={[styles.heading, { color: theme.ink }]}>上课前提醒你</Text>
        <Text style={[styles.subtitle, { color: theme.secondary }]}>
          {web ? '网页版不支持系统通知，可以在手机 App 的「偏好设置」里开启。' : remindersOn ? '课前提醒已开启，提前时间和铃声可以在「偏好设置」里调。' : '用系统通知在每节课开始前提醒，需要通知权限。'}
        </Text>
        <View style={styles.actions}>
          {!web && !remindersOn && <Button variant="primary" icon="clock" onPress={onReminders}>开启课前提醒</Button>}
          <Button variant={web || remindersOn ? 'primary' : 'glass'} icon="check" onPress={onFinish}>开始使用</Button>
        </View>
      </>}
    </Reveal>
    <View style={styles.dots} pointerEvents="none" accessibilityLabel={`第 ${step + 1} 步，共 ${GUIDE_STEPS} 步`}>
      {Array.from({ length: GUIDE_STEPS }, (_, index) => <View key={index} style={[styles.dot, { backgroundColor: index === step ? theme.blue : theme.line, width: index === step ? 18 : 6 }]} />)}
    </View>
    <Text style={[ui.label, styles.footnote]}>{step > 0 ? '可随时用返回键回到上一步' : ''}</Text>
  </View>;
}

const styles = StyleSheet.create({
  // Above the app, below the sheets (zIndex 80) that the guide opens.
  overlay: { ...StyleSheet.absoluteFill, zIndex: 60, elevation: 60, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  page: { width: '100%', maxWidth: 380, alignItems: 'center' },
  icon: { width: 96, height: 96, borderRadius: 22, marginBottom: 26 },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.6, textAlign: 'center' },
  heading: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 23, marginTop: 12, textAlign: 'center' },
  actions: { marginTop: 40, gap: 12, width: '100%' },
  dots: { position: 'absolute', bottom: 56, flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 6, borderRadius: metrics.radius.full },
  footnote: { position: 'absolute', bottom: 28, textAlign: 'center' },
});
