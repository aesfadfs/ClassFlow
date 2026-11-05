import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { buildTimetableScript } from '../features/timetableBrowserScript';
import { matchesSchoolUrl, type SchoolAdapter } from '../features/schools';
import { readTimetableCapture, type TimetableCapture } from '../features/zhengfang';
import { Button, useUI } from '../ui/primitives';
import { useTheme } from '../ui/theme';

export type SchoolBrowserProps = { school: SchoolAdapter; onClose: () => void; onCapture: (capture: TimetableCapture) => void };

export function SchoolBrowser({ school, onClose, onCapture }: SchoolBrowserProps) {
  const theme = useTheme(), ui = useUI(), insets = useSafeAreaInsets();
  const browser = useRef<WebView>(null);
  const captured = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [url, setUrl] = useState(school.authUrl);
  const [source, setSource] = useState(school.authUrl);
  const [navigationId, setNavigationId] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('登录后进入个人课表，识别完成会自动进入导入预览。');
  const script = useMemo(() => buildTimetableScript(school.timetableHosts), [school]);
  const retryScript = useMemo(() => buildTimetableScript(school.timetableHosts, true), [school]);
  const clearRetry = () => { if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; } };
  useEffect(() => () => clearRetry(), []);
  const navigate = (target: string) => {
    if (matchesSchoolUrl(target, school.browserHosts)) {
      if (target === source) setNavigationId(value => value + 1);
      setSource(target); setError('');
    }
    else setError('该链接不属于已配置的学校认证域名，已停止跳转。');
  };
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => canGoBack ? browser.current?.goBack() : onClose()}>
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={[styles.header, { borderColor: theme.line }]}>
          <View style={styles.row}>
            <Button small variant="ghost" icon="close" label="关闭教务浏览器" onPress={onClose} />
            <View style={{ flex: 1 }}><Text style={[ui.body, { fontWeight: '700' }]}>{school.name}</Text>
              <Text style={ui.label} numberOfLines={1}>{new URL(url).host}</Text></View>
            {loading && <ActivityIndicator color={theme.blue} />}
          </View>
          <Text accessibilityLiveRegion="polite" style={ui.label}>{status}</Text>
          {!!error && <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text>}
        </View>
        <WebView key={navigationId} ref={browser} source={{ uri: source }} style={{ flex: 1 }}
          javaScriptEnabled domStorageEnabled sharedCookiesEnabled thirdPartyCookiesEnabled
          setSupportMultipleWindows onOpenWindow={event => navigate(event.nativeEvent.targetUrl)}
          javaScriptCanOpenWindowsAutomatically={false}
          allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
          mixedContentMode="never" originWhitelist={['*']} allowsBackForwardNavigationGestures
          setBuiltInZoomControls setDisplayZoomControls={false}
          injectedJavaScriptBeforeContentLoaded={script} injectedJavaScript={script}
          onShouldStartLoadWithRequest={request => {
            if (request.url === 'about:blank') return true;
            const allowed = matchesSchoolUrl(request.url, school.browserHosts);
            if (!allowed) setError('该链接不属于已配置的学校认证域名，已停止跳转。');
            return allowed;
          }}
          onNavigationStateChange={state => { if (matchesSchoolUrl(state.url, school.browserHosts)) setUrl(state.url); setCanGoBack(state.canGoBack); }}
          onLoadStart={() => { clearRetry(); setLoading(true); setError(''); setStatus('正在加载学校页面，加载后自动检查课表。'); }}
          onLoadEnd={() => { setLoading(false); browser.current?.injectJavaScript(script); }}
          onError={() => { setLoading(false); setError('学校页面加载失败，请检查网络后刷新。'); }}
          onHttpError={event => { if (event.nativeEvent.url === url) setError(`学校页面返回 ${event.nativeEvent.statusCode}，请刷新重试。`); }}
          onRenderProcessGone={() => { setLoading(false); setError('浏览器进程已退出，请刷新重试。'); }}
          onContentProcessDidTerminate={() => browser.current?.reload()}
          onMessage={event => {
            if (captured.current || !matchesSchoolUrl(event.nativeEvent.url, school.browserHosts)) return;
            try {
              if (event.nativeEvent.data.length > 2_000_000) throw new Error('页面返回内容过大，请刷新后重新识别。');
              const capture = readTimetableCapture(event.nativeEvent.data, school);
              if (capture?.courses.length) { clearRetry(); captured.current = true; onCapture(capture); return; }
              const message = JSON.parse(event.nativeEvent.data);
              if (message.type === 'timetable-frame' && typeof message.url === 'string'
                && matchesSchoolUrl(message.url, school.timetableHosts)
                && /\/kbcx\/xskbcx[^/]*\.html$/i.test(new URL(message.url).pathname)) navigate(message.url);
              if (message.type === 'status' && typeof message.message === 'string' && message.message.length < 300) { clearRetry(); setStatus(message.message); }
            } catch (error) { setError(error instanceof Error ? error.message : '课表识别失败，请重新查询课表。'); }
          }} />
        <View style={[styles.footer, { borderColor: theme.line }]}>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <Button small variant="ghost" icon="left" disabled={!canGoBack} onPress={() => browser.current?.goBack()}>返回</Button>
            <Button small variant="ghost" icon="refresh" onPress={() => browser.current?.reload()}>刷新</Button>
            <Button small variant="primary" icon="import" onPress={() => {
              clearRetry(); setError(''); setStatus('正在重新检查当前课表…');
              retryTimer.current = setTimeout(() => {
                setStatus('页面暂未响应识别。请刷新后点击学校页面的“查询”，再重新识别。');
                retryTimer.current = null;
              }, 6000);
              browser.current?.injectJavaScript(retryScript);
            }}>重新识别</Button>
          </View>
          <Text style={ui.label}>账号和密码仅在学校网页输入。请选择整学期课表，识别后核对再保存。</Text>
        </View>
      </View>
    </GestureHandlerRootView>
  </Modal>;
}

const styles = StyleSheet.create({
  header: { padding: 12, gap: 8, borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footer: { padding: 12, gap: 8, borderTopWidth: 1 },
});
