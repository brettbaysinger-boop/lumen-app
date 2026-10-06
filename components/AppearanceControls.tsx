import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Switch } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { contrast, isHex, type PortraitFrame, type FrameFinish } from '@/lib/appearance';
import { CompanionPortrait } from './CompanionPortrait';

function ColorField({ label, value, fallback, onApply }: { label: string; value: string; fallback: string; onApply: (value: string) => void }) {
  const { colors: c } = useTheme();
  const [draft, setDraft] = useState(value || fallback);
  useEffect(() => setDraft(value || fallback), [value, fallback]);
  return <View style={{ gap: 8 }}><Text style={{ color: c.neutral[300], fontSize: 12 }}>{label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: isHex(draft) ? draft : fallback, borderWidth: 1, borderColor: c.neutral[500] }} />
      <TextInput value={draft} onChangeText={setDraft} maxLength={7} autoCapitalize="none" accessibilityLabel={`${label} hex color`}
        style={{ flex: 1, color: c.neutral[100], padding: 12, borderRadius: 10, borderWidth: 1, borderColor: c.neutral[700] }} />
      <Pressable accessibilityRole="button" disabled={!isHex(draft)} onPress={() => onApply(draft)} style={{ padding: 12, opacity: isHex(draft) ? 1 : .4 }}><Text style={{ color: c.primary[300] }}>Apply</Text></Pressable>
    </View></View>;
}
export function AppearanceControls() {
  const { colors: c, appearance: a, setAppearance, resetAppearance } = useTheme();
  const chip = (label: string, active: boolean, onPress: () => void) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
    style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: active ? c.primary[400] : c.neutral[700], backgroundColor: c.neutral[900] }}><Text style={{ color: active ? c.primary[300] : c.neutral[300], fontSize: 12 }}>{label}</Text></Pressable>;
  return <View style={{ gap: 18, marginTop: 20 }}>
    <Text style={{ color: c.neutral[400], fontSize: 12, lineHeight: 20 }}>Make it yours. Custom colors override the preset and are saved on this device.</Text>
    <ColorField label="Background" value={a.background} fallback={c.neutral[950]} onApply={background => setAppearance({ background })} />
    <ColorField label="Text" value={a.text} fallback={c.neutral[100]} onApply={text => setAppearance({ text })} />
    <ColorField label="Accent" value={a.accent} fallback={c.primary[400]} onApply={accent => setAppearance({ accent })} />
    {contrast(c.neutral[950], c.neutral[100]) < 4.5 && <Text accessibilityRole="alert" style={{ color: c.isDark ? '#ffcf8a' : '#82430b' }}>Your text and background have low contrast. Choose colors further apart or reset below.</Text>}
    {contrast(c.neutral[950], c.primary[400]) < 3 && <Text accessibilityRole="alert" style={{ color: c.isDark ? '#ffcf8a' : '#82430b' }}>Your accent may be difficult to read against this background.</Text>}
    <Text style={{ color: c.neutral[300] }}>Portrait frame</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['rounded', 'circle', 'oval', 'none'] as PortraitFrame[]).map(frame => chip(frame === 'none' ? 'Frameless' : frame[0].toUpperCase() + frame.slice(1), a.frame === frame, () => setAppearance({ frame })))}</View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['gold', 'silver', 'accent'] as FrameFinish[]).map(finish => chip(finish[0].toUpperCase() + finish.slice(1), a.finish === finish, () => setAppearance({ finish })))}</View>
    <View style={{ alignItems: 'center', gap: 10, padding: 16, backgroundColor: c.neutral[900], borderRadius: 16 }}><CompanionPortrait colors={c} size={100} mood="thinking" /><Text style={{ color: c.neutral[400], fontSize: 11 }}>Frame preview · thinking</Text></View>
    <Text style={{ color: c.neutral[300] }}>Portrait softness</Text>
    <View style={{ flexDirection: 'row', gap: 8 }}>{[.7, .85, 1].map(portraitOpacity => chip(`${Math.round(portraitOpacity * 100)}%`, a.portraitOpacity === portraitOpacity, () => setAppearance({ portraitOpacity })))}</View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: c.neutral[300] }}>Animate portraits</Text><Switch accessibilityLabel="Animate portraits" value={a.motion} onValueChange={motion => setAppearance({ motion })} trackColor={{ true: c.primary[600] }} /></View>
    <Text style={{ color: c.neutral[400], fontSize: 11 }}>Your system’s reduced-motion setting is also respected.</Text>
    <Pressable accessibilityRole="button" onPress={resetAppearance} style={{ paddingVertical: 14 }}><Text style={{ color: c.primary[300] }}>Reset custom colors and frames</Text></Pressable>
  </View>;
}
