import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { buildTimetableScript } from '../features/timetableBrowserScript';
import { isWebUrl, matchesSchoolUrl, resolveAddress, TIMETABLE_FRAME_PATH, type SchoolAdapter, type SearchEngine } from '../features/schools';
import { readTimetableCapture, type TimetableCapture } from '../features/zhengfang';
import { Button, useUI } from '../ui/primitives';
import { useTheme } from '../ui/theme';

export type SchoolBrowserProps = {
  school: SchoolAdapter;
  /** Open mode only: the first page, normally a search for the school's 教务系统. */
  startUrl?: string;
  engine?: SearchEngine;
  onClose: () => void;
  onCapture: (capture: TimetableCapture) => void;
};

export function SchoolBrowser({ school, startUrl, engine = 'baidu', onClose, onCapture }: SchoolBrowserProps) {
  const theme = useTheme(), ui = useUI(), insets = useSafeAreaInsets();
  const open = school.mode === 'open';
  const home = open && startUrl && isWebUrl(startUrl) ? startUrl : school.authUrl;
  const browser = useRef<WebView>(null);
  const captured = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [url, setUrl] = useState(home);
  const [address, setAddress] = useState(home);
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState(home);
  const [navigationId, setNavigationId] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(open
    ? '搜索并打开你学校的教务系统，登录后进入“我的课表”，识别完成会自动进入导入预览。'
    : '登录后进入个人课表，识别完成会自动进入导入预览。');
  // The open browser reads whichever page the user opened; the app then only
  // accepts a capture whose source host equals the page that posted it.
  const hosts = open ? ['*'] : school.timetableHosts;
  const script = useMemo(() => buildTimetableScript(hosts, false), [school]);
  const retryScript = useMemo(() => buildTimetableScript(hosts, true), [school]);
  const permitted = (target: string) => open ? isWebUrl(target) : matchesSchoolUrl(target, school.browserHosts);
  const blockedMessage = open ? '已阻止打开其他 App 或非网页链接。' : '该链接不属于已配置的学校认证域名，已停止跳转。';
  const clearRetry = () => { if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; } };
  useEffect(() => () => clearRetry(), []);
  const navigate = (target: string) => {
    if (permitted(target)) {
      if (target === source) setNavigationId(value => value + 1);
      setSource(target); setError('');
    }
    else setError(blockedMessage);
  };
  let host = '';
  try { host = new URL(url).host; } catch { /* about:blank */ }
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => canGoBack ? browser.current?.goBack() : onClose()}>
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={[styles.header, { borderColor: theme.line }]}>
          <View style={styles.row}>
            <Button small variant="ghost" icon="close" label="关闭教务浏览器" onPress={onClose} />
            {open ? <TextInput value={editing ? address : host || address} onChangeText={setAddress}
              onFocus={() => { setEditing(true); setAddress(url); }} onBlur={() => setEditing(false)}
              onSubmitEditing={() => { setEditing(false); navigate(resolveAddress(address, engine)); }}
              selectTextOnFocus autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go"
              accessibilityLabel="网址或搜索内容" placeholder="输入学校名称或教务网址" placeholderTextColor={theme.muted}
              style={[styles.address, { color: theme.ink, backgroundColor: theme.soft, borderColor: theme.line }]} />
              : <View style={{ flex: 1 }}><Text style={[ui.body, { fontWeight: '700' }]}>{school.name}</Text>
                <Text style={ui.label} numberOfLines={1}>{host}</Text></View>}
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
          // Many school systems still serve parts of the page over HTTP.
          mixedContentMode={open ? 'compatibility' : 'never'} originWhitelist={open ? ['http://*', 'https://*', 'about:*'] : ['*']}
          allowsBackForwardNavigationGestures setBuiltInZoomControls setDisplayZoomControls={false}
          injectedJavaScriptBeforeContentLoaded={script} injectedJavaScript={script}
          onShouldStartLoadWithRequest={request => {
            if (request.url === 'about:blank' || request.url.startsWith('about:srcdoc')) return true;
            const allowed = permitted(request.url);
            if (!allowed) setError(blockedMessage);
            return allowed;
          }}
          onNavigationStateChange={state => {
            if (permitted(state.url)) { setUrl(state.url); if (!editing) setAddress(state.url); }
            setCanGoBack(state.canGoBack);
          }}
          onLoadStart={() => { clearRetry(); setLoading(true); setError(''); }}
          onLoadEnd={() => { setLoading(false); browser.current?.injectJavaScript(script); }}
          onError={() => { setLoading(false); setError(open ? '页面加载失败，请检查网址或网络后刷新。校内专用网址需连接校园网或学校 VPN。' : '学校页面加载失败，请检查网络后刷新。'); }}
          onHttpError={event => { if (event.nativeEvent.url === url) setError(`页面返回 ${event.nativeEvent.statusCode}，请刷新重试。`); }}
          onRenderProcessGone={() => { setLoading(false); setError('浏览器进程已退出，请刷新重试。'); }}
          onContentProcessDidTerminate={() => browser.current?.reload()}
          onMessage={event => {
            const pageUrl = event.nativeEvent.url;
            if (captured.current || !permitted(pageUrl)) return;
            try {
              if (event.nativeEvent.data.length > 2_000_000) throw new Error('页面返回内容过大，请刷新后重新识别。');
              const capture = readTimetableCapture(event.nativeEvent.data, school, pageUrl);
              if (capture?.courses.length) { clearRetry(); captured.current = true; onCapture(capture); return; }
              const message = JSON.parse(event.nativeEvent.data);
              if (message.type === 'timetable-frame' && typeof message.url === 'string') {
                const frame = open
                  ? isWebUrl(message.url) && TIMETABLE_FRAME_PATH.test(new URL(message.url).pathname)
                  : matchesSchoolUrl(message.url, school.timetableHosts) && /\/kbcx\/xskbcx[^/]*\.html$/i.test(new URL(message.url).pathname);
                if (frame) navigate(message.url);
              }
              if (message.type === 'status' && typeof message.message === 'string' && message.message.length < 300) { clearRetry(); setStatus(message.message); }
            } catch (error) { setError(error instanceof Error ? error.message : '课表识别失败，请重新查询课表。'); }
          }} />
        <View style={[styles.footer, { borderColor: theme.line }]}>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <Button small variant="ghost" icon="left" disabled={!canGoBack} onPress={() => browser.current?.goBack()}>返回</Button>
            <Button small variant="ghost" icon="refresh" onPress={() => browser.current?.reload()}>刷新</Button>
            {open && <Button small variant="ghost" icon="globe" onPress={() => navigate(home)}>搜索页</Button>}
            <Button small variant="primary" icon="import" onPress={() => {
              clearRetry(); setError(''); setStatus('正在重新检查当前课表…');
              retryTimer.current = setTimeout(() => {
                setStatus('页面暂未响应识别。请刷新后点击学校页面的“查询”，再重新识别。');
                retryTimer.current = null;
              }, 6000);
              browser.current?.injectJavaScript(retryScript);
            }}>重新识别</Button>
          </View>
          <Text style={ui.label}>{open
            ? '账号和密码只在学校网页输入，课序不读取登录信息。请认准学校官方网址，选择整学期课表，识别后核对再保存。'
            : '账号和密码仅在学校网页输入。请选择整学期课表，识别后核对再保存。'}</Text>
        </View>
      </View>
    </GestureHandlerRootView>
  </Modal>;
}

const styles = StyleSheet.create({
  header: { padding: 12, gap: 8, borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  address: { flex: 1, minHeight: 38, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 15 },
  footer: { padding: 12, gap: 8, borderTopWidth: 1 },
});
