import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Colors } from '@/lib/theme';

export default function Login() {
  const { session, loading, error: setupError, retry } = useAuth();
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  if (loading) return <View style={styles.page}><ActivityIndicator color={Colors.primary[400]} /></View>;
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
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Lumen</Text>
    <Text style={styles.text}>{signup ? 'Create your account and meet your companion.' : 'Sign in to your companion.'}</Text>
    {setupError && <><Text style={styles.text}>{setupError}</Text><TouchableOpacity onPress={retry}><Text style={styles.link}>Retry account setup</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => supabase.auth.signOut()}><Text style={styles.link}>Sign out</Text></TouchableOpacity></>}
    {!session && <>
      {signup && <TextInput style={styles.input} placeholder="Your name" placeholderTextColor="#9ca3af" value={name} onChangeText={setName} maxLength={100} accessibilityLabel="Your name" />}
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#9ca3af" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" accessibilityLabel="Email" />
      <TextInput style={styles.input} placeholder="Password (at least 8 characters)" placeholderTextColor="#9ca3af" value={password} onChangeText={setPassword} secureTextEntry autoComplete={signup ? 'new-password' : 'current-password'} accessibilityLabel="Password" />
      <TouchableOpacity style={styles.button} onPress={submit} disabled={busy || !email.trim() || (signup ? password.length < 8 : !password)}>
        <Text style={styles.text}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => { setSignup(!signup); setNotice(''); }} disabled={busy}><Text style={styles.link}>{signup ? 'Already have an account? Sign in' : 'Create an account'}</Text></TouchableOpacity>
    </>}
    {!!notice && <Text accessibilityRole="alert" style={styles.text}>{notice}</Text>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.neutral[950], justifyContent: 'center' },
  form: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: 28, gap: 18, flexGrow: 1, justifyContent: 'center' },
  title: { color: Colors.primary[400], fontSize: 36, fontWeight: '700' },
  text: { color: Colors.neutral[100], fontSize: 16, lineHeight: 24 },
  input: { backgroundColor: Colors.neutral[800], color: Colors.neutral[100], padding: 14, borderRadius: 10, fontSize: 16 },
  button: { backgroundColor: Colors.primary[700], padding: 16, borderRadius: 10, alignItems: 'center' },
  link: { color: Colors.primary[300], fontSize: 15, paddingVertical: 8 },
});
