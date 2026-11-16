// Live video inside the app: the Lumen web app in Android's built-in web view, on a screen of its own.
// Opened only from the Live video action on the chat screen. It is a root screen, so the app's own
// tab bar is not shown around it. Leaving the screen, or the app, removes the web view, which ends
// its video session and its sound.
//
// The view asks the web app for its Live Room layout (Video Chat and Companion Theater). While the
// room's own header is showing, this screen's bar steps aside, so there is one header, not two.
// The room and this screen exchange only the fixed words in lib/live-room.ts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, KeyboardAvoidingView, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth';
import { IN_APP_PROBE, inAppVideoSupported, liveRoomWebUrl, liveVideoWebUrl, openLiveVideoOnWeb, readInAppProbe, sameWebOrigin, type InAppProbe } from '@/lib/live-video-web';
import { ROOM_BACK_SCRIPT, readRoomEvent, type RoomMode } from '@/lib/live-room';

const PROBE_TIMEOUT_MS = 8_000;

export default function LiveVideoScreen() {
  const { colors: c } = useTheme();
  const { session } = useAuth();
  const url = useMemo(() => liveVideoWebUrl(), []);
  const roomUrl = useMemo(() => liveRoomWebUrl(), []);
  const supported = useMemo(() => inAppVideoSupported(), []);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [probe, setProbe] = useState<InAppProbe | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [silent, setSilent] = useState(false);   // the page never reported what this phone can do
  const [attempt, setAttempt] = useState(0);
  const view = useRef<any>(null);
  // What the room last said about itself: null until its header is on screen (sign-in page, an
  // older web build, Documents), then which of its two views is showing.
  const [room, setRoom] = useState<RoomMode | null>(null);
  // Android Back in Theater returns to Video Chat; anywhere else it leaves the screen as before.
  useEffect(() => {
    if (room !== 'theater') return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => { view.current?.injectJavaScript(ROOM_BACK_SCRIPT); return true; });
    return () => back.remove();
  }, [room]);
  // In the background the web view is removed: no video session and no sound outlive the screen.
  useEffect(() => { const watch = AppState.addEventListener('change', state => setActive(state === 'active')); return () => watch.remove(); }, []);

  // Fail closed: no capability report within a few seconds counts as "cannot", not as "fine".
  const waiting = !!url && supported && active && !probe && !failed && !silent;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setSilent(true), PROBE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waiting, attempt]);
  const retry = () => { setProbe(null); setFailed(false); setSilent(false); setNotice(null); setRoom(null); setAttempt(n => n + 1); };

  if (Platform.OS === 'web' || !session) return <Redirect href="/" />;
  const close = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };
  const browser = () => { if (url) void openLiveVideoOnWeb(url).then(opened => { if (!opened) setNotice('No browser could open Lumen.'); }); };
  const link = (label: string, hint: string, onPress: () => void) => (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={hint} onPress={onPress} hitSlop={10} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}>
      <Text style={{ color: c.primary[300], fontSize: 15 }}>{label}</Text>
    </TouchableOpacity>
  );
  const message = !url ? 'This build does not know the address of the Lumen web app.'
    : !supported ? 'This build of the app cannot show live video inside the app. Use the browser instead.'
    : failed ? 'Lumen could not be loaded here. Check the connection, or use the browser.'
    : silent && !probe ? 'This phone did not confirm that it can play live video inside the app. Try again, or use the browser.'
    : probe && !probe.ok ? `This phone cannot play live video inside the app (missing: ${probe.missing.join(', ')}). Use the browser instead.`
    : null;
  // Loaded only where its native part exists, so a build without it never touches it.
  const WebView = url && supported && !message ? require('react-native-webview').WebView : null;
  // The room's header replaces this screen's bar only while the web view is really showing it.
  const showingRoom = !!WebView && active && room !== null;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.neutral[950] }}>
      {!showingRoom && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: c.neutral[800] }}>
        {link('‹ Chat', 'Close live video and return to the chat', close)}
        <Text accessibilityRole="header" numberOfLines={1} style={{ color: c.neutral[200], fontSize: 15, flexShrink: 1 }}>Live video</Text>
        {link('Browser ↗', 'Open live video in your browser instead', browser)}
      </View>}
      {waiting && <Text accessibilityLiveRegion="polite" style={{ color: c.neutral[400], fontSize: 12, paddingHorizontal: 10, paddingVertical: 4 }}>Checking what this phone can play…</Text>}
      {!!notice && <Text accessibilityRole="alert" style={{ color: c.neutral[300], fontSize: 13, padding: 10 }}>{notice}</Text>}
      {message ? <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
        <Text accessibilityRole="alert" style={{ color: c.neutral[200], fontSize: 16, textAlign: 'center' }}>{message}</Text>
        {!!url && <View style={{ alignItems: 'center' }}>
          {supported && (failed || silent) && link('Try again', 'Try loading live video inside the app again', retry)}
          {link('Open in browser ↗', 'Open live video in your browser', browser)}
        </View>}
      </View> : WebView && active ? <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}><WebView
        key={attempt}
        ref={view}
        source={{ uri: roomUrl ?? url }}
        onLoadStart={() => setRoom(null)}
        style={{ flex: 1, backgroundColor: c.neutral[950] }}
        // Every navigation comes to the check below. Nothing outside the Lumen web app is loaded here,
        // and nothing is handed to another app.
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={(request: { url: string }) => {
          if (request.url === 'about:blank' || sameWebOrigin(url!, request.url)) return true;
          setNotice('Only Lumen opens here. Sign in with your email and password in this view; for Google sign-in or outside links, use the browser.');
          return false;
        }}
        onNavigationStateChange={(state: { url?: string }) => { if (state.url && state.url !== 'about:blank' && !sameWebOrigin(url!, state.url)) { view.current?.stopLoading(); setFailed(true); } }}
        injectedJavaScriptBeforeContentLoaded={IN_APP_PROBE}
        onMessage={(event: { nativeEvent: { data: unknown } }) => {
          const report = readInAppProbe(event.nativeEvent.data);
          if (report) { setProbe(report); return; }
          // The room's fixed words. They can hide this bar, close this screen or open the browser
          // at the address this build already knows; they carry no data and can do nothing else.
          const word = readRoomEvent(event.nativeEvent.data);
          if (word === 'ready') setRoom(now => now ?? 'chat');
          else if (word === 'gone') setRoom(null);
          else if (word === 'chat' || word === 'theater') setRoom(now => now === null ? now : word);
          else if (word === 'close') close();
          else if (word === 'browser') browser();
        }}
        onError={() => setFailed(true)}
        onRenderProcessGone={() => setFailed(true)}
        javaScriptEnabled domStorageEnabled
        mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback allowsFullscreenVideo
        setSupportMultipleWindows={false} javaScriptCanOpenWindowsAutomatically={false}
        allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
        thirdPartyCookiesEnabled={false} geolocationEnabled={false} mixedContentMode="never"
        setBuiltInZoomControls={false} overScrollMode="never"
      /></KeyboardAvoidingView> : <View style={{ flex: 1 }} />}
    </SafeAreaView>
  );
}
