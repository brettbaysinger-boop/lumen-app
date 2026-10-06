import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Mic, ArrowUpRight } from 'lucide-react-native';
import { usePortraitSource } from '@/lib/portraits';
import { useTheme } from '@/lib/theme-context';

interface Props {
  name: string;
  portraitUrl?: string | null;
  busy?: boolean;
  status?: string;
  onVoice: () => void;
  onCustomize: () => void;
  voiceDisabled?: boolean;
}

export function CompanionPresence({ name, portraitUrl, busy, status, onVoice, onCustomize, voiceDisabled }: Props) {
  const { colors: c } = useTheme();
  const source = usePortraitSource(portraitUrl);
  return <View style={[styles.container, { borderColor: c.neutral[800], backgroundColor: c.neutral[900] }]}>
    <Text style={[styles.eyebrow, { color: c.neutral[400] }]}>YOUR COMPANION</Text>
    <View style={styles.portrait}>
      <Image source={source} resizeMode="cover" style={StyleSheet.absoluteFill} accessibilityLabel={`Portrait of ${name}`} />
      <LinearGradient colors={['transparent', 'rgba(10,20,15,0.25)', 'rgba(10,20,15,0.94)']} style={StyleSheet.absoluteFill} />
      <View style={styles.portraitCaption}>
        <View style={styles.statusRow}><View style={[styles.dot, { backgroundColor: c.primary[300] }]} /><Text style={styles.status}>{status || (busy ? 'Thinking…' : 'Here with you')}</Text></View>
        <Text style={styles.name}>{name}</Text>
      </View>
    </View>
    <Text style={[styles.heading, { color: c.neutral[100] }]}>A space for the two of you.</Text>
    <Text style={[styles.description, { color: c.neutral[400] }]}>The everyday thoughts. The big ideas. Whatever’s on your mind.</Text>
    <Pressable onPress={onVoice} disabled={voiceDisabled} accessibilityRole="button" accessibilityLabel="Record voice message"
      style={({ pressed }) => [styles.voice, { backgroundColor: c.neutral[800], borderColor: c.neutral[700], opacity: voiceDisabled ? 0.45 : pressed ? 0.7 : 1 }]}>
      <Mic size={18} color={c.primary[400]} /><Text style={[styles.voiceText, { color: c.neutral[100] }]}>Use your voice</Text>
    </Pressable>
    <Pressable onPress={onCustomize} accessibilityRole="button" style={styles.customize}>
      <Text style={[styles.customizeText, { color: c.neutral[400] }]}>Get to know {name}</Text><ArrowUpRight size={16} color={c.neutral[400]} />
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  container: { width: 300, padding: 24, borderLeftWidth: 1, justifyContent: 'center' },
  eyebrow: { fontSize: 10, letterSpacing: 2, fontFamily: 'Inter-Medium', marginBottom: 22 },
  portrait: { width: '100%', aspectRatio: 0.78, borderRadius: 22, overflow: 'hidden' },
  portraitCaption: { position: 'absolute', bottom: 22, left: 20, right: 16, gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, dot: { width: 6, height: 6, borderRadius: 3 },
  status: { color: '#d0e4d8', fontSize: 11, fontFamily: 'Inter-Medium' }, name: { color: '#fff', fontSize: 34, fontFamily: 'Inter-Medium', letterSpacing: -1 },
  heading: { fontSize: 19, lineHeight: 28, fontFamily: 'Inter-Medium', marginTop: 26 },
  description: { fontSize: 13, lineHeight: 22, fontFamily: 'Inter-Regular', marginTop: 10 },
  voice: { borderWidth: 1, borderRadius: 13, padding: 15, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  voiceText: { fontSize: 13, fontFamily: 'Inter-Medium' }, customize: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', padding: 18 }, customizeText: { fontSize: 11, fontFamily: 'Inter-Regular' },
});
