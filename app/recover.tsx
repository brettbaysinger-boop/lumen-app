import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';

export default function Recover() {
  const { colors: c } = useTheme();
  const [email,setEmail] = useState(''), [password,setPassword] = useState(''), [confirmation,setConfirmation] = useState('');
  const [ready,setReady] = useState(false), [busy,setBusy] = useState(false), [notice,setNotice] = useState('');
  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (active) setReady(!!session); });
    supabase.auth.getSession().then(({data}) => { if (active) setReady(!!data.session); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  const submit = async () => {
    setBusy(true); setNotice('');
    try {
      if (ready) {
        if (password.length < 8 || password !== confirmation) throw new Error('Use at least 8 characters and matching passwords.');
        const { error } = await supabase.auth.updateUser({password}); if (error) throw error;
        setPassword(''); setConfirmation('');
        await supabase.auth.signOut(); setNotice('Password updated. Sign in with your new password.');
      } else {
        if (typeof window === 'undefined') throw new Error('Open the browser app to request recovery.');
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {redirectTo: `${window.location.origin}/recover`});
        if (error) throw error;
        setNotice('If this email has an eligible account, a recovery email has been requested.');
      }
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Recovery failed.'); }
    finally { setBusy(false); }
  };
  const field = { backgroundColor:c.neutral[800],color:c.neutral[100],padding:14,borderRadius:12 };
  return <View style={{flex:1,backgroundColor:c.neutral[950]}}><ScrollView contentContainerStyle={{padding:28,gap:18,maxWidth:440,width:'100%',alignSelf:'center',flexGrow:1,justifyContent:'center'}}>
    <Text style={{color:c.primary[300],fontSize:28}}>Account recovery</Text>
    <Text style={{color:c.neutral[300],lineHeight:24}}>{ready ? 'Choose a new password for your signed-in account.' : 'Enter your email to request a recovery link. Open the link here to choose a new password.'}</Text>
    {ready ? <>
      <TextInput accessibilityLabel="New password" placeholder="New password" placeholderTextColor={c.neutral[400]} style={field} secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
      <TextInput accessibilityLabel="Confirm new password" placeholder="Confirm password" placeholderTextColor={c.neutral[400]} style={field} secureTextEntry autoComplete="new-password" value={confirmation} onChangeText={setConfirmation} />
    </> : <TextInput accessibilityLabel="Recovery email" placeholder="Email" placeholderTextColor={c.neutral[400]} style={field} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />}
    <Pressable accessibilityRole="button" disabled={busy || (ready ? password.length < 8 || password !== confirmation : !email.trim())} onPress={() => void submit()}><Text style={{color:c.primary[300],paddingVertical:10}}>{busy ? 'Please wait…' : ready ? 'Update password' : 'Send recovery email'}</Text></Pressable>
    {!!notice && <Text accessibilityRole="alert" style={{color:c.neutral[100],lineHeight:24}}>{notice}</Text>}
    <Pressable onPress={() => router.replace('/login')}><Text style={{color:c.primary[300],paddingVertical:10}}>Back to sign-in</Text></Pressable>
  </ScrollView></View>;
}
