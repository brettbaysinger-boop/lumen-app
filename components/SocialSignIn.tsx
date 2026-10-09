import { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { availableSocialProviders, continueWithProvider, type SocialProvider } from '@/lib/social-auth';
import { useTheme } from '@/lib/theme-context';
import { RaialumeColors as brand } from '@/lib/raialume-colors';

export function SocialSignIn({ link = false, brandStyle = false, disabled = false, onError, onConnected, onBusyChange }: {
  link?: boolean; brandStyle?: boolean; disabled?: boolean; onError: (message: string) => void; onConnected?: () => void; onBusyChange?: (busy: boolean) => void;
}) {
  const { colors: c } = useTheme();
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true); setFailed(false);
    availableSocialProviders(controller.signal).then(items => { if (active) setProviders(items); })
      .catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [attempt]);
  if (loading) return <ActivityIndicator color={brandStyle ? brand.gold : c.primary[400]} accessibilityLabel="Loading sign-in options" />;
  if (failed) return <TouchableOpacity onPress={() => setAttempt(value => value + 1)}><Text style={{ color: brandStyle ? brand.gold : c.primary[300] }}>Retry other sign-in options</Text></TouchableOpacity>;
  if (!providers.length) return null;
  return <View style={{ gap: 12 }}>
    {providers.map(provider => <TouchableOpacity key={provider.id} accessibilityRole="button"
      disabled={disabled || !!busy} onPress={async () => {
        if (busyRef.current) return;
        busyRef.current = true; onBusyChange?.(true);
        setBusy(provider.id); onError('');
        try { await continueWithProvider(provider, link); onConnected?.(); }
        catch (error) { onError(error instanceof Error ? error.message : 'Could not complete sign-in.'); }
        finally { busyRef.current = false; setBusy(null); onBusyChange?.(false); }
      }} style={{ backgroundColor: brandStyle ? brand.input : c.neutral[800], borderWidth: 1, borderColor: brandStyle ? brand.border : c.neutral[600], borderRadius: 12, padding: 16, alignItems: 'center', opacity: disabled || busy ? 0.65 : 1 }}>
      <Text style={{ color: brandStyle ? brand.ivory : c.neutral[100], fontFamily: 'Inter-SemiBold', fontSize: 16 }}>
        {busy === provider.id ? 'Opening…' : `${link ? 'Connect' : 'Continue with'} ${provider.label}`}
      </Text>
    </TouchableOpacity>)}
    {!link && <Text style={{ color: brandStyle ? brand.muted : c.neutral[400], textAlign: 'center', fontFamily: 'Inter-Regular' }}>or use email</Text>}
  </View>;
}
