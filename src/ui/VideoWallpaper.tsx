import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Looping, muted video wallpaper. A local HTML page with a <video> element plays the
 * app's private copy of the file; the page's base URL is the file's own folder so the
 * WebView may read it. Never takes touches.
 */
export function VideoWallpaper({ uri }: { uri: string }) {
  const folder = uri.slice(0, uri.lastIndexOf('/') + 1);
  const name = encodeURI(decodeURI(uri.slice(folder.length))).replace(/"/g, '%22');
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}video{width:100%;height:100%;object-fit:cover;pointer-events:none}</style></head>
<body><video src="${name}" autoplay loop muted playsinline preload="auto"></video></body></html>`;
  // The WebView sits in an absolutely positioned wrapper: on Android its own style is not
  // always lifted out of the flex flow, which squeezed the layout around it.
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <WebView
      style={styles.web}
      source={{ html, baseUrl: folder }}
      originWhitelist={['*']}
      allowFileAccess
      allowFileAccessFromFileURLs
      javaScriptEnabled={false}
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      setSupportMultipleWindows={false}
    />
  </View>;
}

const styles = StyleSheet.create({ web: { flex: 1, backgroundColor: '#0b0d12' } });
