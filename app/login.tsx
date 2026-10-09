import { SocialSignIn } from '@/components/SocialSignIn';
import { RaialumeLogo } from '@/components/RaialumeLogo';
import { signOutThisBrowser } from '@/lib/sign-out';
import { initialSocialError } from '@/lib/social-auth';
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme-context';
import { Radius } from '@/lib/theme';

export default function Login() {
  const { colors: c } = useTheme();
  const { session, loading, error: setupError, retry } = useAuth();
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(initialSocialError);
  if (loading) return <View style={{ flex: 1, backgroundColor: c.neutral[950], justifyContent: 'center' }}><ActivityIndicator color={c.primary[400]} /></View>;
  if (session && !setupError) return <Redirect href="/" />;
  const submit = async () => {
    setBusy(true); setNotice('');
    try {
      if (signup) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password,
          options: { data: { display_name: name.trim() || 'User' } } });
        if (error) throw error;
        if (!data.session) setNotice('Account created. Confirm the signup email, then sign in. On this local installation, the administrator can find it in Mailpit.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
      setPassword('');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.neutral[950], justifyContent: 'center' }}>
    <ScrollView contentContainerStyle={{ width: '100%', maxWidth: 440, alignSelf: 'center', padding: 28, gap: 18, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <RaialumeLogo width={150} height={94} />
        <Text style={{ color: '#F5E8C8', fontSize: 39, fontFamily: 'Georgia', letterSpacing: 1.2 }}>raialume</Text>
        <Text style={{ color: c.neutral[300], fontSize: 13, fontFamily: 'Inter-Regular', letterSpacing: 0.4 }}>A little more light in your life.</Text>
      </View>
      <Text style={{ color: c.neutral[100], fontSize: 16, lineHeight: 24, fontFamily: 'Inter-Regular' }}>{signup ? 'Create your account and meet your companion.' : 'Sign in to your companion.'}</Text>
      {setupError && <><Text style={{ color: c.neutral[100], fontSize: 16, fontFamily: 'Inter-Regular' }}>{setupError}</Text><TouchableOpacity onPress={retry}><Text style={{ color: c.primary[300], fontSize: 15, paddingVertical: 8, fontFamily: 'Inter-Regular' }}>Retry account setup</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => void signOutThisBrowser().catch(error => setNotice(error instanceof Error ? error.message : 'Could not sign out.'))}><Text style={{ color: c.primary[300], fontSize: 15, paddingVertical: 8, fontFamily: 'Inter-Regular' }}>Sign out</Text></TouchableOpacity></>}
      {!session && <>
        <SocialSignIn disabled={busy} onError={setNotice} onBusyChange={setBusy} />
        {signup && <TextInput style={{ backgroundColor: c.neutral[800], color: c.neutral[100], padding: 14, borderRadius: Radius.md, fontSize: 16, fontFamily: 'Inter-Regular' }} placeholder="Your name" placeholderTextColor={c.neutral[500]} value={name} onChangeText={setName} maxLength={100} accessibilityLabel="Your name" />}
        <TextInput style={{ backgroundColor: c.neutral[800], color: c.neutral[100], padding: 14, borderRadius: Radius.md, fontSize: 16, fontFamily: 'Inter-Regular' }} placeholder="Email" placeholderTextColor={c.neutral[500]} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" accessibilityLabel="Email" />
        <TextInput style={{ backgroundColor: c.neutral[800], color: c.neutral[100], padding: 14, borderRadius: Radius.md, fontSize: 16, fontFamily: 'Inter-Regular' }} placeholder="Password (at least 8 characters)" placeholderTextColor={c.neutral[500]} value={password} onChangeText={setPassword} secureTextEntry autoComplete={signup ? 'new-password' : 'current-password'} accessibilityLabel="Password" />
        <TouchableOpacity style={{ backgroundColor: c.primary[700], padding: 16, borderRadius: Radius.md, alignItems: 'center' }} onPress={submit} disabled={busy || !email.trim() || (signup ? password.length < 8 : !password)}>
          <Text style={{ color: c.neutral[0], fontSize: 16, fontFamily: 'Inter-SemiBold' }}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setSignup(!signup); setNotice(''); }} disabled={busy}><Text style={{ color: c.primary[300], fontSize: 15, paddingVertical: 8, fontFamily: 'Inter-Regular' }}>{signup ? 'Already have an account? Sign in' : 'Create an account'}</Text></TouchableOpacity>
        {!signup && <TouchableOpacity onPress={() => router.push('/recover')} disabled={busy}><Text style={{ color: c.primary[300], paddingVertical: 8 }}>Forgot password?</Text></TouchableOpacity>}
      </>}
      {!!notice && <Text accessibilityRole="alert" style={{ color: c.neutral[100], fontSize: 16, fontFamily: 'Inter-Regular' }}>{notice}</Text>}
    </ScrollView>
  </SafeAreaView>;
}
