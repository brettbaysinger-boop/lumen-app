import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import type { Companion } from '@/types/database';
import { VoicePicker } from './VoicePicker';

export function CompanionIdentity({ companion, onSave }: { companion: Companion; onSave: (updates: Partial<Companion>) => Promise<void> }) {
  const { colors: c } = useTheme();
  const [gender, setGender] = useState(companion.gender || 'unspecified');
  const [identity, setIdentity] = useState(companion.visual_identity || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  useEffect(() => { setGender(companion.gender || 'unspecified'); setIdentity(companion.visual_identity || ''); }, [companion.gender, companion.visual_identity]);
  const save = async () => {
    setBusy(true); setError(''); setSaved(false);
    try { await onSave({ gender, visual_identity: identity.trim() || null }); setSaved(true); }
    catch { setError('Could not save companion identity. Check that the latest database migration is applied.'); }
    finally { setBusy(false); }
  };
  return <View style={{ gap: 18 }}>
    <Text style={{ color: c.neutral[100], fontSize: 20 }}>Who’s here with you?</Text>
    <Text style={{ color: c.neutral[400], fontSize: 12, lineHeight: 20 }}>Choose their identity. Name and personality can be edited above. Change their portrait to choose how they look.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['female', 'male', 'nonbinary', 'unspecified'] as const).map(value => <Pressable key={value} disabled={busy} accessibilityRole="button" accessibilityState={{ selected: gender === value }} onPress={() => { setGender(value); setSaved(false); }} style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: gender === value ? c.primary[400] : c.neutral[700] }}><Text style={{ color: gender === value ? c.primary[300] : c.neutral[300], fontSize: 12 }}>{value === 'unspecified' ? 'Unspecified' : value === 'nonbinary' ? 'Nonbinary' : value[0].toUpperCase() + value.slice(1)}</Text></Pressable>)}</View>
    <Text style={{ color: c.neutral[300], fontSize: 13 }}>Appearance description</Text>
    <TextInput accessibilityLabel="Companion appearance description" value={identity} editable={!busy} onChangeText={text => { setIdentity(text); setSaved(false); }} multiline maxLength={3000} placeholder="Hair, eyes, features, clothing—details to keep consistent in generated images." placeholderTextColor={c.neutral[500]} style={{ color: c.neutral[100], padding: 16, minHeight: 100, borderWidth: 1, borderColor: c.neutral[700], borderRadius: 12 }} />
    <Text style={{ color: c.neutral[400], fontSize: 11, lineHeight: 18 }}>This description guides companion image generation. Uploading a portrait doesn’t automatically copy its features into generated images.</Text>
    {!!error && <Text accessibilityRole="alert" style={{ color: c.error[300] }}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={{ paddingVertical: 12 }}><Text style={{ color: c.primary[300] }}>{busy ? 'Saving…' : saved ? 'Identity saved' : 'Save identity'}</Text></Pressable>
    <Text style={{ color: c.neutral[100], fontSize: 18, marginTop: 8 }}>Voice</Text>
    <VoicePicker companionId={companion.id} name={companion.name} />
  </View>;
}
