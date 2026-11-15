import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { animatedScenes, chooseAnimatedScene, type AnimatedCompanionSession } from '@/lib/animated-companion';
import { awaitScene, sceneBlocked, type AnimatedScene, type SceneList } from '@/lib/animated-companion-core';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// Scene control for the animated companion: Original, plus whatever other scenes the avatar host lists.
// Everything shown here comes from the server: which scene is serving, and which ones are ready. A scene
// that is not prepared or not approved is listed but cannot be chosen. Choosing a scene restarts the avatar
// service, so it asks first, is refused while Lumen is replying or the GPU is busy, takes about a minute, and
// afterwards shows the scene that is really serving, which is Original again if the new one could not load.
// Nothing is shown at all while Original is the only scene.
export function AnimatedScenes({ session, companionId, shown, busy, color, onNote }: {
  session: AnimatedCompanionSession; companionId: string; shown: boolean; busy: boolean; color: string; onNote: (note: string | null) => void;
}) {
  const [list, setList] = useState<SceneList | null>(null);
  const [asking, setAsking] = useState<AnimatedScene | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!shown) { setAsking(null); return; }
    const controller = new AbortController();
    void animatedScenes(controller.signal).then(next => { if (!controller.signal.aborted) setList(next); });
    return () => controller.abort();
  }, [shown, companionId]);

  const change = useCallback(async (scene: AnimatedScene) => {
    setAsking(null); onNote(null);
    setSwitching(scene.label);
    const refused = await chooseAnimatedScene(companionId, scene.id);
    if (!alive.current) return;
    if (refused) {   // nothing was restarted: the video keeps playing as it was
      setSwitching(null); onNote(refused);
      void animatedScenes().then(next => { if (alive.current && next) setList(next); });
      return;
    }
    session.close();
    const now = await awaitScene(() => animatedScenes(), sleep, () => alive.current);
    if (!alive.current) return;
    if (now) setList(now);
    const back = !!now && await session.connect(companionId);
    if (!alive.current) return;
    setSwitching(null);
    if (!back) onNote('The animated companion has not come back yet. Lumen is using the portrait; turn Animated on again in a minute.');
    else if (now && now.active !== scene.id) onNote(`${scene.label} could not start. ${now.scenes.find(item => item.id === now.active)?.label ?? 'Original'} is showing again.`);
  }, [companionId, session, onNote]);

  if (Platform.OS !== 'web') return null;
  if (switching) return (
    <View style={{ alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16 }}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color, fontSize: 12, textAlign: 'center' }}>Changing scene to {switching}. The animated companion restarts; this takes about a minute.</Text>
    </View>
  );
  if (!shown || !list || list.scenes.length < 2) return null;
  return (
    <View style={{ alignItems: 'center', paddingBottom: 6, paddingHorizontal: 16, maxWidth: '100%' }}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Animated companion scene" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 14, rowGap: 4, maxWidth: '100%' }}>
        <Text style={{ color, fontSize: 12, opacity: 0.6 }}>Scene</Text>
        {list.scenes.map(scene => {
          const current = scene.id === list.active;
          const blocked = sceneBlocked(list, scene, busy, false);
          const suffix = !current && scene.status !== 'ready' ? ` (${blocked})` : '';
          return (
            <TouchableOpacity key={scene.id} accessibilityRole="radio" accessibilityLabel={`Scene ${scene.label}${current ? ', showing now' : blocked ? `, ${blocked}` : ''}`}
              accessibilityState={{ checked: current, disabled: !!blocked }} disabled={!!blocked} onPress={() => setAsking(scene)} hitSlop={8}>
              <Text style={{ color, fontSize: 12, fontWeight: current ? '700' : '400', opacity: current ? 1 : blocked ? 0.35 : 0.85, textDecorationLine: current ? 'underline' : 'none' }}>{scene.label}{suffix}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {asking && <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 14, rowGap: 4, marginTop: 6, maxWidth: '100%' }}>
        <Text accessibilityRole="alert" style={{ color, fontSize: 12, textAlign: 'center' }}>Change to {asking.label}? The animated companion restarts and is away for about a minute.</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Change scene to ${asking.label}`} disabled={busy} onPress={() => void change(asking)} hitSlop={8}><Text style={{ color, fontSize: 12, fontWeight: '700', opacity: busy ? 0.35 : 1 }}>Change scene</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Keep the current scene" onPress={() => setAsking(null)} hitSlop={8}><Text style={{ color, fontSize: 12 }}>Cancel</Text></TouchableOpacity>
      </View>}
    </View>
  );
}
