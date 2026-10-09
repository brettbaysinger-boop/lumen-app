import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Switch } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { contrast, isHex, type PortraitFrame, type FrameFinish } from '@/lib/appearance';
import { CompanionPortrait } from './CompanionPortrait';
import { VisualColorPicker } from './VisualColorPicker';

const COLOR_SWATCHES = {
  Background: [
    '#0C1930', '#14243B', '#1C304A', '#183A32',
    '#253B35', '#372C46', '#352C3A', '#40302C',
    '#212121', '#404040', '#F5F1E8', '#FFFFFF',
  ],
  Text: [
    '#FFFFFF', '#F5E8C8', '#E8E5DF', '#D7DDE5',
    '#C9BDAE', '#A9B8C8', '#E9B879', '#FFD7A8',
    '#C5E5D5', '#C7D9FF', '#282522', '#0C1930',
  ],
  Accent: [
    '#E9B879', '#D68B45', '#F2C879', '#EAA88B',
    '#E58E9B', '#C5A1E8', '#899FE8', '#78B5E5',
    '#6FC4B2', '#9BCB87', '#D9D9D9', '#FFFFFF',
  ],
} as const;

type ColorLabel = keyof typeof COLOR_SWATCHES;

function ColorField({ label, value, fallback, onApply }: {
  label: ColorLabel;
  value: string;
  fallback: string;
  onApply: (value: string) => void;
}) {
  const { colors: c } = useTheme();
  const current = value || fallback;
  const [draft, setDraft] = useState(current);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => setDraft(current), [current]);

  const selectColor = (color: string) => {
    setDraft(color);
    onApply(color);
  };

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: c.neutral[300], fontSize: 13, fontWeight: '600' }}>
        {label}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {COLOR_SWATCHES[label].map(color => {
          const selected = current.toLowerCase() === color.toLowerCase();

          return (
            <Pressable
              key={color}
              accessibilityRole="button"
              accessibilityLabel={`${label} color ${color}`}
              accessibilityState={{ selected }}
              onPress={() => selectColor(color)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: color,
                borderWidth: selected ? 3 : 1,
                borderColor: selected ? c.primary[400] : c.neutral[600],
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {selected && (
                <View
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 6,
                    backgroundColor: contrast(color, '#FFFFFF') >= 3
                      ? '#FFFFFF'
                      : '#0C1930',
                  }}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} custom color picker`}
        accessibilityState={{ expanded: pickerOpen }}
        onPress={() => setPickerOpen(open => !open)}
        style={{
          alignSelf: 'flex-start',
          paddingVertical: 9,
          paddingHorizontal: 14,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: pickerOpen ? c.primary[400] : c.neutral[700],
          backgroundColor: c.neutral[900],
        }}
      >
        <Text style={{ color: c.primary[300], fontSize: 12, fontWeight: '600' }}>
          {pickerOpen ? 'Close custom color' : 'Custom color...'}
        </Text>
      </Pressable>

      {pickerOpen && (
        <VisualColorPicker
          value={current}
          onApply={color => {
            selectColor(color);
            setPickerOpen(false);
          }}
        />
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: isHex(draft) ? draft : fallback,
            borderWidth: 1,
            borderColor: c.neutral[500],
          }}
        />

        <TextInput
          value={draft}
          onChangeText={setDraft}
          maxLength={7}
          autoCapitalize="none"
          accessibilityLabel={`${label} hex color`}
          style={{
            flex: 1,
            color: c.neutral[100],
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: c.neutral[700],
          }}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Apply ${label.toLowerCase()} color`}
          disabled={!isHex(draft)}
          onPress={() => onApply(draft)}
          style={{ padding: 12, opacity: isHex(draft) ? 1 : 0.4 }}
        >
          <Text style={{ color: c.primary[300] }}>Apply</Text>
        </Pressable>
      </View>
    </View>
  );
}
export function AppearanceControls() {
  const {
    colors: c,
    appearance: a,
    setAppearance,
    resetAppearance,
    importDeviceAppearance,
    hasDeviceAppearance,
  } = useTheme();
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const chip = (label: string, active: boolean, onPress: () => void) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
    style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: active ? c.primary[400] : c.neutral[700], backgroundColor: c.neutral[900] }}><Text style={{ color: active ? c.primary[300] : c.neutral[300], fontSize: 12 }}>{label}</Text></Pressable>;
  return <View style={{ gap: 18, marginTop: 20 }}>
    <Text style={{ color: c.neutral[400], fontSize: 12, lineHeight: 20 }}>Make it yours. Your appearance preferences sync with your account across devices.</Text>
    {hasDeviceAppearance && (
      <View style={{ gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            const imported = await importDeviceAppearance();
            setImportMessage(imported
              ? 'Device appearance imported locally. Account synchronization is pending.'
              : 'Could not import device appearance. Try again when connected.');
          }}
          style={{
            alignSelf: 'flex-start',
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: c.primary[400],
          }}
        >
          <Text style={{ color: c.primary[300], fontWeight: '600' }}>
            Import this device's appearance
          </Text>
        </Pressable>
        {!!importMessage && (
          <Text style={{ color: c.neutral[300], fontSize: 12 }}>
            {importMessage}
          </Text>
        )}
      </View>
    )}
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
