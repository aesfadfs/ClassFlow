import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { WallpaperFrame } from '../domain/appearance';

/**
 * Looping, muted video wallpaper. A local HTML page with a <video> element plays the
 * app's private copy of the file; the page's base URL is the file's own folder so the
 * WebView may read it. Never takes touches.
 *
 * `frame` stretches the chosen part of the video over the whole box, exactly like a
 * framed photo; without it the video covers the box centred. `fit="contain"` shows the
 * whole video (for framing), and `onSize` reports its width / height once it is known.
 */
export function VideoWallpaper({ uri, frame, fit = 'cover', onSize }: {
  uri: string; frame?: WallpaperFrame | null; fit?: 'cover' | 'contain'; onSize?: (ratio: number) => void;
}) {
  const folder = uri.slice(0, uri.lastIndexOf('/') + 1);
  const name = encodeURI(decodeURI(uri.slice(folder.length))).replace(/"/g, '%22');
  const placement = frame
    ? `position:absolute;width:${(100 / frame.w).toFixed(4)}%;height:${(100 / frame.h).toFixed(4)}%;left:${(-(frame.x / frame.w) * 100).toFixed(4)}%;top:${(-(frame.y / frame.h) * 100).toFixed(4)}%;object-fit:fill`
    : `width:100%;height:100%;object-fit:${fit}`;
  const report = onSize
    ? `<script>(function(){var v=document.querySelector('video');function send(){if(v.videoWidth&&v.videoHeight)window.ReactNativeWebView.postMessage(JSON.stringify({w:v.videoWidth,h:v.videoHeight}));}
if(v.readyState>=1)send();v.addEventListener('loadedmetadata',send);})();</script>`
    : '';
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;position:relative}video{${placement};pointer-events:none}</style></head>
<body><video src="${name}" autoplay loop muted playsinline preload="auto"></video>${report}</body></html>`;
  // The WebView sits in an absolutely positioned wrapper: on Android its own style is not
  // always lifted out of the flex flow, which squeezed the layout around it.
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <WebView
      style={styles.web}
      source={{ html, baseUrl: folder }}
      originWhitelist={['*']}
      allowFileAccess
      allowFileAccessFromFileURLs
      javaScriptEnabled={!!onSize}
      onMessage={(event: WebViewMessageEvent) => {
        try {
          const size = JSON.parse(event.nativeEvent.data) as { w: number; h: number };
          if (size.w > 0 && size.h > 0) onSize?.(size.w / size.h);
        } catch { /* not a size message */ }
      }}
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
